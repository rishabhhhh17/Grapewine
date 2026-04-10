const axios = require('axios');

const PLATFORMS = [
  {
    name: 'Naukri',
    buildUrl: (role, city) =>
      `https://www.naukri.com/${role.toLowerCase().replace(/\s+/g, '-')}-jobs-in-${city.toLowerCase()}`
  },
  {
    name: 'Wellfound',
    buildUrl: (role, city) =>
      `https://wellfound.com/jobs?role=${encodeURIComponent(role)}&location=${encodeURIComponent(city)}`
  },
  {
    name: 'Cutshort',
    buildUrl: (role, city) =>
      `https://cutshort.io/jobs?title=${encodeURIComponent(role)}&location=${encodeURIComponent(city)}`
  },
  {
    name: 'Instahyre',
    buildUrl: (role, city) =>
      `https://www.instahyre.com/search-jobs/?q=${encodeURIComponent(role)}&location=${encodeURIComponent(city)}`
  },
  {
    name: 'IIM Jobs',
    buildUrl: (role) =>
      `https://www.iimjobs.com/j/${role.toLowerCase().replace(/\s+/g, '-')}-jobs`
  },
  {
    name: 'Times Jobs',
    buildUrl: (role, city) =>
      `https://www.timesjobs.com/candidate/job-search.html?searchType=personalizedSearch&from=submit&txtKeywords=${encodeURIComponent(role)}&txtLocation=${encodeURIComponent(city)}`
  },
];

const PLATFORM_BY_NAME = PLATFORMS.reduce((acc, platform) => {
  acc[platform.name] = platform;
  return acc;
}, {});

const EXTRACT_PROMPT = `Extract a list of active job postings from this page. For each posting return a JSON object with these exact fields:
- company: the exact company name as displayed
- title: the full job title
- daysPosted: integer representing how many days ago the job was posted (0 = today, 1 = yesterday, etc.)
- posterName: first and last name of the person who personally posted or is listed as the hiring contact (null if only a company/HR name is shown)
- posterTitle: the job title or seniority level of that poster, e.g. "Head of Engineering", "VP Product", "Founder" (null if not visible)`;

