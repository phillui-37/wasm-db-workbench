import { Workbench } from "./components/Workbench.tsx"
import { StyledEngineProvider } from "@mui/material/styles"

export const App = () => (
  <StyledEngineProvider injectFirst>
    <Workbench />
  </StyledEngineProvider>
)
