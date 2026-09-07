import { HttpApiBuilder, HttpApiSwagger, HttpMiddleware, HttpServer } from "@effect/platform"
import { NodeContext, NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { Config, Effect, Layer, Option } from "effect"
import { createServer } from "node:http"
import { ApiLive } from "./http/api-live.ts"
import { authMiddleware, loadAuthEnv } from "./http/auth.ts"
import { basePathMiddleware, normalizeBasePath } from "./http/base-path.ts"
import { spaMiddleware } from "./http/static.ts"
import { StoresLive } from "./layers.ts"
import { repoRoot } from "./root.ts"

const ApiWithStores = ApiLive.pipe(Layer.provide(StoresLive))

const HttpLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const port = yield* Config.integer("APP_PORT").pipe(Config.withDefault(8080))
    const dist = yield* Config.string("FRONTEND_DIST").pipe(
      Config.withDefault(`${repoRoot}/frontend/dist`)
    )
    const basePath = normalizeBasePath(
      yield* Config.string("BASE_PATH").pipe(Config.withDefault("/wasm-db-workbench"))
    )
    const authEnabled = yield* Config.boolean("AUTH_ENABLED").pipe(Config.withDefault(false))
    const authUsername = yield* Config.option(Config.string("AUTH_USERNAME"))
    const authPassword = yield* Config.option(Config.string("AUTH_PASSWORD"))
    const authSecret = yield* Config.option(Config.string("AUTH_SECRET"))
    const cookieSecure = yield* Config.boolean("AUTH_COOKIE_SECURE").pipe(Config.withDefault(false))
    const auth = loadAuthEnv({
      enabled: authEnabled,
      username: Option.getOrUndefined(authUsername),
      password: Option.getOrUndefined(authPassword),
      secret: Option.getOrUndefined(authSecret),
      basePath,
      cookieSecure
    })

    return HttpApiBuilder.serve((app) =>
      basePathMiddleware(basePath)(
        authMiddleware(auth)(spaMiddleware(dist)(HttpMiddleware.logger(app)))
      )
    ).pipe(
      Layer.provide(HttpApiSwagger.layer({ path: "/docs" })),
      Layer.provide(HttpApiBuilder.middlewareCors()),
      Layer.provide(ApiWithStores),
      HttpServer.withLogAddress,
      Layer.provide(NodeHttpServer.layer(createServer, { port })),
      Layer.provide(NodeContext.layer)
    )
  })
)

Layer.launch(HttpLive).pipe(NodeRuntime.runMain)
