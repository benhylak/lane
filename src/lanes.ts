import { execSync, spawn } from "child_process";
import {
  existsSync,
  mkdirSync,
  copyFileSync,
  readdirSync,
  readFileSync,
  statSync,
  rmSync,
  writeFileSync,
} from "fs";
import path from "path";
import {
  findGitRepo,
  getMainWorktree,
  isWorktree,
  getUntrackedFiles,
  createWorktree,
  removeWorktree,
  listWorktrees,
  branchExists,
  deleteBranch,
  getCurrentBranch,
  GitRepo,
} from "./git.js";
import {
  loadConfig,
  saveConfig,
  addLane,
  removeLane as removeLaneFromConfig,
  getLane,
  getAllLanes,
  Lane,
  BUILD_ARTIFACT_PATTERNS,
} from "./config.js";

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
 * Get the main repo root, even if we're in a worktree or full-copy lane
 */
export function getMainRepoRoot(cwd: string = process.cwd()): string | null {
  // Check if we're in a worktree
  if (isWorktree(cwd)) {
    return getMainWorktree(cwd);
  }

  const repo = findGitRepo(cwd);
  if (!repo) return null;

  // Check if this is a full-copy lane (has .lane-origin marker)
  const originFile = path.join(repo.root, ".lane-origin");
  if (existsSync(originFile)) {
    try {
      const mainRoot = readFileSync(originFile, "utf-8").trim();
      if (existsSync(mainRoot)) {
        return mainRoot;
      }
    } catch {}
  }

  return repo.root;
}

/**
 * Generate the lane directory path
 * Replaces / in lane names with - for valid directory names
 */
export function getLanePath(
  mainRepoRoot: string,
  laneName: string
): string {
  const repoName = path.basename(mainRepoRoot);
  const parentDir = path.dirname(mainRepoRoot);
  // Replace / with - for directory name (git branches can have /)
  const safeName = laneName.replace(/\//g, "-");
  return path.join(parentDir, `${repoName}-lane-${safeName}`);
}

/**
 * Copy a file or directory recursively, skipping patterns
 */
function copyRecursive(
  src: string,
  dest: string,
  skipPatterns: string[]
): void {
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
      copyRecursive(
        path.join(src, entry),
        path.join(dest, entry),
        skipPatterns
      );
    }
  } else {
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
export function copyUntrackedFiles(
  srcRoot: string,
  destRoot: string,
  skipPatterns: string[]
): string[] {
  const untrackedFiles = getUntrackedFiles(srcRoot);
  const copiedFiles: string[] = [];

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
      } catch (e) {
        // Ignore copy errors for individual files
      }
    }
  }

  return copiedFiles;
}

interface PackageManager {
  name: string;
  detectFiles: string[];
  installCmd: string;
}

const PACKAGE_MANAGERS: PackageManager[] = [
  // Node.js - order matters (more specific lockfiles first)
  { name: "bun", detectFiles: ["bun.lockb"], installCmd: "bun install" },
  { name: "pnpm", detectFiles: ["pnpm-lock.yaml"], installCmd: "pnpm install" },
  { name: "yarn", detectFiles: ["yarn.lock"], installCmd: "yarn install" },
  { name: "npm", detectFiles: ["package-lock.json"], installCmd: "npm install" },
  // Fallback for package.json without lockfile
  { name: "npm", detectFiles: ["package.json"], installCmd: "npm install" },

  // Python
  { name: "poetry", detectFiles: ["poetry.lock"], installCmd: "poetry install" },
  { name: "pipenv", detectFiles: ["Pipfile.lock"], installCmd: "pipenv install" },
  { name: "uv", detectFiles: ["uv.lock"], installCmd: "uv sync" },
  { name: "pip", detectFiles: ["requirements.txt"], installCmd: "pip install -r requirements.txt" },
  { name: "pip", detectFiles: ["pyproject.toml"], installCmd: "pip install -e ." },

  // Ruby
  { name: "bundler", detectFiles: ["Gemfile.lock", "Gemfile"], installCmd: "bundle install" },

  // Rust
  { name: "cargo", detectFiles: ["Cargo.lock", "Cargo.toml"], installCmd: "cargo build" },

  // Go
  { name: "go", detectFiles: ["go.sum", "go.mod"], installCmd: "go mod download" },

  // PHP
  { name: "composer", detectFiles: ["composer.lock", "composer.json"], installCmd: "composer install" },

  // Elixir
  { name: "mix", detectFiles: ["mix.lock"], installCmd: "mix deps.get" },

  // .NET
  { name: "dotnet", detectFiles: ["packages.lock.json"], installCmd: "dotnet restore" },
  { name: "nuget", detectFiles: ["packages.config"], installCmd: "nuget restore" },

  // Java
  { name: "gradle", detectFiles: ["gradle.lockfile", "build.gradle", "build.gradle.kts"], installCmd: "./gradlew build --no-daemon" },
  { name: "maven", detectFiles: ["pom.xml"], installCmd: "mvn install -DskipTests" },

  // Swift
  { name: "swift", detectFiles: ["Package.resolved", "Package.swift"], installCmd: "swift package resolve" },
];

