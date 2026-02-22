# VSCode Macros collection

Designed to be used with `damolinx.damolinx-macros.vsix`

## Usage

1. Add this repo as a `git` submodule: `git submodule --recursive add git@hithub.com:tsilvs/vscode-macros.git .vscode/macros`
1. Add this config in `.vscode/settings.json`: `"macros.sourceDirectories": [ "${workspaceFolder}/.vscode/macros/src" ],`

> [!TIP]
> Optionally, in `.vscode/` add this keyboard shortcut binding:
>
> ```json
> {
> 	"key": "ctrl+shift+m",
> 	"command": "macros.run",
> 	"when": "editorTextFocus && !editorReadonly && !suggestWidgetVisible"
> },
> ```
>
