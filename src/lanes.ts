import {
  existsSync,
  mkdirSync,
  copyFileSync,
  readdirSync,
  readFileSync,
  statSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
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
export async function getMainRepoRoot(cwd: string = process.cwd()): Promise<string | null> {
  // Check if we're in a worktree
  if (await isWorktree(cwd)) {
    return await getMainWorktree(cwd);
  }

  const repo = await findGitRepo(cwd);
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
export async function copyUntrackedFiles(
  srcRoot: string,
  destRoot: string,
  skipPatterns: string[]
): Promise<string[]> {
  const untrackedFiles = await getUntrackedFiles(srcRoot);
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
 * Create symlink from lane to main repo's dependency directory
 * Handles platform differences (junction on Windows, symlink on Unix)
 */
async function createDependencySymlink(
  source: string,
  target: string
): Promise<{ success: boolean; error?: string }> {
  // Check if source exists
  if (!existsSync(source)) {
    return { success: false, error: `Source does not exist: ${source}` };
  }

  // Check if target already exists (could be a symlink from a previous attempt)
  if (existsSync(target)) {
    try {
      // Remove it so we can recreate
      rmSync(target, { recursive: true, force: true });
    } catch (e) {
      return { success: false, error: `Target exists and cannot be removed: ${target}` };
    }
  }

  try {
    // Ensure parent directory exists
    const parentDir = path.dirname(target);
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }

    // Use Bun's symlink API with platform-appropriate type
    // On Windows, use 'junction' for directories; on Unix use 'dir'
    const isWindows = process.platform === "win32";
    const symlinkType = isWindows ? "junction" : "dir";

    await Bun.$`ln -s "${source}" "${target}"`.quiet();

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || String(e) };
  }
}

/**
 * Create symlinks for dependency directories from main repo to lane
 */
async function symlinkDependencies(
  mainRoot: string,
  lanePath: string
): Promise<{ success: boolean; symlinked: string[]; errors: string[] }> {
  const dependencyDirs = [
    "node_modules",
    ".venv",
    "venv",
    "vendor",
    "target",
    ".next",
    ".nuxt",
    ".turbo",
    "Pods",
  ];

  const symlinked: string[] = [];
  const errors: string[] = [];

  for (const dir of dependencyDirs) {
    const source = path.join(mainRoot, dir);
    const target = path.join(lanePath, dir);

    const result = await createDependencySymlink(source, target);

    if (result.success) {
      symlinked.push(dir);
    } else if (result.error) {
      errors.push(`${dir}: ${result.error}`);
    }
  }

  return { success: symlinked.length > 0, symlinked, errors };
}

/**
 * Detect and run package manager install
 */
export async function runPackageInstall(cwd: string): Promise<{ ran: boolean; managers: string[]; errors: string[] }> {
  const managers = detectPackageManagers(cwd);
  const ranManagers: string[] = [];
  const errors: string[] = [];

  for (const pm of managers) {
    try {
      console.log(`Running ${pm.name}: ${pm.installCmd}`);
      const [cmd, ...args] = pm.installCmd.split(" ");
      const proc = Bun.spawn([cmd, ...args], {
        cwd,
        stdout: "inherit",
        stderr: "inherit",
        stdin: "inherit",
      });
      const exitCode = await proc.exited;
      if (exitCode !== 0) {
        throw new Error(`Process exited with code ${exitCode}`);
      }
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
  const mainRoot = await getMainRepoRoot(cwd);

  if (!mainRoot) {
    return { success: false, error: "Not in a git repository" };
  }

  const config = await loadConfig(mainRoot);
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
    const worktrees = await Bun.$`git worktree list --porcelain`.cwd(mainRoot).quiet().text();

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
  await addLane(mainRoot, lane);
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
      const interval = setInterval(async () => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);

        // Get dest size for progress
        try {
          const destDu = await Bun.$`du -sk "${lanePath}"`.quiet().text();
          const destSizeKB = parseInt(destDu.split("\t")[0], 10) || 0;
          const destMB = (destSizeKB / 1024).toFixed(0);
          const speed = destSizeKB > lastSize ? `${((destSizeKB - lastSize) / 1024 / 0.5).toFixed(0)} MB/s` : "";
          lastSize = destSizeKB;
          process.stderr.write(`\r  ${spinner[i++ % spinner.length]} Copying... ${destMB} MB ${speed} (${elapsed}s)`.padEnd(60));
        } catch {
          process.stderr.write(`\r  ${spinner[i++ % spinner.length]} Copying... ${elapsed}s`);
        }
      }, 500);

      const rsync = Bun.spawn([
        "rsync",
        "-a",
        "--delete",
        ...excludeArgs,
        `${mainRoot}/`,
        `${lanePath}/`,
      ], {
        stdout: "ignore",
        stderr: "ignore",
      });
      const exitCode = await rsync.exited;
      if (exitCode !== 0) {
        throw new Error(`rsync failed with code ${exitCode}`);
      }

      clearInterval(interval);

      // Clean up worktree references from copied .git (they belong to original repo)
      const worktreesPath = path.join(lanePath, ".git", "worktrees");
      if (existsSync(worktreesPath)) {
        rmSync(worktreesPath, { recursive: true, force: true });
      }

      // Create and switch to branch
      await Bun.$`git checkout -B "${branchName}"`.cwd(lanePath).quiet();

      // Write marker file so we can find the main repo from the lane
      writeFileSync(path.join(lanePath, ".lane-origin"), mainRoot);

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      process.stderr.write(`\r✓ Copied repository in ${elapsed}s`.padEnd(60) + `\n`);

      // Try to symlink dependencies if enabled
      if (config.settings.symlinkDeps) {
        process.stderr.write(`◦ Symlinking dependencies...\n`);
        const symlinkResult = await symlinkDependencies(mainRoot, lanePath);

        if (symlinkResult.success) {
          process.stderr.write(`  ✓ Symlinked: ${symlinkResult.symlinked.join(", ")}\n`);
          // Log any non-fatal errors
          if (symlinkResult.errors.length > 0) {
            for (const err of symlinkResult.errors) {
              process.stderr.write(`  ⚠ ${err}\n`);
            }
          }
        } else {
          // Symlink failed completely, fall back to package install
          process.stderr.write(`  ✗ Symlinking failed, falling back to package install\n`);
          for (const err of symlinkResult.errors) {
            process.stderr.write(`    ${err}\n`);
          }

          // Run package install as fallback
          if (config.settings.autoInstall) {
            const packageManagers = detectPackageManagers(lanePath);
            if (packageManagers.length > 0) {
              process.stderr.write(`◦ Installing dependencies (fallback)...\n`);
              for (const pm of packageManagers) {
                try {
                  process.stderr.write(`  $ ${pm.installCmd}\n`);
                  const [cmd, ...args] = pm.installCmd.split(" ");
                  const proc = Bun.spawn([cmd, ...args], {
                    cwd: lanePath,
                    stdout: "inherit",
                    stderr: "inherit",
                    stdin: "inherit",
                    env: { ...process.env, FORCE_COLOR: "1" },
                  });
                  const exitCode = await proc.exited;
                  if (exitCode !== 0) {
                    throw new Error(`Exit code ${exitCode}`);
                  }
                  process.stderr.write(`  ✓ ${pm.name} done\n`);
                } catch {
                  process.stderr.write(`  ✗ ${pm.name} failed\n`);
                }
              }
            }
          }
        }
      } else if (skipArtifacts && config.settings.autoInstall) {
        const packageManagers = detectPackageManagers(lanePath);
        if (packageManagers.length > 0) {
          process.stderr.write(`◦ Installing dependencies...\n`);
          for (const pm of packageManagers) {
            try {
              process.stderr.write(`  $ ${pm.installCmd}\n`);
              const [cmd, ...args] = pm.installCmd.split(" ");
              const proc = Bun.spawn([cmd, ...args], {
                cwd: lanePath,
                stdout: "inherit",
                stderr: "inherit",
                stdin: "inherit",
                env: { ...process.env, FORCE_COLOR: "1" },
              });
              const exitCode = await proc.exited;
              if (exitCode !== 0) {
                throw new Error(`Exit code ${exitCode}`);
              }
              process.stderr.write(`  ✓ ${pm.name} done\n`);
            } catch {
              process.stderr.write(`  ✗ ${pm.name} failed\n`);
            }
          }
        }
      }
    } catch (e: any) {
      process.stderr.write(`\r✗ Copy failed: ${e.message}`.padEnd(60) + `\n`);
      await removeLaneFromConfig(mainRoot, laneName);
      return { success: false, error: e.message };
    }
  } else {
    // Worktree mode (default)
    // Phase 2: Create git worktree
    process.stderr.write(`◦ Creating worktree...`);
    const branchAlreadyExists = await branchExists(mainRoot, branchName);
    const worktreeResult = await createWorktree(
      mainRoot,
      lanePath,
      branchName,
      !branchAlreadyExists
    );

    if (!worktreeResult.success) {
      process.stderr.write(`\r✗ Worktree failed`.padEnd(40) + `\n`);
      await removeLaneFromConfig(mainRoot, laneName);
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

        // Check if this item is ignored by .gitignore
        try {
          const ignoredText = await Bun.$`git check-ignore --quiet "${item}"`.cwd(mainRoot).quiet().text();
          // If git check-ignore succeeds (exit code 0), the file is ignored - skip it
          if (ignoredText === "") {
            continue;
          }
        } catch {
          // Exit code 1 means file is NOT ignored, continue checking
        }

        // Check if this item has any tracked files
        try {
          const trackedText = await Bun.$`git ls-files "${item}" | head -1`.cwd(mainRoot).quiet().text();
          const tracked = trackedText.trim();

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
            await Bun.$`cp -R "${src}" "${dest}"`.quiet();
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
        const proc = Bun.spawn(["find", ".", "-type", "f", "(", ...findPattern.split(" "), "!", "-path", "./.git/*"], {
          cwd: mainRoot,
          stdout: "pipe",
          stderr: "ignore",
        });
        await proc.exited;
        const nestedConfigs = (await new Response(proc.stdout).text()).trim().split("\n").filter(f => f && f !== ".");

        let copiedNested = 0;
        for (const file of nestedConfigs) {
          const src = path.join(mainRoot, file);
          const dest = path.join(lanePath, file);

          // Only copy if doesn't exist in lane (worktree has tracked files)
          if (existsSync(src) && !existsSync(dest)) {
            const destDir = path.dirname(dest);
            if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
            try {
              const cpProc = Bun.spawn(["cp", src, dest], { stdout: "ignore", stderr: "ignore" });
              await cpProc.exited;
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

    // Phase 4: Handle dependencies - try symlinking if enabled, otherwise run install
    if (config.settings.symlinkDeps) {
      process.stderr.write(`\n◦ Symlinking dependencies...\n`);
      const symlinkResult = await symlinkDependencies(mainRoot, lanePath);

      if (symlinkResult.success) {
        process.stderr.write(`  ✓ Symlinked: ${symlinkResult.symlinked.join(", ")}\n`);
        // Log any non-fatal errors
        if (symlinkResult.errors.length > 0) {
          for (const err of symlinkResult.errors) {
            process.stderr.write(`  ⚠ ${err}\n`);
          }
        }
      } else {
        // Symlink failed completely, fall back to package install
        process.stderr.write(`  ✗ Symlinking failed, falling back to package install\n`);
        for (const err of symlinkResult.errors) {
          process.stderr.write(`    ${err}\n`);
        }

        // Run package install as fallback
        if (config.settings.autoInstall) {
          const packageManagers = detectPackageManagers(lanePath);
          if (packageManagers.length > 0) {
            process.stderr.write(`\n◦ Installing dependencies (fallback)...\n`);
            for (const pm of packageManagers) {
              try {
                process.stderr.write(`  $ ${pm.installCmd}\n`);
                const [cmd, ...args] = pm.installCmd.split(" ");
                const proc = Bun.spawn([cmd, ...args], {
                  cwd: lanePath,
                  stdout: "inherit",
                  stderr: "inherit",
                  stdin: "inherit",
                  env: {
                    ...process.env,
                    FORCE_COLOR: "1",
                    npm_config_color: "always",
                  },
                });
                const exitCode = await proc.exited;
                if (exitCode === 0) {
                  process.stderr.write(`  ✓ ${pm.name} done\n`);
                } else {
                  process.stderr.write(`  ✗ ${pm.name} failed\n`);
                }
              } catch (err: any) {
                process.stderr.write(`  ✗ ${pm.name} failed\n`);
              }
            }
          }
        }
      }
    } else if (config.settings.autoInstall) {
      const packageManagers = detectPackageManagers(lanePath);
      if (packageManagers.length > 0) {
        process.stderr.write(`\n◦ Installing dependencies...\n`);
        let succeeded = 0;
        let failed = 0;

        for (const pm of packageManagers) {
          try {
            process.stderr.write(`  $ ${pm.installCmd}\n`);
            const [cmd, ...args] = pm.installCmd.split(" ");
            const proc = Bun.spawn([cmd, ...args], {
              cwd: lanePath,
              stdout: "inherit",
              stderr: "inherit",
              stdin: "inherit",
              env: {
                ...process.env,
                FORCE_COLOR: "1",
                npm_config_color: "always",
              },
            });
            const exitCode = await proc.exited;
            if (exitCode === 0) {
              succeeded++;
              process.stderr.write(`  ✓ ${pm.name} done\n`);
            } else {
              failed++;
              process.stderr.write(`  ✗ ${pm.name} failed\n`);
            }
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
  const mainRoot = await getMainRepoRoot(cwd);

  if (!mainRoot) {
    return { success: false, error: "Not in a git repository" };
  }

  const lane = await getLane(mainRoot, laneName);

  if (!lane) {
    return { success: false, error: `Lane not found: ${laneName}` };
  }

  // Remove the lane directory - fast approach: rename then delete in background
  if (existsSync(lane.path)) {
    try {
      // Rename to trash path (instant) then delete in background
      const trashPath = `${lane.path}.deleting.${Date.now()}`;
      await Bun.$`mv "${lane.path}" "${trashPath}"`.quiet();

      if (!options.silent) {
        process.stderr.write(`✓ Deleted ${laneName}\n`);
      }

      // Delete in background (don't wait)
      Bun.spawn(["rm", "-rf", trashPath], { stdout: "ignore", stderr: "ignore", stdin: "ignore" });
    } catch (e: any) {
      // Fallback to direct delete if rename fails
      if (!options.silent) {
        process.stderr.write(`◦ Deleting ${laneName}...`);
      }
      try {
        await Bun.$`rm -rf "${lane.path}"`.quiet();
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
  await removeLaneFromConfig(mainRoot, laneName);

  return { success: true };
}

/**
 * Get lane to switch to
 */
export async function getLaneForSwitch(
  laneName: string,
  cwd: string = process.cwd()
): Promise<{ path: string; branch: string } | null> {
  const mainRoot = await getMainRepoRoot(cwd);

  if (!mainRoot) {
    return null;
  }

  // Check if it's a known lane
  const lane = await getLane(mainRoot, laneName);
  if (lane && existsSync(lane.path)) {
    return { path: lane.path, branch: lane.branch };
  }

  // Check if it's asking for "main" (the original repo)
  if (laneName === "main" || laneName === "origin") {
    const repo = await findGitRepo(mainRoot);
    return repo ? { path: mainRoot, branch: repo.currentBranch } : null;
  }

  return null;
}

/**
 * List all lanes including the main repo
 */
export async function listAllLanes(cwd: string = process.cwd()): Promise<Array<{
  name: string;
  path: string;
  branch: string;
  isMain: boolean;
  isCurrent: boolean;
}>> {
  const mainRoot = await getMainRepoRoot(cwd);

  if (!mainRoot) {
    return [];
  }

  const currentRepo = await findGitRepo(cwd);
  const currentPath = currentRepo?.root || cwd;
  const lanes = await getAllLanes(mainRoot);
  const repo = await findGitRepo(mainRoot);

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

  // Add lanes - get ACTUAL current branch from each lane directory
  for (const lane of lanes) {
    // Get the actual current branch if the lane directory exists
    const actualBranch = existsSync(lane.path)
      ? (await getCurrentBranch(lane.path)) || lane.branch
      : lane.branch;

    result.push({
      name: lane.name,
      path: lane.path,
      branch: actualBranch,
      isMain: false,
      isCurrent: currentPath === lane.path,
    });
  }

  return result;
}

/**
 * Find a lane by its current branch
 */
export async function findLaneByBranch(
  branchName: string,
  cwd: string = process.cwd()
): Promise<{ name: string; path: string; branch: string } | null> {
  const lanes = await listAllLanes(cwd);
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
  const mainRoot = await getMainRepoRoot(cwd);

  if (!mainRoot) {
    return { success: false, copiedFiles: [], error: "Not in a git repository" };
  }

  const config = await loadConfig(mainRoot);
  let targetPath: string;

  if (laneName) {
    // Sync to a specific lane
    const lane = await getLane(mainRoot, laneName);
    if (!lane) {
      return { success: false, copiedFiles: [], error: `Lane not found: ${laneName}` };
    }
    targetPath = lane.path;
  } else {
    // Sync to current directory (if it's a lane)
    const currentRepo = await findGitRepo(cwd);
    if (!currentRepo || currentRepo.root === mainRoot) {
      return { success: false, copiedFiles: [], error: "Not in a lane. Use 'lane sync <name>' to sync a specific lane." };
    }
    targetPath = currentRepo.root;
  }

  // Copy untracked files from main to target
  const copiedFiles = await copyUntrackedFiles(
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
  const mainRoot = await getMainRepoRoot(cwd);

  if (!mainRoot) {
    return { success: false, error: "Not in a git repository" };
  }

  const lane = await getLane(mainRoot, oldName);
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
    await Bun.$`mv "${lane.path}" "${newPath}"`.quiet();
  } catch (e: any) {
    return { success: false, error: `Failed to rename directory: ${e.message}` };
  }

  // Update config
  const config = await loadConfig(mainRoot);
  const laneConfig = config.lanes.find((l) => l.name === oldName);
  if (laneConfig) {
    laneConfig.name = newName;
    laneConfig.path = newPath;
    await saveConfig(mainRoot, config);
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
  const mainRoot = await getMainRepoRoot(cwd);

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
  const existingLane = await getLane(mainRoot, name);
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
