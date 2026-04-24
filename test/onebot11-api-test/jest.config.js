export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@llbot/(.*)$': '<rootDir>/../../src/$1',
    '^@llonebot/(.*)$': '<rootDir>/../../src/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        diagnostics: false,
        tsconfig: {
          module: 'ES2022',
          target: 'ES2022',
          paths: {
            '@/*': ['./*'],
            '@llbot/*': ['../../src/*'],
          },
        },
      },
    ],
  },
  testMatch: [
    '**/tests/**/*.test.ts',
    '**/tests/**/*.spec.ts',
  ],
  collectCoverageFrom: [
    'core/**/*.ts',
    'utils/**/*.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  reporters: [
    'default',
    [
      'jest-html-reporter',
      {
        pageTitle: 'OneBot11 API Test Report',
        outputPath: 'test-report.html',
        includeFailureMsg: true,
        includeConsoleLog: true,
        dateFormat: 'yyyy-mm-dd HH:MM:ss',
        sort: 'status',
      },
    ],
  ],
  testTimeout: 30000,
  verbose: true,
  // 禁用并发，按顺序执行测试文件，避免共享资源冲突
  maxWorkers: 1,
};
