import type { Catalog } from "@workbench/shared"
import { functionsFor, keywordsFor, lastKeywordContext, typesFor } from "@workbench/shared"
import type * as Monaco from "monaco-editor"

const registered = new Set<string>()

const monarch = (dialect: "pgsql" | "sqlite"): Monaco.languages.IMonarchLanguage => ({
  defaultToken: "",
  ignoreCase: true,
  keywords: [...keywordsFor(dialect)],
  typeKeywords: [...typesFor(dialect)],
  builtins: [...functionsFor(dialect)],
  tokenizer: {
    root: [
      [/--.*$/, "comment"],
      [/\/\*/, "comment", "@comment"],
      [/'([^'\\]|\\.)*'/, "string"],
      [/"([^"\\]|\\.)*"/, "string.sql"],
      [/[0-9]+(\.[0-9]+)?/, "number"],
      [
        /[a-zA-Z_][\w$]*/,
        {
          cases: {
            "@keywords": "keyword",
            "@typeKeywords": "type",
            "@builtins": "predefined",
            "@default": "identifier"
          }
        }
      ]
    ],
    comment: [
      [/\*\//, "comment", "@pop"],
      [/./, "comment"]
    ]
  }
})

export const registerSqlLanguages = (
  monaco: typeof Monaco,
  getCatalog: () => Catalog | undefined,
  getDialect: () => "pgsql" | "sqlite"
) => {
  for (const id of ["sql-pgsql", "sql-sqlite"] as const) {
    if (registered.has(id)) continue
    monaco.languages.register({ id })
    monaco.languages.setMonarchTokensProvider(id, monarch(id === "sql-pgsql" ? "pgsql" : "sqlite"))
    monaco.languages.setLanguageConfiguration(id, {
      comments: { lineComment: "--", blockComment: ["/*", "*/"] },
      brackets: [
        ["(", ")"],
        ["[", "]"]
      ],
      autoClosingPairs: [
        { open: "(", close: ")" },
        { open: "'", close: "'" },
        { open: "\"", close: "\"" }
      ]
    })
    monaco.languages.registerCompletionItemProvider(id, {
      triggerCharacters: [".", " "],
      provideCompletionItems(model, position) {
        const dialect = id === "sql-pgsql" ? "pgsql" : "sqlite"
        const text = model.getValueInRange({
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column
        })
        const ctx = lastKeywordContext(text)
        const range = {
          startLineNumber: position.lineNumber,
          startColumn: position.column - ctx.prefix.length,
          endLineNumber: position.lineNumber,
          endColumn: position.column
        }
        const catalog = getCatalog()
        const items: Array<Monaco.languages.CompletionItem> = []
        const add = (label: string, kind: Monaco.languages.CompletionItemKind, detail: string) => {
          if (ctx.prefix && !label.toLowerCase().startsWith(ctx.prefix.toLowerCase())) return
          items.push({ label, kind, insertText: label, range, detail })
        }
        if (ctx.kind !== "table") {
          for (const k of keywordsFor(dialect)) add(k, monaco.languages.CompletionItemKind.Keyword, "keyword")
          for (const fn of functionsFor(dialect)) add(fn, monaco.languages.CompletionItemKind.Function, "function")
        }
        if (catalog) {
          if (ctx.kind !== "column") {
            for (const table of catalog.tables) {
              add(table.name, monaco.languages.CompletionItemKind.Class, `${table.schema}.${table.kind}`)
            }
          }
          if (ctx.kind !== "table") {
            for (const table of catalog.tables) {
              for (const col of table.columns) {
                add(col.name, monaco.languages.CompletionItemKind.Field, `${table.name}.${col.type}`)
              }
            }
          }
        }
        void getDialect
        return { suggestions: items }
      }
    })
    monaco.languages.registerHoverProvider(id, {
      provideHover(model, position) {
        const word = model.getWordAtPosition(position)
        if (!word) return null
        const catalog = getCatalog()
        if (!catalog) return null
        for (const table of catalog.tables) {
          const col = table.columns.find((c) => c.name.toLowerCase() === word.word.toLowerCase())
          if (col) {
            return {
              contents: [
                { value: `**${table.name}.${col.name}**` },
                { value: `\`${col.type}\`${col.nullable ? " nullable" : ""}${col.pk ? " · primary key" : ""}` }
              ]
            }
          }
        }
        return null
      }
    })
    registered.add(id)
  }
}
