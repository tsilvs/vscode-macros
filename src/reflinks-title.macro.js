// @macro:singleton
// Replaces shortcut reflinks: [handle] -> [title][handle]
// Skips valid reference/inline syntax: [text][handle], [handle][], [text](url), [handle]: url

async function main() {
	const doc = vscode.window.activeTextEditor?.document
	if (!doc) {
		vscode.window.showErrorMessage('No active editor')
		return
	}

	const text = doc.getText()

	const normalizeLabel = label => label.trim().replace(/\s+/g, ' ').toLowerCase()

	// Collect reference definition titles
	const titleByHandle = new Map()
	// Matches: [handle]: url "title" or [handle]: url 'title'
	const defRegex = /^\[([^\]]+)\]:\s+\S+(?:\s+(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'))?/gm
	let defMatch
	while ((defMatch = defRegex.exec(text)) !== null) {
		const handle = defMatch[1]
		const title = defMatch[2] ?? defMatch[3]
		if (!title) {
			continue
		}
		const normalized = normalizeLabel(handle)
		if (!titleByHandle.has(normalized)) {
			titleByHandle.set(normalized, title)
		}
	}

	if (titleByHandle.size === 0) {
		vscode.window.showInformationMessage('No reflink titles found')
		return
	}

	const replacements = []
	const shortcutRegex = /\[([^\[\]]+)\]/g
	const getPrevNonSpaceChar = index => {
		for (let i = index - 1; i >= 0; i -= 1) {
			const ch = text[i]
			if (!/\s/.test(ch)) {
				return ch
			}
		}
		return ''
	}
	let match
	while ((match = shortcutRegex.exec(text)) !== null) {
		const [fullMatch, handle] = match
		const start = match.index
		const end = start + fullMatch.length

		const prevChar = start > 0 ? text[start - 1] : ''
		const prevNonSpaceChar = getPrevNonSpaceChar(start)
		const nextChar = end < text.length ? text[end] : ''
		const lineStart = text.lastIndexOf('\n', start - 1) + 1
		const lineEnd = text.indexOf('\n', start) === -1 ? text.length : text.indexOf('\n', start)
		const lineSuffix = text.slice(end, lineEnd)

		// Skip images and valid reference/inline syntax
		if (prevChar === '!' || prevChar === '\\') {
			continue
		}
		// Skip when this is the reference part of [text][handle] (whitespace allowed)
		if (prevNonSpaceChar === ']') {
			continue
		}
		if (nextChar === '[' || nextChar === '(') {
			continue
		}
		// Skip reference definition lines: [handle]: url (must be on the same line)
		if (nextChar === ':' && /^:\s+\S/.test(lineSuffix)) {
			continue
		}

		const normalized = normalizeLabel(handle)
		const title = titleByHandle.get(normalized)
		if (!title) {
			continue
		}

		replacements.push({
			start,
			end,
			text: `[${title}][${handle}]`
		})
	}

	if (replacements.length === 0) {
		vscode.window.showInformationMessage('No shortcut reflinks to update')
		return
	}

	// Apply replacements from end to start to preserve offsets
	const editor = vscode.window.activeTextEditor
	await editor.edit(editBuilder => {
		replacements
			.sort((a, b) => b.start - a.start)
			.forEach(repl => {
				editBuilder.replace(
					new vscode.Range(doc.positionAt(repl.start), doc.positionAt(repl.end)),
					repl.text
				)
			})
	})

	vscode.window.showInformationMessage(`Updated ${replacements.length} shortcut reflinks`)
}

main()
