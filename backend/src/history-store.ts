import { FileSystem, Path } from "@effect/platform"
import {
  ConfigIoError,
  ConfigParseError,
  PathUnsafeError,
  type HistoryEntry,
  type HistoryWrite
} from "@workbench/shared"
import { Context, Effect, Layer, Ref } from "effect"
import { ConfigService } from "./config-service.ts"
import { assertSafeSegment, joinSafe } from "./paths.ts"

export type HistoryErr = PathUnsafeError | ConfigParseError | ConfigIoError

const io = (e: unknown) => new ConfigIoError({ message: e instanceof Error ? e.message : String(e) })

export class HistoryStore extends Context.Tag("app/HistoryStore")<
  HistoryStore,
  {
    readonly list: (connectionId: string) => Effect.Effect<ReadonlyArray<HistoryEntry>, HistoryErr>
    readonly append: (connectionId: string, write: HistoryWrite) => Effect.Effect<HistoryEntry, HistoryErr>
    readonly drop: (connectionId: string) => Effect.Effect<void>
  }
>() {}

export const makeHistoryStore = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const config = yield* ConfigService
  const memory = yield* Ref.make(new Map<string, Array<HistoryEntry>>())
  const ensuredDirs = new Set<string>()

  const fileFor = (connectionId: string) =>
    Effect.gen(function* () {
      const cfg = yield* config.get
      yield* assertSafeSegment(connectionId)
      const dir = yield* joinSafe(path, cfg.storage.dataDir, connectionId)
      if (!ensuredDirs.has(dir)) {
        yield* fs.makeDirectory(dir, { recursive: true }).pipe(Effect.mapError(io))
        ensuredDirs.add(dir)
      }
      return { file: path.join(dir, "history.json"), limit: cfg.storage.historyLimit, connectionId }
    })

  const readDisk = (file: string) =>
    Effect.gen(function* () {
      const raw = yield* fs.readFileString(file).pipe(Effect.orElseSucceed(() => "[]"))
      try {
        const parsed = JSON.parse(raw) as Array<HistoryEntry>
        return Array.isArray(parsed) ? parsed : []
      } catch (e) {
        return yield* Effect.fail(io(e))
      }
    })

  const load = (connectionId: string, file: string) =>
    Effect.gen(function* () {
      const map = yield* Ref.get(memory)
      const hit = map.get(connectionId)
      if (hit) return hit
      const fromDisk = yield* readDisk(file)
      map.set(connectionId, fromDisk)
      yield* Ref.set(memory, map)
      return fromDisk
    })

  const list = (connectionId: string) =>
    Effect.gen(function* () {
      const { file } = yield* fileFor(connectionId)
      return yield* load(connectionId, file)
    })

  const append = (connectionId: string, write: HistoryWrite) =>
    Effect.gen(function* () {
      const { file, limit } = yield* fileFor(connectionId)
      const existing = yield* load(connectionId, file)
      const entry: HistoryEntry = {
        id: crypto.randomUUID(),
        connectionId,
        sql: write.sql,
        executedAt: Date.now(),
        durationMs: write.durationMs,
        ok: write.ok,
        error: write.error,
        rowCount: write.rowCount
      }
      const next = [entry, ...existing].slice(0, limit)
      const map = yield* Ref.get(memory)
      map.set(connectionId, next)
      yield* Ref.set(memory, map)
      yield* fs.writeFileString(file, JSON.stringify(next)).pipe(Effect.mapError(io))
      return entry
    })

  const drop = (connectionId: string) =>
    Ref.update(memory, (map) => {
      const next = new Map(map)
      next.delete(connectionId)
      return next
    })

  return HistoryStore.of({ list, append, drop })
})

export const HistoryStoreLive = Layer.effect(HistoryStore, makeHistoryStore)
