import { describe, expect, it } from "@effect/vitest"
import { DbEngine, makeTestEngine } from "@workbench/shared"
import { Effect, Fiber, Layer } from "effect"

describe("DbEngine test layer", () => {
  it.effect("query returns catalog rows", () =>
    Effect.gen(function* () {
      const engine = yield* DbEngine
      const result = yield* engine.query("SELECT * FROM items")
      expect(result.rowCount).toBe(1)
      expect(result.columns).toContain("id")
    }).pipe(Effect.provide(Layer.succeed(DbEngine, makeTestEngine())))
  )

  it.live("interrupting a hanging query runs onInterrupt", () =>
    Effect.gen(function* () {
      const engine = makeTestEngine({ hangQuery: true }) as ReturnType<typeof makeTestEngine> & {
        wasInterrupted: () => boolean
      }
      const fiber = yield* Effect.fork(engine.query("SELECT 1"))
      yield* Effect.yieldNow()
      yield* Fiber.interrupt(fiber)
      expect(engine.wasInterrupted()).toBe(true)
    })
  )
})
