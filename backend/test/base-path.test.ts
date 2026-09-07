import { describe, expect, it } from "@effect/vitest"
import { normalizeBasePath } from "../src/http/base-path.ts"

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
