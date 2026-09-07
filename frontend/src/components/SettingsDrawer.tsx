import {
  Button,
  Checkbox,
  Drawer,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Typography
} from "@mui/material"
import type { AppConfig } from "@workbench/shared"

type Props = {
  open: boolean
  config: AppConfig
  onChange: (config: AppConfig) => void
  onSave: () => void
  onClose: () => void
}

export const SettingsDrawer = ({ open, config, onChange, onSave, onClose }: Props) => {
  const set = (next: AppConfig) => onChange(next)
  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Stack spacing={2} className="w-80 p-4">
        <Typography variant="h6">Settings</Typography>
        <TextField
          select
          label="Editor theme"
          value={config.editor.theme}
          onChange={(e) =>
            set({ ...config, editor: { ...config.editor, theme: e.target.value as AppConfig["editor"]["theme"] } })
          }
        >
          <MenuItem value="vs-dark">Dark</MenuItem>
          <MenuItem value="vs">Light</MenuItem>
          <MenuItem value="solarized-dark">Solarized Dark</MenuItem>
          <MenuItem value="solarized-light">Solarized Light</MenuItem>
        </TextField>
        <TextField
          type="number"
          label="Font size"
          value={config.editor.fontSize}
          onChange={(e) => set({ ...config, editor: { ...config.editor, fontSize: Number(e.target.value) } })}
        />
        <TextField
          type="number"
          label="Tab size"
          value={config.editor.tabSize}
          onChange={(e) => set({ ...config, editor: { ...config.editor, tabSize: Number(e.target.value) } })}
        />
        <TextField
          type="number"
          label="Max rows"
          value={config.query.maxRows}
          onChange={(e) => set({ ...config, query: { ...config.query, maxRows: Number(e.target.value) } })}
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={config.query.confirmDestructive}
              onChange={(e) => set({ ...config, query: { ...config.query, confirmDestructive: e.target.checked } })}
            />
          }
          label="Confirm destructive SQL"
        />
        <TextField
          select
          label="Sync trigger"
          value={config.sync.trigger}
          onChange={(e) =>
            set({ ...config, sync: { ...config.sync, trigger: e.target.value as AppConfig["sync"]["trigger"] } })
          }
        >
          <MenuItem value="manual">Manual</MenuItem>
          <MenuItem value="interval">Interval</MenuItem>
          <MenuItem value="onChange">On change</MenuItem>
        </TextField>
        <TextField
          type="number"
          label="Interval seconds"
          value={config.sync.intervalSeconds}
          onChange={(e) => set({ ...config, sync: { ...config.sync, intervalSeconds: Number(e.target.value) } })}
        />
        <TextField
          type="number"
          label="Debounce ms"
          value={config.sync.debounceMs}
          onChange={(e) => set({ ...config, sync: { ...config.sync, debounceMs: Number(e.target.value) } })}
        />
        <TextField
          select
          label="Sync format"
          value={config.sync.format}
          onChange={(e) =>
            set({ ...config, sync: { ...config.sync, format: e.target.value as AppConfig["sync"]["format"] } })
          }
        >
          <MenuItem value="binary">Binary</MenuItem>
          <MenuItem value="sql">SQL dump</MenuItem>
          <MenuItem value="both">Both</MenuItem>
        </TextField>
        <TextField
          select
          label="Pull on open"
          value={config.sync.pullOnOpen}
          onChange={(e) =>
            set({ ...config, sync: { ...config.sync, pullOnOpen: e.target.value as AppConfig["sync"]["pullOnOpen"] } })
          }
        >
          <MenuItem value="prompt">Prompt</MenuItem>
          <MenuItem value="always">Always</MenuItem>
          <MenuItem value="never">Never</MenuItem>
        </TextField>
        <TextField
          select
          label="Default engine"
          value={config.defaults.engine}
          onChange={(e) =>
            set({ ...config, defaults: { engine: e.target.value as AppConfig["defaults"]["engine"] } })
          }
        >
          <MenuItem value="pglite">PGlite</MenuItem>
          <MenuItem value="sqlite">SQLite</MenuItem>
        </TextField>
        <Button variant="contained" onClick={onSave}>
          Save to host
        </Button>
      </Stack>
    </Drawer>
  )
}
