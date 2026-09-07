import { FetchHttpClient, HttpApiClient } from "@effect/platform"
import { WorkbenchApi } from "@workbench/shared"
import { Context, Effect, Layer } from "effect"

export type WorkbenchApiClient = Effect.Effect.Success<
  ReturnType<typeof HttpApiClient.make<typeof WorkbenchApi>>
>

export class WorkbenchClient extends Context.Tag("app/WorkbenchClient")<
  WorkbenchClient,
  WorkbenchApiClient
>() {}

export const WorkbenchClientLive = Layer.effect(
  WorkbenchClient,
  HttpApiClient.make(WorkbenchApi, { baseUrl: "" })
).pipe(Layer.provide(FetchHttpClient.layer))
