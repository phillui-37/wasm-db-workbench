import PushPin from "@mui/icons-material/PushPin"
import { List, ListItemButton, ListItemText, TextField } from "@mui/material"
import type { Script } from "@workbench/shared"
import { useState } from "react"

type Props = {
  scripts: Array<Script>
  onOpen: (script: Script) => void
}

export const ScriptList = ({ scripts, onOpen }: Props) => {
  const [filter, setFilter] = useState("")
  const visible = scripts.filter((s) => s.name.toLowerCase().includes(filter.toLowerCase()))
  return (
    <div>
      <TextField
        size="small"
        fullWidth
        className="mt-1"
        placeholder="Filter scripts"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <List dense>
        {visible.map((s) => (
          <ListItemButton key={s.name} onClick={() => onOpen(s)}>
            <ListItemText
              primary={
                <span className="flex items-center gap-1">
                  {s.pinned ? <PushPin fontSize="inherit" /> : null}
                  {s.name}.sql
                </span>
              }
            />
          </ListItemButton>
        ))}
      </List>
    </div>
  )
}
