const apiBase = (() => {
  const base = import.meta.env.BASE_URL || "/"
  if (base === "/") return ""
  return base.replace(/\/+$/, "")
})()

export type AuthMeResponse =
  | { authenticated: true; username: string }
  | { authenticated: false }

export const fetchAuthMe = async (): Promise<AuthMeResponse> => {
  const res = await fetch(`${apiBase}/api/auth/me`, { credentials: "include" })
  if (res.status === 401) return { authenticated: false }
  if (!res.ok) return { authenticated: false }
  const body = (await res.json()) as { authenticated?: boolean; username?: string }
  if (body.authenticated && body.username) {
    return { authenticated: true, username: body.username }
  }
  return { authenticated: false }
}

export const logoutAuth = async (): Promise<void> => {
  await fetch(`${apiBase}/api/auth/logout`, {
    method: "POST",
    credentials: "include"
  })
}
