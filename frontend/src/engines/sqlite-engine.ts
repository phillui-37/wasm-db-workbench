import {
  DumpError,
  analyzeSql,
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

type Sqlite3Module = typeof import("@sqlite.org/sqlite-wasm")
type Sqlite3InitModule = Sqlite3Module["default"]
type Sqlite3 = Awaited<ReturnType<Sqlite3InitModule>>
type SqliteDb = InstanceType<Sqlite3["oo1"]["DB"]>

let loader: Promise<Sqlite3> | undefined
let idbDb: Promise<IDBDatabase> | undefined

const loadSqlite = () => {
  loader ??= import("@sqlite.org/sqlite-wasm").then((mod) =>
    mod.default({
      print: () => undefined,
      printErr: () => undefined
    })
  )
  return loader
}

const openIdb = () => {
  idbDb ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open("workbench-sqlite", 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore("kv")
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return idbDb
}

const idbGet = (key: string) =>
  Effect.tryPromise({
    try: async () => {
      const db = await openIdb()
      return await new Promise<Uint8Array | undefined>((resolve, reject) => {
        const tx = db.transaction("kv", "readonly")
        const get = tx.objectStore("kv").get(key)
        get.onsuccess = () => {
          const value = get.result
          resolve(value instanceof Uint8Array ? value : undefined)
        }
        get.onerror = () => reject(get.error)
      })
    },
    catch: (e) => new SqlExecError({ message: String(e) })
  })

const idbPut = (key: string, value: Uint8Array) =>
  Effect.tryPromise({
    try: async () => {
      const db = await openIdb()
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("kv", "readwrite")
        tx.objectStore("kv").put(value.slice(), key)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    },
    catch: (e) => new SqlExecError({ message: String(e) })
  })

export const wipeSqliteLocal = (key: string) =>
  new Promise<void>((resolve, reject) => {
    void openIdb()
      .then((db) => {
        const tx = db.transaction("kv", "readwrite")
        tx.objectStore("kv").delete(key)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
      .catch(reject)
  })

const execQuery = (db: SqliteDb, sql: string, params?: QueryParams): QueryResult => {
  const started = Date.now()
  const resultRows: Array<Array<string | number | bigint | Uint8Array | Int8Array | ArrayBuffer | null>> = []
  const columnNames: Array<string> = []
  const bind = params === undefined ? undefined : Array.isArray(params) ? [...params] : { ...params }
  db.exec({
    sql,
    bind: bind as never,
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

const copyExport = (sqlite3: Sqlite3, db: SqliteDb): Uint8Array => sqlite3.capi.sqlite3_js_db_export(db).slice()

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

const PERSIST_DEBOUNCE_MS = 400

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

    let persistTimer: ReturnType<typeof setTimeout> | undefined
    let closed = false

    const persistNow = () =>
      Effect.gen(function* () {
        if (closed) return
        const bytes = yield* Effect.try({
          try: () => copyExport(sqlite3, db),
          catch: (e) => new SqlExecError({ message: String(e) })
        })
        if (bytes.byteLength > 0) yield* idbPut(connectionId, bytes).pipe(Effect.ignore)
      })

    const schedulePersist = () => {
      if (persistTimer) clearTimeout(persistTimer)
      persistTimer = setTimeout(() => {
        persistTimer = undefined
        void Effect.runPromise(persistNow().pipe(Effect.ignore))
      }, PERSIST_DEBOUNCE_MS)
    }

    const flushPersist = () =>
      Effect.sync(() => {
        if (persistTimer) {
          clearTimeout(persistTimer)
          persistTimer = undefined
        }
      }).pipe(Effect.zipRight(persistNow()))

    const queryOne = (sql: string, params?: QueryParams) =>
      Effect.try({
        try: () => execQuery(db, sql, params),
        catch: (e) => new SqlExecError({ message: String(e) })
      })

    const query = (sql: string, params?: QueryParams): Effect.Effect<ScriptResult, SqlExecError> => {
      const analysis = analyzeSql(sql)
      const run = params
        ? queryOne(sql, params).pipe(
            Effect.map((result) => ({ statements: [{ ...result, sql }], durationMs: result.durationMs }))
          )
        : runStatements(sql, (stmt) => queryOne(stmt), analysis.statements)
      return run.pipe(
        Effect.tap(() =>
          analysis.isWrite
            ? Effect.sync(() => {
                schedulePersist()
              })
            : Effect.void
        )
      )
    }

    const introspect = Effect.gen(function* () {
      const master = yield* query(
        "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      const tables: Array<Catalog["tables"][number]> = []
      for (const row of lastResult(master).rows) {
        const name = String(row[0])
        const kind = String(row[1]).includes("view") ? ("view" as const) : ("table" as const)
        const info = yield* query(`PRAGMA table_info(${quoteIdent("sqlite", name)})`)
        const fkInfo = yield* query(`PRAGMA foreign_key_list(${quoteIdent("sqlite", name)})`)
        const fks = new Map<string, { table: string; column: string }>()
        for (const fk of lastResult(fkInfo).rows) {
          fks.set(String(fk[3]), { table: String(fk[2]), column: String(fk[4]) })
        }
        tables.push({
          schema: "main",
          name,
          kind,
          columns: lastResult(info).rows.map((c) => {
            const colName = String(c[1])
            const fk = fks.get(colName)
            return {
              name: colName,
              type: String(c[2] ?? "TEXT"),
              nullable: Number(c[3]) === 0,
              pk: Number(c[5]) > 0,
              fkTable: fk?.table,
              fkColumn: fk?.column
            }
          })
        })
      }
      return { schemas: ["main"], tables } satisfies Catalog
    })

    const engine: EngineApi = {
      dialect: "sqlite",
      engine: "sqlite",
      query,
      introspect,
      exportBinary: flushPersist().pipe(
        Effect.mapError((e) => new DumpError({ message: e.message })),
        Effect.zipRight(
          Effect.try({
            try: () => copyExport(sqlite3, db),
            catch: (e) => new DumpError({ message: String(e) })
          })
        )
      ),
      importBinary: (bytes) =>
        Effect.try({
          try: () => deserializeInto(sqlite3, db, bytes),
          catch: (e) => new DumpError({ message: String(e) })
        }).pipe(
          Effect.tap(() => flushPersist().pipe(Effect.mapError((e) => new DumpError({ message: e.message }))))
        ),
      exportSql: Effect.suspend(() => dumpSqlFromEngine(engine)),
      importSql: (sql) => query(sql).pipe(Effect.asVoid),
      applyCellEdit: (edit: CellEdit) =>
        query(
          `UPDATE ${qualifyTable("sqlite", edit.schema, edit.table)} SET ${quoteIdent("sqlite", edit.column)} = ${quoteLiteral(edit.value)} WHERE ${quoteIdent("sqlite", edit.pkColumn)} = ${quoteLiteral(edit.pkValue)}`
        ).pipe(Effect.asVoid),
      close: Effect.gen(function* () {
        yield* flushPersist().pipe(Effect.ignore)
        closed = true
        db.close()
      })
    }
    return engine
  })
