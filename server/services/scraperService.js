const { ApifyClient } = require('apify-client');
const axios = require('axios');
const { searchLinkedInDirectly } = require('./linkedinService');
const { calculateActivityScore } = require('./scoringService');

// ── LinkedIn Jobs scraper (optional enrichment) ───────────────────────────────
// Builds a LinkedIn jobs search URL for a role + city
const buildLinkedInJobsUrl = (role, city) => {
  const keyword = encodeURIComponent(role);
  const location = encodeURIComponent(`${city}, India`);
  // r604800 = last 7 days
  return `https://www.linkedin.com/jobs/search/?keywords=${keyword}&location=${location}&f_TPR=r604800&sortBy=DD`;
};

// Scrape LinkedIn Jobs via Apify to get posting dates & company names
const scrapeLinkedInJobs = async (role, city, count, onProgress) => {
  const apiKey = process.env.APIFY_API_KEY;
  if (!apiKey) return [];

  const client = new ApifyClient({ token: apiKey });
  const url = buildLinkedInJobsUrl(role, city);

  if (onProgress) onProgress({ stage: 'linkedin_jobs', message: `Fetching LinkedIn job postings for ${role} in ${city}…` });

  try {
    const run = await client.actor('curious_coder/linkedin-jobs-scraper').call({
      urls: [url],
      limit: Math.min(count, 50),
    }, { waitSecs: 90 });

    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    if (onProgress) onProgress({ stage: 'linkedin_jobs_done', message: `LinkedIn Jobs: found ${items.length} postings` });

    return items
      .filter((item) => item.companyName && item.title)
      .map((item) => ({
        company: String(item.companyName || '').trim(),
        jobTitle: String(item.title || '').trim(),
        // LinkedIn shows "X days ago" or an ISO date in postedAt
        daysPosted: parseDaysPosted(item.postedAt || item.postedDate || item.timeAgo),
        companyLinkedinUrl: item.companyLinkedinUrl || null,
      }));
  } catch (err) {
    console.log(`[linkedin-jobs] failed or blocked: ${err.message}`);
    return [];
  }
};

// Parse "2 days ago", "1 week ago", ISO date, or number → integer days
const parseDaysPosted = (value) => {
  if (!value) return 0;
  const s = String(value).toLowerCase().trim();
  if (/^\d+$/.test(s)) return Number(s);
  const dayMatch = s.match(/(\d+)\s*day/);
  if (dayMatch) return Number(dayMatch[1]);
  const weekMatch = s.match(/(\d+)\s*week/);
  if (weekMatch) return Number(weekMatch[1]) * 7;
  const monthMatch = s.match(/(\d+)\s*month/);
  if (monthMatch) return Number(monthMatch[1]) * 30;
  // ISO date
  try {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      return Math.round((Date.now() - d.getTime()) / 86_400_000);
    }
  } catch { /* ignore */ }
  return 0;
};

// ── Optional: Firecrawl on scraper-friendly boards ───────────────────────────
const FRIENDLY_PLATFORMS = [
  {
    name: 'Wellfound',
    buildUrl: (role, city) =>
      `https://wellfound.com/jobs?role=${encodeURIComponent(role)}&location=${encodeURIComponent(city)}`,
  },
  {
    name: 'Cutshort',
    buildUrl: (role, city) =>
      `https://cutshort.io/jobs?title=${encodeURIComponent(role)}&location=${encodeURIComponent(city)}`,
  },
];

const EXTRACT_PROMPT = `Extract a list of active job postings from this page. For each posting return a JSON object with these exact fields:
- company: the exact company name as displayed
- title: the full job title
- daysPosted: integer representing how many days ago the job was posted (0 = today, 1 = yesterday, etc.)
- posterName: first and last name of the person who personally posted or is listed as the hiring contact (null if only a company/HR name is shown)
- posterTitle: the job title or seniority level of that poster, e.g. "Head of Engineering", "VP Product", "Founder" (null if not visible)`;

const firecrawlExtract = async (platform, role, city, apiKey) => {
  const targetUrl = platform.buildUrl(role, city);
  try {
    const postResponse = await axios.post(
      'https://api.firecrawl.dev/v1/extract',
      { urls: [targetUrl], prompt: EXTRACT_PROMPT },
      { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
    );
    if (!postResponse.data?.success || !postResponse.data?.id) return [];

    const jobId = postResponse.data.id;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const statusResponse = await axios.get(
        `https://api.firecrawl.dev/v1/extract/${jobId}`,
        { headers: { Authorization: `Bearer ${apiKey}` } }
      );
      const { status, data: responseData } = statusResponse.data;
      if (status === 'completed') {
        let result = null;
        if (Array.isArray(responseData) && responseData.length > 0) result = responseData[0].extract || responseData[0];
        else if (responseData?.extract && Array.isArray(responseData.extract)) result = responseData.extract;
        else if (responseData?.data && Array.isArray(responseData.data)) result = responseData.data;
        if (Array.isArray(result) && result.length > 0) {
          return result.map((job) => ({ ...job, source: platform.name }));
        }
        return [];
      }
      if (status === 'failed') return [];
    }
    return [];
  } catch (err) {
    console.log(`[firecrawl/${platform.name}] blocked or failed: ${err.message}`);
    return [];
  }
};

