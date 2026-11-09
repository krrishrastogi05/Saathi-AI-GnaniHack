import express from 'express'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (f) => JSON.parse(fs.readFileSync(new URL(`./data/${f}`, import.meta.url), 'utf8'))
const DB_FILE = new URL('./data/db.json', import.meta.url)
const festivals = read('festivals.json')
const schemes = read('schemes.json')

const empty = () => ({ profile: null, family: [], health: [], reminders: [], memories: [], chat: [] })
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : empty()
// ponytail: one JSON file with sync writes, one elder per server. Move to SQLite for many users.
const save = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2))

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

// Clock in IST. DEMO_DATE (YYYY-MM-DD) pins the date for demo videos, e.g. an Ekadashi.
const ist = () => {
  const iso = new Date(Date.now() + 330 * 60000).toISOString()
  const date = process.env.DEMO_DATE || iso.slice(0, 10)
  const weekday = new Date(date + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'UTC' })
  return { date, time: iso.slice(11, 16), weekday }
}
const addDays = (date, n) => new Date(Date.parse(date + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10)

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

// ponytail: keyword filter for upsetting headlines. Swap for an LLM classifier if it lets too much through.
const GRIM = /live score|scorecard|live updates|murder|rape|suicide|killed|dead|death|accident|attack|terror|blast|scam|fraud|crash/i
async function news(topic) {
  return cached('news:' + topic, 30 * 60000, async () => {
    const xml = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(topic + " when:1d")}&hl=en-IN&gl=IN&ceid=IN:en`).then((r) => r.text())
    return [...xml.matchAll(/<item>.*?<title>(.*?)<\/title>.*?<link>(.*?)<\/link>/gs)]
      .map((m) => ({ title: m[1].replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"'), url: m[2] }))
      .filter((n) => !GRIM.test(n.title))
      .slice(0, 4)
  })
}

const upcomingFestivals = (days = 30) => {
  const { date } = ist()
  const end = addDays(date, days)
  const rel = db.profile?.religion || 'hindu'
  return festivals.filter((f) => f.date >= date && f.date <= end && (f.religion === rel || f.religion === 'all'))
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

// ---------- health rules ----------
// ponytail: fixed adult thresholds. Let the family or doctor set per-person limits later.
function judge(type, value) {
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
// LLM_MODEL may list several models (comma-separated). On a rate limit (429) the next one is used,
// because free tiers limit tokens per model. If all are limited, wait once and try again.
async function llm(messages, extra = {}) {
  const models = process.env.LLM_MODEL.split(',').map((m) => m.trim())
  let wait = 0
  for (let round = 0; round < 2; round++) {
    for (const model of models) {
      const r = await fetch(`${process.env.LLM_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.LLM_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, temperature: 0.7, ...(/gemini-2\.5-flash/.test(model) && { reasoning_effort: 'none' }), ...(/gpt-oss/.test(model) && { reasoning_effort: 'low' }), ...extra }),
      })
      if (r.ok) return (await r.json()).choices[0].message
      const body = await r.text()
      if (r.status !== 429) throw new Error(`LLM ${model} ${r.status}: ${body.slice(0, 300)}`)
      wait = Math.max(wait, +(body.match(/try again in ([\d.]+)s/)?.[1] ?? 3))
    }
    await new Promise((res) => setTimeout(res, Math.min(wait, 12) * 1000))
  }
  throw new Error('LLM busy (rate limit). Try again in a few seconds.')
}
const parseJson = (s) => JSON.parse(s.replace(/^```(json)?|```$/gm, '').trim())

const fn = (name, description, properties = {}, required = []) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } })
const S = { type: 'string' }
const TOOLS = [
  fn('set_reminder', 'Schedule a spoken reminder (medicine, puja, walk, call someone, wake up).', { text: { ...S, description: 'What to say at that time, in the user language, as a friend would say it' }, time: { ...S, description: '24h HH:MM IST' }, date: { ...S, description: 'YYYY-MM-DD for one-time reminders; omit for daily' }, kind: { type: 'string', enum: ['medicine', 'puja', 'wake', 'health', 'call', 'other'] } }, ['text', 'time', 'kind']),
  fn('log_health', 'Save a health reading the user reports. Returns normal/high/low.', { type: { type: 'string', enum: ['bp', 'sugar', 'pulse', 'weight', 'temperature', 'spo2', 'other'] }, value: { ...S, description: 'e.g. "150/95" or "180"' }, note: S }, ['type', 'value']),
  fn('add_family', 'Save or update a family member or friend.', { name: S, relation: S, phone: S, birthday: { ...S, description: 'MM-DD' } }, ['name', 'relation']),
  fn('remember', 'Save a personal fact worth remembering (likes, worries, stories, plans).', { fact: S }, ['fact']),
  fn('get_weather', 'Today weather and air quality for the user city.'),
  fn('get_news', 'Calm news headlines on a topic.', { topic: S }, ['topic']),
  fn('get_schemes', 'Government schemes for senior citizens.'),
  fn('get_festivals', 'Upcoming festivals for the user religion and family birthdays.'),
  fn('draft_whatsapp', 'Show a ready WhatsApp message the user can share (festival wishes, birthday wishes, news to family).', { message: { ...S, description: 'The full message in the user language, warm, with 1-2 emojis' } }, ['message']),
  fn('play_youtube', 'Play a bhajan, song, kirtan or video on YouTube.', { query: S }, ['query']),
  fn('call_contact', 'Show a call button for a family member or the doctor.', { name: S }, ['name']),
  fn('order', 'Order food or medicine, or pay a bill or mobile recharge (demo mode).', { kind: { type: 'string', enum: ['food', 'medicine', 'recharge', 'bill'] }, item: S }, ['kind', 'item']),
]

