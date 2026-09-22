import { describe, expect, it } from "@effect/vitest"
import { normalizeBasePath, stripBasePath } from "../src/http/base-path.ts"

describe("normalizeBasePath", () => {
  it("normalizes variants", () => {
    expect(normalizeBasePath(undefined)).toBe("")
    expect(normalizeBasePath("")).toBe("")
    expect(normalizeBasePath("/")).toBe("")
    expect(normalizeBasePath("wasm-db-workbench")).toBe("/wasm-db-workbench")
    expect(normalizeBasePath("/wasm-db-workbench")).toBe("/wasm-db-workbench")
    expect(normalizeBasePath("/wasm-db-workbench/")).toBe("/wasm-db-workbench")
  })
})

describe("stripBasePath", () => {
  it("leaves root paths alone when BASE_PATH is /", () => {
    expect(stripBasePath("/assets/app.js", "")).toBe("/assets/app.js")
    expect(stripBasePath("/api/health", "")).toBe("/api/health")
  })

  it("strips the legacy /wasm-db-workbench prefix even when BASE_PATH is /", () => {
    expect(stripBasePath("/wasm-db-workbench", "")).toBe("/")
    expect(stripBasePath("/wasm-db-workbench/", "")).toBe("/")
    expect(stripBasePath("/wasm-db-workbench/assets/app.js", "")).toBe("/assets/app.js")
    expect(stripBasePath("/wasm-db-workbench/api/health", "")).toBe("/api/health")
    expect(stripBasePath("/wasm-db-workbench?x=1", "")).toBe("/?x=1")
  })

  it("strips a configured subpath", () => {
    expect(stripBasePath("/wasm-db-workbench/assets/app.js", "/wasm-db-workbench")).toBe(
      "/assets/app.js"
    )
  })
})
