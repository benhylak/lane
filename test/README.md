# Testing with Bun

This directory contains tests for the Lane CLI tool using Bun's built-in test framework.

## Running Tests

```bash
# Run all tests
bun test

# Run tests in watch mode
bun test --watch

# Run tests with coverage
bun test --coverage

# Run a specific test file
bun test path/to/test.test.ts

# Run tests matching a pattern
bun test cli.test.ts
```

## Test Structure

```
test/
├── setup.ts           # Test setup and utilities
├── example.test.ts    # Example test file
├── cli.test.ts        # CLI command tests (to be created)
├── git.test.ts        # Git operation tests (to be created)
└── README.md          # This file
```

## Writing Tests

Bun's test framework provides a Jest-like API:

```typescript
import { describe, expect, test, beforeEach, afterEach } from 'bun:test';

describe('Feature Name', () => {
  beforeEach(() => {
    // Setup before each test
  });

  afterEach(() => {
    // Cleanup after each test
  });

  test('should do something', () => {
    expect(1 + 1).toBe(2);
  });

  test('async test', async () => {
    const result = await someAsyncFunction();
    expect(result).toBe('expected');
  });
});
```

## Available Assertions

```typescript
// Equality
expect(actual).toBe(expected)
expect(actual).toEqual(expected)
expect(actual).toStrictEqual(expected)

// Truthiness
expect(value).toBeTruthy()
expect(value).toBeFalsy()
expect(value).toBeDefined()
expect(value).toBeNull()
expect(value).toBeUndefined()

// Numbers
expect(number).toBeGreaterThan(5)
expect(number).toBeLessThanOrEqual(10)

// Strings
expect(string).toContain('substring')
expect(string).toMatch(/regex/)

// Arrays
expect(array).toHaveLength(3)
expect(array).toContain(item)

// Objects
expect(object).toHaveProperty('key')
expect(object).toMatchObject({ key: 'value' })

// Async
await expect(promise).resolves.toBe(value)
await expect(promise).rejects.toThrow()
```

## Testing CLI Tools

When testing CLI commands:

1. **Use temporary directories** - Create isolated test environments
2. **Mock external dependencies** - Mock git commands, file system operations
3. **Test exit codes** - Verify commands exit with correct status
4. **Capture output** - Test stdout/stderr output

```typescript
test('should create a new lane', async () => {
  const tempDir = testUtils.createTempDir('create-lane');
  try {
    // Run your CLI command
    const result = Bun.spawn(['bun', './src/cli/index.ts', 'create', 'test'], {
      cwd: tempDir,
      stdout: 'pipe',
    });

    const output = await new Response(result.stdout).text();
    expect(output).toContain('created');
  } finally {
    testUtils.cleanupTempDir(tempDir);
  }
});
```

## Coverage

Generate coverage reports:

```bash
bun test --coverage
```

Coverage reports will be generated in the `coverage/` directory.

## Best Practices

1. **Arrange-Act-Assert** - Structure tests clearly
2. **One assertion per test** - Keep tests focused
3. **Descriptive test names** - Explain what is being tested
4. **Test behavior, not implementation** - Focus on outcomes
5. **Keep tests fast** - Mock slow operations (network, git)
6. **Use beforeEach/afterEach** - Maintain clean test state
