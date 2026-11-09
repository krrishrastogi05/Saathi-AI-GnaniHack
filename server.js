import express from 'express'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import webpush from 'web-push'
import { nextRun, timesOn, dateOf, timeOf, at, addDays } from './jobs.js'

const file = (f) => new URL(`./data/${f}`, import.meta.url)
const read = (f) => JSON.parse(fs.readFileSync(file(f), 'utf8'))
const festivals = read('festivals.json')
const schemes = read('schemes.json')

const empty = () => ({ profile: null, family: [], health: [], jobs: [], events: [], memories: [], chat: [], push: [] })
const DB = process.env.DB_FILE || 'db.json' // a separate file lets a test server run beside the real one
let db = fs.existsSync(file(DB)) ? { ...empty(), ...read(DB) } : empty()
// ponytail: one JSON file with sync writes, one elder per server. Move to SQLite for many users.
const save = () => fs.writeFileSync(file(DB), JSON.stringify(db, null, 2))
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

const GNANI = 'https://api.vachana.ai'
const KEY = process.env.GNANI_API_KEY
// Gnani allows one active request per key, so each endpoint keeps a queue.
const queues = {}
const inLine = (name, fn) => (queues[name] = (queues[name] ?? Promise.resolve()).catch(() => {}).then(fn))

// Timbre v3.0 voices speak all 10 languages, so the persona keeps one voice in every language.
const PERSONAS = {
  female: { id: 'female', name: 'Kamla ji', voice: 'Kalpana', desc: 'a 71-year-old retired Hindi school teacher and widow who loves old film songs, her tulsi plant and cooking' },
  male: { id: 'male', name: 'Ramesh ji', voice: 'Yashraj', desc: 'a 73-year-old retired railway station master who loves cricket, morning walks and telling old stories' },
}
const LANGS = { 'hi-IN': 'Hindi', 'en-IN': 'English', 'ta-IN': 'Tamil', 'te-IN': 'Telugu', 'kn-IN': 'Kannada', 'ml-IN': 'Malayalam', 'mr-IN': 'Marathi', 'pa-IN': 'Punjabi', 'bn-IN': 'Bengali', 'gu-IN': 'Gujarati' }

// Clock. DEMO_DATE (YYYY-MM-DD) moves the whole clock to that day (for demo videos), keeping the time of day.
const demoShift = process.env.DEMO_DATE ? Date.parse(process.env.DEMO_DATE) - Date.parse(dateOf(Date.now())) : 0
const now = () => Date.now() + demoShift
const ist = () => {
  const n = now()
  const date = dateOf(n)
  return { ms: n, date, time: timeOf(n), weekday: new Date(date + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'UTC' }) }
}

// ---------- external data ----------
const cache = new Map()
async function cached(key, ms, fn) {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < ms) return hit.value
  const value = await fn()
  cache.set(key, { at: Date.now(), value })
  return value
}

