// @macro:singleton
// md-move-linked.macro.js - Moves selected content including linked reference definitions to a new file
// TODO: Define how reflinks can be auto-deleted if selection is deleted. Most likely options:
// 1. Don't delete
// 2. Delete unused
// 3. Delete all

// @ts-ignore
const vscode = require('vscode')
// @ts-ignore
const pathModule = require('path')

function escapeRegex(string) {
	return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function main() {
	const editor = vscode.window.activeTextEditor
	if (!editor) {
		vscode.window.showErrorMessage('No active editor')
		return
	}
	const doc = editor.document
	if (doc.languageId !== 'markdown') {
		vscode.window.showErrorMessage('Macro is designed for Markdown files only.')
		return
	}
	const selections = editor.selections
	if (selections.length === 0) {
		vscode.window.showInformationMessage('No selections')
		return
	}

	// Sort selections by document position for consistent top-to-bottom order
	const sortedSelections = Array.from(selections).sort((a, b) => {
		if (a.start.line !== b.start.line) {
			return a.start.line - b.start.line;
		}
		return a.start.character - b.start.character;
	});

	// Collect original content from all selections
	let originalContent = sortedSelections.map(sel => doc.getText(sel)).join('\n\n')
	const selectionRanges = [...selections]

	// Parse selected content for reference links [text][id] where id has ':'
	const linkRefRegex = /\]\[([^\]]*)\]/g
	const linkIds = new Set()
	for (const sel of sortedSelections) {
		const selContent = doc.getText(sel)
		const matches = [...selContent.matchAll(linkRefRegex)]
		for (const match of matches) {
			const id = match[1].trim()
			if (id && id.includes(':')) {
				linkIds.add(id)
			}
		}
	}
	macros.log.info(`Found ${linkIds.size} link ID${linkIds.size !== 1 ? 's' : ''} in ${selections.length > 1 ? 'selections' : 'selection'}: ${Array.from(linkIds).join(', ')}`)

	// Find definitions by direct regex search in current document (reliable, no provider needed)
	const definitionContents = new Set()
	const docText = doc.getText()
	for (const id of linkIds) {
		const defRegex = new RegExp(`^\\s*\\[${escapeRegex(id)}\\]:\\s*(.*)$`, 'gm')
		for (const match of docText.matchAll(defRegex)) {
			definitionContents.add(match[0].trim())
			macros.log.info(`Collected definition for ${id}: ${match[0].substring(0, 50)}...`)
		}
	}

	const defsText = Array.from(definitionContents).join('\n')
	const totalContent = (defsText ? `<!-- links -->\n\n${defsText}\n\n<!-- doc -->\n\n` : '') + originalContent

	if (!totalContent.trim()) {
		vscode.window.showInformationMessage('No content or link definitions to move')
		return
	}

	// Determine suggested path
	const wsFolder = vscode.workspace.getWorkspaceFolder(doc.uri)
	if (!wsFolder) {
		vscode.window.showErrorMessage('No workspace folder')
		return
	}
	const wsUri = wsFolder.uri
	const wsPath = wsUri.fsPath
	let relDir = pathModule.dirname(vscode.workspace.asRelativePath(doc.uri, false)) || 'pages'
	const suggestedPath = pathModule.join(relDir, 'new.md').replace(/\\/g, '/')

	// VSCode native QuickPick using built-in file search for files and directories (respects settings, .gitignore, empty folders, unopened folders)
	const mdPattern = new vscode.RelativePattern(wsUri, '**/*.md');
	const mdUris = await vscode.workspace.findFiles(mdPattern, undefined, 2000);
	const fileSuggestions = mdUris.map((uri) => pathModule.relative(wsPath, uri.fsPath).replace(/\\/g, '/'));
	const dirPattern = new vscode.RelativePattern(wsUri, '**/*');
	const dirUris = await vscode.workspace.findFiles(dirPattern, undefined, 2000);
	const dirSuggestions = Array.from(new Set(dirUris.map((uri) => {
		const relDirPath = pathModule.relative(wsPath, uri.fsPath.replace(/\/$/, '')).replace(/\\/g, '/');
		return relDirPath === '.' ? 'new.md' : `${relDirPath}/new.md`;
	})));
	const allSuggestions = Array.from(new Set([...fileSuggestions, ...dirSuggestions, suggestedPath])).sort((a, b) => a.localeCompare(b));
	const quickPickItems = allSuggestions.map((s) => ({label: s}));

	const quickpick = vscode.window.createQuickPick();
	quickpick.placeholder = 'Type path (e.g. pages/subdir/new.md), suggestions filter automatically, Enter to accept any path';
	quickpick.items = quickPickItems;
	quickpick.matchOnDetail = true;
	quickpick.show();

	const inputPromise = new Promise((resolve) => {
		quickpick.onDidAccept(() => {
			resolve(quickpick.selectedItems[0]?.label || quickpick.value);
			quickpick.hide();
		});
		quickpick.onDidHide(() => {
			resolve(undefined);
			quickpick.dispose();
		});
	});
	const rawInput = await inputPromise;
	quickpick.dispose();

	const input = rawInput?.trim();
	if (!input || !input.endsWith('.md')) {
		vscode.window.showErrorMessage('Path must end with .md');
		return;
	}

	const newUri = vscode.Uri.joinPath(wsUri, input)

	// Create link reference for replacement
	const currentDir = pathModule.dirname(doc.uri.fsPath)
	const relPath = pathModule.relative(currentDir, newUri.fsPath).replace(/\\/g, '/')
	const linkRef = `[Moved content](${relPath})`

	let contentToWrite = totalContent
	try {
		await vscode.workspace.fs.stat(newUri)
		// File exists
		const choice = await vscode.window.showQuickPick(
			['Overwrite', 'Append to end', 'Cancel'],
			{ placeHolder: `File "${vscode.workspace.asRelativePath(newUri, false)}" already exists. What to do?` }
		)
		if (!choice || choice === 'Cancel') {
			vscode.window.showInformationMessage('Move operation cancelled.')
			return
		}
		if (choice === 'Append to end') {
			const existingDoc = await vscode.workspace.openTextDocument(newUri)
			const existingText = existingDoc.getText()
			contentToWrite = existingText + '\n\n<!-- ===== Appended moved content ===== -->\n\n' + totalContent
		}
		// Overwrite: use original totalContent
	} catch {
		// Does not exist
	}

	// Optional customizations
	let titleContent = ''
	const titleChoice = await vscode.window.showQuickPick(
		['No title', 'File name', 'Custom title'],
		{ placeHolder: 'Add # H1 title to new file?', ignoreFocusOut: true }
	)
	if (titleChoice !== 'No title') {
		let titleText = pathModule.basename(vscode.workspace.asRelativePath(newUri, false), '.md').replace(/[^a-zA-Z0-9]/g, ' ')
		if (titleChoice === 'Custom title') {
			const customTitle = await vscode.window.showInputBox({
				prompt: 'Enter H1 title:',
				value: titleText,
				ignoreFocusOut: true
			})
			if (customTitle) {
				titleText = customTitle
				titleContent = `# ${titleText}\n\n`
			}
		} else {
			titleContent = `# ${titleText}\n\n`
		}
	}

	const sortChoice = await vscode.window.showQuickPick(
		['No sort', 'Sort defs alphabetically'],
		{ placeHolder: 'Sort link definitions?', ignoreFocusOut: true }
	)
	if (sortChoice === 'Sort defs alphabetically') {
		const defsArray = Array.from(definitionContents).sort((a, b) => {
			const idA = a.match(/^\s*\[([^\]]+)\]/)?.[1] || a
			const idB = b.match(/^\s*\[([^\]]+)\]/)?.[1] || b
			return idA.localeCompare(idB)
		})
		const sortedDefsText = defsArray.join('\n\n')
		contentToWrite = contentToWrite.replace(/<!-- links -->\\n\\n[\\s\\S]*?\\n\\n<!-- doc -->/, `<!-- links -->\n\n${sortedDefsText}\n\n<!-- doc -->`)
	}

	contentToWrite = titleContent + contentToWrite

	const replaceChoice = await vscode.window.showQuickPick(
		['Replace with link', 'Delete selections', 'Leave selections'],
		{ placeHolder: 'Original selections after move?', ignoreFocusOut: true }
	)
	const replaceText = replaceChoice === 'Replace with link' ? linkRef : (replaceChoice === 'Delete selections' ? '' : null)

	// Create/overwrite file using WorkspaceEdit for proper encoding
	const edit = new vscode.WorkspaceEdit();
	edit.createFile(newUri, { overwrite: true });
	const fullRange = new vscode.Range(0, 0, 0, 0);
	edit.replace(newUri, fullRange, contentToWrite);
	await vscode.workspace.applyEdit(edit);

	if (replaceText !== null) {
		await editor.edit(editBuilder => {
			for (const sel of selectionRanges) {
				editBuilder.replace(sel, replaceText)
			}
		})
	}


	// Open and reveal the new file
	const newEditor = await vscode.window.showTextDocument(newUri)
	await newEditor.revealRange(newEditor.document.lineAt(0).range)

	vscode.window.showInformationMessage(`Moved selection + ${definitionContents.size} link definitions to ${vscode.workspace.asRelativePath(newUri, false)}`)
}

main()
