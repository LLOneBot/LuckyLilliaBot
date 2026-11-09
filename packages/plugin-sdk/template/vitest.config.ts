import { defineConfig } from 'vitest/config'

// A config of its own: without one, vitest takes the nearest parent project's (the Bot's repo, a monorepo), which
// looks for tests somewhere else and finds none here
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
})
