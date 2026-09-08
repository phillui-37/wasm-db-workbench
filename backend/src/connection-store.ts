import { FileSystem, Path } from "@effect/platform"
import {
  ConfigIoError,
  ConfigParseError,
  PathUnsafeError,
  type ConnectionMeta,
  type EngineType
} from "@workbench/shared"
import { Context, Effect, Layer } from "effect"
import { ConfigService } from "./config-service.ts"
import { assertSafeSegment, joinSafe } from "./paths.ts"

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

  const childDirs = (root: string) =>
    Effect.gen(function* () {
      const names = yield* fs.readDirectory(root).pipe(Effect.orElseSucceed(() => [] as Array<string>))
      const out: Array<string> = []
      for (const name of names) {
        if (name.startsWith("_") || name.startsWith(".")) continue
        if (!/^[A-Za-z0-9._-]+$/.test(name)) continue
        const full = path.join(root, name)
        const info = yield* fs.stat(full).pipe(Effect.orElseSucceed(() => undefined))
        if (info?.type === "Directory") out.push(name)
      }
      return out
    })

  const readMeta = (dataDir: string, id: string) =>
    Effect.gen(function* () {
      const raw = yield* fs.readFileString(path.join(dataDir, id, "meta.json")).pipe(Effect.orElseSucceed(() => ""))
      if (!raw) return { engine: "pglite" as const, name: id }
      try {
        const parsed = JSON.parse(raw) as { engine?: unknown; name?: unknown }
        return {
          engine: isEngine(parsed.engine) ? parsed.engine : ("pglite" as const),
          name: typeof parsed.name === "string" && parsed.name ? parsed.name : id
        }
      } catch {
        return { engine: "pglite" as const, name: id }
      }
    })

  const list = Effect.gen(function* () {
    const { dataDir, scriptsDir } = yield* dirs
    const catalog = yield* readCatalog(dataDir)
    const byId = new Map<string, ConnectionMeta>()
    for (const id of yield* childDirs(dataDir)) {
      const meta = yield* readMeta(dataDir, id)
      byId.set(id, { id, name: meta.name, engine: meta.engine })
    }
    for (const id of yield* childDirs(scriptsDir)) {
      if (!byId.has(id)) byId.set(id, { id, name: id, engine: "pglite" })
    }
    for (const item of catalog) byId.set(item.id, item)
    return [...byId.values()]
  })

  const putAll = (items: ReadonlyArray<ConnectionMeta>) =>
    Effect.gen(function* () {
      for (const item of items) yield* assertSafeSegment(item.id)
      const { dataDir } = yield* dirs
      yield* writeCatalog(dataDir, items)
      return [...items]
    })

  const remove = (connectionId: string) =>
    Effect.gen(function* () {
      yield* assertSafeSegment(connectionId)
      const { dataDir, scriptsDir } = yield* dirs
      const dataPath = yield* joinSafe(path, dataDir, connectionId)
      const scriptsPath = yield* joinSafe(path, scriptsDir, connectionId)
      yield* fs.remove(dataPath, { recursive: true, force: true }).pipe(Effect.mapError(io))
      yield* fs.remove(scriptsPath, { recursive: true, force: true }).pipe(Effect.mapError(io))
      const next = (yield* readCatalog(dataDir)).filter((item) => item.id !== connectionId)
      yield* writeCatalog(dataDir, next)
    })

  return ConnectionStore.of({ list, putAll, remove })
})

export const ConnectionStoreLive = Layer.effect(ConnectionStore, makeConnectionStore)
