import type { editor } from "monaco-editor"

/** Classic Solarized palette — https://ethanschoonover.com/solarized/ */
const S = {
  base03: "#002b36",
  base02: "#073642",
  base01: "#586e75",
  base00: "#657b83",
  base0: "#839496",
  base1: "#93a1a1",
  base2: "#eee8d5",
  base3: "#fdf6e3",
  yellow: "#b58900",
  orange: "#cb4b16",
  red: "#dc322f",
  magenta: "#d33682",
  violet: "#6c71c4",
  blue: "#268bd2",
  cyan: "#2aa198",
  green: "#859900"
} as const

export const registerSolarizedThemes = (monaco: {
  editor: { defineTheme: (name: string, theme: editor.IStandaloneThemeData) => void }
}) => {
  monaco.editor.defineTheme("solarized-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "", foreground: S.base0.slice(1) },
      { token: "comment", foreground: S.base01.slice(1), fontStyle: "italic" },
      { token: "string", foreground: S.cyan.slice(1) },
      { token: "string.sql", foreground: S.cyan.slice(1) },
      { token: "number", foreground: S.magenta.slice(1) },
      { token: "keyword", foreground: S.green.slice(1) },
      { token: "predefined", foreground: S.violet.slice(1) },
      { token: "operator", foreground: S.base0.slice(1) },
      { token: "type", foreground: S.yellow.slice(1) },
      { token: "identifier", foreground: S.blue.slice(1) }
    ],
    colors: {
      "editor.background": S.base03,
      "editor.foreground": S.base0,
      "editorLineNumber.foreground": S.base01,
      "editorLineNumber.activeForeground": S.base0,
      "editorCursor.foreground": S.base1,
      "editor.selectionBackground": S.base02,
      "editor.inactiveSelectionBackground": "#07364299",
      "editor.lineHighlightBackground": S.base02,
      "editorIndentGuide.background": S.base02,
      "editorWidget.background": S.base02,
      "editorSuggestWidget.background": S.base02,
      "editorSuggestWidget.border": S.base01,
      "scrollbarSlider.background": "#586e7580",
      "scrollbarSlider.hoverBackground": "#83949680"
    }
  })

  monaco.editor.defineTheme("solarized-light", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "", foreground: S.base00.slice(1) },
      { token: "comment", foreground: S.base1.slice(1), fontStyle: "italic" },
      { token: "string", foreground: S.cyan.slice(1) },
      { token: "string.sql", foreground: S.cyan.slice(1) },
      { token: "number", foreground: S.magenta.slice(1) },
      { token: "keyword", foreground: S.green.slice(1) },
      { token: "predefined", foreground: S.violet.slice(1) },
      { token: "operator", foreground: S.base00.slice(1) },
      { token: "type", foreground: S.yellow.slice(1) },
      { token: "identifier", foreground: S.blue.slice(1) }
    ],
    colors: {
      "editor.background": S.base3,
      "editor.foreground": S.base00,
      "editorLineNumber.foreground": S.base1,
      "editorLineNumber.activeForeground": S.base00,
      "editorCursor.foreground": S.base01,
      "editor.selectionBackground": S.base2,
      "editor.inactiveSelectionBackground": "#eee8d599",
      "editor.lineHighlightBackground": S.base2,
      "editorIndentGuide.background": S.base2,
      "editorWidget.background": S.base2,
      "editorSuggestWidget.background": S.base3,
      "editorSuggestWidget.border": S.base1,
      "scrollbarSlider.background": "#93a1a180",
      "scrollbarSlider.hoverBackground": "#657b8380"
    }
  })
}
