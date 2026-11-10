import { useEffect, useRef, useState, useCallback } from 'react'
import {
  House, AlarmClock, HeartPulse, Users, Keyboard, Sunrise, Mic, Square, Pill, Flame, Music, Stethoscope, PhoneCall, Phone,
  Droplets, Footprints, UtensilsCrossed, Newspaper, Sun, Receipt, Cake, Sparkles, TriangleAlert, Bell, Play, Pause, Trash2,
  MessageCircle, ShoppingBag, Check, Cloud, CloudRain, CloudFog, CloudSun, Wind, X, SendHorizontal, WifiOff, ArrowRight,
  Volume2, LifeBuoy, Clock, ChevronLeft, Youtube, CircleCheck, Circle, Network, Truck, PackageCheck, ShieldAlert, Store, BadgePercent,
  SlidersHorizontal, Inbox,
} from 'lucide-react'
import LifeGraph from './LifeGraph.jsx'
import { record, speak, stopSpeaking } from './audio.js'
import Avatar from './Avatar.jsx'
import { api, report, untag } from './api.js'
import './styles.css'

// ---------- i18n ----------
// English source strings. Each language is translated once per speaker/listener gender and cached on the device.
const EN = {
  chooseFriend: 'Choose your friend',
  chooseSub: 'Someone your own age, to chat with every day',
  hear: 'Hear voice',
  female_intro: 'Arre, namaste! I am Kamla. Thirty years I taught little rascals in school, now I finally have time to chat. So, shall we be friends?',
  male_intro: 'Ram Ram! I am Ramesh. Thirty-five years I ran a railway station, so I have a story for every train. Shall we be friends?',
  female_role: 'Retired teacher · 71',
  male_role: 'Retired station master · 73',
  start: 'Let’s talk',
  back: 'Back',
  tapSpeak: 'Tap and talk to me',
  typeHere: 'Or type here…',
  listening: 'I’m listening…',
  thinking: 'Hmm, one second…',
  speaking: 'Tap to stop',
  gettingToKnow: 'Let’s get to know each other',
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
  morning: 'Morning chat',
  morningSub: 'Weather, news and what’s on today',
  todayPlan: 'Today',
  upNext: 'Up next',
  done: 'Done',
  snooze: 'In 10 minutes',
  ok: 'OK',
  share: 'Send on WhatsApp',
  call: 'Call',
  play: 'Play on YouTube',
  alertTitle: 'This reading is not good. Sit down and rest, and call someone now.',
  healthHint: 'Just tell me: “My BP today is 140 by 90”',
  routineHint: 'Just tell me: “Remind me to drink water every 2 hours” or “Every Ekadashi play Vishnu Sahasranamam”',
  noReadings: 'No readings yet. Tell me today’s BP or sugar.',
  noJobs: 'Nothing scheduled yet',
  birthdayIn: 'birthday in {n} days',
  birthdayToday: 'birthday today!',
  wish: 'Write a wish',
  elderLine: 'Elder helpline 14567',
  orderPlaced: 'Order placed (demo)',
  greet: 'Namaste, {name}',
  firstHello: 'So, how is your day going? Tap the big button and tell me everything.',
  send: 'Send',
  daily: 'Every day',
  monthly: 'Every month on {n}',
  every: 'Every {n}',
  ekadashi: 'Every Ekadashi',
  everyBirthday: 'Every birthday',
  tryNow: 'Try now',
  paused: 'Paused',
  missed: 'Not confirmed',
  tellFamily: 'Tell {name}',
  errInternet: 'The internet is slow right now. Try again in a moment.',
  errOffline: 'I can’t reach the Saathi app. Please check that it is running.',
  errBusy: 'Too many things at once! Give me a few seconds and try again.',
  errMic: 'Please allow the microphone so I can hear you.',
  errServer: 'Something went wrong. Please try again.',
  memory: 'Memory',
  memoryHint: 'Everything I remember about you and your family. It grows every time we talk.',
  medicines: 'Medicines',
  tabletsLeft: '{n} tablets left',
  daysLeft: 'about {n} days',
  stockUnknown: 'Tell me how many are left',
  bestPrices: 'Best prices right now',
  generic: 'Generic',
  cheapest: 'Cheapest',
  orderTitle: 'Medicine order',
  awaiting_approval: 'Waiting for family approval',
  placed: 'Order placed',
  confirmed: 'Confirmed',
  packed: 'Packed',
  out_for_delivery: 'On the way',
  delivered: 'Delivered',
  declined: 'Declined',
  messages: 'Messages',
  scamWarn: 'Scam! Do not reply or share any OTP.',
  billPaid: 'Done (demo)',
  orderIt: 'Yes, order it',
}
const keys = Object.keys(EN)