const scrapeOnePlatform = async (platform, role, city, apiKey) => {
  const targetUrl = platform.buildUrl(role, city);

  try {
    const postResponse = await axios.post(
      'https://api.firecrawl.dev/v1/extract',
      { urls: [targetUrl], prompt: EXTRACT_PROMPT },
      { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
    );

    if (!postResponse.data?.success || !postResponse.data?.id) return null;

    const jobId = postResponse.data.id;
    let attempts = 0;

    while (attempts < 20) {
      await new Promise(r => setTimeout(r, 2000));
      attempts++;

      const statusResponse = await axios.get(
        `https://api.firecrawl.dev/v1/extract/${jobId}`,
        { headers: { Authorization: `Bearer ${apiKey}` } }
      );

      const { status, data: responseData } = statusResponse.data;

      if (status === 'completed') {
        let extractResult = null;
        if (Array.isArray(responseData) && responseData.length > 0) {
          extractResult = responseData[0].extract || responseData[0];
        } else if (responseData?.extract && Array.isArray(responseData.extract)) {
          extractResult = responseData.extract;
        } else if (responseData?.data && Array.isArray(responseData.data)) {
          extractResult = responseData.data;
        }

        if (Array.isArray(extractResult) && extractResult.length > 0) {
          return extractResult.map(job => ({ ...job, source: platform.name }));
        }
        return null;
      }

      if (status === 'failed') return null;
    }

    return null; // polling timed out
  } catch (error) {
    console.error(`Firecrawl error [${platform.name}]:`, error.response?.data || error.message);
    return null;
  }
};

// Slice raw scrape rows to exactly `count` unique companies, adding batchTag for uniqueness.
const sliceMockToCount = (allJobs, selectedSources, count) => {
  const batchTag = String(Date.now()).slice(-6);
  const seen = new Set();
  const result = [];
  for (const job of allJobs) {
    if (!selectedSources.includes(job.source)) continue;
    if (!seen.has(job.company)) {
      if (seen.size >= count) break;
      seen.add(job.company);
    }
    result.push({ ...job, company: `${job.company} [${batchTag}]` });
  }
  return result;
};

const scrapeAllPlatforms = async (role, city, strictHiringManager, options = {}) => {
  const selectedSources = Array.isArray(options.sources) && options.sources.length
    ? options.sources
    : PLATFORMS.map((p) => p.name);
  const selectedPlatforms = selectedSources
    .map((name) => PLATFORM_BY_NAME[name])
    .filter(Boolean);
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
  const count = Math.max(10, Math.min(500, Number(options.count || 50)));

  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    console.log('No FIRECRAWL_API_KEY found. Returning mock data.');
    const mockData = sliceMockToCount(fallbackMockData(role, strictHiringManager), selectedSources, count);
    if (onProgress) {
      onProgress({
        stage: 'mock',
        message: `External scraper unavailable. Returning ${mockData.length} mock results from selected sources.`,
      });
    }
    return mockData;
  }

  console.log(`Scraping ${selectedPlatforms.length} platforms in parallel for "${role}" in "${city}"...`);
  if (onProgress) {
    onProgress({
      stage: 'start',
      message: `Starting scrape for ${selectedPlatforms.length} sources`,
      sources: selectedSources,
    });
  }

  // Fire all 6 platform scrapes simultaneously
  const settled = await Promise.allSettled(
    selectedPlatforms.map(async (platform) => {
      if (onProgress) {
        onProgress({ stage: 'source_started', source: platform.name, message: `Scraping ${platform.name}...` });
      }
      const result = await scrapeOnePlatform(platform, role, city, apiKey);
      if (onProgress) {
        onProgress({
          stage: 'source_completed',
          source: platform.name,
          results: Array.isArray(result) ? result.length : 0,
          message: `Scraping ${platform.name} complete (${Array.isArray(result) ? result.length : 0} results)`,
        });
      }
      return result;
    })
  );

  const allJobs = [];
  settled.forEach((result, i) => {
    if (result.status === 'fulfilled' && Array.isArray(result.value)) {
      console.log(`  ${selectedPlatforms[i].name}: ${result.value.length} jobs`);
      allJobs.push(...result.value);
    } else {
      console.log(`  ${selectedPlatforms[i].name}: no results`);
    }
  });

  if (allJobs.length === 0) {
    console.log('All platforms returned no results. Falling back to mock data.');
    const fallback = sliceMockToCount(fallbackMockData(role, strictHiringManager), selectedSources, count);
    if (onProgress) {
      onProgress({ stage: 'fallback', message: `Falling back to mock results (${fallback.length})` });
    }
    return fallback;
  }

  if (onProgress) {
    onProgress({ stage: 'completed', message: `Scrape complete with ${allJobs.length} jobs` });
  }
  return allJobs;
};

