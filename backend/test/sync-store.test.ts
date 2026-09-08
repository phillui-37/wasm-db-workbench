import { FileSystem } from "@effect/platform"
import { NodeContext } from "@effect/platform-node"
import { describe, expect, it } from "@effect/vitest"
import { defaultAppConfig } from "@workbench/shared"
import { ConfigProvider, Effect, Layer } from "effect"
import { stringify } from "yaml"
import { ConfigService } from "../src/config-service.ts"
import { StoresLive } from "../src/layers.ts"
import { SyncStore } from "../src/sync-store.ts"

const withStores = <A, E, R>(program: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const dir = yield* fs.makeTempDirectoryScoped()
    yield* fs.writeFileString(`${dir}/app.yaml`, stringify(defaultAppConfig))
    yield* fs.makeDirectory(`${dir}/data`, { recursive: true })
    yield* fs.makeDirectory(`${dir}/scripts`, { recursive: true })
    const provider = ConfigProvider.fromMap(
      new Map([
        ["CONFIG_PATH", `${dir}/app.yaml`],
        ["DATA_DIR", `${dir}/data`],
        ["SCRIPTS_DIR", `${dir}/scripts`]
      ])
    )
    return yield* program.pipe(
      Effect.provide(StoresLive.pipe(Layer.provide(Layer.setConfigProvider(provider))))
    )
  }).pipe(Effect.provide(NodeContext.layer))

describe("SyncStore", () => {
  it.scoped("pushes binary and sql then pulls them", () =>
    withStores(
      Effect.gen(function* () {
        const sync = yield* SyncStore
        yield* sync.push("conn1", {
          engine: "sqlite",
          format: "both",
          sqlDump: "CREATE TABLE t(id int);",
          binaryBase64: Buffer.from("hello").toString("base64")
        })
        const pulled = yield* sync.pull("conn1")
        expect(pulled.sqlDump).toContain("CREATE TABLE")
        expect(pulled.binaryBase64).toBe(Buffer.from("hello").toString("base64"))
        const files = yield* sync.files("conn1")
        expect(files.some((f) => f.name === "dump.sql")).toBe(true)
        expect(files.some((f) => f.name === "db.sqlite")).toBe(true)
      })
    )
  )

  it.scoped("pulls leftover session folders through the shared workspace id", () =>
    withStores(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const sync = yield* SyncStore
        const config = yield* ConfigService
        const cfg = yield* config.get
        yield* fs.makeDirectory(`${cfg.storage.dataDir}/local_maap`, { recursive: true })
        yield* fs.writeFileString(`${cfg.storage.dataDir}/local_maap/dump.sql`, "CREATE TABLE t(id int);")
        yield* fs.writeFileString(
          `${cfg.storage.dataDir}/local_maap/meta.json`,
          JSON.stringify({ engine: "pglite", name: "local", updatedAt: Date.now() })
        )
        const pulled = yield* sync.pull("local")
        expect(pulled.connectionId).toBe("local")
        expect(pulled.sqlDump).toContain("CREATE TABLE")
        const files = yield* sync.files("local_maap")
        expect(files.some((f) => f.name === "dump.sql")).toBe(true)
      })
    )
  )

  it.scoped("pulls leftover dumps even when an empty canonical folder exists", () =>
    withStores(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const sync = yield* SyncStore
        const config = yield* ConfigService
        const cfg = yield* config.get
        yield* fs.makeDirectory(`${cfg.storage.dataDir}/local`, { recursive: true })
        yield* fs.writeFileString(
          `${cfg.storage.dataDir}/local/meta.json`,
          JSON.stringify({ engine: "pglite", name: "local", updatedAt: Date.now() })
        )
        yield* fs.makeDirectory(`${cfg.storage.dataDir}/local_maap`, { recursive: true })
        yield* fs.writeFileString(`${cfg.storage.dataDir}/local_maap/dump.sql`, "CREATE TABLE leftover(id int);")
        const pulled = yield* sync.pull("local")
        expect(pulled.sqlDump).toContain("leftover")
      })
    )
  )

  it.scoped("keeps the workspace folder when the display name changes", () =>
    withStores(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const sync = yield* SyncStore
        const config = yield* ConfigService
        const cfg = yield* config.get
        yield* sync.push("local", {
          engine: "pglite",
          format: "sql",
          name: "renamed",
          sqlDump: "CREATE TABLE t(id int);"
        })
        expect(yield* fs.exists(`${cfg.storage.dataDir}/local`)).toBe(true)
        expect(yield* fs.exists(`${cfg.storage.dataDir}/renamed`)).toBe(false)
      })
    )
  )

  it.scoped("pushes session ids into the canonical workspace folder", () =>
    withStores(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const sync = yield* SyncStore
        const config = yield* ConfigService
        const cfg = yield* config.get
        yield* sync.push("local_maap", {
          engine: "pglite",
          format: "sql",
          name: "local",
          sqlDump: "CREATE TABLE t(id int);"
        })
        expect(yield* fs.exists(`${cfg.storage.dataDir}/local`)).toBe(true)
        expect(yield* fs.exists(`${cfg.storage.dataDir}/local_maap`)).toBe(false)
      })
    )
  )
})
