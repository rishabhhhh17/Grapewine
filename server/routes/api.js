const express = require('express');
const router = express.Router();
const { scrapeAllPlatforms } = require('../services/scraperService');
const { findHiringManagersBulk } = require('../services/linkedinService');
const { calculateActivityScore } = require('../services/scoringService');
const { sendOutreachEmail } = require('../services/emailService');
const { supabase, isMock } = require('../services/supabaseService');

// In-memory mock DB if Supabase is not available
let mockLeads = [];

// POST /api/search
// Triggers scraping, matching, scoring, and saving to Supabase
// Returns scraped and matched leads
router.post('/search', async (req, res) => {
  const { function: jobFunction, city, strictHiringManager } = req.body;
  
  if (!jobFunction || !city) {
    return res.status(400).json({ error: 'Function and City are required' });
  }

  try {
    // 1. Scrape jobs from all 6 platforms in parallel
    const rawJobs = await scrapeAllPlatforms(jobFunction, city, strictHiringManager);
    
    // 2. Deduplication Engine: Merge clones by Company + Title
    const map = new Map();
    rawJobs.forEach(job => {
      const key = `${job.company}-${job.title}`;
      if (!map.has(key)) {
        map.set(key, { ...job, sources: [job.source] });
      } else {
        const existing = map.get(key);
        if (!existing.sources.includes(job.source)) {
          existing.sources.push(job.source);
        }
        if (job.daysPosted < existing.daysPosted) {
          existing.daysPosted = job.daysPosted;
        }
      }
    });
    const dedupedJobs = Array.from(map.values());
    
    // 3. Find hiring managers & calculate scores in BULK
    const companiesList = dedupedJobs.map(j => j.company);
    const managers = await findHiringManagersBulk(companiesList, jobFunction, strictHiringManager);
    
    let leads = dedupedJobs.map((job, index) => {
      const manager = managers[index];
      const score = calculateActivityScore(job.daysPosted, job.sources.length);
      
      return {
        name: manager.name,
        title: job.title,
        company: job.company,
        city: city,
        days_posted: job.daysPosted,
        activity_score: score,
        linkedin_url: manager.linkedinUrl,
        function: jobFunction,
        status: 'Found',
        sources: job.sources,
        email: `contact@${job.company.replace(/\s+/g, '').toLowerCase()}.com`
      };
    });

    // Strip out ANY leads where we couldn't confidently identify a real human
    if (strictHiringManager) {
      leads = leads.filter(l => l.name !== 'Unknown' && !l.name.toLowerCase().includes('mock user'));
    }

    // Sort by score descending
    leads.sort((a, b) => b.activity_score - a.activity_score);

    // 3. Save to database
    if (isMock) {
      mockLeads = [...mockLeads, ...leads.map((l, i) => ({ ...l, id: Date.now() + i }))];
      return res.json({ leads: mockLeads.filter(l => l.status === 'Found') });
    } else {
      const { data, error } = await supabase
        .from('leads')
        .insert(leads)
        .select();
        
      if (error) {
        console.error('Supabase Error:', error);
        // Supabase RLS blocked insert, but we successfully scraped it.
        // Let's ensure the user sees the leads anyway by returning them from memory.
        return res.json({ leads: leads });
      }
      return res.json({ leads: data });
    }

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'An error occurred during search' });
  }
});

// GET /api/leads
router.get('/leads', async (req, res) => {
  if (isMock) {
    return res.json({ leads: mockLeads });
  } else {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .order('activity_score', { ascending: false });
      
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ leads: data || [] });
  }
});

// POST /api/send-email
router.post('/send-email', async (req, res) => {
  const { leadId, leadEmail, name, company, jobFunction, city } = req.body;
  
  if (!leadId) {
    return res.status(400).json({ error: 'leadId is required' });
  }

  try {
    const result = await sendOutreachEmail(leadEmail, name, company, jobFunction, city);
    
    if (result.success) {
      // Update status to 'Email Sent'
      if (isMock) {
        const lead = mockLeads.find(l => l.id === leadId);
        if (lead) lead.status = 'Email Sent';
      } else {
        await supabase
          .from('leads')
          .update({ status: 'Email Sent' })
          .eq('id', leadId);
      }
      return res.json({ success: true });
    } else {
      return res.status(500).json({ error: 'Email failed to send', details: result.error });
    }
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// PUT /api/leads/:id
router.put('/leads/:id', async (req, res) => {
  const leadId = req.params.id;
  const { status } = req.body;
  
  if (isMock) {
    const lead = mockLeads.find(l => String(l.id) === String(leadId));
    if (lead) lead.status = status;
    return res.json({ success: true, lead });
  } else {
    const { data, error } = await supabase
      .from('leads')
      .update({ status })
      .eq('id', leadId)
      .select();
      
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, lead: data[0] });
  }
});

module.exports = router;
