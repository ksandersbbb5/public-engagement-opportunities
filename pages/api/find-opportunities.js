import OpenAI from 'openai';

// ---------- CORS ----------
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ---------- CONSTANTS ----------
const STATES = ['Massachusetts', 'Maine', 'Rhode Island', 'Vermont'];

// Service area restriction for Massachusetts
const ALLOWED_MA_COUNTIES = [
  'Barnstable', 'Bristol', 'Dukes', 'Essex', 'Middlesex',
  'Nantucket', 'Norfolk', 'Plymouth', 'Suffolk'
];

// Common MA cities **outside** your service counties (backup guard if "county" missing)
const EXCLUDED_MA_CITIES = new Set([
  'Worcester','Springfield','Holyoke','Chicopee','Westfield','Pittsfield',
  'Northampton','Greenfield','Amherst','Fitchburg','Leominster','Gardner',
  'Southbridge','Athol','Clinton','Webster','Milford','Auburn','Shrewsbury'
]);

// City hints help the model “fan out” geographically per state
const CITY_HINTS = {
  Massachusetts: ["Boston","Cambridge","Somerville","Newton","Brookline","Quincy","Waltham","Lynn","Salem","Gloucester","Lowell","Lawrence","Haverhill","Medford","Malden","Framingham","Plymouth","Barnstable","New Bedford","Fall River"],
  Maine: ["Portland","Bangor","Lewiston","Augusta","Auburn","Biddeford","South Portland","Brunswick","Saco","Sanford"],
  "Rhode Island": ["Providence","Warwick","Cranston","Pawtucket","Newport","East Providence","North Providence","Woonsocket"],
  Vermont: ["Burlington","South Burlington","Rutland","Montpelier","Brattleboro","St. Albans","Bennington","Colchester","Essex"]
};

// Three “channels” per state to increase recall
const CHANNELS = [
  {
    name: "Chamber & Networking",
    focus: "chamber of commerce mixers, networking breakfasts, business after-hours, member expos, young professionals"
  },
  {
    name: "Conferences/Trade Shows/Expos",
    focus: "industry conferences, trade shows, regional business expos, sector-specific showcases (manufacturing, construction, retail, hospitality, tech)"
  },
  {
    name: "Workshops/Training/Programs",
    focus: "SBA/SBDC/SCORE workshops, university incubators/accelerators, economic development programs, procurement/government contracting"
  }
];

// ---------- UTIL ----------
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
  return m[0].replace(/^[^{[]*"events"\s*:\s*/, '');
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
  const u = String(link || '').toLowerCase();
  if (!u) return 0;
  if (u.includes('.gov') || u.includes('.edu')) return 4;
  if (u.includes('sba.gov') || u.includes('score.org') || u.includes('sbdc')) return 4;
  if (u.includes('chamber') || u.includes('association') || u.includes('economic') || u.includes('development')) return 3;
  if (u.includes('eventbrite') || u.includes('meetup')) return 1;
  return 2; // neutral .org/.com
}

// --- Date helpers (forgiving) ---
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

function isAllowedMACounty(countyText = '') {
  const c = String(countyText || '').toLowerCase();
  return ALLOWED_MA_COUNTIES.some(allowed => c.includes(allowed.toLowerCase()));
}
function isExcludedMACity(cityText = '') {
  return EXCLUDED_MA_CITIES.has(String(cityText || '').trim());
}
function filterRegion(e) {
  const st = String(e?.state || '').toUpperCase();
  if (st !== 'MA' && st !== 'MASSACHUSETTS') return true; // special filtering only for MA
  if (e?.county && isAllowedMACounty(e.county)) return true;
  if (e?.county && !isAllowedMACounty(e.county)) return false;
  if (e?.city && isExcludedMACity(e.city)) return false;
  return true;
}

// ---------- LINK VALIDATION & REPAIR ----------
function normalizeUrl(u = '') {
  if (!u) return '';
  try { return new URL(u).toString(); }
  catch {
    try { return new URL(`https://${u}`).toString(); }
    catch { return ''; }
  }
}
async function urlOk(url) {
  if (!url) return false;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 5000);
  try {
    // Try HEAD first
    const r1 = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: controller.signal });
    if (r1.ok) { clearTimeout(t); return true; }
    // Some sites block HEAD → try GET (we're server-side)
    const r2 = await fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal });
    clearTimeout(t);
    return r2.ok;
  } catch {
    clearTimeout(t);
    return false;
  }
}
function originOf(u) {
  try { return new URL(u).origin; } catch { return ''; }
}
function stableCandidates(original) {
  const norm = normalizeUrl(original);
  const origin = originOf(norm);
  const list = [];
  if (norm) list.push(norm);
  if (origin) {
    list.push(`${origin}/events`, `${origin}/calendar`, `${origin}/event`, origin);
  }
  return Array.from(new Set(list));
}
function inferOriginFromEmail(info = '') {
  const m = String(info).match(/@([a-z0-9.-]+\.[a-z]{2,})/i);
  if (!m) return '';
  return `https://${m[1].toLowerCase()}`;
}
function organizerFallbacks(name = '', link = '', contactInfo = '') {
  const n = String(name).toLowerCase();
  const l = String(link).toLowerCase();
  const out = [];
  if (n.includes('sba') || l.includes('sba')) out.push('https://www.sba.gov/events');
  if (n.includes('score') || l.includes('score')) out.push('https://www.score.org/events');
  if (n.includes('sbdc') || l.includes('sbdc')) out.push('https://americassbdc.org'); // stable hub
  const orgFromEmail = inferOriginFromEmail(contactInfo);
  if (orgFromEmail) out.push(`${orgFromEmail}/events`, `${orgFromEmail}/calendar`, orgFromEmail);
  return out;
}
async function ensureWorkingLink(e) {
  // prefer model link if it works, else try stable variants, else organizer fallbacks, else null
  const firstBatch = stableCandidates(e.link);
  for (const c of firstBatch) {
    if (await urlOk(c)) return c;
  }
  const secondBatch = organizerFallbacks(e.name, e.link, e.contactInfo);
  for (const c of secondBatch) {
    if (await urlOk(c)) return c;
  }
  return null; // hide the link in UI if nothing verified
}

