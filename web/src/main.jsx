import { StrictMode, useEffect, useRef, useState, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import { record, speak, stopSpeaking } from './audio.js'
import Avatar from './Avatar.jsx'
import './styles.css'

// ---------- api + i18n ----------
async function api(path, body, opts = {}) {
  const init = body === undefined ? { method: opts.method } : opts.raw ? { method: 'POST', body } : { method: opts.method || 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  const r = await fetch('/api' + path, init)
  const j = await r.json()
  if (!r.ok) throw new Error(j.error || r.statusText)
  return j
}

// English source strings. Each language is translated once by the LLM and cached on the device.
const EN = {
  chooseFriend: 'Choose your friend',
  hear: 'Hear voice',
  female_intro: 'Namaste! I am Kamla. I taught in a school for thirty years, and now I have a lot of time for chit-chat. Shall we be friends?',
  male_intro: 'Namaste! I am Ramesh. I was a railway station master for thirty-five years. I have many stories to share. Shall we be friends?',
  female_role: 'Retired teacher, 71',
  male_role: 'Retired station master, 73',
  start: 'Start talking',
  back: 'Back',
  tapSpeak: 'Tap and speak',
  typeHere: 'Or type here…',
  listening: 'Listening… speak now',
  thinking: 'Thinking…',
  speaking: 'Speaking… tap to stop',
  gettingToKnow: 'Getting to know you',
  cName: 'Name',
  cPlace: 'Age and city',
  cFaith: 'Religion',
  cHealth: 'Health',
  cRoutine: 'Daily routine',
  cFamily: 'Family',
  cNews: 'Favourite news',
  today: 'Today',
  health: 'Health',
  family: 'Family',
  routine: 'Routine',
  morning: 'Morning talk',
  morningSub: 'Weather, news and today’s plan',
  todayPlan: 'Today’s plan',
  done: 'Done',
  snooze: 'In 10 minutes',
  ok: 'OK',
  share: 'Share on WhatsApp',
  call: 'Call',
  play: 'Play on YouTube',
  alertTitle: 'This reading needs care. Please sit and rest.',
  healthHint: 'Just say it: “My BP today is 140 by 90”',
  routineHint: 'Just say it: “Remind me to drink water every 2 hours” or “Every Ekadashi play Vishnu Sahasranamam”',
  noReadings: 'No readings yet',
  noJobs: 'Nothing scheduled yet',
  birthdayIn: 'Birthday in {n} days',
  birthdayToday: 'Birthday today!',
  wish: 'Write a wish',
  elderLine: 'Elder helpline 14567',
  orderPlaced: 'Order placed (demo)',
  greet: 'Namaste, {name}',
  firstHello: 'Tap the big button and talk to me about anything.',
  aqi: 'Air',
  send: 'Send',
  daily: 'Every day',
  monthly: 'Every month on {n}',
  every: 'Every {n}',
  ekadashi: 'Every Ekadashi',
  everyBirthday: 'Every birthday',
  next: 'Next',
  tryNow: 'Try now',
  paused: 'Paused',
  missed: 'Not confirmed',
  tellFamily: 'Tell {name} on WhatsApp',
}
const keys = Object.keys(EN)

function useT(lang) {
  const [dicts, setDicts] = useState({})
  useEffect(() => {
    if (!lang || dicts[lang]) return
    try {
      const saved = JSON.parse(localStorage.getItem('saathi.t2.' + lang))
      if (saved && Object.keys(saved).length === keys.length) return setDicts((d) => ({ ...d, [lang]: saved }))
    } catch {}
    api('/translate', { lang, lines: Object.values(EN) })
      .then((arr) => {
        const d = Object.fromEntries(keys.map((k, i) => [k, arr[i] || EN[k]]))
        try { localStorage.setItem('saathi.t2.' + lang, JSON.stringify(d)) } catch {}
        setDicts((x) => ({ ...x, [lang]: d }))
      })
      .catch(() => setDicts((x) => ({ ...x, [lang]: EN })))
  }, [lang])
  const dict = dicts[lang]
  const t = useCallback((k, vars = {}) => (dict?.[k] ?? EN[k] ?? k).replace(/\{(\w+)\}/g, (_, v) => vars[v] ?? ''), [dict])
  return [t, !!dict || lang === 'en-IN']
}

const NATIVE = { 'hi-IN': 'हिन्दी', 'en-IN': 'English', 'ta-IN': 'தமிழ்', 'te-IN': 'తెలుగు', 'kn-IN': 'ಕನ್ನಡ', 'ml-IN': 'മലയാളം', 'mr-IN': 'मराठी', 'pa-IN': 'ਪੰਜਾਬੀ', 'bn-IN': 'বাংলা', 'gu-IN': 'ગુજરાતી' }
const KIND = { medicine: '💊', puja: '🪔', bhajan: '🎵', wake: '🌅', health: '🩺', call: '📞', water: '💧', walk: '🚶', meal: '🍲', news: '📰', brief: '☀️', bill: '🧾', birthday: '🎂', festival: '🪔', escalation: '⚠️', other: '⏰' }

// Human label for a job schedule, in the user's language (weekday and month names come from Intl).
function label(s, t, lang) {
  const day = (iso) => new Date(iso + 'T12:00').toLocaleDateString(lang, { day: 'numeric', month: 'short' })
  const wd = (d) => new Date(Date.UTC(2026, 10, 8 + +d)).toLocaleDateString(lang, { weekday: 'short', timeZone: 'UTC' }) // 8 Nov 2026 is a Sunday
  const before = s.daysBefore ? ` −${s.daysBefore}d` : ''
  switch (s.type) {
    case 'daily': return `${t('daily')} · ${s.time}`
    case 'weekly': return `${(s.days ?? []).map(wd).join(', ')} · ${s.time}`
    case 'monthly': return `${t('monthly', { n: s.dayOfMonth })} · ${s.time}`
    case 'yearly': return `${day('2026-' + s.monthDay)} · ${s.time}`
    case 'once': return `${day(s.date)} · ${s.time}`
    case 'interval': return `${t('every', { n: s.everyMinutes % 60 === 0 ? s.everyMinutes / 60 + 'h' : s.everyMinutes + 'm' })} · ${s.from || '08:00'}–${s.to || '20:00'}`
    case 'festival': return `${/ekadashi/i.test(s.festival) ? t('ekadashi') : s.festival}${before} · ${s.time}`
    case 'birthday': return `🎂 ${s.person || t('everyBirthday')}${before} · ${s.time}`
    default: return s.time ?? ''
  }
}

// Web Push so jobs ring even when the app is closed. Must start from a tap (permission prompt).
async function enablePush(key, ask) {
  try {
    if (!key || !('serviceWorker' in navigator) || !('PushManager' in window)) return
    if (Notification.permission !== 'granted' && (!ask || (await Notification.requestPermission()) !== 'granted')) return
    const reg = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready
    const raw = atob(key.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (key.length % 4)) % 4))
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, (c) => c.charCodeAt(0)) }))
    await api('/push', sub.toJSON())
  } catch (e) {
    console.warn('push not enabled', e)
  }
}

