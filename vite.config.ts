import { InlineConfig, defineConfig } from 'vite'
import { build } from "vite";
import cp from 'vite-plugin-cp';
import pkg from './package.json' assert { type: 'json' };
const externalAll = ["electron", "fs/promises", "fs", "url", "util", "path", /node:/, ...Object.keys(pkg.dependencies)];
console.log(externalAll);
function createConfig(library: string, path: string, emptyOutDir: boolean): InlineConfig {
  return {
    configFile: false,
    build: {
      emptyOutDir: emptyOutDir,
      lib: {
        formats: ["cjs"],
        entry: { [library]: path }
      },
      rollupOptions: {
        external: externalAll,
      }
    }
  };
}
export function BuildPlugin() {
  build(createConfig("main", "src/main/main.ts", false));
  build(createConfig("preload", "src/preload.ts", false));
}

BuildPlugin();

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      formats: ['es'],
      entry: { ["renderer"]: `src/renderer.ts` },
    },
    rollupOptions: {
      external: externalAll
    }
  },
  plugins: [cp({ targets: [{ src: './package.json', dest: 'dist' }, { src: './manifest.json', dest: 'dist' }] })]
})
