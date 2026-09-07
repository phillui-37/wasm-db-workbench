import PlayArrow from "@mui/icons-material/PlayArrow"
import Stop from "@mui/icons-material/Stop"
import {
  AppBar,
  Button,
  Stack,
  Toolbar,
  Typography
} from "@mui/material"
import { HealthBadge } from "./HealthBadge.tsx"

type Props = {
  connectionLabel: string
  authUsername: string
  running: boolean
  canRun: boolean
  hasConnection: boolean
  onRun: () => void
  onCancel: () => void
  onSave: () => void
  onSync: () => void
  onPull: () => void
  onExportSql: () => void
  onExportDb: () => void
  onImport: (file: File) => void
  onFormat: () => void
  onSnippets: () => void
  onBookmark: () => void
  onSettings: () => void
  onLogout: () => void
}

export const TopBar = ({
  connectionLabel,
  authUsername,
  running,
  canRun,
  hasConnection,
  onRun,
  onCancel,
  onSave,
  onSync,
  onPull,
  onExportSql,
  onExportDb,
  onImport,
  onFormat,
  onSnippets,
  onBookmark,
  onSettings,
  onLogout
}: Props) => (
  <AppBar position="static" color="transparent" elevation={0} className="border-b border-divider">
    <Toolbar variant="dense" className="gap-2 min-h-12">
      <Typography variant="subtitle1" className="font-semibold">
        WASM SQL Workbench
      </Typography>
      <HealthBadge />
      <Typography variant="caption" color="text.secondary">
        {connectionLabel}
      </Typography>
      <Typography variant="caption" color="text.secondary" className="ml-2">
        {authUsername}
      </Typography>
      <Stack direction="row" spacing={0.5} className="ml-auto flex-wrap">
        <Button variant="contained" startIcon={<PlayArrow />} disabled={!canRun} onClick={onRun}>
          Run
        </Button>
        <Button startIcon={<Stop />} disabled={!running} onClick={onCancel}>
          Cancel
        </Button>
        <Button disabled={!hasConnection} onClick={onSave}>
          Save
        </Button>
        <Button disabled={!hasConnection} onClick={onBookmark}>
          Pin
        </Button>
        <Button disabled={!hasConnection} onClick={onSnippets}>
          Snippets
        </Button>
        <Button disabled={!hasConnection} onClick={onFormat}>
          Format
        </Button>
        <Button disabled={!hasConnection} onClick={onSync}>
          Sync
        </Button>
        <Button disabled={!hasConnection} onClick={onPull}>
          Pull
        </Button>
        <Button disabled={!hasConnection} onClick={onExportSql}>
          Export SQL
        </Button>
        <Button disabled={!hasConnection} onClick={onExportDb}>
          Export DB
        </Button>
        <Button component="label" disabled={!hasConnection}>
          Import
          <input
            hidden
            type="file"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onImport(file)
              e.target.value = ""
            }}
          />
        </Button>
        <Button onClick={onSettings}>Settings</Button>
        <Button onClick={onLogout}>Logout</Button>
      </Stack>
    </Toolbar>
  </AppBar>
)
