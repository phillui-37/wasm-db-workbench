import { FileSystem, HttpApiBuilder, HttpApiClient } from "@effect/platform"
import { NodeContext, NodeHttpServer } from "@effect/platform-node"
import { describe, expect, it } from "@effect/vitest"
import { defaultAppConfig, WorkbenchApi } from "@workbench/shared"
import { ConfigProvider, Effect, Layer } from "effect"
import { stringify } from "yaml"
import { ApiLive } from "../src/http/api-live.ts"
import { StoresLive } from "../src/layers.ts"

describe("HttpApi", () => {
  it.scoped("health and config round-trip through the generated client", () =>
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
      const HttpLive = HttpApiBuilder.serve().pipe(
        Layer.provide(ApiLive.pipe(Layer.provide(StoresLive.pipe(Layer.provide(Layer.setConfigProvider(provider)))))),
        Layer.provideMerge(NodeHttpServer.layerTest)
      )
      yield* Effect.gen(function* () {
        const client = yield* HttpApiClient.make(WorkbenchApi)
        const health = yield* client.health.check()
        expect(health.status).toBe("ok")
        const cfg = yield* client.config.get()
        expect(cfg.defaults.engine).toBe("pglite")
      }).pipe(Effect.provide(HttpLive))
    }).pipe(Effect.provide(NodeContext.layer))
  )
})
