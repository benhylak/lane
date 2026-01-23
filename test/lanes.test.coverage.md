# Test Coverage for lanes.ts

## Summary
- **Total Tests**: 64
- **Passing**: 64
- **Failing**: 0
- **Test Framework**: Bun test

## Test Coverage by Function

### 1. getLanePath()
- **Tests**: 3
- **Coverage**:
  - Generate correct lane path for standard names
  - Handle lane names with slashes (git branch syntax)
  - Handle special characters in lane names

### 2. getMainRepoRoot()
- **Tests**: 4
- **Coverage**:
  - Return main repo root when in main repo
  - Return null when not in a git repository
  - Detect full-copy lane via `.lane-origin` file
  - Handle missing `.lane-origin` file gracefully

### 3. copyUntrackedFiles()
- **Tests**: 4
- **Coverage**:
  - Copy untracked files between directories
  - Skip files matching specified patterns
  - Copy nested untracked files
  - Handle missing source files gracefully

### 4. detectPackageManagers()
- **Tests**: 16
- **Coverage**:
  - Node.js: bun, npm, pnpm, yarn
  - Python: poetry, pipenv, uv, pip
  - Rust: cargo
  - Ruby: bundler
  - Go: go
  - PHP: composer
  - Elixir: mix
  - Java: gradle, maven
  - Swift: swift
  - Only one manager per ecosystem
  - Return empty array when no package manager detected

### 5. runPackageInstall()
- **Tests**: 2
- **Coverage**:
  - Return no managers when none detected
  - Detect package managers without running (mocked)

### 6. listAllLanes()
- **Tests**: 4
- **Coverage**:
  - List main repo when no lanes exist
  - List all lanes including main
  - Mark current lane correctly
  - Return empty array when not in git repo

### 7. getLaneForSwitch()
- **Tests**: 4
- **Coverage**:
  - Return main when requesting main
  - Return origin as alias for main
  - Return existing lane
  - Return null for non-existent lane
  - Return null when not in git repo

### 8. findLaneByBranch()
- **Tests**: 2
- **Coverage**:
  - Find lane by branch name
  - Return null when branch not found

### 9. createLane()
- **Tests**: 3
- **Coverage**:
  - Fail when not in git repository
  - Fail when lane directory already exists
  - Register lane in config with worktree mode (mocked git)

### 10. removeLaneCmd() (deleteLane)
- **Tests**: 4
- **Coverage**:
  - Fail when lane not found
  - Remove lane directory
  - Remove lane from config
  - Handle missing lane directory gracefully

### 11. renameLane() (renameCurrentLane)
- **Tests**: 4
- **Coverage**:
  - Fail when not in git repository
  - Fail when lane not found
  - Fail when new path already exists
  - Rename lane directory
  - Update config with new name and path

### 12. syncLane() (syncLaneFromMain)
- **Tests**: 5
- **Coverage**:
  - Fail when not in git repository
  - Fail when lane not found
  - Copy untracked files from main to lane
  - Sync to current lane when no name specified
  - Fail when syncing from main to main
  - Respect skip patterns from config

### 13. Integration Tests
- **Tests**: 2
- **Coverage**:
  - Complete lane lifecycle (create, list, delete)
  - Lane path generation with various formats

### 14. Edge Cases and Error Handling
- **Tests**: 4
- **Coverage**:
  - Special characters in lane names
  - Empty lane list in findLaneByBranch
  - Missing config gracefully
  - Multiple package managers from different ecosystems

## Test Utilities

### setupTestRepo()
Creates a minimal git repository structure for testing, including:
- `.git` directory with objects, refs, and heads
- Git config file
- HEAD file pointing to main branch
- README.md and package.json
- Lanes configuration

### normalizePath()
Handles macOS symlink resolution (`/tmp` -> `/private/tmp`)

### cleanupTestDir()
Recursively removes test directories

## Mocking Strategy

### Git Operations
- `Bun.spawn` is mocked to prevent actual git command execution
- Mock processes return immediately with predefined exit codes
- Mock ReadableStreams for stdout/stderr

### File System
- Uses temporary directories in `/tmp`
- Creates realistic git repository structures
- Cleans up after each test

## Key Testing Patterns

1. **Path Normalization**: Handles macOS `/tmp` -> `/private/tmp` symlinks
2. **Git Repository Structure**: Creates minimal but complete git structures
3. **Configuration Management**: Tests lane config persistence
4. **Error Handling**: Verifies proper error messages and cleanup
5. **Mock Restoration**: Ensures mocks are cleaned up after each test
6. **Async Testing**: Properly handles async operations and timeouts

## Coverage Gaps

The following scenarios are NOT fully tested due to limitations in test environment:
- Actual git worktree creation (requires real git repository)
- Full copy mode with rsync (requires rsync and actual files)
- Real package manager installation (requires actual package managers)

These are handled through mocking and integration testing patterns.
