import { FileSystem } from "@effect/platform"
import { Option } from "effect"

export const mtimeMs = (info: FileSystem.File.Info): number =>
  Option.match(info.mtime, {
    onNone: () => 0,
    onSome: (d) => d.getTime()
  })

export const sizeNum = (info: FileSystem.File.Info): number => Number(info.size)