// ---------- FILTER/RANK ----------
function filterRankLayered(arr, days, allowUnknownDates, target) {
  const now = new Date();
  const strict = [];
  const future240 = [];
  const tbd = [];
  const credible = [];

  for (const raw of arr) {
    if (!filterRegion(raw)) continue;

    const d = parseUSDate(raw?.date);
    if (d) {
      if (withinNextDays(d, days)) strict.push(raw);
      else if (d > now && withinNextDays(d, 240)) future240.push(raw);
    } else if (allowUnknownDates) {
      tbd.push(raw);
    } else if (credibilityScore(raw?.link) >= 3) {
      credible.push(raw);
    }
  }

  const byScore = (a, b) => credibilityScore(b.link) - credibilityScore(a.link);
  strict.sort(byScore); future240.sort(byScore); tbd.sort(byScore); credible.sort(byScore);

  let out = dedupeEvents([...strict]);
  if (out.length < target) out = dedupeEvents([...out, ...future240]);
  if (out.length < target) out = dedupeEvents([...out, ...tbd]);
  if (out.length < target) out = dedupeEvents([...out, ...credible]);
  return out;
}

// ---------- PROMPTS ----------
function buildChannelPrompt(state, channel, today, futureDate, days, perChannelTarget) {
  const cities = CITY_HINTS[state]?.slice(0, 10).join(', ');
  const maCountyClause = state === 'Massachusetts'
    ? `\nIMPORTANT: Only include events in these Massachusetts counties: ${ALLOWED_MA_COUNTIES.join(', ')}.\n- For Massachusetts events, you MUST include a "county" field with one of exactly those counties. If you cannot determine the county, OMIT the event.\n- Do NOT include Worcester County or any city that lies outside those counties.`
    : '';

  return `You are assisting the Better Business Bureau.

Return ONLY strict JSON (no prose, no markdown). Shape:
{
  "events": [
    {
      "date": "Month Day, Year",
      "time": "optional, e.g. 2:00 PM – 5:00 PM",
      "city": "City",
      "state": "MA|ME|RI|VT",
      ${state === 'Massachusetts' ? `"county": "One of: ${ALLOWED_MA_COUNTIES.join(', ')}",` : ''}
      "location": "Venue or address",
      "cost": "Free or $amount",
      "name": "Event Name",
      "audienceType": "Small business owners, professionals, contractors, retailers, manufacturers, start-ups, etc.",
      "contactInfo": "email@domain.com or null",
      "link": "https://official-listing-or-calendar-or-homepage",
      "whyBBBShouldBeThere": "Short reason"
    }
  ]
}

STATE: ${state}
HORIZON: AFTER ${today} and BEFORE ${futureDate} (next ${days} days)
FOCUS: ${channel.name} — ${channel.focus}
CITY HINTS (for coverage, optional): ${cities || 'n/a'}${maCountyClause}

Link policy (avoid 404s):
- Provide the official listing URL if available.
- If a specific permalink is uncertain, provide the organizer's **events calendar** ("/events" or "/calendar") or **homepage**. Do NOT fabricate deep slugs.
- Prefer credible domains: .gov, .edu, chambers, associations, SBA/SBDC/SCORE, economic development, universities.

Return up to ${perChannelTarget} events for this channel.`;
}