// ---------- shared UI ----------
function Orb({ phase, level, onClick, label, size = 'lg' }) {
  return (
    <button className={`orb orb-${size} ${phase}`} onClick={onClick} style={{ '--lvl': level }} aria-label={label}>
      <span className="orb-ring" />
      <span className="orb-ring r2" />
      <svg viewBox="0 0 24 24" width="40%" height="40%" aria-hidden>
        {phase === 'speaking' ? <path d="M6 6h12v12H6z" fill="currentColor" /> : <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-2.1a7 7 0 0 0 6-6.9z" fill="currentColor" />}
      </svg>
    </button>
  )
}

function useRecorder(onBlob) {
  const [phase, setPhase] = useState('idle')
  const [level, setLevel] = useState(0)
  const rec = useRef(null)
  const toggle = async () => {
    if (phase === 'listening') return rec.current?.stop()
    if (phase === 'speaking') return stopSpeaking()
    if (phase !== 'idle') return
    stopSpeaking()
    try {
      rec.current = await record({ onLevel: setLevel })
      setPhase('listening')
      const blob = await rec.current.result
      setLevel(0)
      if (!blob) return setPhase('idle')
      await onBlob(blob, setPhase)
    } catch (e) {
      console.error(e)
      alert(e.message)
    }
    setPhase('idle')
  }
  return { phase, setPhase, level, toggle }
}


// ---------- first launch: language + friend ----------
function Welcome({ state, onStarted }) {
  const [lang, setLang] = useState(null)
  const [persona, setPersona] = useState(null)
  const [busy, setBusy] = useState(false)
  const [t, ready] = useT(lang)

  const start = async () => {
    setBusy(true)
    stopSpeaking()
    enablePush(state.vapidKey, true) // the tap allows the notification prompt
    try {
      const r = await api('/start', { lang, persona })
      await onStarted()
      speak(r.reply, lang, persona)
    } catch (e) {
      alert(e.message)
      setBusy(false)
    }
  }

  return (
    <div className="onb">
      {!lang ? (
        <div className="fade">
          <div className="brand">
            <img src="/icon.svg" alt="" />
            <h1>Saathi</h1>
            <p>साथी · हम-उम्र दोस्त · A friend of your own age</p>
          </div>
          <h2>भाषा चुनें · Choose language</h2>
          <div className="lang-grid">
            {Object.entries(NATIVE).map(([code, name]) => (
              <button key={code} className="lang" onClick={() => setLang(code)}>{name}</button>
            ))}
          </div>
        </div>
      ) : (
        <div className="fade">
          <h2 className="center">{t('chooseFriend')}</h2>
          <div className="friends">
            {Object.values(state.personas).map((p) => (
              <div key={p.id} className={`friend ${persona === p.id ? 'on' : ''}`} onClick={() => setPersona(p.id)}>
                <Avatar persona={p} portrait />
                <b>{p.name}</b>
                <small>{t(p.id + '_role')}</small>
                <button className="ghost" onClick={(e) => (e.stopPropagation(), setPersona(p.id), speak(t(p.id + '_intro'), lang, p.id))}>▶ {t('hear')}</button>
              </div>
            ))}
          </div>
          <div className="row">
            <button className="ghost" onClick={() => (setLang(null), setPersona(null))}>{t('back')}</button>
            <button className="primary" disabled={!persona || !ready || busy} onClick={start}>{busy ? '…' : t('start') + ' →'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- cards from the agent ----------
function Card({ c, t, lang }) {
  if (c.type === 'whatsapp')
    return (
      <div className="card wa">
        <p className="msg">{c.message}</p>
        <a className="btn wa-btn" href={c.url} target="_blank" rel="noreferrer">🟢 {t('share')}{c.to ? ` · ${c.to}` : ''}</a>
      </div>
    )
  if (c.type === 'youtube')
    return (
      <a className="card yt" href={c.url} target="_blank" rel="noreferrer">
        <span className="yt-play">▶</span>
        <div><b>{c.query}</b><small>{t('play')}</small></div>
      </a>
    )
  if (c.type === 'call')
    return (
      <div className="card call">
        <div><b>{c.name}</b><small>{c.relation} · {c.phone || '—'}</small></div>
        <a className="btn call-btn" href={`tel:${c.phone ?? ''}`}>📞 {t('call')}</a>
      </div>
    )
  if (c.type === 'alert')
    return (
      <div className="card alert">
        <b>⚠️ {c.reading}</b>
        <p>{t('alertTitle')}</p>
        <div className="row wrap">
          {c.family && <a className="btn call-btn" href={`tel:${c.family.phone ?? ''}`}>📞 {c.family.name}</a>}
          {c.wa && <a className="btn wa-btn" href={c.wa} target="_blank" rel="noreferrer">🟢 {c.family?.name}</a>}
          {c.doctor && <a className="btn call-btn" href={`tel:${c.doctor.phone ?? ''}`}>🩺 {c.doctor.name}</a>}
          <a className="btn ghost" href="tel:14567">{t('elderLine')}</a>
        </div>
      </div>
    )
  if (c.type === 'escalation')
    return (
      <div className="card alert">
        <p className="msg">{c.message}</p>
        <div className="row wrap">
          <a className="btn wa-btn" href={c.url} target="_blank" rel="noreferrer">🟢 {t('tellFamily', { name: c.family.name })}</a>
          <a className="btn call-btn" href={`tel:${c.family.phone ?? ''}`}>📞 {c.family.name}</a>
        </div>
      </div>
    )
  if (c.type === 'job')
    return (
      <div className="chip job">
        {KIND[c.kind] ?? '⏰'} <b>{c.title}</b> · {label(c.schedule, t, lang)}
      </div>
    )
  if (c.type === 'health') return <div className="chip ok">✓ {c.reading}</div>
  if (c.type === 'order') return <div className="card order">🛍️ <b>{c.item}</b><small>{t('orderPlaced')} · ETA {c.eta}</small></div>
  if (c.type === 'news')
    return (
      <div className="card news">
        <small>📰 {c.topic}</small>
        {c.items?.map((n) => <a key={n.url} href={n.url} target="_blank" rel="noreferrer">{n.title}</a>)}
      </div>
    )
  return null
}

function Spark({ values, color }) {
  if (values.length < 2) return null
  const min = Math.min(...values) - 5
  const max = Math.max(...values) + 5
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${40 - ((v - min) / (max - min)) * 36}`).join(' ')
  return (
    <svg viewBox="0 0 100 42" className="spark-svg" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  )
}

// Synthetic sample so a demo can show the whole onboarding in one turn.
const DEMO_INTRO = 'Main Shanti Devi hoon, 72 saal ki, Lucknow mein rehti hoon. Hindu hoon. Mujhe BP aur sugar hai, subah 8 baje Amlodipine aur raat 9 baje Metformin leti hoon. Subah 5:30 uthti hoon, 6:30 puja karti hoon, Hanuman Chalisa sunna pasand hai. Beta Rahul Bengaluru mein hai, phone 90000 00001, janamdin 12 November. Poti Anya ka janamdin 14 November. Beti Priya Pune mein, phone 90000 00002, janamdin 5 January. Cricket aur dharm ki khabrein pasand hain.'

// ---------- main screen (also the onboarding conversation) ----------
function Home({ state, reload }) {
  const p = state.profile
  const lang = p.language
  const onboarding = p.onboarding
  const [t] = useT(lang)
  const [tab, setTab] = useState('today')
  const [last, setLast] = useState(null)
  const [typing, setTyping] = useState(false)
  const [text, setText] = useState('')
  const [firing, setFiring] = useState(null)

  const reply = async (you, run, setPhase, replyLang = lang) => {
    setPhase('thinking')
    setLast({ you })
    const r = await run()
    setLast({ you, ...r })
    await reload()
    setPhase('speaking')
    await speak(r.reply, replyLang, p.persona)
  }
  const rec = useRecorder(async (blob, setPhase) => {
    setPhase('thinking')
    const s = await api('/stt', blob, { raw: true })
    if (!s.text?.trim()) return
    await reply(s.text, () => api('/chat', { text: s.text, lang: s.lang }), setPhase, s.lang)
  })
  const run = async (fn) => {
    try { await fn() } catch (e) { alert(e.message) }
    rec.setPhase('idle')
  }
  const say = (q, shown = q) => (setTab('today'), run(() => reply(shown, () => api('/chat', { text: q, lang }), rec.setPhase)))
  const sendText = () => {
    const q = text.trim()
    if (q) setText(''), say(q)
  }
  const brief = () => (setTab('today'), run(() => reply('☀️ ' + t('morning'), () => api('/brief'), rec.setPhase)))

  // Live job events from the server scheduler.
  useEffect(() => {
    enablePush(state.vapidKey, false)
    const es = new EventSource('/api/stream')
    es.onmessage = (m) => {
      const ev = JSON.parse(m.data)
      setFiring(ev)
      reload()
      if (ev.kind !== 'escalation') speak(ev.text, lang, p.persona)
    }
    return () => es.close()
  }, [])
  const closeEvent = async (status) => {
    const ev = firing
    setFiring(null)
    stopSpeaking()
    if (status) await api(`/events/${ev.id}`, { status }).catch(() => {})
    reload()
  }

  const w = state.weather
  const now = state.now
  const bp = state.health.filter((h) => h.type === 'bp')
  const sugar = state.health.filter((h) => h.type === 'sugar')
  const phaseLabel = { listening: t('listening'), thinking: t('thinking'), speaking: t('speaking') }[rec.phase]
  const festToday = state.festivals.find((f) => f.date === now.date)
  const checks = [
    ['cName', p.name], ['cPlace', p.age && p.city], ['cFaith', p.religion], ['cHealth', p.conditions?.length || p.medicines?.length],
    ['cRoutine', state.jobs.length >= 2], ['cFamily', state.family.length], ['cNews', p.interests?.length],
  ]

  return (
    <div className="home">
      <header className="top">
        <div>
          <small className="date" onDoubleClick={() => state.today.find((x) => x.status === 'upcoming') && api(`/jobs/${state.today.find((x) => x.status === 'upcoming').jobId}/run`, {})}>
            {new Date(now.date + 'T12:00').toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' })}
            {festToday && <span className="fest-tag"> · 🪔 {festToday.name}</span>}
          </small>
          <h1>{onboarding ? t('gettingToKnow') : t('greet', { name: p.name?.split(' ')[0] })}</h1>
        </div>
        {w && (
          <div className="weather">
            <b>{w.temp}°</b>
            <small>{w.sky}</small>
            {w.aqi != null && <small className={w.aqi > 150 ? 'bad' : w.aqi > 100 ? 'meh' : ''}>{t('aqi')} {w.aqi}</small>}
          </div>
        )}
      </header>

      <main className="scroll">
        {onboarding && (
          <>
            <div className="onb-hero">
              <Avatar persona={state.persona} phase={rec.phase} size={92} />
              <div>
                <b>{state.persona.name}</b>
                <small>{phaseLabel ?? t('tapSpeak')}</small>
              </div>
            </div>
            <div className="checks">
              {checks.map(([k, ok]) => <span key={k} className={`check ${ok ? 'on' : ''}`}>{ok ? '✓' : '○'} {t(k)}</span>)}
            </div>
            <div className="convo">
              {state.chat.slice(-6).map((m, i) => (
                <p key={i} className={`bubble ${m.role}`}>{m.content}</p>
              ))}
              {last?.you && !last.reply && <p className="bubble user">{last.you}</p>}
              {rec.phase === 'thinking' && <p className="bubble assistant"><span className="dots"><i /><i /><i /></span></p>}
            </div>
            {last?.cards?.map((c, i) => <Card key={i} c={c} t={t} lang={lang} />)}
            <button className="demo-fill" onClick={() => say(DEMO_INTRO, '(demo intro)')}>demo: say a sample introduction</button>
          </>
        )}

        {!onboarding && tab === 'today' && (
          <>
            <section className={`hero ${rec.phase}`}>
              <div className="hero-who">
                <Avatar persona={state.persona} phase={rec.phase} />
                <div>
                  <b>{state.persona.name}</b>
                  <small>{phaseLabel ?? t('tapSpeak')}</small>
                </div>
              </div>
              {last?.you && <p className="you">“{last.you}”</p>}
              <p className="said" onClick={() => last?.reply && speak(last.reply, lang, p.persona)}>
                {last ? last.reply ?? <span className="dots"><i /><i /><i /></span> : t('firstHello')}
              </p>
            </section>
            {last?.cards?.map((c, i) => <Card key={i} c={c} t={t} lang={lang} />)}

            <button className="brief" onClick={brief}>
              <span className="sun">☀️</span>
              <div><b>{t('morning')}</b><small>{t('morningSub')}</small></div>
              <span>▶</span>
            </button>

            {(state.festivals.length > 0 || state.birthdays.length > 0) && (
              <div className="chips">
                {state.birthdays.map((b) => (
                  <button key={b.name} className="chip bday" onClick={() => say(`Help me write a birthday WhatsApp wish for ${b.name} (${b.relation}), birthday ${b.next}.`, `${t('wish')}: ${b.name}`)}>
                    🎂 {b.name} · {b.inDays === 0 ? t('birthdayToday') : t('birthdayIn', { n: b.inDays })}
                  </button>
                ))}
                {state.festivals.slice(0, 3).map((f) => (
                  <span key={f.date + f.name} className="chip fest">🪔 {f.name} · {new Date(f.date + 'T12:00').toLocaleDateString(lang, { day: 'numeric', month: 'short' })}</span>
                ))}
              </div>
            )}

            <h3>{t('todayPlan')}</h3>
            <ol className="timeline">
              {state.today.map((r) => (
                <li key={r.jobId + r.time} className={r.status}>
                  <time>{r.time}</time>
                  <span className="k">{KIND[r.kind] ?? '⏰'}</span>
                  <p>{r.title}{r.status === 'missed' && <em> · {t('missed')}</em>}</p>
                </li>
              ))}
            </ol>
          </>
        )}

        {!onboarding && tab === 'routine' && (
          <>
            <p className="hint">🎙️ {t('routineHint')}</p>
            {state.jobs.length === 0 && <p className="empty">{t('noJobs')}</p>}
            {state.jobs.map((j) => (
              <div key={j.id} className={`card job-row ${j.active ? '' : 'off'}`}>
                <span className="k">{KIND[j.kind] ?? '⏰'}</span>
                <div className="grow">
                  <b>{j.title}</b>
                  <small>{label(j.schedule, t, lang)}{j.action === 'agent' ? ' · ✨' : ''}{!j.active ? ` · ${t('paused')}` : ''}</small>
                </div>
                <div className="job-actions">
                  <button className="mini" title={t('tryNow')} onClick={() => api(`/jobs/${j.id}/run`, {}).catch((e) => alert(e.message))}>▶</button>
                  <button className="mini" title={t('paused')} onClick={() => api(`/jobs/${j.id}`, { active: !j.active }, { method: 'PATCH' }).then(reload)}>{j.active ? '⏸' : '⏵'}</button>
                  <button className="mini" title="delete" onClick={() => api(`/jobs/${j.id}`, undefined, { method: 'DELETE' }).then(reload)}>✕</button>
                </div>
              </div>
            ))}
          </>
        )}

        {!onboarding && tab === 'health' && (
          <>
            <p className="hint">🎙️ {t('healthHint')}</p>
            <div className="metrics">
              <div className="metric"><small>BP</small><b>{bp.at(-1)?.value ?? '—'}</b><Spark values={bp.map((h) => parseInt(h.value))} color="var(--vermilion)" /></div>
              <div className="metric"><small>Sugar</small><b>{sugar.at(-1)?.value ?? '—'}</b><Spark values={sugar.map((h) => parseInt(h.value))} color="var(--brand)" /></div>
            </div>
            <ol className="readings">
              {state.health.length === 0 && <li className="empty">{t('noReadings')}</li>}
              {[...state.health].reverse().map((h, i) => (
                <li key={i} className={h.status}>
                  <b>{h.type.toUpperCase()}</b>
                  <span>{h.value}</span>
                  <small>{new Date(h.at).toLocaleString(lang, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</small>
                </li>
              ))}
            </ol>
          </>
        )}

        {!onboarding && tab === 'family' && (
          <>
            {state.family.map((f) => {
              const b = state.birthdays.find((x) => x.name === f.name)
              return (
                <div key={f.name} className="card person">
                  <div className="pav">{f.name[0]}</div>
                  <div className="grow">
                    <b>{f.name}</b>
                    <small>{f.relation}{b ? ` · 🎂 ${b.inDays === 0 ? t('birthdayToday') : t('birthdayIn', { n: b.inDays })}` : ''}</small>
                  </div>
                  {f.phone && <a className="btn call-btn sm" href={`tel:${f.phone}`}>📞</a>}
                </div>
              )
            })}
            <a className="card helpline" href="tel:14567">🆘 {t('elderLine')}</a>
          </>
        )}
      </main>

      <div className="dock">
        {typing ? (
          <form className="typebar" onSubmit={(e) => (e.preventDefault(), sendText())}>
            <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={t('typeHere')} />
            <button className="primary" aria-label={t('send')}>➤</button>
            <button type="button" className="ghost" onClick={() => setTyping(false)}>✕</button>
          </form>
        ) : (
          <>
            <button className="side" onClick={() => setTyping(true)} aria-label="keyboard">⌨️</button>
            <Orb phase={rec.phase} level={rec.level} onClick={() => (setTab('today'), rec.toggle())} label={t('tapSpeak')} />
            {onboarding ? <span className="side ghost-space" /> : <button className="side" onClick={brief} aria-label={t('morning')}>☀️</button>}
          </>
        )}
      </div>
      {!onboarding && (
        <nav className="tabs">
          {['today', 'routine', 'health', 'family'].map((k) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              <span>{{ today: '🏠', routine: '⏰', health: '❤️', family: '👨‍👩‍👧' }[k]}</span>
              {t(k)}
            </button>
          ))}
        </nav>
      )}

      {firing && (
        <div className="ring fade">
          <div className="ring-card">
            <div className="ring-icon">{KIND[firing.kind] ?? '⏰'}</div>
            <time>{new Date(firing.at).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}</time>
            <b className="ring-title">{firing.title}</b>
            {firing.kind !== 'escalation' && <p>{firing.text}</p>}
            {firing.cards?.map((c, i) => <Card key={i} c={c} t={t} lang={lang} />)}
            {firing.status === 'pending' ? (
              <>
                <button className="primary big" onClick={() => closeEvent('done')}>✓ {t('done')}</button>
                <button className="ghost" onClick={() => closeEvent('snoozed')}>⏰ {t('snooze')}</button>
              </>
            ) : (
              <button className="primary big" onClick={() => closeEvent()}>{t('ok')}</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function App() {
  const [state, setState] = useState(null)
  const [err, setErr] = useState(null)
  const reload = () => api('/state').then(setState).catch((e) => setErr(e.message))
  useEffect(() => void reload(), [])
  return (
    <div className="stage">
      <div className="phone">
        {err ? <p className="err">{err}</p> : !state ? <div className="boot"><img src="/icon.svg" alt="" /></div> : state.profile ? <Home state={state} reload={reload} /> : <Welcome state={state} onStarted={reload} />}
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
