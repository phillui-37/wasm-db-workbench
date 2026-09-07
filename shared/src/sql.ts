import { Effect } from "effect"
import { PG_FUNCTIONS, PG_KEYWORDS, PG_TYPES, SQLITE_FUNCTIONS, SQLITE_KEYWORDS, SQLITE_TYPES } from "./dialects.ts"
import type { QueryResult } from "./schema/models.ts"

const stripSqlComments = (sql: string): string =>
  sql.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")

const WRITE_HEAD =
  /^(INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|TRUNCATE|VACUUM|COPY|GRANT|REVOKE|ATTACH|DETACH|PRAGMA)\b/i

export const quoteIdent = (dialect: "pgsql" | "sqlite", name: string): string => {
  const q = name.replaceAll("\"", "\"\"")
  if (dialect === "pgsql" && name === "public") return name
  return `"${q}"`
}

export const quoteLiteral = (value: unknown): string => {
  if (value === null || value === undefined) return "NULL"
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE"
  if (value instanceof Uint8Array) return `'\\x${Array.from(value, (b) => b.toString(16).padStart(2, "0")).join("")}'`
  const s = String(value).replaceAll("'", "''")
  return `'${s}'`
}

export const qualifyTable = (dialect: "pgsql" | "sqlite", schema: string, table: string): string => {
  if (dialect === "sqlite" || schema === "main" || schema === "public") {
    return quoteIdent(dialect, table)
  }
  return `${quoteIdent(dialect, schema)}.${quoteIdent(dialect, table)}`
}

export const isDestructiveSql = (sql: string): boolean => {
  const statements = splitStatements(stripSqlComments(sql))
  return statements.some((s) => {
    if (/^(DROP|TRUNCATE|ALTER)\b/i.test(s)) return true
    if (/^DELETE\b/i.test(s) && !/\bWHERE\b/i.test(s)) return true
    return false
  })
}

export const isWriteSql = (sql: string): boolean =>
  splitStatements(stripSqlComments(sql)).some((s) => {
    if (/^PRAGMA\b/i.test(s)) return /=/.test(s)
    if (WRITE_HEAD.test(s)) return true
    if (/^WITH\b/i.test(s) && /\b(INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP)\b/i.test(s)) return true
    return false
  })

export const splitStatements = (sql: string): Array<string> =>
  sql
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)

/** Wrap a single SELECT with LIMIT. Multi-statement scripts are left unchanged. */
export const applyMaxRows = (sql: string, maxRows: number): string => {
  const stmts = splitStatements(sql)
  if (stmts.length !== 1) return sql
  const stmt = stmts[0]
  if (!stmt || !/^\s*select\b/i.test(stmt)) return sql
  if (/\blimit\s+\d+/i.test(stmt)) return sql
  return `${stmt}\nLIMIT ${maxRows}`
}

export const emptyQueryResult = (durationMs = 0): QueryResult => ({
  columns: [],
  rows: [],
  rowCount: 0,
  durationMs
})

/** Run each statement in order and return the last result. */
export const runStatements = <E, R>(
  sql: string,
  runOne: (stmt: string) => Effect.Effect<QueryResult, E, R>
): Effect.Effect<QueryResult, E, R> =>
  Effect.gen(function* () {
    const stmts = splitStatements(sql)
    const started = Date.now()
    if (stmts.length === 0) return emptyQueryResult(0)
    let last = emptyQueryResult(0)
    for (const stmt of stmts) {
      last = yield* runOne(stmt)
    }
    return { ...last, durationMs: Date.now() - started }
  })

export const lastKeywordContext = (sql: string): { kind: "table" | "column" | "any"; prefix: string } => {
  const before = sql.slice(0, sql.length)
  const match = before.match(/([A-Za-z0-9_]*)$/)
  const prefix = match?.[1] ?? ""
  const head = before.slice(0, before.length - prefix.length).trim().toUpperCase()
  if (/\b(FROM|JOIN|UPDATE|INTO|TABLE)\s*$/.test(head)) return { kind: "table", prefix }
  if (/\.\s*$/.test(head) || /\b(SELECT|WHERE|SET|ON|AND|OR|BY|HAVING)\s*$/.test(head)) {
    return { kind: "column", prefix }
  }
  return { kind: "any", prefix }
}

export const keywordsFor = (dialect: "pgsql" | "sqlite"): Array<string> =>
  dialect === "pgsql" ? [...PG_KEYWORDS] : [...SQLITE_KEYWORDS]

export const typesFor = (dialect: "pgsql" | "sqlite"): Array<string> =>
  dialect === "pgsql" ? [...PG_TYPES] : [...SQLITE_TYPES]

export const functionsFor = (dialect: "pgsql" | "sqlite"): Array<string> =>
  dialect === "pgsql" ? [...PG_FUNCTIONS] : [...SQLITE_FUNCTIONS]
