import { Schema } from "effect"

export const EditorTheme = Schema.Literal("vs-dark", "vs")
export type EditorTheme = Schema.Schema.Type<typeof EditorTheme>

export const SyncTrigger = Schema.Literal("manual", "interval", "onChange")
export type SyncTrigger = Schema.Schema.Type<typeof SyncTrigger>

export const SyncFormat = Schema.Literal("binary", "sql", "both")
export type SyncFormat = Schema.Schema.Type<typeof SyncFormat>

export const PullOnOpen = Schema.Literal("prompt", "always", "never")
export type PullOnOpen = Schema.Schema.Type<typeof PullOnOpen>

export const EngineType = Schema.Literal("pglite", "sqlite")
export type EngineType = Schema.Schema.Type<typeof EngineType>

export const AppConfig = Schema.Struct({
  editor: Schema.Struct({
    theme: EditorTheme,
    fontSize: Schema.Number,
    tabSize: Schema.Number
  }),
  query: Schema.Struct({
    maxRows: Schema.Number,
    confirmDestructive: Schema.Boolean
  }),
  sync: Schema.Struct({
    trigger: SyncTrigger,
    intervalSeconds: Schema.Number,
    debounceMs: Schema.Number,
    format: SyncFormat,
    pullOnOpen: PullOnOpen
  }),
  storage: Schema.Struct({
    dataDir: Schema.String,
    scriptsDir: Schema.String,
    historyLimit: Schema.Number
  }),
  engines: Schema.Struct({
    pglite: Schema.Struct({ enabled: Schema.Boolean }),
    sqlite: Schema.Struct({ enabled: Schema.Boolean })
  }),
  defaults: Schema.Struct({
    engine: EngineType
  })
})
export type AppConfig = Schema.Schema.Type<typeof AppConfig>

export const defaultAppConfig: AppConfig = {
  editor: { theme: "vs-dark", fontSize: 14, tabSize: 2 },
  query: { maxRows: 1000, confirmDestructive: true },
  sync: {
    trigger: "manual",
    intervalSeconds: 60,
    debounceMs: 2000,
    format: "both",
    pullOnOpen: "prompt"
  },
  storage: { dataDir: "data", scriptsDir: "scripts", historyLimit: 500 },
  engines: {
    pglite: { enabled: true },
    sqlite: { enabled: true }
  },
  defaults: { engine: "pglite" }
}
