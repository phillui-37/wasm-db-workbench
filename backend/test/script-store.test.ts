import { FileSystem } from "@effect/platform"
import { NodeContext } from "@effect/platform-node"
import { describe, expect, it } from "@effect/vitest"
import { defaultAppConfig, PathUnsafeError } from "@workbench/shared"
import { ConfigProvider, Effect, Layer } from "effect"
import { stringify } from "yaml"
import { ScriptStore } from "../src/script-store.ts"
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

describe("ScriptStore", () => {
  it.scoped("puts lists and removes scripts", () =>
    withStores(
      Effect.gen(function* () {
        const scripts = yield* ScriptStore
        yield* scripts.put("demo", "init", "SELECT 1")
        yield* scripts.put("demo", "fav", "SELECT 2", true)
        const listed = yield* scripts.list("demo")
        expect(listed[0]?.name).toBe("fav")
        expect(listed[0]?.pinned).toBe(true)
        expect(listed).toHaveLength(2)
        expect(listed[1]?.sql).toBe("SELECT 1")
        yield* scripts.remove("demo", "init")
        yield* scripts.remove("demo", "fav")
        expect(yield* scripts.list("demo")).toHaveLength(0)
      })
    )
  )

  it.scoped("rejects unsafe names", () =>
    withStores(
      Effect.gen(function* () {
        const scripts = yield* ScriptStore
        const result = yield* scripts.put("../x", "a", "SELECT 1").pipe(Effect.either)
        expect(result._tag).toBe("Left")
        if (result._tag === "Left") {
          expect(result.left).toBeInstanceOf(PathUnsafeError)
        }
      })
    )
  )
})
