// @macro:singleton
// md-find-link-files.macro.js - Find files by name pattern and insert relative markdown links

// @ts-ignore
const pathModule = require('path')

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

	// Prompt user for glob/name pattern
	const pattern = await vscode.window.showInputBox({
		prompt: 'File name or glob pattern to search for',
		placeHolder: 'e.g. README.md or **/*.md or notes*',
		value: '',
	})
	if (!pattern) {
		vscode.window.showInformationMessage('No pattern provided.')
		return
	}

	// Normalize: if no glob wildcard and no path separator, wrap as glob
	const globPattern = pattern.includes('/') || pattern.includes('*') || pattern.includes('?')
		? pattern
		: `**/${pattern}`

	macros.log.info(`Searching for files matching: ${globPattern}`)

	const uris = await vscode.workspace.findFiles(globPattern, '**/node_modules/**')
	if (uris.length === 0) {
		vscode.window.showInformationMessage(`No files found matching: ${pattern}`)
		return
	}

	macros.log.info(`Found ${uris.length} file(s)`)

	// Sort results alphabetically by fsPath
	uris.sort((a, b) => a.fsPath.localeCompare(b.fsPath))

	const currentDir = pathModule.dirname(doc.uri.fsPath)

	// Build markdown links with relative paths
	const links = uris.map(uri => {
		const relativePath = pathModule.relative(currentDir, uri.fsPath).replace(/\\/g, '/')
		const fileName = pathModule.basename(uri.fsPath)
		return `[${fileName}](${relativePath})`
	})

	const insertText = links.join('\n')

	// Insert at each cursor position
	await editor.edit(editBuilder => {
		for (const selection of editor.selections) {
			editBuilder.replace(selection, insertText)
		}
	})

	macros.log.info(`Inserted ${links.length} link(s)`)
	vscode.window.showInformationMessage(`Inserted ${links.length} markdown link(s)`)
}

main()
