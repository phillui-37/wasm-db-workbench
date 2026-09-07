import { HttpApiBuilder, HttpApiSwagger, HttpMiddleware, HttpServer } from "@effect/platform"
import { NodeContext, NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { Config, Effect, Layer } from "effect"
import { createServer } from "node:http"
import { ApiLive } from "./http/api-live.ts"
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
    return HttpApiBuilder.serve((app) => spaMiddleware(dist)(HttpMiddleware.logger(app))).pipe(
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