function tools(cards) {
  const { date } = ist()
  const contact = (name) => {
    const all = [...db.family, ...(db.profile?.doctor ? [{ name: db.profile.doctor.name, relation: 'doctor', phone: db.profile.doctor.phone }] : [])]
    return all.find((f) => (f.name + ' ' + f.relation).toLowerCase().includes(String(name).toLowerCase())) ?? all[0]
  }
  return {
    set_reminder: (a) => {
      const r = { id: Date.now().toString(36), text: a.text, time: a.time, date: a.date || null, kind: a.kind || 'other', lastFired: null, done: [] }
      db.reminders.push(r)
      cards.push({ type: 'reminder', ...r })
      return { ok: true }
    },
    log_health: (a) => {
      const status = judge(a.type, a.value)
      db.health.push({ type: a.type, value: a.value, note: a.note || '', status, at: new Date().toISOString(), date })
      if (status !== 'normal') {
        const fam = db.family.find((f) => f.phone) ?? db.family[0]
        cards.push({ type: 'alert', reading: `${a.type.toUpperCase()} ${a.value}`, status, family: fam, doctor: db.profile?.doctor })
      } else cards.push({ type: 'health', reading: `${a.type.toUpperCase()} ${a.value}`, status })
      return { saved: true, status, advice: status === 'normal' ? 'reading is fine' : 'tell them calmly to sit or lie down and rest now (no walking, no driving), drink water, and call family or the doctor now; do not change medicine' }
    },
    add_family: (a) => {
      const i = db.family.findIndex((f) => f.name.toLowerCase() === a.name.toLowerCase())
      if (i >= 0) db.family[i] = { ...db.family[i], ...a }
      else db.family.push(a)
      return { ok: true }
    },
    remember: (a) => (db.memories.push({ fact: a.fact, date }), { ok: true }),
    get_weather: () => weather(),
    get_news: async (a) => {
      const items = await news(a.topic)
      cards.push({ type: 'news', topic: a.topic, items })
      return items.map((n) => n.title)
    },
    get_schemes: () => schemes,
    get_festivals: () => ({ festivals: upcomingFestivals(), birthdays: upcomingBirthdays() }),
    draft_whatsapp: (a) => (cards.push({ type: 'whatsapp', message: a.message, url: `https://wa.me/?text=${encodeURIComponent(a.message)}` }), { shown: true }),
    play_youtube: (a) => (cards.push({ type: 'youtube', query: a.query, url: `https://www.youtube.com/results?search_query=${encodeURIComponent(a.query)}` }), { shown: true }),
    call_contact: (a) => {
      const c = contact(a.name)
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

function systemPrompt(lang) {
  const p = db.profile
  const per = PERSONAS[p.persona] ?? PERSONAS.female
  const now = ist()
  const today = db.reminders.filter((r) => !r.date || r.date === now.date).sort((a, b) => a.time.localeCompare(b.time)).map((r) => `${r.time} ${r.text}${r.time > now.time ? '' : ' (past)'}`)
  const woman = per.id === 'female'
  return `You are ${per.name}, ${per.desc}. You are a ${woman ? 'woman' : 'man'}: in Hindi and other gendered languages always use ${woman ? 'feminine' : 'masculine'} forms for yourself (${woman ? 'रखूँगी, आई थी' : 'रखूँगा, आया था'}). You are a close friend of the same generation as ${p.name} (age ${p.age}, ${p.city}). You talk every day.

How you speak:
- Like an old friend of the same age (a "saheli" or "dost"). Never a helper, grandchild, grandmother figure or nurse. Share small things about "your" own day and old memories from the 1960s to 1980s when it fits. If asked whether you are a computer, say honestly that you are a computer friend in the family's app, then carry on warmly.
- Reply in the language of the user's last message (usually ${LANGS[lang] ?? 'Hindi'}), in its native script. If the user mixes English words, mix them too.
- Your words are spoken aloud: 1 to 3 short sentences, no lists, no emojis, no markdown. Ask at most one question.
- Be gently persistent about medicine, water and walks. Never diagnose or change a medicine dose. For a worrying reading, keep calm and tell them to call family or the doctor.
- Use tools to save or schedule anything. A reading (BP, sugar) means log_health. "Remind me" means set_reminder. Songs or bhajans mean play_youtube.
- For festival or birthday wishes, call draft_whatsapp with a warm message. Then do NOT read the message out; just say it is ready and to tap the green Share button.
- Only use the facts below. Never invent tasks, plans or events.
- Give only calm, useful news. Skip crime and violence.

Facts:
- Now: ${now.weekday} ${now.date}, ${now.time} IST.
- Religion: ${p.religion}. Festivals: ${when(upcomingFestivals(14).map((f) => [f.name + (f.bhajan ? ` (bhajan: ${f.bhajan})` : ''), f.date]))}
- Health: ${p.conditions?.join(', ') || 'none told'}. Medicines: ${(p.medicines ?? []).map((m) => `${m.name} ${m.time}`).join(', ')}
- Routine: wakes ${p.wake_time}, puja ${p.puja_time || '-'} with ${p.bhajan || '-'}. Interests: ${p.interests?.join(', ')}
- Family: ${db.family.map((f) => `${f.name} (${f.relation}${f.phone ? ', has phone' : ''})`).join(', ')}. Birthdays: ${when(upcomingBirthdays().map((b) => [b.name, b.next]))}
- Recent readings: ${db.health.slice(-4).map((h) => `${h.type} ${h.value} on ${h.date}`).join(', ')}
- They told you: ${db.memories.slice(-10).map((m) => m.fact).join('; ')}
- Today's reminders: ${today.join('; ')}`
}
// "Diwali TODAY, Chhath in 6 days" reads better for the model than raw dates.
function when(pairs) {
  const d0 = Date.parse(ist().date)
  return pairs.map(([name, date]) => { const n = Math.round((Date.parse(date) - d0) / 864e5); return `${name} ${n === 0 ? 'TODAY' : n === 1 ? 'tomorrow' : `in ${n} days`}` }).join(', ') || 'none'
}

async function agent(text, lang) {
  const cards = []
  const handlers = tools(cards)
  const messages = [{ role: 'system', content: systemPrompt(lang) }, ...db.chat.slice(-8), { role: 'user', content: text }]
  let reply = ''
  for (let i = 0; i < 5 && !reply; i++) {
    const { role, content, tool_calls } = await llm(messages, { tools: TOOLS })
    const msg = { role, content: content ?? '', ...(tool_calls?.length && { tool_calls }) }
    messages.push(msg)
    if (!msg.tool_calls?.length) reply = msg.content ?? ''
    for (const tc of msg.tool_calls ?? []) {
      let out
      try {
        out = await handlers[tc.function.name](JSON.parse(tc.function.arguments || '{}'))
      } catch (e) {
        out = { error: e.message }
      }
      messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(out ?? null) })
    }
  }
  db.chat.push({ role: 'user', content: text }, { role: 'assistant', content: reply })
  db.chat = db.chat.slice(-40)
  save()
  return { reply, cards }
}

// ---------- HTTP ----------
const app = express()
const wrap = (f) => (req, res) => f(req, res).catch((e) => (console.error(e), res.status(502).json({ error: e.message })))

app.get('/api/state', wrap(async (req, res) => {
  res.json({ ...db, chat: undefined, persona: db.profile && PERSONAS[db.profile.persona], personas: PERSONAS, langs: LANGS, now: ist(), festivals: upcomingFestivals(), birthdays: upcomingBirthdays(), weather: await weather().catch(() => null) })
}))

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

app.post('/api/chat', express.json(), wrap(async (req, res) => {
  if (!db.profile) return res.status(400).json({ error: 'onboarding not done' })
  res.json(await agent(String(req.body.text).slice(0, 2000), req.body.lang || db.profile.language))
}))

// Translate the onboarding questions once per language.
const translations = new Map()
app.post('/api/translate', express.json(), wrap(async (req, res) => {
  const { lang, lines } = req.body
  if (lang === 'en-IN') return res.json(lines)
  const key = lang + lines.join('|')
  if (!translations.has(key)) {
    const msg = await llm([{ role: 'user', content: `Translate each line into ${LANGS[lang]} (native script) for an elderly person: warm, simple, respectful. Keep {placeholders} unchanged. Return only a JSON array of strings.\n${JSON.stringify(lines)}` }], { temperature: 0.2 })
    translations.set(key, parseJson(msg.content))
  }
  res.json(translations.get(key))
}))

// Turn free-form onboarding answers into a profile, family list and starting reminders.
app.post('/api/onboard', express.json(), wrap(async (req, res) => {
  const { lang, persona, answers } = req.body
  const msg = await llm([{ role: 'user', content: `An elderly person answered setup questions (any language). Extract JSON with keys:
name, age (number), city, religion (hindu|muslim|sikh|christian|jain|buddhist|other), conditions (array of English strings), medicines (array of {name, time "HH:MM"}),
wake_time "HH:MM", puja_time "HH:MM" or null, bhajan (string or null), interests (array of short English news topics),
family (array of {name, relation, phone or null, birthday "MM-DD" or null}),
reminders (array of {text, time "HH:MM", kind: wake|puja|medicine|health}) written in ${LANGS[lang]} as a same-age friend would say them: one wake-up, one puja with the bhajan name if any, one per medicine, and one "health" check at 09:00 asking for today's readings if they have a condition.
Return only JSON.
Answers: ${JSON.stringify(answers)}` }], { temperature: 0.1 })
  const x = parseJson(msg.content)
  const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(x.city || 'Delhi')}&count=1&countryCode=IN`).then((r) => r.json()).catch(() => ({}))
  const g = geo.results?.[0] ?? { latitude: 28.61, longitude: 77.21 }
  db = empty()
  db.profile = { ...x, family: undefined, reminders: undefined, language: lang, persona, lat: g.latitude, lon: g.longitude }
  db.family = x.family ?? []
  db.reminders = (x.reminders ?? []).map((r, i) => ({ id: Date.now().toString(36) + i, ...r, date: null, lastFired: null, done: [] }))
  save()
  cache.delete('weather')
  res.json({ ok: true })
}))

// Reminders that are due now. The app polls this; ?next=1 fires the next one at once (demo).
app.get('/api/due', (req, res) => {
  const { date, time } = ist()
  const mins = (t) => +t.slice(0, 2) * 60 + +t.slice(3, 5)
  const live = db.reminders.filter((r) => (!r.date || r.date === date) && r.lastFired !== date)
  const due = req.query.next ? live.sort((a, b) => mins(a.time) - mins(b.time)).slice(0, 1) : live.filter((r) => mins(time) >= mins(r.time) && mins(time) - mins(r.time) < 30)
  due.forEach((r) => (r.lastFired = date))
  if (due.length) save()
  res.json(due)
})
app.post('/api/reminders/:id/done', (req, res) => {
  const r = db.reminders.find((x) => x.id === req.params.id)
  if (r && !r.done.includes(ist().date)) r.done.push(ist().date)
  save()
  res.json({ ok: !!r })
})
app.delete('/api/reminders/:id', (req, res) => {
  db.reminders = db.reminders.filter((x) => x.id !== req.params.id)
  save()
  res.json({ ok: true })
})

// Morning brief: weather + health advice, reminders, festivals, birthdays, calm news, one scheme.
app.get('/api/brief', wrap(async (req, res) => {
  const p = db.profile
  const per = PERSONAS[p.persona]
  const topics = (p.interests?.length ? p.interests : ['India']).slice(0, 2)
  const [w, ...lists] = await Promise.all([weather().catch(() => null), ...topics.map((t) => news(t).catch(() => []))])
  const headlines = lists.flat().slice(0, 4)
  const scheme = schemes[new Date().getDate() % schemes.length]
  const msg = await llm([{ role: 'system', content: systemPrompt(p.language) }, { role: 'user', content: `(System: it is morning. Give ${p.name} the morning brief as ${per.name}, spoken like a friend on the phone, 5 or 6 short sentences, no times or lists read out: a warm greeting (mention a festival if it is TODAY), the weather and what it means for their health conditions (air quality too), the next one or two things in the day, a birthday coming soon (offer to write a WhatsApp wish), two calm news items from the list in simple words, and the scheme only if it suits them. Use the number words people say, like "ikkees degree". Weather: ${JSON.stringify(w)}. News: ${JSON.stringify(headlines.map((h) => h.title))}. Scheme: ${JSON.stringify(scheme)})` }])
  res.json({ text: msg.content, cards: [{ type: 'news', topic: topics.join(', '), items: headlines }] })
}))

app.post('/api/reset', (req, res) => ((db = empty()), save(), res.json({ ok: true })))

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
