import { FileSystem, Path } from "@effect/platform"
import {
  ConfigIoError,
  ConfigParseError,
  PathUnsafeError,
  ScriptNotFound,
  type Script
} from "@workbench/shared"
import { Context, Effect, Layer } from "effect"
import { ConfigService } from "./config-service.ts"
import { mtimeMs } from "./fs-meta.ts"
import { assertSafeSegment, joinSafe } from "./paths.ts"

export type ScriptErr = PathUnsafeError | ScriptNotFound | ConfigParseError | ConfigIoError

const io = (e: unknown) => new ConfigIoError({ message: e instanceof Error ? e.message : String(e) })

export class ScriptStore extends Context.Tag("app/ScriptStore")<
  ScriptStore,
  {
    readonly list: (connectionId: string) => Effect.Effect<ReadonlyArray<Script>, ScriptErr>
    readonly put: (connectionId: string, name: string, sql: string) => Effect.Effect<Script, ScriptErr>
    readonly remove: (connectionId: string, name: string) => Effect.Effect<void, ScriptErr>
  }
>() {}

export const makeScriptStore = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const config = yield* ConfigService

  const dirFor = (connectionId: string) =>
    Effect.gen(function* () {
      const cfg = yield* config.get
      yield* assertSafeSegment(connectionId)
      return yield* joinSafe(path, cfg.storage.scriptsDir, connectionId)
    })

  const list = (connectionId: string) =>
    Effect.gen(function* () {
      const dir = yield* dirFor(connectionId)
      const exists = yield* fs.exists(dir).pipe(Effect.mapError(io))
      if (!exists) return [] as Array<Script>
      const names = yield* fs.readDirectory(dir).pipe(Effect.mapError(io))
      const scripts: Array<Script> = []
      for (const file of names) {
        if (!file.endsWith(".sql")) continue
        const full = path.join(dir, file)
        const sql = yield* fs.readFileString(full).pipe(Effect.mapError(io))
        const stat = yield* fs.stat(full).pipe(Effect.mapError(io))
        scripts.push({
          connectionId,
          name: file.replace(/\.sql$/, ""),
          sql,
          updatedAt: mtimeMs(stat)
        })
      }
      return scripts.sort((a, b) => a.name.localeCompare(b.name))
    })

  const put = (connectionId: string, name: string, sql: string) =>
    Effect.gen(function* () {
      yield* assertSafeSegment(name)
      const dir = yield* dirFor(connectionId)
      yield* fs.makeDirectory(dir, { recursive: true }).pipe(Effect.mapError(io))
      const full = yield* joinSafe(path, dir, `${name}.sql`)
      yield* fs.writeFileString(full, sql).pipe(Effect.mapError(io))
      return { connectionId, name, sql, updatedAt: Date.now() } satisfies Script
    })

  const remove = (connectionId: string, name: string) =>
    Effect.gen(function* () {
      yield* assertSafeSegment(name)
      const dir = yield* dirFor(connectionId)
      const full = yield* joinSafe(path, dir, `${name}.sql`)
      const exists = yield* fs.exists(full).pipe(Effect.mapError(io))
      if (!exists) {
        return yield* Effect.fail(new ScriptNotFound({ connectionId, name }))
      }
      yield* fs.remove(full).pipe(Effect.mapError(io))
    })

  return ScriptStore.of({ list, put, remove })
})

export const ScriptStoreLive = Layer.effect(ScriptStore, makeScriptStore)
