import { Context, Effect } from "effect"
import { ConnectionNotFound, DumpError, SqlExecError } from "./errors.ts"
import type { Catalog, QueryResult, ScriptResult } from "./schema/models.ts"
import type { EngineType } from "./schema/config.ts"

export type QueryParams = ReadonlyArray<unknown> | Readonly<Record<string, unknown>>

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
  readonly query: (sql: string, params?: QueryParams) => Effect.Effect<ScriptResult, SqlExecError>
  readonly introspect: Effect.Effect<Catalog, SqlExecError>
  readonly exportBinary: Effect.Effect<Uint8Array, DumpError>
  readonly importBinary: (bytes: Uint8Array) => Effect.Effect<void, DumpError>
  readonly exportSql: Effect.Effect<string, DumpError | SqlExecError>
  readonly importSql: (sql: string) => Effect.Effect<void, SqlExecError>
  readonly applyCellEdit: (edit: CellEdit) => Effect.Effect<void, SqlExecError>
  readonly close: Effect.Effect<void>
}

export type TestEngine = EngineApi & { readonly wasInterrupted: () => boolean }

export const makeTestEngine = (options?: {
  readonly hangQuery?: boolean
}): TestEngine => {
  let interrupted = false
  const tables = new Map<string, { columns: Array<string>; rows: Array<Array<unknown>> }>()
  tables.set("public.items", {
    columns: ["id", "name"],
    rows: [[1, "alpha"]]
  })

  const query = (sql: string, _params?: QueryParams): Effect.Effect<ScriptResult, SqlExecError> => {
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
    const table = tables.get("public.items")
    const result: QueryResult = trimmed.startsWith("select")
      ? {
          columns: table?.columns ?? [],
          rows: table?.rows ?? [],
          rowCount: table?.rows.length ?? 0,
          durationMs: 1
        }
      : { columns: [], rows: [], rowCount: 0, durationMs: 1 }
    return Effect.succeed({
      statements: [{ ...result, sql }],
      durationMs: 1
    })
  }

  return {
    dialect: "pgsql",
    engine: "pglite",
    query,
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
  }
}

export class ConnectionHub extends Context.Tag("app/ConnectionHub")<
  ConnectionHub,
  {
    readonly open: (id: string, engine: EngineApi) => Effect.Effect<void>
    readonly close: (id: string) => Effect.Effect<void>
    readonly get: (id: string) => Effect.Effect<EngineApi, ConnectionNotFound>
  }
>() {}
