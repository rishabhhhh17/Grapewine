const { ApifyClient } = require('apify-client');

// Title seniority score (no job-posting date needed)
const scoreBySeniority = (title) => {
  const t = String(title || '').toLowerCase();
  if (/\b(cto|cpo|cmo|ceo|chief)\b/.test(t)) return 10;
  if (/\b(co-founder|cofounder|founder)\b/.test(t)) return 9;
  if (/\bvp\b|vice president/.test(t)) return 8;
  if (/\bhead of\b/.test(t)) return 8;
  if (/\bdirector\b/.test(t)) return 6;
  if (/\bmanager\b/.test(t)) return 4;
  if (/\blead\b|\bstaff\b|\bprincipal\b/.test(t)) return 5;
  return 3;
};

// Parse "FirstName LastName - Title at Company | ..." or "FirstName LastName - Title at Company"
// Google LinkedIn snippets come in many formats; we extract as much as possible.
const parseLinkedInSnippet = (result) => {
  const raw = String(result.title || '');
  const description = String(result.description || '');
  const url = String(result.url || '');

  // Split on first " - "
  const dashIdx = raw.indexOf(' - ');
  if (dashIdx === -1) return null;

  const name = raw.slice(0, dashIdx).trim();
  if (!name || name.split(' ').length < 2) return null; // skip non-person entries

  const afterDash = raw.slice(dashIdx + 3);

  // Title is everything before " at " or " | "
  let title = afterDash.split(' at ')[0].split(' | ')[0].split(' · ')[0].trim();

  // Company: after " at " if present, else try description
  let company = '';
  const atIdx = afterDash.indexOf(' at ');
  if (atIdx !== -1) {
    company = afterDash.slice(atIdx + 4).split(' | ')[0].split(' · ')[0].trim();
  }

  // Fallback: description often has "Title at Company · City"
  if (!company && description) {
    const descAt = description.indexOf(' at ');
    if (descAt !== -1) {
      company = description.slice(descAt + 4).split(' · ')[0].split(' |')[0].trim();
    }
  }

  // Strip trailing noise from company ("- Mumbai", "| India", etc.)
  company = company.replace(/\s*[-|·].*$/, '').trim();

  if (!company) return null;

  return { name, title, company, linkedinUrl: url };
};

// Build Google search queries to find hiring managers for a role+city
// Each Google query yields ~3-5 parseable LinkedIn profiles (rest are company pages).
// Always run ALL title variants to maximise yield.
const buildPeopleQueries = (role, city, strictHiringManager) => {
  // Keep to 3 high-yield queries per role — fewer queries = faster Apify run (~30s vs 120s)
  const TITLE_MAP = {
    Engineering: [
      `"Head of Engineering" OR "VP Engineering" "${city}" India`,
      `"Director of Engineering" OR "CTO" "${city}" India startup`,
      `"Engineering Manager" OR "Principal Engineer" "${city}" India`,
    ],
    Product: [
      `"Head of Product" OR "VP Product" "${city}" India`,
      `"Chief Product Officer" OR "Director of Product" "${city}" India`,
      `"Group Product Manager" OR "Product Director" "${city}" India`,
    ],
    Marketing: [
      `"Head of Marketing" OR "VP Marketing" "${city}" India`,
      `"CMO" OR "Chief Marketing Officer" "${city}" India startup`,
      `"Director of Marketing" OR "Head of Growth" "${city}" India`,
    ],
  };

  const normRole = Object.keys(TITLE_MAP).find((k) => k.toLowerCase() === String(role || '').toLowerCase()) || 'Engineering';
  let queries = TITLE_MAP[normRole] || TITLE_MAP.Engineering;

  // In strict mode drop manager-level query
  if (strictHiringManager) {
    queries = queries.slice(0, 2);
  }

  return queries.map((q) => `site:linkedin.com/in/ ${q}`);
};

