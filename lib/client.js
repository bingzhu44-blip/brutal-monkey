/**
 * dsh-brutal-delete — browser half.
 *
 * A no-build bundle: the host serves this file as the package's `./client`
 * export, and the shell's frozen module table answers `require('react')` and
 * `require('@deepseek-ai/dsh-client-ui-primitives')`, so nothing is bundled
 * here and no package dependency is needed.
 *
 * Slots owned by this plugin:
 *
 *   sidebar.workspaces.session.menu.item (order 425 — between the shipped
 *   `archive` at 400 and `session-id` at 450): ask for a delete.
 *
 *   shell.overlay (list, frame-wide): the single-delete confirmation dialog and
 *   the batch-delete confirm / progress / result dialogs.
 *
 *   sidebar.session.row.leading (list): the batch-mode hollow selection dot.
 *
 *   sidebar.footer.action (list): the batch-mode 全选 / 删除 / 退出 controls.
 *
 * Batch mode: the "… → 删除会话 → 批量删除" button leaves the single-delete
 * dialog and enters a selection mode. Every non-archived, non-blank session row
 * shows a white hollow dot on its left; clicking a row toggles it. Ctrl+A
 * selects all, Delete (or the footer 删除 button) confirms, Escape exits.
 */

window.__ModuleLoader__.load({
  id: 'dsh-brutal-delete',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    ;'use strict'

    const React = require('react')
    const prim = require('@deepseek-ai/dsh-client-ui-primitives')

    const ROUTE = 'dsh-brutal-delete/delete'
    const MENU_SLOT = 'sidebar.workspaces.session.menu.item'
    const LEADING_SLOT = 'sidebar.session.row.leading'
    const FOOTER_SLOT = 'sidebar.footer.action'
    const OVERLAY_SLOT = 'shell.overlay'

    const ZH = typeof navigator !== 'undefined' && /^zh/i.test(navigator.language || '')
    const t = (zh, en) => (ZH ? zh : en)

    /**
     * One pending confirmation request; `null` closes the dialog.
     * Mirrors the observable face slot hooks expect: getSnapshot + subscribe.
     * @returns the request store.
     */
    function createDeleteStore() {
      let snapshot = null
      const listeners = new Set()
      return {
        getSnapshot: () => snapshot,
        subscribe: (listener) => {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
        set: (next) => {
          snapshot = next
          for (const listener of [...listeners]) listener()
        },
      }
    }

    /**
     * Batch-mode state: whether selection mode is active, the selected set, and
     * the delete phase (`idle` selecting, `confirming`, `deleting`, `done`).
     * @returns an observable store; every transition replaces the snapshot so
     *          React re-renders on change.
     */
    function createBatchStore() {
      let snapshot = {
        active: false,
        selected: new Set(),
        phase: 'idle',
        progress: { done: 0, total: 0 },
        errors: [],
      }
      const listeners = new Set()
      return {
        getSnapshot: () => snapshot,
        subscribe: (listener) => {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
        set: (next) => {
          snapshot = next
          for (const listener of [...listeners]) listener()
        },
      }
    }

    /**
     * Resolve the host route against the page's own base: a Web page and the
     * Electron shell (`dsh-app://app/`, whose non-static paths the shell
     * forwards to the Host same-origin) both reach the route this way, while
     * `location.origin` is `null` for a custom scheme.
     * @returns the absolute endpoint URL.
     */
    function endpoint() {
      const base = typeof document !== 'undefined' && typeof document.baseURI === 'string' && document.baseURI !== ''
        ? document.baseURI
        : window.location.href
      return new URL(ROUTE, base)
    }

    /**
     * Ask the host to delete one Session.
     * @param sessionId - the Session to delete.
     * @returns the host payload.
     */
    async function callDelete(sessionId) {
      const response = await fetch(endpoint(), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      let payload = null
      try {
        payload = await response.json()
      } catch {
        payload = null
      }
      if (response.ok && payload !== null && payload.ok === true) return payload
      const code = payload === null ? undefined : payload.code
      if (code === 'not-found') {
        throw new Error(t('该会话已不存在', 'This conversation no longer exists.'))
      }
      const message = payload === null ? undefined : payload.message
      throw new Error(typeof message === 'string' && message !== ''
        ? message
        : t(`删除失败（HTTP ${String(response.status)}）`, `Delete failed (HTTP ${String(response.status)})`))
    }

    /**
     * The "..." menu row. Selecting it closes the menu and raises the request.
     * @param props - row share, the menu open hook, and the request raiser.
     * @returns the menu row.
     */
    function DeleteMenuItem({ sessionId, displayTitle, useMenuOpenState, requestDelete }) {
      const setMenuOpen = useMenuOpenState()[1]
      return React.createElement(prim.MenuItemButton, {
        icon: React.createElement(prim.IconTrashOutlineRegular, { size: 14 }),
        onSelect: () => {
          setMenuOpen(false)
          requestDelete(sessionId, displayTitle)
        },
      }, t('删除会话', 'Delete conversation'))
    }

    /**
     * The single-delete confirmation dialog. Renders nothing while no request is
     * pending.
     * @param props - the request hook, the host call, the dismissal, and the
     *                batch-mode entry.
     * @returns the dialog, or null.
     */
    function DeleteDialog({ useDeleteRequest, deleteSession, dismiss, enterBatch }) {
      const request = useDeleteRequest((request) => request)
      if (request === null) return null
      return React.createElement(DeleteForm, { request, deleteSession, dismiss, enterBatch }, request.sessionId)
    }

    /**
     * One request's form: busy and error state die with the request.
     * @param props - the request, the host call, the dismissal, and the batch
     *                entry.
     * @returns the modal.
     */
    function DeleteForm({ request, deleteSession, dismiss, enterBatch }) {
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState(null)

      const close = () => {
        if (busy) return
        dismiss()
      }
      const confirm = () => {
        setBusy(true)
        setError(null)
        deleteSession(request.sessionId).then(() => {
          setBusy(false)
          dismiss()
        }).catch((reason) => {
          setBusy(false)
          setError(reason instanceof Error ? reason.message : String(reason))
        })
      }
      const startBatch = () => {
        if (busy) return
        enterBatch()
      }

      const title = request.displayTitle === undefined || request.displayTitle === ''
        ? request.sessionId
        : request.displayTitle

      return React.createElement('div', { style: { pointerEvents: 'auto' } },
        React.createElement(prim.Modal, {
          open: true,
          onClose: close,
          closeLabel: t('关闭', 'Close'),
          title: t('删除会话', 'Delete conversation'),
          description: t(`将永久删除「${title}」的对话记录和附件，此操作无法撤销。`,
            `Permanently delete the transcript and attachments of "${title}". This cannot be undone.`),
          footer: React.createElement(React.Fragment, null,
            React.createElement(prim.Button, {
              variant: 'outline',
              disabled: busy,
              onClick: close,
            }, t('取消', 'Cancel')),
            React.createElement(prim.Button, {
              variant: 'outline',
              disabled: busy,
              onClick: confirm,
              style: { color: 'var(--dsw-alias-state-error-primary, #f2a1a1)' },
            }, busy ? t('删除中…', 'Deleting…') : t('永久删除', 'Delete')),
            React.createElement(prim.Button, {
              variant: 'outline',
              disabled: busy,
              onClick: startBatch,
            }, t('批量删除', 'Batch delete'))),
        },
        busy ? React.createElement('div', { role: 'status' }, t('正在删除…', 'Deleting…')) : null,
        error === null ? null : React.createElement('div', {
          role: 'alert',
          style: { color: 'var(--dsw-alias-state-error-primary, #f2a1a1)', marginTop: 8 },
        }, error)),
      )
    }

    /**
     * The batch-mode hollow selection dot, rendered in the leading seat of each
     * eligible session row. It is a pure visual indicator: the actual toggling is
     * a document-level capture handler installed by `apply`, so clicking anywhere
     * on the row toggles while the dot stays non-interactive.
     * @param props - the row's session id and the batch state hook.
     * @returns the dot, or null outside batch mode.
     */
    function BatchDot({ sessionId, useBatch }) {
      const state = useBatch((snapshot) => snapshot)
      if (!state.active) return null
      const selected = state.selected.has(sessionId)
      const style = {
        color: 'var(--dsw-alias-label-primary, #ffffff)',
        width: 14,
        height: 14,
        boxSizing: 'border-box',
        borderRadius: '50%',
        border: '2px solid currentColor',
        background: selected ? 'currentColor' : 'transparent',
        display: 'inline-block',
        flex: 'none',
        cursor: 'pointer',
        transition: 'background-color 120ms ease',
      }
      return React.createElement('span', { 'aria-hidden': 'true', style })
    }

    /**
     * The batch-mode footer controls (全选 / 删除 / 退出), rendered in the
     * sidebar's footer-action seat only while batch mode is active.
     * @param props - the batch state hook and the action callbacks.
     * @returns the controls, or null outside batch mode.
     */
    function BatchFooter({ useBatch, allSelectableIds, selectAll, requestConfirm, exitBatch }) {
      const state = useBatch((snapshot) => snapshot)
      if (!state.active) return null
      const all = allSelectableIds()
      const n = state.selected.size
      const allSelected = all.length > 0 && all.every((id) => state.selected.has(id))
      const busy = state.phase === 'deleting'
      return React.createElement('div', {
        style: { display: 'flex', gap: 6, width: '100%', flexWrap: 'wrap' },
      },
        React.createElement(prim.Button, {
          variant: 'outline',
          disabled: busy || all.length === 0,
          onClick: selectAll,
          style: { flex: '1 1 auto' },
        }, allSelected ? t('取消全选', 'Clear') : t('全选', 'Select all')),
        React.createElement(prim.Button, {
          variant: 'outline',
          disabled: busy || n === 0,
          onClick: requestConfirm,
          style: { flex: '1 1 auto', color: 'var(--dsw-alias-state-error-primary, #f2a1a1)' },
        }, t(`删除 (${n})`, `Delete (${n})`)),
        React.createElement(prim.Button, {
          variant: 'outline',
          disabled: busy,
          onClick: exitBatch,
          style: { flex: '1 1 auto' },
        }, t('退出', 'Exit')))
    }

    /**
     * The batch-mode overlays: confirm, in-progress, and result. Renders nothing
     * while the phase is `idle`.
     * @param props - the batch state hook and the action callbacks.
     * @returns the relevant modal, or null.
     */
    function BatchOverlay({ useBatch, commitBatch, cancelConfirm, dismissResult }) {
      const state = useBatch((snapshot) => snapshot)
      const phase = state.phase
      if (phase === 'idle') return null

      if (phase === 'confirming') {
        const n = state.selected.size
        return React.createElement('div', { style: { pointerEvents: 'auto' } },
          React.createElement(prim.Modal, {
            open: true,
            onClose: cancelConfirm,
            closeLabel: t('关闭', 'Close'),
            title: t('批量删除会话', 'Delete conversations'),
            description: t(`将永久删除 ${n} 个会话的对话记录和附件，此操作无法撤销。`,
              `Permanently delete the transcript and attachments of ${n} conversations. This cannot be undone.`),
            footer: React.createElement(React.Fragment, null,
              React.createElement(prim.Button, {
                variant: 'outline',
                onClick: cancelConfirm,
              }, t('取消', 'Cancel')),
              React.createElement(prim.Button, {
                variant: 'outline',
                onClick: commitBatch,
                style: { color: 'var(--dsw-alias-state-error-primary, #f2a1a1)' },
              }, t('确认删除', 'Delete'))),
          }))
      }

      if (phase === 'deleting') {
        const { done, total } = state.progress
        return React.createElement('div', { style: { pointerEvents: 'auto' } },
          React.createElement(prim.Modal, {
            open: true,
            onClose: () => {},
            closeLabel: t('关闭', 'Close'),
            title: t('批量删除会话', 'Delete conversations'),
            description: t(`正在删除…（${done}/${total}）`, `Deleting… (${done}/${total})`),
          }))
      }

      // phase === 'done'
      const ok = state.progress.total - state.errors.length
      const failed = state.errors.length
      return React.createElement('div', { style: { pointerEvents: 'auto' } },
        React.createElement(prim.Modal, {
          open: true,
          onClose: dismissResult,
          closeLabel: t('关闭', 'Close'),
          title: t('批量删除完成', 'Batch delete complete'),
          description: failed === 0
            ? t(`已永久删除 ${ok} 个会话。`, `Permanently deleted ${ok} conversations.`)
            : t(`已删除 ${ok} 个会话，${failed} 个失败。`, `Deleted ${ok} conversations; ${failed} failed.`),
          footer: React.createElement(React.Fragment, null,
            React.createElement(prim.Button, { variant: 'outline', onClick: dismissResult }, t('完成', 'Done'))),
        },
        failed === 0 ? null : React.createElement('div', {
          role: 'alert',
          style: { color: 'var(--dsw-alias-state-error-primary, #f2a1a1)', marginTop: 8 },
        }, state.errors.join('\n'))))
    }

    /**
     * Client plugin body: register the menu row, the dialogs, the batch dot, the
     * batch footer, and the batch-mode input handlers for this fiber.
     * @param ctx - client context with the slots, sessions, and workspaces services.
     */
    function apply(ctx) {
      const store = createDeleteStore()
      const batch = createBatchStore()

      const sessions = ctx.get('sessions')
      const workspaces = ctx.get('workspaces')

      if (prim.MenuItemButton === undefined || prim.IconTrashOutlineRegular === undefined) {
        console.warn('[dsh-brutal-delete] ui primitives unavailable; no menu row registered')
        return
      }

      /** Every selectable top-level session: non-blank, non-archived. */
      const allSelectableIds = () => {
        const ids = []
        try {
          const list = sessions.list.getSnapshot()
          const archived = new Set(workspaces.list.getSnapshot().archivedSessionIds ?? [])
          for (const id of list.ids ?? []) {
            const row = list.byId[id]
            if (row === undefined || row.blank) continue
            if (archived.has(id)) continue
            ids.push(id)
          }
        } catch (error) {
          console.warn('[dsh-brutal-delete] session list unavailable:', error)
        }
        return ids
      }

      const enterBatch = () => {
        store.set(null)
        batch.set({ active: true, selected: new Set(), phase: 'idle', progress: { done: 0, total: 0 }, errors: [] })
      }
      const exitBatch = () => {
        batch.set({ active: false, selected: new Set(), phase: 'idle', progress: { done: 0, total: 0 }, errors: [] })
      }
      const toggle = (id) => {
        const state = batch.getSnapshot()
        if (!state.active || state.phase !== 'idle') return
        const selected = new Set(state.selected)
        if (selected.has(id)) selected.delete(id)
        else selected.add(id)
        batch.set({ ...state, selected })
      }
      const selectAll = () => {
        const state = batch.getSnapshot()
        if (!state.active || state.phase !== 'idle') return
        const all = allSelectableIds()
        const selected = new Set(state.selected)
        if (all.length > 0 && all.every((id) => selected.has(id))) {
          for (const id of all) selected.delete(id)
        } else {
          for (const id of all) selected.add(id)
        }
        batch.set({ ...state, selected })
      }
      const requestConfirm = () => {
        const state = batch.getSnapshot()
        if (!state.active || state.phase !== 'idle' || state.selected.size === 0) return
        batch.set({ ...state, phase: 'confirming', errors: [] })
      }
      const cancelConfirm = () => {
        const state = batch.getSnapshot()
        if (state.phase !== 'confirming') return
        batch.set({ ...state, phase: 'idle' })
      }
      const dismissResult = () => {
        exitBatch()
      }
      const commitBatch = async () => {
        const state = batch.getSnapshot()
        if (state.phase !== 'confirming') return
        const ids = [...state.selected]
        if (ids.length === 0) {
          cancelConfirm()
          return
        }
        batch.set({ ...state, phase: 'deleting', progress: { done: 0, total: ids.length }, errors: [] })
        const errors = []
        for (let i = 0; i < ids.length; i += 1) {
          try {
            await callDelete(ids[i])
          } catch (error) {
            errors.push(`${ids[i]}: ${error instanceof Error ? error.message : String(error)}`)
          }
          const current = batch.getSnapshot()
          if (current.phase !== 'deleting') return
          batch.set({ ...current, progress: { done: i + 1, total: ids.length } })
        }
        batch.set({
          active: false,
          selected: new Set(),
          phase: 'done',
          progress: { done: ids.length, total: ids.length },
          errors,
        })
      }

      // Batch-mode input: Ctrl+A selects all, Delete confirms, Escape exits,
      // and a click on a session row toggles it instead of opening it.
      ctx.effect(() => {
        const isEditableTarget = (target) => {
          if (target === null || typeof target !== 'object') return false
          const tag = target.tagName
          return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable === true
        }
        const rowFrom = (target) => {
          if (target === null || typeof target.closest !== 'function') return null
          return target.closest('[data-row-key^="session:"]')
        }
        const onKeyDown = (event) => {
          const state = batch.getSnapshot()
          if (!state.active) return
          if (isEditableTarget(event.target)) return
          if (event.code === 'Escape') {
            if (state.phase === 'confirming') {
              event.preventDefault()
              event.stopPropagation()
              cancelConfirm()
            } else if (state.phase === 'idle') {
              event.preventDefault()
              event.stopPropagation()
              exitBatch()
            }
            return
          }
          if (state.phase !== 'idle') return
          if (event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey && event.code === 'KeyA') {
            event.preventDefault()
            event.stopPropagation()
            selectAll()
          } else if (event.code === 'Delete' && !event.ctrlKey && !event.altKey && !event.metaKey) {
            event.preventDefault()
            event.stopPropagation()
            requestConfirm()
          }
        }
        const onClick = (event) => {
          const state = batch.getSnapshot()
          if (!state.active || state.phase !== 'idle') return
          const row = rowFrom(event.target)
          if (row === null) return
          const sessionId = row.getAttribute('data-row-key').slice('session:'.length)
          event.preventDefault()
          event.stopPropagation()
          toggle(sessionId)
        }
        const onDblClick = (event) => {
          const state = batch.getSnapshot()
          if (!state.active) return
          if (rowFrom(event.target) !== null) {
            event.preventDefault()
            event.stopPropagation()
          }
        }
        document.addEventListener('keydown', onKeyDown, true)
        document.addEventListener('click', onClick, true)
        document.addEventListener('dblclick', onDblClick, true)
        return () => {
          document.removeEventListener('keydown', onKeyDown, true)
          document.removeEventListener('click', onClick, true)
          document.removeEventListener('dblclick', onDblClick, true)
        }
      }, 'dsh-brutal-delete: batch input')

      ctx.slots.inject(MENU_SLOT, () => ctx.slots.register({
        name: MENU_SLOT,
        id: 'dsh-brutal-delete',
        order: 425,
        label: () => t('删除会话', 'Delete conversation'),
        inject: () => ({
          requestDelete: (sessionId, displayTitle) => store.set({ sessionId, displayTitle }),
        }),
      }, DeleteMenuItem))

      ctx.slots.inject(OVERLAY_SLOT, () => ctx.slots.register({
        name: OVERLAY_SLOT,
        id: 'dsh-brutal-delete-dialog',
        order: 200,
        inject: () => ({
          hooks: { deleteRequest: store },
          deleteSession: callDelete,
          dismiss: () => store.set(null),
          enterBatch,
        }),
      }, DeleteDialog))

      ctx.slots.inject(OVERLAY_SLOT, () => ctx.slots.register({
        name: OVERLAY_SLOT,
        id: 'dsh-brutal-delete-batch',
        order: 210,
        inject: () => ({
          hooks: { batch },
          commitBatch,
          cancelConfirm,
          dismissResult,
        }),
      }, BatchOverlay))

      ctx.slots.inject(LEADING_SLOT, () => ctx.slots.register({
        name: LEADING_SLOT,
        id: 'dsh-brutal-delete-batch-dot',
        order: 100,
        inject: () => ({
          hooks: { batch },
        }),
      }, BatchDot))

      ctx.slots.inject(FOOTER_SLOT, () => ctx.slots.register({
        name: FOOTER_SLOT,
        id: 'dsh-brutal-delete-batch-footer',
        order: 100,
        inject: () => ({
          hooks: { batch },
          allSelectableIds,
          selectAll,
          requestConfirm,
          exitBatch,
        }),
      }, BatchFooter))
    }

    module.exports = { name: 'dsh-brutal-delete', inject: ['slots', 'sessions', 'workspaces'], apply }
    return module.exports
  },
})
