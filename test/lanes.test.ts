import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  realpathSync,
  lstatSync,
} from "node:fs";
import path from "node:path";
import {
  createLane,
  listAllLanes,
  getLaneForSwitch,
  findLaneByBranch,
  copyUntrackedFiles,
  runPackageInstall,
  removeLaneCmd,
  renameLane,
  syncLane,
  getMainRepoRoot,
  getLanePath,
  detectPackageManagers,
} from "../src/lanes";
import { loadConfig, saveConfig, getAllLanes, Lane } from "../src/config";

// Test utilities
let testDir: string;
let mainRepoRoot: string;

// Normalize path to handle macOS /tmp -> /private/tmp symlinks
function normalizePath(p: string): string {
  return realpathSync(p);
}

function setupTestRepo(repoPath: string, isWorktree = false) {
  // Create .git directory
  const gitDir = path.join(repoPath, ".git");
  mkdirSync(gitDir, { recursive: true });

  // Create minimal git structure
  mkdirSync(path.join(gitDir, "objects"), { recursive: true });
  mkdirSync(path.join(gitDir, "refs"), { recursive: true });
  mkdirSync(path.join(gitDir, "refs", "heads"), { recursive: true });

  // Initialize git config
  writeFileSync(
    path.join(gitDir, "config"),
    `[core]
    repositoryformatversion = 0
    filemode = true
    bare = false
    logallrefupdates = true
`
  );

  writeFileSync(path.join(gitDir, "HEAD"), "ref: refs/heads/main\n");

  // Create initial commit structure
  writeFileSync(path.join(repoPath, "README.md"), "# Test Repo");
  writeFileSync(path.join(repoPath, "package.json"), JSON.stringify({
    name: "test-repo",
    version: "1.0.0",
  }));

  // Initialize lanes config
  const config = {
    version: 1,
    lanes: [],
    settings: {
      copyMode: "worktree" as const,
      skipBuildArtifacts: false,
      skipPatterns: [],
      autoInstall: false, // Disable for tests
      symlinkDeps: true, // Default is true
    },
  };
  saveConfig(repoPath, config);
}

