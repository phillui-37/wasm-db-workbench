import DeleteOutlined from "@mui/icons-material/DeleteOutlined"
import DriveFileRenameOutline from "@mui/icons-material/DriveFileRenameOutline"
import {
  Button,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  MenuItem,
  Stack,
  TextField
} from "@mui/material"
import type { AppConfig, ConnectionMeta, EngineType } from "@workbench/shared"
import { useState } from "react"

type Props = {
  connections: Array<ConnectionMeta>
  activeId?: string
  newName: string
  newEngine: EngineType
  config: AppConfig
  onNewName: (value: string) => void
  onNewEngine: (value: EngineType) => void
  onCreate: () => void
  onSelect: (meta: ConnectionMeta) => void
  onRename: (meta: ConnectionMeta) => void
  onDelete: (meta: ConnectionMeta) => void
}

export const ConnectionList = ({
  connections,
  activeId,
  newName,
  newEngine,
  config,
  onNewName,
  onNewEngine,
  onCreate,
  onSelect,
  onRename,
  onDelete
}: Props) => {
  const [filter, setFilter] = useState("")
  const visible = connections.filter((c) => c.name.toLowerCase().includes(filter.toLowerCase()))
  return (
    <section>
      <Stack spacing={1} className="mt-1">
        <TextField size="small" placeholder="Filter" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <TextField size="small" placeholder="name" value={newName} onChange={(e) => onNewName(e.target.value)} />
        <TextField
          select
          size="small"
          value={newEngine}
          onChange={(e) => onNewEngine(e.target.value as EngineType)}
        >
          {config.engines.pglite.enabled ? <MenuItem value="pglite">PGlite</MenuItem> : null}
          {config.engines.sqlite.enabled ? <MenuItem value="sqlite">SQLite</MenuItem> : null}
        </TextField>
        <Button variant="outlined" onClick={onCreate}>
          New
        </Button>
      </Stack>
      <List dense>
        {visible.map((c) => (
          <ListItem
            key={c.id}
            disablePadding
            secondaryAction={
              <Stack direction="row">
                <IconButton edge="end" aria-label="rename" onClick={() => onRename(c)}>
                  <DriveFileRenameOutline fontSize="small" />
                </IconButton>
                <IconButton edge="end" aria-label="delete" onClick={() => onDelete(c)}>
                  <DeleteOutlined fontSize="small" />
                </IconButton>
              </Stack>
            }
          >
            <ListItemButton selected={c.id === activeId} onClick={() => onSelect(c)}>
              <ListItemText primary={c.name} secondary={c.engine} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </section>
  )
}
