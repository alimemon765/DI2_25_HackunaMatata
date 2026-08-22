import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The original Figma Make config has been kept as vite.config.figma-make.ts.bak.
// It imports `.figma/make/site.json` and installs Make-platform plugins (WS
// interception, HTML bootstrap, route analysis) that only work inside Figma's
// runtime, so it cannot build here. Nothing in the app itself depended on it.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Proxied so the browser can use same-origin paths in dev. The API also
    // sets permissive localhost CORS, so a direct VITE_API_BASE works too.
    proxy: Object.fromEntries(
      ['/events', '/summary', '/stats', '/health', '/clips', '/clips_annotated', '/debug']
        .map((p) => [p, { target: 'http://localhost:8000', changeOrigin: true }]),
    ),
  },
})
