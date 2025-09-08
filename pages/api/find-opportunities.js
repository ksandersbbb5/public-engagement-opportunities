import OpenAI from 'openai';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

const STATES = ['Massachusetts', 'Maine', 'Rhode Island', 'Vermont'];

function emptyResult() {
  return { Massachusetts: [], Maine: [], 'Rhode Island': [], Vermont: [] };
}

function extractJson(text = '') {
  // Fallback: grab the outermost JSON if model ignored response_format
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) return '{}';
  return text.slice(start, end + 1);
}

function sanitizeDateString(s) {
  if (!s || typeof s !== 'string') return s;
  return s
    .replace(/(\d+)(st|nd|rd|th)/gi, '$1')          // 1st → 1
    .replace(/\s?[-–]\s?\d{1,2}(?=,|\s|$)/, '');    // Jan 5–7, 2025 → Jan 5, 2025
}

function parseUSDate(label) {
  const cleaned = sanitizeDateString(label);
  const d = cleaned ? new Date(cleaned) : null;
  return d && !isNaN(d.getTime()) ? d : null;
}

function withinNextDays(date, days) {
  const now = new Date();
  const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return date > now && date <= end;
}

function dedupeEvents(arr = []) {
  const seen = new Set();
  const out = [];
  for (const e of arr) {
    const key =
      (e.link && e.link.toLowerCase()) ||
      [e.name, e.city, e.state, e.date].filter(Boolean).join('|').toLowerCase();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

function buildStatePrompt(state, today, futureDate, days, targetPerState) {
  return `You are assisting the Better Business Bureau.

Return ONLY strict JSON (no prose, no markdown). Shape:
{
  "events": [
    {
      "date": "Month Day, Year",
      "time": "optional, e.g. 2:00 PM – 5:00 PM",
      "city": "City",
      "state": "MA|ME|RI|VT",
      "location": "Venue or address",
      "cost": "Free or $amount",
      "name": "Event Name",
      "audienceType": "Small business owners, professionals, etc.",
      "contactInfo": "email@domain.com or null",
      "link": "https://official-source",
      "whyBBBShouldBeThere": "Short reason"
    }
  ]
}

TASK: List up to ${targetPerState} REAL **business** events in ${state} occurring AFTER ${today} and BEFORE ${futureDate} (next ${days} days). Types: chamber events, trade shows, business conferences, networking events, workshops.
Rules:
- Prefer official sources (.gov, chambers, associations, venues, organizers).
- If unsure an event is real, OMIT it.
- Use "Free" or a $ value for cost if known; otherwise omit the field.
- Use proper state code for "state" (MA, ME, RI, VT).
- If you cannot find ${targetPerState}, return as many as you can without inventing.`;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  try {
    if (!process.env.OPENAI_API_KEY) throw new Error('OpenAI API key not found');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const {
      days = 120,               // widen the window to improve recall
      allowUnknownDates = false,
      targetPerState = 10       // aim for ~10 per state
    } = req.body || {};

    const today = new Date().toLocaleDateString('en-US');
    const futureDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toLocaleDateString('en-US');

    // Fetch per state to reduce truncation/underfill
    const results = emptyResult();

    for (const state of STATES) {
      const prompt = buildStatePrompt(state, today, futureDate, days, targetPerState);

      let stateEvents = [];
      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          temperature: 0.2,
          max_tokens: 4500,
          response_format: { type: 'json_object' }, // enforce JSON when supported
          messages: [{ role: 'user', content: prompt }],
        });

        const content = completion.choices?.[0]?.message?.content?.trim() || '{}';
        let parsed;
        try {
          parsed = JSON.parse(content);
        } catch {
          parsed = JSON.parse(extractJson(content)); // fallback
        }

        const arr = Array.isArray(parsed?.events) ? parsed.events : [];
        const filtered = arr.filter((e) => {
          const d = parseUSDate(e?.date);
          if (d) return withinNextDays(d, days);
          return allowUnknownDates === true;
        });

        stateEvents = dedupeEvents(filtered);
      } catch (err) {
        console.log(`State fetch error (${state}):`, err?.message);
      }

      results[state] = stateEvents;
    }

    return res.status(200).json(results);
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ message: 'Failed to fetch opportunities', error: error.message });
  }
}
