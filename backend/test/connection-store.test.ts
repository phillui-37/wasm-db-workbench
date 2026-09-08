import { FileSystem } from "@effect/platform"
import { NodeContext } from "@effect/platform-node"
import { describe, expect, it } from "@effect/vitest"
import { defaultAppConfig } from "@workbench/shared"
import { ConfigProvider, Effect, Layer } from "effect"
import { stringify } from "yaml"
import { ConfigService } from "../src/config-service.ts"
import { ConnectionStore } from "../src/connection-store.ts"
import { ScriptStore } from "../src/script-store.ts"
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

describe("ConnectionStore", () => {
  it.scoped("persists the catalog and coalesces session folders into one workspace", () =>
    withStores(
      Effect.gen(function* () {
        const connections = yield* ConnectionStore
        const sync = yield* SyncStore
        yield* connections.putAll([{ id: "local_abcd", name: "local", engine: "sqlite" }])
        yield* sync.push("local_abcd", {
          engine: "sqlite",
          format: "both",
          name: "local",
          sqlDump: "CREATE TABLE t(id int);",
          binaryBase64: Buffer.from("hello").toString("base64")
        })
        const listed = yield* connections.list
        expect(listed.some((c) => c.id === "local" && c.name === "local")).toBe(true)
        expect(listed.some((c) => c.id === "local_abcd")).toBe(false)
      })
    )
  )

  it.scoped("remove deletes host data and script directories", () =>
    withStores(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const connections = yield* ConnectionStore
        const scripts = yield* ScriptStore
        const sync = yield* SyncStore
        const config = yield* ConfigService
        const cfg = yield* config.get
        yield* connections.putAll([{ id: "gone", name: "gone", engine: "sqlite" }])
        yield* sync.push("gone", {
          engine: "sqlite",
          format: "both",
          name: "gone",
          sqlDump: "CREATE TABLE t(id int);",
          binaryBase64: Buffer.from("hello").toString("base64")
        })
        yield* scripts.put("gone", "init", "SELECT 1")
        expect(yield* fs.exists(`${cfg.storage.dataDir}/gone`)).toBe(true)
        expect(yield* fs.exists(`${cfg.storage.scriptsDir}/gone`)).toBe(true)
        yield* connections.remove("gone")
        expect(yield* connections.list).toHaveLength(0)
        expect(yield* fs.exists(`${cfg.storage.dataDir}/gone`)).toBe(false)
        expect(yield* fs.exists(`${cfg.storage.scriptsDir}/gone`)).toBe(false)
        expect(yield* scripts.list("gone")).toHaveLength(0)
      })
    )
  )

  it.scoped("putAll keeps host dump directories the client did not send", () =>
    withStores(
      Effect.gen(function* () {
        const connections = yield* ConnectionStore
        const sync = yield* SyncStore
        yield* sync.push("local_maap", {
          engine: "pglite",
          format: "sql",
          name: "local",
          sqlDump: "CREATE TABLE t(id int);"
        })
        const merged = yield* connections.putAll([{ id: "other", name: "other", engine: "sqlite" }])
        expect(merged.some((c) => c.id === "local")).toBe(true)
        expect(merged.some((c) => c.id === "local_maap")).toBe(false)
        expect(merged.some((c) => c.id === "other")).toBe(true)
      })
    )
  )

  it.scoped("remove of a workspace also deletes leftover session folders", () =>
    withStores(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const connections = yield* ConnectionStore
        const config = yield* ConfigService
        const cfg = yield* config.get
        yield* fs.makeDirectory(`${cfg.storage.dataDir}/local_maap`, { recursive: true })
        yield* fs.writeFileString(`${cfg.storage.dataDir}/local_maap/dump.sql`, "CREATE TABLE t(id int);")
        yield* fs.writeFileString(
          `${cfg.storage.dataDir}/local_maap/meta.json`,
          JSON.stringify({ engine: "pglite", name: "local", updatedAt: Date.now() })
        )
        yield* connections.remove("local")
        expect(yield* fs.exists(`${cfg.storage.dataDir}/local_maap`)).toBe(false)
        expect(yield* connections.list).toHaveLength(0)
      })
    )
  )
})
