import { DataGrid, type GridColDef, type GridRowModel } from "@mui/x-data-grid"
import { Button, Stack, Tab, Tabs, TextField, Typography } from "@mui/material"
import type { HistoryEntry, StatementResult, Table } from "@workbench/shared"
import { useMemo, useState } from "react"

type Props = {
  pane: "results" | "messages" | "history"
  onPane: (pane: "results" | "messages" | "history") => void
  statements: Array<StatementResult>
  activeIndex: number
  onActiveIndex: (index: number) => void
  message: string
  history: Array<HistoryEntry>
  onOpenHistory: (sql: string) => void
  onExportCsv: () => void
  onExportJson: () => void
  editTable?: Table
  onCellEdit?: (column: string, pkValue: unknown, value: unknown) => Promise<void>
}

export const SqlResults = ({
  pane,
  onPane,
  statements,
  activeIndex,
  onActiveIndex,
  message,
  history,
  onOpenHistory,
  onExportCsv,
  onExportJson,
  editTable,
  onCellEdit
}: Props) => {
  const [historyFilter, setHistoryFilter] = useState("")
  const active = statements[activeIndex]
  const pk = editTable?.columns.find((c) => c.pk)

  const { columns, rows } = useMemo(() => {
    if (pane !== "results" || !active) {
      return { columns: [] as Array<GridColDef>, rows: [] as Array<GridRowModel> }
    }
    const cols: Array<GridColDef> = active.columns.map((name, j) => ({
      field: name,
      headerName: name,
      flex: 1,
      minWidth: 120,
      editable: Boolean(editTable && onCellEdit && editTable.columns[j]),
      sortable: false
    }))
    const gridRows = active.rows.map((row, i) => {
      const rec: GridRowModel = { id: i }
      for (let j = 0; j < active.columns.length; j++) {
        rec[active.columns[j]!] = row[j]
      }
      return rec
    })
    return { columns: cols, rows: gridRows }
  }, [pane, active, editTable, onCellEdit])

  const filteredHistory = useMemo(
    () => history.filter((h) => h.sql.toLowerCase().includes(historyFilter.toLowerCase())),
    [history, historyFilter]
  )

  return (
    <div className="flex h-full flex-col">
      <Tabs value={pane} onChange={(_, v) => onPane(v)} variant="scrollable">
        <Tab value="results" label="results" />
        <Tab value="messages" label="messages" />
        <Tab value="history" label="history" />
      </Tabs>
      {pane === "results" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {statements.length > 1 ? (
            <Tabs value={activeIndex} onChange={(_, v) => onActiveIndex(v)} variant="scrollable">
              {statements.map((s, i) => (
                <Tab key={i} value={i} label={`#${i + 1} ${s.columns.length > 0 ? s.columns[0] : "ok"}`} />
              ))}
            </Tabs>
          ) : null}
          <Stack direction="row" spacing={1} className="items-center px-2 py-1">
            <Typography variant="caption">
              {active ? `${active.rowCount} row${active.rowCount === 1 ? "" : "s"} · ${active.durationMs} ms` : "No result"}
            </Typography>
            <Button size="small" disabled={!active} onClick={onExportCsv}>
              CSV
            </Button>
            <Button size="small" disabled={!active} onClick={onExportJson}>
              JSON
            </Button>
          </Stack>
          <div className="min-h-0 flex-1">
            <DataGrid
              rows={rows}
              columns={columns}
              density="compact"
              disableRowSelectionOnClick
              hideFooterSelectedRowCount
              getRowId={(row) => row.id as number}
              processRowUpdate={async (next, prev) => {
                if (!editTable || !onCellEdit || !pk || !active) return next
                const pkIndex = editTable.columns.findIndex((c) => c.pk)
                const pkValue = prev[editTable.columns[pkIndex]?.name ?? ""]
                for (const col of editTable.columns) {
                  if (next[col.name] === prev[col.name]) continue
                  let value: unknown = next[col.name]
                  if (value === "" && col.nullable) value = null
                  await onCellEdit(col.name, pkValue, value)
                }
                return next
              }}
            />
          </div>
        </div>
      ) : pane === "history" ? (
        <div className="min-h-0 flex-1 overflow-auto p-2">
          <TextField
            size="small"
            fullWidth
            placeholder="Filter history"
            value={historyFilter}
            onChange={(e) => setHistoryFilter(e.target.value)}
            className="mb-2"
          />
          {filteredHistory.map((h) => (
            <Button
              key={h.id}
              fullWidth
              className="justify-start normal-case"
              color={h.ok ? "success" : "error"}
              onClick={() => onOpenHistory(h.sql)}
            >
              {h.ok ? "OK" : "ERR"} {h.sql.slice(0, 80)}
            </Button>
          ))}
        </div>
      ) : (
        <pre className="m-0 min-h-0 flex-1 overflow-auto p-2 text-xs">{message}</pre>
      )}
    </div>
  )
}
