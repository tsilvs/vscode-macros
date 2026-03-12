// @macro:singleton
// git-fetch-all.macro.js - Fetch all git repositories in the workspace

// @ts-ignore
const vscode = require('vscode')
// @ts-ignore
const path = require('path')
// @ts-ignore
const fs = require('fs/promises')
// @ts-ignore
const { execFile } = require('child_process')
// @ts-ignore
const { promisify } = require('util')

const execFileAsync = promisify(execFile)

const GIT_GLOB = '**/.git'
const GIT_EXCLUDE_GLOB = '**/.git/**'

function normalizePath(inputPath) {
	const resolved = path.resolve(inputPath).replace(/\\/g, '/')
	const isWindows = path.sep === '\\'
	return isWindows ? resolved.toLowerCase() : resolved
}

function isNestedPath(parentPath, childPath) {
	const parent = normalizePath(parentPath).replace(/\/$/, '')
	const child = normalizePath(childPath).replace(/\/$/, '')
	if (parent === child) return false
	return child.startsWith(`${parent}/`)
}

function getRepoLabel(repo) {
	const rel = vscode.workspace.asRelativePath(repo.rootPath, false)
	if (!rel || rel === '.') {
		return path.basename(repo.rootPath)
	}
	return rel
}

async function isSubmoduleGitFile(gitPath) {
	try {
		const contents = await fs.readFile(gitPath, 'utf8')
		const match = contents.match(/gitdir:\s*(.+)/i)
		if (!match) return false
		return /[\\/]+modules[\\/]+/i.test(match[1])
	} catch (err) {
		return false
	}
}

async function addGitPath(reposByPath, gitPath) {
	const stat = await fs.stat(gitPath).catch(() => null)
	if (!stat) return

	const rootPath = path.dirname(gitPath)
	const normalizedRoot = normalizePath(rootPath)
	if (reposByPath.has(normalizedRoot)) return

	const isGitFile = stat.isFile()
	const isSubmodule = isGitFile ? await isSubmoduleGitFile(gitPath) : false

	reposByPath.set(normalizedRoot, {
		rootPath,
		gitPath,
		isGitFile,
		isSubmodule,
		isNested: false
	})
}

async function findGitRepos() {
	const reposByPath = new Map()
	const workspaceFolders = vscode.workspace.workspaceFolders || []

	for (const folder of workspaceFolders) {
		const gitPath = path.join(folder.uri.fsPath, '.git')
		await addGitPath(reposByPath, gitPath)
	}

	const gitUris = await vscode.workspace.findFiles(GIT_GLOB, GIT_EXCLUDE_GLOB)
	for (const uri of gitUris) {
		await addGitPath(reposByPath, uri.fsPath)
	}

	const repos = Array.from(reposByPath.values())
	const sorted = repos
		.slice()
		.sort((a, b) => normalizePath(a.rootPath).length - normalizePath(b.rootPath).length)

	for (let i = 0; i < sorted.length; i += 1) {
		const parent = sorted[i]
		for (let j = i + 1; j < sorted.length; j += 1) {
			const child = sorted[j]
			if (isNestedPath(parent.rootPath, child.rootPath)) {
				child.isNested = true
				child.isSubmodule = true
			}
		}
	}

	return repos
}

async function runGitFetch(repo, useAllRemotes) {
	const args = ['-C', repo.rootPath, 'fetch']
	if (useAllRemotes) {
		args.push('--all')
	}

	return execFileAsync('git', args, { maxBuffer: 1024 * 1024 })
}