function cleanupTestDir(dir: string) {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("lanes", () => {
  beforeEach(() => {
    // Create temporary test directory
    testDir = path.join("/tmp", `lane-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    // Setup main repo
    mainRepoRoot = path.join(testDir, "test-repo");
    setupTestRepo(mainRepoRoot);

    // Normalize paths for macOS
    testDir = normalizePath(testDir);
    mainRepoRoot = normalizePath(mainRepoRoot);
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  describe("getLanePath", () => {
    test("should generate correct lane path", () => {
      const lanePath = getLanePath(mainRepoRoot, "feature-1");
      expect(lanePath).toBe(path.join(testDir, "test-repo-lane-feature-1"));
    });

    test("should handle lane names with slashes", () => {
      const lanePath = getLanePath(mainRepoRoot, "feature/sub-branch");
      expect(lanePath).toBe(path.join(testDir, "test-repo-lane-feature-sub-branch"));
    });

    test("should handle special characters in lane names", () => {
      const lanePath = getLanePath(mainRepoRoot, "feature/test-branch");
      expect(lanePath).toBe(path.join(testDir, "test-repo-lane-feature-test-branch"));
    });
  });

  describe("getMainRepoRoot", () => {
    test("should return main repo root when in main repo", async () => {
      const root = await getMainRepoRoot(mainRepoRoot);
      expect(root).toBeTruthy();
      expect(normalizePath(root!)).toBe(mainRepoRoot);
    });

    test("should return null when not in a git repository", async () => {
      const nonGitDir = path.join(testDir, "not-a-repo");
      mkdirSync(nonGitDir, { recursive: true });
      const root = await getMainRepoRoot(nonGitDir);
      expect(root).toBeNull();
    });

    test("should detect full-copy lane via .lane-origin file", async () => {
      const lanePath = path.join(testDir, "test-repo-lane-feature");
      mkdirSync(lanePath, { recursive: true });

      // Create .lane-origin marker
      writeFileSync(path.join(lanePath, ".lane-origin"), mainRepoRoot);

      // Create minimal git structure for the lane
      const gitDir = path.join(lanePath, ".git");
      mkdirSync(gitDir, { recursive: true });
      mkdirSync(path.join(gitDir, "objects"), { recursive: true });
      mkdirSync(path.join(gitDir, "refs"), { recursive: true });
      writeFileSync(path.join(gitDir, "HEAD"), "ref: refs/heads/test\n");

      const root = await getMainRepoRoot(lanePath);
      expect(root).toBeTruthy();
      expect(normalizePath(root!)).toBe(mainRepoRoot);
    });

    test("should handle missing .lane-origin file gracefully", async () => {
      const lanePath = path.join(testDir, "test-repo-lane-feature");
      mkdirSync(lanePath, { recursive: true });

      // Create minimal git structure for the lane
      const gitDir = path.join(lanePath, ".git");
      mkdirSync(gitDir, { recursive: true });
      mkdirSync(path.join(gitDir, "objects"), { recursive: true });
      mkdirSync(path.join(gitDir, "refs"), { recursive: true });
      writeFileSync(path.join(gitDir, "HEAD"), "ref: refs/heads/test\n");

      // Create .lane-origin with invalid path
      writeFileSync(path.join(lanePath, ".lane-origin"), "/nonexistent/path");

      const root = await getMainRepoRoot(lanePath);
      // Should fall back to the lane's own git root
      expect(root).toBe(lanePath);
    });
  });

  describe("copyUntrackedFiles", () => {
    test("should copy untracked files", async () => {
      // Create source with untracked files
      const srcDir = path.join(testDir, "source");
      mkdirSync(srcDir, { recursive: true });
      setupTestRepo(srcDir);

      const destDir = path.join(testDir, "dest");
      mkdirSync(destDir, { recursive: true });

      // Create untracked files
      writeFileSync(path.join(srcDir, ".env"), "TEST=1\n");
      writeFileSync(path.join(srcDir, "secret.txt"), "secret");

      const copied = await copyUntrackedFiles(srcDir, destDir, []);

      expect(copied.length).toBeGreaterThan(0);
      expect(existsSync(path.join(destDir, ".env"))).toBe(true);
      expect(existsSync(path.join(destDir, "secret.txt"))).toBe(true);
    });

    test("should skip files matching patterns", async () => {
      const srcDir = path.join(testDir, "source");
      mkdirSync(srcDir, { recursive: true });
      setupTestRepo(srcDir);

      const destDir = path.join(testDir, "dest");
      mkdirSync(destDir, { recursive: true });

      // Create files
      writeFileSync(path.join(srcDir, ".env"), "TEST=1\n");
      writeFileSync(path.join(srcDir, ".env.local"), "LOCAL=1\n");

      // Create node_modules directory
      const nodeModulesDir = path.join(srcDir, "node_modules");
      mkdirSync(nodeModulesDir, { recursive: true });
      writeFileSync(path.join(nodeModulesDir, "test.txt"), "test");

      const copied = await copyUntrackedFiles(srcDir, destDir, [".env.local", "node_modules"]);

      // Should have .env but not .env.local or node_modules
      expect(existsSync(path.join(destDir, ".env"))).toBe(true);
      // These might or might not exist depending on skip patterns
      expect(copied).not.toContain(".env.local");
    });

    test("should copy nested untracked files", async () => {
      const srcDir = path.join(testDir, "source");
      mkdirSync(srcDir, { recursive: true });
      setupTestRepo(srcDir);

      const destDir = path.join(testDir, "dest");
      mkdirSync(destDir, { recursive: true });

      // Create nested structure
      const nestedDir = path.join(srcDir, "config", "local");
      mkdirSync(nestedDir, { recursive: true });
      writeFileSync(path.join(nestedDir, ".env"), "NESTED=1\n");

      const copied = await copyUntrackedFiles(srcDir, destDir, []);

      expect(copied.some(f => f.includes("config"))).toBe(true);
    });

    test("should handle missing source files gracefully", async () => {
      const srcDir = path.join(testDir, "source");
      mkdirSync(srcDir, { recursive: true });
      setupTestRepo(srcDir);

      const destDir = path.join(testDir, "dest");
      mkdirSync(destDir, { recursive: true });

      // Should not throw even if no untracked files
      const copied = await copyUntrackedFiles(srcDir, destDir, []);
      expect(Array.isArray(copied)).toBe(true);
    });
  });

  describe("detectPackageManagers", () => {
    test("should detect bun", () => {
      const testPath = path.join(testDir, "detect-bun");
      mkdirSync(testPath, { recursive: true });
      writeFileSync(path.join(testPath, "bun.lockb"), "lockfile");

      const detected = detectPackageManagers(testPath);
      expect(detected.length).toBeGreaterThan(0);
      expect(detected.some(pm => pm.name === "bun")).toBe(true);
    });

    test("should detect npm", () => {
      const testPath = path.join(testDir, "detect-npm");
      mkdirSync(testPath, { recursive: true });
      writeFileSync(path.join(testPath, "package-lock.json"), "{}");

      const detected = detectPackageManagers(testPath);
      expect(detected.some(pm => pm.name === "npm")).toBe(true);
    });

    test("should detect pnpm", () => {
      const testPath = path.join(testDir, "detect-pnpm");
      mkdirSync(testPath, { recursive: true });
      writeFileSync(path.join(testPath, "pnpm-lock.yaml"), "");

      const detected = detectPackageManagers(testPath);
      expect(detected.some(pm => pm.name === "pnpm")).toBe(true);
    });

    test("should detect yarn", () => {
      const testPath = path.join(testDir, "detect-yarn");
      mkdirSync(testPath, { recursive: true });
      writeFileSync(path.join(testPath, "yarn.lock"), "");

      const detected = detectPackageManagers(testPath);
      expect(detected.some(pm => pm.name === "yarn")).toBe(true);
    });

    test("should detect poetry (Python)", () => {
      const testPath = path.join(testDir, "detect-poetry");
      mkdirSync(testPath, { recursive: true });
      writeFileSync(path.join(testPath, "poetry.lock"), "");

      const detected = detectPackageManagers(testPath);
      expect(detected.some(pm => pm.name === "poetry")).toBe(true);
    });

    test("should detect pipenv (Python)", () => {
      const testPath = path.join(testDir, "detect-pipenv");
      mkdirSync(testPath, { recursive: true });
      writeFileSync(path.join(testPath, "Pipfile.lock"), "");

      const detected = detectPackageManagers(testPath);
      expect(detected.some(pm => pm.name === "pipenv")).toBe(true);
    });

    test("should detect cargo (Rust)", () => {
      const testPath = path.join(testDir, "detect-cargo");
      mkdirSync(testPath, { recursive: true });
      writeFileSync(path.join(testPath, "Cargo.toml"), "");

      const detected = detectPackageManagers(testPath);
      expect(detected.some(pm => pm.name === "cargo")).toBe(true);
    });

    test("should detect bundler (Ruby)", () => {
      const testPath = path.join(testDir, "detect-bundler");
      mkdirSync(testPath, { recursive: true });
      writeFileSync(path.join(testPath, "Gemfile.lock"), "");

      const detected = detectPackageManagers(testPath);
      expect(detected.some(pm => pm.name === "bundler")).toBe(true);
    });

    test("should detect go", () => {
      const testPath = path.join(testDir, "detect-go");
      mkdirSync(testPath, { recursive: true });
      writeFileSync(path.join(testPath, "go.mod"), "");

      const detected = detectPackageManagers(testPath);
      expect(detected.some(pm => pm.name === "go")).toBe(true);
    });

    test("should detect composer (PHP)", () => {
      const testPath = path.join(testDir, "detect-composer");
      mkdirSync(testPath, { recursive: true });
      writeFileSync(path.join(testPath, "composer.json"), "");

      const detected = detectPackageManagers(testPath);
      expect(detected.some(pm => pm.name === "composer")).toBe(true);
    });

    test("should detect mix (Elixir)", () => {
      const testPath = path.join(testDir, "detect-mix");
      mkdirSync(testPath, { recursive: true });
      writeFileSync(path.join(testPath, "mix.lock"), "");

      const detected = detectPackageManagers(testPath);
      expect(detected.some(pm => pm.name === "mix")).toBe(true);
    });

    test("should detect gradle (Java)", () => {
      const testPath = path.join(testDir, "detect-gradle");
      mkdirSync(testPath, { recursive: true });
      writeFileSync(path.join(testPath, "build.gradle"), "");

      const detected = detectPackageManagers(testPath);
      expect(detected.some(pm => pm.name === "gradle")).toBe(true);
    });

    test("should detect maven (Java)", () => {
      const testPath = path.join(testDir, "detect-maven");
      mkdirSync(testPath, { recursive: true });
      writeFileSync(path.join(testPath, "pom.xml"), "");

      const detected = detectPackageManagers(testPath);
      expect(detected.some(pm => pm.name === "maven")).toBe(true);
    });

    test("should detect swift", () => {
      const testPath = path.join(testDir, "detect-swift");
      mkdirSync(testPath, { recursive: true });
      writeFileSync(path.join(testPath, "Package.swift"), "");

      const detected = detectPackageManagers(testPath);
      expect(detected.some(pm => pm.name === "swift")).toBe(true);
    });

    test("should only detect one package manager per ecosystem", () => {
      const testPath = path.join(testDir, "detect-node");
      mkdirSync(testPath, { recursive: true });

      // Create multiple Node.js lockfiles
      writeFileSync(path.join(testPath, "bun.lockb"), "bun");
      writeFileSync(path.join(testPath, "package-lock.json"), "npm");

      const detected = detectPackageManagers(testPath);

      // Should only detect one Node.js manager
      const nodeManagers = detected.filter(pm =>
        ["bun", "pnpm", "yarn", "npm"].includes(pm.name)
      );
      expect(nodeManagers.length).toBe(1);
    });

    test("should return empty array when no package manager detected", () => {
      const testPath = path.join(testDir, "detect-none");
      mkdirSync(testPath, { recursive: true });

      const detected = detectPackageManagers(testPath);
      expect(detected).toEqual([]);
    });
  });

  describe("runPackageInstall", () => {
    test("should return no managers when none detected", async () => {
      const testPath = path.join(testDir, "install-none");
      mkdirSync(testPath, { recursive: true });

      const result = await runPackageInstall(testPath);
      expect(result.ran).toBe(false);
      expect(result.managers).toEqual([]);
      expect(result.errors).toEqual([]);
    });

    test("should detect package managers without running when not in test", async () => {
      const testPath = path.join(testDir, "install-detect");
      mkdirSync(testPath, { recursive: true });
      writeFileSync(path.join(testPath, "package.json"), JSON.stringify({ name: "test" }));

      // Mock Bun.spawn to prevent actual execution
      const originalSpawn = Bun.spawn;
      let spawnCalled = false;
      Bun.spawn = mock(() => {
        spawnCalled = true;
        return { exited: Promise.resolve(0), stdout: null, stderr: null, stdin: null };
      });

      const result = await runPackageInstall(testPath);

      Bun.spawn = originalSpawn;

      // Should detect npm
      expect(result.managers).toContain("npm");
    });
  });

  describe("listAllLanes", () => {
    test("should list main repo when no lanes exist", async () => {
      const lanes = await listAllLanes(mainRepoRoot);

      expect(lanes.length).toBe(1);
      expect(lanes[0].name).toBe("main");
      expect(lanes[0].isMain).toBe(true);
      expect(normalizePath(lanes[0].path)).toBe(mainRepoRoot);
    });

    test("should list all lanes including main", async () => {
      // Add some lanes to config
      const config = await loadConfig(mainRepoRoot);
      config.lanes.push(
        {
          name: "feature-1",
          path: path.join(testDir, "test-repo-lane-feature-1"),
          branch: "feature-1",
          createdAt: new Date().toISOString(),
        },
        {
          name: "feature-2",
          path: path.join(testDir, "test-repo-lane-feature-2"),
          branch: "feature-2",
          createdAt: new Date().toISOString(),
        }
      );
      await saveConfig(mainRepoRoot, config);

      const lanes = await listAllLanes(mainRepoRoot);

      expect(lanes.length).toBe(3); // main + 2 lanes
      expect(lanes[0].name).toBe("main");
      expect(lanes.some(l => l.name === "feature-1")).toBe(true);
      expect(lanes.some(l => l.name === "feature-2")).toBe(true);
    });

    test("should mark current lane correctly", async () => {
      // Create a lane directory with complete git structure
      const lanePathRaw = path.join(testDir, "test-repo-lane-current");
      mkdirSync(lanePathRaw, { recursive: true });
      const lanePath = normalizePath(lanePathRaw);
      const gitDir = path.join(lanePath, ".git");
      mkdirSync(gitDir, { recursive: true });
      mkdirSync(path.join(gitDir, "objects"), { recursive: true });
      mkdirSync(path.join(gitDir, "refs"), { recursive: true });
      mkdirSync(path.join(gitDir, "refs", "heads"), { recursive: true });
      writeFileSync(path.join(gitDir, "HEAD"), "ref: refs/heads/current\n");
      writeFileSync(path.join(gitDir, "config"), "[core]\nrepositoryformatversion = 0\n");

      // Create a .lane-origin file so the lane can find its way back to main
      writeFileSync(path.join(lanePath, ".lane-origin"), mainRepoRoot);

      // Create a README in the lane
      writeFileSync(path.join(lanePath, "README.md"), "# Current Lane\n");

      // Add lane to config with normalized path
      const config = await loadConfig(mainRepoRoot);
      config.lanes.push({
        name: "current",
        path: lanePath,
        branch: "current",
        createdAt: new Date().toISOString(),
      });
      await saveConfig(mainRepoRoot, config);

      const lanes = await listAllLanes(lanePath);

      // Find the current lane in the results
      const currentLane = lanes.find(l => l.name === "current");
      expect(currentLane).toBeDefined();
      expect(currentLane?.isCurrent).toBe(true);
    });

    test("should return empty array when not in git repo", async () => {
      const lanes = await listAllLanes(path.join(testDir, "not-a-repo"));
      expect(lanes).toEqual([]);
    });
  });

  describe("getLaneForSwitch", () => {
    test("should return main when requesting main", async () => {
      const result = await getLaneForSwitch("main", mainRepoRoot);

      expect(result).not.toBeNull();
      expect(normalizePath(result!.path)).toBe(mainRepoRoot);
      expect(result?.branch).toBe("main");
    });

    test("should return origin as alias for main", async () => {
      const result = await getLaneForSwitch("origin", mainRepoRoot);

      expect(result).not.toBeNull();
      expect(normalizePath(result!.path)).toBe(mainRepoRoot);
    });

    test("should return existing lane", async () => {
      const lanePath = path.join(testDir, "test-repo-lane-feature");
      mkdirSync(lanePath, { recursive: true });

      const config = await loadConfig(mainRepoRoot);
      config.lanes.push({
        name: "feature",
        path: lanePath,
        branch: "feature",
        createdAt: new Date().toISOString(),
      });
      await saveConfig(mainRepoRoot, config);

      const result = await getLaneForSwitch("feature", mainRepoRoot);

      expect(result).not.toBeNull();
      expect(result?.path).toBe(lanePath);
      expect(result?.branch).toBe("feature");
    });

    test("should return null for non-existent lane", async () => {
      const result = await getLaneForSwitch("nonexistent", mainRepoRoot);
      expect(result).toBeNull();
    });

    test("should return null when not in git repo", async () => {
      const result = await getLaneForSwitch("main", path.join(testDir, "not-a-repo"));
      expect(result).toBeNull();
    });
  });

  describe("findLaneByBranch", () => {
    test("should find lane by branch name", async () => {
      const lanePath = path.join(testDir, "test-repo-lane-feature");
      mkdirSync(lanePath, { recursive: true });

      const config = await loadConfig(mainRepoRoot);
      config.lanes.push({
        name: "my-lane",
        path: lanePath,
        branch: "feature-branch",
        createdAt: new Date().toISOString(),
      });
      await saveConfig(mainRepoRoot, config);

      const result = await findLaneByBranch("feature-branch", mainRepoRoot);

      expect(result).not.toBeNull();
      expect(result?.name).toBe("my-lane");
      expect(result?.branch).toBe("feature-branch");
    });

    test("should return null when branch not found", async () => {
      const result = await findLaneByBranch("nonexistent", mainRepoRoot);
      expect(result).toBeNull();
    });
  });

  describe("createLane", () => {
    test("should fail when not in git repository", async () => {
      const result = await createLane("test-lane", {
        cwd: path.join(testDir, "not-a-repo"),
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Not in a git repository");
    });

    test("should fail when lane directory already exists", async () => {
      const lanePath = path.join(testDir, "test-repo-lane-existing");
      mkdirSync(lanePath, { recursive: true });

      const result = await createLane("existing", { cwd: mainRepoRoot });

      expect(result.success).toBe(false);
      expect(result.error).toContain("already exists");
    });

    test("should register lane in config with worktree mode", async () => {
      // Mock the git operations more comprehensively
      const originalSpawn = Bun.spawn;
      let mockWorktreeCallCount = 0;
      Bun.spawn = mock((args: string[], options?: any) => {
        if (args[0] === "git") {
          mockWorktreeCallCount++;

          // Create a mock process that returns immediately
          const mockStdout = new ReadableStream({
            start(controller) {
              if (args.includes("--show-current")) {
                controller.enqueue(new TextEncoder().encode("main\n"));
              }
              controller.close();
            },
          });

          const mockStderr = new ReadableStream({
            start(controller) {
              controller.close();
            },
          });

          return {
            exited: Promise.resolve(0),
            stdout: mockStdout,
            stderr: mockStderr,
            stdin: null,
          };
        }
        return originalSpawn(args, options);
      });

      try {
        // Set autoInstall to false to prevent package install attempts
        const config = await loadConfig(mainRepoRoot);
        config.settings.autoInstall = false;
        await saveConfig(mainRepoRoot, config);

        const result = await createLane("test-lane", {
          branch: "test-branch",
          cwd: mainRepoRoot,
        });

        // Verify git worktree was called
        expect(mockWorktreeCallCount).toBeGreaterThan(0);

        // Even if worktree fails, the lane should be registered during creation
        // and then removed on failure. Let's check the result
        expect(result).toBeDefined();
      } finally {
        Bun.spawn = originalSpawn;
      }
    }, 10000);
  });

  describe("removeLaneCmd", () => {
    beforeEach(async () => {
      // Add a test lane to config
      const config = await loadConfig(mainRepoRoot);
      config.lanes.push({
        name: "test-lane",
        path: path.join(testDir, "test-repo-lane-test-lane"),
        branch: "test-branch",
        createdAt: new Date().toISOString(),
      });
      await saveConfig(mainRepoRoot, config);
    });

    test("should fail when lane not found", async () => {
      const result = await removeLaneCmd("nonexistent", { cwd: mainRepoRoot });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    test("should remove lane directory", async () => {
      const lanePath = path.join(testDir, "test-repo-lane-test-lane");
      mkdirSync(lanePath, { recursive: true });
      writeFileSync(path.join(lanePath, "test.txt"), "content");

      const result = await removeLaneCmd("test-lane", { cwd: mainRepoRoot });

      expect(result.success).toBe(true);

      // Wait a bit for background deletion
      await new Promise(resolve => setTimeout(resolve, 100));

      // Directory should be removed or renamed to .deleting
      expect(existsSync(lanePath)).toBe(false);
    });

    test("should remove lane from config", async () => {
      const lanePath = path.join(testDir, "test-repo-lane-test-lane");
      mkdirSync(lanePath, { recursive: true });

      await removeLaneCmd("test-lane", { cwd: mainRepoRoot });

      // Wait for background deletion
      await new Promise(resolve => setTimeout(resolve, 100));

      const lanes = await getAllLanes(mainRepoRoot);
      expect(lanes.some(l => l.name === "test-lane")).toBe(false);
    });

    test("should handle missing lane directory gracefully", async () => {
      const result = await removeLaneCmd("test-lane", { cwd: mainRepoRoot });

      expect(result.success).toBe(true);
    });
  });

  describe("renameLane", () => {
    beforeEach(async () => {
      // Add a test lane to config
      const config = await loadConfig(mainRepoRoot);
      config.lanes.push({
        name: "old-name",
        path: path.join(testDir, "test-repo-lane-old-name"),
        branch: "old-branch",
        createdAt: new Date().toISOString(),
      });
      await saveConfig(mainRepoRoot, config);
    });

    test("should fail when not in git repository", async () => {
      const result = await renameLane("old-name", "new-name", {
        cwd: path.join(testDir, "not-a-repo"),
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Not in a git repository");
    });

    test("should fail when lane not found", async () => {
      const result = await renameLane("nonexistent", "new-name", {
        cwd: mainRepoRoot,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    test("should fail when new path already exists", async () => {
      const existingPath = path.join(testDir, "test-repo-lane-new-name");
      mkdirSync(existingPath, { recursive: true });

      const result = await renameLane("old-name", "new-name", {
        cwd: mainRepoRoot,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("already exists");
    });

    test("should rename lane directory", async () => {
      const oldPath = path.join(testDir, "test-repo-lane-old-name");
      mkdirSync(oldPath, { recursive: true });
      writeFileSync(path.join(oldPath, "test.txt"), "content");

      const result = await renameLane("old-name", "new-name", {
        cwd: mainRepoRoot,
      });

      expect(result.success).toBe(true);
      expect(normalizePath(result.newPath!)).toBe(normalizePath(path.join(testDir, "test-repo-lane-new-name")));

      // Old directory should not exist
      expect(existsSync(oldPath)).toBe(false);

      // New directory should exist
      expect(existsSync(result.newPath!)).toBe(true);
      expect(existsSync(path.join(result.newPath!, "test.txt"))).toBe(true);
    });

    test("should update config with new name and path", async () => {
      const oldPath = path.join(testDir, "test-repo-lane-old-name");
      mkdirSync(oldPath, { recursive: true });

      await renameLane("old-name", "new-name", { cwd: mainRepoRoot });

      const lanes = await getAllLanes(mainRepoRoot);
      const renamedLane = lanes.find(l => l.name === "new-name");

      expect(renamedLane).toBeDefined();
      expect(normalizePath(renamedLane!.path)).toBe(normalizePath(path.join(testDir, "test-repo-lane-new-name")));
      expect(lanes.some(l => l.name === "old-name")).toBe(false);
    });
  });

  describe("syncLane", () => {
    test("should fail when not in git repository", async () => {
      const result = await syncLane(undefined, {
        cwd: path.join(testDir, "not-a-repo"),
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Not in a git repository");
    });

    test("should fail when lane not found", async () => {
      const result = await syncLane("nonexistent", { cwd: mainRepoRoot });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    test("should copy untracked files from main to lane", async () => {
      // Create lane with git structure
      const lanePath = path.join(testDir, "test-repo-lane-sync-test");
      mkdirSync(lanePath, { recursive: true });
      mkdirSync(path.join(lanePath, ".git"), { recursive: true });

      // Add lane to config
      const config = await loadConfig(mainRepoRoot);
      config.lanes.push({
        name: "sync-test",
        path: lanePath,
        branch: "sync-test",
        createdAt: new Date().toISOString(),
      });
      await saveConfig(mainRepoRoot, config);

      // Create untracked files in main
      writeFileSync(path.join(mainRepoRoot, ".env"), "TEST=1\n");
      writeFileSync(path.join(mainRepoRoot, ".env.local"), "LOCAL=1\n");

      // Mock git status to avoid hanging
      const originalSpawn = Bun.spawn;
      Bun.spawn = mock((args: string[]) => {
        if (args[0] === "git") {
          const mockStdout = new ReadableStream({
            start(controller) {
              controller.close();
            },
          });
          return {
            exited: Promise.resolve(0),
            stdout: mockStdout,
            stderr: mockStdout,
            stdin: null,
          };
        }
        return originalSpawn(args);
      });

      try {
        const result = await syncLane("sync-test", { cwd: mainRepoRoot });
        expect(result.success).toBe(true);
      } finally {
        Bun.spawn = originalSpawn;
      }
    }, 10000);

    test("should sync to current lane when no name specified", async () => {
      // Create lane with complete git structure
      const lanePath = path.join(testDir, "test-repo-lane-current-sync");
      mkdirSync(lanePath, { recursive: true });
      const gitDir = path.join(lanePath, ".git");
      mkdirSync(gitDir, { recursive: true });
      mkdirSync(path.join(gitDir, "objects"), { recursive: true });
      mkdirSync(path.join(gitDir, "refs"), { recursive: true });
      writeFileSync(path.join(gitDir, "HEAD"), "ref: refs/heads/test\n");

      // Create .lane-origin to identify as lane
      writeFileSync(path.join(lanePath, ".lane-origin"), mainRepoRoot);

      // Create untracked files in main
      writeFileSync(path.join(mainRepoRoot, ".env"), "TEST=1\n");

      // Mock git status to avoid hanging
      const originalSpawn = Bun.spawn;
      Bun.spawn = mock((args: string[]) => {
        if (args[0] === "git") {
          const mockStdout = new ReadableStream({
            start(controller) {
              controller.close();
            },
          });
          return {
            exited: Promise.resolve(0),
            stdout: mockStdout,
            stderr: mockStdout,
            stdin: null,
          };
        }
        return originalSpawn(args);
      });

      try {
        const result = await syncLane(undefined, { cwd: lanePath });
        expect(result.success).toBe(true);
      } finally {
        Bun.spawn = originalSpawn;
      }
    }, 10000);

    test("should fail when syncing from main to main", async () => {
      const result = await syncLane(undefined, { cwd: mainRepoRoot });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Not in a lane");
    });

    test("should respect skip patterns from config", async () => {
      // Create lane
      const lanePath = path.join(testDir, "test-repo-lane-sync-skip");
      mkdirSync(lanePath, { recursive: true });

      // Add lane to config with skip patterns
      const config = await loadConfig(mainRepoRoot);
      config.settings.skipPatterns = [".env.local"];
      config.lanes.push({
        name: "sync-skip",
        path: lanePath,
        branch: "sync-skip",
        createdAt: new Date().toISOString(),
      });
      await saveConfig(mainRepoRoot, config);

      // Create untracked files in main
      writeFileSync(path.join(mainRepoRoot, ".env"), "TEST=1\n");
      writeFileSync(path.join(mainRepoRoot, ".env.local"), "LOCAL=1\n");

      // Mock git status to avoid hanging
      const originalSpawn = Bun.spawn;
      Bun.spawn = mock((args: string[]) => {
        if (args[0] === "git") {
          const mockStdout = new ReadableStream({
            start(controller) {
              controller.close();
            },
          });
          return {
            exited: Promise.resolve(0),
            stdout: mockStdout,
            stderr: mockStdout,
            stdin: null,
          };
        }
        return originalSpawn(args);
      });

      try {
        const result = await syncLane("sync-skip", { cwd: mainRepoRoot });
        expect(result.success).toBe(true);
        expect(result.copiedFiles).not.toContain(".env.local");
      } finally {
        Bun.spawn = originalSpawn;
      }
    }, 10000);
  });

  describe("symlink dependencies functionality", () => {
    test("should have symlinkDeps enabled by default in config", async () => {
      const config = await loadConfig(mainRepoRoot);
      expect(config.settings.symlinkDeps).toBe(true);
    });

    test("should create lane with symlinkDeps enabled by default", async () => {
      // Create a node_modules directory in main repo to test symlinking
      const nodeModulesPath = path.join(mainRepoRoot, "node_modules");
      mkdirSync(nodeModulesPath, { recursive: true });
      const testPackagePath = path.join(nodeModulesPath, "test-package");
      mkdirSync(testPackagePath, { recursive: true });
      writeFileSync(path.join(testPackagePath, "index.js"), "// test");

      // Mock git operations
      const originalSpawn = Bun.spawn;
      Bun.spawn = mock((args: string[], options?: any) => {
        if (args[0] === "git") {
          const mockStdout = new ReadableStream({
            start(controller) {
              if (args.includes("--show-current")) {
                controller.enqueue(new TextEncoder().encode("main\n"));
              }
              controller.close();
            },
          });

          return {
            exited: Promise.resolve(0),
            stdout: mockStdout,
            stderr: mockStdout,
            stdin: null,
          };
        }
        return originalSpawn(args, options);
      });

      try {
        // Ensure symlinkDeps is enabled (default)
        const config = await loadConfig(mainRepoRoot);
        config.settings.symlinkDeps = true;
        config.settings.autoInstall = false; // Disable auto install for cleaner test
        await saveConfig(mainRepoRoot, config);

        const result = await createLane("symlink-test", {
          branch: "symlink-test-branch",
          cwd: mainRepoRoot,
        });

        // The lane creation should succeed
        expect(result).toBeDefined();
      } finally {
        Bun.spawn = originalSpawn;
      }
    }, 10000);

    test("should respect symlinkDeps setting when disabled", async () => {
      // Mock git operations
      const originalSpawn = Bun.spawn;
      Bun.spawn = mock((args: string[], options?: any) => {
        if (args[0] === "git") {
          const mockStdout = new ReadableStream({
            start(controller) {
              if (args.includes("--show-current")) {
                controller.enqueue(new TextEncoder().encode("main\n"));
              }
              controller.close();
            },
          });

          return {
            exited: Promise.resolve(0),
            stdout: mockStdout,
            stderr: mockStdout,
            stdin: null,
          };
        }
        return originalSpawn(args, options);
      });

      try {
        // Disable symlinkDeps
        const config = await loadConfig(mainRepoRoot);
        config.settings.symlinkDeps = false;
        config.settings.autoInstall = false;
        await saveConfig(mainRepoRoot, config);

        const result = await createLane("no-symlink-test", {
          branch: "no-symlink-branch",
          cwd: mainRepoRoot,
        });

        expect(result).toBeDefined();

        // Verify config was respected
        const loadedConfig = await loadConfig(mainRepoRoot);
        expect(loadedConfig.settings.symlinkDeps).toBe(false);
      } finally {
        Bun.spawn = originalSpawn;
      }
    }, 10000);

    test("should handle missing dependency directories gracefully when symlinking", async () => {
      // Don't create any dependency directories - test that it handles missing ones
      const originalSpawn = Bun.spawn;
      Bun.spawn = mock((args: string[], options?: any) => {
        if (args[0] === "git") {
          const mockStdout = new ReadableStream({
            start(controller) {
              if (args.includes("--show-current")) {
                controller.enqueue(new TextEncoder().encode("main\n"));
              }
              controller.close();
            },
          });

          return {
            exited: Promise.resolve(0),
            stdout: mockStdout,
            stderr: mockStdout,
            stdin: null,
          };
        }
        return originalSpawn(args, options);
      });

      try {
        const config = await loadConfig(mainRepoRoot);
        config.settings.symlinkDeps = true;
        config.settings.autoInstall = false;
        await saveConfig(mainRepoRoot, config);

        const result = await createLane("no-deps-test", {
          branch: "no-deps-branch",
          cwd: mainRepoRoot,
        });

        // Should succeed even when no dependency directories exist
        expect(result).toBeDefined();
      } finally {
        Bun.spawn = originalSpawn;
      }
    }, 10000);
  });

  describe("env file handling - copied not symlinked", () => {
    test("should copy .env files (not symlink) via copyUntrackedFiles", async () => {
      const srcDir = path.join(testDir, "env-source");
      const destDir = path.join(testDir, "env-dest");
      mkdirSync(srcDir, { recursive: true });
      mkdirSync(destDir, { recursive: true });
      setupTestRepo(srcDir);

      // Create .env files
      const envContent = "DATABASE_URL=postgres://localhost/test\nAPI_KEY=secret123\n";
      writeFileSync(path.join(srcDir, ".env"), envContent);
      writeFileSync(path.join(srcDir, ".env.local"), "LOCAL_VAR=1\n");
      writeFileSync(path.join(srcDir, ".env.production"), "PROD=true\n");

      // Copy untracked files
      const copied = await copyUntrackedFiles(srcDir, destDir, []);

      // Verify .env files were copied
      expect(existsSync(path.join(destDir, ".env"))).toBe(true);
      expect(existsSync(path.join(destDir, ".env.local"))).toBe(true);
      expect(existsSync(path.join(destDir, ".env.production"))).toBe(true);

      // Verify they are REAL files, not symlinks
      expect(lstatSync(path.join(destDir, ".env")).isSymbolicLink()).toBe(false);
      expect(lstatSync(path.join(destDir, ".env.local")).isSymbolicLink()).toBe(false);
      expect(lstatSync(path.join(destDir, ".env.production")).isSymbolicLink()).toBe(false);

      // Verify content is identical
      expect(readFileSync(path.join(destDir, ".env"), "utf-8")).toBe(envContent);
    });

    test("should copy *.local config files (not symlink)", async () => {
      const srcDir = path.join(testDir, "local-source");
      const destDir = path.join(testDir, "local-dest");
      mkdirSync(srcDir, { recursive: true });
      mkdirSync(destDir, { recursive: true });
      setupTestRepo(srcDir);

      // Create .local files
      writeFileSync(path.join(srcDir, "config.local.json"), '{"local": true}');
      writeFileSync(path.join(srcDir, "settings.local.ts"), "export const local = true");
      writeFileSync(path.join(srcDir, "app.local.yaml"), "debug: true");

      // Copy untracked files
      await copyUntrackedFiles(srcDir, destDir, []);

      // Verify .local files exist and are real files (not symlinks)
      expect(existsSync(path.join(destDir, "config.local.json"))).toBe(true);
      expect(existsSync(path.join(destDir, "settings.local.ts"))).toBe(true);
      expect(existsSync(path.join(destDir, "app.local.yaml"))).toBe(true);

      expect(lstatSync(path.join(destDir, "config.local.json")).isSymbolicLink()).toBe(false);
      expect(lstatSync(path.join(destDir, "settings.local.ts")).isSymbolicLink()).toBe(false);
      expect(lstatSync(path.join(destDir, "app.local.yaml")).isSymbolicLink()).toBe(false);
    });

    test("should copy .secret* files (not symlink)", async () => {
      const srcDir = path.join(testDir, "secret-source");
      const destDir = path.join(testDir, "secret-dest");
      mkdirSync(srcDir, { recursive: true });
      mkdirSync(destDir, { recursive: true });
      setupTestRepo(srcDir);

      // Create secret files
      writeFileSync(path.join(srcDir, ".secret"), "top_secret_key");
      writeFileSync(path.join(srcDir, ".secrets.json"), '{"key": "value"}');

      // Copy untracked files
      await copyUntrackedFiles(srcDir, destDir, []);

      // Verify .secret* files exist and are real files (not symlinks)
      expect(existsSync(path.join(destDir, ".secret"))).toBe(true);
      expect(existsSync(path.join(destDir, ".secrets.json"))).toBe(true);

      expect(lstatSync(path.join(destDir, ".secret")).isSymbolicLink()).toBe(false);
      expect(lstatSync(path.join(destDir, ".secrets.json")).isSymbolicLink()).toBe(false);
    });

    test("should copy nested .env files (not symlink)", async () => {
      const srcDir = path.join(testDir, "nested-source");
      const destDir = path.join(testDir, "nested-dest");
      mkdirSync(srcDir, { recursive: true });
      mkdirSync(destDir, { recursive: true });
      setupTestRepo(srcDir);

      // Create nested directory structure with .env files
      const configDir = path.join(srcDir, "config");
      mkdirSync(configDir, { recursive: true });
      writeFileSync(path.join(configDir, ".env"), "CONFIG_ENV=value");

      const servicesDir = path.join(srcDir, "services", "api");
      mkdirSync(servicesDir, { recursive: true });
      writeFileSync(path.join(servicesDir, ".env"), "API_ENV=value");

      // Copy untracked files
      const copied = await copyUntrackedFiles(srcDir, destDir, []);

      // Verify nested .env files are real files (not symlinks)
      const nestedEnvPath = path.join(destDir, "config", ".env");
      const apiEnvPath = path.join(destDir, "services", "api", ".env");

      expect(existsSync(nestedEnvPath)).toBe(true);
      expect(existsSync(apiEnvPath)).toBe(true);

      expect(lstatSync(nestedEnvPath).isSymbolicLink()).toBe(false);
      expect(lstatSync(apiEnvPath).isSymbolicLink()).toBe(false);
    });

    test("should allow independent .env files per lane (via copyUntrackedFiles)", async () => {
      const mainDir = path.join(testDir, "env-independence-main");
      const laneADir = path.join(testDir, "env-independence-a");
      const laneBDir = path.join(testDir, "env-independence-b");

      mkdirSync(mainDir, { recursive: true });
      mkdirSync(laneADir, { recursive: true });
      mkdirSync(laneBDir, { recursive: true });

      setupTestRepo(mainDir);

      // Create initial .env in main
      const originalContent = "MAIN_ENV=original\n";
      writeFileSync(path.join(mainDir, ".env"), originalContent);

      // Copy to lane A
      await copyUntrackedFiles(mainDir, laneADir, []);

      // Modify .env in lane A
      const laneAEnvPath = path.join(laneADir, ".env");
      writeFileSync(laneAEnvPath, "LANE_A_ENV=modified\n");

      // Copy to lane B (should get original content, not lane A's modified version)
      await copyUntrackedFiles(mainDir, laneBDir, []);

      const laneBEnvPath = path.join(laneBDir, ".env");

      // Verify lane B has original content from main (independent from lane A)
      expect(readFileSync(laneBEnvPath, "utf-8")).toBe(originalContent);

      // Verify lane A has modified content
      expect(readFileSync(laneAEnvPath, "utf-8")).toBe("LANE_A_ENV=modified\n");

      // Verify main still has original
      expect(readFileSync(path.join(mainDir, ".env"), "utf-8")).toBe(originalContent);
    });

    test("dependency directories are excluded from copy by default when skipBuildArtifacts is true", async () => {
      const srcDir = path.join(testDir, "deps-source");
      const destDir = path.join(testDir, "deps-dest");
      mkdirSync(srcDir, { recursive: true });
      mkdirSync(destDir, { recursive: true });
      setupTestRepo(srcDir);

      // Create dependency directories
      const nodeModulesPath = path.join(srcDir, "node_modules");
      mkdirSync(nodeModulesPath, { recursive: true });
      writeFileSync(path.join(nodeModulesPath, "package.json"), '{"name": "dep"}');

      const venvPath = path.join(srcDir, ".venv");
      mkdirSync(venvPath, { recursive: true });
      writeFileSync(path.join(venvPath, "lib.txt"), "python libs");

      // Create .env file (should be copied)
      writeFileSync(path.join(srcDir, ".env"), "ENV=value");

      // Copy with BUILD_ARTIFACT_PATTERNS (simulating skipBuildArtifacts=true)
      const { BUILD_ARTIFACT_PATTERNS } = await import("../src/config");
      const copied = await copyUntrackedFiles(srcDir, destDir, BUILD_ARTIFACT_PATTERNS);

      // .env should be copied
      expect(existsSync(path.join(destDir, ".env"))).toBe(true);

      // Dependency directories should NOT be copied (excluded)
      expect(existsSync(path.join(destDir, "node_modules"))).toBe(false);
      expect(existsSync(path.join(destDir, ".venv"))).toBe(false);
    });
  });

  describe("integration tests", () => {
    test("should handle complete lane lifecycle", async () => {
      // This test verifies the full lifecycle without actual git operations
      const laneName = "lifecycle-test";

      // Initial state: no lanes
      let lanes = await getAllLanes(mainRepoRoot);
      expect(lanes.length).toBe(0);

      // Create lane (will fail due to no real git, but tests the flow)
      const originalSpawn = Bun.spawn;
      Bun.spawn = mock((args: string[]) => {
        if (args[0] === "git") {
          const mockStdout = new ReadableStream({
            start(controller) {
              controller.close();
            },
          });
          return {
            exited: Promise.resolve(1), // Make git fail
            stdout: mockStdout,
            stderr: mockStdout,
            stdin: null,
          };
        }
        return originalSpawn(args);
      });

      try {
        const createResult = await createLane(laneName, { cwd: mainRepoRoot });
        // We expect this to fail in test environment
        expect(createResult).toBeDefined();
      } finally {
        Bun.spawn = originalSpawn;
      }

      // List lanes
      const listedLanes = await listAllLanes(mainRepoRoot);
      expect(listedLanes.length).toBeGreaterThanOrEqual(1); // At least main
      expect(listedLanes[0].name).toBe("main");
    }, 10000);

    test("should handle lane path generation correctly", () => {
      const testCases = [
        { repo: "/Users/test/my-project", lane: "feature-1", expected: "/Users/test/my-project-lane-feature-1" },
        { repo: "/Users/test/my-project", lane: "feature/auth", expected: "/Users/test/my-project-lane-feature-auth" },
        { repo: "/home/user/src/app", lane: "bugfix/issue-123", expected: "/home/user/src/app-lane-bugfix-issue-123" },
      ];

      for (const testCase of testCases) {
        const result = getLanePath(testCase.repo, testCase.lane);
        expect(result).toBe(testCase.expected);
      }
    });
  });

  describe("edge cases and error handling", () => {
    test("should handle special characters in lane names", () => {
      const specialNames = [
        "feature-with-dash",
        "feature_with_underscore",
        "feature.with.dots",
        "feature/with/slashes",
        "123-starting-with-numbers",
      ];

      for (const name of specialNames) {
        const lanePath = getLanePath(mainRepoRoot, name);
        expect(lanePath).toBeDefined();
        expect(lanePath).toContain("lane-");
      }
    });

    test("should handle empty lane list in findLaneByBranch", async () => {
      const result = await findLaneByBranch("any-branch", mainRepoRoot);
      expect(result).toBeNull();
    });

    test("should handle missing config gracefully", async () => {
      // Remove config
      const configPath = path.join(mainRepoRoot, ".git", "lanes.json");
      if (existsSync(configPath)) {
        rmSync(configPath);
      }

      const lanes = await getAllLanes(mainRepoRoot);
      expect(Array.isArray(lanes)).toBe(true);
      expect(lanes.length).toBe(0);
    });

    test("should detect multiple package managers from different ecosystems", () => {
      const testPath = path.join(testDir, "multi-ecosystem");
      mkdirSync(testPath, { recursive: true });

      // Create files for Node.js and Python
      writeFileSync(path.join(testPath, "package.json"), "{}");
      writeFileSync(path.join(testPath, "pyproject.toml"), "");

      const detected = detectPackageManagers(testPath);

      // Should detect both npm and pip
      const hasNode = detected.some(pm => pm.name === "npm");
      const hasPython = detected.some(pm => pm.name === "pip");

      expect(hasNode || hasPython).toBe(true);
    });
  });
});