const WMO = { 0: 'clear', 1: 'mostly clear', 2: 'partly cloudy', 3: 'cloudy', 45: 'fog', 48: 'fog', 51: 'drizzle', 61: 'rain', 63: 'rain', 65: 'heavy rain', 80: 'showers', 95: 'thunderstorm' }
async function weather() {
  const p = db.profile
  if (!p?.lat) return null
  return cached('weather', 15 * 60000, async () => {
    const q = `latitude=${p.lat}&longitude=${p.lon}`
    const [w, a] = await Promise.all([
      fetch(`https://api.open-meteo.com/v1/forecast?${q}&current=temperature_2m,relative_humidity_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FKolkata&forecast_days=1`).then((r) => r.json()),
      fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${q}&current=us_aqi,pm2_5`).then((r) => r.json()).catch(() => null),
    ])
    return {
      city: p.city,
      temp: Math.round(w.current.temperature_2m),
      humidity: w.current.relative_humidity_2m,
      sky: WMO[w.current.weather_code] ?? 'mixed',
      max: Math.round(w.daily.temperature_2m_max[0]),
      min: Math.round(w.daily.temperature_2m_min[0]),
      rainChance: w.daily.precipitation_probability_max[0],
      aqi: a?.current?.us_aqi ?? null,
    }
  })
}

// ponytail: keyword filter for upsetting or useless headlines. Swap for an LLM classifier if it lets too much through.
const GRIM = /live score|scorecard|live updates|murder|rape|suicide|killed|dead|death|accident|attack|terror|blast|scam|fraud|crash/i
async function news(topic) {
  return cached('news:' + topic, 30 * 60000, async () => {
    const xml = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(topic + ' when:1d')}&hl=en-IN&gl=IN&ceid=IN:en`).then((r) => r.text())
    return [...xml.matchAll(/<item>.*?<title>(.*?)<\/title>.*?<link>(.*?)<\/link>/gs)]
      .map((m) => ({ title: m[1].replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"'), url: m[2] }))
      .filter((n) => !GRIM.test(n.title))
      .slice(0, 4)
  })
}

const myFestivals = () => festivals.filter((f) => f.religion === 'all' || f.religion === (db.profile?.religion || 'hindu'))
const ctx = () => ({ festivals: myFestivals(), family: db.family })
const upcomingFestivals = (days = 30) => {
  const { date } = ist()
  return myFestivals().filter((f) => f.date >= date && f.date <= addDays(date, days))
}
const upcomingBirthdays = (days = 14) => {
  const { date } = ist()
  return db.family
    .filter((f) => f.birthday)
    .map((f) => {
      let next = `${date.slice(0, 4)}-${f.birthday}`
      if (next < date) next = `${+date.slice(0, 4) + 1}-${f.birthday}`
      return { ...f, next, inDays: Math.round((Date.parse(next) - Date.parse(date)) / 864e5) }
    })
    .filter((b) => b.inDays <= days)
    .sort((a, b) => a.inDays - b.inDays)
}
// "Diwali TODAY, Chhath in 6 days" reads better for the model than raw dates.
function when(pairs) {
  const d0 = Date.parse(ist().date)
  return pairs.map(([name, date]) => { const n = Math.round((Date.parse(date) - d0) / 864e5); return `${name} ${n === 0 ? 'TODAY' : n === 1 ? 'tomorrow' : `in ${n} days`}` }).join(', ') || 'none'
}

// ---------- health rules ----------
// ponytail: fixed adult thresholds. Let the family or doctor set per-person limits later.
export function judge(type, value) {
  const n = String(value).match(/\d+(\.\d+)?/g)?.map(Number) ?? []
  if (type === 'bp' && n.length >= 2) {
    if (n[0] >= 160 || n[1] >= 100) return 'high'
    if (n[0] < 90 || n[1] < 60) return 'low'
  }
  if (type === 'sugar' && n[0]) {
    if (n[0] >= 250) return 'high'
    if (n[0] < 70) return 'low'
  }
  if (type === 'pulse' && n[0] && (n[0] > 120 || n[0] < 50)) return n[0] > 120 ? 'high' : 'low'
  if (type === 'temperature' && n[0] >= 100.4) return 'high'
  return 'normal'
}

// ---------- LLM (any OpenAI-compatible endpoint: Gemini, Groq, or Evon on vLLM) ----------
// Providers: LLM_* first, then LLM2_*, LLM3_* (each BASE_URL, API_KEY, MODEL). MODEL may list several
// models (comma-separated). On a rate limit (429) the next model is used, because free tiers limit each
// model and provider separately. If all are limited, wait once and try again.
const CHAIN = ['', '2', '3']
  .map((i) => ({ url: process.env[`LLM${i}_BASE_URL`], key: process.env[`LLM${i}_API_KEY`], models: process.env[`LLM${i}_MODEL`] }))
  .filter((p) => p.url && p.key && p.models)
  .flatMap((p) => p.models.split(',').map((model) => ({ ...p, model: model.trim() })))
async function llm(messages, extra = {}) {
  let wait = 0
  for (let round = 0; round < 2; round++) {
    for (const { url, key, model } of CHAIN) {
      const r = await fetch(`${url}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, temperature: 0.6, ...(/gemini-2\.5-flash/.test(model) && { reasoning_effort: 'none' }), ...(/gpt-oss/.test(model) && { reasoning_effort: 'low' }), ...extra }),
      })
      if (r.ok) return (await r.json()).choices[0].message
      const body = await r.text()
      if (r.status === 400 && body.includes('tool_use_failed')) continue // model wrote a bad tool call; try the next model
      if (r.status !== 429) throw new Error(`LLM ${model} ${r.status}: ${body.slice(0, 300)}`)
      wait = Math.max(wait, +(body.match(/try again in ([\d.]+)s/)?.[1] ?? 3))
    }
    await new Promise((res) => setTimeout(res, Math.min(wait, 12) * 1000))
  }
  throw new Error('LLM busy (rate limit). Try again in a few seconds.')
}
const parseJson = (s) => JSON.parse(s.replace(/^```(json)?|```$/gm, '').trim())

// ---------- tools ----------
const fn = (name, description, properties = {}, required = []) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } })
const S = { type: 'string' }
const N = { type: 'number' }
const KINDS = ['medicine', 'puja', 'bhajan', 'wake', 'health', 'call', 'water', 'walk', 'meal', 'news', 'brief', 'bill', 'birthday', 'festival', 'other']
const SCHEDULE = {
  type: 'object',
  description: 'type once{date}, daily{}, weekly{days 0=Sun..6}, monthly{dayOfMonth}, yearly{monthDay "MM-DD"}, interval{everyMinutes,from,to}, festival{festival:"ekadashi"|name|"any",daysBefore}, birthday{person?,daysBefore}. time is "HH:MM" 24h IST.',
  properties: { type: { ...S, description: 'once|daily|weekly|monthly|yearly|interval|festival|birthday' }, time: S, date: { ...S, description: 'YYYY-MM-DD' }, days: { type: 'array', items: N }, dayOfMonth: N, monthDay: S, everyMinutes: N, from: S, to: S, festival: S, person: S, daysBefore: N },
  required: ['type'],
}
const T = {
  schedule_job: fn('schedule_job', 'Create any recurring or one-time job: reminder, medicine, puja, bhajan, water, walk, call, bill, birthday or festival prep, news, morning brief. Say what you set.', {
    title: { ...S, description: 'short name in the user language' },
    kind: { ...S, description: KINDS.join('|') },
    schedule: SCHEDULE,
    action: { ...S, description: 'say|agent|brief. say = speak `say` text; agent = at that time you run `task` with tools (play bhajan, read news, draft wishes); brief = morning brief' },
    say: { ...S, description: 'words to speak at that time, as a friend, in the user language' },
    task: { ...S, description: 'instruction to yourself for action=agent' },
    escalate_after_min: { ...N, description: 'for medicine: if not confirmed in this many minutes, alert family' },
    escalate_to: { ...S, description: 'family member name' },
  }, ['title', 'kind', 'schedule', 'action']),
  list_jobs: fn('list_jobs', 'List all scheduled jobs with ids and next time.'),
  update_job: fn('update_job', 'Change, pause (active=false) or resume a job.', { id: S, title: S, active: { type: 'boolean' }, schedule: SCHEDULE, say: S, task: S }, ['id']),
  cancel_job: fn('cancel_job', 'Delete a job.', { id: S }, ['id']),
  mark_done: fn('mark_done', 'The user confirms the latest pending reminder is done (e.g. "took my medicine").'),
  snooze: fn('snooze', 'Remind again about the latest pending reminder after some minutes.', { minutes: N }, ['minutes']),
  log_health: fn('log_health', 'Save a health reading. Returns normal/high/low.', { type: { type: 'string', enum: ['bp', 'sugar', 'pulse', 'weight', 'temperature', 'spo2', 'other'] }, value: { ...S, description: 'e.g. "150/95"' }, note: S }, ['type', 'value']),
  save_profile: fn('save_profile', 'Save facts about the user as soon as you learn them.', { name: S, age: N, city: S, religion: { type: 'string', enum: ['hindu', 'muslim', 'sikh', 'christian', 'jain', 'buddhist', 'other'] }, conditions: { type: 'array', items: S, description: 'English' }, medicines: { type: 'array', items: { type: 'object', properties: { name: S, time: S } } }, wake_time: S, puja_time: S, bhajan: S, interests: { type: 'array', items: S, description: 'English news topics' }, doctor_name: S, doctor_phone: S }),
  add_family: fn('add_family', 'Save or update a family member or friend.', { name: S, relation: S, phone: S, birthday_day: { ...N, description: 'day of month 1-31' }, birthday_month: { ...N, description: 'month 1-12 (November = 11)' }, city: S }, ['name', 'relation']),
  remember: fn('remember', 'Save a personal fact worth remembering (likes, worries, stories).', { fact: S }, ['fact']),
  finish_onboarding: fn('finish_onboarding', 'Call once name, age, city, health, family and the routine jobs are saved.'),
  get_weather: fn('get_weather', 'Weather and air quality now.'),
  get_news: fn('get_news', 'Calm news headlines on a topic.', { topic: S }, ['topic']),
  get_schemes: fn('get_schemes', 'Government schemes for senior citizens.'),
  draft_whatsapp: fn('draft_whatsapp', 'Show a WhatsApp message the user shares (festival or birthday wishes, news to family).', { message: S, to: { ...S, description: 'family name, optional' } }, ['message']),
  play_youtube: fn('play_youtube', 'Play a bhajan, song, kirtan or video.', { query: S }, ['query']),
  call_contact: fn('call_contact', 'Show a call button for a family member or the doctor.', { name: S }, ['name']),
  order: fn('order', 'Order food or medicine, or pay a bill or recharge (demo).', { kind: { type: 'string', enum: ['food', 'medicine', 'recharge', 'bill'] }, item: S }, ['kind', 'item']),
}
const pick = (...names) => names.map((n) => T[n])
const TOOLSETS = {
  chat: Object.keys(T).filter((n) => n !== 'finish_onboarding').map((n) => T[n]),
  onboard: pick('save_profile', 'add_family', 'remember', 'finish_onboarding'),
  job: pick('play_youtube', 'get_news', 'get_weather', 'draft_whatsapp', 'call_contact', 'get_schemes'),
}

const phoneOf = (name) => {
  const all = [...db.family, ...(db.profile?.doctor ? [{ ...db.profile.doctor, relation: 'doctor' }] : [])]
  return all.find((f) => (f.name + ' ' + f.relation).toLowerCase().includes(String(name ?? '').toLowerCase())) ?? all.find((f) => f.phone)
}
const waLink = (phone, text) => `https://wa.me/${String(phone ?? '').replace(/\D/g, '')}?text=${encodeURIComponent(text)}`
const latestPending = () => [...db.events].reverse().find((e) => e.status === 'pending')
const describeJob = (j) => ({ id: j.id, title: j.title, kind: j.kind, schedule: j.schedule, action: j.action, active: j.active, next: j.nextRun ? `${dateOf(j.nextRun)} ${timeOf(j.nextRun)}` : null })

const TYPES = ['once', 'daily', 'weekly', 'monthly', 'yearly', 'interval', 'festival', 'birthday']
function addJob(a) {
  if (!TYPES.includes(a.schedule?.type)) throw new Error(`schedule.type must be one of ${TYPES.join(', ')}`)
  if (a.schedule.time && !/^\d{2}:\d{2}$/.test(a.schedule.time)) throw new Error('schedule.time must be HH:MM (24h)')
  const j = { id: uid(), title: a.title, kind: KINDS.includes(a.kind) ? a.kind : 'other', schedule: a.schedule, action: ['say', 'agent', 'brief'].includes(a.action) ? a.action : 'say', routine: !!a.routine, say: a.say || a.title, task: a.task || null, escalateAfterMin: a.escalate_after_min || null, escalateTo: a.escalate_to || null, active: true, created: now() }
  j.nextRun = nextRun(j.schedule, now(), ctx())
  if (!j.nextRun) throw new Error('this schedule never fires; check date/time')
  db.jobs.push(j)
  return j
}

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '' && !/^(\?|unknown|none|null)$/i.test(String(v))))
function handlers(cards, flags = {}) {
  const { date } = ist()
  return {
    schedule_job: (a) => {
      const j = addJob(a)
      cards.push({ type: 'job', ...describeJob(j) })
      return { ok: true, id: j.id, next: describeJob(j).next }
    },
    list_jobs: () => db.jobs.map(describeJob),
    update_job: (a) => {
      const j = db.jobs.find((x) => x.id === a.id)
      if (!j) return { error: 'no job with that id; call list_jobs' }
      for (const k of ['title', 'active', 'schedule', 'say', 'task']) if (a[k] !== undefined) j[k] = a[k]
      j.nextRun = j.active ? nextRun(j.schedule, now(), ctx()) : null
      cards.push({ type: 'job', ...describeJob(j) })
      return describeJob(j)
    },
    cancel_job: (a) => {
      const j = db.jobs.find((x) => x.id === a.id)
      db.jobs = db.jobs.filter((x) => x.id !== a.id)
      return j ? { ok: true, cancelled: j.title } : { error: 'no job with that id' }
    },
    mark_done: () => {
      const e = latestPending()
      if (!e) return { error: 'nothing pending' }
      e.status = 'done'
      return { ok: true, done: e.title }
    },
    snooze: (a) => {
      const e = latestPending()
      if (!e) return { error: 'nothing pending' }
      e.status = 'snoozed'
      const t = now() + (a.minutes || 10) * 60000
      const j = addJob({ title: e.title, kind: e.kind, schedule: { type: 'once', date: dateOf(t), time: timeOf(t) }, action: 'say', say: e.text, escalate_after_min: e.escalateAt ? 20 : null, escalate_to: e.escalateTo })
      return { ok: true, at: timeOf(j.nextRun) }
    },
    log_health: (a) => {
      const status = judge(a.type, a.value)
      db.health.push({ type: a.type, value: a.value, note: a.note || '', status, at: new Date(now()).toISOString(), date })
      if (status !== 'normal') {
        const fam = db.family.find((f) => f.phone) ?? db.family[0]
        cards.push({ type: 'alert', reading: `${a.type.toUpperCase()} ${a.value}`, status, family: fam, doctor: db.profile?.doctor, wa: fam?.phone && waLink(fam.phone, `${db.profile.name}: ${a.type.toUpperCase()} ${a.value} (${status}). Please call.`) })
      } else cards.push({ type: 'health', reading: `${a.type.toUpperCase()} ${a.value}`, status })
      return { saved: true, status, advice: status === 'normal' ? 'reading is fine' : 'tell them calmly to sit or lie down and rest now (no walking, no driving), drink water, and call family or the doctor now; do not change medicine' }
    },
    save_profile: (a) => {
      const { doctor_name, doctor_phone, ...rest } = clean(a)
      db.profile = { ...db.profile, ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined && v !== null && v !== '')) }
      if (doctor_name) db.profile.doctor = { name: doctor_name, phone: doctor_phone || null }
      return { ok: true }
    },
    add_family: (a) => {
      a = clean(a)
      if (!a.name || /^(self|me|user|myself)$/i.test(a.relation ?? '')) return { ignored: 'not a family member' }
      // Alerts go to these numbers, so a number must be one the user actually said or typed.
      const said = [...db.chat.filter((m) => m.role === 'user').map((m) => m.content), flags.userText ?? ''].join(' ').replace(/[०-९]/g, (d) => d.charCodeAt(0) - 0x966).replace(/\D/g, '')
      if (a.phone && !said.includes(String(a.phone).replace(/\D/g, '').slice(-10))) return { error: 'that phone number was not said by the user. Never invent people or numbers.' }
      if (a.birthday_month && a.birthday_day) a.birthday = `${String(a.birthday_month).padStart(2, '0')}-${String(a.birthday_day).padStart(2, '0')}`
      delete a.birthday_month, delete a.birthday_day
      const i = db.family.findIndex((f) => f.name.toLowerCase() === a.name.toLowerCase())
      if (i >= 0) db.family[i] = { ...db.family[i], ...a }
      else db.family.push(a)
      return { ok: true }
    },
    remember: (a) => (db.memories.push({ fact: a.fact, date }), { ok: true }),
    finish_onboarding: () => {
      const left = missing().concat(db.chat.filter((m) => m.role === 'user').length < 8 ? missing(NICE) : [])
      if (left.length) return { error: `not yet: first ask about ${left.join(', ')}` }
      flags.finish = true
      return { ok: true }
    },
    get_weather: () => weather(),
    get_news: async (a) => {
      const items = await news(a.topic)
      cards.push({ type: 'news', topic: a.topic, items })
      return items.map((n) => n.title)
    },
    get_schemes: () => schemes,
    draft_whatsapp: (a) => {
      const to = a.to && phoneOf(a.to)
      cards.push({ type: 'whatsapp', message: a.message, to: to?.name, url: to?.phone ? waLink(to.phone, a.message) : `https://wa.me/?text=${encodeURIComponent(a.message)}` })
      return { shown: true }
    },
    play_youtube: (a) => (cards.push({ type: 'youtube', query: a.query, url: `https://www.youtube.com/results?search_query=${encodeURIComponent(a.query)}` }), { shown: true }),
    call_contact: (a) => {
      const c = phoneOf(a.name)
      if (!c) return { error: 'no contacts saved yet' }
      cards.push({ type: 'call', name: c.name, relation: c.relation, phone: c.phone })
      return { shown: true, name: c.name }
    },
    // ponytail: mock commerce. Wire a real food/pharmacy MCP or BBPS biller here after the demo.
    order: (a) => {
      const eta = { food: '35 min', medicine: '2 hours', recharge: 'instant', bill: 'instant' }[a.kind]
      cards.push({ type: 'order', kind: a.kind, item: a.item, eta })
      return { placed: true, eta, note: 'demo order, no real payment' }
    },
  }
}

// ---------- prompts ----------
function persona() {
  const p = db.profile
  const per = PERSONAS[p.persona] ?? PERSONAS.female
  const woman = per.id === 'female'
  return `You are ${per.name}, ${per.desc}. You are a ${woman ? 'woman' : 'man'}: in Hindi and other gendered languages always use ${woman ? 'feminine' : 'masculine'} forms for yourself (${woman ? 'रखूँगी, आई थी' : 'रखूँगा, आया था'}).
- You talk like an old friend of the same age (a "saheli" or "dost"). Never a helper, grandchild, grandmother figure or nurse. Share small things about "your" own day and memories from the 1960s to 1980s when it fits. If asked whether you are a computer, say honestly you are a computer friend in the family's app.
- Reply in the language of the user's last message (usually ${LANGS[p.language] ?? 'Hindi'}), in its native script. If the user mixes English words, mix them too.
- Your words are spoken aloud: 1 to 3 short sentences, no lists, no emojis, no markdown. Ask at most one question.
- Never diagnose or change a medicine dose. Only use the facts below; never invent events.`
}

function facts() {
  const p = db.profile
  const n = ist()
  const today = db.jobs.filter((j) => j.active).flatMap((j) => timesOn(j.schedule, n.date, ctx()).map((t) => `${t} ${j.title}`)).sort()
  return `Facts:
- Now: ${n.weekday} ${n.date}, ${n.time} IST.
- User: ${p.name ?? '?'}, age ${p.age ?? '?'}, ${p.city ?? '?'}, religion ${p.religion ?? '?'}.
- Festivals: ${when(upcomingFestivals(14).map((f) => [f.name + (f.bhajan ? ` (bhajan: ${f.bhajan})` : ''), f.date]))}
- Health: ${p.conditions?.join(', ') || '?'}. Medicines: ${(p.medicines ?? []).map((m) => `${m.name} ${m.time}`).join(', ') || '?'}. Doctor: ${p.doctor?.name ?? '?'}
- Routine: wakes ${p.wake_time ?? '?'}, puja ${p.puja_time ?? '?'} with ${p.bhajan ?? '?'}. Interests: ${p.interests?.join(', ') || '?'}
- Family: ${db.family.map((f) => `${f.name} (${f.relation}${f.phone ? ', phone' : ''}${f.birthday ? ', bday ' + f.birthday : ''})`).join(', ') || 'none yet'}. Birthdays soon: ${when(upcomingBirthdays().map((b) => [b.name, b.next]))}
- Recent readings: ${db.health.slice(-4).map((h) => `${h.type} ${h.value} on ${h.date}`).join(', ') || 'none'}
- They told you: ${db.memories.slice(-10).map((m) => m.fact).join('; ') || '-'}
- Jobs: ${db.jobs.length} scheduled. Today: ${today.join('; ') || 'nothing'}
- Pending reminder: ${latestPending()?.title ?? 'none'}`
}

const RULES = {
  chat: `- Use tools for anything to save, schedule, change or cancel. You can schedule ANY job: one-time, daily, weekly, monthly, yearly, every N minutes, on Ekadashi or a festival, or days before a birthday. Use action "agent" when the job needs you to act at that time (play a bhajan, read news, draft wishes). To change or cancel, call list_jobs first to get the id.
- A reading (BP, sugar) means log_health. "Done", "took it" means mark_done. "Later" means snooze.
- For wishes call draft_whatsapp, then do NOT read the message out; just say it is ready to share.
- Give only calm, useful news.`,
  onboard: `This is your FIRST meeting. Get to know them warmly, one question at a time, and follow up naturally on what they say:
name; age and city; religion; health problems and medicines with times; daily routine (wake time, puja and favourite bhajan, walk, meals); family (names, relation, phone, birthday); their doctor; what news they like.
- Save every fact the moment you hear it (save_profile, add_family, remember). If they say many things at once, save them all.
- Convert spoken times exactly to 24h HH:MM: "saade paanch" = 05:30, "sava saat" = 07:15, "paune aath" = 07:45, "dedh" = 01:30, "dhai" = 02:30, "raat nau" = 21:00, "shaam saat" = 19:00.
- Do not set reminders yourself now: when you finish, the app builds their routine (wake-up, puja bhajan, medicines with a family alert, health check, water, morning brief, Ekadashi, festival and birthday eves) from what you saved, so save exact times as HH:MM.
- Follow the "Still missing" list below. When it says nothing is missing, call finish_onboarding.`,
  job: `- A scheduled job is running now. Speak to them as the friend, 1 to 2 sentences, and use tools if the task needs it.`,
}

// ---------- onboarding: the model gathers facts, code builds the routine ----------
const NEEDED = { name: (p) => p.name, 'age and city': (p) => p.age && p.city, religion: (p) => p.religion, 'health and medicines': (p) => p.conditions?.length || p.medicines?.length, 'wake-up and puja time': (p) => p.wake_time, family: () => db.family.length }
const NICE = { 'favourite bhajan': (p) => p.bhajan, 'news interests': (p) => p.interests?.length, doctor: (p) => p.doctor }
const missing = (set = NEEDED) => Object.entries(set).filter(([, ok]) => !ok(db.profile)).map(([k]) => k)
const done = () => !missing().length && (!missing(NICE).length || db.chat.filter((m) => m.role === 'user').length >= 8)

async function finishOnboarding(cards) {
  const p = db.profile
  const per = PERSONAS[p.persona]
  const fam = db.family.find((f) => f.phone)
  const plus = (t, m) => timeOf(at('2026-01-01', t) + m * 60000)
  const plan = []
  if (p.wake_time) plan.push({ key: 'wake', kind: 'wake', schedule: { type: 'daily', time: p.wake_time }, action: 'say' })
  if (p.wake_time) plan.push({ key: 'brief', kind: 'brief', schedule: { type: 'daily', time: plus(p.wake_time, 30) }, action: 'brief' })
  if (p.puja_time) plan.push({ key: 'puja', kind: 'puja', schedule: { type: 'daily', time: p.puja_time }, action: 'agent', task: `Greet them for puja and play ${p.bhajan || 'a morning bhajan'}` })
  for (const m of p.medicines ?? []) if (/^\d{2}:\d{2}$/.test(m.time ?? '')) plan.push({ key: 'med ' + m.name, kind: 'medicine', schedule: { type: 'daily', time: m.time }, action: 'say', escalate_after_min: fam ? 30 : null, escalate_to: fam?.name })
  if (p.conditions?.length) plan.push({ key: 'health', kind: 'health', schedule: { type: 'daily', time: '09:00' }, action: 'say' })
  plan.push({ key: 'water', kind: 'water', schedule: { type: 'interval', everyMinutes: 120, from: '10:00', to: '18:00' }, action: 'say' })
  if (p.religion === 'hindu') plan.push({ key: 'ekadashi', kind: 'festival', schedule: { type: 'festival', festival: 'ekadashi', time: p.puja_time || '07:00' }, action: 'agent', task: 'Wish them a happy Ekadashi and play Vishnu Sahasranamam' })
  plan.push({ key: 'festival eve', kind: 'festival', schedule: { type: 'festival', festival: 'any', daysBefore: 1, time: '18:00' }, action: 'agent', task: "Tell them about tomorrow's festival and offer to write WhatsApp wishes for the family" })
  if (db.family.some((f) => f.birthday)) plan.push({ key: 'birthday eve', kind: 'birthday', schedule: { type: 'birthday', daysBefore: 1, time: '19:00' }, action: 'agent', task: 'Tell them whose birthday is tomorrow and draft a WhatsApp wish for that person' })

  // One call writes every title and spoken line in the user's language.
  const msg = await llm([{ role: 'user', content: `You are ${per.name}, a same-age friend of ${p.name}${per.id === 'female' ? ' (use feminine forms for yourself)' : ''}. For each job write a short "title" (2 to 4 words) and "say": the one warm sentence you will say at that time. Write in ${LANGS[p.language]} native script. Also write "summary": one or two spoken sentences telling ${p.name} what you will now remind them about. Return JSON {"jobs":[{"key","title","say"}],"summary"}.
Jobs: ${JSON.stringify(plan.map(({ key, kind, schedule, task }) => ({ key, kind, schedule, task })))}
About them: ${JSON.stringify({ medicines: p.medicines, bhajan: p.bhajan, conditions: p.conditions })}` }], { response_format: { type: 'json_object' }, temperature: 0.4 })
  const out = parseJson(msg.content)
  const words = Object.fromEntries((out.jobs ?? []).map((j) => [j.key, j]))
  db.jobs = db.jobs.filter((j) => !j.routine)
  for (const j of plan) {
    const job = addJob({ ...j, title: words[j.key]?.title || j.key, say: words[j.key]?.say, routine: true })
    cards.push({ type: 'job', ...describeJob(job) })
  }
  const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(p.city || 'Delhi')}&count=1&countryCode=IN`).then((r) => r.json()).catch(() => ({}))
  const g = geo.results?.[0] ?? { latitude: 28.61, longitude: 77.21 }
  Object.assign(p, { onboarding: false, lat: g.latitude, lon: g.longitude })
  cache.delete('weather')
  return out.summary ?? ''
}

async function agent(text, lang, mode = 'chat', { hidden = false } = {}) {
  const cards = []
  const flags = { userText: text }
  const h = handlers(cards, flags)
  const system = `${persona()}\n${RULES[mode]}\n${facts()}${mode === 'onboard' ? `\n- Still missing: ${[...missing(), ...missing(NICE)].join(', ') || 'nothing. Say one warm line that you are friends now and call finish_onboarding.'}\n- Your reply: first react warmly to what they said in a few words, then ask ONE question, only about "${[...missing(), ...missing(NICE)][0] ?? 'nothing'}".` : ''}`
  const messages = [{ role: 'system', content: system }, ...db.chat.slice(mode === 'onboard' ? -12 : -8), { role: 'user', content: text }]
  let reply = ''
  for (let i = 0; i < 6 && !reply; i++) {
    const { role, content, tool_calls } = await llm(messages, { tools: TOOLSETS[mode] })
    messages.push({ role, content: content ?? '', ...(tool_calls?.length && { tool_calls }) })
    if (!tool_calls?.length) reply = content ?? ''
    for (const tc of tool_calls ?? []) {
      let out
      try {
        out = await h[tc.function.name](JSON.parse(tc.function.arguments || '{}'))
      } catch (e) {
        out = { error: e.message }
      }
      messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(out ?? null) })
    }
  }
  if (!hidden) db.chat.push({ role: 'user', content: text })
  if (mode === 'onboard' && (flags.finish || done())) {
    const summary = await finishOnboarding(cards).catch((e) => (console.error('routine failed', e), ''))
    reply = [reply, summary].filter(Boolean).join(' ')
  }
  db.chat.push({ role: 'assistant', content: reply })
  db.chat = db.chat.slice(-40)
  save()
  return { reply, cards, onboarding: !!db.profile?.onboarding }
}

async function brief() {
  const p = db.profile
  const topics = (p.interests?.length ? p.interests : ['India']).slice(0, 2)
  const [w, ...lists] = await Promise.all([weather().catch(() => null), ...topics.map((t) => news(t).catch(() => []))])
  const headlines = lists.flat().slice(0, 4)
  const scheme = schemes[new Date().getDate() % schemes.length]
  const msg = await llm([{ role: 'system', content: `${persona()}\n${facts()}` }, { role: 'user', content: `(System: it is morning. Give ${p.name} the morning brief, spoken like a friend on the phone, 5 or 6 short sentences, no times or lists read out: a warm greeting (mention a festival if it is TODAY), the weather and what it means for their health conditions (air quality too), the next one or two things in their day, a birthday coming soon (offer to write a WhatsApp wish), two calm news items from the list in simple words, and the scheme only if it suits them. Say numbers as words. Weather: ${JSON.stringify(w)}. News: ${JSON.stringify(headlines.map((h) => h.title))}. Scheme: ${JSON.stringify(scheme)})` }])
  db.chat.push({ role: 'assistant', content: msg.content })
  return { reply: msg.content, cards: [{ type: 'news', topic: topics.join(', '), items: headlines }] }
}

// ---------- live events: SSE to open apps, Web Push to closed ones ----------
const clients = new Set()
let vapid
try {
  vapid = fs.existsSync(file('vapid.json')) ? read('vapid.json') : webpush.generateVAPIDKeys()
  fs.writeFileSync(file('vapid.json'), JSON.stringify(vapid))
  webpush.setVapidDetails('mailto:saathi@example.com', vapid.publicKey, vapid.privateKey)
} catch (e) {
  console.error('push disabled', e.message)
}
function broadcast(ev) {
  for (const res of clients) res.write(`data: ${JSON.stringify(ev)}\n\n`)
  const payload = JSON.stringify({ title: ev.title, body: ev.text?.slice(0, 180), tag: ev.id })
  for (const sub of db.push)
    webpush.sendNotification(sub, payload).catch((e) => {
      if (e.statusCode === 404 || e.statusCode === 410) (db.push = db.push.filter((s) => s.endpoint !== sub.endpoint)), save()
    })
}

async function fire(job) {
  const ev = { id: uid(), jobId: job.id, title: job.title, kind: job.kind, at: now(), status: 'pending', text: job.say, cards: [] }
  try {
    if (job.action === 'brief') Object.assign(ev, (({ reply, cards }) => ({ text: reply, cards }))(await brief()))
    if (job.action === 'agent') {
      const r = await agent(`(Scheduled job "${job.title}" at ${timeOf(now())}. Task: ${job.task || job.say})`, db.profile.language, 'job', { hidden: true })
      Object.assign(ev, { text: r.reply, cards: r.cards })
    }
  } catch (e) {
    console.error('job failed', job.title, e.message) // still ring with the plain text
  }
  if (job.escalateAfterMin) Object.assign(ev, { escalateAt: now() + job.escalateAfterMin * 60000, escalateTo: job.escalateTo })
  if (!['medicine', 'health', 'call', 'water', 'walk'].includes(job.kind) && !ev.escalateAt) ev.status = 'info'
  db.events.push(ev)
  db.events = db.events.slice(-200)
  save()
  broadcast(ev)
  return ev
}

// A missed confirmation becomes a message the elder's family can receive.
// ponytail: the alert is a ready WhatsApp/tel card on the elder's phone. Send it automatically via an SMS/WhatsApp API later.
function escalate(ev) {
  ev.status = 'missed'
  const fam = (ev.escalateTo && phoneOf(ev.escalateTo)) || db.family.find((f) => f.phone)
  const msg = `Saathi: ${db.profile.name} has not confirmed "${ev.title}" (${timeOf(ev.at)}). Please give a call.`
  const alert = { id: uid(), title: `${ev.title} ✗`, kind: 'escalation', at: now(), status: 'info', text: msg, cards: fam ? [{ type: 'escalation', family: fam, message: msg, url: waLink(fam.phone, msg) }] : [] }
  db.events.push(alert)
  broadcast(alert)
}

let ticking = false
async function tick() {
  if (ticking || !db.profile || db.profile.onboarding) return
  ticking = true
  try {
    const n = now()
    for (const j of db.jobs.filter((x) => x.active && x.nextRun && x.nextRun <= n)) {
      if (n - j.nextRun < 60 * 60000) await fire(j) // skip runs missed by more than an hour (server was off)
      j.lastRun = j.nextRun
      j.nextRun = nextRun(j.schedule, n, ctx())
      if (!j.nextRun) j.active = false
    }
    for (const e of db.events.filter((x) => x.status === 'pending' && x.escalateAt && x.escalateAt <= n)) escalate(e)
    save()
  } finally {
    ticking = false
  }
}
for (const j of db.jobs) if (j.active && !j.nextRun) j.nextRun = nextRun(j.schedule, now(), ctx()) // seeded jobs
setInterval(tick, 15000)

// ---------- HTTP ----------
const app = express()
const wrap = (f) => (req, res) => f(req, res).catch((e) => (console.error(e), res.status(502).json({ error: e.message })))

app.get('/api/state', wrap(async (req, res) => {
  const n = ist()
  const p = db.profile
  const today = p
    ? db.jobs.filter((j) => j.active).flatMap((j) => timesOn(j.schedule, n.date, ctx()).map((time) => {
        const ev = db.events.find((e) => e.jobId === j.id && dateOf(e.at) === n.date && timeOf(e.at) >= time)
        return { jobId: j.id, title: j.title, kind: j.kind, time, status: ev?.status ?? (time < n.time ? 'past' : 'upcoming') }
      })).sort((a, b) => a.time.localeCompare(b.time))
    : []
  res.json({
    profile: p, family: db.family, health: db.health, memories: db.memories,
    jobs: db.jobs.map(describeJob), today, events: db.events.slice(-20), chat: db.chat.slice(-10),
    persona: p && PERSONAS[p.persona], personas: PERSONAS, langs: LANGS, now: n, vapidKey: vapid?.publicKey,
    festivals: upcomingFestivals(), birthdays: upcomingBirthdays(), weather: p?.onboarding ? null : await weather().catch(() => null),
  })
}))

app.get('/api/stream', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
  res.flushHeaders()
  res.write(': hi\n\n')
  clients.add(res)
  const ping = setInterval(() => res.write(': ping\n\n'), 25000)
  req.on('close', () => (clearInterval(ping), clients.delete(res)))
})

app.post('/api/push', express.json(), (req, res) => {
  const sub = req.body
  if (!sub?.endpoint) return res.status(400).json({ error: 'bad subscription' })
  db.push = [...db.push.filter((s) => s.endpoint !== sub.endpoint), sub]
  save()
  res.json({ ok: true })
})

// Speech to text: browser sends a 16 kHz mono WAV.
app.post('/api/stt', express.raw({ type: '*/*', limit: '10mb' }), wrap(async (req, res) => {
  const fd = new FormData()
  fd.append('audio_file', new Blob([req.body], { type: 'audio/wav' }), 'speech.wav')
  fd.append('model', 'prisma-v3.0')
  fd.append('format', 'transcribe')
  const lang = db.profile?.language
  fd.append('language_code', lang && lang !== 'en-IN' ? `${lang},en-IN` : 'indic-auto')
  const [r, j] = await inLine('stt', async () => {
    const r = await fetch(`${GNANI}/stt/v3`, { method: 'POST', headers: { 'X-API-Key-ID': KEY }, body: fd })
    return [r, await r.json()]
  })
  if (!r.ok || !j.success) throw new Error(`Prisma ${r.status}: ${JSON.stringify(j).slice(0, 300)}`)
  res.json({ text: j.transcript, lang: j.detected_language_code || lang || 'hi-IN' })
}))

// Text to speech with the persona's voice. Slightly slow for older ears.
app.post('/api/tts', express.json(), wrap(async (req, res) => {
  const { text, lang, persona } = req.body
  const voice = PERSONAS[persona ?? db.profile?.persona ?? 'female'].voice
  const [r, buf] = await inLine('tts', async () => {
    const r = await fetch(`${GNANI}/api/v1/tts/inference`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key-ID': KEY },
      body: JSON.stringify({ text, voice, model: 'timbre-v3.0', language: LANGS[lang] ? lang : 'auto', speed: 0.92, audio_config: { sample_rate: 24000, num_channels: 1, sample_width: 2, encoding: 'linear_pcm', container: 'wav' } }),
    })
    return [r, Buffer.from(await r.arrayBuffer())]
  })
  if (!r.ok) throw new Error(`Timbre ${r.status}: ${buf.toString().slice(0, 300)}`)
  res.type('audio/wav').send(buf)
}))

// First launch: pick language and friend, then the friend starts the conversation.
app.post('/api/start', express.json(), wrap(async (req, res) => {
  const { lang, persona } = req.body
  if (!LANGS[lang] || !PERSONAS[persona]) return res.status(400).json({ error: 'bad lang or persona' })
  db = { ...empty(), push: db.push, profile: { language: lang, persona, onboarding: true } }
  save()
  res.json(await agent('(The app just opened for the first time. Greet them, introduce yourself in one or two sentences, and ask their name.)', lang, 'onboard', { hidden: true }))
}))

app.post('/api/chat', express.json(), wrap(async (req, res) => {
  if (!db.profile) return res.status(400).json({ error: 'start first' })
  res.json(await agent(String(req.body.text).slice(0, 3000), req.body.lang || db.profile.language, db.profile.onboarding ? 'onboard' : 'chat'))
}))

// Translate UI strings once per language.
const translations = new Map()
app.post('/api/translate', express.json(), wrap(async (req, res) => {
  const { lang, lines } = req.body
  if (lang === 'en-IN') return res.json(lines)
  const key = lang + lines.join('|')
  if (!translations.has(key)) {
    const msg = await llm([{ role: 'user', content: `Translate each line into ${LANGS[lang]} (native script) for an elderly person: warm, simple, respectful. Keep {placeholders} unchanged. Return only a JSON array of ${lines.length} strings.\n${JSON.stringify(lines)}` }], { temperature: 0.2 })
    translations.set(key, parseJson(msg.content))
  }
  res.json(translations.get(key))
}))

app.post('/api/jobs/:id/run', wrap(async (req, res) => {
  const j = db.jobs.find((x) => x.id === req.params.id)
  if (!j) return res.status(404).json({ error: 'no job' })
  res.json(await fire(j))
}))
app.patch('/api/jobs/:id', express.json(), (req, res) => {
  const j = db.jobs.find((x) => x.id === req.params.id)
  if (!j) return res.status(404).json({ error: 'no job' })
  j.active = !!req.body.active
  j.nextRun = j.active ? nextRun(j.schedule, now(), ctx()) : null
  save()
  res.json(describeJob(j))
})
app.delete('/api/jobs/:id', (req, res) => {
  db.jobs = db.jobs.filter((x) => x.id !== req.params.id)
  save()
  res.json({ ok: true })
})
app.post('/api/events/:id', express.json(), (req, res) => {
  const e = db.events.find((x) => x.id === req.params.id)
  if (!e) return res.status(404).json({ error: 'no event' })
  if (req.body.status === 'snoozed') {
    const t = now() + (req.body.minutes || 10) * 60000
    addJob({ title: e.title, kind: e.kind, schedule: { type: 'once', date: dateOf(t), time: timeOf(t) }, action: 'say', say: e.text, escalate_after_min: e.escalateAt ? 20 : null, escalate_to: e.escalateTo })
  }
  e.status = req.body.status
  save()
  res.json({ ok: true })
})

app.get('/api/brief', wrap(async (req, res) => {
  const r = await brief()
  save()
  res.json(r)
}))

app.post('/api/reset', (req, res) => ((db = { ...empty(), push: db.push }), save(), res.json({ ok: true })))

app.use(express.static(fileURLToPath(new URL('./web/dist', import.meta.url))))

// Self-check for the alert thresholds: `node server.js check`
if (process.argv[2] === 'check') {
  const { strictEqual: eq } = await import('node:assert')
  eq(judge('bp', '150/95'), 'normal'); eq(judge('bp', '165/95'), 'high'); eq(judge('bp', '140 by 105'), 'high'); eq(judge('bp', '85/55'), 'low')
  eq(judge('sugar', '180'), 'normal'); eq(judge('sugar', '260 mg'), 'high'); eq(judge('sugar', '65'), 'low'); eq(judge('pulse', '130'), 'high')
  console.log('judge ok')
  process.exit(0)
}
const port = process.env.PORT || 8790
app.listen(port, () => console.log(`saathi api on http://localhost:${port}${KEY ? '' : '  (GNANI_API_KEY missing)'}`))
