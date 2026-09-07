import { describe, expect, it } from "@effect/vitest"
import {
  applyMaxRows,
  isDestructiveSql,
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

  it.effect("applies LIMIT only to a single SELECT", () =>
    Effect.sync(() => {
      expect(applyMaxRows("SELECT * FROM t", 50)).toBe("SELECT * FROM t\nLIMIT 50")
      expect(applyMaxRows("SELECT * FROM t LIMIT 3", 50)).toBe("SELECT * FROM t LIMIT 3")
      expect(applyMaxRows("CREATE TABLE t (id int);\nSELECT * FROM t", 50)).toBe(
        "CREATE TABLE t (id int);\nSELECT * FROM t"
      )
      expect(applyMaxRows("INSERT INTO t VALUES (1)", 50)).toBe("INSERT INTO t VALUES (1)")
    })
  )

  it.effect("splits and runs statements, returning the last result", () =>
    Effect.gen(function* () {
      expect(splitStatements("SELECT 1; INSERT INTO t VALUES (1);")).toEqual([
        "SELECT 1",
        "INSERT INTO t VALUES (1)"
      ])
      const result = yield* runStatements("CREATE TABLE t (id int); SELECT 2", (stmt) =>
        Effect.succeed({
          columns: stmt.startsWith("SELECT") ? ["n"] : [],
          rows: stmt.startsWith("SELECT") ? [[2]] : [],
          rowCount: stmt.startsWith("SELECT") ? 1 : 0,
          durationMs: 1
        })
      )
      expect(result.columns).toEqual(["n"])
      expect(result.rows).toEqual([[2]])
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
