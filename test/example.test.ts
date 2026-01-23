/**
 * Example test file demonstrating Bun's built-in test framework
 *
 * Run tests with: bun test
 * Watch mode: bun test --watch
 * Coverage: bun test --coverage
 */

import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { testUtils } from './setup';

// Example test suite
describe('Example Test Suite', () => {
  let tempDir: string;

  beforeEach(() => {
    // Setup before each test
    tempDir = testUtils.createTempDir('example');
  });

  afterEach(() => {
    // Cleanup after each test
    testUtils.cleanupTempDir(tempDir);
  });

  test('basic assertion', () => {
    expect(1 + 1).toBe(2);
  });

  test('string matching', () => {
    const message = 'Hello, Lane!';
    expect(message).toContain('Lane');
    expect(message).toMatch(/lane/i);
  });

  test('array operations', () => {
    const items = [1, 2, 3];
    expect(items).toHaveLength(3);
    expect(items).toContain(2);
    expect(items).toEqual([1, 2, 3]);
  });

  test('object matching', () => {
    const config = {
      name: 'lane',
      version: '0.1.0',
      features: ['worktree', 'git'],
    };
    expect(config).toHaveProperty('name', 'lane');
    expect(config.features).toBeArray();
    expect(config.features[0]).toBe('worktree');
  });

  test('async operations', async () => {
    const result = await Promise.resolve(42);
    expect(result).toBeGreaterThan(40);
  });

  test('temp directory creation', () => {
    expect(tempDir).toContain('/tmp/lane-test-example-');
  });
});

// Example: Testing a hypothetical CLI command
describe('CLI Command Tests (Example)', () => {
  test('should parse command line arguments', () => {
    // This is a placeholder showing how you might test CLI parsing
    const args = ['create', 'my-feature'];
    expect(args[0]).toBe('create');
    expect(args[1]).toMatch(/^my-/);
  });

  test('should handle git operations', async () => {
    // Example of how you might test git operations
    // Note: You'd typically mock these or use a test git repository
    const gitCommand = 'git status';
    expect(gitCommand).toContain('git');
  });
});
