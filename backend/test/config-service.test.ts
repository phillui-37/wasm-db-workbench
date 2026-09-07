import { FileSystem } from "@effect/platform"
import { NodeContext } from "@effect/platform-node"
import { describe, expect, it } from "@effect/vitest"
import { defaultAppConfig } from "@workbench/shared"
import { ConfigProvider, Effect, Layer } from "effect"
import { stringify } from "yaml"
import { ConfigService } from "../src/config-service.ts"
import { StoresLive } from "../src/layers.ts"

const withTempConfig = <A, E, R>(program: Effect.Effect<A, E, R>) =>
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

describe("ConfigService", () => {
  it.scoped("reads yaml from disk", () =>
    withTempConfig(
      Effect.gen(function* () {
        const config = yield* ConfigService
        const cfg = yield* config.get
        expect(cfg.editor.theme).toBe("vs-dark")
        expect(cfg.storage.historyLimit).toBe(500)
      })
    )
  )

  it.scoped("writes yaml and reads it back", () =>
    withTempConfig(
      Effect.gen(function* () {
        const config = yield* ConfigService
        const current = yield* config.get
        const updated = yield* config.set({
          ...current,
          query: { ...current.query, maxRows: 42 }
        })
        expect(updated.query.maxRows).toBe(42)
        expect((yield* config.get).query.maxRows).toBe(42)
      })
    )
  )
})
