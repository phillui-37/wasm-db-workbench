import { FetchHttpClient, HttpApiClient } from "@effect/platform"
import { WorkbenchApi } from "@workbench/shared"
import { Atom, Result, useAtomValue } from "@effect-atom/atom-react"
import { Effect } from "effect"
import { atomRuntime } from "./runtime.ts"

const healthAtom = atomRuntime.atom(
  Effect.gen(function* () {
    const client = yield* HttpApiClient.make(WorkbenchApi, { baseUrl: "" })
    return yield* client.health.check()
  }).pipe(Effect.provide(FetchHttpClient.layer))
)

export const HealthBadge = () => {
  const health = useAtomValue(healthAtom)
  if (Result.isSuccess(health)) return <span className="ok">API {health.value.status}</span>
  if (Result.isFailure(health)) return <span className="err">API down</span>
  return <span className="muted">API…</span>
}

export { Atom, healthAtom }
