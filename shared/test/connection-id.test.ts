import { describe, expect, it } from "@effect/vitest"
import { connectionSlug, findExistingConnection, isHostDumpFile, isHostPayloadFile, workspaceId } from "@workbench/shared"
import { Effect } from "effect"

describe("connection ids", () => {
  it.effect("builds a stable slug without a session suffix", () =>
    Effect.sync(() => {
      expect(connectionSlug("local")).toBe("local")
      expect(connectionSlug("My DB")).toBe("My_DB")
      expect(connectionSlug("  ")).toBe("db")
    })
  )

  it.effect("reuses a host connection by name or id", () =>
    Effect.sync(() => {
      const list = [
        { id: "local_maap", name: "local", engine: "pglite" as const },
        { id: "sqlite_local_ii01", name: "sqlite_local", engine: "sqlite" as const }
      ]
      expect(findExistingConnection(list, "local")?.id).toBe("local_maap")
      expect(findExistingConnection(list, "sqlite_local")?.id).toBe("sqlite_local_ii01")
      expect(findExistingConnection(list, "missing")).toBeUndefined()
    })
  )

  it.effect("maps session-suffixed ids onto the shared workspace", () =>
    Effect.sync(() => {
      expect(workspaceId("local_maap")).toBe("local")
      expect(workspaceId("sqlite_local_ii01")).toBe("sqlite_local")
      expect(workspaceId("local_maap", "local")).toBe("local")
      expect(workspaceId("local_maap", "local_maap")).toBe("local")
      expect(workspaceId("sqlite_local_ii01", "sqlite_local")).toBe("sqlite_local")
    })
  )

  it.effect("recognizes host dump artifacts", () =>
    Effect.sync(() => {
      expect(isHostDumpFile("dump.sql")).toBe(true)
      expect(isHostDumpFile("meta.json")).toBe(true)
      expect(isHostDumpFile("history.json")).toBe(false)
      expect(isHostPayloadFile("dump.sql")).toBe(true)
      expect(isHostPayloadFile("meta.json")).toBe(false)
    })
  )
})
