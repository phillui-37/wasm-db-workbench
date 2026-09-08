import { FileSystem, Path } from "@effect/platform"
import {
  ConfigIoError,
  ConfigParseError,
  PathUnsafeError,
  workspaceId,
  type ConnectionMeta,
  type EngineType
} from "@workbench/shared"
import { Context, Effect, Layer } from "effect"
import { ConfigService } from "./config-service.ts"
import { assertSafeSegment, joinSafe } from "./paths.ts"
import { hostedWorkspaces, workspaceCandidates } from "./workspace.ts"

export type ConnectionErr = PathUnsafeError | ConfigParseError | ConfigIoError

const io = (e: unknown) => new ConfigIoError({ message: e instanceof Error ? e.message : String(e) })
const CATALOG = "_connections.json"

export class ConnectionStore extends Context.Tag("app/ConnectionStore")<
  ConnectionStore,
  {
    readonly list: Effect.Effect<ReadonlyArray<ConnectionMeta>, ConnectionErr>
    readonly putAll: (list: ReadonlyArray<ConnectionMeta>) => Effect.Effect<ReadonlyArray<ConnectionMeta>, ConnectionErr>
    readonly remove: (connectionId: string) => Effect.Effect<void, ConnectionErr>
  }
>() {}

const isEngine = (value: unknown): value is EngineType => value === "pglite" || value === "sqlite"

const parseCatalog = (raw: string): Array<ConnectionMeta> => {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is ConnectionMeta => {
      if (!item || typeof item !== "object") return false
      const row = item as Record<string, unknown>
      return typeof row.id === "string" && typeof row.name === "string" && isEngine(row.engine)
    })
  } catch {
    return []
  }
}

const canonicalize = (item: ConnectionMeta): ConnectionMeta => {
  const id = workspaceId(item.id, item.name)
  return { id, name: item.name, engine: item.engine }
}

export const makeConnectionStore = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const config = yield* ConfigService

  const dirs = Effect.gen(function* () {
    const cfg = yield* config.get
    yield* fs.makeDirectory(cfg.storage.dataDir, { recursive: true }).pipe(Effect.mapError(io))
    yield* fs.makeDirectory(cfg.storage.scriptsDir, { recursive: true }).pipe(Effect.mapError(io))
    return { dataDir: cfg.storage.dataDir, scriptsDir: cfg.storage.scriptsDir }
  })

  const catalogPath = (dataDir: string) => path.join(dataDir, CATALOG)

  const readCatalog = (dataDir: string) =>
    fs.readFileString(catalogPath(dataDir)).pipe(Effect.orElseSucceed(() => "[]"), Effect.map(parseCatalog))

  const writeCatalog = (dataDir: string, list: ReadonlyArray<ConnectionMeta>) =>
    fs.writeFileString(catalogPath(dataDir), JSON.stringify(list)).pipe(Effect.mapError(io))

  const list = Effect.gen(function* () {
    const { dataDir, scriptsDir } = yield* dirs
    const catalog = yield* readCatalog(dataDir)
    const byId = new Map<string, ConnectionMeta>()
    for (const hit of yield* hostedWorkspaces(fs, path, dataDir)) {
      byId.set(hit.id, { id: hit.id, name: hit.name, engine: hit.engine })
    }
    for (const hit of yield* hostedWorkspaces(fs, path, scriptsDir)) {
      if (!byId.has(hit.id)) byId.set(hit.id, { id: hit.id, name: hit.name, engine: hit.engine })
    }
    for (const item of catalog) {
      const next = canonicalize(item)
      const current = byId.get(next.id)
      byId.set(next.id, current ? { ...current, name: next.name, engine: next.engine } : next)
    }
    return [...byId.values()]
  })

  const putAll = (items: ReadonlyArray<ConnectionMeta>) =>
    Effect.gen(function* () {
      const canonical = items.map(canonicalize)
      for (const item of canonical) yield* assertSafeSegment(item.id)
      const current = yield* list
      const byId = new Map<string, ConnectionMeta>()
      for (const item of current) byId.set(item.id, item)
      for (const item of canonical) byId.set(item.id, item)
      const merged = [...byId.values()]
      const { dataDir } = yield* dirs
      yield* writeCatalog(dataDir, merged)
      return merged
    })

  const remove = (connectionId: string) =>
    Effect.gen(function* () {
      yield* assertSafeSegment(connectionId)
      const workspace = workspaceId(connectionId)
      const { dataDir, scriptsDir } = yield* dirs
      const dataHits = yield* workspaceCandidates(fs, path, dataDir, workspace)
      const scriptHits = yield* workspaceCandidates(fs, path, scriptsDir, workspace)
      for (const hit of [...dataHits, ...scriptHits]) {
        yield* fs.remove(hit.dir, { recursive: true, force: true }).pipe(Effect.mapError(io))
      }
      const exactData = yield* joinSafe(path, dataDir, workspace)
      const exactScripts = yield* joinSafe(path, scriptsDir, workspace)
      yield* fs.remove(exactData, { recursive: true, force: true }).pipe(Effect.mapError(io))
      yield* fs.remove(exactScripts, { recursive: true, force: true }).pipe(Effect.mapError(io))
      const next = (yield* readCatalog(dataDir))
        .map(canonicalize)
        .filter((item) => item.id !== workspace)
      yield* writeCatalog(dataDir, next)
    })

  return ConnectionStore.of({ list, putAll, remove })
})

export const ConnectionStoreLive = Layer.effect(ConnectionStore, makeConnectionStore)
