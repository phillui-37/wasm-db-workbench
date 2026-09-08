import { FileSystem } from "@effect/platform"
import { NodeContext } from "@effect/platform-node"
import { describe, expect, it } from "@effect/vitest"
import { defaultAppConfig } from "@workbench/shared"
import { ConfigProvider, Effect, Layer } from "effect"
import { stringify } from "yaml"
import { ConfigService } from "../src/config-service.ts"
import { HistoryStore } from "../src/history-store.ts"
import { StoresLive } from "../src/layers.ts"

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

describe("HistoryStore", () => {
  it.scoped("appends and caps history", () =>
    withStores(
      Effect.gen(function* () {
        const history = yield* HistoryStore
        const first = yield* history.append("c1", { sql: "SELECT 1", durationMs: 2, ok: true, rowCount: 1 })
        expect(first.ok).toBe(true)
        const listed = yield* history.list("c1")
        expect(listed[0]?.id).toBe(first.id)
      })
    )
  )

  it.scoped("list does not create a host directory", () =>
    withStores(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const history = yield* HistoryStore
        const config = yield* ConfigService
        const cfg = yield* config.get
        expect(yield* history.list("ghost")).toHaveLength(0)
        expect(yield* fs.exists(`${cfg.storage.dataDir}/ghost`)).toBe(false)
      })
    )
  )

  it.scoped("reads leftover session history through the shared workspace", () =>
    withStores(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const history = yield* HistoryStore
        const config = yield* ConfigService
        const cfg = yield* config.get
        yield* fs.makeDirectory(`${cfg.storage.dataDir}/local_maap`, { recursive: true })
        yield* fs.writeFileString(
          `${cfg.storage.dataDir}/local_maap/history.json`,
          JSON.stringify([
            {
              id: "h1",
              connectionId: "local_maap",
              sql: "SELECT 1",
              executedAt: 1,
              durationMs: 1,
              ok: true
            }
          ])
        )
        const listed = yield* history.list("local")
        expect(listed[0]?.id).toBe("h1")
        expect(listed[0]?.connectionId).toBe("local")
      })
    )
  )
})
