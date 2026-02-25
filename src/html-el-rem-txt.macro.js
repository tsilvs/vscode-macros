// @macro:singleton
// html-remove-elements.macro.js - Remove HTML elements matching a CSS selector

// @ts-ignore
const vscode = require('vscode')

/**
 * Match start tag and extract: tagName, attributes string, and end position
 * @param {string} html
 * @param {number} startIndex
 * @returns {{tagName: string, attrs: string, end: number} | null}
 */
function matchStartTag(html, startIndex) {
	const match = html.slice(startIndex).match(/^<([a-zA-Z][a-zA-Z0-9-]*)(\s[^>]*)?>/)
	if (!match) return null
	return { tagName: match[1].toLowerCase(), attrs: match[2] || '', end: startIndex + match[0].length }
}

/**
 * Check if element matches selector
 * @param {string} tagName
 * @param {string} attrs
 * @param {string} selector
 */
function matchesSelector(tagName, attrs, selector) {
	const s = selector.trim()

	// Parse selector parts
	const tagMatch = s.match(/^([a-zA-Z][a-zA-Z0-9-]*)/)
	const expectedTag = tagMatch ? tagMatch[1].toLowerCase() : null
	const idMatch = s.match(/#([a-zA-Z][a-zA-Z0-9_-]*)/)
	const expectedId = idMatch ? idMatch[1] : null
	const classMatches = [...s.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)/g)].map(m => m[1])
	const attrMatches = [...s.matchAll(/\[([^\]=]+)(?:=["']?([^\]"']+)["']?)?\]/g)]

	// Check tag
	if (expectedTag && tagName !== expectedTag) return false

	// Check ID
	if (expectedId) {
		const idAttr = attrs.match(/\sid=["']?([^\s"'>]+)["']?/i)
		if (!idAttr || idAttr[1] !== expectedId) return false
	}

	// Check classes
	for (const cls of classMatches) {
		const classAttr = attrs.match(/\sclass=["']([^"']*)["']/i)
		if (!classAttr || !classAttr[1].split(/\s+/).includes(cls)) return false
	}

	// Check attributes
	for (const [_, attrName, attrValue] of attrMatches) {
		const attrRegex = new RegExp(`\\s${attrName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:=["']?([^\s"'>]*)["']?)?`, 'i')
		const attrMatch = attrs.match(attrRegex)
		if (!attrMatch) return false
		if (attrValue !== undefined && attrMatch[1] !== attrValue) return false
	}

	return true
}

/**
 * Find all element ranges matching the selector
 * @param {string} html
 * @param {string} selector
 * @returns {Array<{start: number, end: number}>}
 */
function findElementRanges(html, selector) {
	const selfClosing = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'])
	const ranges = []
	const stack = []

	for (let i = 0; i < html.length; i++) {
		if (html[i] !== '<') continue

		// Check for closing tag
		const closeMatch = html.slice(i).match(/^<\/([a-zA-Z][a-zA-Z0-9-]*)>/)
		if (closeMatch) {
			const tagName = closeMatch[1].toLowerCase()
			const endIndex = i + closeMatch[0].length
			// Find matching opener
			for (let j = stack.length - 1; j >= 0; j--) {
				if (stack[j].tagName === tagName) {
					const open = stack.splice(j, 1)[0]
					if (open.matches) {
						ranges.push({ start: open.start, end: endIndex })
					}
					break
				}
			}
			i = endIndex - 1
			continue
		}

		// Check for start tag
		const startMatch = matchStartTag(html, i)
		if (!startMatch) continue

		const matches = matchesSelector(startMatch.tagName, startMatch.attrs, selector)

		if (selfClosing.has(startMatch.tagName) || startMatch.attrs.trim().endsWith('/')) {
			if (matches) {
				ranges.push({ start: i, end: startMatch.end })
			}
		} else {
			stack.push({ tagName: startMatch.tagName, start: i, matches })
		}

		i = startMatch.end - 1
	}

	// Handle unclosed tags
	for (const open of stack) {
		if (open.matches) {
			ranges.push({ start: open.start, end: html.length })
		}
	}

	return ranges.sort((a, b) => b.start - a.start) // Descending for safe removal
}

async function main() {
	const editor = vscode.window.activeTextEditor
	if (!editor) {
		vscode.window.showErrorMessage('No active editor')
		return
	}

	const doc = editor.document
	const text = doc.getText()

	// Quick HTML check
	if (!/^\s*<(!DOCTYPE|html|[a-zA-Z][a-zA-Z0-9-]*\b)/i.test(text) && doc.languageId !== 'html') {
		const proceed = await vscode.window.showWarningMessage(
			'Document does not appear to be HTML. Continue anyway?', 'Yes', 'No'
		)
		if (proceed !== 'Yes') return
	}

	const selector = await vscode.window.showInputBox({
		prompt: 'Enter CSS selector for elements to remove',
		placeHolder: 'e.g., .ad, #banner, div.sidebar, script[src="tracker.js"]',
		validateInput: v => v?.trim() ? null : 'Please enter a CSS selector'
	})

	if (!selector) return

	try {
		const ranges = findElementRanges(text, selector)

		if (ranges.length === 0) {
			vscode.window.showInformationMessage(`No elements found matching "${selector}"`)
			return
		}

		await editor.edit(editBuilder => {
			for (const { start, end } of ranges) {
				editBuilder.delete(new vscode.Range(doc.positionAt(start), doc.positionAt(end)))
			}
		})

		vscode.window.showInformationMessage(
			`Removed ${ranges.length} element${ranges.length === 1 ? '' : 's'} matching "${selector}"`
		)
		macros.log.info(`Removed ${ranges.length} elements with selector "${selector}"`)
	} catch (err) {
		vscode.window.showErrorMessage(`Error: ${err.message}`)
	}
}

main()
