import { Effect } from "effect"
import { PG_FUNCTIONS, PG_KEYWORDS, PG_TYPES, SQLITE_FUNCTIONS, SQLITE_KEYWORDS, SQLITE_TYPES } from "./dialects.ts"
import type { QueryResult, ScriptResult, StatementResult } from "./schema/models.ts"

const WRITE_HEAD =
  /^(INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|TRUNCATE|VACUUM|COPY|GRANT|REVOKE|ATTACH|DETACH|PRAGMA)\b/i

const DDL_HEAD = /^(CREATE|ALTER|DROP|TRUNCATE|ATTACH|DETACH)\b/i

export const quoteIdent = (dialect: "pgsql" | "sqlite", name: string): string => {
  const q = name.replaceAll("\"", "\"\"")
  if (dialect === "pgsql" && name === "public") return name
  return `"${q}"`
}

export const quoteLiteral = (value: unknown): string => {
  if (value === null || value === undefined) return "NULL"
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE"
  if (value instanceof Uint8Array) {
    let hex = ""
    for (let i = 0; i < value.length; i++) hex += value[i]!.toString(16).padStart(2, "0")
    return `'\\x${hex}'`
  }
  const s = String(value).replaceAll("'", "''")
  return `'${s}'`
}

export const qualifyTable = (dialect: "pgsql" | "sqlite", schema: string, table: string): string => {
  if (dialect === "sqlite" || schema === "main" || schema === "public") {
    return quoteIdent(dialect, table)
  }
  return `${quoteIdent(dialect, schema)}.${quoteIdent(dialect, table)}`
}

/** First non-comment token of a statement (uppercase). */
export const leadingKeyword = (stmt: string): string => {
  let i = 0
  while (i < stmt.length) {
    const c = stmt[i]!
    const n = stmt[i + 1]
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++
      continue
    }
    if (c === "-" && n === "-") {
      i += 2
      while (i < stmt.length && stmt[i] !== "\n") i++
      continue
    }
    if (c === "/" && n === "*") {
      i += 2
      while (i < stmt.length - 1 && !(stmt[i] === "*" && stmt[i + 1] === "/")) i++
      i += 2
      continue
    }
    const m = stmt.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/)
    return m?.[0]?.toUpperCase() ?? ""
  }
  return ""
}

export const splitStatements = (sql: string): Array<string> => {
  const out: Array<string> = []
  const parts: Array<string> = []
  let i = 0
  let inSingle = false
  let inDouble = false
  let inLine = false
  let inBlock = false
  let dollar: string | undefined

  const push = () => {
    const stmt = parts.join("").trim()
    if (stmt) out.push(stmt)
    parts.length = 0
  }

  while (i < sql.length) {
    const c = sql[i]!
    const n = sql[i + 1]

    if (inLine) {
      parts.push(c)
      if (c === "\n") inLine = false
      i++
      continue
    }
    if (inBlock) {
      parts.push(c)
      if (c === "*" && n === "/") {
        parts.push(n!)
        i += 2
        inBlock = false
        continue
      }
      i++
      continue
    }
    if (dollar) {
      if (sql.startsWith(dollar, i)) {
        parts.push(dollar)
        i += dollar.length
        dollar = undefined
        continue
      }
      parts.push(c)
      i++
      continue
    }
    if (inSingle) {
      parts.push(c)
      if (c === "'" && n === "'") {
        parts.push(n!)
        i += 2
        continue
      }
      if (c === "'") inSingle = false
      i++
      continue
    }
    if (inDouble) {
      parts.push(c)
      if (c === "\"" && n === "\"") {
        parts.push(n!)
        i += 2
        continue
      }
      if (c === "\"") inDouble = false
      i++
      continue
    }

    if (c === "-" && n === "-") {
      inLine = true
      parts.push(c)
      i++
      continue
    }
    if (c === "/" && n === "*") {
      inBlock = true
      parts.push(c)
      i++
      continue
    }
    if (c === "'") {
      inSingle = true
      parts.push(c)
      i++
      continue
    }
    if (c === "\"") {
      inDouble = true
      parts.push(c)
      i++
      continue
    }
    if (c === "$") {
      const tag = sql.slice(i).match(/^\$[A-Za-z_]*\$/)
      if (tag) {
        dollar = tag[0]
        parts.push(tag[0])
        i += tag[0].length
        continue
      }
    }
    if (c === ";") {
      push()
      i++
      continue
    }
    parts.push(c)
    i++
  }
  push()
  return out
}

const statementIsDestructive = (s: string): boolean => {
  const head = leadingKeyword(s)
  if (head === "DROP" || head === "TRUNCATE" || head === "ALTER") return true
  if (head === "DELETE") {
    let hasWhere = false
    scanOutsideStrings(s, (source, i) => {
      if (hasWhere) return
      if (/^WHERE\b/i.test(source.slice(i))) hasWhere = true
    })
    return !hasWhere
  }
  return false
}