// Fallback mock — simulates realistic multi-platform scrape results
const fallbackMockData = (role, strictHiringManager) => {
  const realCompanies = [
    'Flipkart', 'Swiggy', 'Zomato', 'BrowserStack', 'Postman', 'Paytm', 'Razorpay', 'CRED',
    'Ola', 'OYO', 'Meesho', 'Zepto', 'Zerodha', 'Dream11', 'Upstox', 'ShareChat',
    'Mindtickle', 'Freshworks', 'Zoho', 'Chargebee', 'Innovaccer', 'Darwinbox', 'Hasura',
    'Unacademy', 'Byjus', 'Vedantu', 'Eruditus', 'Upgrad', 'Spinny', 'Cars24', 'Lenskart',
    'Nykaa', 'Purplle', 'PharmEasy', '1mg', 'Curefit', 'Groww', 'Pine Labs', 'BharatPe',
    'Digit Insurance', 'Acko', 'PolicyBazaar', 'Udaan', 'Delhivery', 'Dunzo', 'Blinkit',
    'Shadowfax', 'Rivigo', 'BlackBuck', 'ElasticRun', 'DealShare', 'OfBusiness', 'Infra.Market',
    'Zetwerk', 'Moglix', 'Livspace', 'Urban Company', 'NoBroker', 'CarDekho',
    'Droom', 'Turtlemint', 'ClearTax', 'KhataBook', 'OkCredit', 'Open Financial', 'Niyo',
    'Jupiter', 'Fi Money', 'MobiKwik', 'BillDesk', 'CCAVenue', 'Instamojo', 'GupShup',
    'Amagi', 'HighRadius', 'Icertis', 'Druva', 'Zenoti', 'Fractal', 'Mu Sigma', 'LatentView',
    'Tredence', 'GreyOrange', 'Unbxd', 'Capillary', 'Sokrati', 'CleverTap', 'MoEngage',
    'WebEngage', 'Mad Street Den', 'Yellow.ai', 'Haptik', 'TCS', 'Infosys', 'Wipro',
    'HCL', 'Tech Mahindra', 'LTI', 'Mindtree', 'Mphasis', 'Amazon India', 'Google India',
    'Microsoft India', 'Uber India', 'Atlassian India', 'Stripe India'
  ];

  const possibleSources = ['Naukri', 'Wellfound', 'Cutshort', 'Instahyre', 'IIM Jobs', 'Times Jobs'];
  const standardSeniority = ['Senior', 'Lead', 'Staff', 'Principal', 'Manager', 'Director', 'Head of', 'VP of', 'Platform', 'Backend'];
  const strictSeniority = ['Manager', 'Director', 'Head of', 'VP of', 'VP'];

  // Platforms where the actual hiring manager's name surfaces on the listing
  const postersByPlatform = {
    'Wellfound': [
      { posterName: 'Arjun Mehta',       posterTitle: 'Co-Founder & CTO' },
      { posterName: 'Priya Sharma',      posterTitle: 'Head of Engineering' },
      { posterName: 'Ravi Krishnan',     posterTitle: 'VP Engineering' },
      { posterName: 'Sneha Patel',       posterTitle: 'Founder & CEO' },
      { posterName: 'Karan Malhotra',    posterTitle: 'Director of Product' },
      { posterName: 'Lakshmi Venkatesh', posterTitle: 'CTO' },
      { posterName: 'Rohan Gupta',       posterTitle: 'VP of Product' },
      { posterName: 'Meera Pillai',      posterTitle: 'Co-Founder & VP Engineering' },
    ],
    'Cutshort': [
      { posterName: 'Neha Agarwal',      posterTitle: 'VP of Engineering' },
      { posterName: 'Rahul Joshi',       posterTitle: 'Head of Product' },
      { posterName: 'Kavitha Suresh',    posterTitle: 'Engineering Manager' },
      { posterName: 'Deepak Nair',       posterTitle: 'Director of Technology' },
      { posterName: 'Siddharth Rao',     posterTitle: 'Head of Technology' },
      { posterName: 'Ankita Doshi',      posterTitle: 'Director of Product' },
    ],
    'Instahyre': [
      { posterName: 'Vivek Pandey',      posterTitle: 'Head of Infrastructure' },
      { posterName: 'Suresh Natarajan',  posterTitle: 'VP Engineering' },
      { posterName: 'Divya Menon',       posterTitle: 'VP Product' },
      { posterName: 'Tarun Bose',        posterTitle: 'Head of Mobile Engineering' },
    ],
  };

  const generated = [];
  const activeSeniority = strictHiringManager ? strictSeniority : standardSeniority;

  for (let i = 0; i < realCompanies.length; i++) {
    const companyName = realCompanies[i];
    const titlePrefix = activeSeniority[i % activeSeniority.length];

    const rand = Math.random();
    let numSources = 1;
    if (rand > 0.9) numSources = 4;
    else if (rand > 0.75) numSources = 3;
    else if (rand > 0.5) numSources = 2;

    const assignedSources = [];
    const available = [...possibleSources];
    for (let s = 0; s < numSources; s++) {
      const idx = Math.floor(Math.random() * available.length);
      assignedSources.push(available[idx]);
      available.splice(idx, 1);
    }

    generated.push({
      company: companyName,
      title: `${titlePrefix} ${role}`,
      daysPosted: (i % 45) + 1,
      sources: assignedSources
    });
  }

  // Simulate raw scrape: one row per platform occurrence, with slight daysPosted variation
  const rawScrapeSimulated = [];
  generated.forEach(item => {
    item.sources.forEach(src => {
      const posterPool = postersByPlatform[src];
      const poster = posterPool
        ? posterPool[Math.floor(Math.random() * posterPool.length)]
        : { posterName: null, posterTitle: null };

      rawScrapeSimulated.push({
        company: item.company,
        title: item.title,
        daysPosted: item.daysPosted + Math.floor(Math.random() * 5),
        posterName: poster.posterName,
        posterTitle: poster.posterTitle,
        source: src
      });
    });
  });

  return rawScrapeSimulated;
};

// ─── Mock lead generator for testing ─────────────────────────────────────────
// Produces complete, upsert-ready lead objects with no API calls.
// Each call shuffles a large pool so new name+company pairs are added to DB.

