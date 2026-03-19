// @macro:singleton
// ascii-tbl-fmt.macro.js - Align ASCII table/diagram elements

// @ts-ignore
const vscode = require('vscode')

/**
 * Check if a line is part of an ASCII table (contains box-drawing characters)
 * @param {string} line
 * @returns {boolean}
 */
function isAsciiTableLine(line) {
	return /[├┤│─┌┐└┘┬┴┼]/.test(line)
}

/**
 * Find column split positions based on box junctions
 * @param {string[]} lines
 * @returns {number[]}
 */
function findColumnSplits(lines) {
	const splits = new Set()

	for (const line of lines) {
		// Find positions of vertical separators (│, ┼, ┬, ┴, ├, ┤)
		for (let i = 0; i < line.length; i++) {
			const char = line[i]
			if ('│┼┬┴├┤'.includes(char)) {
				splits.add(i)
			}
		}
	}

	return Array.from(splits).sort((a, b) => a - b)
}

/**
 * Extract cells from a line based on column positions
 * @param {string} line
 * @param {number[]} colPositions
 * @returns {string[]}
 */
function extractCells(line, colPositions) {
	const cells = []
	for (let i = 0; i < colPositions.length - 1; i++) {
		const start = colPositions[i]
		const end = colPositions[i + 1]
		cells.push(line.substring(start, end))
	}
	// Add last cell
	if (colPositions.length > 0) {
		cells.push(line.substring(colPositions[colPositions.length - 1]))
	}
	return cells
}

/**
 * Calculate max width for each column
 * @param {string[][]} rows
 * @returns {number[]}
 */
function calcMaxWidths(rows) {
	if (rows.length === 0) return []
	const numCols = Math.max(...rows.map(r => r.length))
	const widths = new Array(numCols).fill(0)

	for (const row of rows) {
		for (let i = 0; i < row.length; i++) {
			widths[i] = Math.max(widths[i], row[i].length)
		}
	}

	return widths
}

/**
 * Pad or trim a cell to target width, preserving border characters
 * @param {string} cell
 * @param {number} targetWidth
 * @returns {string}
 */
function adjustCell(cell, targetWidth) {
	const currentWidth = cell.length

	if (currentWidth === targetWidth) {
		return cell
	}

	if (currentWidth < targetWidth) {
		// Need to pad - add spaces before the last border char
		const diff = targetWidth - currentWidth
		return cell + '─'.repeat(diff)
	}

	// Need to trim - this shouldn't happen if we calculate correctly
	return cell
}

/**
 * Rebuild line with adjusted column widths
 * @param {string[]} cells
 * @param {number[]} targetWidths
 * @returns {string}
 */
function rebuildLine(cells, targetWidths) {
	if (cells.length === 0) return ''

	const adjusted = []
	for (let i = 0; i < cells.length; i++) {
		const cell = cells[i]
		const targetWidth = targetWidths[i] || cell.length
		adjusted.push(adjustCell(cell, targetWidth))
	}

	return adjusted.join('')
}

/**
 * Main transformation function
 * @param {string} text
 * @returns {string}
 */
function alignAsciiTable(text) {
	const lines = text.split('\n')

	// Group consecutive ASCII table lines
	const groups = []
	let currentGroup = []

	for (let i = 0; i < lines.length; i++) {
		if (isAsciiTableLine(lines[i])) {
			currentGroup.push({ line: lines[i], index: i })
		} else {
			if (currentGroup.length > 0) {
				groups.push(currentGroup)
				currentGroup = []
			}
		}
	}
	if (currentGroup.length > 0) {
		groups.push(currentGroup)
	}

	// Process each group
	const result = [...lines]

	for (const group of groups) {
		if (group.length === 0) continue

		const groupLines = group.map(g => g.line)
		const splits = findColumnSplits(groupLines)

		if (splits.length < 2) continue

		// Extract cells for all lines
		const rows = groupLines.map(line => extractCells(line, splits))

		// Calculate max widths
		const maxWidths = calcMaxWidths(rows)

		// Rebuild lines
		for (let i = 0; i < group.length; i++) {
			const newLine = rebuildLine(rows[i], maxWidths)
			result[group[i].index] = newLine
		}
	}

	return result.join('\n')
}

async function main() {
	const editor = vscode.window.activeTextEditor
	if (!editor) {
		vscode.window.showErrorMessage('No active editor')
		return
	}

	const doc = editor.document

	// Check if there's a selection
	const selection = editor.selection
	let text, range

	if (selection.isEmpty) {
		// Process entire document
		text = doc.getText()
		range = new vscode.Range(
			new vscode.Position(0, 0),
			new vscode.Position(doc.lineCount - 1, doc.lineAt(doc.lineCount - 1).text.length)
		)
	} else {
		// Process selection
		text = doc.getText(selection)
		range = selection
	}

	// Check if text contains ASCII table characters
	if (!isAsciiTableLine(text)) {
		vscode.window.showInformationMessage('No ASCII table found in selection/document')
		return
	}

	const aligned = alignAsciiTable(text)

	// Apply the transformation
	await editor.edit(editBuilder => {
		editBuilder.replace(range, aligned)
	})

	vscode.window.showInformationMessage('ASCII table aligned')
	macros.log.info('Aligned ASCII table')
}

main()
