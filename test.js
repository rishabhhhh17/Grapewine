require('dotenv').config({ path: './server/.env' });
const { scrapeNaukriJobs } = require('./server/services/scraperService');
const { findHiringManager } = require('./server/services/linkedinService');

async function run() {
    console.log("Testing Firecrawl...");
    // Overriding the fallback temporary just to see what firecrawl actually returns
    const jobs = await scrapeNaukriJobs("Engineering", "Bangalore");
    console.log("Jobs retrieved:", JSON.stringify(jobs, null, 2));

    if (jobs && jobs.length > 0) {
        const testJob = jobs[0]; // test first
        console.log(`Testing Apify on company: ${testJob.company}, title: ${testJob.title}`);
        const manager = await findHiringManager(testJob.company, testJob.title);
        console.log("Manager retrieved:", manager);
    }
}
run();
