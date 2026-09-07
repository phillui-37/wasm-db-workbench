import { defineConfig, loadEnv } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

const normalizeViteBase = (raw: string | undefined): string => {
  const trimmed = (raw ?? "/wasm-db-workbench").trim() || "/"
  if (trimmed === "/") return "/"
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`
  return withSlash.endsWith("/") ? withSlash : `${withSlash}/`
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  const base = normalizeViteBase(env.VITE_BASE_PATH ?? process.env.VITE_BASE_PATH)
  const baseNoSlash = base === "/" ? "" : base.replace(/\/$/, "")

  return {
    base,
    plugins: [
      react(),
      tailwindcss(),
      {
        name: "stub-pglite-nodefs",
        load(id) {
          const normalized = id.replaceAll("\\", "/")
          if (normalized.includes("@electric-sql/pglite") && normalized.includes("/fs/nodefs")) {
            return "export default {}"
          }
        }
      }
    ],
    optimizeDeps: {
      exclude: ["@electric-sql/pglite", "@sqlite.org/sqlite-wasm"]
    },
    build: {
      reportCompressedSize: false,
      sourcemap: false,
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
        ...(baseNoSlash
          ? {
              [`${baseNoSlash}/api`]: {
                target: "http://127.0.0.1:8080",
                rewrite: (path) => path.slice(baseNoSlash.length)
              },
              [`${baseNoSlash}/docs`]: {
                target: "http://127.0.0.1:8080",
                rewrite: (path) => path.slice(baseNoSlash.length)
              }
            }
          : {}),
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
  }
})
