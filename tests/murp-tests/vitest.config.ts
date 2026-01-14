import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Test file patterns
    include: [
      '**/*.test.ts',
      '**/*.spec.ts'
    ],
    
    // Exclude patterns
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.{idea,git,cache,output,temp}/**'
    ],
    
    // Global test setup
    globals: true,
    
    // Environment
    environment: 'node',
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'src/**/*.ts',
        'lib/**/*.ts'
      ],
      exclude: [
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/types/**',
        '**/__fixtures__/**',
        '**/__helpers__/**'
      ],
      // Minimum coverage thresholds
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80
      }
    },
    
    // Test timeout (in milliseconds)
    testTimeout: 10000,
    
    // Hook timeout
    hookTimeout: 10000,
    
    // Reporter configuration
    reporters: ['verbose'],
    
    // Watch mode exclusions
    watchExclude: [
      '**/node_modules/**',
      '**/dist/**'
    ],
    
    // Alias configuration (match your tsconfig paths)
    alias: {
      '@fixtures': path.resolve(__dirname, './__fixtures__'),
      '@helpers': path.resolve(__dirname, './__helpers__'),
    },
    
    // Pool configuration for parallel test execution
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        isolate: true
      }
    },
    
    // Sequence configuration
    sequence: {
      shuffle: false, // Set to true for randomized test order
      concurrent: false // Set to true for concurrent test execution
    }
  }
});
