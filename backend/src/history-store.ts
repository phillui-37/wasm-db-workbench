import { FileSystem, Path } from "@effect/platform"
import {
  ConfigIoError,
  ConfigParseError,
  PathUnsafeError,
  workspaceId,
  type HistoryEntry,
  type HistoryWrite
} from "@workbench/shared"
import { Context, Effect, Layer, Ref } from "effect"
import { ConfigService } from "./config-service.ts"
import { assertSafeSegment, joinSafe } from "./paths.ts"
import { workspaceCandidates } from "./workspace.ts"

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

  const workspaceOf = (connectionId: string) => workspaceId(connectionId)

  const canonicalFile = (connectionId: string, createDir: boolean) =>
    Effect.gen(function* () {
      const cfg = yield* config.get
      yield* assertSafeSegment(connectionId)
      const workspace = workspaceOf(connectionId)
      yield* assertSafeSegment(workspace)
      const dir = yield* joinSafe(path, cfg.storage.dataDir, workspace)
      if (createDir && !ensuredDirs.has(dir)) {
        yield* fs.makeDirectory(dir, { recursive: true }).pipe(Effect.mapError(io))
        ensuredDirs.add(dir)
      }
      return { file: path.join(dir, "history.json"), limit: cfg.storage.historyLimit, workspace }
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

  const load = (connectionId: string) =>
    Effect.gen(function* () {
      const workspace = workspaceOf(connectionId)
      const map = yield* Ref.get(memory)
      const hit = map.get(workspace)
      if (hit) return hit
      const cfg = yield* config.get
      const candidates = yield* workspaceCandidates(fs, path, cfg.storage.dataDir, workspace)
      const byId = new Map<string, HistoryEntry>()
      for (const candidate of candidates) {
        const file = path.join(candidate.dir, "history.json")
        const exists = yield* fs.exists(file).pipe(Effect.orElseSucceed(() => false))
        if (!exists) continue
        for (const entry of yield* readDisk(file)) byId.set(entry.id, { ...entry, connectionId: workspace })
      }
      const fromDisk = [...byId.values()].sort((a, b) => b.executedAt - a.executedAt)
      map.set(workspace, fromDisk)
      yield* Ref.set(memory, map)
      return fromDisk
    })

  const list = (connectionId: string) =>
    Effect.gen(function* () {
      yield* assertSafeSegment(connectionId)
      return yield* load(connectionId)
    })

  const append = (connectionId: string, write: HistoryWrite) =>
    Effect.gen(function* () {
      const { file, limit, workspace } = yield* canonicalFile(connectionId, true)
      const existing = yield* load(connectionId)
      const entry: HistoryEntry = {
        id: crypto.randomUUID(),
        connectionId: workspace,
        sql: write.sql,
        executedAt: Date.now(),
        durationMs: write.durationMs,
        ok: write.ok,
        error: write.error,
        rowCount: write.rowCount
      }
      const next = [entry, ...existing].slice(0, limit)
      const map = yield* Ref.get(memory)
      map.set(workspace, next)
      yield* Ref.set(memory, map)
      yield* fs.writeFileString(file, JSON.stringify(next)).pipe(Effect.mapError(io))
      return entry
    })

  const drop = (connectionId: string) =>
    Ref.update(memory, (map) => {
      const next = new Map(map)
      next.delete(connectionId)
      next.delete(workspaceOf(connectionId))
      return next
    })

  return HistoryStore.of({ list, append, drop })
})

export const HistoryStoreLive = Layer.effect(HistoryStore, makeHistoryStore)
