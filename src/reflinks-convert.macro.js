// @macro:singleton
// / <reference types="url" /> // FIXME

// TODO: make it parse & convert links only in selection if selection exists
// TODO: make it insert new links in the line right above the line currently selected by the cursor
// TODO: both above features should support multi-cursor with per-selection context limitation (only insert link definitions that were found in the selection)
// TODO: if there are multi-cursors but no selection - insert globally converted reflink definitions in line above 1st cursor
// TODO: Optionally support <!-- links --> / <!-- doc --> markers

// @ts-ignore
const { URL } = require('url')

async function main() {
	const doc = vscode.window.activeTextEditor?.document
	if (!doc) {
		vscode.window.showErrorMessage('No active editor')
		return
	}

	const text = doc.getText()

	macros.log.info(`Document has ${text.length} characters`)
	macros.log.info(`First 100 chars: ${text.substring(0, 100)}`)

	// Extract inline links: [text](url) or [text](url "title") or [text](url 'title')
	const linkRegex = /\[([^\]]+)\]\(([^)\s]+)(?:\s+["']([^"']+)["'])?\)/g
	const links = []
	let match

	while ((match = linkRegex.exec(text)) !== null) {
		macros.log.info(`Found match: ${match[0]}`)
		const [fullMatch, title, url, altTitle] = match
		try {
			const urlObj = new URL(url)
			// Generate ref ID: domain:path-slug (or just domain if no path)
			let refId = urlObj.hostname.replace('www.', '')
			const path = urlObj.pathname.replace(/^\//, '').replace(/\/$/, '')
			if (path) {
				refId += ':' + path.replace(/\//g, '-').replace(/\.[^.]+$/, '')
			}
			links.push({ fullMatch, title, url, refId, altTitle: altTitle || title })
			macros.log.info(`Created refId: ${refId}`)
		} catch (e) {
			macros.log.info(`Skipped invalid URL: ${url} - ${e.message}`)
		}
	}

	if (links.length === 0) {
		vscode.window.showInformationMessage('No inline links found')
		return
	}

	// Build replacement text
	let newText = text
	const refDefs = new Set()

	// Replace inline links with reference links
	links.forEach(link => {
		newText = newText.replace(link.fullMatch, `[${link.title}][${link.refId}]`)
		refDefs.add(`[${link.refId}]: ${link.url} "${link.altTitle}"`)
	})

	// Add reference definitions at end
	const refSection = '\n\n<!-- links -->\n\n' + Array.from(refDefs).join('\n')
	newText += refSection

	// Apply edit
	const editor = vscode.window.activeTextEditor
	await editor.edit(editBuilder => {
		const fullRange = new vscode.Range(
			doc.positionAt(0),
			doc.positionAt(text.length)
		)
		editBuilder.replace(fullRange, newText)
	})

	vscode.window.showInformationMessage(`Converted ${links.length} links to reflinks`)
}

main();

