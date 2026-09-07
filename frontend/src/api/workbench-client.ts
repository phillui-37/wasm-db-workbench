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

/** Vite `base` ends with `/`; API client wants no trailing slash (or ""). */
const apiBaseUrl = (() => {
  const base = import.meta.env.BASE_URL || "/"
  if (base === "/") return ""
  return base.replace(/\/+$/, "")
})()

const CredentialFetchLive = Layer.succeed(FetchHttpClient.RequestInit, {
  credentials: "include"
})

export const WorkbenchClientLive = Layer.effect(
  WorkbenchClient,
  HttpApiClient.make(WorkbenchApi, { baseUrl: apiBaseUrl })
).pipe(Layer.provide(FetchHttpClient.layer), Layer.provide(CredentialFetchLive))
