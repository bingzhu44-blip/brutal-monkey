/**
 * dsh-brutal-delete — host half.
 *
 * One exact POST route permanently deletes a stored Session:
 *
 *   POST /dsh-brutal-delete/delete  { "sessionId": "session-…" }
 *
 * There is no Session delete in the shipped harness (session persistence only
 * creates, opens, stats and lists; the built-in "archive" merely hides a row
 * while keeping its workspace accounting slot). Deletion is therefore three
 * supported steps plus two filesystem removals:
 *
 *   1. drop the registry-global archive/pin markers (idempotent),
 *   2. detach the Session from its workspace accounting,
 *   3. delete its projection-cache record through the cache's own table,
 *   4. remove its stored log directory (and any attachment directory),
 *   5. tell open pages the row is gone.
 *
 * A live (resident) Session is also deletable: on Windows the JSONL backend's
 * write-ownership lock is a named kernel semaphore, never a file handle, so the
 * log directory removes freely (verified). A resident Agent is stopped first —
 * best-effort `cancel` + `whenIdle` — so it cannot append into the deleted
 * directory.
 */

import { readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'

export const name = 'dsh-brutal-delete'

export const inject = [
  'webServer',
  'connection',
  'workspaceRegistry',
  'sessionProjectionCache',
  'sessions',
  'agents',
  'sessionPersistence',
]

/** The one route this plugin owns. */
const ROUTE = '/dsh-brutal-delete/delete'

/** Ordinary Sessions are `session-<uuid>`; subagent Sessions are a bare UUID. */
const SESSION_RE = /^(session-)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Request bodies are tiny; anything larger is not ours. */
const BODY_LIMIT_BYTES = 64 * 1024

/** Upper bound on waiting for a resident Agent to stop before deleting. */
const QUIET_TIMEOUT_MS = 5000

/**
 * The host half of the plugin: register the delete route for this fiber and
 * release it on disposal (HMR re-activation must not collide on the path).
 * @param ctx - host plugin context with the injected services.
 */
export function apply(ctx) {
  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: ROUTE,
      handler: (req, res) => handle(ctx, req, res),
    }),
    'dsh-brutal-delete: delete route',
  )
}

/**
 * One request: validate, refuse unsafe targets, then delete.
 * @param ctx - host plugin context.
 * @param req - the node:http request.
 * @param res - the node:http response.
 */
async function handle(ctx, req, res) {
  try {
    if (ctx.connection.requestRejection(req) !== undefined) {
      return sendJson(res, 403, { ok: false, code: 'forbidden', message: 'request rejected' })
    }
    if (req.method !== 'POST') {
      return sendJson(res, 405, { ok: false, code: 'method-error', message: 'POST required' })
    }

    let body
    try {
      body = await readJsonBody(req)
    } catch (error) {
      return sendJson(res, 400, { ok: false, code: 'invalid-body', message: String(error?.message ?? error) })
    }

    const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : ''
    if (!SESSION_RE.test(sessionId)) {
      return sendJson(res, 400, { ok: false, code: 'invalid-id', message: `invalid session id "${sessionId}"` })
    }

    // A resident Session owns a live Agent and an in-memory write route. The
    // log file itself is not locked on Windows, so deletion proceeds; stop the
    // resident Agent (best-effort) and flush its writer so a later handle close
    // cannot resurrect buffered appends after the directory is gone.
    if (ctx.sessions.get(sessionId) !== undefined) {
      await quietLiveAgent(ctx, sessionId)
      await flushPersistence(ctx)
    }

    let header
    try {
      header = await ctx.sessionPersistence.stat(sessionId)
    } catch {
      return sendJson(res, 404, { ok: false, code: 'not-found', message: `unknown session "${sessionId}"` })
    }

    const targets = [sessionId, ...await collectChildIds(ctx, sessionId, header)]

    await dropRegistryMarkers(ctx, targets)
    await detachFromWorkspaces(ctx, targets)
    await dropProjectionRecords(ctx, targets)

    const home = resolveDshHome()
    const failures = []
    let removedDirs = 0
    for (const target of targets) {
      for (const dir of await findSessionDirs(home, target)) {
        try {
          await rm(dir, { recursive: true, force: true })
          removedDirs += 1
        } catch (error) {
          failures.push(`${target}: ${String(error?.message ?? error)}`)
        }
      }
      try {
        await rm(join(home, 'attachments', target), { recursive: true, force: true })
      } catch {
        // No attachment directory is the normal case.
      }
    }

    await purgeResidualReferences(home, targets)

    try {
      ctx.emit('api-session/removed', sessionId)
    } catch {
      // Best effort: a stale row disappears on the next list refresh.
    }

    if (failures.length > 0) {
      return sendJson(res, 500, {
        ok: false,
        code: 'delete-failed',
        message: `已从列表移除，但文件删除失败：${failures.join('; ')}`,
        deleted: targets,
      })
    }

    ctx.logger?.info?.(`dsh-brutal-delete: deleted ${targets.join(', ')} (${removedDirs} dir(s))`)
    return sendJson(res, 200, { ok: true, deleted: targets, removedDirs })
  } catch (error) {
    try {
      sendJson(res, 500, { ok: false, code: 'internal', message: String(error?.message ?? error) })
    } catch {
      // The socket is gone; nothing left to answer with.
    }
  }
}

