import { Schema } from "effect"
import { EngineType, SyncFormat } from "./config.ts"

export const Health = Schema.Struct({
  status: Schema.Literal("ok")
})
export type Health = Schema.Schema.Type<typeof Health>

export const Script = Schema.Struct({
  connectionId: Schema.String,
  name: Schema.String,
  sql: Schema.String,
  updatedAt: Schema.Number
})
export type Script = Schema.Schema.Type<typeof Script>

export const ScriptWrite = Schema.Struct({
  sql: Schema.String
})
export type ScriptWrite = Schema.Schema.Type<typeof ScriptWrite>

export const HistoryEntry = Schema.Struct({
  id: Schema.String,
  connectionId: Schema.String,
  sql: Schema.String,
  executedAt: Schema.Number,
  durationMs: Schema.Number,
  ok: Schema.Boolean,
  error: Schema.optional(Schema.String),
  rowCount: Schema.optional(Schema.Number)
})
export type HistoryEntry = Schema.Schema.Type<typeof HistoryEntry>

export const HistoryWrite = Schema.Struct({
  sql: Schema.String,
  durationMs: Schema.Number,
  ok: Schema.Boolean,
  error: Schema.optional(Schema.String),
  rowCount: Schema.optional(Schema.Number)
})
export type HistoryWrite = Schema.Schema.Type<typeof HistoryWrite>

export const SyncPayload = Schema.Struct({
  connectionId: Schema.String,
  engine: EngineType,
  sqlDump: Schema.optional(Schema.String),
  binaryBase64: Schema.optional(Schema.String)
})
export type SyncPayload = Schema.Schema.Type<typeof SyncPayload>

export const HostFile = Schema.Struct({
  name: Schema.String,
  size: Schema.Number,
  updatedAt: Schema.Number
})
export type HostFile = Schema.Schema.Type<typeof HostFile>

export const SyncPush = Schema.Struct({
  engine: EngineType,
  format: SyncFormat,
  sqlDump: Schema.optional(Schema.String),
  binaryBase64: Schema.optional(Schema.String)
})
export type SyncPush = Schema.Schema.Type<typeof SyncPush>

export const ConnectionIdPath = Schema.Struct({
  connectionId: Schema.String
})

export const ScriptPath = Schema.Struct({
  connectionId: Schema.String,
  name: Schema.String
})

export const Column = Schema.Struct({
  name: Schema.String,
  type: Schema.String,
  nullable: Schema.Boolean,
  pk: Schema.Boolean
})
export type Column = Schema.Schema.Type<typeof Column>

export const Table = Schema.Struct({
  schema: Schema.String,
  name: Schema.String,
  kind: Schema.Literal("table", "view"),
  columns: Schema.Array(Column)
})
export type Table = Schema.Schema.Type<typeof Table>

export const Catalog = Schema.Struct({
  schemas: Schema.Array(Schema.String),
  tables: Schema.Array(Table)
})
export type Catalog = Schema.Schema.Type<typeof Catalog>

export const QueryResult = Schema.Struct({
  columns: Schema.Array(Schema.String),
  rows: Schema.Array(Schema.Array(Schema.Unknown)),
  rowCount: Schema.Number,
  durationMs: Schema.Number
})
export type QueryResult = Schema.Schema.Type<typeof QueryResult>

export const ConnectionMeta = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  engine: EngineType
})
export type ConnectionMeta = Schema.Schema.Type<typeof ConnectionMeta>
