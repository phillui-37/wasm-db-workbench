import { Chip } from "@mui/material"
import { Effect } from "effect"
import { useEffect, useState } from "react"
import { runPromise, WorkbenchClient } from "../runtime.ts"

export const HealthBadge = () => {
  const [status, setStatus] = useState<"ok" | "down" | "loading">("loading")
  useEffect(() => {
    const tick = () => {
      void runPromise(
        Effect.gen(function* () {
          const client = yield* WorkbenchClient
          return yield* client.health.check()
        })
      )
        .then(() => setStatus("ok"))
        .catch(() => setStatus("down"))
    }
    tick()
    const id = window.setInterval(tick, 10000)
    return () => window.clearInterval(id)
  }, [])
  if (status === "ok") return <Chip size="small" color="success" label="API ok" />
  if (status === "down") return <Chip size="small" color="error" label="API down" />
  return <Chip size="small" label="API…" />
}
