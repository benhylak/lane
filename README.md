# Lane

**A dead-simple alternative to git worktrees.**

Work on multiple branches at once. No stashing, no context switching. Just `lane feature-x` and you're there.

## Why not git worktrees?

While you should probably use git worktrees, they don't copy your `.env` files, you can't checkout the same branch twice, and deleting them wrong leaves orphaned refs. Minor annoyances, but annoying enough for me not to bother with them. Lane just copies the whole folder.

## How It Works

Lane creates full copies of your repo in sibling directories:

```
~/projects/
├── my-app/                  # Main repo (on main)
├── my-app-lane-a/           # Lane "a" (on feature/login)
├── my-app-lane-b/           # Lane "b" (on fix/bug-123)
├── my-app-lane-testing/     # Lane "testing" (on main)
```

When you run `lane a`, it **creates the copy AND cd's you into it**:

```
~/my-app $ lane a
✓ Lane "a" ready at ~/my-app-lane-a

~/my-app-lane-a $
```

**Lane name ≠ branch name.** Lanes are just directories. You can checkout any branch in any lane:

```
~/my-app-lane-a $ git checkout feature/login
~/my-app-lane-a $ git checkout main
~/my-app-lane-a $ git checkout -b experiment
```

**Coworker sends you a branch?** Use `lane checkout`:

```bash
~/my-app $ lane checkout feature/anna-auth
```

If a lane already has that branch checked out, you'll switch to it. If not, you choose:
- Create a new lane with that branch
- Check it out in an existing lane

**Easy cleanup.** Lanes are just folders. Delete them anytime:

```bash
lane remove a               # Delete lane "a"
lane remove b --delete-branch   # Also delete the git branch
```

Or use the interactive picker (`lane`) to select and bulk-delete multiple lanes at once.

## Install

```bash
git clone https://github.com/benhylak/lane.git
npm install -g ./lane
lane init-shell
source ~/.zshrc   # or restart your terminal
```

The `init-shell` step is required—it adds a shell function that lets lane change your directory.

## Usage

### Create or switch to a lane
```bash
lane a              # Creates lane "a" if it doesn't exist, or switches to it
lane testing        # Same idea
lane                # No args = interactive picker
lane -              # Go to previous lane (like cd -)
```

### Find a lane by branch
```bash
lane checkout main              # Switch to whichever lane has "main" checked out
lane checkout feature/login     # Find the lane on this branch
```

If no lane has that branch, you'll get options:
- Create a new lane with that branch
- Checkout the branch in an existing lane

### Other commands
```bash
lane list                    # List all lanes
lane remove old-feature      # Delete a lane
lane sync                    # Copy .env files from main repo to current lane
lane config                  # Settings (copy mode, skip node_modules, etc.)
```

## Tips

**Keep lane names short.** They become directory names: `lane a`, `lane testing`, not `lane feature/api-refactor-v2`.

**Large repos?** Run `lane config` and enable "Skip Build Artifacts" to skip `node_modules`, `dist`, etc. Lane will run `npm install` automatically after copying.

## Troubleshooting

**Lane doesn't change directory:** Run `lane init-shell` and restart your terminal.

**"Branch already used by another worktree":** Switch to full copy mode in `lane config`.

## License

MIT