function buildRefillPrompt(state, today, futureDate, days, excludeNames, want) {
  const maCountyClause = state === 'Massachusetts'
    ? `\nIMPORTANT: Only include these MA counties: ${ALLOWED_MA_COUNTIES.join(', ')}. Include a "county" field.`
    : '';
  return `You are assisting the Better Business Bureau.

Return ONLY strict JSON:
{ "events": [ /* same shape as above */ ] }

STATE: ${state}
HORIZON: AFTER ${today} and BEFORE ${futureDate} (next ${days} days)
TASK: Find ${want} ADDITIONAL real business-focused events NOT in this list (case-insensitive):
${excludeNames.join(' | ')}${maCountyClause}

Link policy:
- Use official listing; otherwise the organizer's events calendar or homepage.
- Prefer credible domains (.gov, .edu, chambers, associations, SBA/SBDC/SCORE, economic development, universities).
Return as many as you can up to ${want}.`;
}

// ---------- HANDLER ----------
export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  try {
    if (!process.env.OPENAI_API_KEY) throw new Error('OpenAI API key not found');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const {
      days = 180,
      allowUnknownDates = true,
      targetPerState = 24
    } = req.body || {};

    const today = new Date().toLocaleDateString('en-US');
    const futureDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toLocaleDateString('en-US');

    const results = emptyResult();

    await Promise.all(STATES.map(async (state) => {
      const perChannelTarget = Math.max(8, Math.ceil(targetPerState / CHANNELS.length));

      // 3 channel calls in parallel
      const calls = CHANNELS.map((ch) =>
        openai.chat.completions.create({
          model: 'gpt-4o-mini',
          temperature: 0.2,
          max_tokens: 4500,
          response_format: { type: 'json_object' },
          messages: [{ role: 'user', content: buildChannelPrompt(state, ch, today, futureDate, days, perChannelTarget) }]
        })
      );

      const settled = await Promise.allSettled(calls);
      let merged = [];

      for (const s of settled) {
        if (s.status !== 'fulfilled') continue;
        const content = s.value?.choices?.[0]?.message?.content?.trim() || '{}';
        let parsed;
        try { parsed = JSON.parse(content); }
        catch {
          try { parsed = JSON.parse(extractJson(content)); }
          catch {
            try { parsed = { events: JSON.parse(extractEventsArray(content)) }; }
            catch { parsed = {}; }
          }
        }
        const arr = Array.isArray(parsed?.events) ? parsed.events : [];
        merged = merged.concat(arr);
      }

      // Filter / rank / region guard
      let filtered = filterRankLayered(merged, days, allowUnknownDates, targetPerState);

      // Refill if light
      if (filtered.length < Math.floor(targetPerState * 0.8)) {
        const excludeNames = filtered.map(e => (e?.name || '').slice(0, 80)).filter(Boolean);
        try {
          const refill = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            temperature: 0.2,
            max_tokens: 4500,
            response_format: { type: 'json_object' },
            messages: [{ role: 'user', content: buildRefillPrompt(state, today, futureDate, days, excludeNames, targetPerState) }]
          });
          const refillContent = refill.choices?.[0]?.message?.content?.trim() || '{}';
          let refillParsed;
          try { refillParsed = JSON.parse(refillContent); }
          catch {
            try { refillParsed = JSON.parse(extractJson(refillContent)); }
            catch {
              try { refillParsed = { events: JSON.parse(extractEventsArray(refillContent)) }; }
              catch { refillParsed = {}; }
            }
          }
          const refillArr = Array.isArray(refillParsed?.events) ? refillParsed.events : [];
          filtered = filterRankLayered([...filtered, ...refillArr], days, allowUnknownDates, targetPerState);
        } catch (e) {
          console.log(`Business refill failed for ${state}:`, e?.message);
        }
      }

      // ---- Verify & repair links (async) ----
      const repaired = await Promise.all(
        filtered.map(async (e) => {
          const fixed = await ensureWorkingLink(e);
          return { ...e, link: fixed };
        })
      );

      results[state] = dedupeEvents(repaired);
    }));

    return res.status(200).json(results);
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ message: 'Failed to fetch opportunities', error: error.message });
  }
}
