import { PathUnsafeError } from "@workbench/shared"
import { Effect } from "effect"

type PathLike = {
  readonly resolve: (...pathSegments: ReadonlyArray<string>) => string
  readonly sep: string
}

export const assertSafeSegment = (value: string): Effect.Effect<string, PathUnsafeError> =>
  /^[A-Za-z0-9._-]+$/.test(value)
    ? Effect.succeed(value)
    : Effect.fail(new PathUnsafeError({ value }))

export const joinSafe = (
  path: PathLike,
  root: string,
  ...segments: Array<string>
): Effect.Effect<string, PathUnsafeError> =>
  Effect.gen(function* () {
    const safe = yield* Effect.forEach(segments, assertSafeSegment)
    const joined = path.resolve(root, ...safe)
    const resolvedRoot = path.resolve(root)
    if (joined !== resolvedRoot && !joined.startsWith(resolvedRoot + path.sep) && !joined.startsWith(resolvedRoot + "/")) {
      return yield* Effect.fail(new PathUnsafeError({ value: joined }))
    }
    return joined
  })
