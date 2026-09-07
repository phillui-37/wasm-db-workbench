import LockOutlined from "@mui/icons-material/LockOutlined"
import {
  Alert,
  Box,
  Button,
  Container,
  Paper,
  Stack,
  TextField,
  Typography
} from "@mui/material"
import { useState } from "react"

type Props = {
  onSuccess: (username: string) => void
}

const apiBase = (() => {
  const base = import.meta.env.BASE_URL || "/"
  if (base === "/") return ""
  return base.replace(/\/+$/, "")
})()

export const LoginPage = ({ onSuccess }: Props) => {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`${apiBase}/api/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      })
      if (!res.ok) {
        setError("Invalid username or password")
        return
      }
      onSuccess(username)
    } catch {
      setError("Could not reach the server")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Box className="min-h-screen flex items-center justify-center bg-neutral-100">
      <Container maxWidth="xs">
        <Paper elevation={2} className="p-6">
          <Stack spacing={2} component="form" onSubmit={submit}>
            <Stack direction="row" spacing={1} className="items-center">
              <LockOutlined color="primary" />
              <Typography variant="h6">Sign in</Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              WASM SQL Workbench
            </Typography>
            {error ? <Alert severity="error">{error}</Alert> : null}
            <TextField
              label="Username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              fullWidth
              autoFocus
            />
            <TextField
              label="Password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              fullWidth
            />
            <Button type="submit" variant="contained" disabled={busy} fullWidth>
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </Stack>
        </Paper>
      </Container>
    </Box>
  )
}
