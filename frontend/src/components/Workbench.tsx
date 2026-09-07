import { FetchHttpClient, HttpApiClient } from "@effect/platform"
import {
  ConnectionHub,
  applyMaxRows,
  defaultAppConfig,
  isDestructiveSql,
  isWriteSql,
  qualifyTable,
  WorkbenchApi,
  type AppConfig,
  type Catalog,
  type ConnectionMeta,
  type EngineType,
  type HistoryEntry,
  type QueryResult,
  type Script,
  type Table
} from "@workbench/shared"
import { Effect, Fiber } from "effect"
import { useEffect, useMemo, useRef, useState } from "react"
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels"
import { SqlEditor } from "../editor/SqlEditor.tsx"
import { downloadBytes, downloadText, toCsv } from "../engines/dump.ts"
import { openEngine } from "../engines/hub.ts"
import { ConnectionHub as HubTag, runFork, SyncController, workbenchRuntime } from "../runtime.ts"
import { HealthBadge } from "../atoms.tsx"
import { ResultsGrid } from "./ResultsGrid.tsx"
import { SettingsPanel } from "./SettingsPanel.tsx"

type Tab =
  | { id: string; kind: "sql"; title: string; sql: string }
  | { id: string; kind: "data"; title: string; table: Table; page: number }

const loadConnections = (): Array<ConnectionMeta> => {
  try {
    return JSON.parse(localStorage.getItem("workbench.connections") ?? "[]") as Array<ConnectionMeta>
  } catch {
    return []
  }
}

const saveConnections = (list: Array<ConnectionMeta>) => {
  localStorage.setItem("workbench.connections", JSON.stringify(list))
}

const ACTIVE_ID_KEY = "workbench.activeId"

const loadActiveId = (): string | undefined => localStorage.getItem(ACTIVE_ID_KEY) ?? undefined

const slug = (name: string) =>
  `${name.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "db"}_${Math.random().toString(36).slice(2, 6)}`

