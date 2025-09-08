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
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) return '{}';
  return text.slice(start, end + 1);
}

function dedupeEvents(arr = []) {
  const seen = new Set();
  const out = [];
  for (const e of arr) {
    const key =
      (e.link && String(e.link).toLowerCase()) ||
      [e.name, e.city, e.state, e.date].filter(Boolean).join('|').toLowerCase();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

// --- Date parsing helpers (more forgiving) ---
function sanitizeDateString(s) {
  if (!s || typeof s !== 'string') return s;
  return s
    .replace(/(\d+)(st|nd|rd|th)/gi, '$1')   // 1st → 1
    .replace(/\s?[-–]\s?\d{1,2}(?=,|\s|$)/, '') // Jan 5–7, 2025 → Jan 5, 2025
    .replace(/\bSept\b/gi, 'Sep');           // Sept → Sep (Date likes "Sep")
}

function ensureYear(s) {
  if (!s || typeof s !== 'string') return s;
  if (/\b\d{4}\b/.test(s)) return s; // already has a year
  const now = new Date();
  const Y = now.getFullYear();
  // Month name?
  if (/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(s)) {
    return `${s}, ${Y}`;
  }
  // Numeric MM/DD (or MM-DD)
  if (/^\s*\d{1,2}[\/-]\d{1,2}\s*$/.test(s)) {
    return `${s}/${Y}`;
  }
  return s;
}

function parseUSDate(label) {
  if (!label) return null;
  const s1 = sanitizeDateString(label);
  const s2 = ensureYear(s1);
  const d = new Date(s2);
  return d && !isNaN(d.getTime()) ? d : null;
}

function withinNextDays(date, days) {
  const now = new Date();
  const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return date > now && date <= end;
}

function coerceEventsShape(parsed, stateKey) {
  // Accept several shapes the model might return
  if (Array.isArray(parsed?.events)) return parsed.events;
  if (Array.isArray(parsed?.data)) return parsed.data;
  if (Array.isArray(parsed?.[stateKey])) return parsed[stateKey];
  if (Array.isArray(parsed)) return parsed;
  return [];
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

TASK: List up to ${targetPerState} REAL business-focused events in ${state} occurring AFTER ${today} and BEFORE ${futureDate} (next ${days} days).
Event types: chamber events, trade shows, business conferences, networking events, workshops.

Rules:
- Prefer official sources (.gov, chambers, associations, organizers).
- If unsure an event is real, OMIT it.
- Use "Free" or a $ value for cost if known; otherwise omit the field.
- Use proper state code (MA, ME, RI, VT) for "state".
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
      days = 120,                 // widen window to improve recall
      allowUnknownDates = false,  // UI can override; we also soft-fill below if empty
      targetPerState = 12
    } = req.body || {};

    const today = new Date().toLocaleDateString('en-US');
    const futureDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toLocaleDateString('en-US');

    // Build prompts per state
    const prompts = STATES.map((state) =>
      buildStatePrompt(state, today, futureDate, days, targetPerState)
    );

    // Fire in parallel
    const calls = prompts.map((content) =>
      openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        max_tokens: 4500,
        response_format: { type: 'json_object' }, // enforce JSON when supported
        messages: [{ role: 'user', content }]
      })
    );

    const settled = await Promise.allSettled(calls);
    const results = emptyResult();

    settled.forEach((resItem, idx) => {
      const state = STATES[idx];
      if (resItem.status !== 'fulfilled') {
        console.log(`Business fetch failed for ${state}:`, resItem.reason?.message);
        results[state] = [];
        return;
      }

      const content = resItem.value?.choices?.[0]?.message?.content?.trim() || '{}';
      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch {
        parsed = JSON.parse(extractJson(content)); // recover if JSON mode ignored
      }

      const arr = coerceEventsShape(parsed, state);

      // Strict filter first (dates must parse & be within window)
      let strict = arr.filter((e) => {
        const d = parseUSDate(e?.date);
        return d && withinNextDays(d, days);
      });

      // If strict came back light AND allowUnknownDates=false, softly add TBD-date rows
      if (strict.length < Math.min(6, targetPerState) && allowUnknownDates === false) {
        const tbd = arr.filter((e) => !parseUSDate(e?.date) && e?.name && e?.link);
        // keep at most to targetPerState
        strict = [...strict, ...tbd].slice(0, targetPerState);
      }

      results[state] = dedupeEvents(strict);
    });

    return res.status(200).json(results);
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ message: 'Failed to fetch opportunities', error: error.message });
  }
}
