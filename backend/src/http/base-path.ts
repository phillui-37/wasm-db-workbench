import { HttpMiddleware, HttpServerRequest } from "@effect/platform"
import { Effect } from "effect"

/** Previous subpath deploy. Always stripped so leftover HTML/asset URLs still work. */
export const LEGACY_BASE_PATH = "/wasm-db-workbench"

/** Normalize to a prefix like `/wasm-db-workbench`, or empty string for `/` (subdomain / root). */
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

/** Strip configured BASE_PATH and the legacy `/wasm-db-workbench` prefix. */
export const stripBasePath = (url: string, basePath: string): string => {
  let next = stripPrefix(url, basePath)
  if (basePath !== LEGACY_BASE_PATH) {
    next = stripPrefix(next, LEGACY_BASE_PATH)
  }
  return next
}

/** Strip prefixes so API/static handlers see root-relative paths. */
export const basePathMiddleware = (basePath: string) =>
  HttpMiddleware.make((httpApp) =>
    Effect.gen(function* () {
      const req = yield* HttpServerRequest.HttpServerRequest
      const url = req.url ?? "/"
      const stripped = stripBasePath(url, basePath)
      if (stripped === url) return yield* httpApp
      return yield* httpApp.pipe(
        Effect.provideService(HttpServerRequest.HttpServerRequest, req.modify({ url: stripped }))
      )
    })
  )
