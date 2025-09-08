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
  if (req.meth