/**
 * Best-effort stop a resident Agent before its durable log is removed. A
 * running turn is cancelled and awaited so the Agent finishes its current
 * state (including any cancellation records) and cannot append into the
 * deleted directory afterwards; an already-idle Agent is left alone. This
 * never throws and never blocks longer than {@link QUIET_TIMEOUT_MS} — a
 * wedged or mid-setup Agent must not block a delete.
 * @param ctx - host plugin context.
 * @param sessionId - the Session being deleted.
 */
async function quietLiveAgent(ctx, sessionId) {
  const agent = ctx.agents?.get?.(sessionId)
  if (agent === undefined) return
  try {
    await agent.cancel?.({ kind: 'disposed' })
  } catch {
    // Best effort.
  }
  try {
    await Promise.race([
      agent.whenIdle?.(),
      new Promise((resolve) => setTimeout(resolve, QUIET_TIMEOUT_MS)),
    ])
  } catch {
    // Best effort.
  }
}

/**
 * Force every active write handle to flush its buffered appends to disk. This
 * is the durability barrier that guarantees nothing pending survives the log
 * removal below; without it a later `handle.close()` drain could recreate the
 * deleted directory. Best-effort — a flush failure never blocks a delete.
 * @param ctx - host plugin context.
 */
async function flushPersistence(ctx) {
  try {
    await ctx.sessionPersistence?.flush?.()
  } catch {
    // Best effort.
  }
}

/**
 * Child Session ids of one parent, gathered from two independent witnesses so a
 * single missing source never leaves a subagent log orphaned:
 *
 *   1. the parent's projection-cache record, whose `subagentCatalog` row lists
 *      its children under `head.values[].childId`;
 *   2. the persistence corpus itself — every stored Session whose header names
 *      this parent through `parentSession` (the durable lineage link).
 *
 * Witness 2 is what rescues a parent whose cache record was already dropped, or
 * whose catalog never mentioned one child: the header link survives on disk
 * regardless. Both sources are fail-soft — a broken one costs only its own
 * contribution, never the parent deletion.
 * @param ctx - host plugin context.
 * @param sessionId - the parent Session.
 * @param header - its stored header (the cache's identity witness).
 * @returns child ids, validated against {@link SESSION_RE}.
 */
async function collectChildIds(ctx, sessionId, header) {
  const ids = new Set()

  for (const id of childIdsFromCatalog(ctx, sessionId, header)) ids.add(id)

  try {
    const stored = await ctx.sessionPersistence.list({})
    for (const entry of stored ?? []) {
      const candidate = entry?.header
      if (candidate === null || typeof candidate !== 'object') continue
      if (candidate.parentSession !== sessionId) continue
      if (typeof candidate.id === 'string' && SESSION_RE.test(candidate.id)) ids.add(candidate.id)
    }
  } catch (error) {
    ctx.logger?.warn?.(`dsh-brutal-delete: child scan from persistence failed for ${sessionId}: ${String(error)}`)
  }

  ids.delete(sessionId)
  return [...ids]
}

/**
 * The projection-cache contribution to {@link collectChildIds}: walk the stored
 * record for any `childId` string. Depth- and identity-bounded so a malformed
 * or cyclic record cannot trap the walk.
 * @param ctx - host plugin context.
 * @param sessionId - the parent Session.
 * @param header - its stored header (the cache's identity witness).
 * @returns child ids from the cache record, or none when it is absent.
 */
function childIdsFromCatalog(ctx, sessionId, header) {
  const ids = new Set()
  let record
  try {
    record = ctx.sessionProjectionCache.recordFor(sessionId, header)
  } catch {
    return []
  }
  if (record === undefined || record === null) return []
  const seen = new Set()
  const walk = (value, depth) => {
    if (depth > 12 || value === null || typeof value !== 'object' || seen.has(value)) return
    seen.add(value)
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1)
      return
    }
    if (typeof value.childId === 'string' && SESSION_RE.test(value.childId)) ids.add(value.childId)
    for (const key of Object.keys(value)) walk(value[key], depth + 1)
  }
  try {
    walk(record, 0)
  } catch {
    // A hostile accessor on the record must not cost the ids gathered so far.
  }
  ids.delete(sessionId)
  return [...ids]
}

/**
 * Remove archive and pin markers for every target. Both calls are idempotent.
 * @param ctx - host plugin context.
 * @param targets - the Session ids being deleted.
 */
async function dropRegistryMarkers(ctx, targets) {
  for (const target of targets) {
    try {
      await ctx.workspaceRegistry.unarchiveSession(target)
    } catch {
      // Unknown ids are an idempotent no-op for this domain.
    }
    try {
      await ctx.workspaceRegistry.unpinSession(target)
    } catch {
      // Same.
    }
  }
}