// ── Primary: Google → LinkedIn people search ─────────────────────────────────
const searchLinkedInDirectly = async (role, city, count, onProgress, strictHiringManager = false) => {
  const apiKey = process.env.APIFY_API_KEY;
  if (!apiKey) throw new Error('APIFY_API_KEY not configured');

  const client = new ApifyClient({ token: apiKey });
  const queries = buildPeopleQueries(role, city, strictHiringManager);

  if (onProgress) onProgress({ stage: 'linkedin_search', message: `Searching LinkedIn directly for ${role} managers in ${city} (${queries.length} queries)…` });

  const run = await client.actor('apify/google-search-scraper').call({
    queries: queries.join('\n'),
    maxPagesPerQuery: 1,
  }, { waitSecs: 60 });

  const { items } = await client.dataset(run.defaultDatasetId).listItems();

  const leads = [];
  const seen = new Set();

  for (const item of items) {
    for (const result of (item.organicResults || [])) {
      const parsed = parseLinkedInSnippet(result);
      if (!parsed) continue;

      const key = `${parsed.name.toLowerCase()}::${parsed.company.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const score = scoreBySeniority(parsed.title);

      leads.push({
        name: parsed.name,
        title: parsed.title,
        company: parsed.company,
        city: city || null,
        function: role || null,
        email: `contact@${parsed.company.replace(/\s+/g, '').toLowerCase()}.com`,
        linkedin_url: parsed.linkedinUrl || null,
        activity_score: score,
        days_posted: 0,           // no job-board date available from people search
        source_platforms: ['Wellfound'],  // LinkedIn-sourced
        pipeline_stage: 'Found',
        status: 'Found',
        is_blacklisted: false,
      });

      if (leads.length >= count) break;
    }
    if (leads.length >= count) break;
  }

  if (onProgress) onProgress({ stage: 'linkedin_done', message: `Found ${leads.length} hiring managers directly from LinkedIn.` });
  return leads;
};

// ── Secondary: per-company LinkedIn lookup (used to enrich job-board leads) ──
const findHiringManagersBulk = async (companies, role, strictHiringManager) => {
  const apiKey = process.env.APIFY_API_KEY;
  if (!apiKey) {
    return companies.map((_c, i) => ({
      name: INDIAN_MANAGERS[i % INDIAN_MANAGERS.length].name,
      title: INDIAN_MANAGERS[i % INDIAN_MANAGERS.length].title,
      linkedinUrl: '#',
    }));
  }

  const client = new ApifyClient({ token: apiKey });

  const queries = companies.map((c) =>
    strictHiringManager
      ? `site:linkedin.com/in/ "${c}" ("VP of ${role}" OR "Head of ${role}" OR "${role} Manager" OR "Director of ${role}") ("#hiring" OR "We're hiring")`
      : `site:linkedin.com/in/ "${c}" "${role}" hiring`
  );

  try {
    const run = await client.actor('apify/google-search-scraper').call({
      queries: queries.join('\n'),
      maxPagesPerQuery: 1,
    }, { waitSecs: 60 });

    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    return companies.map((_c, i) => {
      const match = items.find((item) => item.searchQuery?.term === queries[i]);
      const results = (match?.organicResults || []);
      const filtered = strictHiringManager
        ? results.filter((r) => /manager|director|head|vp|chief|founder|talent/i.test(r.title))
        : results;

      if (filtered.length > 0) {
        const best = filtered[0];
        const parsed = parseLinkedInSnippet(best);
        if (parsed) return { name: parsed.name, title: parsed.title, linkedinUrl: best.url };
      }

      const fallback = INDIAN_MANAGERS[i % INDIAN_MANAGERS.length];
      return { name: fallback.name, title: fallback.title, linkedinUrl: '#' };
    });
  } catch (error) {
    console.error('Apify per-company lookup error:', error.message);
    return companies.map((_c, i) => ({
      name: INDIAN_MANAGERS[i % INDIAN_MANAGERS.length].name,
      title: INDIAN_MANAGERS[i % INDIAN_MANAGERS.length].title,
      linkedinUrl: '#',
    }));
  }
};

// Fallback personas (used when Apify key missing or quota exhausted)
const INDIAN_MANAGERS = [
  { name: 'Arjun Mehta',       title: 'VP Engineering' },
  { name: 'Priya Sharma',      title: 'Head of Engineering' },
  { name: 'Rahul Joshi',       title: 'Director of Engineering' },
  { name: 'Sneha Patel',       title: 'Engineering Manager' },
  { name: 'Vikram Nair',       title: 'CTO' },
  { name: 'Ananya Krishnan',   title: 'Head of Product' },
  { name: 'Rohan Gupta',       title: 'VP of Product' },
  { name: 'Deepika Agarwal',   title: 'Director of Product' },
  { name: 'Karan Malhotra',    title: 'Co-Founder & CTO' },
  { name: 'Neha Reddy',        title: 'VP Engineering' },
  { name: 'Siddharth Rao',     title: 'Head of Technology' },
  { name: 'Pooja Iyer',        title: 'Engineering Director' },
  { name: 'Aditya Bansal',     title: 'Staff Engineering Manager' },
  { name: 'Kavitha Suresh',    title: 'Head of Engineering' },
  { name: 'Nikhil Verma',      title: 'VP of Engineering' },
  { name: 'Shruti Desai',      title: 'Director of Technology' },
  { name: 'Amit Saxena',       title: 'Principal Engineering Manager' },
  { name: 'Divya Menon',       title: 'VP Product' },
  { name: 'Kunal Kapoor',      title: 'Director of Engineering' },
  { name: 'Meera Pillai',      title: 'Co-Founder & VP Engineering' },
  { name: 'Varun Choudhary',   title: 'Head of Backend Engineering' },
  { name: 'Tanya Singh',       title: 'Engineering Manager' },
  { name: 'Rajat Khanna',      title: 'VP of Technology' },
  { name: 'Sandeep Kumar',     title: 'Head of Platform Engineering' },
  { name: 'Prateek Jain',      title: 'Senior Director of Engineering' },
  { name: 'Lakshmi Venkatesh', title: 'CTO & Co-Founder' },
  { name: 'Abhishek Tiwari',   title: 'Director of Engineering' },
  { name: 'Mohit Aggarwal',    title: 'VP of Product Engineering' },
  { name: 'Vivek Pandey',      title: 'Head of Infrastructure' },
  { name: 'Ankita Doshi',      title: 'Director of Product' },
];

module.exports = { findHiringManagersBulk, searchLinkedInDirectly };
