// @macro:singleton
// s5n.macro.js - Numerical contraction: abbreviate words to ${first_letter}${intermediate_letter_count}${last_letter}

// @ts-ignore
const vscode = require('vscode')

/**
 * Contract a word to ${first_letter}${intermediate_letter_count}${last_letter} pattern
 * @param {string} word
 * @returns {string} contracted word or original if too short
 */
function contractWord(word) {
	if (word.length <= 2) {
		return word
	}
	const first = word[0]
	const last = word[word.length - 1]
	const intermediateCount = word.length - 2
	return `${first}${intermediateCount}${last}`
}

/**
 * Check if a string looks like a word (contains letters)
 * @param {string} str
 * @returns {boolean}
 */
function isWord(str) {
	return /[a-zA-Z]/.test(str)
}

async function main() {
	const editor = vscode.window.activeTextEditor
	if (!editor) {
		vscode.window.showErrorMessage('No active editor')
		return
	}

	const doc = editor.document
	const selections = editor.selections

	if (selections.length === 0 || (selections.length === 1 && selections[0].isEmpty)) {
		vscode.window.showInformationMessage('No text selected. Select words to contract.')
		return
	}

	// Track contractions for the index
	/** @type {Map<string, string>} */
	const contractions = new Map()

	// Process selections and build edits
	const edits = []

	for (const selection of selections) {
		if (selection.isEmpty) continue

		const text = doc.getText(selection)
		const words = text.split(/(\s+)/)

		let newText = ''
		for (const word of words) {
			// Preserve whitespace as-is
			if (/^\s+$/.test(word)) {
				newText += word
				continue
			}

			// Split word into word characters and trailing non-word characters
			const match = word.match(/^([a-zA-Z]+)([^a-zA-Z]*)$/)
			if (!match || !isWord(match[1])) {
				newText += word
				continue
			}

			const [, coreWord, trailing] = match
			if (coreWord.length <= 2) {
				newText += word
				continue
			}

			const contracted = contractWord(coreWord)
			newText += contracted + trailing

			// Track contraction for index (original -> contracted)
			if (!contractions.has(coreWord)) {
				contractions.set(coreWord, contracted)
			}
		}

		edits.push({
			range: selection,
			text: newText
		})
	}

	if (contractions.size === 0) {
		vscode.window.showInformationMessage('No words to contract in selection')
		return
	}

	// Build contraction index
	const sortedContractions = Array.from(contractions.entries())
		.sort((a, b) => a[0].localeCompare(b[0]))

	const indexLines = [
		'<!-- Contractions Index -->',
		'',
		'| Original | Contracted |',
		'|----------|------------|',
		...sortedContractions.map(([orig, contr]) => `| ${orig} | ${contr} |`),
		'',
		'<!-- /Contractions Index -->',
		''
	]
	const indexText = indexLines.join('\n')

	// Apply edits: first insert index at start, then replace selections
	await editor.edit(editBuilder => {
		// Insert index at the very beginning of document
		const startPos = new vscode.Position(0, 0)
		editBuilder.insert(startPos, indexText)

		// Replace selections with contracted text
		// Adjust ranges to account for the inserted index (shift by indexText.length)
		const offset = indexText.length
		for (const edit of edits) {
			const newRange = new vscode.Range(
				new vscode.Position(
					edit.range.start.line,
					edit.range.start.character
				),
				new vscode.Position(
					edit.range.end.line,
					edit.range.end.character
				)
			)
			editBuilder.replace(newRange, edit.text)
		}
	})

	// Log details
	for (const [orig, contr] of sortedContractions) {
		macros.log.info(`Contracted: ${orig} -> ${contr}`)
	}

	vscode.window.showInformationMessage(
		`Contracted ${contractions.size} word${contractions.size === 1 ? '' : 's'} and added index at document start`
	)
}

main()
