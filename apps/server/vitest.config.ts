import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // rooms share one in-process Colyseus server; run files one after another
    fileParallelism: false,
    // Colyseus probes for PM2 via process.send(), which breaks vitest's forked workers
    pool: 'threads',
    coverage: { provider: 'v8', include: ['src/**'], reporter: ['text-summary', 'lcov'] },
  },
});
