import { FileSystem, HttpMiddleware, HttpServerRequest, HttpServerResponse, Path } from "@effect/platform"
import { Effect } from "effect"

const mimeFromPath = (file: string): string => {
  const lower = file.replaceAll("\\", "/").toLowerCase()
  if (lower.endsWith(".html")) return "text/html; charset=utf-8"
  if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "text/javascript; charset=utf-8"
  if (lower.endsWith(".css")) return "text/css; charset=utf-8"
  if (lower.endsWith(".wasm")) return "application/wasm"
  if (lower.endsWith(".json") || lower.endsWith(".map")) return "application/json"
  if (lower.endsWith(".svg")) return "image/svg+xml"
  if (lower.endsWith(".woff2")) return "font/woff2"
  if (lower.endsWith(".ttf") || lower.endsWith(".otf")) return "font/ttf"
  if (lower.endsWith(".data")) return "application/octet-stream"
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
          // contentType must be set on the body options — setHeader alone is ignored for body type
          return withIsolation(
            HttpServerResponse.uint8Array(bytes, { contentType: mimeFromPath(file) }).pipe(
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
