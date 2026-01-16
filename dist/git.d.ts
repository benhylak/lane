export interface GitRepo {
    root: string;
    name: string;
    parentDir: string;
    currentBranch: string;
}
/**
 * Find the git repository root from the current directory
 */
export declare function findGitRepo(cwd?: string): GitRepo | null;
/**
 * Check if we're inside a git worktree (not the main repo)
 */
export declare function isWorktree(cwd?: string): boolean;
/**
 * Get the main worktree path (the original repo)
 */
export declare function getMainWorktree(cwd?: string): string | null;
/**
 * Get untracked and ignored items using git status (fast, single command)
 */
export declare function getUntrackedFiles(cwd: string): string[];
/**
 * Create a new git worktree
 */
export declare function createWorktree(repoPath: string, worktreePath: string, branchName: string, createBranch?: boolean): {
    success: boolean;
    error?: string;
};
/**
 * Remove a git worktree
 */
export declare function removeWorktree(repoPath: string, worktreePath: string): {
    success: boolean;
    error?: string;
};
/**
 * List all worktrees
 */
export declare function listWorktrees(repoPath: string): Array<{
    path: string;
    branch: string;
    isMain: boolean;
}>;
/**
 * Check if a branch exists
 */
export declare function branchExists(repoPath: string, branchName: string): boolean;
/**
 * Delete a branch
 */
export declare function deleteBranch(repoPath: string, branchName: string, force?: boolean): {
    success: boolean;
    error?: string;
};
/**
 * Get the current branch of a git repo/worktree
 */
export declare function getCurrentBranch(repoPath: string): string | null;
