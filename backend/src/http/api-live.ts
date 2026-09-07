import { HttpApiBuilder } from "@effect/platform"
import { AuthFailedError, UnauthorizedError, WorkbenchApi } from "@workbench/shared"
import { Effect, Layer } from "effect"
import { ConfigService } from "../config-service.ts"
import { HistoryStore } from "../history-store.ts"
import { ScriptStore } from "../script-store.ts"
import { SyncStore } from "../sync-store.ts"

const HealthLive = HttpApiBuilder.group(WorkbenchApi, "health", (handlers) =>
  handlers.handle("check", () => Effect.succeed({ status: "ok" as const }))
)

/** Auth routes are handled by authMiddleware (cookies). These handlers satisfy the Layer. */
const AuthLive = HttpApiBuilder.group(WorkbenchApi, "auth", (handlers) =>
  handlers
    .handle("login", () =>
      Effect.fail(new AuthFailedError({ message: "Use auth middleware login" }))
    )
    .handle("logout", () => Effect.succeed({ ok: true as const }))
    .handle("me", () => Effect.fail(new UnauthorizedError({ message: "Not authenticated" })))
)

const ConfigLive = HttpApiBuilder.group(WorkbenchApi, "config", (handlers) =>
  Effect.gen(function* () {
    const config = yield* ConfigService
    return handlers
      .handle("get", () => config.get)
      .handle("put", ({ payload }) => config.set(payload))
  })
)

const ScriptsLive = HttpApiBuilder.group(WorkbenchApi, "scripts", (handlers) =>
  Effect.gen(function* () {
    const scripts = yield* ScriptStore
    return handlers
      .handle("list", ({ path }) => scripts.list(path.connectionId))
      .handle("put", ({ path, payload }) =>
        scripts.put(path.connectionId, path.name, payload.sql, payload.pinned)
      )
      .handle("remove", ({ path }) => scripts.remove(path.connectionId, path.name))
  })
)

const HistoryLive = HttpApiBuilder.group(WorkbenchApi, "history", (handlers) =>
  Effect.gen(function* () {
    const history = yield* HistoryStore
    return handlers
      .handle("list", ({ path }) => history.list(path.connectionId))
      .handle("append", ({ path, payload }) => history.append(path.connectionId, payload))
  })
)

const SyncLive = HttpApiBuilder.group(WorkbenchApi, "sync", (handlers) =>
  Effect.gen(function* () {
    const sync = yield* SyncStore
    return handlers
      .handle("push", ({ path, payload }) => sync.push(path.connectionId, payload))
      .handle("pull", ({ path }) => sync.pull(path.connectionId))
      .handle("files", ({ path }) => sync.files(path.connectionId))
  })
)

export const ApiLive = HttpApiBuilder.api(WorkbenchApi).pipe(
  Layer.provide(HealthLive),
  Layer.provide(AuthLive),
  Layer.provide(ConfigLive),
  Layer.provide(ScriptsLive),
  Layer.provide(HistoryLive),
  Layer.provide(SyncLive)
)
