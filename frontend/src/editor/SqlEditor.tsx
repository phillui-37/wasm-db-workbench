import Editor from "@monaco-editor/react"
import type { Catalog, EditorTheme } from "@workbench/shared"
import type { editor } from "monaco-editor"
import { useEffect, useRef } from "react"
import { registerSqlLanguages } from "./register-sql.ts"
import { registerSolarizedThemes } from "./solarized.ts"

type Props = {
  tabId: string
  value: string
  dialect: "pgsql" | "sqlite"
  theme: EditorTheme
  fontSize: number
  tabSize: number
  catalog?: Catalog
  onChange: (tabId: string, value: string) => void
  onRun?: () => void
  onRunScript?: () => void
  onMount?: (ed: editor.IStandaloneCodeEditor) => void
}

const SYNC_DEBOUNCE_MS = 300
const viewStates = new Map<string, editor.ICodeEditorViewState | null>()
const models = new Map<string, editor.ITextModel>()

export const SqlEditor = ({
  tabId,
  value,
  dialect,
  theme,
  fontSize,
  tabSize,
  catalog,
  onChange,
  onRun,
  onRunScript,
  onMount
}: Props) => {
  const catalogRef = useRef(catalog)
  const dialectRef = useRef(dialect)
  const onRunRef = useRef(onRun)
  const onRunScriptRef = useRef(onRunScript)
  const onChangeRef = useRef(onChange)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const lastEmitted = useRef(value)
  const pending = useRef(value)
  const tabIdRef = useRef(tabId)
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null)
  const mountedValue = useRef(value)

  useEffect(() => {
    catalogRef.current = catalog
    dialectRef.current = dialect
    onRunRef.current = onRun
    onRunScriptRef.current = onRunScript
    onChangeRef.current = onChange
  }, [catalog, dialect, onRun, onRunScript, onChange])

  const languageFor = (d: "pgsql" | "sqlite") => (d === "pgsql" ? "sql-pgsql" : "sql-sqlite")

  const flush = (id: string, next: string) => {
    pending.current = next
    lastEmitted.current = next
    onChangeRef.current(id, next)
  }

  const modelFor = (id: string, text: string) => {
    const monaco = monacoRef.current
    const existing = models.get(id)
    if (existing && !existing.isDisposed()) return existing
    if (!monaco) return undefined
    const model = monaco.editor.createModel(text, languageFor(dialectRef.current))
    models.set(id, model)
    return model
  }

  const applyTab = (ed: editor.IStandaloneCodeEditor, nextId: string, nextValue: string) => {
    const prevId = tabIdRef.current
    if (prevId !== nextId) {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = undefined
      }
      flush(prevId, pending.current)
      viewStates.set(prevId, ed.saveViewState())
      tabIdRef.current = nextId
      const model = modelFor(nextId, nextValue)
      if (model) ed.setModel(model)
      else if (ed.getValue() !== nextValue) ed.setValue(nextValue)
      pending.current = ed.getValue()
      lastEmitted.current = pending.current
      const vs = viewStates.get(nextId)
      if (vs) ed.restoreViewState(vs)
      return
    }
    if (nextValue === lastEmitted.current || nextValue === ed.getValue()) {
      lastEmitted.current = nextValue
      pending.current = ed.getValue()
      return
    }
    const vs = ed.saveViewState()
    ed.setValue(nextValue)
    lastEmitted.current = nextValue
    pending.current = nextValue
    if (vs) ed.restoreViewState(vs)
  }

  useEffect(() => {
    const ed = editorRef.current
    if (!ed) return
    applyTab(ed, tabId, value)
  }, [tabId, value])

  useEffect(() => {
    const ed = editorRef.current
    const monaco = monacoRef.current
    if (!ed || !monaco) return
    const lang = languageFor(dialect)
    const model = ed.getModel()
    if (model && model.getLanguageId() !== lang) monaco.editor.setModelLanguage(model, lang)
  }, [dialect])

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      const ed = editorRef.current
      if (ed) {
        viewStates.set(tabIdRef.current, ed.saveViewState())
        flush(tabIdRef.current, pending.current)
      }
    },
    []
  )

  return (
    <Editor
      defaultValue={mountedValue.current}
      language={languageFor(dialect)}
      theme={theme}
      onChange={(next) => {
        const text = next ?? ""
        pending.current = text
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => flush(tabIdRef.current, text), SYNC_DEBOUNCE_MS)
      }}
      beforeMount={(monaco) => {
        monacoRef.current = monaco
        registerSolarizedThemes(monaco)
        registerSqlLanguages(monaco, () => catalogRef.current, () => dialectRef.current)
      }}
      onMount={(ed, monaco) => {
        monacoRef.current = monaco
        editorRef.current = ed
        tabIdRef.current = tabId
        lastEmitted.current = value
        pending.current = value
        const model = modelFor(tabId, value)
        if (model && ed.getModel() !== model) ed.setModel(model)
        else if (ed.getValue() !== value) ed.setValue(value)
        const vs = viewStates.get(tabId)
        if (vs) ed.restoreViewState(vs)
        ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
          flush(tabIdRef.current, ed.getValue())
          onRunRef.current?.()
        })
        ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => {
          flush(tabIdRef.current, ed.getValue())
          onRunScriptRef.current?.()
        })
        ed.onDidBlurEditorWidget(() => flush(tabIdRef.current, ed.getValue()))
        onMount?.(ed)
      }}
      options={{
        minimap: { enabled: false },
        fontSize,
        tabSize,
        automaticLayout: true,
        wordWrap: "on",
        fontFamily: "JetBrains Mono, Consolas, monospace",
        scrollBeyondLastLine: false,
        fixedOverflowWidgets: true
      }}
    />
  )
}
