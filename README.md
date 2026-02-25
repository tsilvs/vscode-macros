# VSCode Macros collection

Designed to be used with `damolinx.damolinx-macros.vsix`

## Usage

### Globally

1. Clone this repo anywhere, e.g.: `git clone git@github.com:tsilvs/vscode-macros.git ~/.config/Code/User/macros`
1. Add this config in `~/.vscode/settings.json`: `"macros.sourceDirectories": [ "$HOME/.config/Code/User/macros/src" ],`

> [!WARNING]
> `~`, `$HOME` & `${userHome}` are unresolved in `settings.json`, replace with literal values!

### In a repo

1. Add this repo as a `git` submodule: `git submodule add git@github.com:tsilvs/vscode-macros.git .vscode/macros`
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
