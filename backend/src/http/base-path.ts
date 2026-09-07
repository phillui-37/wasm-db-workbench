import { HttpMiddleware, HttpServerRequest } from "@effect/platform"
import { Effect } from "effect"

/** Normalize to `/wasm-db-workbench` or empty string (no trailing slash). */
export const normalizeBasePath = (raw: string | undefined): string => {
  const trimmed = (raw ?? "").trim()
  if (!trimmed || trimmed === "/") return ""
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`
  return withSlash.replace(/\/+$/, "")
}

const stripPrefix = (url: string, basePath: string): string => {
  if (!basePath) return url
  if (url === basePath) return "/"
  if (url.startsWith(`${basePath}/`)) return url.slice(basePath.length) || "/"
  if (url.startsWith(`${basePath}?`)) return `/${url.slice(basePath.length)}`
  return url
}

/** When BASE_PATH is set, strip it so API/static handlers see root-relative paths. */
export const basePathMiddleware = (basePath: string) =>
  HttpMiddleware.make((httpApp) =>
    Effect.gen(function* () {
      if (!basePath) return yield* httpApp
      const req = yield* HttpServerRequest.HttpServerRequest
      const url = req.url ?? "/"
      const stripped = stripPrefix(url, basePath)
      if (stripped === url) return yield* httpApp
      return yield* httpApp.pipe(
        Effect.provideService(HttpServerRequest.HttpServerRequest, req.modify({ url: stripped }))
      )
    })
  )
