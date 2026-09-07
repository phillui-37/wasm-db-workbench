import Editor from "@monaco-editor/react"
import type { Catalog, EditorTheme } from "@workbench/shared"
import type { editor } from "monaco-editor"
import { useEffect, useRef } from "react"
import { registerSqlLanguages } from "./register-sql.ts"
import { registerSolarizedThemes } from "./solarized.ts"

type Props = {
  value: string
  dialect: "pgsql" | "sqlite"
  theme: EditorTheme
  fontSize: number
  tabSize: number
  catalog?: Catalog
  onChange: (value: string) => void
  onRun?: () => void
  onRunScript?: () => void
  onMount?: (ed: editor.IStandaloneCodeEditor) => void
}

const SYNC_DEBOUNCE_MS = 300

export const SqlEditor = ({
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

  useEffect(() => {
    catalogRef.current = catalog
    dialectRef.current = dialect
    onRunRef.current = onRun
    onRunScriptRef.current = onRunScript
    onChangeRef.current = onChange
  }, [catalog, dialect, onRun, onRunScript, onChange])

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    },
    []
  )

  const flush = (next: string) => {
    if (next === lastEmitted.current) return
    lastEmitted.current = next
    onChangeRef.current(next)
  }

  return (
    <Editor
      value={value}
      language={dialect === "pgsql" ? "sql-pgsql" : "sql-sqlite"}
      theme={theme}
      onChange={(next) => {
        const text = next ?? ""
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => flush(text), SYNC_DEBOUNCE_MS)
      }}
      beforeMount={(monaco) => {
        registerSolarizedThemes(monaco)
        registerSqlLanguages(monaco, () => catalogRef.current, () => dialectRef.current)
      }}
      onMount={(ed, monaco) => {
        ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
          flush(ed.getValue())
          onRunRef.current?.()
        })
        ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => {
          flush(ed.getValue())
          onRunScriptRef.current?.()
        })
        ed.onDidBlurEditorWidget(() => flush(ed.getValue()))
        onMount?.(ed)
      }}
      options={{
        minimap: { enabled: false },
        fontSize,
        tabSize,
        automaticLayout: true,
        wordWrap: "on",
        fontFamily: "JetBrains Mono, Consolas, monospace",
        scrollBeyondLastLine: false
      }}
    />
  )
}
