# Lane

**A dead-simple alternative to git worktrees.**

Lane lets you work on multiple branches simultaneously by creating full copies of your repo. No more stashing, no more context switching headaches. Just `lane feature-x` and you're there.

```
~/project $ lane feature-x
Creating lane feature-x
─────────────────────────────────────────
Mode: Full copy
✓ Registered lane
✓ Copied repository in 3.2s

─────────────────────────────────────────
✓ Lane "feature-x" ready at ~/project-lane-feature-x
─────────────────────────────────────────

~/project-lane-feature-x $
```

## Why Lane?

**Git worktrees are powerful but annoying.** You have to think about branches, paths, and remember which worktree is where. Lane just works:

- `lane feature-x` → Creates a new lane OR switches to it if it exists
- `lane` → Shows all your lanes, pick one
- `lane -` → Go back to the previous lane (like `cd -`)

Each lane is a complete copy of your repo with its own branch. Work on a bug fix while your feature branch builds. Review a PR without losing your place. Run tests in isolation.

## Installation

```bash
# Clone and install globally
git clone <repo-url>
cd lane
npm install
npm run build
npm link

# Set up shell integration (required for auto-cd)
lane init-shell
source ~/.zshrc  # or restart your terminal
```

## Quick Start

```bash
# Create a new lane (or switch to existing)
lane my-feature

# See all lanes
lane
# ❯ ☐ main [master] ★
#   ☐ my-feature [my-feature]
#   ☐ bugfix [fix/login-bug]

# Switch back to previous lane
lane -

# Checkout a branch (finds the lane or offers to create one)
lane checkout fix/login-bug
```

## Commands

### `lane [name]`
The smart command. If a lane named `name` exists, switches to it. Otherwise, creates a new lane.

```bash
lane feature-x      # Create or switch to "feature-x"
lane                # Interactive picker (no args)
lane -              # Previous lane
```

### `lane checkout <branch>` (alias: `co`)
Find a lane by its current branch, or choose where to checkout.

```bash
lane checkout main           # Go to whichever lane has main checked out
lane co feature/new-thing    # Short alias
```

### `lane new <name>`
Explicitly create a new lane.

```bash
lane new api-refactor
lane new hotfix -b fix/urgent-bug  # Custom branch name
```

### `lane list` (alias: `ls`)
List all lanes.

```bash
lane list
lane ls -i   # Interactive mode
```

### `lane remove <name>` (alias: `rm`)
Delete a lane.

```bash
lane rm old-feature
lane rm stale-branch -d    # Also delete the git branch
lane rm broken-thing -f    # Force (ignore uncommitted changes)
```

### `lane sync [name]`
Copy untracked/ignored files from main repo to a lane. Useful for syncing `.env` files.

```bash
lane sync           # Sync to current lane
lane sync feature-x # Sync to specific lane
```

### `lane config`
Interactive settings UI.

```bash
lane config
```

Settings:
- **Copy Mode**: `full` (default) or `worktree`
- **Skip Build Artifacts**: Skip `node_modules`, `dist`, etc. when copying
- **Auto Install**: Run `npm/yarn/pnpm install` after creating a lane

### `lane init-shell`
Set up shell integration. **Required** for lane to change your directory.

```bash
lane init-shell          # Auto-install to .zshrc/.bashrc
lane init-shell --print  # Just print the function
```

## How It Works

Lane creates copies of your repo in sibling directories:

```
~/projects/
├── my-app/              # Main repo
├── my-app-lane-feature/ # Lane "feature"
├── my-app-lane-bugfix/  # Lane "bugfix"
└── my-app-lane-api/     # Lane "api"
```

Each lane:
- Is a complete, independent copy of your repo
- Has its own branch checked out
- Shares nothing with other lanes (no symlinks, no worktree weirdness)
- Can be deleted without affecting other lanes

Config is stored in `.git/lanes.json` in your main repo.

## Tips

### Use short lane names
Lane names become directory names. Keep them short.

```bash
lane api        # Good
lane feature/api-refactor-v2  # Works but verbose
```

### The lane picker is powerful
Just run `lane` with no args:
- `↑↓` or `jk` to navigate
- `Enter` to switch
- `Space` to select multiple
- `d` to delete selected
- `a` to select all (for bulk delete)

### Sync your .env files
After creating a lane, your `.env` files are copied automatically. But if you update them later:

```bash
lane sync feature-x
```

### Branch ≠ Lane name
Lanes track which branch they're on, but you can switch branches within a lane:

```bash
lane feature-x           # Switch to feature-x lane
git checkout other-branch  # Now lane shows: feature-x [other-branch]
```

Use `lane checkout <branch>` to find lanes by their current branch.

## Shell Integration

Lane needs shell integration to change your directory. The `lane init-shell` command adds a wrapper function to your shell config.

**Supported shells:** bash, zsh, fish

If you use a custom shell config location, use `lane init-shell --print` and add it manually.

## Troubleshooting

**"command not found: lane"**
Run `npm link` in the lane directory, or add it to your PATH.

**Lane doesn't change directory**
Run `lane init-shell` and restart your terminal.

**Copying is slow**
Large repos take time. Enable "Skip Build Artifacts" in `lane config` to skip `node_modules`, `dist`, etc.

**"Branch already used by another worktree"**
This happens with worktree mode. Switch to full copy mode in `lane config`.

## License

MIT
