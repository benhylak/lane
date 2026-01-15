import { execSync, spawn } from "child_process";
import { existsSync } from "fs";
import path from "path";

export interface GitRepo {
  root: string;
  name: string;
  parentDir: string;
  currentBranch: string;
}

/**
 * Find the git repository root from the current directory
 */
export function findGitRepo(cwd: string = process.cwd()): GitRepo | null {
  try {
    const root = execSync("git rev-parse --show-toplevel", {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();

    const currentBranch = execSync("git branch --show-current", {
      cwd: root,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();

    return {
      root,
      name: path.basename(root),
      parentDir: path.dirname(root),
      currentBranch,
    };
  } catch {
    return null;
  }
}

/**
 * Check if we're inside a git worktree (not the main repo)
 */
export function isWorktree(cwd: string = process.cwd()): boolean {
  try {
    const gitDir = execSync("git rev-parse --git-dir", {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();

    // If git-dir contains "/worktrees/", we're in a worktree
    return gitDir.includes("/worktrees/");
  } catch {
    return false;
  }
}

/**
 * Get the main worktree path (the original repo)
 */
export function getMainWorktree(cwd: string = process.cwd()): string | null {
  try {
    const output = execSync("git worktree list --porcelain", {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    // First worktree listed is the main one
    const match = output.match(/^worktree (.+)$/m);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Get all untracked files (respecting .gitignore)
 */
export function getUntrackedFiles(cwd: string): string[] {
  try {
    const output = execSync("git ls-files --others --exclude-standard", {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large repos
    });

    return output
      .trim()
      .split("\n")
      .filter((f) => f.length > 0);
  } catch {
    return [];
  }
}

/**
 * Create a new git worktree
 */
export function createWorktree(
  repoPath: string,
  worktreePath: string,
  branchName: string,
  createBranch: boolean = true
): { success: boolean; error?: string } {
  try {
    const args = createBranch
      ? ["worktree", "add", "-b", branchName, worktreePath]
      : ["worktree", "add", worktreePath, branchName];

    execSync(`git ${args.join(" ")}`, {
      cwd: repoPath,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || String(e) };
  }
}

/**
 * Remove a git worktree
 */
export function removeWorktree(
  repoPath: string,
  worktreePath: string
): { success: boolean; error?: string } {
  try {
    execSync(`git worktree remove "${worktreePath}" --force`, {
      cwd: repoPath,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || String(e) };
  }
}

/**
 * List all worktrees
 */
export function listWorktrees(
  repoPath: string
): Array<{ path: string; branch: string; isMain: boolean }> {
  try {
    const output = execSync("git worktree list --porcelain", {
      cwd: repoPath,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    const worktrees: Array<{ path: string; branch: string; isMain: boolean }> =
      [];
    const entries = output.split("\n\n").filter((e) => e.trim());

    for (const entry of entries) {
      const pathMatch = entry.match(/^worktree (.+)$/m);
      const branchMatch = entry.match(/^branch refs\/heads\/(.+)$/m);

      if (pathMatch) {
        worktrees.push({
          path: pathMatch[1],
          branch: branchMatch ? branchMatch[1] : "(detached)",
          isMain: worktrees.length === 0, // First one is main
        });
      }
    }

    return worktrees;
  } catch {
    return [];
  }
}

/**
 * Check if a branch exists
 */
export function branchExists(repoPath: string, branchName: string): boolean {
  try {
    execSync(`git show-ref --verify --quiet refs/heads/${branchName}`, {
      cwd: repoPath,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete a branch
 */
export function deleteBranch(
  repoPath: string,
  branchName: string,
  force: boolean = false
): { success: boolean; error?: string } {
  try {
    const flag = force ? "-D" : "-d";
    execSync(`git branch ${flag} "${branchName}"`, {
      cwd: repoPath,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || String(e) };
  }
}
