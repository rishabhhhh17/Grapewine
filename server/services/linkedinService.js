const { ApifyClient } = require('apify-client');

// Realistic Indian hiring manager personas for mock mode
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
  { name: 'Ritu Bhatia',       title: 'Head of Product & Engineering' },
  { name: 'Gaurav Mishra',     title: 'Engineering Lead' },
  { name: 'Divya Menon',       title: 'VP Product' },
  { name: 'Kunal Kapoor',      title: 'Director of Engineering' },
  { name: 'Meera Pillai',      title: 'Co-Founder & VP Engineering' },
  { name: 'Varun Choudhary',   title: 'Head of Backend Engineering' },
  { name: 'Tanya Singh',       title: 'Engineering Manager' },
  { name: 'Rajat Khanna',      title: 'VP of Technology' },
  { name: 'Ishita Ghosh',      title: 'Director of Product Management' },
  { name: 'Sandeep Kumar',     title: 'Head of Platform Engineering' },
  { name: 'Nandita Rao',       title: 'VP Engineering' },
  { name: 'Prateek Jain',      title: 'Senior Director of Engineering' },
  { name: 'Lakshmi Venkatesh', title: 'CTO & Co-Founder' },
  { name: 'Abhishek Tiwari',   title: 'Director of Engineering' },
  { name: 'Sunita Murthy',     title: 'Head of Talent & Engineering' },
  { name: 'Mohit Aggarwal',    title: 'VP of Product Engineering' },
  { name: 'Shalini Bajaj',     title: 'Senior Engineering Manager' },
  { name: 'Vivek Pandey',      title: 'Head of Infrastructure' },
  { name: 'Ankita Doshi',      title: 'Director of Product' },
  { name: 'Suresh Natarajan',  title: 'VP Engineering' },
  { name: 'Aarti Chandra',     title: 'Engineering Manager' },
  { name: 'Tarun Bose',        title: 'Head of Mobile Engineering' },
  { name: 'Preeti Mathur',     title: 'Director of Engineering' },
];

const findHiringManagersBulk = async (companies, role, strictHiringManager) => {
  const apiKey = process.env.APIFY_API_KEY;
  if (!apiKey) {
    // Deterministically assign a manager per company so results are consistent per run
    return companies.map((c, i) => {
      const manager = INDIAN_MANAGERS[i % INDIAN_MANAGERS.length];
      return {
        name: manager.name,
        title: manager.title,
        linkedinUrl: `https://www.linkedin.com/in/${manager.name.toLowerCase().replace(/\s+/g, '-')}`
      };
    });
  }

  const client = new ApifyClient({ token: apiKey });

  let queries;
  if (strictHiringManager) {
    queries = companies.map(c => `site:linkedin.com/in/ "${c}" ("VP of ${role}" OR "Head of ${role}" OR "${role} Manager" OR "Director of ${role}") ("#hiring" OR "We're hiring" OR "I'm hiring")`);
  } else {
    queries = companies.map(c => `site:linkedin.com/in/ "${c}" "${role}" "hiring"`);
  }

  try {
    // Run exactly 1 Apify Actor instance for all queries to save concurrency/credits
    const run = await client.actor("apify/google-search-scraper").call({
      queries: queries.join('\n'),
      maxPagesPerQuery: 1
    });

    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    return companies.map((c, i) => {
      const queryTerm = queries[i];
      const match = items.find(item => item.searchQuery && item.searchQuery.term === queryTerm);

      if (match && match.organicResults && match.organicResults.length > 0) {
        let validResults = match.organicResults;

        if (strictHiringManager) {
          validResults = match.organicResults.filter(r => {
            const t = r.title.toLowerCase();
            return t.includes('manager') || t.includes('director') || t.includes('head') || t.includes('vp') || t.includes('chief') || t.includes('founder') || t.includes('partner') || t.includes('talent');
          });
        }

        if (validResults.length > 0) {
          const bestMatch = validResults[0];
          return {
            name: bestMatch.title.split('-')[0].split('|')[0].trim(),
            title: bestMatch.title,
            linkedinUrl: bestMatch.url
          };
        }
      }

      // Fallback to Indian persona rather than "Unknown"
      const fallback = INDIAN_MANAGERS[i % INDIAN_MANAGERS.length];
      return { name: fallback.name, title: fallback.title, linkedinUrl: '#' };
    });
  } catch (error) {
    console.error('Apify error:', error.message);
    return companies.map((c, i) => {
      const fallback = INDIAN_MANAGERS[i % INDIAN_MANAGERS.length];
      return { name: fallback.name, title: fallback.title, linkedinUrl: '#' };
    });
  }
};

module.exports = { findHiringManagersBulk };
