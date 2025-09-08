import OpenAI from 'openai';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
function emptyResult() {
  return { Massachusetts: [], Maine: [], "Rhode Island": [], Vermont: [] };
}
function extractJson(text = '') {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) return '{}';
  return text.slice(start, end + 1);
}
function sanitizeDateString(s) {
  if (!s || typeof s !== 'string') return s;
  return s
    .replace(/(\d+)(st|nd|rd|th)/gi, '$1')
    .replace(/\s?[-–]\s?\d{1,2}(?=,|\s|$)/, '');
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
const STATES = ['Massachusetts', 'Maine', 'Rhode Island', 'Vermont'];

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  try {
    if (!process.env.OPENAI_API_KEY) throw new Error('OpenAI API key not found');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const { days = 90, allowUnknownDates = false } = (req.body || {});
    const today = new Date().toLocaleDateString('en-US');
    const futureDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toLocaleDateString('en-US');

    const prompt = `Find 6–12 real business events per state in Massachusetts, Maine, Rhode Island, and Vermont for the next ${days} days starting from ${today}. Include Chamber events, trade shows, business conferences, networking events, and workshops.

CRITICAL: Only include events with dates AFTER today (${today}) and before ${futureDate}. All dates must be in the future within the next ${days} days.

Return valid JSON only with this structure:
{
  "Massachusetts": [{"date": "January 15, 2025", "location": "Boston, MA", "cost": "$75", "name": "Event Name", "audienceType": "Business owners", "contactInfo": "email@domain.com", "link": "https://website.com", "whyBBBShouldBeThere": "Networking opportunity details"}],
  "Maine": [],
  "Rhode Island": [],
  "Vermont": []
}

Ensure links are real org URLs and omit any event you are not confident is real.`;

    const completion = await openai.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'gpt-4o-mini',
      temperature: 0.1,
      max_tokens: 6000,
    });

    let results = emptyResult();
    try {
      const responseText = completion.choices[0]?.message?.content?.trim() || '{}';
      const jsonCandidate = extractJson(responseText.replace(/```json?/g, '').replace(/```/g, '').trim());
      const parsed = JSON.parse(jsonCandidate);

      STATES.forEach((state) => {
        const arr = Array.isArray(parsed[state]) ? parsed[state] : [];
        const filtered = arr.filter((e) => {
          const d = parseUSDate(e?.date);
          if (d) return withinNextDays(d, days);
          return allowUnknownDates === true;
        });
        results[state] = filtered;
      });
    } catch (err) {
      console.log('Parse error; returning empty result:', err?.message);
    }

    res.status(200).json(results);
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ message: 'Failed to fetch opportunities', error: error.message });
  }
}
