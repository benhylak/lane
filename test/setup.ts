/**
 * Test setup file for Bun test framework
 * This file runs before each test file and provides common utilities
 */

// Set test environment variables
process.env.NODE_ENV = 'test';

// Mock console methods to reduce noise in tests (optional)
const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info,
};

// You can uncomment this to suppress console output during tests
// console.log = () => {};
// console.error = () => {};
// console.warn = () => {};
// console.info = () => {};

// Export test utilities
export const testUtils = {
  // Restore console methods if needed
  restoreConsole: () => {
    Object.assign(console, originalConsole);
  },

  // Create a temporary directory for test isolation
  createTempDir: (name: string): string => {
    const tempDir = `/tmp/lane-test-${name}-${Date.now()}`;
    Bun.$`mkdir -p ${tempDir}`;
    return tempDir;
  },

  // Clean up temporary directory
  cleanupTempDir: (dir: string) => {
    Bun.$`rm -rf ${dir}`.quiet();
  },
};

// Global teardown (runs after all tests)
process.on('beforeExit', () => {
  // Clean up any global resources
});
