import {
  analyzeSql,
  applyMaxRows,
  applyParams,
  connectionSlug,
  connectionsFingerprint,
  defaultAppConfig,
  findExistingConnection,
  isHostDumpFile,
  workspaceId,
  lastResult,
  qualifyTable,
  statementAtOffset,
  type AppConfig,
  type Catalog,
  type ConnectionMeta,
  type EngineType,
  type HistoryEntry,
  type Script,
  type StatementResult,
  type Table
} from "@workbench/shared"
import { Effect, Fiber } from "effect"
import type { editor } from "monaco-editor"
import { useEffect, useMemo, useRef, useState } from "react"
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels"
import { Snackbar, Tab, Tabs } from "@mui/material"
import CssBaseline from "@mui/material/CssBaseline"
import { ThemeProvider } from "@mui/material/styles"
import { SqlEditor } from "../editor/SqlEditor.tsx"
import { downloadBytes, downloadText, fetchTableDdl, tableCreateSql, toCsv } from "../engines/dump.ts"
import { openEngine } from "../engines/hub.ts"
import { wipeLocalEngine } from "../engines/wipe.ts"
import { ConnectionHub as HubTag, runFork, runPromise, SyncController, WorkbenchClient } from "../runtime.ts"
import { builtinSnippets } from "../snippets.ts"
import { workbenchTheme } from "../theme.ts"
import type { WorkbenchApiClient } from "../api/workbench-client.ts"
import { ConnectionList } from "./ConnectionList.tsx"
import { ParamsDialog } from "./ParamsDialog.tsx"
import { SchemaTree } from "./SchemaTree.tsx"
import { ScriptList } from "./ScriptList.tsx"
import { SettingsDrawer } from "./SettingsDrawer.tsx"
import { SideSection } from "./SideSection.tsx"
import { SnippetPalette } from "./SnippetPalette.tsx"
import { SqlResults } from "./SqlResults.tsx"
import { TableSchemaView } from "./TableSchemaView.tsx"
import { TopBar } from "./TopBar.tsx"

type TabState =
  | { id: string; kind: "sql"; title: string; sql: string }
  | { id: string; kind: "data"; title: string; table: Table; page: number }

const loadConnections = (): Array<ConnectionMeta> => {
  try {
    const parsed = JSON.parse(localStorage.getItem("workbench.connections") ?? "[]") as Array<ConnectionMeta>
    return mergeConnections(Array.isArray(parsed) ? parsed : [], [])
  } catch {
    return []
  }
}

const saveConnections = (list: Array<ConnectionMeta>) => {
  localStorage.setItem("workbench.connections", JSON.stringify(list))
}

const canonicalizeConnection = (item: ConnectionMeta): ConnectionMeta => ({
  ...item,
  id: workspaceId(item.id, item.name)
})

const mergeConnections = (local: Array<ConnectionMeta>, remote: Array<ConnectionMeta>) => {
  const byId = new Map<string, ConnectionMeta>()
  for (const item of remote) {
    const next = canonicalizeConnection(item)
    byId.set(next.id, next)
  }
  for (const item of local) {
    const next = canonicalizeConnection(item)
    if (byId.has(next.id)) continue
    byId.set(next.id, next)
  }
  return [...byId.values()]
}

const ACTIVE_ID_KEY = "workbench.activeId"
const loadActiveId = (): string | undefined => {
  const saved = localStorage.getItem(ACTIVE_ID_KEY)
  return saved ? workspaceId(saved) : undefined
}