async function main() {
	if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
		vscode.window.showErrorMessage('No workspace folders open')
		return
	}

	const repos = await findGitRepos()
	if (repos.length === 0) {
		vscode.window.showInformationMessage('No git repositories found in workspace')
		return
	}

	const hasSubmodules = repos.some(repo => repo.isSubmodule)
	let includeSubmodules = true

	if (hasSubmodules) {
		const submoduleChoice = await vscode.window.showQuickPick(
			[
				{ label: 'Include submodules', description: 'Fetch all repositories including nested submodules', value: true },
				{ label: 'Exclude submodules', description: 'Fetch only top-level repositories', value: false }
			],
			{ placeHolder: 'Choose repository list options' }
		)

		if (!submoduleChoice) return
		includeSubmodules = submoduleChoice.value
	}

	const visibleRepos = includeSubmodules
		? repos
		: repos.filter(repo => !repo.isSubmodule)

	if (visibleRepos.length === 0) {
		vscode.window.showInformationMessage('No repositories matched the selected options')
		return
	}

	const repoItems = visibleRepos.map(repo => ({
		label: getRepoLabel(repo),
		description: repo.isSubmodule ? 'submodule' : 'repository',
		detail: repo.rootPath,
		repo,
		picked: true
	}))

	const selectedRepos = await vscode.window.showQuickPick(repoItems, {
		canPickMany: true,
		matchOnDescription: true,
		matchOnDetail: true,
		placeHolder: 'Select repositories to fetch (Enter to accept all)'
	})

	if (!selectedRepos || selectedRepos.length === 0) return

	const allRemotesItems = selectedRepos.map(item => ({
		label: item.label,
		description: item.description,
		detail: item.detail,
		repo: item.repo
	}))

	const allRemotesSelection = await vscode.window.showQuickPick(allRemotesItems, {
		canPickMany: true,
		matchOnDescription: true,
		matchOnDetail: true,
		placeHolder: 'Select repositories to fetch all remotes (git fetch --all)'
	})

	if (!allRemotesSelection) return

	const allRemotesSet = new Set(
		allRemotesSelection.map(item => normalizePath(item.repo.rootPath))
	)
	const selectedRepoEntries = selectedRepos.map(item => item.repo)

	macros.log.info(
		`Git fetch: ${selectedRepoEntries.length} repo${selectedRepoEntries.length === 1 ? '' : 's'}, ` +
		`${allRemotesSet.size} using --all`
	)

	const results = []
	let cancelled = false

	await vscode.window.withProgress(
		{ location: vscode.ProgressLocation.Notification, title: 'Git fetch all', cancellable: true },
		async (progress, token) => {
			for (let i = 0; i < selectedRepoEntries.length; i += 1) {
				if (token.isCancellationRequested) {
					cancelled = true
					break
				}

				const repo = selectedRepoEntries[i]
				const label = getRepoLabel(repo)
				const useAllRemotes = allRemotesSet.has(normalizePath(repo.rootPath))
				const message = useAllRemotes ? `${label} (all remotes)` : label

				progress.report({ message, increment: 100 / selectedRepoEntries.length })
				macros.log.info(`[${label}] git fetch${useAllRemotes ? ' --all' : ''}`)

				try {
					const { stdout, stderr } = await runGitFetch(repo, useAllRemotes)
					if (stdout && stdout.trim()) {
						macros.log.info(`[${label}] ${stdout.trim()}`)
					}
					if (stderr && stderr.trim()) {
						macros.log.info(`[${label}] ${stderr.trim()}`)
					}
					results.push({ repo, label, success: true })
				} catch (err) {
					const errMsg = err?.stderr || err?.message || String(err)
					macros.log.error(`[${label}] fetch failed: ${errMsg}`)
					results.push({ repo, label, success: false, error: errMsg })
				}
			}
		}
	)

	const successCount = results.filter(result => result.success).length
	const failureCount = results.length - successCount

	if (failureCount > 0) {
		vscode.window.showErrorMessage(
			`Fetched ${successCount} repo${successCount === 1 ? '' : 's'}, ` +
			`${failureCount} failed. See Macros log for details.`
		)
		return
	}

	if (cancelled) {
		vscode.window.showWarningMessage(
			`Fetch cancelled after ${successCount} repo${successCount === 1 ? '' : 's'}`
		)
		return
	}

	vscode.window.showInformationMessage(
		`Fetched ${successCount} repo${successCount === 1 ? '' : 's'}`
	)
}

main()
