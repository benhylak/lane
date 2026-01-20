import path from "path";

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
    symlinkDeps: boolean;
  };
}

// Build artifact patterns that can be optionally skipped
const BUILD_ARTIFACT_PATTERNS = [
  "node_modules",
  ".venv",
  "venv",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  "target", // Rust
  "build", // Various
  "dist", // Various
  ".next", // Next.js
  ".nuxt", // Nuxt
  ".turbo", // Turbo
  "vendor", // Go/PHP
  ".gradle", // Gradle
  ".m2", // Maven
  "Pods", // CocoaPods
];

const DEFAULT_CONFIG: LanesConfig = {
  version: 1,
  lanes: [],
  settings: {
    copyMode: "full", // Full copy by default
    skipBuildArtifacts: false, // Copy everything by default (use symlinkDeps instead)
    skipPatterns: [], // User-defined patterns to skip
    autoInstall: true,
    symlinkDeps: true, // Symlink dependencies by default (saves 500MB-2GB+ per lane)
  },
};

export { BUILD_ARTIFACT_PATTERNS };

/**
 * Get the path to the lanes config file
 */
export function getConfigPath(gitRoot: string): string {
  return path.join(gitRoot, ".git", "lanes.json");
}

/**
 * Load the lanes config, creating default if it doesn't exist
 */
export async function loadConfig(gitRoot: string): Promise<LanesConfig> {
  const configPath = getConfigPath(gitRoot);
  const file = Bun.file(configPath);

  if (file.size === 0) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const config = await file.json() as LanesConfig;

    return {
      ...DEFAULT_CONFIG,
      ...config,
      settings: {
        ...DEFAULT_CONFIG.settings,
        ...config.settings,
      },
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Save the lanes config
 */
export async function saveConfig(gitRoot: string, config: LanesConfig): Promise<void> {
  const configPath = getConfigPath(gitRoot);
  await Bun.write(configPath, JSON.stringify(config, null, 2));
}

/**
 * Add a lane to the config
 */
export async function addLane(
  gitRoot: string,
  lane: Omit<Lane, "createdAt">
): Promise<LanesConfig> {
  const config = await loadConfig(gitRoot);

  // Remove any existing lane with the same name
  config.lanes = config.lanes.filter((l) => l.name !== lane.name);

  config.lanes.push({
    ...lane,
    createdAt: new Date().toISOString(),
  });

  await saveConfig(gitRoot, config);
  return config;
}

/**
 * Remove a lane from the config
 */
export async function removeLane(gitRoot: string, laneName: string): Promise<LanesConfig> {
  const config = await loadConfig(gitRoot);
  config.lanes = config.lanes.filter((l) => l.name !== laneName);
  await saveConfig(gitRoot, config);
  return config;
}

/**
 * Get a lane by name
 */
export async function getLane(gitRoot: string, laneName: string): Promise<Lane | null> {
  const config = await loadConfig(gitRoot);
  return config.lanes.find((l) => l.name === laneName) || null;
}

/**
 * Get all lanes
 */
export async function getAllLanes(gitRoot: string): Promise<Lane[]> {
  const config = await loadConfig(gitRoot);
  return config.lanes;
}

/**
 * Get the path to the lane history file
 */
function getHistoryPath(gitRoot: string): string {
  return path.join(gitRoot, ".git", "lanes-history");
}

/**
 * Record a lane switch in history (for lane - support)
 */
export async function recordLaneSwitch(gitRoot: string, fromPath: string): Promise<void> {
  const historyPath = getHistoryPath(gitRoot);
  await Bun.write(historyPath, fromPath);
}

/**
 * Get the previous lane path (for lane - support)
 */
export async function getPreviousLane(gitRoot: string): Promise<string | null> {
  const historyPath = getHistoryPath(gitRoot);
  const file = Bun.file(historyPath);

  if (file.size === 0) {
    return null;
  }

  try {
    const previousPath = (await file.text()).trim();
    const previousExists = Bun.file(previousPath).size > 0;
    return previousExists ? previousPath : null;
  } catch {
    return null;
  }
}
