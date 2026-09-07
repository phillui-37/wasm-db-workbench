import { ConnectionHub, ConnectionNotFound, SqlExecError, type EngineApi, type EngineType } from "@workbench/shared"
import { Effect, HashMap, Layer, Option, Ref } from "effect"
import { makePgliteEngine } from "./pglite-engine.ts"
import { makeSqliteEngine } from "./sqlite-engine.ts"

export const openEngine = (id: string, engine: EngineType): Effect.Effect<EngineApi, SqlExecError> =>
  engine === "pglite" ? makePgliteEngine(id) : makeSqliteEngine(id)

export const ConnectionHubLive = Layer.effect(
  ConnectionHub,
  Effect.gen(function* () {
    const map = yield* Ref.make(HashMap.empty<string, EngineApi>())
    return ConnectionHub.of({
      open: (id, engine) => Ref.update(map, HashMap.set(id, engine)),
      close: (id) =>
        Effect.gen(function* () {
          const current = yield* Ref.get(map)
          const found = HashMap.get(current, id)
          if (Option.isSome(found)) yield* found.value.close
          yield* Ref.update(map, HashMap.remove(id))
        }),
      get: (id) =>
        Effect.gen(function* () {
          const current = yield* Ref.get(map)
          const found = HashMap.get(current, id)
          if (Option.isNone(found)) {
            return yield* Effect.fail(new ConnectionNotFound({ id }))
          }
          return found.value
        })
    })
  })
)
