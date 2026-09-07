import { createTheme, type Theme } from "@mui/material/styles"
import type { EditorTheme } from "@workbench/shared"

const baseComponents = {
  MuiButton: { defaultProps: { size: "small" as const } },
  MuiTextField: { defaultProps: { size: "small" as const } },
  MuiSelect: { defaultProps: { size: "small" as const } },
  MuiIconButton: { defaultProps: { size: "small" as const } }
}

const typography = {
  fontFamily: "Segoe UI, system-ui, sans-serif",
  fontSize: 13
}

const darkTheme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#7aa2f7" },
    background: {
      default: "#1e1f22",
      paper: "#2b2d30"
    }
  },
  typography,
  components: baseComponents
})

const lightTheme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#3b5bdb" },
    background: {
      default: "#f2f3f5",
      paper: "#ffffff"
    }
  },
  typography,
  components: baseComponents
})

const solarizedDarkTheme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#268bd2" },
    secondary: { main: "#2aa198" },
    error: { main: "#dc322f" },
    warning: { main: "#b58900" },
    info: { main: "#268bd2" },
    success: { main: "#859900" },
    background: {
      default: "#002b36",
      paper: "#073642"
    },
    text: {
      primary: "#839496",
      secondary: "#586e75"
    },
    divider: "#586e75"
  },
  typography,
  components: baseComponents
})

const solarizedLightTheme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#268bd2" },
    secondary: { main: "#2aa198" },
    error: { main: "#dc322f" },
    warning: { main: "#b58900" },
    info: { main: "#268bd2" },
    success: { main: "#859900" },
    background: {
      default: "#fdf6e3",
      paper: "#eee8d5"
    },
    text: {
      primary: "#657b83",
      secondary: "#93a1a1"
    },
    divider: "#93a1a1"
  },
  typography,
  components: baseComponents
})

export const workbenchTheme = (editorTheme: EditorTheme): Theme => {
  switch (editorTheme) {
    case "solarized-dark":
      return solarizedDarkTheme
    case "solarized-light":
      return solarizedLightTheme
    case "vs":
      return lightTheme
    default:
      return darkTheme
  }
}
