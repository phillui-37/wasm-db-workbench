import { FileSystem, Path } from "@effect/platform"
import {
  ConfigIoError,
  ConfigParseError,
  PathUnsafeError,
  SyncNotFound,
  type HostFile,
  type SyncPayload,
  type SyncPush
} from "@workbench/shared"
import { Context, Effect, Layer } from "effect"
import { ConfigService } from "./config-service.ts"
import { mtimeMs, sizeNum } from "./fs-meta.ts"
import { assertSafeSegment, joinSafe } from "./paths.ts"

export type SyncErr = PathUnsafeError | SyncNotFound | ConfigParseError | ConfigIoError

const io = (e: unknown) => new ConfigIoError({ message: e instanceof Error ? e.message : String(e) })

export class SyncStore extends Context.Tag("app/SyncStore")<
  SyncStore,
  {
    readonly push: (connectionId: string, body: SyncPush) => Effect.Effect<SyncPayload, SyncErr>
    readonly pull: (connectionId: string) => Effect.Effect<SyncPayload, SyncErr>
    readonly files: (connectionId: string) => Effect.Effect<ReadonlyArray<HostFile>, SyncErr>
  }
>() {}

const binaryName = (engine: SyncPush["engine"]) => (engine === "sqlite" ? "db.sqlite" : "pgdata.tar.gz")

export const makeSyncStore = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const config = yield* ConfigService

  const dirFor = (connectionId: string) =>
    Effect.gen(function* () {
      const cfg = yield* config.get
      yield* assertSafeSegment(connectionId)
      const dir = yield* joinSafe(path, cfg.storage.dataDir, connectionId)
      yield* fs.makeDirectory(dir, { recursive: true }).pipe(Effect.mapError(io))
      return dir
    })

  const writeMaybe = (file: string, contents: string | undefined) =>
    Effect.gen(function* () {
      if (contents === undefined) return
      yield* fs.writeFileString(file, contents).pipe(Effect.mapError(io))
    })

  const writeBinary = (file: string, base64: string | undefined) =>
    Effect.gen(function* () {
      if (base64 === undefined) return
      const bytes = Buffer.from(base64, "base64")
      yield* fs.writeFile(file, bytes).pipe(Effect.mapError(io))
    })

  const push = (connectionId: string, body: SyncPush) =>
    Effect.gen(function* () {
      const dir = yield* dirFor(connectionId)
      if (body.format === "sql" || body.format === "both") {
        yield* writeMaybe(path.join(dir, "dump.sql"), body.sqlDump)
      }
      if (body.format === "binary" || body.format === "both") {
        yield* writeBinary(path.join(dir, binaryName(body.engine)), body.binaryBase64)
      }
      yield* fs
        .writeFileString(
          path.join(dir, "meta.json"),
          JSON.stringify({ engine: body.engine, name: body.name, updatedAt: Date.now() })
        )
        .pipe(Effect.mapError(io))
      return {
        connectionId,
        engine: body.engine,
        sqlDump: body.sqlDump,
        binaryBase64: body.binaryBase64
      } satisfies SyncPayload
    })

  const readOptionalString = (file: string) =>
    Effect.gen(function* () {
      const exists = yield* fs.exists(file).pipe(Effect.mapError(io))
      if (!exists) return undefined
      return yield* fs.readFileString(file).pipe(Effect.mapError(io))
    })

  const readOptionalBase64 = (file: string) =>
    Effect.gen(function* () {
      const exists = yield* fs.exists(file).pipe(Effect.mapError(io))
      if (!exists) return undefined
      const bytes = yield* fs.readFile(file).pipe(Effect.mapError(io))
      return Buffer.from(bytes).toString("base64")
    })

  const pull = (connectionId: string) =>
    Effect.gen(function* () {
      const cfg = yield* config.get
      yield* assertSafeSegment(connectionId)
      const dir = yield* joinSafe(path, cfg.storage.dataDir, connectionId)
      const metaRaw = yield* fs.readFileString(path.join(dir, "meta.json")).pipe(Effect.orElseSucceed(() => undefined))
      const sqlDump = yield* readOptionalString(path.join(dir, "dump.sql"))
      let engine: SyncPush["engine"] | undefined
      if (metaRaw) {
        try {
          engine = (JSON.parse(metaRaw) as { engine: SyncPush["engine"] }).engine
        } catch {
          engine = undefined
        }
      }
      if (!engine) {
        const hasSqlite = yield* fs.exists(path.join(dir, "db.sqlite")).pipe(Effect.orElseSucceed(() => false))
        engine = hasSqlite ? "sqlite" : "pglite"
      }
      const binaryBase64 = yield* readOptionalBase64(path.join(dir, binaryName(engine)))
      if (!metaRaw && sqlDump === undefined && binaryBase64 === undefined) {
        return yield* Effect.fail(new SyncNotFound({ connectionId }))
      }
      return { connectionId, engine, sqlDump, binaryBase64 } satisfies SyncPayload
    })

  const files = (connectionId: string) =>
    Effect.gen(function* () {
      const cfg = yield* config.get
      yield* assertSafeSegment(connectionId)
      const dir = yield* joinSafe(path, cfg.storage.dataDir, connectionId)
      const names = yield* fs.readDirectory(dir).pipe(Effect.orElseSucceed(() => [] as Array<string>))
      const out: Array<HostFile> = []
      for (const name of names) {
        const full = path.join(dir, name)
        const stat = yield* fs.stat(full).pipe(Effect.mapError(io))
        out.push({
          name,
          size: sizeNum(stat),
          updatedAt: mtimeMs(stat)
        })
      }
      return out
    })

  return SyncStore.of({ push, pull, files })
})

export const SyncStoreLive = Layer.effect(SyncStore, makeSyncStore)