// ── Mock fallback ─────────────────────────────────────────────────────────────
const REAL_COMPANIES = [
  'Flipkart', 'Swiggy', 'Zomato', 'BrowserStack', 'Postman', 'Paytm', 'Razorpay', 'CRED',
  'Ola', 'OYO', 'Meesho', 'Zepto', 'Zerodha', 'Dream11', 'Upstox', 'ShareChat',
  'Freshworks', 'Zoho', 'Chargebee', 'Innovaccer', 'Darwinbox', 'Hasura',
  'Unacademy', 'Vedantu', 'Eruditus', 'Upgrad', 'Lenskart', 'Nykaa', 'PharmEasy',
  '1mg', 'CureFit', 'Groww', 'Pine Labs', 'BharatPe', 'Digit Insurance', 'PolicyBazaar',
  'Delhivery', 'Shadowfax', 'BlackBuck', 'Zetwerk', 'Moglix', 'Urban Company',
  'NoBroker', 'CarDekho', 'ClearTax', 'KhataBook', 'Jupiter', 'Fi Money', 'MobiKwik',
  'CleverTap', 'MoEngage', 'WebEngage', 'Yellow.ai', 'Haptik', 'HighRadius',
  'Icertis', 'Druva', 'Zenoti', 'Fractal', 'GreyOrange', 'Capillary',
];

const TITLE_BY_FUNCTION = {
  Engineering: ['Head of Engineering', 'VP Engineering', 'Director of Engineering', 'CTO', 'Engineering Manager', 'Principal Engineer'],
  Product:     ['Head of Product', 'VP Product', 'Chief Product Officer', 'Director of Product', 'Group Product Manager'],
  Marketing:   ['Head of Marketing', 'VP Marketing', 'CMO', 'Director of Marketing', 'Head of Growth'],
};

const INDIAN_NAMES = [
  'Arjun Mehta', 'Priya Sharma', 'Rahul Joshi', 'Sneha Patel', 'Vikram Nair',
  'Ananya Krishnan', 'Rohan Gupta', 'Deepika Agarwal', 'Karan Malhotra', 'Neha Reddy',
  'Siddharth Rao', 'Pooja Iyer', 'Aditya Bansal', 'Kavitha Suresh', 'Nikhil Verma',
  'Shruti Desai', 'Amit Saxena', 'Divya Menon', 'Kunal Kapoor', 'Meera Pillai',
  'Varun Choudhary', 'Tanya Singh', 'Rajat Khanna', 'Sandeep Kumar', 'Prateek Jain',
  'Lakshmi Venkatesh', 'Abhishek Tiwari', 'Mohit Aggarwal', 'Vivek Pandey', 'Ankita Doshi',
];

const ALL_SOURCES = ['Naukri', 'Wellfound', 'Cutshort', 'Instahyre', 'IIM Jobs', 'Times Jobs'];

const generateMockLeads = (role, city, count) => {
  const batchTag = String(Date.now()).slice(-5);
  const fn = Object.keys(TITLE_BY_FUNCTION).find((k) => k.toLowerCase() === String(role || '').toLowerCase()) || 'Engineering';
  const titles = TITLE_BY_FUNCTION[fn];
  const leads = [];

  for (let i = 0; i < Math.min(count, REAL_COMPANIES.length); i++) {
    const company = `${REAL_COMPANIES[i]} [${batchTag}]`;
    const title = titles[i % titles.length];
    const name = INDIAN_NAMES[i % INDIAN_NAMES.length];
    const numSrc = i % 3 === 0 ? 3 : i % 2 === 0 ? 2 : 1;
    const sources = ALL_SOURCES.slice(i % ALL_SOURCES.length, (i % ALL_SOURCES.length) + numSrc)
      .concat(ALL_SOURCES.slice(0, Math.max(0, numSrc - (ALL_SOURCES.length - (i % ALL_SOURCES.length)))));
    const daysPosted = (i % 14) + 1;
    const score = calculateActivityScore(daysPosted, sources.length, title);

    leads.push({
      name,
      title,
      company,
      city: city || 'Bangalore',
      function: fn,
      email: `contact@${REAL_COMPANIES[i].replace(/\s+/g, '').toLowerCase()}.com`,
      linkedin_url: null,
      activity_score: score,
      days_posted: daysPosted,
      source_platforms: sources,
      pipeline_stage: 'Found',
      status: 'Found',
      is_blacklisted: false,
    });
  }
  return leads;
};

