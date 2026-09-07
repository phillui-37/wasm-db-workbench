import { FileSystem, Path } from "@effect/platform"
import {
  ConfigIoError,
  ConfigParseError,
  PathUnsafeError,
  type HistoryEntry,
  type HistoryWrite
} from "@workbench/shared"
import { Context, Effect, Layer } from "effect"
import { ConfigService } from "./config-service.ts"
import { assertSafeSegment, joinSafe } from "./paths.ts"

export type HistoryErr = PathUnsafeError | ConfigParseError | ConfigIoError

const io = (e: unknown) => new ConfigIoError({ message: e instanceof Error ? e.message : String(e) })

export class HistoryStore extends Context.Tag("app/HistoryStore")<
  HistoryStore,
  {
    readonly list: (connectionId: string) => Effect.Effect<ReadonlyArray<HistoryEntry>, HistoryErr>
    readonly append: (connectionId: string, write: HistoryWrite) => Effect.Effect<HistoryEntry, HistoryErr>
  }
>() {}

export const makeHistoryStore = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const config = yield* ConfigService

  const fileFor = (connectionId: string) =>
    Effect.gen(function* () {
      const cfg = yield* config.get
      yield* assertSafeSegment(connectionId)
      const dir = yield* joinSafe(path, cfg.storage.dataDir, connectionId)
      yield* fs.makeDirectory(dir, { recursive: true }).pipe(Effect.mapError(io))
      return { file: path.join(dir, "history.json"), limit: cfg.storage.historyLimit }
    })

  const readAll = (file: string) =>
    Effect.gen(function* () {
      const exists = yield* fs.exists(file).pipe(Effect.mapError(io))
      if (!exists) return [] as Array<HistoryEntry>
      const raw = yield* fs.readFileString(file).pipe(Effect.mapError(io))
      try {
        const parsed = JSON.parse(raw) as Array<HistoryEntry>
        return Array.isArray(parsed) ? parsed : []
      } catch (e) {
        return yield* Effect.fail(io(e))
      }
    })

  const list = (connectionId: string) =>
    Effect.gen(function* () {
      const { file } = yield* fileFor(connectionId)
      return yield* readAll(file)
    })

  const append = (connectionId: string, write: HistoryWrite) =>
    Effect.gen(function* () {
      const { file, limit } = yield* fileFor(connectionId)
      const existing = yield* readAll(file)
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
      yield* fs.writeFileString(file, JSON.stringify(next, null, 2)).pipe(Effect.mapError(io))
      return entry
    })

  return HistoryStore.of({ list, append })
})

export const HistoryStoreLive = Layer.effect(HistoryStore, makeHistoryStore)
