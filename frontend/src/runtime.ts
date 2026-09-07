import { FetchHttpClient } from "@effect/platform"
import { ConnectionHub } from "@workbench/shared"
import { Effect, Layer, ManagedRuntime } from "effect"
import { WorkbenchClient, WorkbenchClientLive } from "./api/workbench-client.ts"
import { ConnectionHubLive } from "./engines/hub.ts"
import { SyncController, SyncControllerLive } from "./sync/sync-service.ts"

const ServicesLive = Layer.mergeAll(ConnectionHubLive, FetchHttpClient.layer, WorkbenchClientLive)

export const WorkbenchLive = Layer.mergeAll(
  ServicesLive,
  SyncControllerLive.pipe(Layer.provide(ServicesLive))
)

export const workbenchRuntime = ManagedRuntime.make(WorkbenchLive)

export { ConnectionHub, SyncController, WorkbenchClient }

export const runFork = <A, E, R = never>(effect: Effect.Effect<A, E, R>) =>
  workbenchRuntime.runFork(effect as Effect.Effect<A, E>)

export const runPromise = <A, E, R = never>(effect: Effect.Effect<A, E, R>) =>
  workbenchRuntime.runPromise(effect as Effect.Effect<A, E>)
