import { execSync } from "child_process";
import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync, rmSync, } from "fs";
import path from "path";
import { findGitRepo, getMainWorktree, isWorktree, getUntrackedFiles, createWorktree, removeWorktree, branchExists, deleteBranch, } from "./git.js";
import { loadConfig, addLane, removeLane as removeLaneFromConfig, getLane, getAllLanes, } from "./config.js";
/**
 * Get the main repo root, even if we're in a worktree
 */
export function getMainRepoRoot(cwd = process.cwd()) {
    if (isWorktree(cwd)) {
        return getMainWorktree(cwd);
    }
    const repo = findGitRepo(cwd);
    return repo?.root || null;
}
/**
 * Generate the lane directory path
 */
export function getLanePath(mainRepoRoot, laneName) {
    const repoName = path.basename(mainRepoRoot);
    const parentDir = path.dirname(mainRepoRoot);
    return path.join(parentDir, `${repoName}-lane-${laneName}`);
}
/**
 * Copy a file or directory recursively, skipping patterns
 */
function copyRecursive(src, dest, skipPatterns) {
    const basename = path.basename(src);
    // Check if this path should be skipped
    if (skipPatterns.some((pattern) => basename === pattern)) {
        return;
    }
    const stat = statSync(src);
    if (stat.isDirectory()) {
        if (!existsSync(dest)) {
            mkdirSync(dest, { recursive: true });
        }
        const entries = readdirSync(src);
        for (const entry of entries) {
            copyRecursive(path.join(src, entry), path.join(dest, entry), skipPatterns);
        }
    }
    else {
        const destDir = path.dirname(dest);
        if (!existsSync(destDir)) {
            mkdirSync(destDir, { recursive: true });
        }
        copyFileSync(src, dest);
    }
}
/**
 * Copy untracked files from source to destination
 */
export function copyUntrackedFiles(srcRoot, destRoot, skipPatterns) {
    const untrackedFiles = getUntrackedFiles(srcRoot);
    const copiedFiles = [];
    for (const file of untrackedFiles) {
        const srcPath = path.join(srcRoot, file);
        const destPath = path.join(destRoot, file);
        // Check if any part of the path matches skip patterns
        const pathParts = file.split(path.sep);
        const shouldSkip = pathParts.some((part) => skipPatterns.includes(part));
        if (shouldSkip) {
            continue;
        }
        if (existsSync(srcPath)) {
            try {
                copyRecursive(srcPath, destPath, skipPatterns);
                copiedFiles.push(file);
            }
            catch (e) {
                // Ignore copy errors for individual files
            }
        }
    }
    return copiedFiles;
}
/**
 * Detect and run package manager install
 */
export function runPackageInstall(cwd) {
    // Node.js
    if (existsSync(path.join(cwd, "package-lock.json"))) {
        try {
            execSync("npm install", { cwd, stdio: "inherit" });
            return { ran: true };
        }
        catch (e) {
            return { ran: true, error: e.message };
        }
    }
    if (existsSync(path.join(cwd, "yarn.lock"))) {
        try {
            execSync("yarn install", { cwd, stdio: "inherit" });
            return { ran: true };
        }
        catch (e) {
            return { ran: true, error: e.message };
        }
    }
    if (existsSync(path.join(cwd, "pnpm-lock.yaml"))) {
        try {
            execSync("pnpm install", { cwd, stdio: "inherit" });
            return { ran: true };
        }
        catch (e) {
            return { ran: true, error: e.message };
        }
    }
    if (existsSync(path.join(cwd, "bun.lockb"))) {
        try {
            execSync("bun install", { cwd, stdio: "inherit" });
            return { ran: true };
        }
        catch (e) {
            return { ran: true, error: e.message };
        }
    }
    // Python
    if (existsSync(path.join(cwd, "requirements.txt"))) {
        try {
            execSync("pip install -r requirements.txt", { cwd, stdio: "inherit" });
            return { ran: true };
        }
        catch (e) {
            return { ran: true, error: e.message };
        }
    }
    if (existsSync(path.join(cwd, "pyproject.toml"))) {
        try {
            execSync("pip install -e .", { cwd, stdio: "inherit" });
            return { ran: true };
        }
        catch (e) {
            return { ran: true, error: e.message };
        }
    }
    return { ran: false };
}
/**
 * Create a new lane
 */
