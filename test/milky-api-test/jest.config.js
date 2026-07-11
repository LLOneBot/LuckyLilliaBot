export default {
  preset: 'ts-jest/presets/default-esm',
  rootDir: '.',
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
    '**/tests/**/*.spec.ts',
  ],
  reporters: [
    'default',
    [
      'jest-html-reporter',
      {
        pageTitle: 'Milky API Test Report',
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
  maxWorkers: 1,
  forceExit: true,
}