/**
 * Detect package managers in use - only one per ecosystem
 */
export function detectPackageManagers(cwd: string): PackageManager[] {
  const detected: PackageManager[] = [];
  const seenEcosystems = new Set<string>();

  // Group managers by ecosystem
  const ecosystems: Record<string, string[]> = {
    node: ["bun", "pnpm", "yarn", "npm"],
    python: ["poetry", "pipenv", "uv", "pip"],
    ruby: ["bundler"],
    rust: ["cargo"],
    go: ["go"],
    php: ["composer"],
    elixir: ["mix"],
    dotnet: ["dotnet", "nuget"],
    java: ["gradle", "maven"],
    swift: ["swift"],
  };

  // Find ecosystem for a manager
  const getEcosystem = (name: string): string | null => {
    for (const [eco, managers] of Object.entries(ecosystems)) {
      if (managers.includes(name)) return eco;
    }
    return null;
  };

  for (const pm of PACKAGE_MANAGERS) {
    const ecosystem = getEcosystem(pm.name);

    // Skip if we already have a manager for this ecosystem
    if (ecosystem && seenEcosystems.has(ecosystem)) continue;

    const hasFiles = pm.detectFiles.some((file) =>
      existsSync(path.join(cwd, file))
    );

    if (hasFiles) {
      detected.push(pm);
      if (ecosystem) seenEcosystems.add(ecosystem);
    }
  }

  return detected;
}

/**
 * Detect and run package manager install
 */
export function runPackageInstall(cwd: string): { ran: boolean; managers: string[]; errors: string[] } {
  const managers = detectPackageManagers(cwd);
  const ranManagers: string[] = [];
  const errors: string[] = [];

  for (const pm of managers) {
    try {
      console.log(`Running ${pm.name}: ${pm.installCmd}`);
      execSync(pm.installCmd, { cwd, stdio: "inherit" });
      ranManagers.push(pm.name);
    } catch (e: any) {
      errors.push(`${pm.name}: ${e.message}`);
    }
  }

  return { ran: ranManagers.length > 0, managers: ranManagers, errors };
}

/**
 * Create a new lane using git worktree + copy untracked files, or full copy
 */
