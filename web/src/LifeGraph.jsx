// Life Graph: everything Saathi knows about the elder, as a living knowledge graph.
import { useEffect, useRef, useState } from 'react'
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceX, forceY } from 'd3-force'
import { api } from './api.js'

const W = 360
const H = 520
const STYLE = {
  self: { r: 30, c: 'var(--brand)' },
  friend: { r: 22, c: 'var(--brand-2)' },
  person: { r: 17, c: 'var(--pink)' },
  medicine: { r: 15, c: 'var(--rose)' },
  condition: { r: 14, c: 'var(--red)' },
  place: { r: 12, c: 'var(--blue)' },
  date: { r: 9, c: 'var(--amber)' },
  interest: { r: 11, c: '#1597c4' },
  ritual: { r: 13, c: 'var(--saffron)' },
  memory: { r: 8, c: 'var(--violet)' },
  mood: { r: 9, c: 'var(--amber)' },
  order: { r: 10, c: 'var(--leaf)' },
}
const LEGEND = [['person', 'People'], ['medicine', 'Medicines'], ['condition', 'Health'], ['memory', 'Memories'], ['mood', 'Moods'], ['place', 'Places']]
const short = (s, n = 18) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

export default function LifeGraph({ refreshKey, persona }) {
  const [, frame] = useState(0)
  const sim = useRef(null)
  const data = useRef({ nodes: [], links: [] })
  const seen = useRef(new Set())
  const [focus, setFocus] = useState(null)

  useEffect(() => {
    let alive = true
    api('/graph').then((g) => {
      if (!alive) return
      // Keep positions of nodes we already have, so new facts grow out of the existing graph.
      const old = new Map(data.current.nodes.map((n) => [n.id, n]))
      const nodes = g.nodes.map((n) => {
        const prev = old.get(n.id)
        const fresh = !seen.current.has(n.id)
        seen.current.add(n.id)
        return prev ? Object.assign(prev, n, { fresh: false }) : { ...n, fresh, x: W / 2 + (Math.random() - 0.5) * 60, y: H / 2 + (Math.random() - 0.5) * 60 }
      })
      const me = nodes.find((n) => n.type === 'self')
      if (me) (me.fx = W / 2), (me.fy = H / 2)
      data.current = { nodes, links: g.links.map((l) => ({ ...l })) }
      sim.current?.stop()
      sim.current = forceSimulation(nodes)
        .force('link', forceLink(data.current.links).id((d) => d.id).distance((l) => (l.target.type === 'memory' || l.target.type === 'date' || l.target.type === 'mood' ? 52 : 96)).strength(0.6))
        .force('charge', forceManyBody().strength(-260))
        .force('collide', forceCollide().radius((d) => (STYLE[d.type]?.r ?? 10) + 14))
        .force('center', forceCenter(W / 2, H / 2))
        .force('x', forceX(W / 2).strength(0.04))
        .force('y', forceY(H / 2).strength(0.06))
        .alpha(old.size ? 0.5 : 1)
        .on('tick', () => frame((f) => f + 1))
    })
    return () => (alive = false)
  }, [refreshKey])
  useEffect(() => () => sim.current?.stop(), [])

  const { nodes, links } = data.current
  const clamp = (v, r, max) => Math.max(r + 4, Math.min(max - r - 4, v))
  const linked = focus && new Set(links.flatMap((l) => (l.source.id === focus || l.target.id === focus ? [l.source.id, l.target.id] : [])))
  return (
    <div className="graph-wrap">
      <div className="legend">
        {LEGEND.map(([t, label]) => <span key={t}><i style={{ background: STYLE[t].c }} />{label}</span>)}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="graph" onClick={() => setFocus(null)}>
        <defs>
          <radialGradient id="g-self"><stop offset="0" stopColor="#8a6cf5" /><stop offset="1" stopColor="#4b34b5" /></radialGradient>
          <clipPath id="clip-friend"><circle r={STYLE.friend.r} /></clipPath>
        </defs>
        {links.map((l, i) => {
          const dim = focus && !(l.source.id === focus || l.target.id === focus)
          const x1 = clamp(l.source.x, 0, W), y1 = clamp(l.source.y, 0, H), x2 = clamp(l.target.x, 0, W), y2 = clamp(l.target.y, 0, H)
          return (
            <g key={i} className={`edge ${dim ? 'dim' : ''}`}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} />
              {(l.source.type === 'self' && ['person', 'friend'].includes(l.target.type)) || (focus && !dim) ? <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 3}>{l.label}</text> : null}
            </g>
          )
        })}
        {nodes.map((n) => {
          const st = STYLE[n.type] ?? STYLE.memory
          const x = clamp(n.x, st.r, W)
          const y = clamp(n.y, st.r, H)
          const dim = focus && !linked?.has(n.id)
          return (
            <g key={n.id} transform={`translate(${x},${y})`} className={`node ${n.type} ${n.fresh ? 'pop' : ''} ${dim ? 'dim' : ''} ${n.open ? 'open' : ''}`} onClick={(e) => (e.stopPropagation(), setFocus(n.id))}>
              {n.type === 'friend' ? (
                <>
                  <circle r={st.r + 3} fill="#fff" />
                  <image href={`/avatars/${persona ?? 'female'}-happy.png`} x={-st.r} y={-st.r} width={st.r * 2} height={st.r * 2} clipPath="url(#clip-friend)" preserveAspectRatio="xMidYMid slice" />
                </>
              ) : (
                <circle r={st.r} fill={n.type === 'self' ? 'url(#g-self)' : st.c} />
              )}
              {n.type === 'self' && <text className="initial" dy="6">{n.label[0]}</text>}
              {n.type === 'medicine' && n.stock != null && n.stock <= 5 && <circle r={st.r + 4} className="warn-ring" />}
              <text className="lbl" dy={st.r + 13}>{short(n.label, n.type === 'memory' ? 22 : 16)}</text>
              {n.sub && (n.type !== 'memory' || focus === n.id) && <text className="sub" dy={st.r + 25}>{short(String(n.sub), 18)}</text>}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
