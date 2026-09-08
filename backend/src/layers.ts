import { NodeContext } from "@effect/platform-node"
import { Layer } from "effect"
import { ConfigServiceLive } from "./config-service.ts"
import { ConnectionStoreLive } from "./connection-store.ts"
import { HistoryStoreLive } from "./history-store.ts"
import { ScriptStoreLive } from "./script-store.ts"
import { SyncStoreLive } from "./sync-store.ts"

export const StoresLive = Layer.mergeAll(
  ConnectionStoreLive,
  ScriptStoreLive,
  HistoryStoreLive,
  SyncStoreLive
).pipe(
  Layer.provideMerge(ConfigServiceLive),
  Layer.provide(NodeContext.layer)
)