export async function createLane(
  laneName: string,
  options: {
    branch?: string;
    cwd?: string;
  } = {}
): Promise<CreateLaneResult> {
  const cwd = options.cwd || process.cwd();
  const mainRoot = getMainRepoRoot(cwd);

  if (!mainRoot) {
    return { success: false, error: "Not in a git repository" };
  }

  const config = loadConfig(mainRoot);
  const copyMode = config.settings.copyMode;
  const lanePath = getLanePath(mainRoot, laneName);
  const branchName = options.branch || laneName;

  // Check if lane already exists
  if (existsSync(lanePath)) {
    return {
      success: false,
      error: `Lane directory already exists: ${lanePath}`,
    };
  }

  // Check if branch is already used by a worktree
  try {
    const worktrees = execSync("git worktree list --porcelain", {
      cwd: mainRoot,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Check if branch is in use
    const branchInUse = worktrees.includes(`branch refs/heads/${branchName}`);
    if (branchInUse) {
      return {
        success: false,
        error: `Branch "${branchName}" is already used by another worktree. Use a different name or remove the existing worktree.`,
      };
    }
  } catch {}

  process.stderr.write(`\nCreating lane ${laneName}\n`);
  process.stderr.write(`─────────────────────────────────────────\n`);
  process.stderr.write(`Mode: ${copyMode === "full" ? "Full copy" : "Worktree"}\n`);

  // Phase 1: Register lane
  process.stderr.write(`◦ Registering lane...`);
  const lane: Omit<Lane, "createdAt"> = {
    name: laneName,
    path: lanePath,
    branch: branchName,
  };
  addLane(mainRoot, lane);
  process.stderr.write(`\r✓ Registered lane`.padEnd(40) + `\n`);

  if (copyMode === "full") {
    // Full copy mode: rsync with optional excludes for build artifacts
    const skipArtifacts = config.settings.skipBuildArtifacts;
    const excludePatterns = skipArtifacts ? BUILD_ARTIFACT_PATTERNS : [];
    const alwaysExclude = [".DS_Store", "Thumbs.db"];
    const allExcludes = [...excludePatterns, ...alwaysExclude];

    // Build exclude args for rsync
    const excludeArgs = allExcludes.flatMap(p => ["--exclude", p]);

    process.stderr.write(`◦ Copying repository${skipArtifacts ? " (skipping build artifacts)" : ""}...\n`);
    const startTime = Date.now();

    try {
      mkdirSync(lanePath, { recursive: true });

      // Progress polling
      const spinner = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
      let i = 0;
      let lastSize = 0;
      const interval = setInterval(() => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);

        // Get dest size for progress
        try {
          const destDu = execSync(`du -sk "${lanePath}" 2>/dev/null`, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
          const destSizeKB = parseInt(destDu.split("\t")[0], 10) || 0;
          const destMB = (destSizeKB / 1024).toFixed(0);
          const speed = destSizeKB > lastSize ? `${((destSizeKB - lastSize) / 1024 / 0.5).toFixed(0)} MB/s` : "";
          lastSize = destSizeKB;
          process.stderr.write(`\r  ${spinner[i++ % spinner.length]} Copying... ${destMB} MB ${speed} (${elapsed}s)`.padEnd(60));
        } catch {
          process.stderr.write(`\r  ${spinner[i++ % spinner.length]} Copying... ${elapsed}s`);
        }
      }, 500);

      await new Promise<void>((resolve, reject) => {
        const rsync = spawn("rsync", [
          "-a",
          "--delete",
          ...excludeArgs,
          `${mainRoot}/`,
          `${lanePath}/`,
        ], { stdio: "ignore" });
        rsync.on("close", (code) => code === 0 ? resolve() : reject(new Error(`rsync failed with code ${code}`)));
        rsync.on("error", reject);
      });

      clearInterval(interval);

      // Clean up worktree references from copied .git (they belong to original repo)
      const worktreesPath = path.join(lanePath, ".git", "worktrees");
      if (existsSync(worktreesPath)) {
        rmSync(worktreesPath, { recursive: true, force: true });
      }

      // Create and switch to branch
      execSync(`git checkout -B "${branchName}"`, { cwd: lanePath, stdio: "pipe" });

      // Write marker file so we can find the main repo from the lane
      writeFileSync(path.join(lanePath, ".lane-origin"), mainRoot);

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      process.stderr.write(`\r✓ Copied repository in ${elapsed}s`.padEnd(60) + `\n`);

      // Run install if we skipped build artifacts
      if (skipArtifacts && config.settings.autoInstall) {
        const packageManagers = detectPackageManagers(lanePath);
        if (packageManagers.length > 0) {
          process.stderr.write(`◦ Installing dependencies...\n`);
          for (const pm of packageManagers) {
            try {
              process.stderr.write(`  $ ${pm.installCmd}\n`);
              const [cmd, ...args] = pm.installCmd.split(" ");
              await new Promise<void>((resolve, reject) => {
                const proc = spawn(cmd, args, {
                  cwd: lanePath,
                  stdio: [process.stdin, process.stdout, process.stderr],
                  shell: true,
                  env: { ...process.env, FORCE_COLOR: "1" },
                });
                proc.on("close", (code) => code === 0 ? resolve() : reject());
                proc.on("error", reject);
              });
              process.stderr.write(`  ✓ ${pm.name} done\n`);
            } catch {
              process.stderr.write(`  ✗ ${pm.name} failed\n`);
            }
          }
        }
      }
    } catch (e: any) {
      process.stderr.write(`\r✗ Copy failed: ${e.message}`.padEnd(60) + `\n`);
      removeLaneFromConfig(mainRoot, laneName);
      return { success: false, error: e.message };
    }
  } else {
    // Worktree mode (default)
    // Phase 2: Create git worktree
    process.stderr.write(`◦ Creating worktree...`);
    const branchAlreadyExists = branchExists(mainRoot, branchName);
    const worktreeResult = createWorktree(
      mainRoot,
      lanePath,
      branchName,
      !branchAlreadyExists
    );

    if (!worktreeResult.success) {
      process.stderr.write(`\r✗ Worktree failed`.padEnd(40) + `\n`);
      removeLaneFromConfig(mainRoot, laneName);
      return { success: false, error: worktreeResult.error };
    }
    process.stderr.write(`\r✓ Created worktree (branch: ${branchName})`.padEnd(50) + `\n`);

    // Phase 3: Copy untracked/ignored files (fast: just copy what exists)
    const alwaysSkip = [".DS_Store", "Thumbs.db", ".Spotlight-V100", ".Trashes"];
    const skipPatterns = config.settings.skipPatterns || [];
    const buildPatterns = config.settings.skipBuildArtifacts ? BUILD_ARTIFACT_PATTERNS : [];
    const allExcludes = new Set([...alwaysSkip, ...skipPatterns, ...buildPatterns]);

    process.stderr.write(`◦ Copying local files...\n`);
    const copyStartTime = Date.now();

    try {
      // Fast approach: list top-level items and copy untracked ones directly
      const topLevelItems = readdirSync(mainRoot).filter(f => f !== ".git");
      const itemsToCopy: string[] = [];

      for (const item of topLevelItems) {
        // Skip if in exclude list
        if (allExcludes.has(item)) continue;

        // Check if this item has any tracked files
        try {
          const tracked = execSync(`git ls-files "${item}" | head -1`, {
            cwd: mainRoot,
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
          }).trim();

          // If nothing tracked, it's fully untracked - copy it
          if (!tracked) {
            itemsToCopy.push(item);
          }
        } catch {
          // If git command fails, assume untracked
          itemsToCopy.push(item);
        }
      }

      if (itemsToCopy.length === 0) {
        process.stderr.write(`✓ No local files to copy\n`);
      } else {
        process.stderr.write(`  Copying ${itemsToCopy.length} items...\n`);

        // Copy each item with cp -R (fast, native)
        for (const item of itemsToCopy) {
          const src = path.join(mainRoot, item);
          const dest = path.join(lanePath, item);
          process.stderr.write(`    ${item}...`);

          try {
            execSync(`cp -R "${src}" "${dest}"`, { stdio: "pipe" });
            process.stderr.write(` done\n`);
          } catch (e) {
            process.stderr.write(` failed\n`);
          }
        }

        const elapsed = ((Date.now() - copyStartTime) / 1000).toFixed(1);
        process.stderr.write(`✓ Copied ${itemsToCopy.length} items in ${elapsed}s\n`);
      }

      // Also copy nested config files (.env*, *.local, etc.) that git ignores
      process.stderr.write(`  Checking for nested config files...\n`);
      try {
        const configPatterns = [".env", ".env.*", "*.local", ".secret*"];
        const findPattern = configPatterns.map(p => `-name "${p}"`).join(" -o ");
        const nestedConfigs = execSync(
          `find . -type f \\( ${findPattern} \\) ! -path "./.git/*" 2>/dev/null`,
          { cwd: mainRoot, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
        ).trim().split("\n").filter(f => f && f !== ".");

        let copiedNested = 0;
        for (const file of nestedConfigs) {
          const src = path.join(mainRoot, file);
          const dest = path.join(lanePath, file);

          // Only copy if doesn't exist in lane (worktree has tracked files)
          if (existsSync(src) && !existsSync(dest)) {
            const destDir = path.dirname(dest);
            if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
            try {
              execSync(`cp "${src}" "${dest}"`, { stdio: "pipe" });
              copiedNested++;
            } catch {}
          }
        }
        if (copiedNested > 0) {
          process.stderr.write(`  ✓ Copied ${copiedNested} nested config files\n`);
        }
      } catch {}
    } catch (e: any) {
      process.stderr.write(`⚠ Copy failed: ${e.message}\n`);
    }

    // Phase 4: Run package manager install (only in worktree mode)
    if (config.settings.autoInstall) {
      const packageManagers = detectPackageManagers(lanePath);
      if (packageManagers.length > 0) {
        process.stderr.write(`\n◦ Installing dependencies...\n`);
        let succeeded = 0;
        let failed = 0;

        for (const pm of packageManagers) {
          try {
            process.stderr.write(`  $ ${pm.installCmd}\n`);
            const [cmd, ...args] = pm.installCmd.split(" ");
            await new Promise<void>((resolve, reject) => {
              const proc = spawn(cmd, args, {
                cwd: lanePath,
                stdio: [process.stdin, process.stdout, process.stderr],
                shell: true,
                env: {
                  ...process.env,
                  FORCE_COLOR: "1",
                  npm_config_color: "always",
                },
              });
              proc.on("close", (code) => {
                if (code === 0) resolve();
                else reject(new Error(`Exit code ${code}`));
              });
              proc.on("error", reject);
            });
            succeeded++;
            process.stderr.write(`  ✓ ${pm.name} done\n`);
          } catch (err: any) {
            failed++;
            process.stderr.write(`  ✗ ${pm.name} failed\n`);
          }
        }

        if (failed === 0) {
          process.stderr.write(`✓ Dependencies installed\n`);
        } else if (succeeded > 0) {
          process.stderr.write(`⚠ Some dependencies failed to install\n`);
        } else {
          process.stderr.write(`✗ Failed to install dependencies\n`);
        }
      }
    }
  } // end worktree mode

  process.stderr.write(`\n─────────────────────────────────────────\n`);
  process.stderr.write(`✓ Lane "${laneName}" ready at ${lanePath}\n`);
  process.stderr.write(`─────────────────────────────────────────\n`);

  return {
    success: true,
    lane: { ...lane, createdAt: new Date().toISOString() },
  };
}

/**
 * Remove a lane with progress
 */
export async function removeLaneCmd(
  laneName: string,
  options: {
    deleteBranch?: boolean;
    force?: boolean;
    cwd?: string;
    silent?: boolean;
  } = {}
): Promise<RemoveLaneResult> {
  const cwd = options.cwd || process.cwd();
  const mainRoot = getMainRepoRoot(cwd);

  if (!mainRoot) {
    return { success: false, error: "Not in a git repository" };
  }

  const lane = getLane(mainRoot, laneName);

  if (!lane) {
    return { success: false, error: `Lane not found: ${laneName}` };
  }

  // Remove the lane directory - fast approach: rename then delete in background
  if (existsSync(lane.path)) {
    try {
      // Rename to trash path (instant) then delete in background
      const trashPath = `${lane.path}.deleting.${Date.now()}`;
      execSync(`mv "${lane.path}" "${trashPath}"`, { stdio: "pipe" });

      if (!options.silent) {
        process.stderr.write(`✓ Deleted ${laneName}\n`);
      }

      // Delete in background (don't wait)
      spawn("rm", ["-rf", trashPath], { stdio: "ignore", detached: true }).unref();
    } catch (e: any) {
      // Fallback to direct delete if rename fails
      if (!options.silent) {
        process.stderr.write(`◦ Deleting ${laneName}...`);
      }
      try {
        execSync(`rm -rf "${lane.path}"`, { stdio: "pipe" });
        if (!options.silent) {
          process.stderr.write(` done\n`);
        }
      } catch {
        if (!options.silent) {
          process.stderr.write(` failed\n`);
        }
        return { success: false, error: `Failed to remove directory` };
      }
    }
  }

  // Delete branch from main repo if requested
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
export function getLaneForSwitch(
  laneName: string,
  cwd: string = process.cwd()
): { path: string; branch: string } | null {
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
 * List all lanes including the main repo by scanning the filesystem
 */
export function listAllLanes(cwd: string = process.cwd()): Array<{
  name: string;
  path: string;
  branch: string;
  isMain: boolean;
  isCurrent: boolean;
}> {
  const mainRoot = getMainRepoRoot(cwd);

  if (!mainRoot) {
    return [];
  }

  const currentPath = findGitRepo(cwd)?.root || cwd;
  const repo = findGitRepo(mainRoot);
  const repoName = path.basename(mainRoot);
  const parentDir = path.dirname(mainRoot);

  const result: Array<{
    name: string;
    path: string;
    branch: string;
    isMain: boolean;
    isCurrent: boolean;
  }> = [];

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

  // Scan parent directory for lane folders: {reponame}-lane-*
  const lanePrefix = `${repoName}-lane-`;
  try {
    const entries = readdirSync(parentDir);
    for (const entry of entries) {
      if (entry.startsWith(lanePrefix)) {
        const lanePath = path.join(parentDir, entry);
        const laneName = entry.slice(lanePrefix.length);

        // Check it's a directory with a .git
        if (existsSync(path.join(lanePath, ".git"))) {
          const branch = getCurrentBranch(lanePath) || "unknown";
          result.push({
            name: laneName,
            path: lanePath,
            branch,
            isMain: false,
            isCurrent: currentPath === lanePath,
          });
        }
      }
    }
  } catch {}

  return result;
}

/**
 * Find a lane by its current branch
 */
export function findLaneByBranch(
  branchName: string,
  cwd: string = process.cwd()
): { name: string; path: string; branch: string } | null {
  const lanes = listAllLanes(cwd);
  return lanes.find((l) => l.branch === branchName) || null;
}

export interface SyncResult {
  success: boolean;
  copiedFiles: string[];
  error?: string;
}

/**
 * Sync untracked files from main repo to current lane (or specified lane)
 */
export async function syncLane(
  laneName?: string,
  options: {
    cwd?: string;
  } = {}
): Promise<SyncResult> {
  const cwd = options.cwd || process.cwd();
  const mainRoot = getMainRepoRoot(cwd);

  if (!mainRoot) {
    return { success: false, copiedFiles: [], error: "Not in a git repository" };
  }

  const config = loadConfig(mainRoot);
  let targetPath: string;

  if (laneName) {
    // Sync to a specific lane
    const lane = getLane(mainRoot, laneName);
    if (!lane) {
      return { success: false, copiedFiles: [], error: `Lane not found: ${laneName}` };
    }
    targetPath = lane.path;
  } else {
    // Sync to current directory (if it's a lane)
    const currentRepo = findGitRepo(cwd);
    if (!currentRepo || currentRepo.root === mainRoot) {
      return { success: false, copiedFiles: [], error: "Not in a lane. Use 'lane sync <name>' to sync a specific lane." };
    }
    targetPath = currentRepo.root;
  }

  // Copy untracked files from main to target
  const copiedFiles = copyUntrackedFiles(
    mainRoot,
    targetPath,
    config.settings.skipPatterns
  );

  return { success: true, copiedFiles };
}

export interface RenameLaneResult {
  success: boolean;
  newPath?: string;
  error?: string;
}

/**
 * Rename a lane
 */
export async function renameLane(
  oldName: string,
  newName: string,
  options: { cwd?: string } = {}
): Promise<RenameLaneResult> {
  const cwd = options.cwd || process.cwd();
  const mainRoot = getMainRepoRoot(cwd);

  if (!mainRoot) {
    return { success: false, error: "Not in a git repository" };
  }

  const lane = getLane(mainRoot, oldName);
  if (!lane) {
    return { success: false, error: `Lane not found: ${oldName}` };
  }

  const newPath = getLanePath(mainRoot, newName);

  // Check if new path already exists
  if (existsSync(newPath)) {
    return { success: false, error: `Path already exists: ${newPath}` };
  }

  // Rename the directory
  try {
    execSync(`mv "${lane.path}" "${newPath}"`, { stdio: "pipe" });
  } catch (e: any) {
    return { success: false, error: `Failed to rename directory: ${e.message}` };
  }

  // Update config
  const config = loadConfig(mainRoot);
  const laneConfig = config.lanes.find((l) => l.name === oldName);
  if (laneConfig) {
    laneConfig.name = newName;
    laneConfig.path = newPath;
    saveConfig(mainRoot, config);
  }

  return { success: true, newPath };
}

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
export async function smartLane(
  name: string,
  options: {
    cwd?: string;
  } = {}
): Promise<SmartLaneResult> {
  const cwd = options.cwd || process.cwd();
  const mainRoot = getMainRepoRoot(cwd);

  if (!mainRoot) {
    return { success: false, action: "none", error: "Not in a git repository" };
  }

  // 1. Check if it's "main"
  if (name === "main" || name === "origin") {
    return {
      success: true,
      action: "switched",
      path: mainRoot,
    };
  }

  // 2. Check if lane already exists
  const existingLane = getLane(mainRoot, name);
  if (existingLane && existsSync(existingLane.path)) {
    return {
      success: true,
      action: "switched",
      lane: existingLane,
      path: existingLane.path,
    };
  }

  // 3. Create the lane (full copy, will create branch)
  const createResult = await createLane(name, {
    branch: name,
    cwd,
  });

  if (!createResult.success) {
    return {
      success: false,
      action: "none",
      error: createResult.error,
    };
  }

  return {
    success: true,
    action: "created",
    lane: createResult.lane,
    path: createResult.lane?.path,
  };
}
