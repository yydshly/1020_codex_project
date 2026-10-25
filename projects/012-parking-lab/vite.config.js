import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: './',
  build: { outDir: 'web', emptyOutDir: false, chunkSizeWarningLimit: 650,
    rolldownOptions: { input: {
      main: fileURLToPath(new URL('./index.html', import.meta.url)),
      courses: fileURLToPath(new URL('./courses.html', import.meta.url)),
      progress: fileURLToPath(new URL('./progress.html', import.meta.url)),
    } },
  },
});
