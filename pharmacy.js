// Pharmacy integration.
//
// Saathi talks to pharmacies only through this HTTP contract:
//   GET  {base}/search?q=<medicine>        -> { offers: [{ sku, name, strength, pack, price, mrp, generic, eta_hours, in_stock }] }
//   POST {base}/orders  { sku, qty, ref }  -> { order_id, status, eta }
//   GET  {base}/orders/:id                 -> { order_id, status, eta, history: [{ status, at }] }
// Statuses: placed -> confirmed -> packed -> out_for_delivery -> delivered.
//
// PHARMACY_APIS (comma-separated base URLs) points at real partners. With none set, Saathi uses the
// demo partners served by `partnerRouter` below. They are clearly labelled demo stores with synthetic prices.
import express from 'express'

// ---------- client used by the agent ----------
export function pharmacyClient(bases) {
  const call = async (url, init) => {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || `pharmacy ${r.status}`)
    return j
  }
  return {
    // Ask every partner at once; one slow or broken partner must not block the others.
    async search(q) {
      const all = await Promise.allSettled(bases.map(async (base) => {
        const j = await call(`${base}/search?q=${encodeURIComponent(q)}`)
        return (j.offers ?? []).map((o) => ({ ...o, partner: j.partner ?? base, base }))
      }))
      return all.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])).filter((o) => o.in_stock).sort((a, b) => a.price - b.price)
    },
    place: (base, sku, qty, ref) => call(`${base}/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sku, qty, ref }) }),
    status: (base, id) => call(`${base}/orders/${id}`),
  }
}

// ---------- demo partners (synthetic catalog, same contract) ----------
const MEDS = [
  ['amlodipine', 'Amlodipine', '5 mg', 'strip of 10', 32],
  ['metformin', 'Metformin', '500 mg', 'strip of 10', 24],
  ['telmisartan', 'Telmisartan', '40 mg', 'strip of 10', 78],
  ['atorvastatin', 'Atorvastatin', '10 mg', 'strip of 10', 96],
  ['glimepiride', 'Glimepiride', '1 mg', 'strip of 10', 58],
  ['thyroxine', 'Thyroxine', '50 mcg', 'bottle of 100', 140],
  ['pantoprazole', 'Pantoprazole', '40 mg', 'strip of 15', 120],
  ['aspirin', 'Aspirin (low dose)', '75 mg', 'strip of 14', 18],
  ['calcium', 'Calcium + Vitamin D3', '500 mg', 'strip of 15', 110],
  ['b12', 'Vitamin B12', '1500 mcg', 'strip of 10', 145],
  ['paracetamol', 'Paracetamol', '650 mg', 'strip of 15', 30],
]
// Each demo store prices the same medicines differently, like real shops.
const STORES = {
  carekart: { name: 'CareKart (demo store)', factor: 1.0, generic: false, eta: 3 },
  quickmeds: { name: 'QuickMeds (demo store)', factor: 1.12, generic: false, eta: 1 },
  generic: { name: 'Generic Kendra (demo store)', factor: 0.45, generic: true, eta: 6 },
}
const FLOW = ['placed', 'confirmed', 'packed', 'out_for_delivery', 'delivered']

export function partnerRouter({ now, stepMinutes = () => 1 }) {
  const router = express.Router()
  const orders = new Map()
  router.use(express.json())

  router.get('/:store/search', (req, res) => {
    const store = STORES[req.params.store]
    if (!store) return res.status(404).json({ error: 'no such store' })
    const q = String(req.query.q ?? '').toLowerCase()
    const offers = MEDS.filter(([key, name]) => q.includes(key) || key.includes(q.split(' ')[0]) || name.toLowerCase().includes(q))
      .map(([key, name, strength, pack, mrp]) => ({
        sku: `${req.params.store}-${key}`,
        name: store.generic ? `${name} (generic)` : name,
        strength, pack, mrp,
        price: Math.round(mrp * store.factor),
        generic: store.generic,
        eta_hours: store.eta,
        in_stock: true,
      }))
    res.json({ partner: store.name, offers })
  })

  router.post('/:store/orders', (req, res) => {
    const store = STORES[req.params.store]
    const med = MEDS.find(([key]) => req.body.sku === `${req.params.store}-${key}`)
    if (!store || !med) return res.status(400).json({ error: 'unknown sku' })
    const id = `${req.params.store.slice(0, 2).toUpperCase()}${Date.now().toString().slice(-6)}`
    orders.set(id, { id, created: now(), sku: req.body.sku, qty: req.body.qty, ref: req.body.ref })
    res.json({ order_id: id, status: 'placed', eta: `${store.eta} h` })
  })

  // Status moves forward with the clock (one step every few minutes) so tracking can be shown live.
  router.get('/:store/orders/:id', (req, res) => {
    const o = orders.get(req.params.id)
    if (!o) return res.status(404).json({ error: 'no such order' })
    const step = Math.min(FLOW.length - 1, Math.floor((now() - o.created) / (stepMinutes() * 60000)))
    res.json({ order_id: o.id, status: FLOW[step], history: FLOW.slice(0, step + 1).map((s, i) => ({ status: s, at: o.created + i * stepMinutes() * 60000 })) })
  })
  return router
}
export const demoStores = Object.keys(STORES)
