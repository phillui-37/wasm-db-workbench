import { createHmac, timingSafeEqual } from "node:crypto"
import { HttpMiddleware, HttpServerRequest, HttpServerResponse } from "@effect/platform"
import { AuthLogin } from "@workbench/shared"
import { Effect } from "effect"

export const SESSION_COOKIE = "wb_session"
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7 // 7 days

export type AuthEnv = {
  enabled: boolean
  username: string
  password: string
  secret: string
  cookiePath: string
  cookieSecure: boolean
}

export const loadAuthEnv = (opts: {
  enabled: boolean
  username: string | undefined
  password: string | undefined
  secret: string | undefined
  basePath: string
  cookieSecure: boolean
}): AuthEnv => {
  if (!opts.enabled) {
    return {
      enabled: false,
      username: "",
      password: "",
      secret: "",
      cookiePath: opts.basePath || "/",
      cookieSecure: opts.cookieSecure
    }
  }
  const username = opts.username?.trim() ?? ""
  const password = opts.password ?? ""
  if (!username || !password) {
    throw new Error("AUTH_ENABLED=true requires AUTH_USERNAME and AUTH_PASSWORD")
  }
  const secret = opts.secret?.trim() || createHmac("sha256", password).update("wb-auth-fallback").digest("hex")
  return {
    enabled: true,
    username,
    password,
    secret,
    cookiePath: opts.basePath || "/",
    cookieSecure: opts.cookieSecure
  }
}

const b64url = (buf: Buffer | string): string =>
  Buffer.from(buf)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "")

const fromB64url = (value: string): Buffer => {
  const pad = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4))
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/") + pad
  return Buffer.from(normalized, "base64")
}

export const createSessionToken = (username: string, secret: string, now = Date.now()): string => {
  const exp = String(now + SESSION_TTL_MS)
  const payload = `${username}|${exp}`
  const sig = createHmac("sha256", secret).update(payload).digest()
  return `${b64url(payload)}.${b64url(sig)}`
}

export const verifySessionToken = (
  token: string,
  secret: string,
  expectedUser: string,
  now = Date.now()
): boolean => {
  const parts = token.split(".")
  if (parts.length !== 2) return false
  const [payloadB64, sigB64] = parts
  if (!payloadB64 || !sigB64) return false
  let payload: string
  try {
    payload = fromB64url(payloadB64).toString("utf8")
  } catch {
    return false
  }
  const expectedSig = createHmac("sha256", secret).update(payload).digest()
  let actualSig: Buffer
  try {
    actualSig = fromB64url(sigB64)
  } catch {
    return false
  }
  if (expectedSig.length !== actualSig.length || !timingSafeEqual(expectedSig, actualSig)) return false
  const [user, expRaw] = payload.split("|")
  if (user !== expectedUser) return false
  const exp = Number(expRaw)
  if (!Number.isFinite(exp) || exp < now) return false
  return true
}

export const passwordsMatch = (provided: string, expected: string): boolean => {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) {
    timingSafeEqual(a, a)
    return false
  }
  return timingSafeEqual(a, b)
}

export const parseCookieHeader = (header: string | undefined): Record<string, string> => {
  if (!header) return {}
  const out: Record<string, string> = {}
  for (const part of header.split(";")) {
    const idx = part.indexOf("=")
    if (idx <= 0) continue
    const key = part.slice(0, idx).trim()
    const value = part.slice(idx + 1).trim()
    if (key) out[key] = decodeURIComponent(value)
  }
  return out
}

export const sessionCookieValue = (token: string, auth: AuthEnv, maxAgeSec = SESSION_TTL_MS / 1000): string => {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    `Path=${auth.cookiePath}`,
    `Max-Age=${Math.floor(maxAgeSec)}`,
    "HttpOnly",
    "SameSite=Lax"
  ]
  if (auth.cookieSecure) parts.push("Secure")
  return parts.join("; ")
}

export const clearSessionCookie = (auth: AuthEnv): string => {
  const parts = [`${SESSION_COOKIE}=`, `Path=${auth.cookiePath}`, "Max-Age=0", "HttpOnly", "SameSite=Lax"]
  if (auth.cookieSecure) parts.push("Secure")
  return parts.join("; ")
}

const json = (body: unknown, status = 200, setCookie?: string) => {
  let res = HttpServerResponse.unsafeJson(body, { status })
  if (setCookie) {
    res = res.pipe(HttpServerResponse.setHeader("Set-Cookie", setCookie))
  }
  return res
}

const isPublicApi = (method: string, url: string): boolean => {
  if (url === "/api/health" || url.startsWith("/api/health?")) return true
  if (method === "POST" && (url === "/api/auth/login" || url.startsWith("/api/auth/login?"))) return true
  if (method === "POST" && (url === "/api/auth/logout" || url.startsWith("/api/auth/logout?"))) return true
  if (method === "GET" && (url === "/api/auth/me" || url.startsWith("/api/auth/me?"))) return true
  return false
}

export const readSessionUsername = (auth: AuthEnv, cookieHeader: string | undefined): string | undefined => {
  if (!auth.enabled) return undefined
  const token = parseCookieHeader(cookieHeader)[SESSION_COOKIE]
  if (!token) return undefined
  return verifySessionToken(token, auth.secret, auth.username) ? auth.username : undefined
}

export const authMiddleware = (auth: AuthEnv) =>
  HttpMiddleware.make((httpApp) =>
    Effect.gen(function* () {
      const req = yield* HttpServerRequest.HttpServerRequest
      const url = (req.url ?? "/").split("?")[0] ?? "/"
      const method = req.method.toUpperCase()

      if (!auth.enabled) {
        if (method === "GET" && url === "/api/auth/me") {
          return json({ authenticated: true as const, username: "local" })
        }
        if (method === "POST" && (url === "/api/auth/login" || url === "/api/auth/logout")) {
          return json({ ok: true as const })
        }
        return yield* httpApp
      }

      if (method === "POST" && url === "/api/auth/login") {
        const payload = yield* HttpServerRequest.schemaBodyJson(AuthLogin).pipe(
          Effect.map((body) => body as typeof AuthLogin.Type),
          Effect.catchAll(() => Effect.succeed(null))
        )
        if (payload === null) {
          return json({ _tag: "AuthFailedError", message: "Invalid credentials" }, 401)
        }
        const userOk = passwordsMatch(payload.username, auth.username)
        const passOk = passwordsMatch(payload.password, auth.password)
        if (!userOk || !passOk) {
          return json({ _tag: "AuthFailedError", message: "Invalid credentials" }, 401)
        }
        const token = createSessionToken(auth.username, auth.secret)
        return json({ ok: true as const }, 200, sessionCookieValue(token, auth))
      }

      if (method === "POST" && url === "/api/auth/logout") {
        return json({ ok: true as const }, 200, clearSessionCookie(auth))
      }

      if (method === "GET" && url === "/api/auth/me") {
        const username = readSessionUsername(auth, req.headers.cookie)
        if (!username) {
          return json({ _tag: "UnauthorizedError", message: "Not authenticated" }, 401)
        }
        return json({ authenticated: true as const, username })
      }

      if (!url.startsWith("/api") || isPublicApi(method, url)) {
        return yield* httpApp
      }

      const username = readSessionUsername(auth, req.headers.cookie)
      if (!username) {
        return json({ _tag: "UnauthorizedError", message: "Not authenticated" }, 401)
      }
      return yield* httpApp
    })
  )
