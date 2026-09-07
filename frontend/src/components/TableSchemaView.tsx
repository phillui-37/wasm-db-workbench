import ContentCopy from "@mui/icons-material/ContentCopy"
import { DataGrid, type GridColDef } from "@mui/x-data-grid"
import { Button, Typography } from "@mui/material"
import type { Table } from "@workbench/shared"
import { useMemo, useState } from "react"
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels"

type Props = {
  table: Table
  ddl: string
}

export const TableSchemaView = ({ table, ddl }: Props) => {
  const [copied, setCopied] = useState(false)
  const columns: Array<GridColDef> = useMemo(
    () => [
      { field: "name", headerName: "Column", flex: 1.2, minWidth: 120 },
      { field: "type", headerName: "Type", flex: 1, minWidth: 100 },
      {
        field: "nullable",
        headerName: "Nullable",
        width: 100,
        valueFormatter: (value: boolean) => (value ? "YES" : "NO")
      },
      {
        field: "pk",
        headerName: "PK",
        width: 70,
        valueFormatter: (value: boolean) => (value ? "✓" : "")
      },
      {
        field: "fk",
        headerName: "FK",
        flex: 1.2,
        minWidth: 140,
        valueGetter: (_value, row: { fkTable?: string; fkColumn?: string }) =>
          row.fkTable ? `${row.fkTable}.${row.fkColumn ?? ""}` : ""
      }
    ],
    []
  )

  const rows = useMemo(
    () =>
      table.columns.map((col, i) => ({
        id: i,
        name: col.name,
        type: col.type,
        nullable: col.nullable,
        pk: col.pk,
        fkTable: col.fkTable,
        fkColumn: col.fkColumn
      })),
    [table.columns]
  )

  const copySql = async () => {
    try {
      await navigator.clipboard.writeText(ddl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-1.5">
        <Typography variant="subtitle2">
          Schema · {table.schema}.{table.name}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {table.kind} · {table.columns.length} columns
        </Typography>
      </div>
      <PanelGroup direction="vertical" className="min-h-0 flex-1">
        <Panel defaultSize={55} minSize={25}>
          <DataGrid
            rows={rows}
            columns={columns}
            density="compact"
            disableRowSelectionOnClick
            hideFooter={rows.length <= 100}
            pageSizeOptions={[25, 50, 100]}
            initialState={{ pagination: { paginationModel: { pageSize: 50, page: 0 } } }}
            sx={{ border: 0, height: "100%", "& .MuiDataGrid-cell": { fontFamily: "ui-monospace, monospace" } }}
          />
        </Panel>
        <PanelResizeHandle className="h-1 bg-[var(--mui-palette-divider)]" />
        <Panel defaultSize={45} minSize={20}>
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-2 border-b px-3 py-1">
              <Typography variant="caption" color="text.secondary">
                SQL
              </Typography>
              <Button size="small" startIcon={<ContentCopy />} onClick={() => void copySql()} className="ml-auto">
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <pre className="m-0 min-h-0 flex-1 overflow-auto p-3 font-mono text-xs whitespace-pre-wrap">
              {ddl || "Loading…"}
            </pre>
          </div>
        </Panel>
      </PanelGroup>
    </div>
  )
}
