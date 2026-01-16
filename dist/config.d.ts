export interface Lane {
    name: string;
    path: string;
    branch: string;
    createdAt: string;
}
export type CopyMode = "worktree" | "full";
export interface LanesConfig {
    version: number;
    lanes: Lane[];
    settings: {
        copyMode: CopyMode;
        skipBuildArtifacts: boolean;
        skipPatterns: string[];
        autoInstall: boolean;
    };
}
declare const BUILD_ARTIFACT_PATTERNS: string[];
export { BUILD_ARTIFACT_PATTERNS };
/**
 * Get the path to the lanes config file
 */
export declare function getConfigPath(gitRoot: string): string;
/**
 * Load the lanes config, creating default if it doesn't exist
 */
export declare function loadConfig(gitRoot: string): LanesConfig;
/**
 * Save the lanes config
 */
export declare function saveConfig(gitRoot: string, config: LanesConfig): void;
/**
 * Add a lane to the config
 */
export declare function addLane(gitRoot: string, lane: Omit<Lane, "createdAt">): LanesConfig;
/**
 * Remove a lane from the config
 */
export declare function removeLane(gitRoot: string, laneName: string): LanesConfig;
/**
 * Get a lane by name
 */
export declare function getLane(gitRoot: string, laneName: string): Lane | null;
/**
 * Get all lanes
 */
export declare function getAllLanes(gitRoot: string): Lane[];
/**
 * Record a lane switch in history (for lane - support)
 */
export declare function recordLaneSwitch(gitRoot: string, fromPath: string): void;
/**
 * Get the previous lane path (for lane - support)
 */
export declare function getPreviousLane(gitRoot: string): string | null;
