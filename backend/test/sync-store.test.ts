import { FileSystem } from "@effect/platform"
import { NodeContext } from "@effect/platform-node"
import { describe, expect, it } from "@effect/vitest"
import { defaultAppConfig } from "@workbench/shared"
import { ConfigProvider, Effect, Layer } from "effect"
import { stringify } from "yaml"
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
})
