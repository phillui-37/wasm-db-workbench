import { describe, expect, it } from "@effect/vitest"
import { AppConfig, defaultAppConfig } from "@workbench/shared"
import { Effect, Schema } from "effect"

describe("AppConfig schema", () => {
  it.effect("round-trips the default config", () =>
    Effect.gen(function* () {
      const encoded = yield* Schema.encode(AppConfig)(defaultAppConfig)
      const decoded = yield* Schema.decodeUnknown(AppConfig)(encoded)
      expect(decoded.sync.trigger).toBe("manual")
      expect(decoded.defaults.engine).toBe("pglite")
    })
  )

  it.effect("fails on invalid objects", () =>
    Effect.gen(function* () {
      const result = yield* Schema.decodeUnknown(AppConfig)({ editor: true }).pipe(Effect.either)
      expect(result._tag).toBe("Left")
    })
  )
})
