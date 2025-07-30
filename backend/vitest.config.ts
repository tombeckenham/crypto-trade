import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test environment configuration
    environment: 'node',

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.d.ts',
        'vitest.config.ts',
        'src/index.ts' // Main entry point, tested via integration
      ]
    },

    // Test file patterns
    include: ['src/**/*.{test,spec}.{js,ts}', 'tests/**/*.{test,spec}.{js,ts}'],
    exclude: ['node_modules/**', 'dist/**'],

    // Timeout settings for performance-critical tests
    testTimeout: 10000,
    hookTimeout: 10000,

    // Run tests in parallel for better performance
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
      }
    },

    // Global test setup
    globals: true,

    // Watch options
    watch: false
  }
});