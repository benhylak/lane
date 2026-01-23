import { existsSync } from "node:fs";
import path from "node:path";

export interface GitRepo {
  root: string;
  name: string;
  parentDir: string;
  currentBranch: string;
}

/**
 * Find the git repository root from the current directory
 */
export async function findGitRepo(cwd: string = process.cwd()): Promise<GitRepo | null> {
  try {
    const root = (await Bun.$`git rev-parse --show-toplevel`.cwd(cwd).quiet().text()).trim();

    const currentBranch = (await Bun.$`git branch --show-current`.cwd(root).quiet().text()).trim();

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
export async function isWorktree(cwd: string = process.cwd()): Promise<boolean> {
  try {
    const gitDir = (await Bun.$`git rev-parse --git-dir`.cwd(cwd).quiet().text()).trim();

    // If git-dir contains "/worktrees/", we're in a worktree
    return gitDir.includes("/worktrees/");
  } catch {
    return false;
  }
}

/**
 * Get the main worktree path (the original repo)
 */
export async function getMainWorktree(cwd: string = process.cwd()): Promise<string | null> {
  try {
    const output = await Bun.$`git worktree list --porcelain`.cwd(cwd).quiet().text();

    // First worktree listed is the main one
    const match = output.match(/^worktree (.+)$/m);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Get untracked and ignored items using git status (fast, single command)
 */
export async function getUntrackedFiles(cwd: string): Promise<string[]> {
  const untrackedItems = new Set<string>();

  try {
    // git status --ignored --porcelain shows:
    // ?? file  - untracked
    // !! file  - ignored
    // It shows directories as "dir/" so we don't get every file inside
    const proc = Bun.spawn(["git", "status", "--ignored", "--porcelain"], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;
    const output = await new Response(proc.stdout).text();

    for (const line of output.split("\n")) {
      if (!line) continue;

      const status = line.substring(0, 2);
      let filePath = line.substring(3);

      // Remove trailing slash for directories
      if (filePath.endsWith("/")) {
        filePath = filePath.slice(0, -1);
      }

      // ?? = untracked, !! = ignored
      if (status === "??" || status === "!!") {
        untrackedItems.add(filePath);
      }
    }
  } catch (e: any) {
    process.stderr.write(`  [git status failed: ${e.message}]\n`);
  }

  if (untrackedItems.size > 0) {
    process.stderr.write(`  [found ${untrackedItems.size} untracked/ignored items]\n`);
  }

  return Array.from(untrackedItems);
}

/**
 * Create a new git worktree
 */
export async function createWorktree(
  repoPath: string,
  worktreePath: string,
  branchName: string,
  createBranch: boolean = true
): Promise<{ success: boolean; error?: string }> {
  try {
    const args = createBranch
      ? ["worktree", "add", "-b", branchName, worktreePath]
      : ["worktree", "add", worktreePath, branchName];

    const proc = Bun.spawn(["git", ...args], {
      cwd: repoPath,
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;

    if (proc.exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      return { success: false, error: stderr || "Unknown error" };
    }

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || String(e) };
  }
}

/**
 * Remove a git worktree
 */
export async function removeWorktree(
  repoPath: string,
  worktreePath: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const proc = Bun.spawn(["git", "worktree", "remove", worktreePath, "--force"], {
      cwd: repoPath,
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;

    if (proc.exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      return { success: false, error: stderr || "Unknown error" };
    }

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || String(e) };
  }
}

/**
 * List all worktrees
 */
export async function listWorktrees(
  repoPath: string
): Promise<Array<{ path: string; branch: string; isMain: boolean }>> {
  try {
    const proc = Bun.spawn(["git", "worktree", "list", "--porcelain"], {
      cwd: repoPath,
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;
    const output = await new Response(proc.stdout).text();

    const worktrees: Array<{ path: string; branch: string; isMain: boolean }> = [];
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
export async function branchExists(repoPath: string, branchName: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(["git", "show-ref", "--verify", "--quiet", `refs/heads/${branchName}`], {
      cwd: repoPath,
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Delete a branch
 */
export async function deleteBranch(
  repoPath: string,
  branchName: string,
  force: boolean = false
): Promise<{ success: boolean; error?: string }> {
  try {
    const flag = force ? "-D" : "-d";
    const proc = Bun.spawn(["git", "branch", flag, branchName], {
      cwd: repoPath,
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;

    if (proc.exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      return { success: false, error: stderr || "Unknown error" };
    }

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || String(e) };
  }
}

/**
 * Get the current branch of a git repo/worktree
 */
export async function getCurrentBranch(repoPath: string): Promise<string | null> {
  try {
    return (await Bun.$`git branch --show-current`.cwd(repoPath).quiet().text()).trim() || null;
  } catch {
    return null;
  }
}
