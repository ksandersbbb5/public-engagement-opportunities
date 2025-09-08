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
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) return '{}';
  return text.slice(start, end + 1);
}
function extractEventsArray(text = '') {
  const m = text.match(/"events"\s*:\s*\[(?:[\s\S]*?)\]/);
  if (!m) return '[]';
  const arrStr = m[0].replace(/^[^{[]*"events"\s*:\s*/, '');
  return arrStr;
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

function credibilityScore(link = '') {
  const u = String(link).toLowerCase();
  if (!u) return 0;
  if (u.includes('.gov') || u.includes('.edu')) return 3;
  if (u.includes('library') || u.includes('chamber') || u.includes('tourism') || u.includes('visitor') || u.includes('cvb')) return 2;
  if (u.includes('eventbrite') || u.includes('meetup')) return 1;
  return 0;
}

// Date helpers
function sanitizeDateString(s) {
  if (!s || typeof s !== 'string') return s;
  return s
    .replace(/(\d+)(st|nd|rd|th)/gi, '$1')
    .replace(/\s?[-–]\s?\d{1,2}(?=,|\s|$)/, '')
    .replace(/\bSept\b/gi, 'Sep');
}
function ensureYear(s) {
  if (!s || typeof s !== 'string') return s;
  if (/\b\d{4}\b/.test(s)) return s;
  const Y = new Date().getFullYear();
  if (/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(s)) return `${s}, ${Y}`;
  if (/^\s*\d{1,2}[\/-]\d{1,2}\s*$/.test(s)) return `${s}/${Y}`;
  return s;
}
function parseUSDate(label) {
  const s1 = sanitizeDateString(label);
  const s2 = ensureYear(s1);
  const d = s2 ? new Date(s2) : null;
  return d && !isNaN(d.getTime()) ? d : null;
}
function withinNextDays(date, days) {
  const now = new Date();
  const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return date > now && date <= end;
}

function filterRankLayered(arr, days, allowUnknownDates, target) {
  const now = new Date();
  const strict = [];
  const future180 = [];
  const tbd = [];
  const credible = [];

  for (const e of arr) {
    if (e?.topic && !TAXONOMY.includes(e.topic)) e.topic = 'Other';
    const d = parseUSDate(e?.date);
    if (d) {
      if (withinNextDays(d, days)) strict.push(e);
      else if (d > now && withinNextDays(d, 180)) future180.push(e);
    } else if (allowUnknownDates) {
      tbd.push(e);
    } else if (credibilityScore(e?.link) >= 2) {
      credible.push(e);
    }
  }

  const byScore = (a, b) => credibilityScore(b.link) - credibilityScore(a.link);
  strict.sort(byScore);
  future180.sort(byScore);
  tbd.sort(byScore);
  credible.sort(byScore);

  let out = [...strict];
  if (out.length < target) out = [...out, ...future180];
  if (out.length < target) out = [...out, ...tbd];
  if (out.length < target) out = [...out, ...credible];

  return dedupeEvents(out);
}

function buildPublicPrompt(state, today, futureDate, days, targetPerState) {
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
      "topic": "One of: ${TAXONOMY.join(', ')}",
      "contactInfo": "email@domain.com or null",
      "link": "https://official-source",
      "whyBBBShouldBeThere": "Short reason"
    }
  ]
}

TASK: List up to ${targetPerState} REAL public/community events in ${state} occurring AFTER ${today} and BEFORE ${futureDate} (next ${days} days).
Types: festivals, fairs, town days, parades, library/community programs, university public lectures, consumer shred days, scam-prevention talks, senior expos, farmers markets.

Guidelines:
- Prefer official sources (.gov, .edu, libraries, universities, chambers, tourism boards, city sites).
- If unsure an event is real, OMIT it.
- "topic" MUST be from the list above; if uncertain, choose "Other".
- Use "Free" or a $ value for cost if known; otherwise omit.
- Use proper state code (MA, ME, RI, VT).
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
      days = 150,
      allowUnknownDates = true,
      targetPerState = 12
    } = req.body || {};

    const today = new Date().toLocaleDateString('en-US');
    const futureDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toLocaleDateString('en-US');

    const prompts = STATES.map((state) => buildPublicPrompt(state, today, futureDate, days, targetPerState));

    const calls = prompts.map((content) =>
      openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        max_tokens: 4500,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content }]
      })
    );

    const settled = await Promise.allSettled(calls);
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
        try {
          parsed = JSON.parse(extractJson(content));
        } catch {
          try {
            const arr = JSON.parse(extractEventsArray(content));
            parsed = { events: arr };
          } catch {
            parsed = {};
          }
        }
      }

      const raw = Array.isArray(parsed?.events) ? parsed.events : [];
      const filtered = filterRankLayered(raw, days, allowUnknownDates, targetPerState);
      results[state] = filtered;
    });

    return res.status(200).json(results);
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ message: 'Failed to fetch public events', error: error.message });
  }
}
