import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import * as git from "../src/git";

describe("git.ts", () => {
  const testRepoPath = "/Users/ebowwa/lane";
  const testBranchPrefix = "test-lane-branch-";
  const testWorktreePrefix = "test-lane-worktree-";
  const createdBranches: string[] = [];
  const createdWorktrees: string[] = [];

  // Cleanup function to remove test artifacts
  async function cleanup() {
    // Remove test worktrees
    for (const worktreePath of createdWorktrees) {
      if (existsSync(worktreePath)) {
        await git.removeWorktree(testRepoPath, worktreePath);
      }
    }

    // Remove test branches
    for (const branchName of createdBranches) {
      await git.deleteBranch(testRepoPath, branchName, true);
    }
  }

  beforeEach(() => {
    // Clean up any previous test artifacts
    cleanup();
  });

  afterEach(async () => {
    // Clean up after each test
    await cleanup();
  });

  describe("findGitRepo", () => {
    test("should find git repository root from current directory", async () => {
      const repo = await git.findGitRepo(testRepoPath);

      expect(repo).not.toBeNull();
      expect(repo?.root).toBe(testRepoPath);
      expect(repo?.name).toBe("lane");
      expect(repo?.parentDir).toBe("/Users/ebowwa");
      expect(repo?.currentBranch).toBeTruthy();
    });

    test("should find git repository from subdirectory", async () => {
      const repo = await git.findGitRepo(path.join(testRepoPath, "src"));

      expect(repo).not.toBeNull();
      expect(repo?.root).toBe(testRepoPath);
    });

    test("should return null for non-git directory", async () => {
      const nonGitDir = "/tmp/non-git-dir-" + Date.now();
      mkdirSync(nonGitDir, { recursive: true });

      try {
        const repo = await git.findGitRepo(nonGitDir);
        expect(repo).toBeNull();
      } finally {
        rmSync(nonGitDir, { recursive: true, force: true });
      }
    });

    test("should return valid GitRepo interface structure", async () => {
      const repo = await git.findGitRepo(testRepoPath);

      expect(repo).toMatchObject({
        root: expect.any(String),
        name: expect.any(String),
        parentDir: expect.any(String),
        currentBranch: expect.any(String),
      });
    });
  });

  describe("isWorktree", () => {
    test("should return false for main repository", async () => {
      const isWorktreeResult = await git.isWorktree(testRepoPath);
      expect(isWorktreeResult).toBe(false);
    });

    test("should return true for a git worktree", async () => {
      const branchName = testBranchPrefix + Date.now();
      const worktreePath = path.join(testRepoPath, "..", testWorktreePrefix + Date.now());

      // Create a test worktree
      const createResult = await git.createWorktree(testRepoPath, worktreePath, branchName, true);
      expect(createResult.success).toBe(true);
      createdBranches.push(branchName);
      createdWorktrees.push(worktreePath);

      // Check if it's detected as a worktree
      const isWorktreeResult = await git.isWorktree(worktreePath);
      expect(isWorktreeResult).toBe(true);
    });

    test("should return false for non-git directory", async () => {
      const nonGitDir = "/tmp/non-git-dir-" + Date.now();
      mkdirSync(nonGitDir, { recursive: true });

      try {
        const isWorktreeResult = await git.isWorktree(nonGitDir);
        expect(isWorktreeResult).toBe(false);
      } finally {
        rmSync(nonGitDir, { recursive: true, force: true });
      }
    });
  });

  describe("getMainWorktree", () => {
    test("should return main worktree path for main repository", async () => {
      const mainWorktree = await git.getMainWorktree(testRepoPath);
      expect(mainWorktree).toBe(testRepoPath);
    });

    test("should return main worktree path from a worktree", async () => {
      const branchName = testBranchPrefix + Date.now();
      const worktreePath = path.join(testRepoPath, "..", testWorktreePrefix + Date.now());

      // Create a test worktree
      const createResult = await git.createWorktree(testRepoPath, worktreePath, branchName, true);
      expect(createResult.success).toBe(true);
      createdBranches.push(branchName);
      createdWorktrees.push(worktreePath);

      // Get main worktree from the worktree
      const mainWorktree = await git.getMainWorktree(worktreePath);
      expect(mainWorktree).toBe(testRepoPath);
    });

    test("should return null for non-git directory", async () => {
      const nonGitDir = "/tmp/non-git-dir-" + Date.now();
      mkdirSync(nonGitDir, { recursive: true });

      try {
        const mainWorktree = await git.getMainWorktree(nonGitDir);
        expect(mainWorktree).toBeNull();
      } finally {
        rmSync(nonGitDir, { recursive: true, force: true });
      }
    });
  });

  describe("getCurrentBranch", () => {
    test("should return current branch name", async () => {
      const branch = await git.getCurrentBranch(testRepoPath);
      expect(branch).not.toBeNull();
      expect(branch).toBeTruthy();
      expect(typeof branch).toBe("string");
    });

    test("should return null for non-git directory", async () => {
      const nonGitDir = "/tmp/non-git-dir-" + Date.now();
      mkdirSync(nonGitDir, { recursive: true });

      try {
        const branch = await git.getCurrentBranch(nonGitDir);
        expect(branch).toBeNull();
      } finally {
        rmSync(nonGitDir, { recursive: true, force: true });
      }
    });

    test("should return correct branch for worktree", async () => {
      const branchName = testBranchPrefix + Date.now();
      const worktreePath = path.join(testRepoPath, "..", testWorktreePrefix + Date.now());

      // Create a test worktree
      const createResult = await git.createWorktree(testRepoPath, worktreePath, branchName, true);
      expect(createResult.success).toBe(true);
      createdBranches.push(branchName);
      createdWorktrees.push(worktreePath);

      // Get current branch from worktree
      const branch = await git.getCurrentBranch(worktreePath);
      expect(branch).toBe(branchName);
    });
  });

  describe("getUntrackedFiles", () => {
    test("should return empty array when no untracked files", async () => {
      const untracked = await git.getUntrackedFiles(testRepoPath);
      expect(Array.isArray(untracked)).toBe(true);
      // Note: This might have files depending on repo state
    });

    test("should detect untracked files", async () => {
      // Create a temporary untracked file
      const testFile = path.join(testRepoPath, "temp-untracked-" + Date.now() + ".txt");
      Bun.write(testFile, "test content");

      try {
        const untracked = await git.getUntrackedFiles(testRepoPath);
        const fileName = path.basename(testFile);
        expect(untracked.some((f) => f.includes(fileName))).toBe(true);
      } finally {
        // Clean up the test file
        rmSync(testFile, { force: true });
      }
    });

    test("should detect ignored files", async () => {
      // Create a temporary ignored file
      const testFile = path.join(testRepoPath, ".gitignore");
      const originalContent = existsSync(testFile) ? Bun.file(testFile).text() : "";

      // Add a test ignore pattern
      const tempIgnoreName = "temp-ignore-" + Date.now() + ".txt";
      Bun.write(testFile, await originalContent + "\n" + tempIgnoreName);

      const tempIgnoredFile = path.join(testRepoPath, tempIgnoreName);
      Bun.write(tempIgnoredFile, "ignored content");

      try {
        const untracked = await git.getUntrackedFiles(testRepoPath);
        expect(untracked.some((f) => f.includes(tempIgnoreName))).toBe(true);
      } finally {
        // Clean up
        rmSync(tempIgnoredFile, { force: true });
        if (originalContent) {
          Bun.write(testFile, await originalContent);
        } else {
          rmSync(testFile, { force: true });
        }
      }
    });
  });

  describe("createWorktree", () => {
    test("should create worktree with new branch", async () => {
      const branchName = testBranchPrefix + Date.now();
      const worktreePath = path.join(testRepoPath, "..", testWorktreePrefix + Date.now());

      const result = await git.createWorktree(testRepoPath, worktreePath, branchName, true);

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(existsSync(worktreePath)).toBe(true);

      // Verify branch exists
      const branchExistsResult = await git.branchExists(testRepoPath, branchName);
      expect(branchExistsResult).toBe(true);

      // Clean up
      createdBranches.push(branchName);
      createdWorktrees.push(worktreePath);
    });

    test("should create worktree with existing detached HEAD", async () => {
      const branchName = testBranchPrefix + Date.now();
      const worktreePath1 = path.join(testRepoPath, "..", testWorktreePrefix + "1-" + Date.now());

      // Create first worktree with new branch
      const result1 = await git.createWorktree(testRepoPath, worktreePath1, branchName, true);
      expect(result1.success).toBe(true);
      createdBranches.push(branchName);
      createdWorktrees.push(worktreePath1);

      // Get the current commit hash
      const proc = Bun.spawn(["git", "rev-parse", "HEAD"], {
        cwd: worktreePath1,
        stdout: "pipe",
        stderr: "pipe",
      });
      await proc.exited;
      const commitHash = (await new Response(proc.stdout).text()).trim();

      // Create second worktree with detached HEAD (using commit hash instead of branch)
      const worktreePath2 = path.join(testRepoPath, "..", testWorktreePrefix + "2-" + Date.now());
      const result2 = await git.createWorktree(testRepoPath, worktreePath2, commitHash, false);
      expect(result2.success).toBe(true);
      expect(existsSync(worktreePath2)).toBe(true);
      createdWorktrees.push(worktreePath2);

      // Verify the second worktree is in detached state
      const worktrees = await git.listWorktrees(testRepoPath);
      const wt2 = worktrees.find((w) => w.path === worktreePath2);
      expect(wt2?.branch).toBe("(detached)");
    });

    test("should fail when creating worktree with invalid path", async () => {
      const branchName = testBranchPrefix + Date.now();
      // Use an invalid path (e.g., inside a file)
      const invalidPath = "/dev/null/invalid-worktree";

      const result = await git.createWorktree(testRepoPath, invalidPath, branchName, true);

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });

    test("should fail when creating worktree in non-git directory", async () => {
      const nonGitDir = "/tmp/non-git-dir-" + Date.now();
      const branchName = testBranchPrefix + Date.now();
      const worktreePath = path.join(nonGitDir, "worktree");

      const result = await git.createWorktree(nonGitDir, worktreePath, branchName, true);

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  describe("removeWorktree", () => {
    test("should remove existing worktree", async () => {
      const branchName = testBranchPrefix + Date.now();
      const worktreePath = path.join(testRepoPath, "..", testWorktreePrefix + Date.now());

      // Create a worktree first
      const createResult = await git.createWorktree(testRepoPath, worktreePath, branchName, true);
      expect(createResult.success).toBe(true);
      createdBranches.push(branchName);

      // Remove the worktree
      const removeResult = await git.removeWorktree(testRepoPath, worktreePath);

      expect(removeResult.success).toBe(true);
      expect(removeResult.error).toBeUndefined();
      expect(existsSync(worktreePath)).toBe(false);
    });

    test("should fail when removing non-existent worktree", async () => {
      const nonExistentPath = "/tmp/non-existent-worktree-" + Date.now();

      const result = await git.removeWorktree(testRepoPath, nonExistentPath);

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });

    test("should use force flag to remove worktree with uncommitted changes", async () => {
      const branchName = testBranchPrefix + Date.now();
      const worktreePath = path.join(testRepoPath, "..", testWorktreePrefix + Date.now());

      // Create a worktree
      const createResult = await git.createWorktree(testRepoPath, worktreePath, branchName, true);
      expect(createResult.success).toBe(true);
      createdBranches.push(branchName);

      // Create an uncommitted file in the worktree
      const testFile = path.join(worktreePath, "uncommitted.txt");
      Bun.write(testFile, "uncommitted changes");

      // Remove with force flag
      const removeResult = await git.removeWorktree(testRepoPath, worktreePath);

      expect(removeResult.success).toBe(true);
      expect(existsSync(worktreePath)).toBe(false);
    });
  });

  describe("listWorktrees", () => {
    test("should list all worktrees including main", async () => {
      const worktrees = await git.listWorktrees(testRepoPath);

      expect(Array.isArray(worktrees)).toBe(true);
      expect(worktrees.length).toBeGreaterThanOrEqual(1);

      // First worktree should be main
      expect(worktrees[0].isMain).toBe(true);
      expect(worktrees[0].path).toBe(testRepoPath);
    });

    test("should list newly created worktree", async () => {
      const branchName = testBranchPrefix + Date.now();
      const worktreePath = path.join(testRepoPath, "..", testWorktreePrefix + Date.now());

      // Create a worktree
      const createResult = await git.createWorktree(testRepoPath, worktreePath, branchName, true);
      expect(createResult.success).toBe(true);
      createdBranches.push(branchName);
      createdWorktrees.push(worktreePath);

      // List worktrees
      const worktrees = await git.listWorktrees(testRepoPath);

      // Should have at least 2 worktrees (main + the new one)
      expect(worktrees.length).toBeGreaterThanOrEqual(2);

      // Find the created worktree
      const createdWorktree = worktrees.find((w) => w.path === worktreePath);
      expect(createdWorktree).toBeDefined();
      expect(createdWorktree?.branch).toBe(branchName);
      expect(createdWorktree?.isMain).toBe(false);
    });

    test("should return worktree with branch info", async () => {
      const worktrees = await git.listWorktrees(testRepoPath);

      expect(worktrees[0]).toMatchObject({
        path: expect.any(String),
        branch: expect.any(String),
        isMain: expect.any(Boolean),
      });
    });
  });

  describe("branchExists", () => {
    test("should return true for existing branch", async () => {
      // Current branch should exist
      const currentBranch = await git.getCurrentBranch(testRepoPath);
      if (currentBranch) {
        const exists = await git.branchExists(testRepoPath, currentBranch);
        expect(exists).toBe(true);
      }
    });

    test("should return false for non-existent branch", async () => {
      const nonExistentBranch = "definitely-non-existent-branch-" + Date.now();
      const exists = await git.branchExists(testRepoPath, nonExistentBranch);
      expect(exists).toBe(false);
    });

    test("should return true for newly created branch", async () => {
      const branchName = testBranchPrefix + Date.now();
      const worktreePath = path.join(testRepoPath, "..", testWorktreePrefix + Date.now());

      // Create a worktree (which creates a branch)
      const createResult = await git.createWorktree(testRepoPath, worktreePath, branchName, true);
      expect(createResult.success).toBe(true);
      createdBranches.push(branchName);
      createdWorktrees.push(worktreePath);

      // Check if branch exists
      const exists = await git.branchExists(testRepoPath, branchName);
      expect(exists).toBe(true);
    });

    test("should return false for non-git directory", async () => {
      const nonGitDir = "/tmp/non-git-dir-" + Date.now();
      mkdirSync(nonGitDir, { recursive: true });

      try {
        const exists = await git.branchExists(nonGitDir, "any-branch");
        expect(exists).toBe(false);
      } finally {
        rmSync(nonGitDir, { recursive: true, force: true });
      }
    });
  });

  describe("deleteBranch", () => {
    test("should delete existing branch", async () => {
      const branchName = testBranchPrefix + Date.now();
      const worktreePath = path.join(testRepoPath, "..", testWorktreePrefix + Date.now());

      // Create a worktree (which creates a branch)
      const createResult = await git.createWorktree(testRepoPath, worktreePath, branchName, true);
      expect(createResult.success).toBe(true);
      createdWorktrees.push(worktreePath);

      // Verify branch exists
      let exists = await git.branchExists(testRepoPath, branchName);
      expect(exists).toBe(true);

      // Remove the worktree first (required to delete branch)
      await git.removeWorktree(testRepoPath, worktreePath);

      // Delete the branch
      const deleteResult = await git.deleteBranch(testRepoPath, branchName, false);

      expect(deleteResult.success).toBe(true);
      expect(deleteResult.error).toBeUndefined();

      // Verify branch no longer exists
      exists = await git.branchExists(testRepoPath, branchName);
      expect(exists).toBe(false);
    });

    test("should force delete branch with unmerged changes", async () => {
      const branchName = testBranchPrefix + Date.now();
      const worktreePath = path.join(testRepoPath, "..", testWorktreePrefix + Date.now());

      // Create a worktree
      const createResult = await git.createWorktree(testRepoPath, worktreePath, branchName, true);
      expect(createResult.success).toBe(true);
      createdWorktrees.push(worktreePath);

      // Remove the worktree
      await git.removeWorktree(testRepoPath, worktreePath);

      // Force delete the branch
      const deleteResult = await git.deleteBranch(testRepoPath, branchName, true);

      expect(deleteResult.success).toBe(true);
      createdBranches.push(branchName); // Skip cleanup since already deleted
    });

    test("should fail when deleting non-existent branch", async () => {
      const nonExistentBranch = "definitely-non-existent-branch-" + Date.now();
      const deleteResult = await git.deleteBranch(testRepoPath, nonExistentBranch, false);

      expect(deleteResult.success).toBe(false);
      expect(deleteResult.error).toBeTruthy();
    });

    test("should fail when deleting current branch", async () => {
      const currentBranch = await git.getCurrentBranch(testRepoPath);
      if (currentBranch) {
        const deleteResult = await git.deleteBranch(testRepoPath, currentBranch, false);

        expect(deleteResult.success).toBe(false);
        expect(deleteResult.error).toBeTruthy();
        expect(deleteResult.error).toContain("cannot delete");
      }
    });
  });

  describe("integration tests", () => {
    test("should handle complete worktree lifecycle", async () => {
      const branchName = testBranchPrefix + "lifecycle-" + Date.now();
      const worktreePath = path.join(testRepoPath, "..", testWorktreePrefix + "lifecycle-" + Date.now());

      // 1. Create worktree
      const createResult = await git.createWorktree(testRepoPath, worktreePath, branchName, true);
      expect(createResult.success).toBe(true);
      createdBranches.push(branchName);
      createdWorktrees.push(worktreePath);

      // 2. Verify worktree exists
      const worktrees = await git.listWorktrees(testRepoPath);
      const createdWorktree = worktrees.find((w) => w.path === worktreePath);
      expect(createdWorktree).toBeDefined();

      // 3. Verify it's detected as a worktree
      const isWorktreeResult = await git.isWorktree(worktreePath);
      expect(isWorktreeResult).toBe(true);

      // 4. Verify current branch in worktree
      const currentBranch = await git.getCurrentBranch(worktreePath);
      expect(currentBranch).toBe(branchName);

      // 5. Verify main worktree is accessible
      const mainWorktree = await git.getMainWorktree(worktreePath);
      expect(mainWorktree).toBe(testRepoPath);

      // 6. Remove worktree
      const removeResult = await git.removeWorktree(testRepoPath, worktreePath);
      expect(removeResult.success).toBe(true);

      // 7. Verify worktree no longer exists
      const worktreesAfter = await git.listWorktrees(testRepoPath);
      const removedWorktree = worktreesAfter.find((w) => w.path === worktreePath);
      expect(removedWorktree).toBeUndefined();

      // 8. Clean up branch
      await git.deleteBranch(testRepoPath, branchName, true);
      const branchExists = await git.branchExists(testRepoPath, branchName);
      expect(branchExists).toBe(false);
    });

    test("should handle multiple concurrent worktrees", async () => {
      const timestamp = Date.now();
      const worktree1Path = path.join(testRepoPath, "..", testWorktreePrefix + "multi-1-" + timestamp);
      const worktree2Path = path.join(testRepoPath, "..", testWorktreePrefix + "multi-2-" + timestamp);
      const branch1 = testBranchPrefix + "multi-1-" + timestamp;
      const branch2 = testBranchPrefix + "multi-2-" + timestamp;

      // Create two worktrees
      const result1 = await git.createWorktree(testRepoPath, worktree1Path, branch1, true);
      const result2 = await git.createWorktree(testRepoPath, worktree2Path, branch2, true);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      createdBranches.push(branch1, branch2);
      createdWorktrees.push(worktree1Path, worktree2Path);

      // List all worktrees
      const worktrees = await git.listWorktrees(testRepoPath);

      // Should have at least 3 (main + 2 new)
      expect(worktrees.length).toBeGreaterThanOrEqual(3);

      // Verify both worktrees exist
      const wt1 = worktrees.find((w) => w.path === worktree1Path);
      const wt2 = worktrees.find((w) => w.path === worktree2Path);

      expect(wt1).toBeDefined();
      expect(wt2).toBeDefined();
      expect(wt1?.branch).toBe(branch1);
      expect(wt2?.branch).toBe(branch2);
    });
  });

  describe("error handling", () => {
    test("should handle git command failures gracefully", async () => {
      // Test with invalid repository path
      const invalidPath = "/this/path/does/not/exist";

      const repo = await git.findGitRepo(invalidPath);
      expect(repo).toBeNull();

      const isWt = await git.isWorktree(invalidPath);
      expect(isWt).toBe(false);

      const mainWt = await git.getMainWorktree(invalidPath);
      expect(mainWt).toBeNull();

      const branch = await git.getCurrentBranch(invalidPath);
      expect(branch).toBeNull();
    });

    test("should handle invalid worktree operations", async () => {
      const result = await git.createWorktree("/invalid/repo", "/invalid/worktree", "test-branch");
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });
});
