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
 * Replaces / in lane names with - for valid directory names
 */
export declare function getLanePath(mainRepoRoot: string, laneName: string): string;
/**
 * Copy untracked files from source to destination
 */
export declare function copyUntrackedFiles(srcRoot: string, destRoot: string, skipPatterns: string[]): string[];
interface PackageManager {
    name: string;
    detectFiles: string[];
    installCmd: string;
}
/**
 * Detect package managers in use - only one per ecosystem
 */
export declare function detectPackageManagers(cwd: string): PackageManager[];
/**
 * Detect and run package manager install
 */
export declare function runPackageInstall(cwd: string): {
    ran: boolean;
    managers: string[];
    errors: string[];
};
/**
 * Create a new lane using git worktree + copy untracked files, or full copy
 */
export declare function createLane(laneName: string, options?: {
    branch?: string;
    cwd?: string;
}): Promise<CreateLaneResult>;
/**
 * Remove a lane with progress
 */
export declare function removeLaneCmd(laneName: string, options?: {
    deleteBranch?: boolean;
    force?: boolean;
    cwd?: string;
    silent?: boolean;
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
/**
 * Find a lane by its current branch
 */
export declare function findLaneByBranch(branchName: string, cwd?: string): {
    name: string;
    path: string;
    branch: string;
} | null;
export interface SyncResult {
    success: boolean;
    copiedFiles: string[];
    error?: string;
}
/**
 * Sync untracked files from main repo to current lane (or specified lane)
 */
export declare function syncLane(laneName?: string, options?: {
    cwd?: string;
}): Promise<SyncResult>;
export interface SmartLaneResult {
    success: boolean;
    action: "switched" | "created" | "none";
    lane?: Lane;
    path?: string;
    error?: string;
}
/**
 * Smart lane command - switches to existing lane, or creates new one
 * Logic:
 * 1. If lane exists -> switch to it
 * 2. If "main" -> switch to main repo
 * 3. If branch exists but no lane -> create lane from that branch
 * 4. If nothing exists -> create new lane with new branch
 */
export declare function smartLane(name: string, options?: {
    cwd?: string;
}): Promise<SmartLaneResult>;
export {};
