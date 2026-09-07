import { Context, Effect, Layer } from "effect"
import { ConnectionNotFound, DumpError, SqlExecError } from "./errors.ts"
import type { Catalog, QueryResult } from "./schema/models.ts"
import type { EngineType } from "./schema/config.ts"

export interface CellEdit {
  readonly schema: string
  readonly table: string
  readonly pkColumn: string
  readonly pkValue: unknown
  readonly column: string
  readonly value: unknown
}

export interface EngineApi {
  readonly dialect: "pgsql" | "sqlite"
  readonly engine: EngineType
  readonly query: (sql: string) => Effect.Effect<QueryResult, SqlExecError>
  readonly exec: (sql: string) => Effect.Effect<QueryResult, SqlExecError>
  readonly introspect: Effect.Effect<Catalog, SqlExecError>
  readonly exportBinary: Effect.Effect<Uint8Array, DumpError>
  readonly importBinary: (bytes: Uint8Array) => Effect.Effect<void, DumpError>
  readonly exportSql: Effect.Effect<string, DumpError | SqlExecError>
  readonly importSql: (sql: string) => Effect.Effect<void, SqlExecError>
  readonly applyCellEdit: (edit: CellEdit) => Effect.Effect<void, SqlExecError>
  readonly close: Effect.Effect<void>
}

export class DbEngine extends Context.Tag("app/DbEngine")<DbEngine, EngineApi>() {}

export const makeTestEngine = (options?: {
  readonly hangQuery?: boolean
}): EngineApi => {
  let interrupted = false
  const tables = new Map<string, { columns: Array<string>; rows: Array<Array<unknown>> }>()
  tables.set("public.items", {
    columns: ["id", "name"],
    rows: [[1, "alpha"]]
  })

  const query = (sql: string): Effect.Effect<QueryResult, SqlExecError> => {
    if (options?.hangQuery) {
      return Effect.never.pipe(
        Effect.onInterrupt(() =>
          Effect.sync(() => {
            interrupted = true
          })
        )
      )
    }
    const trimmed = sql.trim().toLowerCase()
    if (trimmed.startsWith("select")) {
      const table = tables.get("public.items")
      return Effect.succeed({
        columns: table?.columns ?? [],
        rows: table?.rows ?? [],
        rowCount: table?.rows.length ?? 0,
        durationMs: 1
      })
    }
    return Effect.succeed({ columns: [], rows: [], rowCount: 0, durationMs: 1 })
  }

  return {
    dialect: "pgsql",
    engine: "pglite",
    query,
    exec: query,
    introspect: Effect.succeed({
      schemas: ["public"],
      tables: [
        {
          schema: "public",
          name: "items",
          kind: "table" as const,
          columns: [
            { name: "id", type: "int", nullable: false, pk: true },
            { name: "name", type: "text", nullable: false, pk: false }
          ]
        }
      ]
    }),
    exportBinary: Effect.succeed(new Uint8Array([1, 2, 3])),
    importBinary: () => Effect.void,
    exportSql: Effect.succeed("CREATE TABLE items (id int, name text);\nINSERT INTO items VALUES (1, 'alpha');\n"),
    importSql: () => Effect.void,
    applyCellEdit: () => Effect.void,
    close: Effect.void,
    wasInterrupted: () => interrupted
  } as EngineApi & { wasInterrupted: () => boolean }
}

export const DbEngineTest = Layer.succeed(DbEngine, makeTestEngine())

export class ConnectionHub extends Context.Tag("app/ConnectionHub")<
  ConnectionHub,
  {
    readonly open: (id: string, engine: EngineApi) => Effect.Effect<void>
    readonly close: (id: string) => Effect.Effect<void>
    readonly get: (id: string) => Effect.Effect<EngineApi, ConnectionNotFound>
  }
>() {}