const statementIsWrite = (s: string): boolean => {
  const head = leadingKeyword(s)
  if (head === "PRAGMA") return /=/.test(s)
  if (WRITE_HEAD.test(head)) return true
  if (head === "WITH") {
    let isWrite = false
    scanOutsideStrings(s, (source, i) => {
      if (isWrite) return
      if (/^(INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP)\b/i.test(source.slice(i))) isWrite = true
    })
    return isWrite
  }
  return false
}

const statementIsDdl = (s: string): boolean => {
  const head = leadingKeyword(s)
  if (DDL_HEAD.test(head)) return true
  if (head === "WITH") {
    let isDdl = false
    scanOutsideStrings(s, (source, i) => {
      if (isDdl) return
      if (/^(CREATE|ALTER|DROP)\b/i.test(source.slice(i))) isDdl = true
    })
    return isDdl
  }
  return false
}

export const isDestructiveSql = (sql: string): boolean => splitStatements(sql).some(statementIsDestructive)

export const isWriteSql = (sql: string): boolean => splitStatements(sql).some(statementIsWrite)

export const isDdlSql = (sql: string): boolean => splitStatements(sql).some(statementIsDdl)

/** True when stmt is a row-returning query that should receive maxRows LIMIT. */
const isSelectable = (stmt: string): boolean => {
  const head = leadingKeyword(stmt)
  if (head === "SELECT" || head === "TABLE" || head === "VALUES") return true
  if (head === "WITH") {
    let hasWrite = false
    scanOutsideStrings(stmt, (source, i) => {
      if (hasWrite) return
      if (/^(INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP)\b/i.test(source.slice(i))) hasWrite = true
    })
    return !hasWrite
  }
  return false
}

/** Top-level LIMIT / FETCH FIRST (paren depth 0, outside strings). */
const hasTopLevelLimit = (stmt: string): boolean => {
  let depth = 0
  let found = false
  scanOutsideStrings(stmt, (source, i) => {
    if (found) return
    const c = source[i]!
    if (c === "(") {
      depth++
      return
    }
    if (c === ")") {
      depth = Math.max(0, depth - 1)
      return
    }
    if (depth !== 0) return
    if (/^LIMIT\b/i.test(source.slice(i)) || /^FETCH\s+FIRST\b/i.test(source.slice(i))) found = true
  })
  return found
}

const limitOne = (stmt: string, maxRows: number): string => {
  if (!isSelectable(stmt)) return stmt
  if (hasTopLevelLimit(stmt)) return stmt
  return `${stmt}\nLIMIT ${maxRows}`
}

export const applyMaxRows = (sql: string, maxRows: number, statements?: Array<string>): string => {
  const stmts = statements ?? splitStatements(sql)
  if (stmts.length === 0) return sql
  return stmts.map((s) => limitOne(s, maxRows)).join(";\n")
}

export const emptyQueryResult = (durationMs = 0): QueryResult => ({
  columns: [],
  rows: [],
  rowCount: 0,
  durationMs
})

export const lastResult = (script: ScriptResult): QueryResult => {
  const last = script.statements[script.statements.length - 1]
  return last ?? emptyQueryResult(script.durationMs)
}

export const runStatements = <E, R>(
  sql: string,
  runOne: (stmt: string) => Effect.Effect<QueryResult, E, R>,
  statements?: Array<string>
): Effect.Effect<ScriptResult, E, R> =>
  Effect.gen(function* () {
    const stmts = statements ?? splitStatements(sql)
    const started = Date.now()
    if (stmts.length === 0) {
      return { statements: [], durationMs: 0 }
    }
    const out: Array<StatementResult> = []
    for (const stmt of stmts) {
      const result = yield* runOne(stmt)
      out.push({ ...result, sql: stmt })
    }
    return { statements: out, durationMs: Date.now() - started }
  })

export type SqlPlaceholders =
  | { kind: "none" }
  | { kind: "named"; names: Array<string> }
  | { kind: "positional"; count: number }

export type SqlAnalysis = {
  statements: Array<string>
  isWrite: boolean
  isDestructive: boolean
  isDdl: boolean
  placeholders: SqlPlaceholders
}

const scanOutsideStrings = (sql: string, onPlain: (slice: string, index: number) => void) => {
  let i = 0
  let inSingle = false
  let inDouble = false
  let inLine = false
  let inBlock = false
  let dollar: string | undefined
  while (i < sql.length) {
    const c = sql[i]!
    const n = sql[i + 1]
    if (inLine) {
      if (c === "\n") inLine = false
      i++
      continue
    }
    if (inBlock) {
      if (c === "*" && n === "/") {
        i += 2
        inBlock = false
        continue
      }
      i++
      continue
    }
    if (dollar) {
      if (sql.startsWith(dollar, i)) {
        i += dollar.length
        dollar = undefined
        continue
      }
      i++
      continue
    }
    if (inSingle) {
      if (c === "'" && n === "'") {
        i += 2
        continue
      }
      if (c === "'") inSingle = false
      i++
      continue
    }
    if (inDouble) {
      if (c === "\"" && n === "\"") {
        i += 2
        continue
      }
      if (c === "\"") inDouble = false
      i++
      continue
    }
    if (c === "-" && n === "-") {
      inLine = true
      i++
      continue
    }
    if (c === "/" && n === "*") {
      inBlock = true
      i++
      continue
    }
    if (c === "'") {
      inSingle = true
      i++
      continue
    }
    if (c === "\"") {
      inDouble = true
      i++
      continue
    }
    if (c === "$") {
      const tag = sql.slice(i).match(/^\$[A-Za-z_]*\$/)
      if (tag) {
        dollar = tag[0]
        i += tag[0].length
        continue
      }
    }
    onPlain(sql, i)
    i++
  }
}

