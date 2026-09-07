import { Duration, Effect, Schedule } from "effect"

export const intervalSync = <A, E, R>(
  push: Effect.Effect<A, E, R>,
  intervalSeconds: number
): Effect.Effect<A, E, R> => Effect.repeat(push, Schedule.spaced(Duration.seconds(intervalSeconds)))

export const debouncedSync = <A, E, R>(
  push: Effect.Effect<A, E, R>,
  debounceMs: number
): Effect.Effect<A, E, R> => Effect.sleep(Duration.millis(debounceMs)).pipe(Effect.andThen(push))
