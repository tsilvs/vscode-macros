// @macro:singleton
// yt-playlistify.macro.js - From selection, extract YouTube video links and replace with a combined playlist link https://youtube.com/watch_videos?video_ids=...

// @ts-ignore
const vscode = require('vscode')

async function main() {
	const editor = vscode.window.activeTextEditor
	if (!editor) {
		vscode.window.showErrorMessage('No active editor')
		return
	}

	const selection = editor.selection
	if (selection.isEmpty) {
		vscode.window.showInformationMessage('No selection made. Select text containing YouTube links.')
		return
	}

	const selectedText = editor.document.getText(selection)

	// Regex to match YouTube video IDs from various URL formats
	const ytRegex = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/gi
	const matches = [...selectedText.matchAll(ytRegex)]
	const videoIds = new Set(matches.map(match => match[1]))

	if (videoIds.size === 0) {
		vscode.window.showInformationMessage('No YouTube video links found in the selection.')
		return
	}

	const idsList = Array.from(videoIds).join(',')
	const playlistUrl = `https://www.youtube.com/watch_videos?video_ids=${idsList}`

	// Replace the selection with the playlist URL
	await editor.edit(editBuilder => {
		editBuilder.replace(selection, playlistUrl)
	})

	vscode.window.showInformationMessage(`Created playlist link for ${videoIds.size} unique video${videoIds.size === 1 ? '' : 's'}: ${playlistUrl}`)
	macros.log.info(`Playlistified ${videoIds.size} videos: ${playlistUrl}`)
}

main()
