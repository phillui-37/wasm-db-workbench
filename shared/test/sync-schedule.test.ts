import { describe, expect, it } from "@effect/vitest"
import { debouncedSync, intervalSync } from "@workbench/shared"
import { Effect, Fiber, Ref, TestClock } from "effect"

describe("sync schedules", () => {
  it.effect("interval sync fires after TestClock adjust", () =>
    Effect.gen(function* () {
      const count = yield* Ref.make(0)
      const push = Ref.update(count, (n) => n + 1)
      const fiber = yield* Effect.fork(intervalSync(push, 60))
      yield* TestClock.adjust("60 seconds")
      yield* Effect.yieldNow()
      const n = yield* Ref.get(count)
      expect(n).toBeGreaterThanOrEqual(1)
      yield* Fiber.interrupt(fiber)
    })
  )

  it.effect("debounced sync waits then runs", () =>
    Effect.gen(function* () {
      const count = yield* Ref.make(0)
      const fiber = yield* Effect.fork(debouncedSync(Ref.update(count, (n) => n + 1), 2000))
      yield* TestClock.adjust("1999 millis")
      expect(yield* Ref.get(count)).toBe(0)
      yield* TestClock.adjust("2 millis")
      yield* fiber.await
      expect(yield* Ref.get(count)).toBe(1)
    })
  )
})
