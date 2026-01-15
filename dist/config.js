import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";
const DEFAULT_CONFIG = {
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
export function getConfigPath(gitRoot) {
    return path.join(gitRoot, ".git", "lanes.json");
}
/**
 * Load the lanes config, creating default if it doesn't exist
 */
export function loadConfig(gitRoot) {
    const configPath = getConfigPath(gitRoot);
    if (!existsSync(configPath)) {
        return { ...DEFAULT_CONFIG };
    }
    try {
        const content = readFileSync(configPath, "utf-8");
        const config = JSON.parse(content);
        // Merge with defaults to handle missing fields
        return {
            ...DEFAULT_CONFIG,
            ...config,
            settings: {
                ...DEFAULT_CONFIG.settings,
                ...config.settings,
            },
        };
    }
    catch {
        return { ...DEFAULT_CONFIG };
    }
}
/**
 * Save the lanes config
 */
export function saveConfig(gitRoot, config) {
    const configPath = getConfigPath(gitRoot);
    writeFileSync(configPath, JSON.stringify(config, null, 2));
}
/**
 * Add a lane to the config
 */
export function addLane(gitRoot, lane) {
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
export function removeLane(gitRoot, laneName) {
    const config = loadConfig(gitRoot);
    config.lanes = config.lanes.filter((l) => l.name !== laneName);
    saveConfig(gitRoot, config);
    return config;
}
/**
 * Get a lane by name
 */
export function getLane(gitRoot, laneName) {
    const config = loadConfig(gitRoot);
    return config.lanes.find((l) => l.name === laneName) || null;
}
/**
 * Get all lanes
 */
export function getAllLanes(gitRoot) {
    const config = loadConfig(gitRoot);
    return config.lanes;
}
