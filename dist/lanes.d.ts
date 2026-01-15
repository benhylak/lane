import { Lane } from "./config.js";
export interface CreateLaneResult {
    success: boolean;
    lane?: Lane;
    error?: string;
}
export interface RemoveLaneResult {
    success: boolean;
    error?: string;
}
/**
 * Get the main repo root, even if we're in a worktree
 */
export declare function getMainRepoRoot(cwd?: string): string | null;
/**
 * Generate the lane directory path
 */
export declare function getLanePath(mainRepoRoot: string, laneName: string): string;
/**
 * Copy untracked files from source to destination
 */
export declare function copyUntrackedFiles(srcRoot: string, destRoot: string, skipPatterns: string[]): string[];
/**
 * Detect and run package manager install
 */
export declare function runPackageInstall(cwd: string): {
    ran: boolean;
    error?: string;
};
/**
 * Create a new lane
 */
export declare function createLane(laneName: string, options?: {
    branch?: string;
    skipInstall?: boolean;
    cwd?: string;
}): Promise<CreateLaneResult>;
/**
 * Remove a lane
 */
export declare function removeLaneCmd(laneName: string, options?: {
    deleteBranch?: boolean;
    force?: boolean;
    cwd?: string;
}): Promise<RemoveLaneResult>;
/**
 * Get lane to switch to
 */
export declare function getLaneForSwitch(laneName: string, cwd?: string): {
    path: string;
    branch: string;
} | null;
/**
 * List all lanes including the main repo
 */
export declare function listAllLanes(cwd?: string): Array<{
    name: string;
    path: string;
    branch: string;
    isMain: boolean;
    isCurrent: boolean;
}>;