function useT(lang, speaker, listener) {
  const id = [lang, speaker ?? 'n', listener ?? 'n'].join('.')
  const [dicts, setDicts] = useState({})
  useEffect(() => {
    if (!lang || dicts[id]) return
    try {
      const saved = JSON.parse(localStorage.getItem('saathi.t3.' + id))
      if (saved && Object.keys(saved).length === keys.length) return setDicts((d) => ({ ...d, [id]: saved }))
    } catch {}
    api('/translate', { lang, speaker, listener, lines: Object.values(EN) })
      .then((arr) => {
        const d = Object.fromEntries(keys.map((k, i) => [k, arr[i] || EN[k]]))
        try { localStorage.setItem('saathi.t3.' + id, JSON.stringify(d)) } catch {}
        setDicts((x) => ({ ...x, [id]: d }))
      })
      .catch(() => setDicts((x) => ({ ...x, [id]: EN })))
  }, [id])
  const dict = dicts[id]
  const t = useCallback((k, vars = {}) => (dict?.[k] ?? EN[k] ?? k).replace(/\{(\w+)\}/g, (_, v) => vars[v] ?? ''), [dict])
  return [t, !!dict || lang === 'en-IN']
}

const NATIVE = { 'hi-IN': ['हिन्दी', 'Hindi'], 'en-IN': ['English', 'English'], 'ta-IN': ['தமிழ்', 'Tamil'], 'te-IN': ['తెలుగు', 'Telugu'], 'kn-IN': ['ಕನ್ನಡ', 'Kannada'], 'ml-IN': ['മലയാളം', 'Malayalam'], 'mr-IN': ['मराठी', 'Marathi'], 'pa-IN': ['ਪੰਜਾਬੀ', 'Punjabi'], 'bn-IN': ['বাংলা', 'Bengali'], 'gu-IN': ['ગુજરાતી', 'Gujarati'] }

// One icon and one colour family per kind of job.
const KIND = {
  medicine: [Pill, 'rose'], puja: [Flame, 'saffron'], bhajan: [Music, 'violet'], wake: [Sunrise, 'amber'], health: [Stethoscope, 'violet'],
  call: [PhoneCall, 'leaf'], water: [Droplets, 'cyan'], walk: [Footprints, 'leaf'], meal: [UtensilsCrossed, 'amber'], news: [Newspaper, 'blue'],
  brief: [Sun, 'amber'], bill: [Receipt, 'slate'], birthday: [Cake, 'pink'], festival: [Sparkles, 'saffron'], escalation: [TriangleAlert, 'red'], other: [Bell, 'blue'],
  message: [MessageCircle, 'blue'], scam: [ShieldAlert, 'red'], order: [Truck, 'leaf'],
}
function KindIcon({ kind, size = 20 }) {
  const [Icon, tone] = KIND[kind] ?? KIND.other
  return <span className={`tile tone-${tone}`}><Icon size={size} strokeWidth={2.2} /></span>
}
const SKY = { clear: Sun, 'mostly clear': CloudSun, 'partly cloudy': CloudSun, cloudy: Cloud, fog: CloudFog, drizzle: CloudRain, rain: CloudRain, 'heavy rain': CloudRain, showers: CloudRain, thunderstorm: CloudRain }

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
    case 'birthday': return `${s.person || t('everyBirthday')}${before} · ${s.time}`
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
function Orb({ phase, level, onClick, label }) {
  return (
    <button className={`orb ${phase}`} onClick={onClick} style={{ '--lvl': level }} aria-label={label}>
      <span className="orb-ring" />
      <span className="orb-ring r2" />
      {phase === 'speaking' ? <Square size={34} fill="currentColor" /> : <Mic size={40} strokeWidth={2.2} />}
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
      report(e)
    }
    setPhase('idle')
  }
  return { phase, setPhase, level, toggle }
}

