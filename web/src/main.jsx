import { StrictMode, useEffect, useRef, useState, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import { record, speak, stopSpeaking } from './audio.js'
import './styles.css'

// ---------- api + i18n ----------
async function api(path, body, raw) {
  const r = await fetch('/api' + path, body === undefined ? undefined : raw ? { method: 'POST', body } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error || r.statusText)
  return j
}

// English source strings. Each language is translated once by the LLM and cached on the device.
const EN = {
  tagline: 'A friend of your own age',
  chooseLang: 'Which language do you speak?',
  chooseFriend: 'Choose your friend',
  hear: 'Hear voice',
  female_intro: 'Namaste! I am Kamla. I taught in a school for thirty years, and now I have a lot of time for chit-chat. Shall we be friends?',
  male_intro: 'Namaste! I am Ramesh. I was a railway station master for thirty-five years. I have many stories to share. Shall we be friends?',
  female_role: 'Retired teacher, 71',
  male_role: 'Retired station master, 73',
  q1: 'First tell me, what is your good name?',
  q2: 'How old are you, and which city do you live in?',
  q3: 'Which religion do you follow? I will remember all your festivals.',
  q4: 'Do you have any health troubles, like BP, sugar or knee pain? Which medicines do you take, and at what time?',
  q5: 'How does your day begin? When do you wake up, when is your puja, and which bhajan do you like to hear?',
  q6: 'Tell me about your family. Children, grandchildren, their names and their birthdays.',
  q7: 'What news do you like to hear? Cricket, religion, politics, farming, health?',
  next: 'Next',
  back: 'Back',
  tapSpeak: 'Tap and speak',
  typeHere: 'Or type here…',
  saving: 'Getting to know you…',
  listening: 'Listening… speak now',
  thinking: 'Thinking…',
  speaking: 'Speaking… tap to stop',
  today: 'Today',
  health: 'Health',
  family: 'Family',
  morning: 'Morning talk',
  morningSub: 'Weather, news and today’s plan',
  todayPlan: 'Today’s plan',
  done: 'Done',
  later: 'Later',
  share: 'Share on WhatsApp',
  call: 'Call',
  play: 'Play on YouTube',
  alertTitle: 'This reading needs care. Please sit and rest.',
  healthHint: 'Just say it: “My BP today is 140 by 90”',
  noReadings: 'No readings yet',
  birthdayIn: 'Birthday in {n} days',
  birthdayToday: 'Birthday today!',
  wish: 'Write a wish',
  elderLine: 'Elder helpline 14567',
  orderPlaced: 'Order placed (demo)',
  reminderSet: 'Reminder set',
  greet: 'Namaste, {name}',
  firstHello: 'Tap the big button and talk to me about anything.',
  aqi: 'Air',
  send: 'Send',
}
const keys = Object.keys(EN)

function useT(lang) {
  const [dicts, setDicts] = useState({})
  useEffect(() => {
    if (!lang || dicts[lang]) return
    try {
      const saved = JSON.parse(localStorage.getItem('saathi.t.' + lang))
      if (saved && Object.keys(saved).length === keys.length) return setDicts((d) => ({ ...d, [lang]: saved }))
    } catch {}
    api('/translate', { lang, lines: Object.values(EN) })
      .then((arr) => {
        const d = Object.fromEntries(keys.map((k, i) => [k, arr[i] || EN[k]]))
        try { localStorage.setItem('saathi.t.' + lang, JSON.stringify(d)) } catch {}
        setDicts((x) => ({ ...x, [lang]: d }))
      })
      .catch(() => setDicts((x) => ({ ...x, [lang]: EN })))
  }, [lang])
  const dict = dicts[lang]
  const t = useCallback((k, vars = {}) => (dict?.[k] ?? EN[k]).replace(/\{(\w+)\}/g, (_, v) => vars[v] ?? ''), [dict])
  return [t, !!dict || lang === 'en-IN']
}

const NATIVE = { 'hi-IN': 'हिन्दी', 'en-IN': 'English', 'ta-IN': 'தமிழ்', 'te-IN': 'తెలుగు', 'kn-IN': 'ಕನ್ನಡ', 'ml-IN': 'മലയാളം', 'mr-IN': 'मराठी', 'pa-IN': 'ਪੰਜਾਬੀ', 'bn-IN': 'বাংলা', 'gu-IN': 'ગુજરાતી' }
const KIND = { medicine: '💊', puja: '🪔', wake: '🌅', health: '🩺', call: '📞', other: '⏰' }

// ---------- shared UI ----------
function Orb({ phase, level, onClick, label, size = 'lg' }) {
  return (
    <button className={`orb orb-${size} ${phase}`} onClick={onClick} style={{ '--lvl': level }} aria-label={label}>
      <span className="orb-ring" />
      <span className="orb-ring r2" />
      <svg viewBox="0 0 24 24" width="40%" height="40%" aria-hidden>
        {phase === 'speaking' ? (
          <path d="M6 6h12v12H6z" fill="currentColor" rx="2" />
        ) : (
          <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-2.1a7 7 0 0 0 6-6.9z" fill="currentColor" />
        )}
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

function Avatar({ persona, phase }) {
  const letter = persona?.id === 'male' ? 'र' : 'क'
  return (
    <div className={`avatar ${persona?.id} ${phase}`}>
      <span>{letter}</span>
      <i className="spark" />
    </div>
  )
}

// ---------- onboarding ----------
const DEMO = [
  'My name is Shanti Devi.',
  'I am 72 years old and I live in Lucknow.',
  'I am Hindu.',
  'I have high BP and sugar. I take Amlodipine at 8 in the morning and Metformin at 9 at night. My knees also hurt.',
  'I wake up at 5:30. Puja at 6:30, I like listening to Hanuman Chalisa. On Ekadashi I listen to Vishnu Sahasranamam.',
  'My son Rahul lives in Bengaluru, phone 90000 00001, birthday 12 November. Granddaughter Anya, birthday 14 November. Daughter Priya in Pune, phone 90000 00002, birthday 5 January.',
  'Cricket, spiritual news and health tips.',
]

function Onboarding({ state, onDone }) {
  const [lang, setLang] = useState(null)
  const [persona, setPersona] = useState(null)
  const [step, setStep] = useState(0) // 0 lang, 1 friend, 2..8 questions, 9 saving
  const [answers, setAnswers] = useState(Array(7).fill(''))
  const [t, ready] = useT(lang)
  const qi = step - 2
  const rec = useRecorder(async (blob, setPhase) => {
    setPhase('thinking')
    const r = await api('/stt', blob, true)
    setAnswers((a) => a.map((x, i) => (i === qi ? (x ? x + ' ' : '') + r.text : x)))
  })

  useEffect(() => {
    if (qi >= 0 && qi < 7 && ready) speak(t('q' + (qi + 1)), lang, persona)
  }, [step, ready])

  const finish = async (ans = answers) => {
    stopSpeaking()
    setStep(9)
    await api('/onboard', { lang, persona, answers: ans.map((a, i) => ({ q: EN['q' + (i + 1)], a })) })
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission()
    onDone()
  }
  const per = persona && state.personas[persona]

  return (
    <div className="onb">
      {step === 0 && (
        <div className="onb-lang fade">
          <div className="brand">
            <img src="/icon.svg" alt="" />
            <h1>Saathi</h1>
            <p>साथी · हम-उम्र दोस्त · A friend of your own age</p>
          </div>
          <h2>भाषा चुनें · Choose language</h2>
          <div className="lang-grid">
            {Object.entries(NATIVE).map(([code, name]) => (
              <button key={code} className="lang" onClick={() => (setLang(code), setStep(1))}>
                {name}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="fade">
          <h2 className="center">{t('chooseFriend')}</h2>
          <div className="friends">
            {Object.values(state.personas).map((p) => (
              <div key={p.id} className={`friend ${persona === p.id ? 'on' : ''}`} onClick={() => setPersona(p.id)}>
                <Avatar persona={p} />
                <b>{p.name}</b>
                <small>{t(p.id + '_role')}</small>
                <button className="ghost" onClick={(e) => (e.stopPropagation(), setPersona(p.id), speak(t(p.id + '_intro'), lang, p.id))}>
                  ▶ {t('hear')}
                </button>
              </div>
            ))}
          </div>
          <div className="row">
            <button className="ghost" onClick={() => setStep(0)}>{t('back')}</button>
            <button className="primary" disabled={!persona || !ready} onClick={() => setStep(2)}>{t('next')} →</button>
          </div>
        </div>
      )}

      {qi >= 0 && qi < 7 && (
        <div className="fade q" key={step}>
          <div className="progress"><i style={{ width: `${((qi + 1) / 7) * 100}%` }} /></div>
          <div className="q-head">
            <Avatar persona={per} phase={rec.phase} />
            <div>
              <small>{per.name}</small>
              <p className="q-text" onClick={() => speak(t('q' + (qi + 1)), lang, persona)}>{t('q' + (qi + 1))}</p>
            </div>
          </div>
          <textarea value={answers[qi]} placeholder={t('typeHere')} onChange={(e) => setAnswers((a) => a.map((x, i) => (i === qi ? e.target.value : x)))} />
          <div className="q-mic">
            <Orb phase={rec.phase} level={rec.level} onClick={rec.toggle} label={t('tapSpeak')} size="md" />
            <span>{rec.phase === 'listening' ? t('listening') : rec.phase === 'thinking' ? t('thinking') : t('tapSpeak')}</span>
          </div>
          <div className="row">
            <button className="ghost" onClick={() => setStep(step - 1)}>{t('back')}</button>
            <button className="primary" onClick={() => (qi === 6 ? finish() : setStep(step + 1))}>{t('next')} →</button>
          </div>
          {qi === 0 && (
            <button className="demo-fill" onClick={() => (setAnswers(DEMO), finish(DEMO))}>demo: fill sample answers</button>
          )}
        </div>
      )}

      {step === 9 && (
        <div className="saving fade">
          <Avatar persona={per} phase="thinking" />
          <p>{t('saving')}</p>
        </div>
      )}
    </div>
  )
}

// ---------- cards from the agent ----------
function Card({ c, t, onAsk }) {
  if (c.type === 'whatsapp')
    return (
      <div className="card wa">
        <p className="msg">{c.message}</p>
        <a className="btn wa-btn" href={c.url} target="_blank" rel="noreferrer">🟢 {t('share')}</a>
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
          {c.doctor && <a className="btn call-btn" href={`tel:${c.doctor.phone ?? ''}`}>🩺 {c.doctor.name}</a>}
          <a className="btn ghost" href="tel:14567">{t('elderLine')}</a>
        </div>
      </div>
    )
  if (c.type === 'health') return <div className="chip ok">✓ {c.reading}</div>
  if (c.type === 'reminder') return <div className="chip">{KIND[c.kind] ?? '⏰'} {c.time} · {c.text} · {t('reminderSet')}</div>
  if (c.type === 'order') return <div className="card order">🛍️ <b>{c.item}</b><small>{t('orderPlaced')} · ETA {c.eta}</small></div>
  if (c.type === 'news')
    return (
      <div className="card news">
        <small>📰 {c.topic}</small>
        {c.items?.map((n) => (
          <a key={n.url} href={n.url} target="_blank" rel="noreferrer">{n.title}</a>
        ))}
      </div>
    )
  return null
}

// ---------- home ----------
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

function Home({ state, reload }) {
  const p = state.profile
  const lang = p.language
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
    reload()
    setPhase('speaking')
    await speak(r.reply ?? r.text, replyLang, p.persona)
  }
  const rec = useRecorder(async (blob, setPhase) => {
    setPhase('thinking')
    const s = await api('/stt', blob, true)
    if (!s.text?.trim()) return
    await reply(s.text, () => api('/chat', { text: s.text, lang: s.lang }), setPhase, s.lang)
  })
  const run = async (fn) => {
    try { await fn() } catch (e) { alert(e.message) }
    rec.setPhase('idle')
  }
  const sendText = () => {
    const q = text.trim()
    if (!q) return
    setText('')
    setTab('today')
    run(() => reply(q, () => api('/chat', { text: q, lang }), rec.setPhase))
  }
  const brief = () => (setTab('today'), run(() => reply('☀️ ' + t('morning'), async () => api('/brief'), rec.setPhase)))

  // Reminder clock: poll the server, ring with voice + system notification.
  useEffect(() => {
    const tick = async (next) => {
      const due = await fetch('/api/due' + (next ? '?next=1' : '')).then((r) => r.json()).catch(() => [])
      if (!due.length) return
      const r = due[0]
      setFiring(r)
      if (document.hidden && Notification?.permission === 'granted') new Notification(`${state.persona.name} · ${r.time}`, { body: r.text, icon: '/icon.svg' })
      speak(r.text, lang, p.persona)
    }
    window.__ring = () => tick(true) // demo: ring the next reminder now
    tick()
    const id = setInterval(tick, 20000)
    return () => clearInterval(id)
  }, [])
  const closeReminder = async (done) => {
    const r = firing
    setFiring(null)
    stopSpeaking()
    if (done) await api(`/reminders/${r.id}/done`, {})
    reload()
    if (done && r.kind === 'wake') brief()
  }

  const w = state.weather
  const now = state.now
  const todays = state.reminders.filter((r) => !r.date || r.date === now.date).sort((a, b) => a.time.localeCompare(b.time))
  const festToday = state.festivals.find((f) => f.date === now.date)
  const bp = state.health.filter((h) => h.type === 'bp')
  const sugar = state.health.filter((h) => h.type === 'sugar')
  const phaseLabel = { listening: t('listening'), thinking: t('thinking'), speaking: t('speaking') }[rec.phase]

  return (
    <div className="home">
      <header className="top">
        <div>
          <small className="date" onDoubleClick={() => window.__ring()}>
            {new Date(now.date + 'T12:00').toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' })}
            {festToday && <span className="fest-tag"> · 🪔 {festToday.name}</span>}
          </small>
          <h1>{t('greet', { name: p.name?.split(' ')[0] })}</h1>
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
        {tab === 'today' && (
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
                {last ? last.reply ?? last.text ?? <span className="dots"><i /><i /><i /></span> : t('firstHello')}
              </p>
            </section>
            {last?.cards?.map((c, i) => <Card key={i} c={c} t={t} />)}

            <button className="brief" onClick={brief}>
              <span className="sun">☀️</span>
              <div><b>{t('morning')}</b><small>{t('morningSub')}</small></div>
              <span>▶</span>
            </button>

            {(state.festivals.length > 0 || state.birthdays.length > 0) && (
              <div className="chips">
                {state.birthdays.map((b) => (
                  <button key={b.name} className="chip bday" onClick={() => run(() => reply(`${t('wish')}: ${b.name}`, () => api('/chat', { text: `Help me write a birthday WhatsApp wish for ${b.name} (${b.relation}), birthday ${b.next}.`, lang }), rec.setPhase))}>
                    🎂 {b.name} · {b.inDays === 0 ? t('birthdayToday') : t('birthdayIn', { n: b.inDays })}
                  </button>
                ))}
                {state.festivals.slice(0, 3).map((f) => (
                  <span key={f.date + f.name} className="chip fest">🪔 {f.name} · {new Date(f.date).toLocaleDateString(lang, { day: 'numeric', month: 'short' })}</span>
                ))}
              </div>
            )}

            <h3>{t('todayPlan')}</h3>
            <ol className="timeline">
              {todays.map((r) => (
                <li key={r.id} className={r.done?.includes(now.date) ? 'done' : r.time < now.time ? 'past' : ''}>
                  <time>{r.time}</time>
                  <span className="k">{KIND[r.kind] ?? '⏰'}</span>
                  <p>{r.text}</p>
                </li>
              ))}
            </ol>
          </>
        )}

        {tab === 'health' && (
          <>
            <p className="hint">🎙️ {t('healthHint')}</p>
            <div className="metrics">
              <div className="metric"><small>BP</small><b>{bp.at(-1)?.value ?? '—'}</b><Spark values={bp.map((h) => parseInt(h.value))} color="var(--vermilion)" /></div>
              <div className="metric"><small>Sugar</small><b>{sugar.at(-1)?.value ?? '—'}</b><Spark values={sugar.map((h) => parseInt(h.value))} color="var(--marigold)" /></div>
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

        {tab === 'family' && (
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
            <button className="primary">{t('send')}</button>
            <button type="button" className="ghost" onClick={() => setTyping(false)}>✕</button>
          </form>
        ) : (
          <>
            <button className="side" onClick={() => setTyping(true)} aria-label="keyboard">⌨️</button>
            <Orb phase={rec.phase} level={rec.level} onClick={() => (setTab('today'), rec.toggle())} label={t('tapSpeak')} />
            <button className="side" onClick={brief} aria-label={t('morning')}>☀️</button>
          </>
        )}
      </div>
      <nav className="tabs">
        {['today', 'health', 'family'].map((k) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            <span>{{ today: '🏠', health: '❤️', family: '👨‍👩‍👧' }[k]}</span>
            {t(k)}
          </button>
        ))}
      </nav>

      {firing && (
        <div className="ring fade">
          <div className="ring-card">
            <div className="ring-icon">{KIND[firing.kind] ?? '⏰'}</div>
            <time>{firing.time}</time>
            <p>{firing.text}</p>
            <button className="primary big" onClick={() => closeReminder(true)}>✓ {t('done')}</button>
            <button className="ghost" onClick={() => closeReminder(false)}>{t('later')}</button>
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
        {err ? <p className="err">{err}</p> : !state ? <div className="boot"><img src="/icon.svg" alt="" /></div> : state.profile ? <Home state={state} reload={reload} /> : <Onboarding state={state} onDone={reload} />}
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
