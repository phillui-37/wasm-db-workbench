import type { ConnectionMeta } from "./schema/models.ts"

export const HOST_DUMP_FILES = new Set(["dump.sql", "db.sqlite", "pgdata.tar.gz", "meta.json"])

export const isHostDumpFile = (name: string): boolean => HOST_DUMP_FILES.has(name)

export const connectionSlug = (name: string): string => {
  const slug = name.trim().replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "")
  return slug || "db"
}

const SESSION_SUFFIX = /_[a-z0-9]{4}$/i

const stripSession = (value: string): string => {
  const trimmed = value.trim()
  return SESSION_SUFFIX.test(trimmed) ? trimmed.replace(SESSION_SUFFIX, "") : trimmed
}

export const workspaceId = (id: string, name?: string): string => {
  if (name?.trim()) return connectionSlug(stripSession(name) || name)
  return connectionSlug(stripSession(id) || id)
}

export const findExistingConnection = (
  list: ReadonlyArray<ConnectionMeta>,
  name: string
): ConnectionMeta | undefined => {
  const id = connectionSlug(name)
  return (
    list.find((item) => item.id === id) ??
    list.find((item) => item.name === name) ??
    list.find((item) => workspaceId(item.id, item.name) === id)
  )
}

export const connectionsFingerprint = (list: ReadonlyArray<ConnectionMeta>): string =>
  list
    .map((item) => `${item.id}:${item.name}:${item.engine}`)
    .sort()
    .join("|")
