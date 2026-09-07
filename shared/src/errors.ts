import { Schema } from "effect"

export class ConfigParseError extends Schema.TaggedError<ConfigParseError>()("ConfigParseError", {
  message: Schema.String
}) {}

export class ConfigIoError extends Schema.TaggedError<ConfigIoError>()("ConfigIoError", {
  message: Schema.String
}) {}

export class PathUnsafeError extends Schema.TaggedError<PathUnsafeError>()("PathUnsafeError", {
  value: Schema.String
}) {}

export class ScriptNotFound extends Schema.TaggedError<ScriptNotFound>()("ScriptNotFound", {
  connectionId: Schema.String,
  name: Schema.String
}) {}

export class SyncNotFound extends Schema.TaggedError<SyncNotFound>()("SyncNotFound", {
  connectionId: Schema.String
}) {}

export class ConnectionNotFound extends Schema.TaggedError<ConnectionNotFound>()("ConnectionNotFound", {
  id: Schema.String
}) {}

export class SqlExecError extends Schema.TaggedError<SqlExecError>()("SqlExecError", {
  message: Schema.String
}) {}

export class DumpError extends Schema.TaggedError<DumpError>()("DumpError", {
  message: Schema.String
}) {}

export class SyncError extends Schema.TaggedError<SyncError>()("SyncError", {
  message: Schema.String
}) {}

export class UnauthorizedError extends Schema.TaggedError<UnauthorizedError>()("UnauthorizedError", {
  message: Schema.String
}) {}

export class AuthFailedError extends Schema.TaggedError<AuthFailedError>()("AuthFailedError", {
  message: Schema.String
}) {}