/**
 * Drop each target from its workspace's ordered ownership account. The archive
 * marker alone never removes this slot, so skipping it would leave a ghost row.
 * @param ctx - host plugin context.
 * @param targets - the Session ids being deleted.
 */
async function detachFromWorkspaces(ctx, targets) {
  for (const target of targets) {
    for (const workspace of ctx.workspaceRegistry.list()) {
      if (!workspace.sessionIds.includes(target)) continue
      if (typeof workspace.detachSession !== 'function') continue
      await workspace.detachSession(target)
    }
  }
}

/**
 * Delete the durable projection-cache row through the cache's own table so the
 * in-memory tables and the stored document stay coherent.
 * @param ctx - host plugin context.
 * @param targets - the Session ids being deleted.
 */
async function dropProjectionRecords(ctx, targets) {
  const table = ctx.sessionProjectionCache?.table
  if (table === undefined) return
  for (const target of targets) {
    try {
      await table.delete(target)
    } catch (error) {
      ctx.logger?.warn?.(`dsh-brutal-delete: projection cache delete failed for ${target}: ${String(error)}`)
    }
  }
}

/**
 * Post-delete residue sweep: guarantee no on-disk reference to a deleted
 * Session survives the operation. Residue classes are purged, all bounded to
 * exact, self-owned paths (never a whole-home scan):
 *
 *   1. the projection-cache row document — and its sibling variants — in case
 *      the cache table's own write-through was deferred or failed. The shipped
 *      json backend's `per-record` layout names the document `<id>.json`, and
 *      its invalid-record recovery renames a rejected row to
 *      `<id>.json.bak.<YYYYMMDDHHmm>`; every one of those spellings is swept,
 *      including stamped backups discovered by prefix because the stamp is not
 *      predictable;
 *   2. stale rollback snapshots under this plugin's own `.backup-session-delete-*`
 *      namespace (one per profile directory), which can otherwise retain the
 *      deleted ids inside a copied workspace index.
 *
 * @param home - the resolved DSH home.
 * @param targets - the Session ids being deleted.
 */
async function purgeResidualReferences(home, targets) {
  const projRoot = join(home, 'storages', 'session_projcache', 'sessions')
  for (const target of targets) {
    for (const suffix of ['', '.tmp', '.bak', '.old', '.journal']) {
      try {
        await rm(join(projRoot, `${target}.json${suffix}`), { recursive: true, force: true })
      } catch {
        // Absence is the goal; a lock error on one sibling must not fail the sweep.
      }
    }
    // Stamped backups carry a minute-granularity suffix this plugin cannot
    // enumerate, so match them by prefix against a directory listing.
    let entries
    try {
      entries = await readdir(projRoot, { withFileTypes: true })
    } catch {
      entries = []
    }
    for (const entry of entries) {
      if (!entry.name.startsWith(`${target}.json.`)) continue
      try {
        await rm(join(projRoot, entry.name), { recursive: true, force: true })
      } catch {
        // Best effort, as above.
      }
    }
  }

  const profileRoot = join(home, 'profiles')
  let profiles
  try {
    profiles = await readdir(profileRoot, { withFileTypes: true })
  } catch {
    return
  }
  for (const profile of profiles) {
    if (!profile.isDirectory()) continue
    const profileDir = join(profileRoot, profile.name)
    let entries
    try {
      entries = await readdir(profileDir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith('.backup-session-delete-')) continue
      try {
        await rm(join(profileDir, entry.name), { recursive: true, force: true })
      } catch {
        // Best effort.
      }
    }
  }
}

/**
 * Locate every stored log directory for one Session. The directory name IS the
 * Session id, but the parent directory is a workspace-path encoding, so scan
 * one level instead of re-deriving that encoding.
 * @param home - the resolved DSH home.
 * @param target - a validated Session id.
 * @returns absolute directories that exist.
 */
async function findSessionDirs(home, target) {
  const root = join(home, 'sessions')
  const found = []
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return found
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const candidate = join(root, entry.name, target)
    try {
      if ((await stat(candidate)).isDirectory()) found.push(candidate)
    } catch {
      // This workspace folder does not hold the Session.
    }
  }
  return found
}

/**
 * The DSH data root: `$DSH_HOME`, else `~/.dsh` — the same precedence the
 * harness's own home-paths helper applies.
 * @returns an absolute directory path.
 */
function resolveDshHome() {
  const configured = process.env.DSH_HOME?.trim()
  return configured !== undefined && configured !== '' ? configured : join(homedir(), '.dsh')
}

/**
 * Read and parse a small JSON request body.
 * @param req - the node:http request.
 * @returns the parsed body.
 */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > BODY_LIMIT_BYTES) {
        reject(new Error('request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      if (text.trim() === '') {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(text))
      } catch {
        reject(new Error('invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

/**
 * Write one JSON response.
 * @param res - the node:http response.
 * @param status - HTTP status code.
 * @param payload - JSON-serialisable body.
 */
function sendJson(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8')
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store',
  })
  res.end(body)
}
