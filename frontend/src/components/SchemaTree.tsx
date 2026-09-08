import { SimpleTreeView } from "@mui/x-tree-view/SimpleTreeView"
import { TreeItem } from "@mui/x-tree-view/TreeItem"
import { TextField } from "@mui/material"
import type { Catalog, Table } from "@workbench/shared"
import { useMemo, useState } from "react"

type Props = {
  catalog?: Catalog
  onOpenTable: (table: Table) => void
}

export const SchemaTree = ({ catalog, onOpenTable }: Props) => {
  const [filter, setFilter] = useState("")
  const q = filter.toLowerCase()
  const tables = useMemo(
    () =>
      (catalog?.tables ?? []).filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.schema.toLowerCase().includes(q) ||
          t.columns.some((c) => c.name.toLowerCase().includes(q))
      ),
    [catalog?.tables, q]
  )
  const schemas = useMemo(() => [...new Set(tables.map((t) => t.schema))], [tables])
  const [expanded, setExpanded] = useState<Array<string>>([])

  return (
    <div>
      <TextField
        size="small"
        fullWidth
        className="mt-1 mb-2"
        placeholder="Filter tables"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <SimpleTreeView
        expansionTrigger="iconContainer"
        expandedItems={expanded}
        onExpandedItemsChange={(_e, ids) => setExpanded(ids)}
        onItemClick={(_e, id) => {
          if (!id.startsWith("table:")) return
          const rest = id.slice("table:".length)
          const table = catalog?.tables.find((t) => `${t.schema}.${t.name}` === rest)
          if (table) onOpenTable(table)
        }}
      >
        {schemas.map((schema) => (
          <TreeItem key={schema} itemId={`schema:${schema}`} label={schema}>
            {tables
              .filter((t) => t.schema === schema)
              .map((table) => {
                const tableId = `table:${table.schema}.${table.name}`
                const showColumns = expanded.includes(tableId)
                return (
                  <TreeItem
                    key={`${table.schema}.${table.name}`}
                    itemId={tableId}
                    label={`${table.name} · ${table.kind}`}
                  >
                    {showColumns
                      ? table.columns.map((col) => (
                          <TreeItem
                            key={col.name}
                            itemId={`col:${table.schema}.${table.name}.${col.name}`}
                            label={`${col.name} ${col.type}${col.pk ? " pk" : ""}${col.fkTable ? ` → ${col.fkTable}.${col.fkColumn}` : ""}`}
                          />
                        ))
                      : null}
                  </TreeItem>
                )
              })}
          </TreeItem>
        ))}
      </SimpleTreeView>
    </div>
  )
}
