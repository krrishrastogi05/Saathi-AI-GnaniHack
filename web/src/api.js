// Shared fetch helper for the elder app and the family app.
// Errors carry a "kind" so the app can show a friendly line instead of "Failed to fetch".
export const fail = (kind, detail) => Object.assign(new Error(detail), { kind })
export async function api(path, body, opts = {}) {
  const init = body === undefined ? { method: opts.method } : opts.raw ? { method: 'POST', body } : { method: opts.method || 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  let r, j
  for (let i = 0; ; i++) {
    try {
      r = await fetch('/api' + path, init)
      j = await r.json().catch(() => null)
      if (r.ok || j) break // a non-JSON error is the dev proxy saying the API server is down
    } catch {}
    if (i >= 2) throw fail('offline', `api ${r?.status ?? 'unreachable'}`) // the app server is down or restarting
    await new Promise((res) => setTimeout(res, 1200))
  }
  if (!r.ok) throw fail(/network|ENOTFOUND|timeout|cannot reach/i.test(j.error ?? '') ? 'internet' : /busy|rate limit/i.test(j.error ?? '') ? 'busy' : 'server', j.error || r.statusText)
  return j
}
// Shown as a toast by <App>; console keeps the detail for debugging.
export const report = (e) => (console.warn(e), window.dispatchEvent(new CustomEvent('saathi-error', { detail: e.kind ?? (e.name === 'NotAllowedError' ? 'mic' : 'server') })))

// Gnani Timbre expression tags are spoken, never shown.
export const untag = (s) => String(s ?? '').replace(/<(laugh|giggle|sigh|exhales|sniffles|yawns|coughs|clears throat|whispers|shouting|excited|slow|pauses)>\s*/g, '').trim()

