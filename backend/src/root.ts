import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

export const repoRoot = resolve(dirname(fileURLToPath(new URL(".", import.meta.url))), "..")