function StatusPill({ phase, t }) {
  const text = { listening: t('listening'), thinking: t('thinking'), speaking: t('speaking') }[phase] ?? t('tapSpeak')
  return <span className={`status ${phase}`}><i />{text}</span>
}

// ---------- first launch: language + friend ----------
function Welcome({ state, onStarted }) {
  const [lang, setLang] = useState(null)
  const [persona, setPersona] = useState(null)
  const [busy, setBusy] = useState(false)
  const [t, ready] = useT(lang, persona)

  const start = async () => {
    setBusy(true)
    stopSpeaking()
    enablePush(state.vapidKey, true) // the tap allows the notification prompt
    try {
      const r = await api('/start', { lang, persona })
      await onStarted()
      speak(r.reply, lang, persona)
    } catch (e) {
      report(e)
      setBusy(false)
    }
  }

  return (
    <div className="onb">
      {!lang ? (
        <div className="fade">
          <div className="brand">
            <div className="brand-duo">
              <Avatar persona={state.personas.male} portrait size={92} />
              <Avatar persona={state.personas.female} portrait size={92} />
            </div>
            <h1>Saathi</h1>
            <p>साथी · हम-उम्र दोस्त · A friend your own age</p>
          </div>
          <div className="lang-grid">
            {Object.entries(NATIVE).map(([code, [name, en]]) => (
              <button key={code} className="lang" onClick={() => setLang(code)}>
                <b>{name}</b>
                {code !== 'en-IN' && <small>{en}</small>}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="fade friends-page">
          <button className="icon-btn" onClick={() => (setLang(null), setPersona(null))} aria-label={t('back')}><ChevronLeft size={24} /></button>
          <h2>{t('chooseFriend')}</h2>
          <p className="sub">{t('chooseSub')}</p>
          <div className="friends">
            {Object.values(state.personas).map((p) => (
              <div key={p.id} className={`friend ${persona === p.id ? 'on' : ''}`} onClick={() => setPersona(p.id)}>
                <Avatar persona={p} portrait size={96} />
                <div className="friend-body">
                  <b>{p.name}</b>
                  <small>{t(p.id + '_role')}</small>
                  <button className="pill-btn" onClick={(e) => (e.stopPropagation(), setPersona(p.id), speak(t(p.id + '_intro'), lang, p.id))}>
                    <Volume2 size={18} /> {t('hear')}
                  </button>
                </div>
                <span className="radio">{persona === p.id ? <CircleCheck size={28} /> : <Circle size={28} />}</span>
              </div>
            ))}
          </div>
          <button className="primary wide" disabled={!persona || !ready || busy} onClick={start}>
            {busy ? <span className="dots"><i /><i /><i /></span> : <>{t('start')} <ArrowRight size={22} /></>}
          </button>
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
        <a className="btn wa-btn" href={c.url} target="_blank" rel="noreferrer"><MessageCircle size={20} /> {t('share')}{c.to ? ` · ${c.to}` : ''}</a>
      </div>
    )
  if (c.type === 'youtube')
    return (
      <a className="card row-card" href={c.url} target="_blank" rel="noreferrer">
        <span className="tile tone-red big"><Youtube size={26} /></span>
        <div className="grow"><b>{c.query}</b><small>{t('play')}</small></div>
        <Play size={22} />
      </a>
    )
  if (c.type === 'call')
    return (
      <div className="card row-card">
        <span className="tile tone-leaf big"><PhoneCall size={24} /></span>
        <div className="grow"><b>{c.name}</b><small>{c.relation}</small></div>
        <a className="btn call-btn" href={`tel:${c.phone ?? ''}`}><Phone size={18} /> {t('call')}</a>
      </div>
    )
  if (c.type === 'alert')
    return (
      <div className="card alert">
        <div className="alert-head"><span className="tile tone-red big"><HeartPulse size={26} /></span><b>{c.reading}</b></div>
        <p>{t('alertTitle')}</p>
        <div className="btn-row">
          {c.family && <a className="btn call-btn" href={`tel:${c.family.phone ?? ''}`}><Phone size={18} /> {c.family.name}</a>}
          {c.wa && <a className="btn wa-btn" href={c.wa} target="_blank" rel="noreferrer"><MessageCircle size={18} /> {c.family?.name}</a>}
          {c.doctor && <a className="btn call-btn" href={`tel:${c.doctor.phone ?? ''}`}><Stethoscope size={18} /> {c.doctor.name}</a>}
          <a className="btn ghost" href="tel:14567"><LifeBuoy size={18} /> 14567</a>
        </div>
      </div>
    )
  if (c.type === 'escalation')
    return (
      <div className="card alert">
        <p className="msg">{c.message}</p>
        <div className="btn-row">
          <a className="btn wa-btn" href={c.url} target="_blank" rel="noreferrer"><MessageCircle size={18} /> {t('tellFamily', { name: c.family.name })}</a>
          <a className="btn call-btn" href={`tel:${c.family.phone ?? ''}`}><Phone size={18} /> {c.family.name}</a>
        </div>
      </div>
    )
  if (c.type === 'job')
    return (
      <div className="card row-card slim">
        <KindIcon kind={c.kind} />
        <div className="grow"><b>{c.title}</b><small><Clock size={13} /> {label(c.schedule, t, lang)}</small></div>
        <Check size={20} className="ok-tick" />
      </div>
    )
  if (c.type === 'health') return <div className="chip ok"><Check size={16} /> {c.reading}</div>
  if (c.type === 'purchase')
    return (
      <div className="card row-card">
        <span className="tile tone-amber big"><ShoppingBag size={24} /></span>
        <div className="grow"><b>{c.item}</b><small>{t('billPaid')} · {c.eta}</small></div>
      </div>
    )
  if (c.type === 'offers')
    return (
      <div className="card offers">
        <small className="eyebrow"><Store size={14} /> {t('bestPrices')} · {c.name}</small>
        {c.offers.map((o, i) => (
          <div key={o.sku} className={`offer ${i === 0 ? 'best' : ''}`}>
            <div className="grow"><b>{o.partner.replace(' (demo store)', '')}</b><small>{o.name} {o.strength} · {o.pack} · {o.eta_hours} h</small></div>
            <div className="offer-price">
              {i === 0 && <span className="tag"><BadgePercent size={12} /> {t('cheapest')}</span>}
              <b>₹{o.price}</b>{o.mrp > o.price && <s>₹{o.mrp}</s>}
            </div>
          </div>
        ))}
        <small className="demo-note">Demo partner stores · synthetic prices</small>
      </div>
    )
  if (c.type === 'order') return <OrderCard o={c.order} t={t} />
  if (c.type === 'news')
    return (
      <div className="card news">
        <small className="eyebrow"><Newspaper size={14} /> {c.topic}</small>
        {c.items?.map((n) => <a key={n.url} href={n.url} target="_blank" rel="noreferrer">{n.title}</a>)}
      </div>
    )
  return null
}

const STEPS = ['awaiting_approval', 'placed', 'confirmed', 'packed', 'out_for_delivery', 'delivered']
function OrderCard({ o, t }) {
  if (!o) return null
  const at = STEPS.indexOf(o.status)
  return (
    <div className="card order-card">
      <div className="row-card">
        <span className="tile tone-leaf big">{o.status === 'delivered' ? <PackageCheck size={24} /> : <Truck size={24} />}</span>
        <div className="grow"><b>{o.med}</b><small>{o.offer.partner.replace(' (demo store)', '')} · {o.qty} × ₹{o.offer.price} = ₹{o.total}</small></div>
      </div>
      <p className={`order-status ${o.status}`}>{t(o.status)}</p>
      <ol className="track">{STEPS.slice(1).map((s, i) => <li key={s} className={i + 1 <= at ? 'on' : ''}><i />{t(s)}</li>)}</ol>
    </div>
  )
}

function Spark({ values, color }) {
  if (values.length < 2) return null
  const min = Math.min(...values) - 5
  const max = Math.max(...values) + 5
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${40 - ((v - min) / (max - min)) * 36}`).join(' ')
  return (
    <svg viewBox="0 0 100 42" className="spark-svg" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
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
  const [t] = useT(lang, p.persona, p.gender)
  const [tab, setTab] = useState('today')
  const [last, setLast] = useState(null)
  const [typing, setTyping] = useState(false)
  const [text, setText] = useState('')
  const [firing, setFiring] = useState(null)
  const [demo, setDemo] = useState(() => new URLSearchParams(location.search).has('demo'))

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
    try { await fn() } catch (e) { report(e) }
    rec.setPhase('idle')
  }
  const say = (q, shown = q) => (setTab('today'), run(() => reply(shown, () => api('/chat', { text: q, lang }), rec.setPhase)))
  const sendText = () => {
    const q = text.trim()
    if (q) setText(''), say(q)
  }
  const brief = () => (setTab('today'), run(() => reply(t('morning'), () => api('/brief'), rec.setPhase)))

  // Live job events from the server scheduler.
  useEffect(() => {
    enablePush(state.vapidKey, false)
    const es = new EventSource('/api/stream')
    es.onmessage = (m) => {
      const ev = JSON.parse(m.data)
      setFiring(ev)
      reload()
      if (ev.kind !== 'escalation') speak(ev.text, lang, p.persona, ev.voiceOf)
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
  const SkyIcon = SKY[w?.sky] ?? CloudSun
  const now = state.now
  const bp = state.health.filter((h) => h.type === 'bp')
  const sugar = state.health.filter((h) => h.type === 'sugar')
  const festToday = state.festivals.find((f) => f.date === now.date)
  const next = state.today.find((x) => x.status === 'upcoming')
  const checks = [
    ['cName', p.name], ['cPlace', p.age && p.city], ['cFaith', p.religion], ['cHealth', p.conditions?.length || p.medicines?.length],
    ['cRoutine', state.jobs.length >= 2], ['cFamily', state.family.length], ['cNews', p.interests?.length],
  ]
  const heroAvatar = rec.phase === 'idle' && last?.cards?.some((c) => c.type === 'alert') ? 'surprised' : rec.phase

  return (
    <div className="home">
      <header className="top">
        <div className="top-text">
          <small className="date" onClick={(e) => e.detail === 3 && setDemo(true)} onDoubleClick={() => next && api(`/jobs/${next.jobId}/run`, {})}>
            {new Date(now.date + 'T12:00').toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' })}
          </small>
          <h1>{onboarding ? t('gettingToKnow') : t('greet', { name: p.name?.split(' ')[0] })}</h1>
          {festToday && <span className="fest-tag"><Sparkles size={14} /> {festToday.name}</span>}
        </div>
        {w && (
          <div className="weather">
            <div className="weather-main"><SkyIcon size={22} /> <b>{w.temp}°</b></div>
            {w.aqi != null && <small className={w.aqi > 150 ? 'bad' : w.aqi > 100 ? 'meh' : 'good'}><Wind size={13} /> AQI {w.aqi}</small>}
          </div>
        )}
      </header>

      <main className="scroll">
        {onboarding && (
          <>
            <div className="onb-hero">
              <Avatar persona={state.persona} phase={rec.phase} size={84} />
              <div>
                <b>{state.persona.name}</b>
                <StatusPill phase={rec.phase} t={t} />
              </div>
            </div>
            <div className="checks">
              {checks.map(([k, ok]) => <span key={k} className={`check ${ok ? 'on' : ''}`}>{ok ? <Check size={14} strokeWidth={3} /> : <Circle size={10} />} {t(k)}</span>)}
            </div>
            <div className="convo">
              {state.chat.slice(-6).map((m, i) => <p key={i} className={`bubble ${m.role}`}>{untag(m.content)}</p>)}
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
              <Avatar persona={state.persona} phase={heroAvatar} size={76} />
              <div className="hero-body">
                <div className="hero-name"><b>{state.persona.name}</b><StatusPill phase={rec.phase} t={t} /></div>
                {last?.you && <p className="you">“{last.you}”</p>}
                <p className="said" onClick={() => last?.reply && speak(last.reply, lang, p.persona)}>
                  {last ? (last.reply ? untag(last.reply) : <span className="dots"><i /><i /><i /></span>) : t('firstHello')}
                </p>
              </div>
            </section>
            {last?.cards?.map((c, i) => <Card key={i} c={c} t={t} lang={lang} />)}

            <button className="brief" onClick={brief}>
              <span className="brief-icon"><Sunrise size={28} /></span>
              <div className="grow"><b>{t('morning')}</b><small>{t('morningSub')}</small></div>
              <Play size={22} fill="currentColor" />
            </button>

            {(state.birthdays.length > 0 || state.festivals.length > 0) && (
              <div className="chips">
                {state.birthdays.map((b) => (
                  <button key={b.name} className="chip bday" onClick={() => say(`Help me write a birthday WhatsApp wish for ${b.name} (${b.relation}), birthday ${b.next}.`, `${t('wish')}: ${b.name}`)}>
                    <Cake size={16} /> {b.name} · {b.inDays === 0 ? t('birthdayToday') : t('birthdayIn', { n: b.inDays })}
                  </button>
                ))}
                {state.festivals.slice(0, 3).map((f) => (
                  <span key={f.date + f.name} className="chip fest"><Sparkles size={15} /> {f.name} · {new Date(f.date + 'T12:00').toLocaleDateString(lang, { day: 'numeric', month: 'short' })}</span>
                ))}
              </div>
            )}

            {state.orders.filter((o) => !['delivered', 'declined'].includes(o.status)).map((o) => <OrderCard key={o.id} o={o} t={t} />)}
            {state.messages.filter((m) => Date.now() - m.at < 864e5).slice(-3).reverse().map((m) => (
              <div key={m.id} className={`card row-card msg-row ${m.scam ? 'scam' : ''}`}>
                <span className={`tile ${m.scam ? 'tone-red' : 'tone-blue'}`}>{m.scam ? <ShieldAlert size={20} /> : <MessageCircle size={20} />}</span>
                <div className="grow"><b>{m.from}</b><small>{m.scam ? t('scamWarn') : m.summary}</small></div>
                {!m.scam && <button className="mini" aria-label="play" onClick={() => speak(m.summary, lang, p.persona)}><Volume2 size={16} /></button>}
              </div>
            ))}

            <h3 className="section">{t('todayPlan')}</h3>
            <ol className="timeline">
              {state.today.map((r) => (
                <li key={r.jobId + r.time} className={`${r.status} ${r === next ? 'next' : ''}`}>
                  <time>{r.time}</time>
                  <KindIcon kind={r.kind} size={18} />
                  <p>{untag(r.title)}{r === next && <em className="next-tag">{t('upNext')}</em>}{r.status === 'missed' && <em className="miss-tag">{t('missed')}</em>}</p>
                </li>
              ))}
            </ol>
          </>
        )}

        {!onboarding && tab === 'routine' && (
          <>
            <p className="hint"><Mic size={18} /> {t('routineHint')}</p>
            {state.jobs.length === 0 && <p className="empty">{t('noJobs')}</p>}
            {state.jobs.map((j) => (
              <div key={j.id} className={`card row-card job-row ${j.active ? '' : 'off'}`}>
                <KindIcon kind={j.kind} />
                <div className="grow">
                  <b>{untag(j.title)}</b>
                  <small><Clock size={13} /> {label(j.schedule, t, lang)}{j.action === 'agent' ? ' · ✦' : ''}{!j.active ? ` · ${t('paused')}` : ''}</small>
                </div>
                <div className="job-actions">
                  <button className="mini" title={t('tryNow')} aria-label={t('tryNow')} onClick={() => api(`/jobs/${j.id}/run`, {}).catch(report)}><Play size={16} /></button>
                  <button className="mini" title={t('paused')} aria-label={t('paused')} onClick={() => api(`/jobs/${j.id}`, { active: !j.active }, { method: 'PATCH' }).then(reload).catch(report)}>{j.active ? <Pause size={16} /> : <Play size={16} />}</button>
                  <button className="mini danger" title="delete" aria-label="delete" onClick={() => api(`/jobs/${j.id}`, undefined, { method: 'DELETE' }).then(reload).catch(report)}><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
          </>
        )}

        {!onboarding && tab === 'health' && (
          <>
            <p className="hint"><Mic size={18} /> {t('healthHint')}</p>
            <h3 className="section">{t('medicines')}</h3>
            {state.meds.map((m) => (
              <div key={m.key} className={`card row-card med-row ${m.daysLeft != null && m.daysLeft <= 5 ? 'low' : ''}`}>
                <span className="tile tone-rose"><Pill size={20} /></span>
                <div className="grow">
                  <b>{m.name}</b>
                  <small><Clock size={13} /> {m.times.join(' · ')} · {m.stock == null ? t('stockUnknown') : `${t('tabletsLeft', { n: m.stock })}, ${t('daysLeft', { n: m.daysLeft })}`}</small>
                  {m.stock != null && <div className="stock"><i style={{ width: `${Math.min(100, (m.daysLeft / 30) * 100)}%` }} /></div>}
                </div>
              </div>
            ))}
            {state.orders.slice(-2).reverse().map((o) => <OrderCard key={o.id} o={o} t={t} />)}
            <div className="metrics">
              <div className="metric"><small><HeartPulse size={15} /> BP</small><b>{bp.at(-1)?.value ?? '—'}</b><Spark values={bp.map((h) => parseInt(h.value))} color="var(--rose)" /></div>
              <div className="metric"><small><Droplets size={15} /> Sugar</small><b>{sugar.at(-1)?.value ?? '—'}</b><Spark values={sugar.map((h) => parseInt(h.value))} color="var(--brand)" /></div>
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

        {!onboarding && tab === 'memory' && (
          <>
            <p className="hint"><Network size={18} /> {t('memoryHint')}</p>
            <LifeGraph refreshKey={[state.memories.length, state.family.length, state.moods.length, state.orders.length, state.meds.map((m) => m.stock).join()].join('.')} persona={p.persona} />
          </>
        )}

        {!onboarding && tab === 'family' && (
          <>
            {state.family.map((f) => {
              const b = state.birthdays.find((x) => x.name === f.name)
              return (
                <div key={f.name} className="card row-card person">
                  <div className="pav">{f.name[0]}</div>
                  <div className="grow">
                    <b>{f.name}</b>
                    <small>{f.relation}{b ? ` · ${b.inDays === 0 ? t('birthdayToday') : t('birthdayIn', { n: b.inDays })}` : ''}</small>
                  </div>
                  {f.phone && <a className="round-btn wa" href={`https://wa.me/${f.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" aria-label="WhatsApp"><MessageCircle size={20} /></a>}
                  {f.phone && <a className="round-btn call" href={`tel:${f.phone}`} aria-label={t('call')}><Phone size={20} /></a>}
                </div>
              )
            })}
            <a className="card helpline" href="tel:14567"><LifeBuoy size={22} /> {t('elderLine')}</a>
          </>
        )}
      </main>

      <div className="dock">
        {typing ? (
          <form className="typebar" onSubmit={(e) => (e.preventDefault(), sendText())}>
            <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={t('typeHere')} />
            <button className="round-btn send" aria-label={t('send')}><SendHorizontal size={22} /></button>
            <button type="button" className="round-btn" onClick={() => setTyping(false)} aria-label="close"><X size={22} /></button>
          </form>
        ) : (
          <>
            <button className="side" onClick={() => setTyping(true)} aria-label="keyboard"><Keyboard size={24} /></button>
            <Orb phase={rec.phase} level={rec.level} onClick={() => (setTab('today'), rec.toggle())} label={t('tapSpeak')} />
            {onboarding ? <span className="side ghost-space" /> : <button className="side" onClick={brief} aria-label={t('morning')}><Sunrise size={24} /></button>}
          </>
        )}
      </div>
      {!onboarding && (
        <nav className="tabs">
          {[['today', House], ['routine', AlarmClock], ['health', HeartPulse], ['memory', Network], ['family', Users]].map(([k, Icon]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              <span className="tab-icon"><Icon size={22} strokeWidth={tab === k ? 2.4 : 2} /></span>
              {t(k)}
            </button>
          ))}
        </nav>
      )}

      {demo && <DemoPanel state={state} onClose={() => setDemo(false)} reload={reload} />}

      {firing && (
        <div className="ring fade">
          <div className={`ring-card ${firing.kind}`}>
            <div className="ring-top">
              <Avatar persona={state.persona} phase={firing.kind === 'escalation' ? 'surprised' : 'speaking'} size={64} />
              <div>
                <time>{new Date(firing.at).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}</time>
                <b className="ring-title"><KindIcon kind={firing.kind} size={16} /> {untag(firing.title)}</b>
              </div>
            </div>
            {firing.kind !== 'escalation' && <p className="ring-text">{untag(firing.text)}</p>}
            {firing.voiceOf && <button className="pill-btn" onClick={() => speak(firing.text, lang, p.persona, firing.voiceOf)}><Volume2 size={18} /> {firing.voiceOf}</button>}
            {firing.cards?.map((c, i) => <Card key={i} c={c} t={t} lang={lang} />)}
            {firing.cards?.some((c) => c.type === 'offers') && <button className="primary big" onClick={() => (closeEvent(), say('Haan, sabse sasti wali mangwa do', t('orderIt')))}><Truck size={22} /> {t('orderIt')}</button>}
            {firing.status === 'pending' ? (
              <>
                <button className="primary big" onClick={() => closeEvent('done')}><Check size={24} strokeWidth={3} /> {t('done')}</button>
                <button className="ghost" onClick={() => closeEvent('snoozed')}><AlarmClock size={20} /> {t('snooze')}</button>
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

// Presenter controls for recording a demo. Open with ?demo or a triple tap on the date.
const SAMPLE_SCAM = 'Dear customer, your SBI account will be BLOCKED today. Update KYC now at http://sbi-kyc-upd.in and share the OTP sent to you.'
function DemoPanel({ state, onClose, reload }) {
  const [time, setTime] = useState(state.now.time)
  const fam = state.family.find((m) => m.phone) ?? state.family[0]
  const [msg, setMsg] = useState('Maa, aaj shaam 7 baje video call karte hain. Khana time pe kha lena!')
  const act = (path, body) => api(path, body).then(reload).catch(report)
  return (
    <div className="ring fade" onClick={onClose}>
      <div className="ring-card demo-panel" onClick={(e) => e.stopPropagation()}>
        <b className="ring-title"><SlidersHorizontal size={18} /> Demo controls</b>
        <div className="demo-row">
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          <button className="btn ghost" onClick={() => act('/demo/clock', { time })}>Set clock</button>
          <button className="btn ghost" onClick={() => act('/demo/clock', {})}>Real time</button>
        </div>
        <button className="btn ghost" onClick={() => act('/demo/stock', { count: 6 })}><Pill size={18} /> Medicine running low</button>
        <button className="btn ghost" onClick={() => act('/messages', { from: 'VK-SBIBNK', text: SAMPLE_SCAM, channel: 'SMS' })}><ShieldAlert size={18} /> Scam SMS arrives</button>
        <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={2} />
        {fam && <button className="btn ghost" onClick={() => act('/messages', { from: fam.name, text: msg, channel: 'WhatsApp' })}><Inbox size={18} /> Message from {fam.name}</button>}
        <button className="btn ghost" onClick={() => act('/demo/digest', {})}><Users size={18} /> Send evening digest to family</button>
        <div className="demo-row">
          <a className="btn ghost" href="/family" target="_blank" rel="noreferrer">Family app</a>
          <a className="btn ghost" href="/intro" target="_blank" rel="noreferrer">Intro</a>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [state, setState] = useState(null)
  const [toast, setToast] = useState(null)
  const [t] = useT(state?.profile?.language ?? 'hi-IN', state?.profile?.persona, state?.profile?.gender)
  // A failed refresh keeps the last good screen; the first load keeps trying until the server answers.
  const reload = () => api('/state').then(setState).catch((e) => (state ? report(e) : setTimeout(reload, 2000)))
  useEffect(() => void reload(), [])
  useEffect(() => {
    let timer
    const on = (e) => (setToast(e.detail), clearTimeout(timer), (timer = setTimeout(() => setToast(null), 5000)))
    window.addEventListener('saathi-error', on)
    return () => window.removeEventListener('saathi-error', on)
  }, [])
  const key = { internet: 'errInternet', offline: 'errOffline', busy: 'errBusy', mic: 'errMic' }[toast] ?? 'errServer'
  return (
    <div className="stage">
      <div className="phone">
        {!state ? <div className="boot"><img src="/icon.svg" alt="" /></div> : state.profile ? <Home state={state} reload={reload} /> : <Welcome state={state} onStarted={reload} />}
        {toast && <div className="toast fade" role="alert" onClick={() => setToast(null)}><WifiOff size={20} /> {t(key)}</div>}
      </div>
    </div>
  )
}