// ── Main pipeline ─────────────────────────────────────────────────────────────
const scrapeAllPlatforms = async (role, city, strictHiringManager, options = {}) => {
  const count = Math.max(10, Math.min(500, Number(options.count || 50)));
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
  const apifyKey = process.env.APIFY_API_KEY;
  const firecrawlKey = process.env.FIRECRAWL_API_KEY;

  let leads = [];

  // ── Step 1: LinkedIn direct people search (primary) ──────────────────────
  if (apifyKey) {
    try {
      const linkedinLeads = await searchLinkedInDirectly(role, city, count, onProgress, strictHiringManager);
      leads = [...leads, ...linkedinLeads];
      console.log(`[pipeline] Apify LinkedIn direct: ${linkedinLeads.length} hiring managers`);

      if (onProgress && linkedinLeads.length > 0) {
        onProgress({ stage: 'linkedin_people', message: `Found ${linkedinLeads.length} hiring managers directly from LinkedIn.` });
      } else if (onProgress) {
        onProgress({ stage: 'linkedin_people', message: 'LinkedIn direct search returned no results. Trying job postings…' });
      }
    } catch (err) {
      console.log(`[pipeline] Apify LinkedIn direct failed: ${err.message}`);
      if (onProgress) onProgress({ stage: 'linkedin_error', message: `LinkedIn direct search failed: ${err.message}` });
    }
  } else {
    if (onProgress) onProgress({ stage: 'skip_apify', message: 'APIFY_API_KEY not configured — skipping LinkedIn search.' });
  }

  // ── Step 2: LinkedIn Jobs via Apify (optional enrichment, get posting dates) ──
  if (apifyKey && leads.length < count) {
    try {
      const jobPostings = await scrapeLinkedInJobs(role, city, count - leads.length, onProgress);
      if (jobPostings.length > 0) {
        console.log(`[pipeline] LinkedIn Jobs: ${jobPostings.length} postings for date context`);
        // Merge posting dates into existing leads by company match
        const postingByCompany = new Map(
          jobPostings.map((j) => [j.company.toLowerCase(), j])
        );
        leads = leads.map((lead) => {
          const posting = postingByCompany.get(String(lead.company || '').toLowerCase());
          if (posting && posting.daysPosted > 0) {
            return {
              ...lead,
              days_posted: posting.daysPosted,
              activity_score: calculateActivityScore(posting.daysPosted, lead.source_platforms?.length || 1, lead.title),
            };
          }
          return lead;
        });
      }
    } catch (err) {
      console.log(`[pipeline] LinkedIn Jobs enrichment failed: ${err.message}`);
    }
  }

  // ── Step 3: Firecrawl on scraper-friendly boards (optional) ──────────────
  if (firecrawlKey) {
    for (const platform of FRIENDLY_PLATFORMS) {
      if (leads.length >= count) break;
      try {
        if (onProgress) onProgress({ stage: 'firecrawl', message: `Trying ${platform.name} via Firecrawl…` });
        const scraped = await firecrawlExtract(platform, role, city, firecrawlKey);
        if (scraped.length > 0) {
          console.log(`[pipeline] Firecrawl ${platform.name}: ${scraped.length} results`);
          if (onProgress) onProgress({ stage: 'firecrawl_done', message: `${platform.name}: found ${scraped.length} additional leads.` });
          // Convert raw scrape rows into lead shape
          for (const job of scraped) {
            if (!job.company) continue;
            const daysPosted = Number(job.daysPosted || 0);
            const score = calculateActivityScore(daysPosted, 1, job.posterTitle || job.title || '');
            leads.push({
              name: job.posterName || null,
              title: job.posterTitle || job.title || '',
              company: job.company,
              city: city || null,
              function: role || null,
              email: `contact@${job.company.replace(/\s+/g, '').toLowerCase()}.com`,
              linkedin_url: null,
              activity_score: score,
              days_posted: daysPosted,
              source_platforms: [platform.name],
              pipeline_stage: 'Found',
              status: 'Found',
              is_blacklisted: false,
            });
          }
        } else {
          if (onProgress) onProgress({ stage: 'firecrawl_blocked', message: `Job boards blocked automated scraping on ${platform.name}. Using LinkedIn results only.` });
        }
      } catch (err) {
        console.log(`[pipeline] Firecrawl ${platform.name} failed: ${err.message}`);
        if (onProgress) onProgress({ stage: 'firecrawl_blocked', message: `Job boards blocked automated scraping. Using LinkedIn direct search instead.` });
      }
    }
  }

  // ── Step 4: Remove leads without a name (only valid people count) ─────────
  leads = leads.filter((l) => l.name && String(l.name).trim().length > 1);

  // Deduplicate by name+company
  const seen = new Set();
  leads = leads.filter((l) => {
    const key = `${String(l.name).toLowerCase()}::${String(l.company).toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  leads = leads.sort((a, b) => b.activity_score - a.activity_score).slice(0, count);

  // ── Step 5: Nothing worked — fall back to mock ────────────────────────────
  if (leads.length === 0) {
    console.log('[pipeline] All sources returned nothing. Using mock data.');
    if (onProgress) onProgress({ stage: 'mock_fallback', message: 'Both scraping methods failed. Generating realistic mock leads.' });
    return generateMockLeads(role, city, count);
  }

  console.log(`[pipeline] Total leads after pipeline: ${leads.length}`);
  return leads;
};

module.exports = { scrapeAllPlatforms, generateMockLeads };
