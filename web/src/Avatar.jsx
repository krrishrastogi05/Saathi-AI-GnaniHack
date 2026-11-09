import { useState } from 'react'

// Brand artwork cut from the avatar sheet (tools/crop_avatars.py). The expression follows the app state.
const EXPR = { idle: 'happy', speaking: 'happy', listening: 'listening', thinking: 'thinking', surprised: 'surprised', wink: 'wink' }

export default function Avatar({ persona, phase = 'idle', size, portrait }) {
  const id = persona?.id === 'male' ? 'male' : 'female'
  const [missing, setMissing] = useState(false)
  return (
    <div className={`avatar ${id} ${phase}`} style={size ? { width: size, height: size } : undefined} role="img" aria-label={persona?.name}>
      {missing ? (
        <span className="avatar-letter">{persona?.name?.[0]}</span>
      ) : (
        <img src={`/avatars/${id}-${portrait ? 'portrait' : EXPR[phase] ?? 'happy'}.png`} alt="" draggable="false" onError={() => setMissing(true)} />
      )}
    </div>
  )
}