export async function createLane(laneName, options = {}) {
    const cwd = options.cwd || process.cwd();
    const mainRoot = getMainRepoRoot(cwd);
    if (!mainRoot) {
        return { success: false, error: "Not in a git repository" };
    }
    const config = loadConfig(mainRoot);
    const lanePath = getLanePath(mainRoot, laneName);
    const branchName = options.branch || laneName;
    // Check if lane already exists
    if (existsSync(lanePath)) {
        return {
            success: false,
            error: `Lane directory already exists: ${lanePath}`,
        };
    }
    // Check if branch exists (and we're not creating a new one)
    const branchAlreadyExists = branchExists(mainRoot, branchName);
    // Create worktree
    const worktreeResult = createWorktree(mainRoot, lanePath, branchName, !branchAlreadyExists // Create new branch if it doesn't exist
    );
    if (!worktreeResult.success) {
        return { success: false, error: worktreeResult.error };
    }
    // Copy untracked files
    const copiedFiles = copyUntrackedFiles(mainRoot, lanePath, config.settings.skipPatterns);
    // Run package install if enabled and not skipped
    if (config.settings.autoInstall && !options.skipInstall) {
        runPackageInstall(lanePath);
    }
    // Save lane to config
    const lane = {
        name: laneName,
        path: lanePath,
        branch: branchName,
    };
    addLane(mainRoot, lane);
    return {
        success: true,
        lane: {
            ...lane,
            createdAt: new Date().toISOString(),
        },
    };
}
/**
 * Remove a lane
 */
export async function removeLaneCmd(laneName, options = {}) {
    const cwd = options.cwd || process.cwd();
    const mainRoot = getMainRepoRoot(cwd);
    if (!mainRoot) {
        return { success: false, error: "Not in a git repository" };
    }
    const lane = getLane(mainRoot, laneName);
    if (!lane) {
        return { success: false, error: `Lane not found: ${laneName}` };
    }
    // Remove worktree
    if (existsSync(lane.path)) {
        const result = removeWorktree(mainRoot, lane.path);
        if (!result.success) {
            // If worktree removal fails, try to remove the directory directly
            if (options.force) {
                try {
                    rmSync(lane.path, { recursive: true, force: true });
                }
                catch (e) {
                    return { success: false, error: `Failed to remove lane directory: ${e.message}` };
                }
            }
            else {
                return { success: false, error: result.error };
            }
        }
    }
    // Delete branch if requested
    if (options.deleteBranch && lane.branch) {
        deleteBranch(mainRoot, lane.branch, options.force);
    }
    // Remove from config
    removeLaneFromConfig(mainRoot, laneName);
    return { success: true };
}
/**
 * Get lane to switch to
 */
export function getLaneForSwitch(laneName, cwd = process.cwd()) {
    const mainRoot = getMainRepoRoot(cwd);
    if (!mainRoot) {
        return null;
    }
    // Check if it's a known lane
    const lane = getLane(mainRoot, laneName);
    if (lane && existsSync(lane.path)) {
        return { path: lane.path, branch: lane.branch };
    }
    // Check if it's asking for "main" (the original repo)
    if (laneName === "main" || laneName === "origin") {
        const repo = findGitRepo(mainRoot);
        return repo ? { path: mainRoot, branch: repo.currentBranch } : null;
    }
    return null;
}
/**
 * List all lanes including the main repo
 */
export function listAllLanes(cwd = process.cwd()) {
    const mainRoot = getMainRepoRoot(cwd);
    if (!mainRoot) {
        return [];
    }
    const currentPath = findGitRepo(cwd)?.root || cwd;
    const lanes = getAllLanes(mainRoot);
    const repo = findGitRepo(mainRoot);
    const result = [];
    // Add main repo
    if (repo) {
        result.push({
            name: "main",
            path: mainRoot,
            branch: repo.currentBranch,
            isMain: true,
            isCurrent: currentPath === mainRoot,
        });
    }
    // Add lanes
    for (const lane of lanes) {
        result.push({
            name: lane.name,
            path: lane.path,
            branch: lane.branch,
            isMain: false,
            isCurrent: currentPath === lane.path,
        });
    }
    return result;
}
