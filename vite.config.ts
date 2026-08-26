import { defineConfig } from 'vite';

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    watch: {
      ignored: ['**/src-tauri/**', '**/legacy-freeform/**'],
    },
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    // Windows targets WebView2 (Chromium) and Linux targets WebKitGTK; both are modern,
    // so there is no need for the old Safari-13-level target the default Tauri+Vite
    // template uses for macOS (which this project does not build for).
    target: 'chrome105',
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
