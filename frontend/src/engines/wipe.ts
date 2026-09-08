import type { EngineType } from "@workbench/shared"
import { Effect } from "effect"
import { wipeSqliteLocal } from "./sqlite-engine.ts"

const deleteIdb = (name: string) =>
  new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(name)
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })

export const wipeLocalEngine = (id: string, engine: EngineType) =>
  Effect.promise(async () => {
    if (engine === "sqlite") {
      await wipeSqliteLocal(id)
      return
    }
    await Promise.all([deleteIdb(`workbench-${id}`), deleteIdb(`/pglite/workbench-${id}`)])
  })
