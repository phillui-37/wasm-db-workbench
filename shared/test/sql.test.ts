import { describe, expect, it } from "@effect/vitest"
import {
  analyzeSql,
  applyMaxRows,
  applyParams,
  detectPlaceholders,
  isDestructiveSql,
  isDdlSql,
  isWriteSql,
  lastKeywordContext,
  quoteLiteral,
  runStatements,
  splitStatements
} from "@workbench/shared"
import { Effect } from "effect"

describe("sql helpers", () => {
  it.effect("detects destructive statements", () =>
    Effect.sync(() => {
      expect(isDestructiveSql("DROP TABLE t")).toBe(true)
      expect(isDestructiveSql("DELETE FROM t")).toBe(true)
      expect(isDestructiveSql("DELETE FROM t WHERE id = 1")).toBe(false)
      expect(isDestructiveSql("SELECT 1")).toBe(false)
      expect(isDestructiveSql("-- note\nDROP TABLE t")).toBe(true)
    })
  )

  it.effect("detects writes including later statements", () =>
    Effect.sync(() => {
      expect(isWriteSql("SELECT 1")).toBe(false)
      expect(isWriteSql("CREATE TABLE t (id int);\nSELECT * FROM t")).toBe(true)
      expect(isWriteSql("INSERT INTO t VALUES (1)")).toBe(true)
      expect(isWriteSql("WITH x AS (SELECT 1) INSERT INTO t SELECT * FROM x")).toBe(true)
      expect(isWriteSql("PRAGMA table_info(t)")).toBe(false)
      expect(isWriteSql("PRAGMA journal_mode=WAL")).toBe(true)
    })
  )

  it.effect("detects DDL separately from DML writes", () =>
    Effect.sync(() => {
      expect(isDdlSql("INSERT INTO t VALUES (1)")).toBe(false)
      expect(isDdlSql("CREATE TABLE t (id int)")).toBe(true)
      expect(isDdlSql("ALTER TABLE t ADD COLUMN x int")).toBe(true)
      expect(isDdlSql("-- c\nDROP TABLE t")).toBe(true)
    })
  )

  it.effect("does not split on semicolons inside strings or comments", () =>
    Effect.sync(() => {
      expect(splitStatements("SELECT 'a;b' AS x; SELECT 2")).toEqual(["SELECT 'a;b' AS x", "SELECT 2"])
      expect(splitStatements("SELECT 1; -- trailing; still comment\nSELECT 2")).toEqual([
        "SELECT 1",
        "-- trailing; still comment\nSELECT 2"
      ])
      expect(splitStatements("SELECT $tag$ a;b $tag$; SELECT 2")).toEqual([
        "SELECT $tag$ a;b $tag$",
        "SELECT 2"
      ])
    })
  )

  it.effect("applies LIMIT to each SELECT", () =>
    Effect.sync(() => {
      expect(applyMaxRows("SELECT * FROM t", 50)).toBe("SELECT * FROM t\nLIMIT 50")
      expect(applyMaxRows("SELECT * FROM t LIMIT 3", 50)).toBe("SELECT * FROM t LIMIT 3")
      expect(applyMaxRows("CREATE TABLE t (id int);\nSELECT * FROM t", 50)).toBe(
        "CREATE TABLE t (id int);\nSELECT * FROM t\nLIMIT 50"
      )
      expect(applyMaxRows("INSERT INTO t VALUES (1)", 50)).toBe("INSERT INTO t VALUES (1)")
      expect(applyMaxRows("WITH x AS (SELECT 1) SELECT * FROM x", 50)).toBe(
        "WITH x AS (SELECT 1) SELECT * FROM x\nLIMIT 50"
      )
      expect(applyMaxRows("SELECT * FROM (SELECT 1 LIMIT 1) t", 50)).toBe(
        "SELECT * FROM (SELECT 1 LIMIT 1) t\nLIMIT 50"
      )
      expect(applyMaxRows("-- note\nSELECT * FROM t", 50)).toBe("-- note\nSELECT * FROM t\nLIMIT 50")
      expect(applyMaxRows("SELECT ' LIMIT 1 ' AS x", 50)).toBe("SELECT ' LIMIT 1 ' AS x\nLIMIT 50")
    })
  )

  it.effect("runs statements and keeps every result", () =>
    Effect.gen(function* () {
      const result = yield* runStatements("SELECT 1; SELECT 2", (stmt) =>
        Effect.succeed({
          columns: ["n"],
          rows: [[stmt.endsWith("2") ? 2 : 1]],
          rowCount: 1,
          durationMs: 1
        })
      )
      expect(result.statements).toHaveLength(2)
      expect(result.statements[1]?.rows).toEqual([[2]])
    })
  )

  it.effect("detects named and positional placeholders", () =>
    Effect.sync(() => {
      expect(detectPlaceholders("SELECT :id, :name")).toEqual({ kind: "named", names: ["id", "name"] })
      expect(detectPlaceholders("SELECT $1, $2")).toEqual({ kind: "positional", count: 2 })
      expect(detectPlaceholders("SELECT 1")).toEqual({ kind: "none" })
      expect(detectPlaceholders("SELECT ' :id '")).toEqual({ kind: "none" })
    })
  )

  it.effect("rewrites named params for postgres outside strings", () =>
    Effect.sync(() => {
      const { sql, bind } = applyParams("pgsql", "SELECT :id, :name", { id: 3, name: "a" })
      expect(sql).toBe("SELECT $1, $2")
      expect(bind).toEqual([3, "a"])
      const kept = applyParams("pgsql", "SELECT ':id' AS x, :id", { id: 9 })
      expect(kept.sql).toBe("SELECT ':id' AS x, $1")
      expect(kept.bind).toEqual([9])
    })
  )

  it.effect("analyzeSql returns one pass flags", () =>
    Effect.sync(() => {
      const a = analyzeSql("CREATE TABLE t (id int); SELECT :id")
      expect(a.statements).toHaveLength(2)
      expect(a.isWrite).toBe(true)
      expect(a.isDdl).toBe(true)
      expect(a.isDestructive).toBe(false)
      expect(a.placeholders).toEqual({ kind: "named", names: ["id"] })
    })
  )

  it.effect("quotes literals", () =>
    Effect.sync(() => {
      expect(quoteLiteral(null)).toBe("NULL")
      expect(quoteLiteral("O'Brien")).toBe("'O''Brien'")
      expect(quoteLiteral(3)).toBe("3")
    })
  )

  it.effect("classifies completion context", () =>
    Effect.sync(() => {
      expect(lastKeywordContext("SELECT * FROM it").kind).toBe("table")
      expect(lastKeywordContext("SELECT ").kind).toBe("column")
    })
  )
})
