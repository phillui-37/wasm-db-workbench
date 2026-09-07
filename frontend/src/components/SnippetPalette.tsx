import {
  Autocomplete,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField
} from "@mui/material"
import { useState } from "react"

export type SnippetItem = { name: string; sql: string }

type Props = {
  open: boolean
  items: Array<SnippetItem>
  onClose: () => void
  onInsert: (sql: string) => void
}

export const SnippetPalette = ({ open, items, onClose, onInsert }: Props) => {
  const [picked, setPicked] = useState<SnippetItem | null>(null)
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Snippets</DialogTitle>
      <DialogContent>
        <Autocomplete
          className="mt-2"
          options={items}
          getOptionLabel={(o) => o.name}
          value={picked}
          onChange={(_, v) => setPicked(v)}
          renderInput={(params) => <TextField {...params} label="Insert snippet" />}
        />
      </DialogContent>
      <DialogActions>
        <Button
          onClick={() => {
            setPicked(null)
            onClose()
          }}
        >
          Close
        </Button>
        <Button
          variant="contained"
          disabled={!picked}
          onClick={() => {
            if (picked) {
              onInsert(picked.sql)
              setPicked(null)
            }
          }}
        >
          Insert
        </Button>
      </DialogActions>
    </Dialog>
  )
}
