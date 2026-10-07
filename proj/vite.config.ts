import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve, join, relative, sep } from 'node:path';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import type { Plugin } from 'vite';

/** Writes dist/sw.js: the service worker template plus the list of every built file. */
function offlineServiceWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'calcink-offline-sw',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const full = join(dir, name);
          if (statSync(full).isDirectory()) walk(full);
          else if (name !== 'sw.js') files.push(relative(outDir, full).split(sep).join('/'));
        }
      };
      walk(outDir);
      const shell = ['./', ...files].sort();
      const buildId = String(files.length) + '-' + Date.now().toString(36);
      const template = readFileSync(resolve(__dirname, 'sw/sw.template.js'), 'utf8');
      writeFileSync(
        join(outDir, 'sw.js'),
        template.replace('__BUILD_ID__', buildId).replace('__PRECACHE__', JSON.stringify(shell)),
      );
    },
  };
}

// Cross-origin isolation (COOP/COEP) enables multi-threaded WASM. It is an
// enhancement only: the app must keep working when it is absent.
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  plugins: [react(), offlineServiceWorker()],
  // use onnxruntime-web without its built-in copy of the WASM file: we serve ours from /ort/ (one copy, works offline)
  resolve: { conditions: ['onnxruntime-web-use-extern-wasm'] },
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});