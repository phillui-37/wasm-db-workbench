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
    readonly put: (
      connectionId: string,
      name: string,
      sql: string,
      pinned?: boolean
    ) => Effect.Effect<Script, ScriptErr>
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

  const pinnedPath = (dir: string) => path.join(dir, "_pinned.json")

  const readPinned = (dir: string) =>
    Effect.gen(function* () {
      const raw = yield* fs.readFileString(pinnedPath(dir)).pipe(Effect.orElseSucceed(() => "[]"))
      try {
        const parsed = JSON.parse(raw) as unknown
        return Array.isArray(parsed) ? parsed.filter((n): n is string => typeof n === "string") : []
      } catch {
        return [] as Array<string>
      }
    })

  const writePinned = (dir: string, names: Array<string>) =>
    fs.writeFileString(pinnedPath(dir), JSON.stringify(names)).pipe(Effect.mapError(io))

  const list = (connectionId: string) =>
    Effect.gen(function* () {
      const dir = yield* dirFor(connectionId)
      const names = yield* fs.readDirectory(dir).pipe(Effect.orElseSucceed(() => [] as Array<string>))
      const pinned = yield* readPinned(dir)
      const pinnedSet = new Set(pinned)
      const sqlFiles = names.filter((file) => file.endsWith(".sql"))
      const scripts = yield* Effect.forEach(
        sqlFiles,
        (file) =>
          Effect.gen(function* () {
            const full = path.join(dir, file)
            const sql = yield* fs.readFileString(full).pipe(Effect.mapError(io))
            const stat = yield* fs.stat(full).pipe(Effect.mapError(io))
            const name = file.replace(/\.sql$/, "")
            return {
              connectionId,
              name,
              sql,
              updatedAt: mtimeMs(stat),
              pinned: pinnedSet.has(name) ? true : undefined
            } satisfies Script
          }),
        { concurrency: "unbounded" }
      )
      return scripts.sort(
        (a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || a.name.localeCompare(b.name)
      )
    })

  const put = (connectionId: string, name: string, sql: string, pinned?: boolean) =>
    Effect.gen(function* () {
      yield* assertSafeSegment(name)
      const dir = yield* dirFor(connectionId)
      yield* fs.makeDirectory(dir, { recursive: true }).pipe(Effect.mapError(io))
      const full = yield* joinSafe(path, dir, `${name}.sql`)
      yield* fs.writeFileString(full, sql).pipe(Effect.mapError(io))
      let nextPinned: Array<string> | undefined
      if (pinned !== undefined) {
        const current = yield* readPinned(dir)
        nextPinned =
          pinned === true ? [...new Set([...current, name])] : current.filter((n) => n !== name)
        yield* writePinned(dir, nextPinned)
      } else {
        nextPinned = yield* readPinned(dir)
      }
      return {
        connectionId,
        name,
        sql,
        updatedAt: Date.now(),
        pinned: nextPinned.includes(name) ? true : undefined
      } satisfies Script
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
      const current = yield* readPinned(dir)
      if (current.includes(name)) yield* writePinned(dir, current.filter((n) => n !== name))
    })

  return ScriptStore.of({ list, put, remove })
})

export const ScriptStoreLive = Layer.effect(ScriptStore, makeScriptStore)
