// Saathi personas from the brand sheet: an elder with a glowing visor. The visor eyes show the app state.
// phase: idle (happy) | listening | thinking | speaking | surprised
const EYES = {
  happy: ['M33 49q5-6 10 0', 'M57 49q5-6 10 0'],
  thinking: ['M33 47h10', 'M57 49q5-6 10 0'],
  surprised: ['M38 47m-3.5 0a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0', 'M62 47m-3.5 0a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0'],
  wink: ['M33 49q5-6 10 0', 'M58 45l8 3-8 3'],
}

export default function Avatar({ persona, phase = 'idle', size }) {
  const female = persona?.id === 'female'
  const eyes = EYES[{ thinking: 'thinking', surprised: 'surprised', wink: 'wink' }[phase] ?? 'happy']
  return (
    <div className={`avatar ${female ? 'female' : 'male'} ${phase}`} style={size ? { width: size, height: size } : undefined} role="img" aria-label={persona?.name}>
      <svg viewBox="0 0 100 100" aria-hidden>
        <defs>
          <linearGradient id="av-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#7652e0" />
            <stop offset="1" stopColor="#2f5fd8" />
          </linearGradient>
          <filter id="av-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.6" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <rect width="100" height="100" fill="url(#av-bg)" />

        {/* clothes */}
        {female ? (
          <>
            <path d="M14 100q4-22 36-24q32 2 36 24z" fill="#5b2d8e" />
            <path d="M30 100q10-20 34-23l6 3q-20 6-28 20z" fill="#e9b45a" />
            <path d="M44 80q6 4 12 0" stroke="#f2c14e" strokeWidth="1.6" fill="none" />
          </>
        ) : (
          <>
            <path d="M14 100q4-22 36-24q32 2 36 24z" fill="#f6ead6" />
            <path d="M44 76l6 8 6-8" fill="#e6d6bb" />
            <path d="M66 79q8 4 12 21h-10q-2-12-8-18z" fill="#2c4fa8" />
            <path d="M67 83q6 5 8 17" stroke="#e9b45a" strokeWidth="2" fill="none" />
          </>
        )}

        {/* neck, ears, face */}
        <path d="M43 68h14v10q-7 4-14 0z" fill="#e3a274" />
        <ellipse cx="27" cy="52" rx="4.5" ry="6" fill="#efb486" />
        <ellipse cx="73" cy="52" rx="4.5" ry="6" fill="#efb486" />
        <ellipse cx="50" cy="51" rx="22" ry="24" fill="#f4bd8f" />
        {female && <circle cx="26" cy="59" r="2.6" fill="#f2c14e" stroke="#c98a1c" strokeWidth=".6" />}
        {female && <circle cx="74" cy="59" r="2.6" fill="#f2c14e" stroke="#c98a1c" strokeWidth=".6" />}

        {/* hair */}
        {female ? (
          <>
            <circle cx="24" cy="38" r="9" fill="#e8e6f2" />
            <path d="M28 44q-2-22 22-23q24 1 22 23q-6-10-22-12q-16 2-22 12z" fill="#ecebf5" />
            <path d="M50 22q-2 6-1 11" stroke="#c9c5dd" strokeWidth="1.2" fill="none" />
            <circle cx="50" cy="37" r="1.9" fill="#d62e3a" />
          </>
        ) : (
          <>
            <path d="M27 46q-6-14 4-22q6-8 19-7q13-1 19 7q10 8 4 22q-2-9-9-12q-6 3-14 2q-8 1-14-2q-7 3-9 12z" fill="#ecebf5" />
            <path d="M34 26q4-6 10-4M52 21q6-3 12 2" stroke="#c9c5dd" strokeWidth="1.2" fill="none" />
          </>
        )}

        {/* visor */}
        <rect x="25" y="39" width="50" height="16" rx="8" fill="#1d1652" />
        <rect x="25" y="39" width="50" height="16" rx="8" fill="none" stroke="#6b5fd6" strokeWidth="1.6" />
        <rect x="21" y="43" width="6" height="8" rx="2" fill="#5546b8" />
        <rect x="73" y="43" width="6" height="8" rx="2" fill="#5546b8" />
        <g className="av-eyes" stroke="#6fe3ff" strokeWidth="2.6" strokeLinecap="round" fill="none" filter="url(#av-glow)">
          <path d={eyes[0]} />
          <path d={eyes[1]} />
        </g>

        {/* mustache, mouth */}
        {!female && <path d="M38 63q6-4 12-1q6-3 12 1q-5 4-12 1q-7 3-12-1z" fill="#f2f1f7" />}
        <path className="av-mouth" d="M41 66q9 9 18 0q-9 3-18 0z" fill="#7a2833" />
        <path d="M43 66.4q7 1.6 14 0" stroke="#fff" strokeWidth="1.4" fill="none" />

        {/* listening waves / thinking sparkle */}
        <g className="av-waves" stroke="#9ee9ff" strokeWidth="2" fill="none" strokeLinecap="round">
          <path d="M84 44q4 6 0 12" />
          <path d="M89 40q7 10 0 20" />
          <path d="M16 44q-4 6 0 12" />
        </g>
        <g className="av-spark" stroke="#ffd166" strokeWidth="2" strokeLinecap="round">
          <path d="M80 22l3-5M85 27l5-2M78 17l0-5" />
        </g>
      </svg>
    </div>
  )
}
