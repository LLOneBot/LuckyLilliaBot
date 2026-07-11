export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@llbot/(.*)$': '<rootDir>/../../src/$1',
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
  ],
  reporters: [
    'default',
    [
      'jest-html-reporter',
      {
        pageTitle: 'WebQQ API Test Report',
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
  // 禁用并发：每个 endpoint 测试都打到同一个 bot, 单 worker 避免速率限制 / 状态污染
  maxWorkers: 1,
};
