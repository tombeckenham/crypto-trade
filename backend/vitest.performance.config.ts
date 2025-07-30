import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Performance test environment
    environment: 'node',
    
    // Longer timeouts for performance tests
    testTimeout: 30000,
    hookTimeout: 10000,
    
    // Test file patterns for performance tests
    include: ['src/**/*.performance.test.{js,ts}'],
    exclude: ['node_modules/**', 'dist/**'],
    
    // Run performance tests sequentially to avoid resource contention
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
      }
    },
    
    // Reporter configuration
    reporter: ['verbose'],
    
    // No coverage for performance tests
    coverage: {
      enabled: false
    }
  }
});