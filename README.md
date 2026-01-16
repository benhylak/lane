# Lane

**A dead-simple alternative to git worktrees.**

Work on multiple branches at once. No stashing, no context switching. Just `lane feature-x` and you're there.

## How It Works

Lane creates full copies of your repo in sibling directories:

```
~/projects/
├── my-app/                  # Main repo (on master)
├── my-app-lane-feature/     # Lane "feature" (on feature branch)
├── my-app-lane-bugfix/      # Lane "bugfix" (on bugfix branch)
```

When you run `lane feature`, it **creates the copy AND cd's you into it**:

```
~/my-app $ lane feature
✓ Lane "feature" ready at ~/my-app-lane-feature

~/my-app-lane-feature $ git branch
* feature
```

Each lane is completely independent. No symlinks, no worktree weirdness. Delete one without affecting others.

## Install

```bash
npm install -g git+ssh://git@github.com:benhylak/lane.git
lane init-shell
source ~/.zshrc   # or restart your terminal
```

The `init-shell` step is required—it adds a shell function that lets lane change your directory.

## Usage

### Create or switch to a lane
```bash
lane feature-x      # Creates lane if it doesn't exist, or switches to it
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

**Lane names are directory names.** Keep them short: `lane api` not `lane feature/api-refactor-v2`.

**Branches and lanes are independent.** You can `git checkout` any branch within a lane. Use `lane checkout <branch>` to find lanes by their current branch.

**Large repos?** Run `lane config` and enable "Skip Build Artifacts" to skip `node_modules`, `dist`, etc. Lane will run `npm install` automatically after copying.

## Troubleshooting

**Lane doesn't change directory:** Run `lane init-shell` and restart your terminal.

**"Branch already used by another worktree":** Switch to full copy mode in `lane config`.

## License

MIT
