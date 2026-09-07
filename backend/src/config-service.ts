import { FileSystem, Path } from "@effect/platform"
import { ConfigIoError, ConfigParseError, type AppConfig, AppConfig as AppConfigSchema } from "@workbench/shared"
import { Config, Context, Effect, Layer, Option, Schema } from "effect"
import { isAbsolute, resolve } from "node:path"
import { parse, stringify } from "yaml"
import { repoRoot } from "./root.ts"

const resolveDir = (dir: string) => (isAbsolute(dir) ? dir : resolve(repoRoot, dir))

const overlayEnv = (cfg: AppConfig, dataDir: Option.Option<string>, scriptsDir: Option.Option<string>): AppConfig => ({
  ...cfg,
  storage: {
    ...cfg.storage,
    dataDir: Option.getOrElse(dataDir, () => resolveDir(cfg.storage.dataDir)),
    scriptsDir: Option.getOrElse(scriptsDir, () => resolveDir(cfg.storage.scriptsDir))
  }
})

export class ConfigService extends Context.Tag("app/ConfigService")<
  ConfigService,
  {
    readonly get: Effect.Effect<AppConfig, ConfigParseError | ConfigIoError>
    readonly set: (cfg: AppConfig) => Effect.Effect<AppConfig, ConfigParseError | ConfigIoError>
  }
>() {}

export const makeConfigService = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const configPath = yield* Config.string("CONFIG_PATH").pipe(
    Config.withDefault(`${repoRoot}/config/app.yaml`)
  )
  const dataDir = yield* Config.option(Config.string("DATA_DIR"))
  const scriptsDir = yield* Config.option(Config.string("SCRIPTS_DIR"))

  const get = Effect.gen(function* () {
    const raw = yield* fs.readFileString(configPath).pipe(
      Effect.mapError((e) => new ConfigIoError({ message: e.message }))
    )
    const decoded = yield* Schema.decodeUnknown(AppConfigSchema)(parse(raw)).pipe(
      Effect.mapError((e) => new ConfigParseError({ message: String(e) }))
    )
    return overlayEnv(decoded, dataDir, scriptsDir)
  })

  const set = (cfg: AppConfig) =>
    Effect.gen(function* () {
      const encoded = yield* Schema.encode(AppConfigSchema)(cfg).pipe(
        Effect.mapError((e) => new ConfigParseError({ message: String(e) }))
      )
      yield* fs
        .makeDirectory(path.dirname(configPath), { recursive: true })
        .pipe(Effect.ignore)
      yield* fs.writeFileString(configPath, stringify(encoded)).pipe(
        Effect.mapError((e) => new ConfigIoError({ message: e.message }))
      )
      return overlayEnv(cfg, dataDir, scriptsDir)
    })

  return ConfigService.of({ get, set })
})

export const ConfigServiceLive = Layer.effect(ConfigService, makeConfigService)
