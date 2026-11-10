# Saathi

Saathi is a voice companion for older people in India. The companion talks like a friend of the same age, not like a helper. It speaks all 10 Gnani languages.

**Solution pitch (1 page): [PITCH.md](PITCH.md)**

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

## Care features

- **Life Graph** (Memory tab): a knowledge graph of people, medicines, conditions, places, memories, moods and orders. Every chat adds to it, and the agent uses it in each reply.
- **Follow-ups**: the agent saves worries and plans with a follow-up flag and asks about them on later days.
- **Mood care loop**: the agent logs moods. On a low day the family app gets a quiet nudge. A quiet morning gets a check-in at 11:00 and a family alert at 13:00. The family gets an evening digest at 20:00.
- **Agentic medicine ordering**: stock goes down with each confirmed dose. At 5 days left the companion compares prices across pharmacy partners (cheapest and generic first), orders after the elder says yes, sends the order to the family for approval and payment, tracks it, and adds the stock on delivery.
- **Pharmacy partner API**: Saathi uses only an HTTP contract (`GET /search`, `POST /orders`, `GET /orders/:id`, see `pharmacy.js`). Set `PHARMACY_APIS` to real partner base URLs. Without it, three labelled demo stores with synthetic prices serve the same contract at `/partner/pharmacy/*`.
- **Messages and scam shield**: incoming messages are summarised and read aloud. Scams (OTP, KYC, prizes, links) get a firm warning, and the family is told. On a real phone an Android notification listener feeds `POST /api/messages`; in this build the family app and the demo panel post the messages.
- **Family voices**: a family member records 5 to 30 seconds once (family app). Gnani voice cloning then reads their messages to the elder in their own voice.

## Screens

- `/` elder app, `/family` family app (son or daughter), `/intro` opening title for the demo video.
- Demo controls: open `/?demo` or triple-tap the date. Set the clock (a scheduled job then fires live), make a medicine run low, send a scam SMS, send a family message, send the evening digest.
- `ORDER_STEP_MIN` (default 1) sets how many minutes each order status takes in the demo partner.

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
