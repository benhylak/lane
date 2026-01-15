import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";

export interface Lane {
  name: string;
  path: string;
  branch: string;
  createdAt: string;
}

export interface LanesConfig {
  version: number;
  lanes: Lane[];
  settings: {
    skipPatterns: string[];
    autoInstall: boolean;
  };
}

const DEFAULT_CONFIG: LanesConfig = {
  version: 1,
  lanes: [],
  settings: {
    skipPatterns: [
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
    ],
    autoInstall: true,
  },
};

/**
 * Get the path to the lanes config file
 */
export function getConfigPath(gitRoot: string): string {
  return path.join(gitRoot, ".git", "lanes.json");
}

/**
 * Load the lanes config, creating default if it doesn't exist
 */
export function loadConfig(gitRoot: string): LanesConfig {
  const configPath = getConfigPath(gitRoot);

  if (!existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const content = readFileSync(configPath, "utf-8");
    const config = JSON.parse(content) as LanesConfig;

    // Merge with defaults to handle missing fields
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
export function saveConfig(gitRoot: string, config: LanesConfig): void {
  const configPath = getConfigPath(gitRoot);
  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

/**
 * Add a lane to the config
 */
export function addLane(
  gitRoot: string,
  lane: Omit<Lane, "createdAt">
): LanesConfig {
  const config = loadConfig(gitRoot);

  // Remove any existing lane with the same name
  config.lanes = config.lanes.filter((l) => l.name !== lane.name);

  config.lanes.push({
    ...lane,
    createdAt: new Date().toISOString(),
  });

  saveConfig(gitRoot, config);
  return config;
}

/**
 * Remove a lane from the config
 */
export function removeLane(gitRoot: string, laneName: string): LanesConfig {
  const config = loadConfig(gitRoot);
  config.lanes = config.lanes.filter((l) => l.name !== laneName);
  saveConfig(gitRoot, config);
  return config;
}

/**
 * Get a lane by name
 */
export function getLane(gitRoot: string, laneName: string): Lane | null {
  const config = loadConfig(gitRoot);
  return config.lanes.find((l) => l.name === laneName) || null;
}

/**
 * Get all lanes
 */
export function getAllLanes(gitRoot: string): Lane[] {
  const config = loadConfig(gitRoot);
  return config.lanes;
}
