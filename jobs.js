// Job schedules on IST wall-clock time. India has no daylight saving, so a fixed +05:30 offset is exact.
import { pathToFileURL } from 'node:url'

export const dateOf = (ms) => new Date(ms + 330 * 60000).toISOString().slice(0, 10)
export const timeOf = (ms) => new Date(ms + 330 * 60000).toISOString().slice(11, 16)
export const at = (date, time) => Date.parse(`${date}T${time}:00+05:30`)
export const addDays = (date, n) => new Date(Date.parse(date + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10)
const dow = (date) => new Date(date + 'T00:00:00Z').getUTCDay()
const mins = (t) => +t.slice(0, 2) * 60 + +t.slice(3, 5)
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const norm = (s) => String(s ?? '').toLowerCase()

/**
 * Schedule shapes (all times "HH:MM" IST):
 *  once     {date}                    daily   {}
 *  weekly   {days: [0=Sun..6]}        monthly {dayOfMonth}       yearly {monthDay: "MM-DD"}
 *  interval {everyMinutes, from, to}  (e.g. water every 120 min between 08:00 and 20:00)
 *  festival {festival: "ekadashi" | name | "any", daysBefore}
 *  birthday {person?: name, daysBefore}  (no person = every family birthday)
 * ctx = { festivals: [{date, name, ekadashi}], family: [{name, birthday: "MM-DD"}] }
 */
export function timesOn(s, date, ctx = {}) {
  const t = s.time || '09:00'
  const ahead = addDays(date, +s.daysBefore || 0)
  switch (s.type) {
    case 'once': return s.date === date ? [t] : []
    case 'daily': return [t]
    case 'weekly': return (s.days ?? []).map(Number).includes(dow(date)) ? [t] : []
    case 'monthly': return +date.slice(8) === +s.dayOfMonth ? [t] : []
    case 'yearly': return date.slice(5) === s.monthDay ? [t] : []
    case 'interval': {
      const out = []
      for (let m = mins(s.from || '08:00'); m <= mins(s.to || '20:00'); m += Math.max(15, +s.everyMinutes || 60)) out.push(hhmm(m))
      return out
    }
    case 'festival': {
      const f = norm(s.festival)
      const hit = (ctx.festivals ?? []).some((x) => x.date === ahead && (f === 'any' || (f.includes('ekadashi') ? x.ekadashi : norm(x.name).includes(f))))
      return hit ? [t] : []
    }
    case 'birthday': {
      const hit = (ctx.family ?? []).some((x) => x.birthday === ahead.slice(5) && (!s.person || norm(x.name).includes(norm(s.person))))
      return hit ? [t] : []
    }
    default: return []
  }
}

// Next fire time (epoch ms) strictly after `after`, looking up to 400 days ahead. null = never again.
export function nextRun(s, after, ctx) {
  const d0 = dateOf(after)
  for (let i = 0; i <= 400; i++) {
    const date = addDays(d0, i)
    for (const t of timesOn(s, date, ctx).sort()) if (at(date, t) > after) return at(date, t)
  }
  return null
}

// Self-check: `node jobs.js`
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { strictEqual: eq } = await import('node:assert')
  const now = at('2026-11-09', '10:00') // Monday
  const ctx = { festivals: [{ date: '2026-11-20', name: 'Dev Uthani Ekadashi', ekadashi: true }, { date: '2026-11-15', name: 'Chhath Puja' }], family: [{ name: 'Rahul', birthday: '11-12' }] }
  const iso = (ms) => (ms ? `${dateOf(ms)} ${timeOf(ms)}` : null)
  eq(iso(nextRun({ type: 'daily', time: '08:00' }, now, ctx)), '2026-11-10 08:00')
  eq(iso(nextRun({ type: 'daily', time: '21:00' }, now, ctx)), '2026-11-09 21:00')
  eq(iso(nextRun({ type: 'once', date: '2026-11-09', time: '09:00' }, now, ctx)), null)
  eq(iso(nextRun({ type: 'weekly', days: [0, 3], time: '07:00' }, now, ctx)), '2026-11-11 07:00')
  eq(iso(nextRun({ type: 'monthly', dayOfMonth: 1, time: '10:00' }, now, ctx)), '2026-12-01 10:00')
  eq(iso(nextRun({ type: 'yearly', monthDay: '01-05', time: '07:00' }, now, ctx)), '2027-01-05 07:00')
  eq(iso(nextRun({ type: 'interval', everyMinutes: 120, from: '08:00', to: '20:00' }, now, ctx)), '2026-11-09 12:00')
  eq(iso(nextRun({ type: 'interval', everyMinutes: 120, from: '08:00', to: '20:00' }, at('2026-11-09', '20:30'), ctx)), '2026-11-10 08:00')
  eq(iso(nextRun({ type: 'festival', festival: 'ekadashi', time: '06:00' }, now, ctx)), '2026-11-20 06:00')
  eq(iso(nextRun({ type: 'festival', festival: 'chhath', daysBefore: 1, time: '18:00' }, now, ctx)), '2026-11-14 18:00')
  eq(iso(nextRun({ type: 'birthday', daysBefore: 1, time: '19:00' }, now, ctx)), '2026-11-11 19:00')
  eq(iso(nextRun({ type: 'birthday', person: 'Priya', time: '19:00' }, now, ctx)), null)
  console.log('jobs ok')
}
