import { FetchHttpClient } from "@effect/platform"
import { ConnectionHub } from "@workbench/shared"
import { Atom } from "@effect-atom/atom-react"
import { Effect, Layer, ManagedRuntime } from "effect"
import { ConnectionHubLive } from "./engines/hub.ts"
import { SyncController, SyncControllerLive } from "./sync/sync-service.ts"

const ServicesLive = Layer.mergeAll(ConnectionHubLive, FetchHttpClient.layer)

export const WorkbenchLive = Layer.mergeAll(
  ServicesLive,
  SyncControllerLive.pipe(Layer.provide(ServicesLive))
)

export const workbenchRuntime = ManagedRuntime.make(WorkbenchLive)
export const atomRuntime = Atom.runtime(WorkbenchLive)

export { ConnectionHub, SyncController }

export const runFork = <A, E, R = ConnectionHub | SyncController>(effect: Effect.Effect<A, E, R>) =>
  workbenchRuntime.runFork(effect as Effect.Effect<A, E>)
