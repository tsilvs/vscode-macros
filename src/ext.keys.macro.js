// @macro:singleton
// / <reference types="vscode" /> // FIXME
// @ts-ignore
const vscode = require('vscode')

async function main() {

	const extensions = vscode.extensions.all
		.filter(ext => !ext.packageJSON.isBuiltin)
		.map(ext => ({
			label: ext.packageJSON.displayName || ext.id,
			detail: ext.id,
			ext: ext
		}))

	const selected = await vscode.window.showQuickPick(extensions, {
		placeHolder: 'Select extension to query keybindings'
	})

	if (!selected) return

	const bindings = selected.ext.packageJSON.contributes?.keybindings || []

	if (bindings.length === 0) {
		vscode.window.showInformationMessage('No keybindings found')
		return
	}

	const json = JSON.stringify(bindings, null, 2)

	const editor = vscode.window.activeTextEditor
	if (editor) {
		await editor.edit(editBuilder => {
			editBuilder.insert(editor.selection.active, json)
		})
	} else {
		const doc = await vscode.workspace.openTextDocument({
			content: json,
			language: 'json'
		})
		await vscode.window.showTextDocument(doc)
	}

	vscode.window.showInformationMessage(`Inserted ${bindings.length} keybindings`)
}

main()
