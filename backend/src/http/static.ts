import { FileSystem, HttpMiddleware, HttpServerRequest, HttpServerResponse, Path } from "@effect/platform"
import { Effect } from "effect"

const mime = (file: string): string => {
  if (file.endsWith(".html")) return "text/html; charset=utf-8"
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8"
  if (file.endsWith(".css")) return "text/css; charset=utf-8"
  if (file.endsWith(".wasm")) return "application/wasm"
  if (file.endsWith(".json")) return "application/json"
  if (file.endsWith(".svg")) return "image/svg+xml"
  if (file.endsWith(".woff2")) return "font/woff2"
  if (file.endsWith(".map")) return "application/json"
  return "application/octet-stream"
}

const withIsolation = (res: HttpServerResponse.HttpServerResponse) =>
  res.pipe(
    HttpServerResponse.setHeader("Cross-Origin-Opener-Policy", "same-origin"),
    HttpServerResponse.setHeader("Cross-Origin-Embedder-Policy", "require-corp"),
    HttpServerResponse.setHeader("Cross-Origin-Resource-Policy", "same-origin")
  )

export const spaMiddleware = (distDir: string) =>
  HttpMiddleware.make((httpApp) =>
    Effect.gen(function* () {
      const req = yield* HttpServerRequest.HttpServerRequest
      const url = (req.url ?? "/").split("?")[0] ?? "/"
      if (url.startsWith("/api") || url.startsWith("/docs")) {
        return withIsolation(yield* httpApp)
      }
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const relative = url === "/" ? "/index.html" : url
      const candidate = path.resolve(distDir, `.${relative}`)
      const distRoot = path.resolve(distDir)
      const safe = candidate.startsWith(distRoot)
      const tryFile = (file: string) =>
        Effect.gen(function* () {
          const exists = yield* fs.exists(file)
          if (!exists) return undefined
          const bytes = yield* fs.readFile(file)
          const relativePath = path.relative(distRoot, file).replaceAll("\\", "/")
          const immutable = relativePath.startsWith("assets/")
          return withIsolation(
            HttpServerResponse.uint8Array(bytes).pipe(
              HttpServerResponse.setHeader("Content-Type", mime(file)),
              HttpServerResponse.setHeader(
                "Cache-Control",
                immutable ? "public, max-age=31536000, immutable" : "no-cache"
              )
            )
          )
        })
      if (safe) {
        const hit = yield* tryFile(candidate)
        if (hit) return hit
      }
      const index = yield* tryFile(path.join(distRoot, "index.html"))
      if (index) return index
      return withIsolation(yield* httpApp)
    })
  )
