# Saathi: a voice friend for India's elders

**Built on Gnani.ai Prisma v3 (speech to text), Timbre v3 (text to speech) and Gnani voice cloning. 10 Indian languages.**

## The problem

India has about 149 million people over 60, and this number will be 347 million by 2050 (UNFPA, India Ageing Report 2023). Many of them live alone or spend the day alone while their children work in other cities. Three problems come together:

- **Loneliness.** Nobody asks "how was your day?" until the evening phone call, and some days there is no call.
- **Daily care slips.** Missed medicines, empty strips, unchecked blood pressure, forgotten fasts and puja times.
- **Phones are hostile.** Apps are in English, the text is small, and scam calls and SMS target older people first.

## The solution

Saathi is a companion that speaks like a friend of the same age, in the elder's own language. The elder picks the friend (Kamla ji or Ramesh ji) and only talks. There are no forms.

- **Voice set-up.** The friend asks about health, routine, puja, family and interests. The agent then makes the full daily routine.
- **It starts the conversation.** At the right time it wakes the elder, reads the morning brief (weather, air quality, calm news, one government scheme) and reminds them of medicines, puja and water. It is firm about medicines.
- **Life Graph memory.** People, medicines, conditions, places, moods and worries go into one knowledge graph. The friend asks later: "Did the knee feel better after the doctor?"
- **Family loop.** A family app gets a quiet nudge on a low-mood day, an alert for a missed dose or a blocked scam, and a digest at 8 PM. Family messages are read aloud **in the family member's own cloned voice.**
- **Medicine ordering with approval.** Stock goes down with each dose. At 5 days left the agent compares pharmacy partners (generic and cheapest first). It orders after the elder says yes and the family approves, then tracks the order.
- **Scam shield.** Incoming SMS and WhatsApp text is summarised and read aloud. OTP, KYC and prize scams get a firm warning, and the family is told.
- **Festivals, Ekadashi and birthdays** for the elder's religion, with a ready WhatsApp wish.

## How Saathi is different from Gemini, Siri and Alexa

| General assistants | Saathi |
|---|---|
| Wait for a wake word and a command | Starts the conversation from a scheduled routine |
| Forget the person between sessions | Keeps a Life Graph and follows up on worries |
| A young, neutral helper voice | A same-age friend with the right gender in Hindi grammar and real emotion (sigh, laugh, slow) |
| Only the user | Elder plus family: alerts, approvals, cloned-voice messages |
| Answers questions | Takes actions: orders, reminders, wishes, calls, with human approval for money |

## Technical nuance

- **Speech.** The browser records 16 kHz WAV with an RMS voice detector. Prisma v3 uses `indic-auto` for code-mixed speech. Timbre v3 speaks at 0.92 speed with expression tags. A queue respects Gnani's limit of one concurrent request.
- **Agent.** gpt-oss-120b on Cerebras, with a Groq fallback chain for rate limits. A tool loop runs 25 tools in three tool sets (chat, set-up, scheduled job). The code recovers tool calls that the model leaks as text.
- **Reliability over prompts.** Code, not the LLM, makes the routine. A phone number is saved only if the user said it. A post-filter corrects first-person gender in Hindi. A keyword fallback logs mood when the model forgets.
- **Server scheduler.** Eight schedule types: once, daily, weekly, monthly, yearly, interval, festival, birthday. It uses IST, escalates missed doses, and delivers by SSE and Web Push.
- **Open contracts.** Pharmacies plug in through a 3-endpoint HTTP contract. Food and grocery are designed for MCP servers (Swiggy and Zomato access is pending, so this build uses labelled demo stores).

**Honest scope.** All data in the demo is synthetic. The pharmacy stores are labelled demo partners. On a real phone, an Android notification listener feeds messages. In this build, the family app sends them.

Code and set-up: [README.md](README.md)
