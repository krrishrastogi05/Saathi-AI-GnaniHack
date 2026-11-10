// Mic -> 16 kHz mono WAV (Prisma REST accepts WAV, not the browser's WebM), with a simple silence cut-off.
// ponytail: RMS voice detection and ScriptProcessor. Move to the Prisma WebSocket + AudioWorklet if latency matters.
export async function record({ onLevel, maxMs = 25000, silenceMs = 1500 } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } })
  const ctx = new AudioContext({ sampleRate: 16000 })
  const src = ctx.createMediaStreamSource(stream)
  const node = ctx.createScriptProcessor(4096, 1, 1)
  const chunks = []
  let spoke = false
  let quietSince = 0
  let finish
  const done = new Promise((r) => (finish = r))
  const started = performance.now()

  node.onaudioprocess = (e) => {
    const d = new Float32Array(e.inputBuffer.getChannelData(0))
    chunks.push(d)
    const rms = Math.sqrt(d.reduce((s, v) => s + v * v, 0) / d.length)
    onLevel?.(Math.min(1, rms * 12))
    const now = performance.now()
    if (rms > 0.025) (spoke = true), (quietSince = 0)
    else if (spoke && !quietSince) quietSince = now
    if ((spoke && quietSince && now - quietSince > silenceMs) || now - started > maxMs) finish()
  }
  src.connect(node)
  node.connect(ctx.destination)

  const stop = async () => {
    finish()
    await done
  }
  const result = done.then(() => {
    node.disconnect()
    src.disconnect()
    stream.getTracks().forEach((t) => t.stop())
    ctx.close()
    return spoke ? wav(chunks, 16000) : null
  })
  return { stop, result }
}

function wav(chunks, rate) {
  const len = chunks.reduce((n, c) => n + c.length, 0)
  const buf = new DataView(new ArrayBuffer(44 + len * 2))
  const str = (o, s) => [...s].forEach((ch, i) => buf.setUint8(o + i, ch.charCodeAt(0)))
  str(0, 'RIFF'); buf.setUint32(4, 36 + len * 2, true); str(8, 'WAVEfmt ')
  buf.setUint32(16, 16, true); buf.setUint16(20, 1, true); buf.setUint16(22, 1, true)
  buf.setUint32(24, rate, true); buf.setUint32(28, rate * 2, true); buf.setUint16(32, 2, true); buf.setUint16(34, 16, true)
  str(36, 'data'); buf.setUint32(40, len * 2, true)
  let o = 44
  for (const c of chunks) for (const v of c) buf.setInt16(o, Math.max(-1, Math.min(1, v)) * 0x7fff, true), (o += 2)
  return new Blob([buf], { type: 'audio/wav' })
}

let current
let turn = 0
export function stopSpeaking() {
  turn++
  current?.pause()
  speechSynthesis.cancel()
}

// Speak with Gnani Timbre; fall back to the browser voice so the demo never goes silent.
// A newer speak() or stopSpeaking() makes an older one drop its audio.
// voiceOf: a family member whose cloned voice should read this text.
export async function speak(text, lang, persona, voiceOf) {
  stopSpeaking()
  const mine = turn
  if (!text) return
  try {
    const r = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, lang, persona, voiceOf }) })
    if (!r.ok) throw new Error(await r.text())
    const blob = await r.blob()
    if (mine !== turn) return
    const audio = (current = new Audio(URL.createObjectURL(blob)))
    await audio.play()
    await new Promise((res) => (audio.onended = audio.onpause = res))
  } catch (e) {
    if (mine !== turn) return
    console.warn('Timbre failed, using browser voice', e)
    const u = new SpeechSynthesisUtterance(text.replace(/<[a-z ]+>\s*/g, ''))
    u.lang = lang || 'hi-IN'
    u.rate = 0.9
    speechSynthesis.speak(u)
    await new Promise((res) => (u.onend = u.onerror = res))
  }
}
