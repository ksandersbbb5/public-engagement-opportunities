import OpenAI from 'openai';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

const STATES = ['Massachusetts', 'Maine', 'Rhode Island', 'Vermont'];
const TAXONOMY = [
  "Consumer Education","Scam Prevention","Shredding/Identity Theft","Senior Outreach",
  "Military/Veterans","Youth/Students","Community Festival/Fair","Parade/Civic","Job/Career",
  "Housing/Home Improvement","Health/Wellness","Sustainability","Finance/Budgeting",
  "Technology/Cyber","Other"
];

function emptyResult() {
  return { Massachusetts: [], Maine: [], "Rhode Island": [], Vermont: [] };
}

function extractJson(text = '') {
  // Fallback in case response_format is ignored
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
      (e.link && String(e.link).toLowerCase()) ||
      [e.name, e.city, e.state, e.date].filter(Boolean).join('|').toLowerCase();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

function buildPublicPrompt(state, today, futureDate, days, targetPerState, taxonomy) {
  return `You are assisting the Better Business Bureau.

Return ONLY strict JSON (no prose, no markdown). Shape:
{
  "events": [
    {
      "date": "Month Day, Year",
      "time": "optional, e.g. 10:00 AM – 3:00 PM",
      "city": "City",
      "state": "MA|ME|RI|VT",
      "location": "Venue or address",
      "cost": "Free or $amount",
      "name": "Event Name",
      "topic": "One of: ${taxonomy.join(', ')}",
      "contactInfo": "email@domain.com or null",
      "link": "https://official-source",
      "whyBBBShouldBeThere": "Short reason"
    }
  ]
}

TASK: List up to ${targetPerState} REAL **public/community** events in ${state} occurring AFTER ${today} and BEFORE ${futureDate} (next ${days} days).
Event types: festivals, fairs, town days, parades, library/community programs, university public lectures, consumer shred days, scam-prevention talks, senior expos, farmers markets.

Rules:
- Prefer official sources (.gov, .edu, libraries, universities, chambers, tourism boards, city sites).
- If unsure an event is real, OMIT it.
- "topic" MUST be chosen from the list above; if uncertain, pick "Other".
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
      days = 120,               // wider window to improve recall (UI already sends 120)
      allowUnknownDates = true, // keep rows with TBD dates if we can't parse
      targetPerState = 10       // aim for ~10 per state
    } = req.body || {};

    const today = new Date().toLocaleDateString('en-US');
    const futureDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toLocaleDateString('en-US');

    // Build prompts per state
    const prompts = STATES.map((state) =>
      buildPublicPrompt(state, today, futureDate, days, targetPerState, TAXONOMY)
    );

    // Fire requests in parallel
    const calls = prompts.map((content) =>
      openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        max_tokens: 4500,
        response_format: { type: 'json_object' }, // ask for strict JSON
        messages: [{ role: 'user', content }]
      })
    );

    const settled = await Promise.allSettled(calls);

    // Parse back into our results map
    const results = emptyResult();

    settled.forEach((resItem, idx) => {
      const state = STATES[idx];
      if (resItem.status !== 'fulfilled') {
        console.log(`Public fetch failed for ${state}:`, resItem.reason?.message);
        results[state] = [];
        return;
      }

      const content = resItem.value?.choices?.[0]?.message?.content?.trim() || '{}';
      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch {
        parsed = JSON.parse(extractJson(content)); // fallback if model ignored response_format
      }

      const arr = Array.isArray(parsed?.events) ? parsed.events : [];

      // Normalize, filter dates, validate topic
      const filtered = arr.filter((e) => {
        if (e?.topic && !TAXONOMY.includes(e.topic)) e.topic = "Other";
        const d = parseUSDate(e?.date);
        if (d) return withinNextDays(d, days);
        return allowUnknownDates === true; // keep TBD if allowed
      });

      results[state] = dedupeEvents(filtered);
    });

    return res.status(200).json(results);
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ message: 'Failed to fetch public events', error: error.message });
  }
}
