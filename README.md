# Saathi

Saathi is a voice companion for older people in India. The companion talks like a friend of the same age, not like a helper. It speaks all 10 Gnani languages.

## Gnani models

- **Prisma v3.0** (speech to text): `indic-auto` language detection and code-mixed speech.
- **Timbre v3.0** (text to speech): one persona voice for all 10 languages. Kamla ji uses `Kalpana`. Ramesh ji uses `Yashraj`. Speed is 0.92 for older listeners.
- **Reasoning**: any OpenAI-compatible endpoint. Evon v3.3 is not on the Gnani API yet. To use Evon, serve it with vLLM and set `LLM_BASE_URL` and `LLM_MODEL`.

## Features

- Voice setup: the companion asks the questions (name, age, city, religion, health, routine, family, news topics). The LLM makes the profile, the family list and the first reminders.
- Talk orb: speak, the app transcribes, the agent replies with voice and action cards.
- Reminders: the agent schedules them by voice. The app speaks them and shows a system notification.
- Health log: say a reading. A high or low reading shows call buttons for family, doctor and Elder Line 14567.
- Festivals by religion, Ekadashi, birthdays, and a WhatsApp wish that the user shares.
- Morning brief: weather, air quality with health advice, calm news, one government scheme.
- Demo only: food, medicine, recharge and bill orders.

## Set up

1. Copy `.env.example` to `.env`. Set `GNANI_API_KEY` and `LLM_API_KEY`.
2. Run `npm install`.
3. Run `npm run server` and `npm run web` in two terminals.
4. Open http://localhost:5180.

For one process, run `npm run build`, then `npm start`, then open http://localhost:8790.

## Demo tips

- To skip setup, copy `data/demo-db.json` to `data/db.json` and restart the server. All data in it is synthetic.
- To ring the next reminder now, double-click the date line.
- To pin a date (for example an Ekadashi), set `DEMO_DATE=2026-11-20` in `.env`.
- On setup question 1, "demo: fill sample answers" fills synthetic answers.
- To check the health alert limits, run `node server.js check`.
