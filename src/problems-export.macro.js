// @macro:singleton
// problems-export.macro.js - Export warnings/errors from Problems view to a new plaintext document

// @ts-ignore
const vscode = require('vscode')

const ALL_SOURCES_LABEL = 'All sources'

function formatSeverity(severity) {
	switch (severity) {
		case vscode.DiagnosticSeverity.Error:
			return 'Error'
		case vscode.DiagnosticSeverity.Warning:
			return 'Warning'
		case vscode.DiagnosticSeverity.Information:
			return 'Info'
		case vscode.DiagnosticSeverity.Hint:
			return 'Hint'
		default:
			return 'Unknown'
	}
}

function formatCode(code) {
	if (!code) return ''
	if (typeof code === 'string' || typeof code === 'number') return String(code)
	if (typeof code === 'object' && 'value' in code) return String(code.value)
	return String(code)
}

function normalizeMessage(message) {
	if (!message) return ''
	return String(message).replace(/\r?\n/g, '\n    ')
}

async function main() {
	const diagnosticsByFile = vscode.languages.getDiagnostics()
	const allEntries = []

	for (const [uri, diagnostics] of diagnosticsByFile) {
		for (const diagnostic of diagnostics) {
			allEntries.push({ uri, diagnostic })
		}
	}

	if (allEntries.length === 0) {
		vscode.window.showInformationMessage('No diagnostics found in Problems view')
		return
	}

	const sourceSet = new Set()
	for (const { diagnostic } of allEntries) {
		sourceSet.add(diagnostic.source || 'unknown')
	}
	const sources = Array.from(sourceSet).sort((a, b) => a.localeCompare(b))

	const sourceItems = [
		{ label: ALL_SOURCES_LABEL, description: 'Include diagnostics from every source' },
		...sources.map(source => ({ label: source }))
	]

	const selected = await vscode.window.showQuickPick(sourceItems, {
		canPickMany: true,
		placeHolder: 'Select diagnostic sources to include'
	})

	if (!selected || selected.length === 0) {
		return
	}

	const includeAll = selected.some(item => item.label === ALL_SOURCES_LABEL)
	const selectedSources = includeAll
		? new Set(sources)
		: new Set(selected.map(item => item.label))

	if (selectedSources.size === 0) {
		vscode.window.showInformationMessage('No sources selected')
		return
	}

	const filtered = allEntries.filter(({ diagnostic }) => {
		const source = diagnostic.source || 'unknown'
		const isSelectedSource = selectedSources.has(source)
		const isWarningOrError = diagnostic.severity === vscode.DiagnosticSeverity.Error ||
			diagnostic.severity === vscode.DiagnosticSeverity.Warning
		return isSelectedSource && isWarningOrError
	})

	if (filtered.length === 0) {
		vscode.window.showInformationMessage('No warnings or errors matched the selected sources')
		return
	}

	filtered.sort((a, b) => {
		const aPath = vscode.workspace.asRelativePath(a.uri, false)
		const bPath = vscode.workspace.asRelativePath(b.uri, false)
		if (aPath !== bPath) return aPath.localeCompare(bPath)
		const aLine = a.diagnostic.range.start.line
		const bLine = b.diagnostic.range.start.line
		if (aLine !== bLine) return aLine - bLine
		const aChar = a.diagnostic.range.start.character
		const bChar = b.diagnostic.range.start.character
		return aChar - bChar
	})

	let errorCount = 0
	let warningCount = 0
	const lines = []
	const selectedLabel = includeAll ? 'All sources' : Array.from(selectedSources).join(', ')

	lines.push('VS Code Problems export (warnings + errors)')
	lines.push(`Generated: ${new Date().toISOString()}`)
	lines.push(`Sources: ${selectedLabel}`)
	lines.push('')

	for (const { uri, diagnostic } of filtered) {
		const severity = formatSeverity(diagnostic.severity)
		if (diagnostic.severity === vscode.DiagnosticSeverity.Error) errorCount += 1
		if (diagnostic.severity === vscode.DiagnosticSeverity.Warning) warningCount += 1

		const relPath = vscode.workspace.asRelativePath(uri, false)
		const line = diagnostic.range.start.line + 1
		const column = diagnostic.range.start.character + 1
		const source = diagnostic.source || 'unknown'
		const code = formatCode(diagnostic.code)
		const codeText = code ? ` [${code}]` : ''
		const message = normalizeMessage(diagnostic.message)

		lines.push(`${relPath}:${line}:${column} [${severity}] [${source}]${codeText} ${message}`)
	}

	lines.push('')
	lines.push(`Total: ${filtered.length} (Errors: ${errorCount}, Warnings: ${warningCount})`)

	const doc = await vscode.workspace.openTextDocument({
		language: 'plaintext',
		content: lines.join('\n')
	})
	await vscode.window.showTextDocument(doc, { preview: false })
}

main()
