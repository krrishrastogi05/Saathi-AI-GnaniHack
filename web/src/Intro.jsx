// Opening title for demos: "Namaste" in ten Indian languages on glass, then the brand and Gnani credit.
import { useEffect, useState } from 'react'
import './styles.css'

const HELLO = [
  ['नमस्ते', 'Hindi'], ['வணக்கம்', 'Tamil'], ['నమస్కారం', 'Telugu'], ['ನಮಸ್ಕಾರ', 'Kannada'], ['നമസ്കാരം', 'Malayalam'],
  ['नमस्कार', 'Marathi'], ['নমস্কার', 'Bengali'], ['ਸਤ ਸ੍ਰੀ ਅਕਾਲ', 'Punjabi'], ['નમસ્તે', 'Gujarati'], ['Hello', 'English'],
]

export default function Intro() {
  const [i, setI] = useState(0)
  const done = i >= HELLO.length
  useEffect(() => {
    if (done) return
    const t = setTimeout(() => setI(i + 1), 1100)
    return () => clearTimeout(t)
  }, [i])
  return (
    <div className="intro" onClick={() => setI(0)}>
      <span className="blob b1" /><span className="blob b2" /><span className="blob b3" />
      <div className="glass">
        {!done ? (
          <div key={i} className="hello">
            <b>{HELLO[i][0]}</b>
            <small>{HELLO[i][1]}</small>
          </div>
        ) : (
          <div className="hello final">
            <img src="/avatars/male-portrait.png" alt="" />
            <img src="/avatars/female-portrait.png" alt="" />
            <b>Saathi</b>
            <small>A friend your own age · in 10 Indian languages</small>
          </div>
        )}
        <div className="dots-row">{HELLO.map((_, k) => <i key={k} className={k === i ? 'on' : k < i ? 'past' : ''} />)}</div>
      </div>
      <p className="powered">Powered by <b>Gnani.ai</b> · Prisma v3 speech recognition · Timbre v3 voices</p>
    </div>
  )
}