const MOCK_COMPANIES = [
  'Flipkart','Swiggy','Zomato','Razorpay','CRED','Meesho','Zepto','Zerodha',
  'Dream11','Upstox','ShareChat','Freshworks','Zoho','Chargebee','Hasura',
  'Unacademy','Spinny','Cars24','Lenskart','Nykaa','PharmEasy','Groww',
  'BharatPe','Digit Insurance','Acko','PolicyBazaar','Delhivery','Dunzo',
  'Zetwerk','Moglix','Livspace','Urban Company','NoBroker','KhataBook',
  'Jupiter','Fi Money','MobiKwik','GupShup','Amagi','HighRadius','Icertis',
  'Druva','Zenoti','CleverTap','MoEngage','WebEngage','Yellow.ai','Haptik',
  'Postman','BrowserStack','Paytm','Ola','OYO','Udaan','Blinkit','Shadowfax',
  'Rivigo','BlackBuck','ElasticRun','DealShare','OfBusiness','Infra.Market',
  'Turtlemint','ClearTax','OkCredit','Open Financial','Niyo','Instamojo',
  'GreyOrange','Unbxd','Capillary','Sokrati','Mad Street Den','Innovaccer',
  'Darwinbox','LatentView','Tredence','Mu Sigma','Fractal','Pine Labs',
  'Eruditus','Upgrad','Vedantu','PurpleTalk','Ninjacart','Ninjavan',
  'WayCool','DeHaat','AgroStar','Bijak','Arya.ag','Cropin','Fasal',
  'Stellapps','Intello Labs','CropIn','Pixxel','Skyroot','Agnikul',
  'Bellatrix','GalaxEye','Dhruva Space','SatSure','Detect Technologies',
  'Auzmor','Advantage Club','HROne','Zimyo','Keka','sumHR','Darwinbox',
  'greytHR','HRMantra','Beehive','Kredily','PeopleStrong','ZingHR',
  'Qandle','factoHR','Empxtrack','Akrivia','Pocket HRMS','HRTailor',
  'Synergita','AssessHub','Mercer|Mettl','iMocha','HackerEarth','HackerRank',
  'Codility','TestGorilla','Vervoe','Xobin','Evalground','InterviewBit',
  'Scaler','Newton School','Masai School','Crio.Do','Coding Ninjas',
  'GUVI','Internshala','Unstop','Dare2Compete','Learnbay','Simplilearn',
  'upGrad Enterprise','Great Learning','Emeritus','Coursera India',
  'Udemy India','Skillsoft','Pluralsight India','LinkedIn Learning India',
];

const MOCK_MANAGERS = [
  { name:'Arjun Mehta',       title:'VP Engineering' },
  { name:'Priya Sharma',      title:'Head of Engineering' },
  { name:'Rahul Joshi',       title:'Director of Engineering' },
  { name:'Sneha Patel',       title:'Engineering Manager' },
  { name:'Vikram Nair',       title:'CTO' },
  { name:'Ananya Krishnan',   title:'Head of Product' },
  { name:'Rohan Gupta',       title:'VP of Product' },
  { name:'Deepika Agarwal',   title:'Director of Product' },
  { name:'Karan Malhotra',    title:'Co-Founder & CTO' },
  { name:'Neha Reddy',        title:'VP Engineering' },
  { name:'Siddharth Rao',     title:'Head of Technology' },
  { name:'Pooja Iyer',        title:'Engineering Director' },
  { name:'Aditya Bansal',     title:'Staff Engineering Manager' },
  { name:'Kavitha Suresh',    title:'Head of Engineering' },
  { name:'Nikhil Verma',      title:'VP of Engineering' },
  { name:'Shruti Desai',      title:'Director of Technology' },
  { name:'Amit Saxena',       title:'Principal Engineering Manager' },
  { name:'Ritu Bhatia',       title:'Head of Product & Engineering' },
  { name:'Gaurav Mishra',     title:'Engineering Lead' },
  { name:'Divya Menon',       title:'VP Product' },
  { name:'Kunal Kapoor',      title:'Director of Engineering' },
  { name:'Meera Pillai',      title:'Co-Founder & VP Engineering' },
  { name:'Varun Choudhary',   title:'Head of Backend Engineering' },
  { name:'Tanya Singh',       title:'Engineering Manager' },
  { name:'Rajat Khanna',      title:'VP of Technology' },
  { name:'Ishita Ghosh',      title:'Director of Product Management' },
  { name:'Sandeep Kumar',     title:'Head of Platform Engineering' },
  { name:'Nandita Rao',       title:'VP Engineering' },
  { name:'Prateek Jain',      title:'Senior Director of Engineering' },
  { name:'Lakshmi Venkatesh', title:'CTO & Co-Founder' },
  { name:'Abhishek Tiwari',   title:'Director of Engineering' },
  { name:'Sunita Murthy',     title:'Head of Talent & Engineering' },
  { name:'Mohit Aggarwal',    title:'VP of Product Engineering' },
  { name:'Shalini Bajaj',     title:'Senior Engineering Manager' },
  { name:'Vivek Pandey',      title:'Head of Infrastructure' },
  { name:'Ankita Doshi',      title:'Director of Product' },
  { name:'Suresh Natarajan',  title:'VP Engineering' },
  { name:'Aarti Chandra',     title:'Engineering Manager' },
  { name:'Tarun Bose',        title:'Head of Mobile Engineering' },
  { name:'Preeti Mathur',     title:'Director of Engineering' },
  { name:'Kartik Jain',       title:'Head of Growth' },
  { name:'Ravi Krishnan',     title:'Head of Marketing' },
  { name:'Swati Deshpande',   title:'VP Marketing' },
  { name:'Manoj Bhatt',       title:'Director of Marketing' },
  { name:'Richa Gupta',       title:'Head of Performance Marketing' },
  { name:'Sameer Bose',       title:'CMO' },
  { name:'Taruna Ahuja',      title:'VP Growth' },
  { name:'Neel Shah',         title:'Director of Product Growth' },
];

