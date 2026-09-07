import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField } from "@mui/material"
import { useEffect, useState } from "react"

type Props = {
  open: boolean
  names: Array<string>
  onCancel: () => void
  onRun: (values: Record<string, unknown>) => void
}

export const ParamsDialog = ({ open, names, onCancel, onRun }: Props) => {
  const [values, setValues] = useState<Record<string, string>>({})
  useEffect(() => {
    if (open) setValues(Object.fromEntries(names.map((n) => [n, ""])))
  }, [open, names])
  return (
    <Dialog open={open} onClose={onCancel} fullWidth maxWidth="xs">
      <DialogTitle>Query parameters</DialogTitle>
      <DialogContent>
        <Stack spacing={2} className="mt-2">
          {names.map((name) => (
            <TextField
              key={name}
              label={name}
              value={values[name] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
            />
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="contained" onClick={() => onRun(values)}>
          Run
        </Button>
      </DialogActions>
    </Dialog>
  )
}