export const Workbench = () => {
  const [config, setConfig] = useState<AppConfig>(defaultAppConfig)
  const [connections, setConnections] = useState<Array<ConnectionMeta>>(loadConnections)
  const [activeId, setActiveId] = useState<string | undefined>(() => {
    const saved = loadActiveId()
    const list = loadConnections()
    return list.some((c) => c.id === saved) ? saved : list[0]?.id
  })
  const [catalog, setCatalog] = useState<Catalog | undefined>()
  const [tabs, setTabs] = useState<Array<Tab>>([{ id: "q1", kind: "sql", title: "query.sql", sql: "SELECT 1;\n" }])
  const [activeTab, setActiveTab] = useState("q1")
  const [result, setResult] = useState<QueryResult | undefined>()
  const [message, setMessage] = useState("Ready")
  const [running, setRunning] = useState(false)
  const [history, setHistory] = useState<Array<HistoryEntry>>([])
  const [scripts, setScripts] = useState<Array<Script>>([])
  const [bottom, setBottom] = useState<"results" | "messages" | "history">("results")
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [newName, setNewName] = useState("local")
  const [newEngine, setNewEngine] = useState<EngineType>("pglite")
  const fiberRef = useRef<Fiber.RuntimeFiber<unknown, unknown> | null>(null)
  const editorRef = useRef<{ getSelectionSql: () => string | undefined; getValue: () => string } | null>(null)
  const configRef = useRef(config)
  configRef.current = config
  const autoOpened = useRef(false)

  const active = connections.find((c) => c.id === activeId)
  const dialect = active?.engine === "sqlite" ? "sqlite" : "pgsql"
  const tab = tabs.find((t) => t.id === activeTab)

  const api = <A, E>(effect: Effect.Effect<A, E>) =>
    workbenchRuntime.runPromise(effect.pipe(Effect.provide(FetchHttpClient.layer)) as Effect.Effect<A, E>)

  const withClient = <A, E>(
    use: (
      client: Awaited<ReturnType<typeof workbenchRuntime.runPromise<HttpApiClient.Client<typeof WorkbenchApi>, never>>>
    ) => Effect.Effect<A, E>
  ) =>
    api(
      Effect.gen(function* () {
        const client = yield* HttpApiClient.make(WorkbenchApi, { baseUrl: "" })
        return yield* use(client as never)
      })
    )

  const refreshCatalog = (id: string) =>
    runFork(
      Effect.gen(function* () {
        const hub = yield* HubTag
        const engine = yield* hub.get(id)
        const next = yield* engine.introspect
        setCatalog(next)
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
        yield* sync.startInterval(meta.id, cfg.sync.intervalSeconds, cfg.sync.format, meta.engine)
      }
      if (cfg.sync.pullOnOpen !== "never") {
        const client = yield* HttpApiClient.make(WorkbenchApi, { baseUrl: "" })
        const files = yield* client.sync.files({ path: { connectionId: meta.id } }).pipe(
          Effect.orElseSucceed(() => [] as Array<{ name: string }>)
        )
        if (files.length > 0) {
          const shouldPull =
            cfg.sync.pullOnOpen === "always" ||
            (cfg.sync.pullOnOpen === "prompt" && confirm(`Pull host dump for ${meta.name}?`))
          if (shouldPull) {
            yield* sync.pull(meta.id).pipe(Effect.ignore)
          }
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
      })
    )
      .then(() => {
        if (autoOpened.current) return
        autoOpened.current = true
        const list = loadConnections()
        const saved = loadActiveId()
        const meta = list.find((c) => c.id === saved) ?? list[0]
        if (meta) selectConnection(meta)
      })
      .catch(() => undefined)
  }, [])

  const createConnection = () => {
    if (!config.engines[newEngine].enabled) {
      setMessage(`${newEngine} is disabled in config`)
      return
    }
    const meta: ConnectionMeta = { id: slug(newName), name: newName, engine: newEngine }
    const next = [...connections, meta]
    setConnections(next)
    selectConnection(meta)
  }

  const runSql = (sql: string) => {
    if (!active) {
      setMessage("Create a connection first")
      return
    }
    if (config.query.confirmDestructive && isDestructiveSql(sql) && !confirm("Run destructive SQL?")) return
    setRunning(true)
    setBottom("results")
    const started = Date.now()
    const program = Effect.gen(function* () {
      const hub = yield* HubTag
      const engine = yield* hub.get(active.id)
      const result = yield* engine.query(applyMaxRows(sql, configRef.current.query.maxRows))
      setResult(result)
      setMessage(`OK · ${result.rowCount} rows · ${result.durationMs} ms`)
      const client = yield* HttpApiClient.make(WorkbenchApi, { baseUrl: "" })
      const entry = yield* client.history.append({
        path: { connectionId: active.id },
        payload: { sql, durationMs: result.durationMs, ok: true, rowCount: result.rowCount }
      })
      setHistory((h) => [entry, ...h])
      if (isWriteSql(sql)) {
        const cat = yield* engine.introspect
        setCatalog(cat)
      }
      const sync = yield* SyncController
      if (configRef.current.sync.trigger === "onChange" && isWriteSql(sql)) {
        yield* sync.notifyChange(active.id, configRef.current.sync.debounceMs, configRef.current.sync.format, active.engine)
      }
    }).pipe(
      Effect.provide(FetchHttpClient.layer),
      Effect.catchAll((e) =>
        Effect.gen(function* () {
          setMessage(String(e))
          setBottom("messages")
          const client = yield* HttpApiClient.make(WorkbenchApi, { baseUrl: "" })
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

  const cancel = () => {
    if (fiberRef.current) runFork(Fiber.interrupt(fiberRef.current))
    setRunning(false)
    setMessage("Cancelled")
  }

  const saveScript = () => {
    if (!active || tab?.kind !== "sql") return
    const name = prompt("Script name", tab.title.replace(/\.sql$/, ""))
    if (!name) return
    void withClient((client) =>
      client.scripts.put({ path: { connectionId: active.id, name }, payload: { sql: tab.sql } })
    ).then((s) => {
      setScripts((list) => [...list.filter((x) => x.name !== s.name), s])
      setMessage(`Saved ${s.name}.sql`)
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
    runFork(
      Effect.gen(function* () {
        const hub = yield* HubTag
        const engine = yield* hub.get(active.id)
        const res = yield* engine.query(`SELECT * FROM ${qtable} LIMIT ${config.query.maxRows} OFFSET ${offset}`)
        setResult(res)
      }).pipe(Effect.catchAll((e) => Effect.sync(() => setMessage(String(e)))))
    )
  }, [activeId, dataPage?.id, dataPage?.page, config.query.maxRows])

  const groupedTables = useMemo(() => {
    const map = new Map<string, Array<Table>>()
    for (const table of catalog?.tables ?? []) {
      const list = map.get(table.schema) ?? []
      list.push(table)
      map.set(table.schema, list)
    }
    return [...map.entries()]
  }, [catalog])

  return (
    <div className={`app ${config.editor.theme}`}>
      <header className="topbar">
        <strong>WASM SQL Workbench</strong>
        <HealthBadge />
        <span className="muted">{active ? `${active.name} · ${active.engine}` : "no connection"}</span>
        <div className="spacer" />
        <button type="button" disabled={!active || running} onClick={() => {
          if (tab?.kind === "sql") {
            const selected = editorRef.current?.getSelectionSql()
            runSql((selected && selected.trim()) || editorRef.current?.getValue() || tab.sql)
          }
        }}>
          Run
        </button>
        <button type="button" disabled={!running} onClick={cancel}>
          Cancel
        </button>
        <button type="button" disabled={!active} onClick={saveScript}>
          Save script
        </button>
        <button
          type="button"
          disabled={!active}
          onClick={() =>
            active &&
            runFork(
              Effect.gen(function* () {
                const sync = yield* SyncController
                yield* sync.push(active.id, config.sync.format, active.engine)
                setMessage("Synced to host")
              }).pipe(Effect.catchAll((e) => Effect.sync(() => setMessage(String(e)))))
            )
          }
        >
          Sync
        </button>
        <button
          type="button"
          disabled={!active}
          onClick={() =>
            active &&
            runFork(
              Effect.gen(function* () {
                const sync = yield* SyncController
                yield* sync.pull(active.id)
                refreshCatalog(active.id)
                setMessage("Pulled from host")
              }).pipe(Effect.catchAll((e) => Effect.sync(() => setMessage(String(e)))))
            )
          }
        >
          Pull
        </button>
        <button
          type="button"
          disabled={!active}
          onClick={() =>
            active &&
            runFork(
              Effect.gen(function* () {
                const hub = yield* HubTag
                const engine = yield* hub.get(active.id)
                const sql = yield* engine.exportSql
                downloadText(`${active.name}.sql`, sql, "application/sql")
              }).pipe(Effect.catchAll((e) => Effect.sync(() => setMessage(String(e)))))
            )
          }
        >
          Export SQL
        </button>
        <button
          type="button"
          disabled={!active}
          onClick={() =>
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
        >
          Export DB
        </button>
        <label className="file">
          Import
          <input
            type="file"
            onChange={(ev) => {
              const file = ev.target.files?.[0]
              if (!file || !active) return
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
                    setMessage(`Imported ${file.name}`)
                  }).pipe(Effect.catchAll((e) => Effect.sync(() => setMessage(String(e)))))
                )
              })
            }}
          />
        </label>
        <button type="button" onClick={() => setSettingsOpen(true)}>
          Settings
        </button>
      </header>
      <PanelGroup direction="horizontal" className="body">
        <Panel defaultSize={18} minSize={12} className="sidebar">
          <section>
            <h3>Connections</h3>
            <div className="new-conn">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="name" />
              <select value={newEngine} onChange={(e) => setNewEngine(e.target.value as EngineType)}>
                {config.engines.pglite.enabled ? <option value="pglite">PGlite</option> : null}
                {config.engines.sqlite.enabled ? <option value="sqlite">SQLite</option> : null}
              </select>
              <button type="button" onClick={createConnection}>
                New
              </button>
            </div>
            <ul>
              {connections.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={c.id === activeId ? "active" : ""}
                    onClick={() => selectConnection(c)}
                  >
                    {c.name}
                    <span className="muted">{c.engine}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3>Schema</h3>
            {groupedTables.map(([schema, tables]) => (
              <div key={schema} className="schema">
                <div className="schema-name">{schema}</div>
                {tables.map((table) => (
                  <details key={`${table.schema}.${table.name}`}>
                    <summary>
                      <button type="button" className="link" onClick={() => openTable(table)}>
                        {table.name}
                      </button>
                      <span className="muted">{table.kind}</span>
                    </summary>
                    <ul className="cols">
                      {table.columns.map((col) => (
                        <li key={col.name}>
                          {col.name}
                          <span className="muted">
                            {col.type}
                            {col.pk ? " pk" : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
              </div>
            ))}
          </section>
          <section>
            <h3>Scripts</h3>
            <ul>
              {scripts.map((s) => (
                <li key={s.name}>
                  <button
                    type="button"
                    onClick={() => {
                      const id = crypto.randomUUID()
                      setTabs((list) => [...list, { id, kind: "sql", title: `${s.name}.sql`, sql: s.sql }])
                      setActiveTab(id)
                    }}
                  >
                    {s.name}.sql
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </Panel>
        <PanelResizeHandle className="sep" />
        <Panel minSize={40}>
          <PanelGroup direction="vertical">
            <Panel minSize={30}>
              <div className="tabs">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={t.id === activeTab ? "active" : ""}
                    onClick={() => setActiveTab(t.id)}
                  >
                    {t.title}
                    <span
                      className="x"
                      onClick={(e) => {
                        e.stopPropagation()
                        setTabs((list) => list.filter((x) => x.id !== t.id))
                        if (activeTab === t.id) setActiveTab(tabs.find((x) => x.id !== t.id)?.id ?? "")
                      }}
                    >
                      ×
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    const id = crypto.randomUUID()
                    setTabs((list) => [...list, { id, kind: "sql", title: `query${list.length + 1}.sql`, sql: "" }])
                    setActiveTab(id)
                  }}
                >
                  +
                </button>
              </div>
              <div className="editor">
                {tab?.kind === "sql" ? (
                  <SqlEditor
                    value={tab.sql}
                    dialect={dialect}
                    theme={config.editor.theme}
                    fontSize={config.editor.fontSize}
                    tabSize={config.editor.tabSize}
                    catalog={catalog}
                    onChange={(sql) =>
                      setTabs((list) => list.map((t) => (t.id === tab.id && t.kind === "sql" ? { ...t, sql } : t)))
                    }
                    onMount={(ed) => {
                      editorRef.current = {
                        getSelectionSql: () => {
                          const sel = ed.getModel()?.getValueInRange(ed.getSelection()!)
                          return sel
                        },
                        getValue: () => ed.getModel()?.getValue() ?? ""
                      }
                    }}
                  />
                ) : tab?.kind === "data" ? (
                  <div className="table-data">
                    <div className="grid-toolbar">
                      <span>
                        {tab.table.schema}.{tab.table.name}
                      </span>
                      <button
                        type="button"
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
                        onClick={() =>
                          setTabs((list) =>
                            list.map((t) => (t.id === tab.id && t.kind === "data" ? { ...t, page: t.page + 1 } : t))
                          )
                        }
                      >
                        Next
                      </button>
                    </div>
                    <div className="grid-scroll">
                      <table>
                        <thead>
                          <tr>
                            {(result?.columns ?? []).map((c) => (
                              <th key={c}>{c}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(result?.rows ?? []).map((row, i) => (
                            <tr key={i}>
                              {row.map((cell, j) => {
                                const col = tab.table.columns[j]
                                const pk = tab.table.columns.find((c) => c.pk)
                                return (
                                  <td key={j}>
                                    <input
                                      defaultValue={cell === null || cell === undefined ? "" : String(cell)}
                                      onBlur={(e) => {
                                        if (!active || !col || !pk) return
                                        const pkIndex = tab.table.columns.findIndex((c) => c.pk)
                                        const pkValue = row[pkIndex]
                                        runFork(
                                          Effect.gen(function* () {
                                            const hub = yield* HubTag
                                            const engine = yield* hub.get(active.id)
                                            yield* engine.applyCellEdit({
                                              schema: tab.table.schema,
                                              table: tab.table.name,
                                              pkColumn: pk.name,
                                              pkValue,
                                              column: col.name,
                                              value: e.target.value
                                            })
                                            const sync = yield* SyncController
                                            if (config.sync.trigger === "onChange") {
                                              yield* sync.notifyChange(
                                                active.id,
                                                config.sync.debounceMs,
                                                config.sync.format,
                                                active.engine
                                              )
                                            }
                                            setMessage("Cell updated")
                                          }).pipe(Effect.catchAll((err) => Effect.sync(() => setMessage(String(err)))))
                                        )
                                      }}
                                    />
                                  </td>
                                )
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="empty">Open a query tab</div>
                )}
              </div>
            </Panel>
            <PanelResizeHandle className="sep" />
            <Panel defaultSize={32} minSize={18} className="bottom">
              <div className="tabs">
                {(["results", "messages", "history"] as const).map((id) => (
                  <button key={id} type="button" className={bottom === id ? "active" : ""} onClick={() => setBottom(id)}>
                    {id}
                  </button>
                ))}
              </div>
              {bottom === "results" && result ? (
                <ResultsGrid
                  columns={result.columns}
                  rows={result.rows as Array<Array<unknown>>}
                  onExportCsv={() => downloadText("result.csv", toCsv(result.columns, result.rows as Array<Array<unknown>>), "text/csv")}
                  onExportJson={() =>
                    downloadText(
                      "result.json",
                      JSON.stringify(
                        (result.rows as Array<Array<unknown>>).map((row) =>
                          Object.fromEntries(result.columns.map((c, i) => [c, row[i]]))
                        ),
                        null,
                        2
                      ),
                      "application/json"
                    )
                  }
                />
              ) : bottom === "history" ? (
                <ul className="history">
                  {history.map((h) => (
                    <li key={h.id}>
                      <button
                        type="button"
                        onClick={() => {
                          const id = crypto.randomUUID()
                          setTabs((list) => [...list, { id, kind: "sql", title: "history.sql", sql: h.sql }])
                          setActiveTab(id)
                        }}
                      >
                        <span className={h.ok ? "ok" : "err"}>{h.ok ? "OK" : "ERR"}</span>
                        {h.sql.slice(0, 80)}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <pre className="messages">{message}</pre>
              )}
            </Panel>
          </PanelGroup>
        </Panel>
      </PanelGroup>
      {settingsOpen ? (
        <SettingsPanel
          config={config}
          onChange={setConfig}
          onClose={() => setSettingsOpen(false)}
          onSave={() => {
            void withClient((client) => client.config.put({ payload: config })).then((saved) => {
              setConfig(saved)
              setMessage("Config saved")
              if (active && saved.sync.trigger === "interval") {
                runFork(
                  Effect.gen(function* () {
                    const sync = yield* SyncController
                    yield* sync.startInterval(
                      active.id,
                      saved.sync.intervalSeconds,
                      saved.sync.format,
                      active.engine
                    )
                  })
                )
              }
            })
          }}
        />
      ) : null}
      <footer className="status">{running ? "Running…" : message}</footer>
    </div>
  )
}
