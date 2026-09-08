import ExpandMore from "@mui/icons-material/ExpandMore"
import { Typography } from "@mui/material"
import { useState, type ReactNode } from "react"

type Props = {
  id: string
  title: string
  children: ReactNode
}

const loadOpen = (id: string) => {
  try {
    return localStorage.getItem(`workbench.section.${id}`) !== "0"
  } catch {
    return true
  }
}

export const SideSection = ({ id, title, children }: Props) => {
  const [open, setOpen] = useState(() => loadOpen(id))
  const toggle = () => {
    setOpen((prev) => {
      const next = !prev
      try {
        localStorage.setItem(`workbench.section.${id}`, next ? "1" : "0")
      } catch {
        undefined
      }
      return next
    })
  }
  return (
    <section className="mt-2 first:mt-0">
      <button type="button" className="flex w-full items-center gap-1 py-0.5 text-left" onClick={toggle}>
        <ExpandMore
          fontSize="small"
          className={`transition-transform ${open ? "rotate-0" : "-rotate-90"}`}
        />
        <Typography variant="overline" color="text.secondary">
          {title}
        </Typography>
      </button>
      {open ? children : null}
    </section>
  )
}
