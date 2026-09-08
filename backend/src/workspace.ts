import { FileSystem, Path } from "@effect/platform"
import { isHostDumpFile, isHostPayloadFile, workspaceId, type EngineType } from "@workbench/shared"
import { Effect } from "effect"
import { mtimeMs } from "./fs-meta.ts"

export type WorkspaceHit = {
  readonly id: string
  readonly dir: string
  readonly name: string
  readonly engine: EngineType
  readonly updatedAt: number
}

const isEngine = (value: unknown): value is EngineType => value === "pglite" || value === "sqlite"

export const listChildDirs = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  root: string
): Effect.Effect<Array<string>, never> =>
  Effect.gen(function* () {
    const names = yield* fs.readDirectory(root).pipe(Effect.orElseSucceed(() => [] as Array<string>))
    const out: Array<string> = []
    for (const name of names) {
      if (name.startsWith("_") || name.startsWith(".")) continue
      if (!/^[A-Za-z0-9._-]+$/.test(name)) continue
      const info = yield* fs.stat(path.join(root, name)).pipe(Effect.orElseSucceed(() => undefined))
      if (info?.type === "Directory") out.push(name)
    }
    return out
  })

export const readWorkspaceMeta = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  dir: string,
  fallbackId: string
): Effect.Effect<{ name: string; engine: EngineType; updatedAt: number }> =>
  Effect.gen(function* () {
    const raw = yield* fs.readFileString(path.join(dir, "meta.json")).pipe(Effect.orElseSucceed(() => ""))
    let name = fallbackId
    let engine: EngineType = "pglite"
    let updatedAt = 0
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { name?: unknown; engine?: unknown; updatedAt?: unknown }
        if (typeof parsed.name === "string" && parsed.name) name = parsed.name
        if (isEngine(parsed.engine)) engine = parsed.engine
        if (typeof parsed.updatedAt === "number") updatedAt = parsed.updatedAt
      } catch {
        undefined
      }
    }
    if (updatedAt === 0) {
      const info = yield* fs.stat(dir).pipe(Effect.orElseSucceed(() => undefined))
      updatedAt = info ? mtimeMs(info) : 0
    }
    return { name, engine, updatedAt }
  })

export const workspaceCandidates = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  root: string,
  workspace: string
): Effect.Effect<Array<WorkspaceHit>, never> =>
  Effect.gen(function* () {
    const names = yield* listChildDirs(fs, path, root)
    const hits: Array<WorkspaceHit> = []
    for (const id of names) {
      const dir = path.join(root, id)
      const meta = yield* readWorkspaceMeta(fs, path, dir, id)
      if (id !== workspace && workspaceId(id, meta.name) !== workspace) continue
      hits.push({ id, dir, name: meta.name, engine: meta.engine, updatedAt: meta.updatedAt })
    }
    hits.sort((a, b) => b.updatedAt - a.updatedAt)
    const exact = hits.find((hit) => hit.id === workspace)
    if (!exact) return hits
    return [exact, ...hits.filter((hit) => hit.id !== workspace)]
  })

export const resolveWorkspaceDir = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  root: string,
  workspace: string
): Effect.Effect<string | undefined, never> =>
  Effect.gen(function* () {
    const hits = yield* workspaceCandidates(fs, path, root, workspace)
    for (const hit of hits) {
      const entries = yield* fs.readDirectory(hit.dir).pipe(Effect.orElseSucceed(() => [] as Array<string>))
      if (entries.some((file) => isHostPayloadFile(file))) return hit.dir
    }
    return hits[0]?.dir
  })

export const hostedWorkspaces = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  root: string
): Effect.Effect<Array<WorkspaceHit>, never> =>
  Effect.gen(function* () {
    const names = yield* listChildDirs(fs, path, root)
    const groups = new Map<string, Array<WorkspaceHit & { folderId: string }>>()
    for (const folderId of names) {
      const dir = path.join(root, folderId)
      const entries = yield* fs.readDirectory(dir).pipe(Effect.orElseSucceed(() => [] as Array<string>))
      const hasContent =
        entries.some((file) => isHostDumpFile(file)) || entries.some((file) => file.endsWith(".sql"))
      if (!hasContent) continue
      const meta = yield* readWorkspaceMeta(fs, path, dir, folderId)
      const workspace = workspaceId(folderId, meta.name)
      const list = groups.get(workspace) ?? []
      list.push({
        id: workspace,
        folderId,
        dir,
        name: meta.name,
        engine: meta.engine,
        updatedAt: meta.updatedAt
      })
      groups.set(workspace, list)
    }
    const out: Array<WorkspaceHit> = []
    for (const [workspace, hits] of groups) {
      hits.sort((a, b) => {
        const exactA = a.folderId === workspace ? 1 : 0
        const exactB = b.folderId === workspace ? 1 : 0
        if (exactA !== exactB) return exactB - exactA
        return b.updatedAt - a.updatedAt
      })
      const best = hits[0]
      if (best) {
        out.push({
          id: workspace,
          dir: best.dir,
          name: best.name === best.folderId ? workspace : best.name,
          engine: best.engine,
          updatedAt: best.updatedAt
        })
      }
    }
    return out
  })
