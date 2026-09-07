import { FetchHttpClient, HttpApiClient } from "@effect/platform"
import { WorkbenchApi } from "@workbench/shared"
import { Effect } from "effect"
import { workbenchRuntime } from "./runtime.ts"

export const withClient = <A, E>(
  run: (client: Effect.Effect.Success<ReturnType<typeof HttpApiClient.make<typeof WorkbenchApi>>>) => Effect.Effect<A, E>
) =>
  Effect.gen(function* () {
    const client = yield* HttpApiClient.make(WorkbenchApi, { baseUrl: "" })
    return yield* run(client)
  }).pipe(Effect.provide(FetchHttpClient.layer))

export const runClient = <A, E>(effect: Effect.Effect<A, E>) => workbenchRuntime.runPromise(effect as Effect.Effect<A, E>)
