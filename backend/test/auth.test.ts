import { describe, expect, it } from "@effect/vitest"
import {
  createSessionToken,
  loadAuthEnv,
  passwordsMatch,
  verifySessionToken
} from "../src/http/auth.ts"

describe("auth tokens", () => {
  it("round-trips a valid session", () => {
    const token = createSessionToken("admin", "secret", 1_000_000)
    expect(verifySessionToken(token, "secret", "admin", 1_000_000)).toBe(true)
  })

  it("rejects wrong user, secret, or expiry", () => {
    const token = createSessionToken("admin", "secret", 1_000_000)
    expect(verifySessionToken(token, "secret", "other", 1_000_000)).toBe(false)
    expect(verifySessionToken(token, "nope", "admin", 1_000_000)).toBe(false)
    expect(verifySessionToken(token, "secret", "admin", 1_000_000 + 1000 * 60 * 60 * 24 * 8)).toBe(false)
  })

  it("compares passwords in constant-ish time", () => {
    expect(passwordsMatch("abc", "abc")).toBe(true)
    expect(passwordsMatch("abc", "abd")).toBe(false)
    expect(passwordsMatch("ab", "abc")).toBe(false)
  })

  it("requires credentials when enabled", () => {
    expect(() =>
      loadAuthEnv({
        enabled: true,
        username: "",
        password: "x",
        secret: undefined,
        basePath: "/wasm-db-workbench",
        cookieSecure: true
      })
    ).toThrow(/AUTH_USERNAME/)
  })
})
