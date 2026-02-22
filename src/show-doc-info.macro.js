// @macro:singleton

const editor = vscode.window.activeTextEditor
if (!editor) {
	vscode.window.showErrorMessage('No active editor')
} else {
	const doc = editor.document
	const info = `
Language: ${doc.languageId}
File: ${doc.fileName}
Lines: ${doc.lineCount}
Text length: ${doc.getText().length}
	`.trim()

	vscode.window.showInformationMessage(info)
	macros.log.info(info)
}

