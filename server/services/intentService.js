const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

const extractJsonObject = (text) => {
  if (!text) return null;
  const codeBlockMatch = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/i);
  if (codeBlockMatch?.[1]) return codeBlockMatch[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return null;
};

const normalizeString = (value) => (typeof value === 'string' ? value.trim() : '');

const normalizeArray = (value) => (
  Array.isArray(value)
    ? value.map((item) => normalizeString(item)).filter(Boolean)
    : []
);

const parseIntentJson = (rawText) => {
  const jsonText = extractJsonObject(rawText);
  if (!jsonText) throw new Error('LLM returned no JSON');
  const parsed = JSON.parse(jsonText);
  return {
    role: normalizeString(parsed.role) || null,
    city: normalizeString(parsed.city) || null,
    managerTitles: normalizeArray(parsed.managerTitles),
    keywords: normalizeArray(parsed.keywords),
  };
};

const parseSearchIntent = async ({ query, role, city }) => {
  const rawQuery = normalizeString(query);
  if (!rawQuery) return null;

  const prompt = [
    'Convert the user hiring-lead query into strict JSON.',
    'Return ONLY valid JSON.',
    'Schema:',
    '{',
    '  "role": "Engineering|Product|Marketing|<string>|null",',
    '  "city": "<normalized city>|null",',
    '  "managerTitles": ["CTO","VP Marketing"],',
    '  "keywords": ["marketing","growth"]',
    '}',
    `Defaults if unclear: role="${role || ''}", city="${city || ''}"`,
    `User query: ${rawQuery}`,
  ].join('\n');

  if (!GROQ_API_KEY) return null;

  const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.1,
      messages: [
        { role: 'system', content: 'You return only valid JSON. No prose.' },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!groqResponse.ok) {
    const text = await groqResponse.text();
    throw new Error(`Groq API failed: ${groqResponse.status} ${text}`);
  }

  const payload = await groqResponse.json();
  const rawText = payload?.choices?.[0]?.message?.content || '';
  return parseIntentJson(rawText);
};

module.exports = { parseSearchIntent };
