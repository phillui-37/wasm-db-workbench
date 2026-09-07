import Editor from "@monaco-editor/react"
import type { Catalog } from "@workbench/shared"
import type { editor } from "monaco-editor"
import { useEffect, useRef } from "react"
import { registerSqlLanguages } from "./register-sql.ts"

type Props = {
  value: string
  dialect: "pgsql" | "sqlite"
  theme: "vs-dark" | "vs"
  fontSize: number
  tabSize: number
  catalog?: Catalog
  onChange: (value: string) => void
  onMount?: (ed: editor.IStandaloneCodeEditor) => void
}

export const SqlEditor = ({ value, dialect, theme, fontSize, tabSize, catalog, onChange, onMount }: Props) => {
  const catalogRef = useRef(catalog)
  const dialectRef = useRef(dialect)
  useEffect(() => {
    catalogRef.current = catalog
    dialectRef.current = dialect
  }, [catalog, dialect])

  return (
    <Editor
      value={value}
      language={dialect === "pgsql" ? "sql-pgsql" : "sql-sqlite"}
      theme={theme}
      onChange={(next) => onChange(next ?? "")}
      beforeMount={(monaco) => {
        registerSqlLanguages(monaco, () => catalogRef.current, () => dialectRef.current)
      }}
      onMount={(ed) => onMount?.(ed)}
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
