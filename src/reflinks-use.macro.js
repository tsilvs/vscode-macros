// @macro:singleton
// Macro to add markdown reflink [title][handle] usage for unused reflink definitions
// Keeps the [handle]: url "title" definition intact
// Uses enhanced regex to detect usages, fixing MD053 false positives
// TODO: Support reflink definitions without titles

async function main() {
	const doc = vscode.window.activeTextEditor?.document
	if (!doc) {
		vscode.window.showErrorMessage('No active editor')
		return
	}

	const text = doc.getText()
	const uri = doc.uri

	// Get markdownlint diagnostics for MD053 (unused link definitions)
	const diagnostics = vscode.languages.getDiagnostics(uri)
	// FIX: Use it if `markdownlint` extension is active
	const md053Issues = diagnostics.filter(d =>
		d.source === 'markdownlint' &&
		d.code === 'MD053'
	)

	let unusedHandles = new Set()

	// Always use enhanced regex, bypassing MD053 false positives
	macros.log.info('Using enhanced regex detection for unused reflinks ([title][handle])')

	// Find all reflink definitions
	const reflinkDefRegex = /\[([^\]]+)\]:\s+[^\s]+/g
	const allHandles = new Set()
	let defMatch

	while ((defMatch = reflinkDefRegex.exec(text)) !== null) {
		allHandles.add(defMatch[1])
	}

	// Standard link usages
	const reflinkUseRegex = /\[([^\]]+)\]\[([^\]]*)\]/g
	const usedHandles = new Set()
	let useMatch

	while ((useMatch = reflinkUseRegex.exec(text)) !== null) {
		let handle = useMatch[2]
		if (!handle) handle = useMatch[1]
		if (handle) usedHandles.add(handle)
	}

	// LogSeq style: catch ][domain:slug]
	const logseqHandleRegex = /\]\[([a-z]+:[^\]\s]+)\]/g
	let lsMatch

	while ((lsMatch = logseqHandleRegex.exec(text)) !== null) {
		usedHandles.add(lsMatch[1])
		macros.log.info(`LogSeq used handle: ${lsMatch[1]}`)
	}

	// Compute unused
	allHandles.forEach(handle => {
		if (!usedHandles.has(handle)) {
			unusedHandles.add(handle)
			macros.log.info(`Unused handle: ${handle}`)
		}
	})

	if (unusedHandles.size === 0) {
		vscode.window.showInformationMessage('No unused reflink definitions found')
		return
	}

	// Match: [handle]: url "title" (handles escaped quotes in title)
	const reflinkRegex = /\[([^\]]+)\]:\s+([^\s]+)\s+"((?:[^"\\]|\\.)*)"/g
	const replacements = []
	let match

	while ((match = reflinkRegex.exec(text)) !== null) {
		const [fullMatch, handle, url, title] = match

		// Only process if handle is unused
		if (!unusedHandles.has(handle)) {
			continue
		}

		const offset = match.index

		// Store for unused links section
		replacements.push({
			handle,
			title,
			offset,
			length: fullMatch.length
		})

		macros.log.info(`Found unused: ${handle} → ${title}`)
	}

	if (replacements.length === 0) {
		vscode.window.showInformationMessage('No unused reflink definitions to convert')
		return
	}

	// Detect UL bullet style from markdownlint config or fallback to '+'
	let bullet = '+'
	const md004Issues = diagnostics.filter(d =>
		d.source === 'markdownlint' &&
		d.code === 'MD004'
	)

	if (md004Issues.length > 0) {
		// Extract expected bullet from MD004 diagnostic message
		const bulletMatch = md004Issues[0].message.match(/Expected: ([*\-+])/)
		if (bulletMatch) {
			bullet = bulletMatch[1]
			macros.log.info(`Detected bullet style from MD004: ${bullet}`)
		}
	} else {
		// Fallback: detect most common bullet in document
		const bullets = text.match(/^[\s]*([*\-+])\s/gm)
		if (bullets && bullets.length > 0) {
			const counts = {}
			bullets.forEach(b => {
				const char = b.trim()[0]
				counts[char] = (counts[char] || 0) + 1
			})
			bullet = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b)
			macros.log.info(`Detected bullet style from document: ${bullet}`)
		}
	}

	// Build unused links lines (no header)
	const unusedLinksText = replacements
		.map(r => `${bullet} [${r.title}][${r.handle}]`)
		.join('\n')

	// Insert at current cursor position
	const editor = vscode.window.activeTextEditor
	const insertPos = editor.selection.active
	const insertText = `${unusedLinksText}\n`

	await editor.edit(editBuilder => {
		// Keep original reflink definitions unchanged
		editBuilder.insert(insertPos, insertText)
	})

	vscode.window.showInformationMessage(`Inserted ${replacements.length} unused links at cursor`)
}

main()