const SOURCES_POOL = ['Naukri','Wellfound','Cutshort','Instahyre','IIM Jobs','Times Jobs'];
const CITIES_POOL  = ['Bangalore','Mumbai','Delhi','Pune','Hyderabad','Chennai'];
const FN_TITLES = {
  Engineering: ['VP Engineering','Head of Engineering','Director of Engineering','Engineering Manager','CTO','Staff Engineering Manager'],
  Product:     ['VP of Product','Head of Product','Director of Product','Product Manager','CPO'],
  Marketing:   ['VP Marketing','Head of Marketing','Director of Marketing','CMO','Head of Growth'],
};

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const generateMockLeads = (role = 'Engineering', city = 'Bangalore', count = 30) => {
  const resolvedRole = (role && role !== 'all') ? role : 'Engineering';
  const resolvedCity = (city && city !== 'all') ? city : null; // null = vary per lead
  const titles = FN_TITLES[resolvedRole] || FN_TITLES.Engineering;

  // Unique batch tag so every run produces NEW name::company keys in Supabase
  // Uses last 5 digits of timestamp — changes every ms, guarantees uniqueness
  const batchTag = String(Date.now()).slice(-5);

  const companies = shuffle(MOCK_COMPANIES);
  const managers  = shuffle(MOCK_MANAGERS);

  const leads = [];
  for (let i = 0; i < Math.min(count, companies.length); i++) {
    const manager   = managers[i % managers.length];
    const company   = `${companies[i]} [${batchTag}]`; // unique per run
    const numSources = 1 + Math.floor(Math.random() * 3);
    const sources   = shuffle(SOURCES_POOL).slice(0, numSources);
    const daysPosted = Math.floor(Math.random() * 30) + 1;
    const activityScore = daysPosted <= 7  ? Math.floor(Math.random() * 3) + 7
                        : daysPosted <= 20 ? Math.floor(Math.random() * 3) + 4
                        :                   Math.floor(Math.random() * 3) + 1;
    const leadCity = resolvedCity || CITIES_POOL[i % CITIES_POOL.length];

    leads.push({
      name:             manager.name,
      title:            titles[i % titles.length],
      company,
      city:             leadCity,
      function:         resolvedRole,
      email:            `${manager.name.split(' ')[0].toLowerCase()}@${company.replace(/[\s\[\]]/g,'').toLowerCase()}.com`,
      linkedin_url:     `https://www.linkedin.com/in/${manager.name.toLowerCase().replace(/\s+/g,'-')}`,
      days_posted:      daysPosted,
      activity_score:   activityScore,
      source_platforms: sources,
      pipeline_stage:   'Found',
      status:           'Found',
      is_blacklisted:   false,
    });
  }
  return leads;
};

module.exports = { scrapeAllPlatforms, generateMockLeads };
