import { defineConfig } from "vitest/config"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      "@workbench/shared": path.join(root, "shared/src/index.ts")
    }
  },
  test: {
    include: ["shared/test/**/*.test.ts", "backend/test/**/*.test.ts"]
  }
})
