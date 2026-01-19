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
npm install -g ./lane
lane init-shell
source ~/.zshrc
```

## Usage

```bash
lane a                  # Create or switch to lane "a"
lane                    # Interactive picker
lane -                  # Previous lane
lane main               # Back to main repo
lane rename b           # Rename current lane to "b"
lane remove a           # Delete lane "a"
lane checkout feature/x # Find lane by branch, or create one
lane sync               # Copy .env files from main
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

While you should probably use git worktrees, they don't copy your `.env` files, you can't checkout the same branch twice, and deleting them wrong leaves orphaned refs. Minor annoyances, but annoying enough for me not to bother with them. Lane just copies the whole folder.

## Settings

Run `lane config` to change:

- **Copy Mode**: `full` (default) or `worktree` (experimental - faster but has quirks)
- **Skip Build Artifacts**: Skip `node_modules`, `dist`, etc when copying
- **Auto Install**: Run `npm install` after creating a lane

## License

MIT
