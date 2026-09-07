import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "@effect/platform"
import { Schema } from "effect"
import {
  AuthFailedError,
  ConfigIoError,
  ConfigParseError,
  PathUnsafeError,
  ScriptNotFound,
  SyncNotFound,
  UnauthorizedError
} from "./errors.ts"
import { AppConfig } from "./schema/config.ts"
import {
  AuthLogin,
  AuthMe,
  AuthOk,
  ConnectionIdPath,
  Health,
  HistoryEntry,
  HistoryWrite,
  HostFile,
  Script,
  ScriptPath,
  ScriptWrite,
  SyncPayload,
  SyncPush
} from "./schema/models.ts"

const healthGroup = HttpApiGroup.make("health").add(
  HttpApiEndpoint.get("check", "/health").addSuccess(Health)
)

const authGroup = HttpApiGroup.make("auth")
  .add(
    HttpApiEndpoint.post("login", "/auth/login")
      .setPayload(AuthLogin)
      .addSuccess(AuthOk)
      .addError(AuthFailedError, { status: 401 })
  )
  .add(HttpApiEndpoint.post("logout", "/auth/logout").addSuccess(AuthOk))
  .add(
    HttpApiEndpoint.get("me", "/auth/me")
      .addSuccess(AuthMe)
      .addError(UnauthorizedError, { status: 401 })
  )

const configGroup = HttpApiGroup.make("config")
  .add(HttpApiEndpoint.get("get", "/config").addSuccess(AppConfig).addError(ConfigParseError, { status: 400 }).addError(ConfigIoError, { status: 500 }))
  .add(
    HttpApiEndpoint.put("put", "/config")
      .setPayload(AppConfig)
      .addSuccess(AppConfig)
      .addError(ConfigParseError, { status: 400 })
      .addError(ConfigIoError, { status: 500 })
  )

const scriptsGroup = HttpApiGroup.make("scripts")
  .add(
    HttpApiEndpoint.get("list", "/scripts/:connectionId")
      .setPath(ConnectionIdPath)
      .addSuccess(Schema.Array(Script))
      .addError(PathUnsafeError, { status: 400 })
      .addError(ConfigParseError, { status: 400 })
      .addError(ConfigIoError, { status: 500 })
  )
  .add(
    HttpApiEndpoint.put("put", "/scripts/:connectionId/:name")
      .setPath(ScriptPath)
      .setPayload(ScriptWrite)
      .addSuccess(Script)
      .addError(PathUnsafeError, { status: 400 })
      .addError(ConfigParseError, { status: 400 })
      .addError(ConfigIoError, { status: 500 })
  )
  .add(
    HttpApiEndpoint.del("remove", "/scripts/:connectionId/:name")
      .setPath(ScriptPath)
      .addSuccess(Schema.Void)
      .addError(PathUnsafeError, { status: 400 })
      .addError(ScriptNotFound, { status: 404 })
      .addError(ConfigParseError, { status: 400 })
      .addError(ConfigIoError, { status: 500 })
  )

const historyGroup = HttpApiGroup.make("history")
  .add(
    HttpApiEndpoint.get("list", "/history/:connectionId")
      .setPath(ConnectionIdPath)
      .addSuccess(Schema.Array(HistoryEntry))
      .addError(PathUnsafeError, { status: 400 })
      .addError(ConfigParseError, { status: 400 })
      .addError(ConfigIoError, { status: 500 })
  )
  .add(
    HttpApiEndpoint.post("append", "/history/:connectionId")
      .setPath(ConnectionIdPath)
      .setPayload(HistoryWrite)
      .addSuccess(HistoryEntry)
      .addError(PathUnsafeError, { status: 400 })
      .addError(ConfigParseError, { status: 400 })
      .addError(ConfigIoError, { status: 500 })
  )

const syncGroup = HttpApiGroup.make("sync")
  .add(
    HttpApiEndpoint.post("push", "/connections/:connectionId/sync")
      .setPath(ConnectionIdPath)
      .setPayload(SyncPush)
      .addSuccess(SyncPayload)
      .addError(PathUnsafeError, { status: 400 })
      .addError(ConfigParseError, { status: 400 })
      .addError(ConfigIoError, { status: 500 })
  )
  .add(
    HttpApiEndpoint.get("pull", "/connections/:connectionId/sync")
      .setPath(ConnectionIdPath)
      .addSuccess(SyncPayload)
      .addError(PathUnsafeError, { status: 400 })
      .addError(SyncNotFound, { status: 404 })
      .addError(ConfigParseError, { status: 400 })
      .addError(ConfigIoError, { status: 500 })
  )
  .add(
    HttpApiEndpoint.get("files", "/connections/:connectionId/files")
      .setPath(ConnectionIdPath)
      .addSuccess(Schema.Array(HostFile))
      .addError(PathUnsafeError, { status: 400 })
      .addError(ConfigParseError, { status: 400 })
      .addError(ConfigIoError, { status: 500 })
  )

export class WorkbenchApi extends HttpApi.make("workbench")
  .add(healthGroup)
  .add(authGroup)
  .add(configGroup)
  .add(scriptsGroup)
  .add(historyGroup)
  .add(syncGroup)
  .prefix("/api") {}
