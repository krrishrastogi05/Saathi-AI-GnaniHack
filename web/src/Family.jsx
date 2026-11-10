// The family side of Saathi: what a son or daughter sees on their own phone.
import { useEffect, useState } from 'react'
import {
  HeartPulse, Pill, ShieldAlert, Truck, Moon, Smile, Meh, Frown, MessageCircle, CheckCircle2, XCircle, Mic, Send, Activity,
  Clock, TriangleAlert, PackageCheck, Users, Square, BellRing,
} from 'lucide-react'
import { api, report } from './api.js'
import { record } from './audio.js'
import './styles.css'

const FEED = {
  approval: [Pill, 'brand', 'Needs your approval'],
  mood: [HeartPulse, 'rose', 'Mood'],
  missed_dose: [TriangleAlert, 'red', 'Missed medicine'],
  scam: [ShieldAlert, 'red', 'Scam blocked'],
  order: [Truck, 'leaf', 'Medicine order'],
  digest: [Moon, 'violet', 'Evening update'],
  message: [MessageCircle, 'blue', 'Message'],
  inactive: [BellRing, 'amber', 'Quiet day'],
}
const STEPS = ['awaiting_approval', 'placed', 'confirmed', 'packed', 'out_for_delivery', 'delivered']
const ago = (ms, nowMs) => {
  if (!ms) return 'not yet today'
  const m = Math.round((nowMs - ms) / 60000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`
}
const MoodIcon = ({ score, size = 26 }) => (score >= 4 ? <Smile size={size} /> : score === 3 ? <Meh size={size} /> : <Frown size={size} />)

export default function Family() {
  const [s, setS] = useState(null)
  const [from, setFrom] = useState('')
  const [text, setText] = useState('')
  const [rec, setRec] = useState(null) // recording handle while capturing a voice sample
  const [busy, setBusy] = useState('')
  const load = () => api('/family/state').then((x) => (setS(x), setFrom((f) => f || x.family?.find((m) => m.phone)?.name || x.family?.[0]?.name || ''))).catch(report)

  useEffect(() => {
    load()
    const es = new EventSource('/api/stream?who=family')
    es.onmessage = () => load()
    const id = setInterval(load, 20000)
    return () => (es.close(), clearInterval(id))
  }, [])

  const decide = (orderId, approve) => (setBusy(orderId), api(`/family/orders/${orderId}`, { approve }).then(load).catch(report).finally(() => setBusy('')))
  const send = async (e) => {
    e.preventDefault()
    if (!text.trim()) return
    setBusy('send')
    await api('/messages', { from, text: text.trim(), channel: 'WhatsApp' }).catch(report)
    setText('')
    setBusy('')
    load()
  }
  const voice = async () => {
    if (rec) return rec.stop()
    try {
      const r = await record({ silenceMs: 4000, maxMs: 20000 })
      setRec(r)
      const blob = await r.result
      setRec(null)
      if (!blob) return
      setBusy('voice')
      await api(`/family/voice/${encodeURIComponent(from)}`, blob, { raw: true })
      load()
    } catch (e) {
      setRec(null)
      report(e)
    }
    setBusy('')
  }

  if (!s) return <div className="stage"><div className="phone"><div className="boot"><img src="/icon.svg" alt="" /></div></div></div>
  if (!s.profile) return <div className="stage"><div className="phone fam"><p className="empty pad">No one is set up in Saathi yet.</p></div></div>

  const nowMs = s.now?.ms ?? Date.now()
  const last = s.readings.at(-1)
  const pendingApprovals = s.orders.filter((o) => o.status === 'awaiting_approval')
  return (
    <div className="stage">
      <div className="phone fam">
        <header className="fam-top">
          <small className="fam-brand"><Users size={14} /> Saathi Family</small>
          <h1>{s.profile.name}</h1>
          <small><Activity size={13} /> Last talked {ago(s.lastActive, nowMs)} · with {s.profile.persona}</small>
        </header>

        <main className="scroll">
          <div className="fam-stats">
            <div className={`stat ${s.mood && s.mood.score <= 2 ? 'warn' : ''}`}>
              <span className={`tile tone-${s.mood?.score <= 2 ? 'rose' : 'amber'}`}><MoodIcon score={s.mood?.score ?? 3} size={22} /></span>
              <b>{s.mood ? s.mood.feelings.slice(0, 2).join(', ') || `${s.mood.score}/5` : '—'}</b>
              <small>Mood</small>
            </div>
            <div className={`stat ${s.today.missed ? 'warn' : ''}`}>
              <span className="tile tone-rose"><Pill size={22} /></span>
              <b>{s.today.taken}/{s.today.due || 0}</b>
              <small>Medicines today</small>
            </div>
            <div className="stat">
              <span className="tile tone-violet"><HeartPulse size={22} /></span>
              <b>{last ? last.value : '—'}</b>
              <small>{last ? last.type.toUpperCase() : 'Reading'}</small>
            </div>
          </div>

          {s.moods.length > 1 && (
            <div className="card mood-trend">
              <small className="eyebrow"><Smile size={14} /> Mood, last {s.moods.length} check-ins</small>
              <div className="bars">
                {s.moods.map((m, i) => <i key={i} style={{ height: `${m.score * 20}%` }} className={m.score <= 2 ? 'low' : ''} title={`${m.date} ${m.feelings.join(', ')}`} />)}
              </div>
            </div>
          )}

          {pendingApprovals.map((o) => (
            <div key={o.id} className="card approval">
              <div className="row-card"><span className="tile tone-blue big"><Pill size={24} /></span>
                <div className="grow"><b>Approve medicine order</b><small>{o.qty} × {o.offer.name} {o.offer.strength} · {o.offer.partner}</small></div>
                <b className="price">₹{o.total}</b>
              </div>
              <div className="btn-row">
                <button className="btn wa-btn" disabled={busy === o.id} onClick={() => decide(o.id, true)}><CheckCircle2 size={18} /> Approve</button>
                <button className="btn ghost" disabled={busy === o.id} onClick={() => decide(o.id, false)}><XCircle size={18} /> Decline</button>
              </div>
            </div>
          ))}

          {s.orders.filter((o) => o.status !== 'awaiting_approval' && o.status !== 'declined').slice(0, 2).map((o) => (
            <div key={o.id} className="card">
              <div className="row-card"><span className="tile tone-leaf big">{o.status === 'delivered' ? <PackageCheck size={24} /> : <Truck size={24} />}</span>
                <div className="grow"><b>{o.med}</b><small>{o.offer.partner} · ₹{o.total}</small></div>
              </div>
              <ol className="track">
                {STEPS.slice(1).map((st) => <li key={st} className={STEPS.indexOf(st) <= STEPS.indexOf(o.status) ? 'on' : ''}><i />{st.replace(/_/g, ' ')}</li>)}
              </ol>
            </div>
          ))}

          <h3 className="section">Care feed</h3>
          {s.feed.length === 0 && <p className="empty">Nothing yet. Updates about medicines, mood and safety appear here.</p>}
          {s.feed.filter((f) => f.kind !== 'approval').map((f) => {
            const [Icon, tone, label] = FEED[f.kind] ?? [Clock, 'slate', f.kind]
            return (
              <div key={f.id} className={`card feed-item ${f.kind}`}>
                <span className={`tile tone-${tone}`}><Icon size={20} /></span>
                <div className="grow">
                  <small className="feed-label">{label} · {ago(f.at, nowMs)}</small>
                  <b>{f.title}</b>
                  <p>{f.text}</p>
                </div>
              </div>
            )
          })}
        </main>

        <form className="fam-compose" onSubmit={send}>
          <div className="compose-row">
            <select value={from} onChange={(e) => setFrom(e.target.value)} aria-label="from">
              {s.family.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
            </select>
            <button type="button" className={`pill-btn ${rec ? 'rec' : ''}`} onClick={voice} disabled={busy === 'voice'}>
              {rec ? <><Square size={14} fill="currentColor" /> Stop</> : <><Mic size={16} /> {s.voices.includes(from) ? 'Voice saved ✓' : 'Record my voice'}</>}
            </button>
          </div>
          <div className="typebar">
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={`Message to ${s.profile.name.split(' ')[0]}…`} />
            <button className="round-btn send" disabled={busy === 'send'} aria-label="send"><Send size={20} /></button>
          </div>
        </form>
      </div>
    </div>
  )
}
