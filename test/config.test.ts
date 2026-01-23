import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { promises as fs } from "fs";
import path from "path";
import type { Lane, LanesConfig } from "../src/config";
import {
  loadConfig,
  saveConfig,
  addLane,
  removeLane,
  getLane,
  getAllLanes,
  recordLaneSwitch,
  getPreviousLane,
  getConfigPath,
  getHistoryPath,
  BUILD_ARTIFACT_PATTERNS,
} from "../src/config";

describe("config", () => {
  let tempDir: string;
  let gitRoot: string;
  let configDir: string;

  beforeEach(async () => {
    // Create a temporary directory for testing
    tempDir = path.join(process.cwd(), ".temp-test");
    gitRoot = path.join(tempDir, "test-repo");
    configDir = path.join(gitRoot, ".git");

    // Create the directory structure
    await fs.mkdir(configDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up the temporary directory
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  describe("getConfigPath", () => {
    test("returns correct path to lanes.json", () => {
      const result = getConfigPath(gitRoot);
      expect(result).toBe(path.join(gitRoot, ".git", "lanes.json"));
    });
  });

  describe("loadConfig", () => {
    test("loads existing config from file", async () => {
      const existingConfig: LanesConfig = {
        version: 1,
        lanes: [
          {
            name: "feature-1",
            path: "/path/to/feature-1",
            branch: "feature/feature-1",
            createdAt: "2024-01-01T00:00:00.000Z",
          },
        ],
        settings: {
          copyMode: "worktree",
          skipBuildArtifacts: true,
          skipPatterns: ["*.log"],
          autoInstall: false,
          symlinkDeps: true,
        },
      };

      const configPath = getConfigPath(gitRoot);
      await fs.writeFile(configPath, JSON.stringify(existingConfig, null, 2));

      const result = await loadConfig(gitRoot);

      expect(result.version).toBe(1);
      expect(result.lanes).toHaveLength(1);
      expect(result.lanes[0].name).toBe("feature-1");
      expect(result.settings.copyMode).toBe("worktree");
      expect(result.settings.skipBuildArtifacts).toBe(true);
      expect(result.settings.skipPatterns).toEqual(["*.log"]);
      expect(result.settings.autoInstall).toBe(false);
    });

    test("returns default config when file does not exist", async () => {
      const result = await loadConfig(gitRoot);

      expect(result.version).toBe(1);
      expect(result.lanes).toEqual([]);
      expect(result.settings.copyMode).toBe("full");
      expect(result.settings.skipBuildArtifacts).toBe(false);
      expect(result.settings.skipPatterns).toEqual([]);
      expect(result.settings.autoInstall).toBe(true);
      expect(result.settings.symlinkDeps).toBe(true);
    });

    test("returns default config when file is empty", async () => {
      const configPath = getConfigPath(gitRoot);
      await fs.writeFile(configPath, "");

      const result = await loadConfig(gitRoot);

      expect(result.version).toBe(1);
      expect(result.lanes).toEqual([]);
      expect(result.settings.copyMode).toBe("full");
      expect(result.settings.symlinkDeps).toBe(true);
    });

    test("merges with defaults for partial config", async () => {
      const partialConfig = {
        lanes: [
          {
            name: "test-lane",
            path: "/path",
            branch: "test-branch",
            createdAt: "2024-01-01T00:00:00.000Z",
          },
        ],
        settings: {
          copyMode: "worktree" as const,
          skipBuildArtifacts: true,
          skipPatterns: [],
          autoInstall: true,
        },
      };

      const configPath = getConfigPath(gitRoot);
      await fs.writeFile(configPath, JSON.stringify(partialConfig, null, 2));

      const result = await loadConfig(gitRoot);

      expect(result.version).toBe(1); // from defaults
      expect(result.lanes).toHaveLength(1);
      expect(result.settings.copyMode).toBe("worktree");
      expect(result.settings.skipBuildArtifacts).toBe(true);
      expect(result.settings.symlinkDeps).toBe(true); // from defaults
    });

    test("merges partial settings with defaults", async () => {
      const partialConfig = {
        settings: {
          copyMode: "worktree" as const,
          skipBuildArtifacts: false,
          skipPatterns: ["*.tmp"],
          autoInstall: true,
        },
      };

      const configPath = getConfigPath(gitRoot);
      await fs.writeFile(configPath, JSON.stringify(partialConfig, null, 2));

      const result = await loadConfig(gitRoot);

      expect(result.settings.copyMode).toBe("worktree");
      expect(result.settings.skipBuildArtifacts).toBe(false);
      expect(result.settings.skipPatterns).toEqual(["*.tmp"]);
      expect(result.settings.autoInstall).toBe(true);
      expect(result.settings.symlinkDeps).toBe(true); // from defaults
      expect(result.lanes).toEqual([]); // from defaults
    });

    test("handles malformed JSON gracefully", async () => {
      const configPath = getConfigPath(gitRoot);
      await fs.writeFile(configPath, "{ invalid json }");

      const result = await loadConfig(gitRoot);

      expect(result.version).toBe(1);
      expect(result.lanes).toEqual([]);
      expect(result.settings.copyMode).toBe("full");
      expect(result.settings.symlinkDeps).toBe(true); // from defaults
    });
  });

  describe("saveConfig", () => {
    test("saves config to file", async () => {
      const config: LanesConfig = {
        version: 1,
        lanes: [
          {
            name: "saved-lane",
            path: "/saved/path",
            branch: "saved-branch",
            createdAt: "2024-01-01T00:00:00.000Z",
          },
        ],
        settings: {
          copyMode: "worktree",
          skipBuildArtifacts: true,
          skipPatterns: ["*.log"],
          autoInstall: false,
          symlinkDeps: true,
        },
      };

      await saveConfig(gitRoot, config);

      const configPath = getConfigPath(gitRoot);
      const fileContent = await fs.readFile(configPath, "utf-8");
      const savedConfig = JSON.parse(fileContent) as LanesConfig;

      expect(savedConfig).toEqual(config);
    });

    test("overwrites existing config", async () => {
      const initialConfig: LanesConfig = {
        version: 1,
        lanes: [
          {
            name: "initial-lane",
            path: "/initial",
            branch: "initial",
            createdAt: "2024-01-01T00:00:00.000Z",
          },
        ],
        settings: {
          copyMode: "full",
          skipBuildArtifacts: false,
          skipPatterns: [],
          autoInstall: true,
          symlinkDeps: true,
        },
      };

      await saveConfig(gitRoot, initialConfig);

      const updatedConfig: LanesConfig = {
        version: 2,
        lanes: [
          {
            name: "updated-lane",
            path: "/updated",
            branch: "updated",
            createdAt: "2024-01-02T00:00:00.000Z",
          },
        ],
        settings: {
          copyMode: "worktree",
          skipBuildArtifacts: true,
          skipPatterns: ["*.tmp"],
          autoInstall: false,
          symlinkDeps: false,
        },
      };

      await saveConfig(gitRoot, updatedConfig);

      const configPath = getConfigPath(gitRoot);
      const fileContent = await fs.readFile(configPath, "utf-8");
      const savedConfig = JSON.parse(fileContent) as LanesConfig;

      expect(savedConfig.version).toBe(2);
      expect(savedConfig.lanes).toHaveLength(1);
      expect(savedConfig.lanes[0].name).toBe("updated-lane");
      expect(savedConfig.settings.copyMode).toBe("worktree");
    });
  });

  describe("addLane", () => {
    test("adds a new lane to empty config", async () => {
      const laneInput = {
        name: "new-feature",
        path: "/path/to/new-feature",
        branch: "feature/new-feature",
      };

      const result = await addLane(gitRoot, laneInput);

      expect(result.lanes).toHaveLength(1);
      expect(result.lanes[0].name).toBe("new-feature");
      expect(result.lanes[0].path).toBe("/path/to/new-feature");
      expect(result.lanes[0].branch).toBe("feature/new-feature");
      expect(result.lanes[0].createdAt).toBeDefined();

      // Verify it was persisted
      const reloaded = await loadConfig(gitRoot);
      expect(reloaded.lanes).toHaveLength(1);
      expect(reloaded.lanes[0].name).toBe("new-feature");
    });

    test("replaces existing lane with same name", async () => {
      // Add first lane
      await addLane(gitRoot, {
        name: "feature-x",
        path: "/old/path",
        branch: "feature/old-branch",
      });

      // Add lane with same name
      const result = await addLane(gitRoot, {
        name: "feature-x",
        path: "/new/path",
        branch: "feature/new-branch",
      });

      expect(result.lanes).toHaveLength(1);
      expect(result.lanes[0].path).toBe("/new/path");
      expect(result.lanes[0].branch).toBe("feature/new-branch");
    });

    test("adds multiple lanes", async () => {
      await addLane(gitRoot, {
        name: "feature-1",
        path: "/path/1",
        branch: "feature/1",
      });

      await addLane(gitRoot, {
        name: "feature-2",
        path: "/path/2",
        branch: "feature/2",
      });

      const result = await getAllLanes(gitRoot);
      expect(result).toHaveLength(2);
    });

    test("sets createdAt timestamp", async () => {
      const before = new Date();
      await addLane(gitRoot, {
        name: "timestamp-test",
        path: "/path",
        branch: "branch",
      });
      const after = new Date();

      const lanes = await getAllLanes(gitRoot);
      const createdAt = new Date(lanes[0].createdAt);

      expect(createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe("removeLane", () => {
    test("removes existing lane", async () => {
      await addLane(gitRoot, {
        name: "to-remove",
        path: "/path",
        branch: "branch",
      });

      const result = await removeLane(gitRoot, "to-remove");

      expect(result.lanes).toHaveLength(0);

      // Verify it was persisted
      const reloaded = await loadConfig(gitRoot);
      expect(reloaded.lanes).toHaveLength(0);
    });

    test("keeps other lanes when removing one", async () => {
      await addLane(gitRoot, { name: "lane-1", path: "/path/1", branch: "branch-1" });
      await addLane(gitRoot, { name: "lane-2", path: "/path/2", branch: "branch-2" });
      await addLane(gitRoot, { name: "lane-3", path: "/path/3", branch: "branch-3" });

      const result = await removeLane(gitRoot, "lane-2");

      expect(result.lanes).toHaveLength(2);
      expect(result.lanes.find((l) => l.name === "lane-1")).toBeDefined();
      expect(result.lanes.find((l) => l.name === "lane-3")).toBeDefined();
      expect(result.lanes.find((l) => l.name === "lane-2")).toBeUndefined();
    });

    test("handles removing non-existent lane gracefully", async () => {
      await addLane(gitRoot, { name: "existing", path: "/path", branch: "branch" });

      const result = await removeLane(gitRoot, "non-existent");

      expect(result.lanes).toHaveLength(1);
      expect(result.lanes[0].name).toBe("existing");
    });

    test("handles removing from empty config", async () => {
      const result = await removeLane(gitRoot, "any-lane");

      expect(result.lanes).toHaveLength(0);
    });
  });

  describe("getLane", () => {
    test("returns existing lane", async () => {
      await addLane(gitRoot, {
        name: "target-lane",
        path: "/target/path",
        branch: "target-branch",
      });

      const result = await getLane(gitRoot, "target-lane");

      expect(result).toBeDefined();
      expect(result?.name).toBe("target-lane");
      expect(result?.path).toBe("/target/path");
      expect(result?.branch).toBe("target-branch");
    });

    test("returns null for non-existent lane", async () => {
      await addLane(gitRoot, { name: "existing", path: "/path", branch: "branch" });

      const result = await getLane(gitRoot, "non-existent");

      expect(result).toBeNull();
    });

    test("returns null when config is empty", async () => {
      const result = await getLane(gitRoot, "any-lane");

      expect(result).toBeNull();
    });

    test("finds correct lane among many", async () => {
      await addLane(gitRoot, { name: "lane-1", path: "/path/1", branch: "branch-1" });
      await addLane(gitRoot, { name: "lane-2", path: "/path/2", branch: "branch-2" });
      await addLane(gitRoot, { name: "lane-3", path: "/path/3", branch: "branch-3" });

      const result = await getLane(gitRoot, "lane-2");

      expect(result?.name).toBe("lane-2");
      expect(result?.path).toBe("/path/2");
    });
  });

  describe("getAllLanes", () => {
    test("returns empty array when no lanes exist", async () => {
      const result = await getAllLanes(gitRoot);

      expect(result).toEqual([]);
    });

    test("returns all lanes", async () => {
      await addLane(gitRoot, { name: "lane-1", path: "/path/1", branch: "branch-1" });
      await addLane(gitRoot, { name: "lane-2", path: "/path/2", branch: "branch-2" });
      await addLane(gitRoot, { name: "lane-3", path: "/path/3", branch: "branch-3" });

      const result = await getAllLanes(gitRoot);

      expect(result).toHaveLength(3);
      expect(result.map((l) => l.name)).toEqual(["lane-1", "lane-2", "lane-3"]);
    });

    test("returns lanes in insertion order", async () => {
      await addLane(gitRoot, { name: "first", path: "/first", branch: "first" });
      await addLane(gitRoot, { name: "second", path: "/second", branch: "second" });
      await addLane(gitRoot, { name: "third", path: "/third", branch: "third" });

      const result = await getAllLanes(gitRoot);

      expect(result[0].name).toBe("first");
      expect(result[1].name).toBe("second");
      expect(result[2].name).toBe("third");
    });

    test("returns copy of lanes array", async () => {
      await addLane(gitRoot, { name: "test", path: "/path", branch: "branch" });

      const lanes1 = await getAllLanes(gitRoot);
      const lanes2 = await getAllLanes(gitRoot);

      expect(lanes1).not.toBe(lanes2); // Different array references
      expect(lanes1).toEqual(lanes2); // Same contents
    });
  });

  describe("recordLaneSwitch", () => {
    test("records lane switch to history file", async () => {
      const fromPath = "/path/to/previous-lane";

      await recordLaneSwitch(gitRoot, fromPath);

      const historyPath = path.join(gitRoot, ".git", "lanes-history");
      const content = await fs.readFile(historyPath, "utf-8");

      expect(content.trim()).toBe(fromPath);
    });

    test("overwrites previous history", async () => {
      await recordLaneSwitch(gitRoot, "/first-lane");
      await recordLaneSwitch(gitRoot, "/second-lane");

      const historyPath = path.join(gitRoot, ".git", "lanes-history");
      const content = await fs.readFile(historyPath, "utf-8");

      expect(content.trim()).toBe("/second-lane");
    });

    test("handles paths with spaces", async () => {
      const fromPath = "/path with spaces/to lane";

      await recordLaneSwitch(gitRoot, fromPath);

      const historyPath = path.join(gitRoot, ".git", "lanes-history");
      const content = await fs.readFile(historyPath, "utf-8");

      expect(content.trim()).toBe(fromPath);
    });
  });

  describe("getPreviousLane", () => {
    test("returns null when history file does not exist", async () => {
      const result = await getPreviousLane(gitRoot);

      expect(result).toBeNull();
    });

    test("returns null when history file is empty", async () => {
      const historyPath = path.join(gitRoot, ".git", "lanes-history");
      await fs.writeFile(historyPath, "");

      const result = await getPreviousLane(gitRoot);

      expect(result).toBeNull();
    });

    test("returns previous lane path", async () => {
      // Create the previous lane path so it exists
      const previousPath = path.join(tempDir, "previous-lane");
      await fs.mkdir(previousPath, { recursive: true });

      const historyPath = path.join(gitRoot, ".git", "lanes-history");
      await fs.writeFile(historyPath, previousPath);

      const result = await getPreviousLane(gitRoot);

      expect(result).toBe(previousPath);
    });

    test("returns null if previous lane path does not exist", async () => {
      const nonExistentPath = "/path/that/does/not/exist";
      const historyPath = path.join(gitRoot, ".git", "lanes-history");
      await fs.writeFile(historyPath, nonExistentPath);

      const result = await getPreviousLane(gitRoot);

      expect(result).toBeNull();
    });

    test("returns path if it exists as file", async () => {
      // Create a temporary file to simulate existing lane
      const tempLanePath = path.join(tempDir, "existing-lane");
      await fs.writeFile(tempLanePath, "content");

      const historyPath = path.join(gitRoot, ".git", "lanes-history");
      await fs.writeFile(historyPath, tempLanePath);

      const result = await getPreviousLane(gitRoot);

      expect(result).toBe(tempLanePath);
    });

    test("returns path if it exists as directory", async () => {
      // Create a temporary directory to simulate existing lane
      const tempLanePath = path.join(tempDir, "existing-lane-dir");
      await fs.mkdir(tempLanePath, { recursive: true });

      const historyPath = path.join(gitRoot, ".git", "lanes-history");
      await fs.writeFile(historyPath, tempLanePath);

      const result = await getPreviousLane(gitRoot);

      expect(result).toBe(tempLanePath);
    });

    test("handles whitespace in history file", async () => {
      // Create the previous lane path so it exists
      const previousPath = path.join(tempDir, "whitespace-lane");
      await fs.mkdir(previousPath, { recursive: true });

      const historyPath = path.join(gitRoot, ".git", "lanes-history");
      await fs.writeFile(historyPath, `  ${previousPath}  \n`);

      const result = await getPreviousLane(gitRoot);

      expect(result).toBe(previousPath);
    });

    test("handles malformed history file", async () => {
      const historyPath = path.join(gitRoot, ".git", "lanes-history");
      await fs.writeFile(historyPath, "");

      // Should not throw, just return null
      const result = await getPreviousLane(gitRoot);
      expect(result).toBeNull();
    });
  });

  describe("BUILD_ARTIFACT_PATTERNS", () => {
    test("exports build artifact patterns", () => {
      expect(BUILD_ARTIFACT_PATTERNS).toBeInstanceOf(Array);
      expect(BUILD_ARTIFACT_PATTERNS.length).toBeGreaterThan(0);
      expect(BUILD_ARTIFACT_PATTERNS).toContain("node_modules");
      expect(BUILD_ARTIFACT_PATTERNS).toContain(".next");
      expect(BUILD_ARTIFACT_PATTERNS).toContain("dist");
    });
  });

  describe("symlinkDeps setting", () => {
    test("loads config with symlinkDeps disabled", async () => {
      const configWithSymlinksDisabled: LanesConfig = {
        version: 1,
        lanes: [],
        settings: {
          copyMode: "full",
          skipBuildArtifacts: false,
          skipPatterns: [],
          autoInstall: true,
          symlinkDeps: false,
        },
      };

      const configPath = getConfigPath(gitRoot);
      await fs.writeFile(configPath, JSON.stringify(configWithSymlinksDisabled, null, 2));

      const result = await loadConfig(gitRoot);

      expect(result.settings.symlinkDeps).toBe(false);
    });

    test("merges symlinkDeps setting from partial config", async () => {
      const partialConfig = {
        settings: {
          symlinkDeps: false,
        },
      };

      const configPath = getConfigPath(gitRoot);
      await fs.writeFile(configPath, JSON.stringify(partialConfig, null, 2));

      const result = await loadConfig(gitRoot);

      expect(result.settings.symlinkDeps).toBe(false);
      expect(result.settings.copyMode).toBe("full"); // other defaults preserved
      expect(result.settings.autoInstall).toBe(true);
    });

    test("saves and loads config with symlinkDeps enabled", async () => {
      const configWithSymlinks: LanesConfig = {
        version: 1,
        lanes: [],
        settings: {
          copyMode: "worktree",
          skipBuildArtifacts: true,
          skipPatterns: ["*.log"],
          autoInstall: false,
          symlinkDeps: true,
        },
      };

      await saveConfig(gitRoot, configWithSymlinks);

      const loaded = await loadConfig(gitRoot);

      expect(loaded.settings.symlinkDeps).toBe(true);
      expect(loaded.settings.copyMode).toBe("worktree");
      expect(loaded.settings.skipBuildArtifacts).toBe(true);
      expect(loaded.settings.skipPatterns).toEqual(["*.log"]);
      expect(loaded.settings.autoInstall).toBe(false);
    });
  });

  describe("integration scenarios", () => {
    test("complete lane lifecycle", async () => {
      // Create lanes
      await addLane(gitRoot, { name: "feature-a", path: "/a", branch: "feature-a" });
      await addLane(gitRoot, { name: "feature-b", path: "/b", branch: "feature-b" });

      // Verify lanes exist
      let lanes = await getAllLanes(gitRoot);
      expect(lanes).toHaveLength(2);

      // Get specific lane
      const laneA = await getLane(gitRoot, "feature-a");
      expect(laneA?.name).toBe("feature-a");

      // Remove one lane
      await removeLane(gitRoot, "feature-a");
      lanes = await getAllLanes(gitRoot);
      expect(lanes).toHaveLength(1);
      expect(lanes[0].name).toBe("feature-b");

      // Verify removed lane is gone
      const removedLane = await getLane(gitRoot, "feature-a");
      expect(removedLane).toBeNull();
    });

    test("lane switch history workflow", async () => {
      // Create first lane
      const lane1Path = path.join(tempDir, "lane-1");
      await fs.mkdir(lane1Path, { recursive: true });

      // Record switch from lane 1
      await recordLaneSwitch(gitRoot, lane1Path);

      // Verify previous lane
      const previous = await getPreviousLane(gitRoot);
      expect(previous).toBe(lane1Path);

      // Create second lane and switch
      const lane2Path = path.join(tempDir, "lane-2");
      await fs.mkdir(lane2Path, { recursive: true });
      await recordLaneSwitch(gitRoot, lane2Path);

      // Verify history updated
      const updatedPrevious = await getPreviousLane(gitRoot);
      expect(updatedPrevious).toBe(lane2Path);
    });

    test("persistence across config reloads", async () => {
      // Add a lane
      await addLane(gitRoot, {
        name: "persistent-lane",
        path: "/persistent",
        branch: "persistent",
      });

      // Modify settings
      const config = await loadConfig(gitRoot);
      config.settings.copyMode = "worktree";
      config.settings.skipBuildArtifacts = true;
      await saveConfig(gitRoot, config);

      // Reload and verify
      const reloaded = await loadConfig(gitRoot);
      expect(reloaded.lanes).toHaveLength(1);
      expect(reloaded.lanes[0].name).toBe("persistent-lane");
      expect(reloaded.settings.copyMode).toBe("worktree");
      expect(reloaded.settings.skipBuildArtifacts).toBe(true);
    });
  });
});
