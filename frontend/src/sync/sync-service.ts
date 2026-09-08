import {
  ConnectionHub,
  SyncError,
  debouncedSync,
  intervalSync,
  type EngineType,
  type SyncFormat
} from "@workbench/shared"
import { Context, Effect, Fiber, HashMap, Layer, Option, Ref } from "effect"
import { WorkbenchClient } from "../api/workbench-client.ts"
import { base64ToBytes, bytesToBase64 } from "../engines/dump.ts"

export class SyncController extends Context.Tag("app/SyncController")<
  SyncController,
  {
    readonly push: (
      id: string,
      format: SyncFormat,
      engine: EngineType,
      name?: string
    ) => Effect.Effect<void, SyncError>
    readonly pull: (id: string) => Effect.Effect<void, SyncError>
    readonly startInterval: (
      id: string,
      seconds: number,
      format: SyncFormat,
      engine: EngineType,
      name?: string
    ) => Effect.Effect<void>
    readonly stop: (id: string) => Effect.Effect<void>
    readonly notifyChange: (
      id: string,
      debounceMs: number,
      format: SyncFormat,
      engine: EngineType,
      name?: string
    ) => Effect.Effect<void>
  }
>() {}

export const SyncControllerLive = Layer.effect(
  SyncController,
  Effect.gen(function* () {
    const hub = yield* ConnectionHub
    const client = yield* WorkbenchClient
    const intervalFibers = yield* Ref.make(HashMap.empty<string, Fiber.RuntimeFiber<unknown, unknown>>())
    const debounceFibers = yield* Ref.make(HashMap.empty<string, Fiber.RuntimeFiber<unknown, unknown>>())

    const stopMap = (
      ref: Ref.Ref<HashMap.HashMap<string, Fiber.RuntimeFiber<unknown, unknown>>>,
      id: string
    ) =>
      Effect.gen(function* () {
        const current = yield* Ref.get(ref)
        const fiber = HashMap.get(current, id)
        if (Option.isSome(fiber)) yield* Fiber.interrupt(fiber.value)
        yield* Ref.update(ref, HashMap.remove(id))
      })

    const push = (id: string, format: SyncFormat, engine: EngineType, name?: string) =>
      Effect.gen(function* () {
        const db = yield* hub.get(id).pipe(Effect.mapError((e) => new SyncError({ message: e.message })))
        const sqlDump =
          format === "sql" || format === "both"
            ? yield* db.exportSql.pipe(Effect.mapError((e) => new SyncError({ message: e.message })))
            : undefined
        const binaryBase64 =
          format === "binary" || format === "both"
            ? bytesToBase64(yield* db.exportBinary.pipe(Effect.mapError((e) => new SyncError({ message: e.message }))))
            : undefined
        yield* client.sync
          .push({
            path: { connectionId: id },
            payload: { engine, format, sqlDump, binaryBase64, name }
          })
          .pipe(Effect.mapError((e) => new SyncError({ message: String(e) })))
      })

    const pull = (id: string) =>
      Effect.gen(function* () {
        const db = yield* hub.get(id).pipe(Effect.mapError((e) => new SyncError({ message: e.message })))
        const payload = yield* client.sync.pull({ path: { connectionId: id } }).pipe(
          Effect.mapError((e) => new SyncError({ message: String(e) }))
        )
        if (payload.binaryBase64) {
          yield* db.importBinary(base64ToBytes(payload.binaryBase64)).pipe(
            Effect.mapError((e) => new SyncError({ message: e.message }))
          )
        } else if (payload.sqlDump) {
          yield* db.importSql(payload.sqlDump).pipe(Effect.mapError((e) => new SyncError({ message: e.message })))
        }
      })

    const startInterval = (id: string, seconds: number, format: SyncFormat, engine: EngineType, name?: string) =>
      Effect.gen(function* () {
        yield* stopMap(intervalFibers, id)
        const fiber = yield* Effect.forkDaemon(intervalSync(push(id, format, engine, name).pipe(Effect.ignore), seconds))
        yield* Ref.update(intervalFibers, HashMap.set(id, fiber))
      })

    const notifyChange = (id: string, debounceMs: number, format: SyncFormat, engine: EngineType, name?: string) =>
      Effect.gen(function* () {
        yield* stopMap(debounceFibers, id)
        const autoFormat: SyncFormat = format === "sql" ? "binary" : format === "both" ? "binary" : format
        const fiber = yield* Effect.fork(
          debouncedSync(push(id, autoFormat, engine, name).pipe(Effect.ignore), debounceMs)
        )
        yield* Ref.update(debounceFibers, HashMap.set(id, fiber))
      })

    const stop = (id: string) =>
      Effect.gen(function* () {
        yield* stopMap(intervalFibers, id)
        yield* stopMap(debounceFibers, id)
      })

    return SyncController.of({ push, pull, startInterval, stop, notifyChange })
  })
)
