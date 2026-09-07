import { describe, expect, it } from "@effect/vitest"
import { makeTestEngine } from "@workbench/shared"
import { Effect, Fiber } from "effect"

describe("test engine", () => {
  it.effect("query returns catalog rows", () =>
    Effect.gen(function* () {
      const engine = makeTestEngine()
      const result = yield* engine.query("SELECT * FROM items")
      const last = result.statements[0]
      expect(last?.rowCount).toBe(1)
      expect(last?.columns).toContain("id")
    })
  )

  it.live("interrupting a hanging query runs onInterrupt", () =>
    Effect.gen(function* () {
      const engine = makeTestEngine({ hangQuery: true })
      const fiber = yield* Effect.fork(engine.query("SELECT 1"))
      yield* Effect.yieldNow()
      yield* Fiber.interrupt(fiber)
      expect(engine.wasInterrupted()).toBe(true)
    })
  )
})
