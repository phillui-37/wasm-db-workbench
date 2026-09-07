import { CircularProgress, Box } from "@mui/material"
import { StyledEngineProvider } from "@mui/material/styles"
import { useEffect, useState } from "react"
import { fetchAuthMe, logoutAuth } from "./api/auth.ts"
import { LoginPage } from "./components/LoginPage.tsx"
import { Workbench } from "./components/Workbench.tsx"

type AuthState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authenticated"; username: string }

export const App = () => {
  const [auth, setAuth] = useState<AuthState>({ status: "loading" })

  useEffect(() => {
    let cancelled = false
    void fetchAuthMe().then((me) => {
      if (cancelled) return
      if (me.authenticated) setAuth({ status: "authenticated", username: me.username })
      else setAuth({ status: "anonymous" })
    })
    return () => {
      cancelled = true
    }
  }, [])

  const onLogout = () => {
    void logoutAuth().then(() => setAuth({ status: "anonymous" }))
  }

  return (
    <StyledEngineProvider injectFirst>
      {auth.status === "loading" ? (
        <Box className="min-h-screen flex items-center justify-center">
          <CircularProgress />
        </Box>
      ) : null}
      {auth.status === "anonymous" ? (
        <LoginPage onSuccess={(username) => setAuth({ status: "authenticated", username })} />
      ) : null}
      {auth.status === "authenticated" ? (
        <Workbench authUsername={auth.username} onLogout={onLogout} />
      ) : null}
    </StyledEngineProvider>
  )
}
