// @macro:singleton
// html-remove-elements-v2.macro.js - Alternative using VS Code's document symbol API

// @ts-ignore
const vscode = require('vscode')

/**
 * @typedef {Object} HtmlElement
 * @property {string} name
 * @property {string} detail
 * @property {vscode.Range} range
 * @property {vscode.Range} selectionRange
 * @property {HtmlElement[]} children
 * @property {vscode.SymbolKind} kind
 */

/**
 * Expand symbol range to include closing tag by using bracket matching
 * @param {vscode.DocumentSymbol} symbol
 * @param {vscode.TextDocument} doc
 * @returns {Promise<HtmlElement>}
 */
async function expandSymbol(symbol, doc) {
	// Get children recursively
	const children = symbol.children ? await Promise.all(
		symbol.children.map(c => expandSymbol(c, doc))
	) : []

	// For the full range, we use selectionRange which typically covers the entire element
	// including content and closing tag in HTML
	return {
		name: symbol.name,
		detail: symbol.detail || '',
		range: symbol.range,
		selectionRange: symbol.selectionRange,
		children,
		kind: symbol.kind
	}
}

/**
 * Check if element matches CSS selector
 */
function matchesSelector(element, selector, doc) {
	const text = doc.getText(element.selectionRange)
	const s = selector.trim().toLowerCase()

	// Parse selector
	const tagMatch = s.match(/^([a-z][a-z0-9-]*)/)
	const expectedTag = tagMatch ? tagMatch[1] : null
	const idMatch = s.match(/#([a-z][a-z0-9_-]*)/)
	const expectedId = idMatch ? idMatch[1] : null
	const classes = [...s.matchAll(/\.([a-z][a-z0-9_-]*)/g)].map(m => m[1])
	const attrs = [...s.matchAll(/\[([^\]=]+)(?:=["']?([^\]"']*)["']?)?\]/g)]

	// Extract tag from element name (which may include attributes from detail)
	const tagName = element.name.toLowerCase().split(/\s+/)[0]

	// Check tag
	if (expectedTag && tagName !== expectedTag) return false

	// Check ID - extract from detail or scan text
	if (expectedId) {
		const idMatch = text.match(/\sid=["']?([^\s"'>]+)["']?/i)
		if (!idMatch || idMatch[1].toLowerCase() !== expectedId) return false
	}

	// Check classes
	for (const cls of classes) {
		const classMatch = text.match(/\sclass=["']([^"']*)["']/i)
		if (!classMatch || !classMatch[1].toLowerCase().split(/\s+/).includes(cls)) return false
	}

	// Check attributes
	for (const [_, attrName, attrVal] of attrs) {
		const attrRegex = new RegExp(`\\s${attrName}(["']?)([^\\s"'>]*)\\1`, 'i')
		const match = text.match(attrRegex)
		if (!match) return false
		if (attrVal !== undefined && match[2].toLowerCase() !== attrVal.toLowerCase()) return false
	}

	return true
}

/**
 * Flatten element tree to array
 */
function flattenElements(elements) {
	const result = []
	for (const el of elements) {
		result.push(el)
		if (el.children?.length) {
			result.push(...flattenElements(el.children))
		}
	}
	return result
}

async function main() {
	const editor = vscode.window.activeTextEditor
	if (!editor) {
		vscode.window.showErrorMessage('No active editor')
		return
	}

	const doc = editor.document

	// Use VS Code's symbol provider to get document structure
	const symbols = await vscode.commands.executeCommand(
		'vscode.executeDocumentSymbolProvider',
		doc.uri
	)

	if (!symbols || symbols.length === 0) {
		vscode.window.showWarningMessage('Could not parse HTML structure. Is this a valid HTML file?')
		return
	}

	const selector = await vscode.window.showInputBox({
		prompt: 'Enter CSS selector for elements to remove',
		placeHolder: 'e.g., .ad, #banner, div.sidebar',
		validateInput: v => v?.trim() ? null : 'Please enter a CSS selector'
	})

	if (!selector) return

	try {
		// Expand symbols and flatten
		const elements = flattenElements(await Promise.all(
			symbols.map(s => expandSymbol(s, doc))
		))

		// Find matches
		const matches = elements.filter(el => matchesSelector(el, selector, doc))

		if (matches.length === 0) {
			vscode.window.showInformationMessage(`No elements found matching "${selector}"`)
			return
		}

		// Remove from bottom to top to preserve line numbers
		const sorted = matches.sort((a, b) =>
			b.range.start.compareTo(a.range.start)
		)

		await editor.edit(editBuilder => {
			for (const el of sorted) {
				editBuilder.delete(el.range)
			}
		})

		vscode.window.showInformationMessage(
			`Removed ${matches.length} element${matches.length === 1 ? '' : 's'} matching "${selector}"`
		)
	} catch (err) {
		vscode.window.showErrorMessage(`Error: ${err.message}`)
		console.error(err)
	}
}

main()
