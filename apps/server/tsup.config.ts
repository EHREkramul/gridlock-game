import { defineConfig } from 'tsup';

// The engine workspace ships TypeScript sources, so it is bundled into the
// server build; everything else stays an ordinary node_modules dependency.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: ['@gridlock/engine'],
});
