import {
  DumpError,
  emptyQueryResult,
  lastResult,
  qualifyTable,
  quoteIdent,
  quoteLiteral,
  runStatements,
  SqlExecError,
  type Catalog,
  type CellEdit,
  type EngineApi,
  type QueryParams,
  type QueryResult,
  type ScriptResult
} from "@workbench/shared"
import { Effect } from "effect"
import { dumpSqlFromEngine } from "./dump.ts"

type PGliteInstance = {
  query: (sql: string, params?: Array<unknown>) => Promise<{
    rows: Array<Record<string, unknown>>
    fields: Array<{ name: string }>
    affectedRows?: number
  }>
  exec: (sql: string) => Promise<unknown>
  dumpDataDir: () => Promise<File | Blob>
  loadDataDir: (file: File | Blob) => Promise<void>
  close: () => Promise<void>
}

const toResult = (
  started: number,
  rows: Array<Record<string, unknown>>,
  fields: Array<{ name: string }>,
  affected?: number
): QueryResult => {
  const columns = fields.map((f) => f.name)
  return {
    columns,
    rows: rows.map((row) => columns.map((c) => row[c] ?? null)),
    rowCount: rows.length > 0 ? rows.length : (affected ?? 0),
    durationMs: Date.now() - started
  }
}

const bindArray = (params?: QueryParams): Array<unknown> | undefined => {
  if (!params) return undefined
  return Array.isArray(params) ? [...params] : Object.values(params)
}

export const makePgliteEngine = (connectionId: string): Effect.Effect<EngineApi, SqlExecError> =>
  Effect.gen(function* () {
    const mod = yield* Effect.tryPromise({
      try: () => import("@electric-sql/pglite"),
      catch: (e) => new SqlExecError({ message: String(e) })
    })
    const pg = (yield* Effect.tryPromise({
      try: () => mod.PGlite.create(`idb://workbench-${connectionId}`),
      catch: (e) => new SqlExecError({ message: String(e) })
    })) as unknown as PGliteInstance

    const queryOne = (sql: string, params?: QueryParams) =>
      Effect.tryPromise({
        try: async () => {
          const started = Date.now()
          const bind = bindArray(params)
          try {
            const result = bind ? await pg.query(sql, bind) : await pg.query(sql)
            return toResult(started, result.rows ?? [], result.fields ?? [], result.affectedRows)
          } catch {
            await pg.exec(sql)
            return emptyQueryResult(Date.now() - started)
          }
        },
        catch: (e) => new SqlExecError({ message: String(e) })
      })

    const query = (sql: string, params?: QueryParams): Effect.Effect<ScriptResult, SqlExecError> => {
      if (params) {
        return queryOne(sql, params).pipe(
          Effect.map((result) => ({ statements: [{ ...result, sql }], durationMs: result.durationMs }))
        )
      }
      return runStatements(sql, (stmt) => queryOne(stmt))
    }

    const introspect = Effect.gen(function* () {
      const tablesRes = yield* query(`
        SELECT table_schema, table_name, table_type
        FROM information_schema.tables
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY table_schema, table_name
      `)
      const colRes = yield* query(`
        SELECT table_schema, table_name, column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY ordinal_position
      `)
      const pkRes = yield* query(`
        SELECT kcu.table_schema, kcu.table_name, kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
      `)
      const fkRes = yield* query(`
        SELECT
          kcu.table_schema, kcu.table_name, kcu.column_name,
          ccu.table_name, ccu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
         AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
      `)
      const pks = new Set(lastResult(pkRes).rows.map((r) => `${r[0]}.${r[1]}.${r[2]}`))
      const fks = new Map<string, { table: string; column: string }>()
      for (const row of lastResult(fkRes).rows) {
        fks.set(`${row[0]}.${row[1]}.${row[2]}`, { table: String(row[3]), column: String(row[4]) })
      }
      const columnsByTable = new Map<string, Array<Catalog["tables"][number]["columns"][number]>>()
      for (const row of lastResult(colRes).rows) {
        const schema = String(row[0])
        const name = String(row[1])
        const key = `${schema}.${name}`
        const list = columnsByTable.get(key) ?? []
        const colName = String(row[2])
        const fk = fks.get(`${schema}.${name}.${colName}`)
        list.push({
          name: colName,
          type: String(row[3]),
          nullable: String(row[4]).toUpperCase() === "YES",
          pk: pks.has(`${schema}.${name}.${colName}`),
          fkTable: fk?.table,
          fkColumn: fk?.column
        })
        columnsByTable.set(key, list)
      }
      const tables = lastResult(tablesRes).rows.map((row) => {
        const schema = String(row[0])
        const name = String(row[1])
        return {
          schema,
          name,
          kind: String(row[2]).toLowerCase().includes("view") ? ("view" as const) : ("table" as const),
          columns: columnsByTable.get(`${schema}.${name}`) ?? []
        }
      })
      const schemas = [...new Set(tables.map((t) => t.schema))]
      return { schemas, tables } satisfies Catalog
    })

    const engine: EngineApi = {
      dialect: "pgsql",
      engine: "pglite",
      query,
      introspect,
      exportBinary: Effect.tryPromise({
        try: async () => new Uint8Array(await (await pg.dumpDataDir()).arrayBuffer()),
        catch: (e) => new DumpError({ message: String(e) })
      }),
      importBinary: (bytes) =>
        Effect.tryPromise({
          try: () => pg.loadDataDir(new Blob([bytes.buffer as ArrayBuffer])),
          catch: (e) => new DumpError({ message: String(e) })
        }),
      exportSql: Effect.suspend(() => dumpSqlFromEngine(engine)),
      importSql: (sql) => query(sql).pipe(Effect.asVoid),
      applyCellEdit: (edit: CellEdit) =>
        query(
          `UPDATE ${qualifyTable("pgsql", edit.schema, edit.table)} SET ${quoteIdent("pgsql", edit.column)} = ${quoteLiteral(edit.value)} WHERE ${quoteIdent("pgsql", edit.pkColumn)} = ${quoteLiteral(edit.pkValue)}`
        ).pipe(Effect.asVoid),
      close: Effect.tryPromise({
        try: () => pg.close(),
        catch: (e) => new SqlExecError({ message: String(e) })
      }).pipe(Effect.ignore)
    }
    return engine
  })
