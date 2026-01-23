# Lane

**A brain-dead alternative to git worktrees.**

Work on multiple branches at once. No stashing, no context switching.

```bash
lane a
```

Creates a copy of your repo at `my-app-lane-a/` and cd's into it.

## Install

```bash
git clone https://github.com/benhylak/lane.git
bun install -g ./lane
lane init-shell
source ~/.zshrc
```

Or use `bunx lane` to run without installing.

## Usage

```bash
lane new <name>         # Create a new lane
lane switch <name>      # Switch to existing lane
lane checkout <branch>  # Smart: find lane by branch, or create one
lane                    # Interactive picker
lane -                  # Previous lane
lane main               # Back to main repo
lane rename <new-name>  # Rename current lane
lane remove <name>      # Delete a lane
lane sync [name]        # Copy .env files from main
lane list               # List all lanes
lane status             # Show current lane info
lane config             # Settings
```

## How it works

```
~/my-app/               # Main repo
~/my-app-lane-a/        # Lane "a" (on feature/login)
~/my-app-lane-b/        # Lane "b" (on fix/bug-123)
```

Lane name ≠ branch. Lanes are just folders. `git checkout` any branch in any lane.

## Why not git worktrees?

While you should probably use git worktrees, they don't copy your `.env` files, you can't checkout the same branch twice, and deleting them wrong leaves orphaned refs. Minor annoyances, but annoying enough for me not have built the habit of using them. Lane just copies the whole folder.

## Settings

Run `lane config` to change:

- **Copy Mode**: `full` (default) or `worktree` (experimental)
- **Symlink Dependencies**: Symlink `node_modules`, `.venv`, etc instead of copying (default: enabled)
- **Auto Install**: Run `bun install` after creating a lane

### Disk Usage

By default, Lane symlinks dependency directories (`node_modules`, `.venv`, etc.) to save massive disk space:

```
myapp/               500MB (with node_modules)
myapp-lane-a/        ~10MB (node_modules is symlinked)
myapp-lane-b/        ~10MB (node_modules is symlinked)
```

Disable symlink mode in `lane config` if you need independent dependencies.

### Config Files vs Dependencies

Lane handles **dependencies** and **config files** differently:

| Type | Behavior | Examples |
|------|----------|----------|
| **Dependencies** | Symlinked (shared) | `node_modules`, `.venv`, `vendor`, `target`, `.next` |
| **Config Files** | Copied (independent) | `.env`, `.env.*`, `*.local`, `.secret*` |

**Why?** Each lane may need different environment variables, but dependencies are the same. Modifying `.env` in one lane won't affect others. Use `lane sync` to copy updated config files from main.

### Worktree mode

Worktree mode uses git worktrees under the hood, but copies untracked files (like `.env`) automatically. Faster than full copy, but has the usual worktree quirks (can't checkout same branch twice, etc).

## License

MIT
