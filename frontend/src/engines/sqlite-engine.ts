import sqlite3InitModule from "@sqlite.org/sqlite-wasm"
import {
  DumpError,
  isWriteSql,
  qualifyTable,
  quoteIdent,
  quoteLiteral,
  runStatements,
  SqlExecError,
  type Catalog,
  type CellEdit,
  type EngineApi,
  type QueryResult
} from "@workbench/shared"
import { Effect } from "effect"
import { dumpSqlFromEngine } from "./dump.ts"

type Sqlite3 = Awaited<ReturnType<typeof sqlite3InitModule>>
type SqliteDb = InstanceType<Sqlite3["oo1"]["DB"]>

let loader: Promise<Sqlite3> | undefined

const loadSqlite = () => {
  loader ??= sqlite3InitModule({
    print: () => undefined,
    printErr: () => undefined
  })
  return loader
}

const idbGet = (key: string) =>
  Effect.tryPromise({
    try: () =>
      new Promise<Uint8Array | undefined>((resolve, reject) => {
        const req = indexedDB.open("workbench-sqlite", 1)
        req.onupgradeneeded = () => {
          req.result.createObjectStore("kv")
        }
        req.onsuccess = () => {
          const tx = req.result.transaction("kv", "readonly")
          const get = tx.objectStore("kv").get(key)
          get.onsuccess = () => {
            const value = get.result
            resolve(value instanceof Uint8Array ? value : undefined)
          }
          get.onerror = () => reject(get.error)
        }
        req.onerror = () => reject(req.error)
      }),
    catch: (e) => new SqlExecError({ message: String(e) })
  })

const idbPut = (key: string, value: Uint8Array) =>
  Effect.tryPromise({
    try: () =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open("workbench-sqlite", 1)
        req.onupgradeneeded = () => {
          req.result.createObjectStore("kv")
        }
        req.onsuccess = () => {
          const tx = req.result.transaction("kv", "readwrite")
          tx.objectStore("kv").put(value.slice(), key)
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
        }
        req.onerror = () => reject(req.error)
      }),
    catch: (e) => new SqlExecError({ message: String(e) })
  })

const execQuery = (db: SqliteDb, sql: string): QueryResult => {
  const started = Date.now()
  const resultRows: Array<Array<string | number | bigint | Uint8Array | Int8Array | ArrayBuffer | null>> = []
  const columnNames: Array<string> = []
  db.exec({
    sql,
    rowMode: "array",
    resultRows,
    columnNames
  })
  return {
    columns: columnNames,
    rows: resultRows,
    rowCount: resultRows.length,
    durationMs: Date.now() - started
  }
}

const copyExport = (sqlite3: Sqlite3, db: SqliteDb): Uint8Array => {
  const exported = sqlite3.capi.sqlite3_js_db_export(db)
  return exported.slice()
}

const deserializeInto = (sqlite3: Sqlite3, db: SqliteDb, bytes: Uint8Array) => {
  const copy = bytes.byteLength > 0 ? bytes : new Uint8Array(1)
  const pointer = sqlite3.wasm.allocFromTypedArray(copy)
  const rc = sqlite3.capi.sqlite3_deserialize(
    db,
    "main",
    pointer,
    bytes.byteLength,
    bytes.byteLength,
    sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE | sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE
  )
  if (rc !== sqlite3.capi.SQLITE_OK) {
    throw new Error(sqlite3.capi.sqlite3_js_rc_str(rc) ?? `sqlite3_deserialize ${rc}`)
  }
}

export const makeSqliteEngine = (connectionId: string): Effect.Effect<EngineApi, SqlExecError> =>
  Effect.gen(function* () {
    const sqlite3 = yield* Effect.tryPromise({
      try: () => loadSqlite(),
      catch: (e) => new SqlExecError({ message: String(e) })
    })
    const db = new sqlite3.oo1.DB(":memory:", "c")
    const saved = yield* idbGet(connectionId).pipe(Effect.orElseSucceed(() => undefined))
    if (saved && saved.byteLength > 0) {
      yield* Effect.try({
        try: () => deserializeInto(sqlite3, db, saved),
        catch: (e) => new SqlExecError({ message: String(e) })
      }).pipe(Effect.ignore)
    }

    const persist = () =>
      Effect.gen(function* () {
        const bytes = yield* Effect.try({
          try: () => copyExport(sqlite3, db),
          catch: (e) => new SqlExecError({ message: String(e) })
        })
        if (bytes.byteLength > 0) yield* idbPut(connectionId, bytes).pipe(Effect.ignore)
      })

    const queryOne = (sql: string) =>
      Effect.try({
        try: () => execQuery(db, sql),
        catch: (e) => new SqlExecError({ message: String(e) })
      })

    const query = (sql: string) =>
      runStatements(sql, queryOne).pipe(
        Effect.tap(() => (isWriteSql(sql) ? persist().pipe(Effect.ignore) : Effect.void))
      )

    const introspect = Effect.gen(function* () {
      const master = yield* query(
        "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      const tables: Array<Catalog["tables"][number]> = []
      for (const row of master.rows) {
        const name = String(row[0])
        const kind = String(row[1]).includes("view") ? ("view" as const) : ("table" as const)
        const info = yield* query(`PRAGMA table_info(${quoteIdent("sqlite", name)})`)
        tables.push({
          schema: "main",
          name,
          kind,
          columns: info.rows.map((c) => ({
            name: String(c[1]),
            type: String(c[2] ?? "TEXT"),
            nullable: Number(c[3]) === 0,
            pk: Number(c[5]) > 0
          }))
        })
      }
      return { schemas: ["main"], tables } satisfies Catalog
    })

    const engine: EngineApi = {
      dialect: "sqlite",
      engine: "sqlite",
      query,
      exec: query,
      introspect,
      exportBinary: Effect.try({
        try: () => copyExport(sqlite3, db),
        catch: (e) => new DumpError({ message: String(e) })
      }),
      importBinary: (bytes) =>
        Effect.try({
          try: () => deserializeInto(sqlite3, db, bytes),
          catch: (e) => new DumpError({ message: String(e) })
        }).pipe(Effect.tap(() => persist().pipe(Effect.mapError((e) => new DumpError({ message: e.message }))))),
      exportSql: Effect.suspend(() => dumpSqlFromEngine(engine)),
      importSql: (sql) => query(sql).pipe(Effect.asVoid),
      applyCellEdit: (edit: CellEdit) =>
        query(
          `UPDATE ${qualifyTable("sqlite", edit.schema, edit.table)} SET ${quoteIdent("sqlite", edit.column)} = ${quoteLiteral(edit.value)} WHERE ${quoteIdent("sqlite", edit.pkColumn)} = ${quoteLiteral(edit.pkValue)}`
        ).pipe(Effect.asVoid),
      close: Effect.sync(() => db.close())
    }
    return engine
  })