export const Workbench = ({
  authUsername,
  onLogout
}: {
  authUsername: string
  onLogout: () => void
}) => {
  const [config, setConfig] = useState<AppConfig>(defaultAppConfig)
  const [connections, setConnections] = useState<Array<ConnectionMeta>>(loadConnections)
  const [activeId, setActiveId] = useState<string | undefined>(() => {
    const saved = loadActiveId()
    const list = loadConnections()
    return list.some((c) => c.id === saved) ? saved : list[0]?.id
  })
  const [catalog, setCatalog] = useState<Catalog | undefined>()
  const [tabs, setTabs] = useState<Array<TabState>>([{ id: "q1", kind: "sql", title: "query.sql", sql: "SELECT 1;\n" }])
  const [activeTab, setActiveTab] = useState("q1")
  const [statements, setStatements] = useState<Array<StatementResult>>([])
  const [dataStatements, setDataStatements] = useState<Array<StatementResult>>([])
  const [tableDdl, setTableDdl] = useState("")
  const [activeResult, setActiveResult] = useState(0)
  const [message, setMessage] = useState("Ready")
  const [snack, setSnack] = useState<string | undefined>()
  const [running, setRunning] = useState(false)
  const [history, setHistory] = useState<Array<HistoryEntry>>([])
  const [scripts, setScripts] = useState<Array<Script>>([])
  const [bottom, setBottom] = useState<"results" | "messages" | "history">("results")
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [snippetsOpen, setSnippetsOpen] = useState(false)
  const [newName, setNewName] = useState("local")
  const [newEngine, setNewEngine] = useState<EngineType>("pglite")
  const [paramNames, setParamNames] = useState<Array<string>>([])
  const [pendingSql, setPendingSql] = useState<string | undefined>()
  const fiberRef = useRef<Fiber.RuntimeFiber<unknown, unknown> | null>(null)
  const dataFiberRef = useRef<Fiber.RuntimeFiber<unknown, unknown> | null>(null)
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const configRef = useRef(config)
  configRef.current = config
  const autoOpened = useRef(false)
  const hostCatalogReady = useRef(false)

  const active = connections.find((c) => c.id === activeId)
  const dialect = active?.engine === "sqlite" ? "sqlite" : "pgsql"
  const tab = tabs.find((t) => t.id === activeTab)

  const withClient = <A, E>(use: (client: WorkbenchApiClient) => Effect.Effect<A, E>) =>
    runPromise(
      Effect.gen(function* () {
        const client = yield* WorkbenchClient
        return yield* use(client)
      })
    )

  const refreshCatalog = (id: string) =>
    runFork(
      Effect.gen(function* () {
        const hub = yield* HubTag
        const engine = yield* hub.get(id)
        setCatalog(yield* engine.introspect)
      }).pipe(Effect.catchAll((e) => Effect.sync(() => setMessage(String(e)))))
    )

  const refreshSide = (id: string) => {
    void withClient((client) =>
      Effect.gen(function* () {
        const h = yield* client.history.list({ path: { connectionId: id } })
        const s = yield* client.scripts.list({ path: { connectionId: id } })
        setHistory([...h])
        setScripts([...s])
      })
    ).catch((e) => setMessage(String(e)))
  }

  useEffect(() => {
    saveConnections(connections)
    if (!hostCatalogReady.current) return
    void withClient((client) => client.connections.put({ payload: connections }))
      .then((full) => {
        const next = [...full]
        if (connectionsFingerprint(next) === connectionsFingerprint(connections)) return
        setConnections(next)
      })
      .catch(() => undefined)
  }, [connections])

  useEffect(() => {
    if (activeId) localStorage.setItem(ACTIVE_ID_KEY, activeId)
  }, [activeId])

  const ensureOpen = (meta: ConnectionMeta) =>
    Effect.gen(function* () {
      const hub = yield* HubTag
      const existing = yield* hub.get(meta.id).pipe(Effect.option)
      if (existing._tag === "Some") return
      const engine = yield* openEngine(meta.id, meta.engine)
      yield* hub.open(meta.id, engine)
      const cfg = configRef.current
      const sync = yield* SyncController
      if (cfg.sync.trigger === "interval") {
        yield* sync.startInterval(meta.id, cfg.sync.intervalSeconds, cfg.sync.format, meta.engine, meta.name)
      }
      if (cfg.sync.pullOnOpen !== "never") {
        const client = yield* WorkbenchClient
        const files = yield* client.sync.files({ path: { connectionId: meta.id } }).pipe(
          Effect.orElseSucceed(() => [] as Array<{ name: string }>)
        )
        const dumpReady = files.some((file) => isHostDumpFile(file.name))
        if (dumpReady) {
          const localCatalog = yield* engine.introspect.pipe(Effect.orElseSucceed(() => ({ schemas: [], tables: [] })))
          const empty = localCatalog.tables.length === 0
          const shouldPull =
            empty ||
            cfg.sync.pullOnOpen === "always" ||
            (cfg.sync.pullOnOpen === "prompt" && confirm(`Pull host dump for ${meta.name}?`))
          if (shouldPull) yield* sync.pull(meta.id).pipe(Effect.ignore)
        }
      }
    })

  const selectConnection = (meta: ConnectionMeta) => {
    setActiveId(meta.id)
    setMessage(`Opening ${meta.name} (${meta.engine})…`)
    runFork(
      ensureOpen(meta).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            refreshCatalog(meta.id)
            refreshSide(meta.id)
            setMessage(`Connected · ${meta.name}`)
          })
        ),
        Effect.catchAll((e) => Effect.sync(() => setMessage(String(e))))
      )
    )
  }

  useEffect(() => {
    void withClient((client) =>
      Effect.gen(function* () {
        const cfg = yield* client.config.get()
        setConfig(cfg)
        setNewEngine(cfg.defaults.engine)
        const remote = yield* client.connections.list().pipe(Effect.orElseSucceed(() => [] as Array<ConnectionMeta>))
        const merged = mergeConnections(loadConnections(), [...remote])
        hostCatalogReady.current = true
        setConnections(merged)
        if (autoOpened.current) return
        autoOpened.current = true
        const saved = loadActiveId()
        const savedWorkspace = saved ? workspaceId(saved) : undefined
        const meta =
          merged.find((c) => c.id === saved) ??
          merged.find((c) => c.id === savedWorkspace) ??
          merged[0]
        if (meta) selectConnection(meta)
      })
    ).catch((e) => setMessage(`Host catalog failed: ${String(e)}`))
  }, [])

  const createConnection = () => {
    if (!config.engines[newEngine].enabled) {
      setMessage(`${newEngine} is disabled in config`)
      return
    }
    const name = newName.trim() || "db"
    const existing = findExistingConnection(connections, name)
    if (existing) {
      selectConnection(existing)
      setSnack(`Opened ${existing.name}`)
      return
    }
    const meta: ConnectionMeta = { id: connectionSlug(name), name, engine: newEngine }
    setConnections((list) => [...list, meta])
    selectConnection(meta)
  }

  const renameConnection = (meta: ConnectionMeta) => {
    const name = prompt("Rename connection", meta.name)
    if (!name) return
    setConnections((list) => list.map((c) => (c.id === meta.id ? { ...c, name } : c)))
    if (activeId === meta.id) setMessage(`Connected · ${name}`)
  }

  const deleteConnection = (meta: ConnectionMeta) => {
    if (!confirm(`Delete ${meta.name} and all synced files on the host?`)) return
    runFork(
      Effect.gen(function* () {
        const hub = yield* HubTag
        yield* hub.close(meta.id).pipe(Effect.ignore)
        const sync = yield* SyncController
        yield* sync.stop(meta.id).pipe(Effect.ignore)
        yield* wipeLocalEngine(meta.id, meta.engine)
        const client = yield* WorkbenchClient
        yield* client.connections.remove({ path: { connectionId: meta.id } })
        const next = connections.filter((c) => c.id !== meta.id)
        setConnections(next)
        if (activeId === meta.id) {
          setActiveId(next[0]?.id)
          setCatalog(undefined)
          setHistory([])
          setScripts([])
          if (next[0]) selectConnection(next[0])
        }
        setSnack(`Deleted ${meta.name}`)
      }).pipe(Effect.catchAll((e) => Effect.sync(() => setMessage(String(e)))))
    )
  }

  const executeSql = (sql: string, values?: Record<string, unknown>) => {
    if (!active) {
      setMessage("Create a connection first")
      return
    }
    const analysis = analyzeSql(sql)
    if (config.query.confirmDestructive && analysis.isDestructive && !confirm("Run destructive SQL?")) return
    setRunning(true)
    setBottom("results")
    const started = Date.now()
    const capped = applyMaxRows(sql, configRef.current.query.maxRows, analysis.statements)
    const bound =
      analysis.placeholders.kind === "none" || !values
        ? { sql: capped, bind: undefined }
        : applyParams(dialect, capped, values, analysis.placeholders)
    const program = Effect.gen(function* () {
      const hub = yield* HubTag
      const engine = yield* hub.get(active.id)
      const result = yield* engine.query(bound.sql, bound.bind)
      const withCols = result.statements.filter((s) => s.columns.length > 0)
      setStatements(withCols.length > 0 ? [...withCols] : [...result.statements])
      setActiveResult(0)
      const last = lastResult(result)
      setMessage(`OK · ${last.rowCount} rows · ${result.durationMs} ms`)
      const client = yield* WorkbenchClient
      const entry = yield* client.history.append({
        path: { connectionId: active.id },
        payload: { sql, durationMs: result.durationMs, ok: true, rowCount: last.rowCount }
      })
      setHistory((h) => [entry, ...h])
      if (analysis.isDdl) {
        setCatalog(yield* engine.introspect)
      }
      const sync = yield* SyncController
      if (configRef.current.sync.trigger === "onChange" && analysis.isWrite) {
        yield* sync.notifyChange(
          active.id,
          configRef.current.sync.debounceMs,
          configRef.current.sync.format,
          active.engine,
          active.name
        )
      }
    }).pipe(
      Effect.catchAll((e) =>
        Effect.gen(function* () {
          setMessage(String(e))
          setBottom("messages")
          const client = yield* WorkbenchClient
          yield* client.history
            .append({
              path: { connectionId: active.id },
              payload: { sql, durationMs: Date.now() - started, ok: false, error: String(e) }
            })
            .pipe(Effect.ignore)
        })
      ),
      Effect.ensuring(Effect.sync(() => setRunning(false)))
    )
    fiberRef.current = runFork(program)
  }

  const runSql = (sql: string) => {
    const { placeholders } = analyzeSql(sql)
    if (placeholders.kind === "named") {
      setPendingSql(sql)
      setParamNames(placeholders.names)
      return
    }
    if (placeholders.kind === "positional") {
      setPendingSql(sql)
      setParamNames(Array.from({ length: placeholders.count }, (_, i) => String(i + 1)))
      return
    }
    executeSql(sql)
  }

  const runActive = () => {
    if (tab?.kind !== "sql") return
    const ed = editorRef.current
    const model = ed?.getModel()
    const selection = ed?.getSelection()
    const selected = selection && model ? model.getValueInRange(selection) : ""
    if (selected.trim()) {
      runSql(selected)
      return
    }
    const full = ed?.getValue() || tab.sql
    const pos = ed?.getPosition()
    const offset = pos && model ? model.getOffsetAt(pos) : 0
    runSql(statementAtOffset(full, offset))
  }

  const runScript = () => {
    if (tab?.kind !== "sql") return
    runSql(editorRef.current?.getValue() || tab.sql)
  }

  const formatSql = () => {
    if (tab?.kind !== "sql") return
    void import("sql-formatter")
      .then(({ format }) => {
        const next = format(editorRef.current?.getValue() || tab.sql, {
          language: dialect === "pgsql" ? "postgresql" : "sqlite"
        })
        editorRef.current?.setValue(next)
        setTabs((list) => list.map((t) => (t.id === tab.id && t.kind === "sql" ? { ...t, sql: next } : t)))
      })
      .catch((e) => setMessage(String(e)))
  }

  const saveScript = (pinned?: boolean) => {
    if (!active || tab?.kind !== "sql") return
    const name = prompt("Script name", tab.title.replace(/\.sql$/, ""))
    if (!name) return
    void withClient((client) =>
      client.scripts.put({
        path: { connectionId: active.id, name },
        payload: { sql: editorRef.current?.getValue() || tab.sql, pinned }
      })
    ).then((s) => {
      setScripts((list) => [...list.filter((x) => x.name !== s.name), s])
      const nextId = `script:${s.name}`
      const sql = editorRef.current?.getValue() || tab.sql
      setTabs((list) => {
        const others = list.filter((t) => t.id !== tab.id)
        if (others.some((t) => t.id === nextId)) {
          return others.map((t) =>
            t.id === nextId && t.kind === "sql" ? { ...t, title: `${s.name}.sql`, sql } : t
          )
        }
        return list.map((t) =>
          t.id === tab.id && t.kind === "sql" ? { ...t, id: nextId, title: `${s.name}.sql`, sql } : t
        )
      })
      setActiveTab(nextId)
      setSnack(`Saved ${s.name}.sql`)
    })
  }

  const openTable = (table: Table) => {
    const id = `data:${table.schema}.${table.name}`
    setTabs((list) => (list.some((t) => t.id === id) ? list : [...list, { id, kind: "data", title: table.name, table, page: 0 }]))
    setActiveTab(id)
  }

  const dataPage = tab?.kind === "data" ? tab : undefined
  useEffect(() => {
    if (!active || !dataPage) return
    const qtable = qualifyTable(dialect, dataPage.table.schema, dataPage.table.name)
    const offset = dataPage.page * config.query.maxRows
    if (dataFiberRef.current) runFork(Fiber.interrupt(dataFiberRef.current))
    dataFiberRef.current = runFork(
      Effect.gen(function* () {
        const hub = yield* HubTag
        const engine = yield* hub.get(active.id)
        const res = yield* engine.query(`SELECT * FROM ${qtable} LIMIT ${config.query.maxRows} OFFSET ${offset}`)
        setDataStatements([...res.statements])
      }).pipe(Effect.catchAll((e) => Effect.sync(() => setMessage(String(e)))))
    )
    return () => {
      if (dataFiberRef.current) runFork(Fiber.interrupt(dataFiberRef.current))
    }
  }, [activeId, dataPage?.id, dataPage?.page, config.query.maxRows])

  useEffect(() => {
    if (!active || !dataPage) {
      setTableDdl("")
      return
    }
    const table =
      catalog?.tables.find((t) => t.schema === dataPage.table.schema && t.name === dataPage.table.name) ??
      dataPage.table
    setTableDdl(tableCreateSql(dialect, table))
    runFork(
      Effect.gen(function* () {
        const hub = yield* HubTag
        const engine = yield* hub.get(active.id)
        const ddl = yield* fetchTableDdl(engine, table)
        setTableDdl(ddl)
      }).pipe(Effect.catchAll(() => Effect.void))
    )
  }, [activeId, dataPage?.id, catalog, dialect])

  const snippetItems = useMemo(
    () => [
      ...builtinSnippets.map((s) => ({ name: s.name, sql: s.sql })),
      ...scripts.map((s) => ({ name: s.name, sql: s.sql }))
    ],
    [scripts]
  )

  const activeStatement = (tab?.kind === "data" ? dataStatements : statements)[activeResult]

  const theme = useMemo(() => workbenchTheme(config.editor.theme), [config.editor.theme])

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <div className="flex h-full flex-col">
      <TopBar
        connectionLabel={active ? `${active.name} · ${active.engine}` : "no connection"}
        authUsername={authUsername}
        running={running}
        canRun={Boolean(active) && !running && tab?.kind === "sql"}
        hasConnection={Boolean(active)}
        onRun={runActive}
        onRunScript={runScript}
        onCancel={() => {
          if (fiberRef.current) runFork(Fiber.interrupt(fiberRef.current))
          setRunning(false)
          setMessage("Cancelled")
        }}
        onSave={() => saveScript()}
        onBookmark={() => saveScript(true)}
        onSnippets={() => setSnippetsOpen(true)}
        onFormat={formatSql}
        onLogout={onLogout}
        onSync={() =>
          active &&
          runFork(
            Effect.gen(function* () {
              const sync = yield* SyncController
              yield* sync.push(active.id, config.sync.format, active.engine, active.name)
              setSnack("Synced to host")
            }).pipe(Effect.catchAll((e) => Effect.sync(() => setMessage(String(e)))))
          )
        }
        onPull={() =>
          active &&
          runFork(
            Effect.gen(function* () {
              const sync = yield* SyncController
              yield* sync.pull(active.id)
              refreshCatalog(active.id)
              refreshSide(active.id)
              setSnack("Pulled from host")
            }).pipe(Effect.catchAll((e) => Effect.sync(() => setMessage(String(e)))))
          )
        }
        onExportSql={() =>
          active &&
          runFork(
            Effect.gen(function* () {
              const hub = yield* HubTag
              const engine = yield* hub.get(active.id)
              downloadText(`${active.name}.sql`, yield* engine.exportSql, "application/sql")
            }).pipe(Effect.catchAll((e) => Effect.sync(() => setMessage(String(e)))))
          )
        }
        onExportDb={() =>
          active &&
          runFork(
            Effect.gen(function* () {
              const hub = yield* HubTag
              const engine = yield* hub.get(active.id)
              const bytes = yield* engine.exportBinary
              downloadBytes(active.engine === "sqlite" ? `${active.name}.sqlite` : `${active.name}.tar.gz`, bytes)
            }).pipe(Effect.catchAll((e) => Effect.sync(() => setMessage(String(e)))))
          )
        }
        onImport={(file) => {
          if (!active) return
          void file.arrayBuffer().then((buf) => {
            runFork(
              Effect.gen(function* () {
                const hub = yield* HubTag
                const engine = yield* hub.get(active.id)
                if (file.name.endsWith(".sql") || file.type.includes("sql")) {
                  yield* engine.importSql(new TextDecoder().decode(buf))
                } else {
                  yield* engine.importBinary(new Uint8Array(buf))
                }
                refreshCatalog(active.id)
                setSnack(`Imported ${file.name}`)
              }).pipe(Effect.catchAll((e) => Effect.sync(() => setMessage(String(e)))))
            )
          })
        }}
        onSettings={() => setSettingsOpen(true)}
      />
      <PanelGroup direction="horizontal" className="min-h-0 flex-1">
        <Panel defaultSize={18} minSize={12} className="min-h-0">
          <div className="flex h-full min-h-0 flex-col overflow-auto p-2">
          <SideSection id="connections" title="Connections">
          <ConnectionList
            connections={connections}
            activeId={activeId}
            newName={newName}
            newEngine={newEngine}
            config={config}
            onNewName={setNewName}
            onNewEngine={setNewEngine}
            onCreate={createConnection}
            onSelect={selectConnection}
            onRename={renameConnection}
            onDelete={deleteConnection}
          />
          </SideSection>
          <SideSection id="schema" title="Schema">
          <SchemaTree catalog={catalog} onOpenTable={openTable} />
          </SideSection>
          <SideSection id="scripts" title="Scripts">
          <ScriptList
            scripts={scripts}
            onOpen={(s) => {
              const id = `script:${s.name}`
              setTabs((list) => {
                if (list.some((t) => t.id === id)) return list
                return [...list, { id, kind: "sql", title: `${s.name}.sql`, sql: s.sql }]
              })
              setActiveTab(id)
            }}
          />
          </SideSection>
          </div>
        </Panel>
        <PanelResizeHandle className="w-1 bg-[var(--mui-palette-divider)]" />
        <Panel minSize={40}>
          <PanelGroup direction="vertical">
            <Panel minSize={30}>
              <div className="flex h-full flex-col">
                <div className="flex items-center">
                <Tabs
                  value={activeTab || false}
                  onChange={(_, id) => {
                    if (id) setActiveTab(id)
                  }}
                  variant="scrollable"
                  className="min-h-10 flex-1"
                >
                  {tabs.map((t) => (
                    <Tab
                      key={t.id}
                      value={t.id}
                      label={
                        <span className="flex items-center gap-1">
                          {t.title}
                          <span
                            className="cursor-pointer px-1"
                            onClick={(e) => {
                              e.stopPropagation()
                              setTabs((list) => list.filter((x) => x.id !== t.id))
                              if (activeTab === t.id) setActiveTab(tabs.find((x) => x.id !== t.id)?.id ?? "")
                            }}
                          >
                            ×
                          </span>
                        </span>
                      }
                    />
                  ))}
                </Tabs>
                <button
                  type="button"
                  className="px-2 text-lg"
                  onClick={() => {
                    const id = crypto.randomUUID()
                    setTabs((list) => [...list, { id, kind: "sql", title: `query${list.length + 1}.sql`, sql: "" }])
                    setActiveTab(id)
                  }}
                >
                  +
                </button>
                </div>
                <div className="min-h-0 flex-1">
                  {tab?.kind === "sql" ? (
                    <SqlEditor
                      tabId={tab.id}
                      value={tab.sql}
                      dialect={dialect}
                      theme={config.editor.theme}
                      fontSize={config.editor.fontSize}
                      tabSize={config.editor.tabSize}
                      catalog={catalog}
                      onRun={runActive}
                      onRunScript={runScript}
                      onChange={(id, sql) =>
                        setTabs((list) => list.map((t) => (t.id === id && t.kind === "sql" ? { ...t, sql } : t)))
                      }
                      onMount={(ed) => {
                        editorRef.current = ed
                      }}
                    />
                  ) : tab?.kind === "data" ? (
                    <div className="flex h-full flex-col">
                      <div className="flex items-center gap-2 p-2 text-sm">
                        <span>
                          {tab.table.schema}.{tab.table.name}
                        </span>
                        <button
                          type="button"
                          className="rounded border px-2 py-0.5"
                          onClick={() =>
                            setTabs((list) =>
                              list.map((t) =>
                                t.id === tab.id && t.kind === "data" ? { ...t, page: Math.max(0, t.page - 1) } : t
                              )
                            )
                          }
                        >
                          Prev
                        </button>
                        <span>page {tab.page + 1}</span>
                        <button
                          type="button"
                          className="rounded border px-2 py-0.5"
                          onClick={() =>
                            setTabs((list) =>
                              list.map((t) => (t.id === tab.id && t.kind === "data" ? { ...t, page: t.page + 1 } : t))
                            )
                          }
                        >
                          Next
                        </button>
                      </div>
                      <div className="min-h-0 flex-1">
                        <SqlResults
                          pane="results"
                          onPane={setBottom}
                          statements={dataStatements}
                          activeIndex={activeResult}
                          onActiveIndex={setActiveResult}
                          message={message}
                          history={history}
                          onOpenHistory={() => undefined}
                          onExportCsv={() =>
                            activeStatement &&
                            downloadText(
                              "result.csv",
                              toCsv(activeStatement.columns as Array<string>, activeStatement.rows as Array<Array<unknown>>),
                              "text/csv"
                            )
                          }
                          onExportJson={() =>
                            activeStatement &&
                            downloadText(
                              "result.json",
                              JSON.stringify(
                                (activeStatement.rows as Array<Array<unknown>>).map((row) =>
                                  Object.fromEntries(activeStatement.columns.map((c, i) => [c, row[i]]))
                                ),
                                null,
                                2
                              ),
                              "application/json"
                            )
                          }
                          editTable={tab.table}
                          onCellEdit={async (column, pkValue, value) => {
                            if (!active) return
                            const pk = tab.table.columns.find((c) => c.pk)
                            if (!pk) return
                            await runPromise(
                              Effect.gen(function* () {
                                const hub = yield* HubTag
                                const engine = yield* hub.get(active.id)
                                yield* engine.applyCellEdit({
                                  schema: tab.table.schema,
                                  table: tab.table.name,
                                  pkColumn: pk.name,
                                  pkValue,
                                  column,
                                  value
                                })
                                const sync = yield* SyncController
                                if (config.sync.trigger === "onChange") {
                                  yield* sync.notifyChange(
                                    active.id,
                                    config.sync.debounceMs,
                                    config.sync.format,
                                    active.engine,
                                    active.name
                                  )
                                }
                                setSnack("Cell updated")
                              })
                            )
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="p-6 text-sm opacity-70">Open a query tab</div>
                  )}
                </div>
              </div>
            </Panel>
            <PanelResizeHandle className="h-1 bg-[var(--mui-palette-divider)]" />
            <Panel defaultSize={32} minSize={18}>
              {tab?.kind === "data" ? (
                <TableSchemaView
                  table={
                    catalog?.tables.find(
                      (t) => t.schema === tab.table.schema && t.name === tab.table.name
                    ) ?? tab.table
                  }
                  ddl={tableDdl}
                />
              ) : (
                <SqlResults
                  pane={bottom}
                  onPane={setBottom}
                  statements={statements}
                  activeIndex={activeResult}
                  onActiveIndex={setActiveResult}
                  message={message}
                  history={history}
                  onOpenHistory={(sql) => {
                    const id = crypto.randomUUID()
                    setTabs((list) => [...list, { id, kind: "sql", title: "history.sql", sql }])
                    setActiveTab(id)
                  }}
                  onExportCsv={() =>
                    activeStatement &&
                    downloadText(
                      "result.csv",
                      toCsv(activeStatement.columns as Array<string>, activeStatement.rows as Array<Array<unknown>>),
                      "text/csv"
                    )
                  }
                  onExportJson={() =>
                    activeStatement &&
                    downloadText(
                      "result.json",
                      JSON.stringify(
                        (activeStatement.rows as Array<Array<unknown>>).map((row) =>
                          Object.fromEntries(activeStatement.columns.map((c, i) => [c, row[i]]))
                        ),
                        null,
                        2
                      ),
                      "application/json"
                    )
                  }
                />
              )}
            </Panel>
          </PanelGroup>
        </Panel>
      </PanelGroup>
      <div className="border-t px-3 py-1 text-xs opacity-80">{running ? "Running…" : message}</div>
      <SettingsDrawer
        open={settingsOpen}
        config={config}
        onChange={setConfig}
        onClose={() => setSettingsOpen(false)}
        onSave={() => {
          void withClient((client) => client.config.put({ payload: config })).then((saved) => {
            setConfig(saved)
            setSnack("Config saved")
            if (active && saved.sync.trigger === "interval") {
              runFork(
                Effect.gen(function* () {
                  const sync = yield* SyncController
                  yield* sync.startInterval(active.id, saved.sync.intervalSeconds, saved.sync.format, active.engine, active.name)
                })
              )
            }
          })
        }}
      />
      <SnippetPalette
        open={snippetsOpen}
        items={snippetItems}
        onClose={() => setSnippetsOpen(false)}
        onInsert={(sql) => {
          const ed = editorRef.current
          if (ed && tab?.kind === "sql") {
            const sel = ed.getSelection()
            if (sel) ed.executeEdits("snippet", [{ range: sel, text: sql }])
            else ed.setValue((ed.getValue() || "") + sql)
          }
          setSnippetsOpen(false)
        }}
      />
      <ParamsDialog
        open={Boolean(pendingSql)}
        names={paramNames}
        onCancel={() => setPendingSql(undefined)}
        onRun={(values) => {
          const sql = pendingSql
          setPendingSql(undefined)
          if (sql) executeSql(sql, values)
        }}
      />
      <Snackbar open={Boolean(snack)} autoHideDuration={2500} onClose={() => setSnack(undefined)} message={snack} />
    </div>
    </ThemeProvider>
  )
}
