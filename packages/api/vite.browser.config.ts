import path from 'path';

import peggyLoader from 'vite-plugin-peggy-loader';
import { defineConfig } from 'vitest/config';

const distDir = path.resolve(__dirname, 'dist');

export default defineConfig({
  build: {
    target: 'esnext',
    outDir: distDir,
    emptyOutDir: false,
    sourcemap: true,
    lib: {
      entry: path.resolve(__dirname, 'index.browser.ts'),
      formats: ['es'],
      fileName: () => 'browser.js',
    },
  },
  plugins: [peggyLoader()],
  resolve: {
    // Default extensions — picks up browser implementations (index.ts)
    // instead of .api.ts (which resolves to Node.js/Electron code)
    extensions: ['.js', '.ts', '.tsx', '.json'],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.browser.ts'],
    include: ['test/**/*.test.ts'],
    maxWorkers: 2,
  },
});
