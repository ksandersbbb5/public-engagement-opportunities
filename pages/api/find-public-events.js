import OpenAI from 'openai';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
function emptyResult() {
  return { Massachusetts: [], Maine: [], "Rhode Island": [], Vermont: [] };
}
function parseUSDate(label) {
  const d = new Date(label);
  return isNaN(d.getTime()) ? null : d;
}
function withinNext90Days(date) {
  const now = new Date();
  const end = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  return date > now && date <= end;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  try {
    if (!process.env.OPENAI_API_KEY) throw new Error('OpenAI API key not found');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const today = new Date().toLocaleDateString('en-US');
    const futureDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US');

    const taxonomy = [
      "Consumer Education","Scam Prevention","Shredding/Identity Theft","Senior Outreach",
      "Military/Veterans","Youth/Students","Community Festival/Fair","Parade/Civic","Job/Career",
      "Housing/Home Improvement","Health/Wellness","Sustainability","Finance/Budgeting",
      "Technology/Cyber","Other"
    ];

    const prompt = `You are a research assistant for the Better Business Bureau.
TASK: Find 15–20 real PUBLIC/COMMUNITY events per state (Massachusetts, Maine, Rhode Island, Vermont) occurring in the next 90 days starting ${today} and before ${futureDate}.
Event types: festivals, fairs, town days, parades, library/community programs, university public lectures, consumer shred days, scam-prevention talks, senior expos, farmers markets.

Return ONLY strict JSON with this shape (no prose, no markdown fences):
{
  "Massachusetts": [
    {
      "date": "January 15, 2025",
      "time": "2:00 PM – 5:00 PM",
      "city": "Boston",
      "state": "MA",
      "location": "Boston City Hall Plaza",
      "cost": "Free",
      "name": "Boston Winter Festival",
      "topic": "Community Festival/Fair",
      "contactInfo": "events@boston.gov",
      "link": "https://www.boston.gov/events/...",
      "whyBBBShouldBeThere": "Large consumer audience; ideal for scam-prevention outreach."
    }
  ],
  "Maine": [],
  "Rhode Island": [],
  "Vermont": []
}

Requirements:
- Include only events dated AFTER ${today} and BEFORE ${futureDate}.
- Prefer official sources (.gov, .edu, chambers, tourism boards, libraries, universities).
- Do not invent events; if unsure, omit it.
- "topic" MUST be one of: ${taxonomy.join(', ')}.
- Include contact email when listed on the page; otherwise leave null.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      max_tokens: 6000,
      messages: [{ role: 'user', content: prompt }],
    });

    let results;
    try {
      const responseText = completion.choices[0]?.message?.content?.trim() || '{}';
      const cleaned = responseText.replace(/```json?/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);

      const states = ['Massachusetts', 'Maine', 'Rhode Island', 'Vermont'];
      results = emptyResult();
      let total = 0;

      states.forEach((state) => {
        const arr = Array.isArray(parsed[state]) ? parsed[state] : [];
        const filtered = arr.filter((e) => {
          const d = parseUSDate(e?.date);
          return d && withinNext90Days(d);
        });
        results[state] = filtered;
        total += filtered.length;
      });

      if (total < 15) results = emptyResult();
    } catch (err) {
      console.log('Parse error; returning empty result:', err?.message);
      results = emptyResult();
    }

    return res.status(200).json(results);
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ message: 'Failed to fetch public events', error: error.message });
  }
}