export const detectPlaceholders = (sql: string): SqlPlaceholders => {
  const namedSet = new Set<string>()
  const named: Array<string> = []
  let maxPos = 0
  scanOutsideStrings(sql, (source, i) => {
    const c = source[i]
    const prev = source[i - 1]
    if (c === ":" && prev !== ":" && source[i + 1] !== ":") {
      const m = source.slice(i + 1).match(/^[A-Za-z_][A-Za-z0-9_]*/)
      if (m?.[0] && !namedSet.has(m[0])) {
        namedSet.add(m[0])
        named.push(m[0])
      }
    }
    if (c === "$") {
      const m = source.slice(i + 1).match(/^[1-9][0-9]*/)
      if (m) maxPos = Math.max(maxPos, Number(m[0]))
    }
  })
  if (named.length > 0) return { kind: "named", names: named }
  if (maxPos > 0) return { kind: "positional", count: maxPos }
  return { kind: "none" }
}

export const analyzeSql = (sql: string): SqlAnalysis => {
  const statements = splitStatements(sql)
  return {
    statements,
    isWrite: statements.some(statementIsWrite),
    isDestructive: statements.some(statementIsDestructive),
    isDdl: statements.some(statementIsDdl),
    placeholders: detectPlaceholders(sql)
  }
}

export const applyParams = (
  dialect: "pgsql" | "sqlite",
  sql: string,
  values: Record<string, unknown>,
  detected?: SqlPlaceholders
): { sql: string; bind: Array<unknown> | Record<string, unknown> } => {
  const placeholders = detected ?? detectPlaceholders(sql)
  if (placeholders.kind === "positional") {
    const bind = Array.from(
      { length: placeholders.count },
      (_, i) => values[String(i + 1)] ?? values[`$${i + 1}`] ?? null
    )
    return { sql, bind }
  }
  if (placeholders.kind === "named") {
    if (dialect === "sqlite") {
      const bind: Record<string, unknown> = {}
      for (const name of placeholders.names) bind[`:${name}`] = values[name] ?? null
      return { sql, bind }
    }
    const nameToIndex = new Map(placeholders.names.map((name, i) => [name, i + 1] as const))
    const bind = placeholders.names.map((name) => values[name] ?? null)
    const parts: Array<string> = []
    let last = 0
    scanOutsideStrings(sql, (source, i) => {
      const c = source[i]
      const prev = source[i - 1]
      if (c === ":" && prev !== ":" && source[i + 1] !== ":") {
        const m = source.slice(i + 1).match(/^[A-Za-z_][A-Za-z0-9_]*/)
        if (m?.[0] && nameToIndex.has(m[0])) {
          parts.push(sql.slice(last, i))
          parts.push(`$${nameToIndex.get(m[0])}`)
          last = i + 1 + m[0].length
        }
      }
    })
    parts.push(sql.slice(last))
    return { sql: parts.join(""), bind }
  }
  return { sql, bind: [] }
}

export const lastKeywordContext = (sql: string): { kind: "table" | "column" | "any"; prefix: string } => {
  const match = sql.match(/([A-Za-z0-9_]*)$/)
  const prefix = match?.[1] ?? ""
  const head = sql.slice(0, sql.length - prefix.length).trim().toUpperCase()
  if (/\b(FROM|JOIN|UPDATE|INTO|TABLE)\s*$/.test(head)) return { kind: "table", prefix }
  if (/\.\s*$/.test(head) || /\b(SELECT|WHERE|SET|ON|AND|OR|BY|HAVING)\s*$/.test(head)) {
    return { kind: "column", prefix }
  }
  return { kind: "any", prefix }
}

export const keywordsFor = (dialect: "pgsql" | "sqlite"): ReadonlyArray<string> =>
  dialect === "pgsql" ? PG_KEYWORDS : SQLITE_KEYWORDS

export const typesFor = (dialect: "pgsql" | "sqlite"): ReadonlyArray<string> =>
  dialect === "pgsql" ? PG_TYPES : SQLITE_TYPES

export const functionsFor = (dialect: "pgsql" | "sqlite"): ReadonlyArray<string> =>
  dialect === "pgsql" ? PG_FUNCTIONS : SQLITE_FUNCTIONS
