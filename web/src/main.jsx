import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import Family from './Family.jsx'
import Intro from './Intro.jsx'

// /family is the son's or daughter's phone, /intro is the opening title for demos, / is the elder's app.
const Page = { '/family': Family, '/intro': Intro }[location.pathname] ?? App

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Page />
  </StrictMode>,
)
