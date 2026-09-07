import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    exclude: ["@electric-sql/pglite", "@sqlite.org/sqlite-wasm"]
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("monaco-editor") || id.includes("@monaco-editor")) return "monaco"
            if (id.includes("@mui")) return "mui"
            if (id.includes("@electric-sql/pglite")) return "pglite"
            if (id.includes("@sqlite.org/sqlite-wasm")) return "sqlite-wasm"
            if (id.includes("sql-formatter")) return "sql-formatter"
          }
        }
      }
    }
  },
  worker: {
    format: "es"
  },
  server: {
    port: 5173,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp"
    },
    proxy: {
      "/api": "http://127.0.0.1:8080",
      "/docs": "http://127.0.0.1:8080"
    }
  },
  preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp"
    }
  }
})
