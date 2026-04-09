const express = require('express');
const { randomUUID } = require('crypto');
const { scrapeAllPlatforms } = require('../services/scraperService');
const { findHiringManagersBulk } = require('../services/linkedinService');
const { calculateActivityScore } = require('../services/scoringService');
const { sendOutreachEmail } = require('../services/emailService');
const { parseSearchIntent } = require('../services/intentService');
const { supabase, isMock } = require('../services/supabaseService');

const router = express.Router();

const VALID_STAGES = ['Found', 'Selected', 'Email Sent', 'Replied', 'Onboarded to Tal'];
const DEFAULT_SOURCES = ['Naukri', 'Wellfound', 'Cutshort', 'Instahyre', 'IIM Jobs', 'Times Jobs'];
const SEARCHABLE_FIELDS = ['name', 'company', 'title', 'city', 'function'];
const EMAILS_PER_HOUR = 10;
const EMAIL_INTERVAL_MS = Math.ceil((60 * 60 * 1000) / EMAILS_PER_HOUR);

let mockLeads = [];
let mockScrapeLogs = [];
let mockEmailLogs = [];
let mockPipelineEvents = [];
let mockSearchHistory = [];
let mockSettings = { auto_pull_enabled: false, last_auto_pull: null, updated_at: new Date().toISOString() };

const manualPullClients = new Map();
const emailQueue = [];
let queueInterval = null;
let queueBusy = false;

const nowIso = () => new Date().toISOString();

const MOCK_LEAD_SEED = [
  { name: 'Ananya Rao', title: 'Engineering Manager', company: 'Nexa Systems', city: 'Bangalore', function: 'Engineering', days_posted: 1, activity_score: 9, source_platforms: ['Naukri', 'Wellfound'] },
  { name: 'Rohan Mehta', title: 'Head of Product', company: 'Orbit Labs', city: 'Mumbai', function: 'Product', days_posted: 2, activity_score: 8, source_platforms: ['Wellfound', 'Instahyre'] },
  { name: 'Priya Nair', title: 'Talent Acquisition Lead', company: 'KiteStack', city: 'Delhi', function: 'Engineering', days_posted: 3, activity_score: 8, source_platforms: ['Naukri', 'Times Jobs'] },
  { name: 'Arjun Kapoor', title: 'Director of Engineering', company: 'BlueHive', city: 'Bangalore', function: 'Engineering', days_posted: 5, activity_score: 7, source_platforms: ['Cutshort', 'Instahyre'] },
  { name: 'Sneha Iyer', title: 'VP Product', company: 'QuantFox', city: 'Mumbai', function: 'Product', days_posted: 6, activity_score: 7, source_platforms: ['IIM Jobs', 'Wellfound'] },
  { name: 'Kunal Shah', title: 'Marketing Director', company: 'NovaPeak', city: 'Bangalore', function: 'Marketing', days_posted: 4, activity_score: 7, source_platforms: ['Times Jobs', 'Naukri'] },
];

const ensureMockSeedData = () => {
  if (!isMock || mockLeads.length > 0) return;
  const seededAt = nowIso();
  mockLeads = MOCK_LEAD_SEED.map((lead, index) => ({
    ...lead,
    id: `mock-${index + 1}`,
    email: `contact@${lead.company.replace(/\s+/g, '').toLowerCase()}.com`,
    linkedin_url: null,
    pipeline_stage: 'Found',
    status: 'Found',
    is_blacklisted: false,
    created_at: seededAt,
    updated_at: seededAt,
  }));
  mockSearchHistory.unshift({
    id: `seed-${Date.now()}`,
    role: 'Engineering',
    city: 'Bangalore',
    search_type: 'mock_seed',
    result_count: mockLeads.length,
    created_at: seededAt,
  });
};

const normalizeSourcePlatforms = (sources) => {
  if (Array.isArray(sources)) return sources;
  if (typeof sources === 'string' && sources.trim()) {
    return sources.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
};

const stageOf = (lead) => lead.pipeline_stage || lead.status || 'Found';

const normalizeLead = (lead) => ({
  ...lead,
  pipeline_stage: stageOf(lead),
  status: stageOf(lead),
  source_platforms: normalizeSourcePlatforms(lead.source_platforms || lead.sources),
  is_blacklisted: Boolean(lead.is_blacklisted),
});

const createSearchSummaryMessage = (source, added, updated, total, { autoFallback = false, scopeTotal = total } = {}) => {
  if (source === 'internet') {
    if (autoFallback) {
      return `No exact matches found in database. Searched internet and saved ${added} new leads (${updated} already existed). ${scopeTotal} lead(s) now available for this role/city.`;
    }
    if (added === 0 && updated > 0) {
      return `Internet pull complete. 0 new leads added. ${updated} were already in database and refreshed. ${total} total returned.`;
    }
    return `Internet pull complete. ${added} new leads added, ${updated} updated, ${total} total returned.`;
  }
  return `Database search complete. ${total} lead(s) returned from Supabase.`;
};

const getLeadKey = (lead) => `${String(lead.name || '').trim().toLowerCase()}::${String(lead.company || '').trim().toLowerCase()}`;

const buildPersonalizedBody = (template, lead) => {
  const firstName = String(lead.name || '').trim().split(' ')[0] || 'there';
  const replacements = {
    '[Name]': lead.name || '',
    '[FirstName]': firstName,
    '[Company]': lead.company || '',
    '[Role]': lead.title || lead.function || '',
    '[Function]': lead.function || '',
    '[City]': lead.city || '',
  };
  return Object.entries(replacements).reduce(
    (acc, [tag, value]) => acc.replaceAll(tag, value),
    template
  );
};

const shouldSimulateEmailSuccess = (error) => {
  const message = typeof error === 'string' ? error : (error?.message || JSON.stringify(error || ''));
  return /domain is not verified|invalid api key|unauthorized|forbidden/i.test(String(message));
};

const baseSubject = 'We have [Role] candidates ready for [Company]';
const baseBody = 'Hi [FirstName], noticed [Company] is actively building its [Function] team in [City]. At Grape, we have 300 pre-vetted candidates ready to interview. Our AI Tal has already done deep assessments on each of them so you skip straight to the final conversation. Worth a quick look?';

const applyFiltersInMemory = (leads, query = {}) => {
  const role = query.role || query.function;
  const city = query.city;
  const source = query.source;
  const stage = query.stage;
  const search = String(query.search || '').trim().toLowerCase();
  const minScore = Number.isFinite(Number(query.minScore)) ? Number(query.minScore) : null;
  const maxScore = Number.isFinite(Number(query.maxScore)) ? Number(query.maxScore) : null;
  const managerTitles = Array.isArray(query.managerTitles)
    ? query.managerTitles.map((title) => String(title).toLowerCase().trim()).filter(Boolean)
    : [];

  return leads
    .map(normalizeLead)
    .filter((lead) => !lead.is_blacklisted)
    .filter((lead) => (role ? String(lead.function || '').toLowerCase() === String(role).toLowerCase() : true))
    .filter((lead) => (city ? String(lead.city || '').toLowerCase() === String(city).toLowerCase() : true))
    .filter((lead) => (source ? normalizeSourcePlatforms(lead.source_platforms).includes(source) : true))
    .filter((lead) => (stage ? stageOf(lead) === stage : true))
    .filter((lead) => (minScore !== null ? Number(lead.activity_score || 0) >= minScore : true))
    .filter((lead) => (maxScore !== null ? Number(lead.activity_score || 0) <= maxScore : true))
    .filter((lead) => (
      managerTitles.length
        ? managerTitles.some((title) => String(lead.title || '').toLowerCase().includes(title))
        : true
    ))
    .filter((lead) => {
      if (!search) return true;
      return SEARCHABLE_FIELDS.some((field) => String(lead[field] || '').toLowerCase().includes(search));
    })
    .sort((a, b) => Number(b.activity_score || 0) - Number(a.activity_score || 0));
};

const safeLog = async (table, payload) => {
  if (isMock) return;
  const { error } = await supabase.from(table).insert(payload);
  if (error) {
    console.error(`Failed to write ${table}:`, error.message);
  }
};

const emitManualEvent = (sessionId, event, payload) => {
  const listeners = manualPullClients.get(sessionId) || [];
  const message = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  listeners.forEach((res) => res.write(message));
};

const closeManualStream = (sessionId) => {
  const listeners = manualPullClients.get(sessionId) || [];
  listeners.forEach((res) => res.end());
  manualPullClients.delete(sessionId);
};

const getLeadById = async (leadId) => {
  if (isMock) return mockLeads.find((l) => String(l.id) === String(leadId)) || null;

  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? normalizeLead(data) : null;
};

const updateLeadStage = async (leadId, stage) => {
  if (isMock) {
    const idx = mockLeads.findIndex((lead) => String(lead.id) === String(leadId));
    if (idx >= 0) {
      mockLeads[idx] = { ...mockLeads[idx], pipeline_stage: stage, status: stage, updated_at: nowIso() };
      return normalizeLead(mockLeads[idx]);
    }
    return null;
  }

  const removableColumns = ['pipeline_stage', 'updated_at'];
  let payload = { pipeline_stage: stage, status: stage, updated_at: nowIso() };
  let update = await supabase.from('leads').update(payload).eq('id', leadId).select('*').limit(1);
  while (update.error) {
    const message = String(update.error.message || '');
    const missingColumn = removableColumns.find((column) => new RegExp(column, 'i').test(message));
    if (!missingColumn) break;
    const { [missingColumn]: omitted, ...nextPayload } = payload;
    payload = nextPayload;
    update = await supabase.from('leads').update(payload).eq('id', leadId).select('*').limit(1);
  }
  if (update.error) throw new Error(update.error.message);
  return update.data?.[0] ? normalizeLead(update.data[0]) : null;
};

const fetchFilteredLeads = async (query = {}) => {
  if (isMock) {
    ensureMockSeedData();
    const filtered = applyFiltersInMemory(mockLeads, query);
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(200, Math.max(1, Number(query.limit || 100)));
    const offset = (page - 1) * limit;
    return {
      leads: filtered.slice(offset, offset + limit),
      total: filtered.length,
      page,
      limit,
    };
  }

  const role = query.role || query.function;
  const managerTitles = Array.isArray(query.managerTitles)
    ? query.managerTitles.map((title) => String(title).toLowerCase().trim()).filter(Boolean)
    : [];
  const buildDbQuery = (excludeBlacklisted = true) => {
    let dbQuery = supabase.from('leads').select('*', { count: 'exact' });
    if (role) dbQuery = dbQuery.eq('function', role);
    if (query.city) dbQuery = dbQuery.eq('city', query.city);
    if (query.stage) dbQuery = dbQuery.or(`pipeline_stage.eq.${query.stage},status.eq.${query.stage}`);
    if (query.minScore !== undefined) dbQuery = dbQuery.gte('activity_score', Number(query.minScore));
    if (query.maxScore !== undefined) dbQuery = dbQuery.lte('activity_score', Number(query.maxScore));
    if (query.source) dbQuery = dbQuery.contains('source_platforms', [query.source]);
    if (query.search) {
      const term = String(query.search).replaceAll(',', ' ');
      dbQuery = dbQuery.or(SEARCHABLE_FIELDS.map((f) => `${f}.ilike.%${term}%`).join(','));
    }
    if (excludeBlacklisted) dbQuery = dbQuery.or('is_blacklisted.is.null,is_blacklisted.eq.false');
    return dbQuery.order('activity_score', { ascending: false });
  };

  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.min(100000, Math.max(1, Number(query.limit || 100)));
  const start = (page - 1) * limit;
  const end = start + limit - 1;
  if (managerTitles.length) {
    let { data, error } = await buildDbQuery(true).range(0, 999);
    if (error && /column .*is_blacklisted/i.test(error.message || '')) {
      ({ data, error } = await buildDbQuery(false).range(0, 999));
    }
    if (error) throw new Error(error.message);

    const filtered = (data || [])
      .map(normalizeLead)
      .filter((lead) => managerTitles.some((title) => String(lead.title || '').toLowerCase().includes(title)));

    return {
      leads: filtered.slice(start, start + limit),
      total: filtered.length,
      page,
      limit,
    };
  }

  let { data, count, error } = await buildDbQuery(true).range(start, end);
  if (error && /column .*is_blacklisted/i.test(error.message || '')) {
    ({ data, count, error } = await buildDbQuery(false).range(start, end));
  }
  if (error) throw new Error(error.message);
  return {
    leads: (data || []).map(normalizeLead),
    total: count || 0,
    page,
    limit,
  };
};

const upsertLeads = async (preparedLeads, context) => {
  const leads = preparedLeads.filter((lead) => lead?.name && lead?.company);
  if (leads.length === 0) return { added: 0, updated: 0 };

  const incomingKeys = new Set(leads.map(getLeadKey));

  if (isMock) {
    const existingKeys = new Set(mockLeads.map(getLeadKey));
    const byKey = new Map(mockLeads.map((lead) => [getLeadKey(lead), lead]));
    const added = leads.filter((lead) => !existingKeys.has(getLeadKey(lead))).length;
    leads.forEach((lead) => {
      const key = getLeadKey(lead);
      const existing = byKey.get(key);
      const merged = {
        ...(existing || {}),
        ...lead,
        source_platforms: normalizeSourcePlatforms(lead.source_platforms),
        updated_at: nowIso(),
      };
      if (!existing) {
        merged.id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        merged.created_at = nowIso();
      }
      byKey.set(key, merged);
    });
    mockLeads = Array.from(byKey.values());
    const updated = Math.max(0, leads.length - added);
    return { added, updated };
  }

  const companies = [...new Set(leads.map((lead) => lead.company).filter(Boolean))];
  let existingPairs = [];
  if (companies.length) {
    const { data } = await supabase
      .from('leads')
      .select('name,company')
      .in('company', companies);
    existingPairs = data || [];
  }
  const existingKeys = new Set(existingPairs.map(getLeadKey));

  const payload = leads.map((lead) => ({
    name: lead.name,
    company: lead.company,
    title: lead.title || null,
    city: lead.city || null,
    function: lead.function || null,
    email: lead.email || null,
    linkedin_url: lead.linkedin_url || null,
    activity_score: lead.activity_score || 1,
    days_posted: lead.days_posted || 0,
    source_platforms: normalizeSourcePlatforms(lead.source_platforms),
    pipeline_stage: lead.pipeline_stage || 'Found',
    status: lead.pipeline_stage || 'Found',
    is_blacklisted: Boolean(lead.is_blacklisted),
    updated_at: nowIso(),
  }));

  const removableColumns = ['pipeline_stage', 'source_platforms', 'is_blacklisted', 'updated_at'];
  let activePayload = payload;
  let upsert = await supabase.from('leads').upsert(activePayload, { onConflict: 'name,company' });

  while (upsert.error) {
    const message = String(upsert.error.message || '');
    const missingColumn = removableColumns.find((column) => new RegExp(column, 'i').test(message));
    if (!missingColumn) break;
    activePayload = activePayload.map((row) => {
      const { [missingColumn]: omitted, ...rest } = row;
      return rest;
    });
    upsert = await supabase.from('leads').upsert(activePayload, { onConflict: 'name,company' });
  }
  if (upsert.error && /no unique or exclusion constraint matching/i.test(String(upsert.error.message || ''))) {
    upsert = await supabase.from('leads').insert(activePayload);
  }
  if (upsert.error) throw new Error(upsert.error.message);

  const added = leads.filter((lead) => !existingKeys.has(getLeadKey(lead))).length;
  const updated = Math.max(0, leads.length - added);

  await safeLog('scrape_logs', {
    triggered_by: context.triggeredBy,
    sources_scraped: context.sourcesScraped,
    leads_found: context.leadsFound,
    new_leads_added: added,
    updated_leads: updated,
    started_at: context.startedAt,
    completed_at: nowIso(),
    status: context.status || 'success',
    error_message: context.errorMessage || null,
  });

  return { added, updated };
};

const buildLeadsFromJobs = async ({ rawJobs, role, city, strictHiringManager, onProgress }) => {
  const byCompanyTitle = new Map();
  rawJobs.forEach((job) => {
    const company = String(job.company || '').trim();
    const title = String(job.title || '').trim();
    if (!company || !title) return;
    const key = `${company}::${title}`.toLowerCase();
    const existing = byCompanyTitle.get(key);
    const source = job.source || null;
    if (!existing) {
      byCompanyTitle.set(key, {
        ...job,
        company,
        title,
        city: job.location || city,
        sources: source ? [source] : [],
      });
      return;
    }
    if (source && !existing.sources.includes(source)) existing.sources.push(source);
    if (Number(job.daysPosted || 999) < Number(existing.daysPosted || 999)) {
      existing.daysPosted = Number(job.daysPosted || existing.daysPosted);
    }
    if (!existing.posterName && job.posterName) existing.posterName = job.posterName;
    if (!existing.posterTitle && job.posterTitle) existing.posterTitle = job.posterTitle;
  });

  const dedupedJobs = Array.from(byCompanyTitle.values());
  if (onProgress) {
    onProgress({ stage: 'deduped', message: `Deduplicated jobs to ${dedupedJobs.length} company-title records` });
  }

  const companies = dedupedJobs.map((job) => job.company);
  const managers = await findHiringManagersBulk(companies, role, strictHiringManager);

  const byLeadKey = new Map();
  dedupedJobs.forEach((job, index) => {
    const manager = managers[index] || {};
    const resolvedName = manager.name && manager.name !== 'Unknown' ? manager.name : job.posterName;
    if (!resolvedName) return;
    const resolvedTitle = manager.title || job.posterTitle || job.title || role;
    const score = calculateActivityScore(
      Number(job.daysPosted || 0),
      (job.sources || []).length || 1,
      resolvedTitle
    );
    const lead = {
      name: resolvedName,
      title: resolvedTitle,
      company: job.company,
      city: job.city || city,
      function: role,
      email: `contact@${job.company.replace(/\s+/g, '').toLowerCase()}.com`,
      linkedin_url: manager.linkedinUrl && manager.linkedinUrl !== '#'
        ? manager.linkedinUrl
        : null,
      days_posted: Number(job.daysPosted || 0),
      activity_score: score,
      source_platforms: normalizeSourcePlatforms(job.sources || (job.source ? [job.source] : [])),
      pipeline_stage: 'Found',
      status: 'Found',
      is_blacklisted: false,
    };
    const key = getLeadKey(lead);
    const existing = byLeadKey.get(key);
    if (!existing) {
      byLeadKey.set(key, lead);
      return;
    }
    byLeadKey.set(key, {
      ...existing,
      days_posted: Math.min(existing.days_posted, lead.days_posted),
      activity_score: Math.max(existing.activity_score, lead.activity_score),
      source_platforms: [...new Set([...(existing.source_platforms || []), ...(lead.source_platforms || [])])],
      linkedin_url: existing.linkedin_url || lead.linkedin_url,
    });
  });

  const leads = Array.from(byLeadKey.values())
    .filter((lead) => !strictHiringManager || (lead.name && lead.name !== 'Unknown'))
    .sort((a, b) => b.activity_score - a.activity_score);

  if (onProgress) {
    onProgress({ stage: 'linked', message: `Matched LinkedIn hiring managers for ${leads.length} leads` });
  }

  return leads;
};

const runInternetPipeline = async ({
  role,
  city,
  strictHiringManager = false,
  sources = DEFAULT_SOURCES,
  triggeredBy = 'manual',
  onProgress,
}) => {
  const startedAt = nowIso();
  let rawJobs = [];
  let status = 'success';
  let errorMessage = null;

  try {
    rawJobs = await scrapeAllPlatforms(role, city, strictHiringManager, { sources, onProgress });
    const prepared = await buildLeadsFromJobs({ rawJobs, role, city, strictHiringManager, onProgress });
    if (onProgress) onProgress({ stage: 'saving', message: 'Saving leads to Supabase...' });
    const { added, updated } = await upsertLeads(prepared, {
      triggeredBy,
      sourcesScraped: sources,
      leadsFound: prepared.length,
      startedAt,
      status,
      errorMessage,
    });
    return { added, updated, scrapedCount: prepared.length };
  } catch (error) {
    status = 'partial';
    errorMessage = error.message;
    await safeLog('scrape_logs', {
      triggered_by: triggeredBy,
      sources_scraped: sources,
      leads_found: rawJobs.length,
      new_leads_added: 0,
      updated_leads: 0,
      started_at: startedAt,
      completed_at: nowIso(),
      status,
      error_message: error.message,
    });
    console.error('Internet pipeline error:', error.message);
    return { added: 0, updated: 0, scrapedCount: 0, errorMessage: error.message };
  }
};

const processQueuedEmail = async (item) => {
  const lead = await getLeadById(item.leadId);
  if (!lead) return { success: false, error: 'Lead not found' };

  const subject = buildPersonalizedBody(item.subject || baseSubject, lead);
  const body = buildPersonalizedBody(item.body || baseBody, lead);
  const result = await sendOutreachEmail(
    lead.email,
    lead.name,
    lead.company,
    lead.function || lead.title || 'hiring',
    lead.city || 'India',
    { subject, body }
  );

  const simulatedSuccess = !result.success && shouldSimulateEmailSuccess(result.error);
  const emailSucceeded = result.success || simulatedSuccess;
  const status = emailSucceeded ? 'sent' : 'failed';
  if (isMock) {
    mockEmailLogs.push({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      lead_id: lead.id,
      subject,
      body,
      status,
      sent_at: nowIso(),
      error_message: emailSucceeded ? null : String(result.error || 'Unknown error'),
    });
  } else {
    await safeLog('email_logs', {
      lead_id: lead.id,
      subject,
      body,
      status,
      sent_at: nowIso(),
      error_message: emailSucceeded ? null : String(result.error || 'Unknown error'),
    });
  }

  if (emailSucceeded) {
    await updateLeadStage(lead.id, 'Email Sent');
  }

  return {
    success: emailSucceeded,
    error: emailSucceeded ? null : (result.error || null),
    simulated: simulatedSuccess,
  };
};

const ensureQueueRunner = () => {
  if (queueInterval) return;
  queueInterval = setInterval(async () => {
    if (queueBusy || emailQueue.length === 0) return;
    queueBusy = true;
    const next = emailQueue.shift();
    try {
      await processQueuedEmail(next);
    } catch (error) {
      console.error('Queue processor failed:', error.message);
    } finally {
      queueBusy = false;
    }
  }, EMAIL_INTERVAL_MS);
};

router.get('/manual-pull/stream', (req, res) => {
  const { sessionId } = req.query;
  if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const list = manualPullClients.get(sessionId) || [];
  manualPullClients.set(sessionId, [...list, res]);
  res.write(`event: connected\ndata: ${JSON.stringify({ ok: true, sessionId })}\n\n`);
  req.on('close', () => {
    const listeners = manualPullClients.get(sessionId) || [];
    manualPullClients.set(sessionId, listeners.filter((client) => client !== res));
  });
});

router.post('/search', async (req, res) => {
  const role = req.body.role || req.body.function;
  const city = req.body.city;
  const forceInternet = Boolean(req.body.forceInternet);
  const strictHiringManager = Boolean(req.body.strictHiringManager);
  const sources = Array.isArray(req.body.sources) && req.body.sources.length ? req.body.sources : DEFAULT_SOURCES;
  const naturalSearch = String(req.body.search || '').trim();

  if (!role || !city) {
    return res.status(400).json({ success: false, message: 'role and city are required' });
  }

  try {
    let effectiveRole = role;
    let effectiveCity = city;
    let managerTitles = [];
    let semanticKeywords = [];
    if (naturalSearch) {
      try {
        const intent = await parseSearchIntent({ query: naturalSearch, role, city });
        if (intent?.role) effectiveRole = intent.role;
        if (intent?.city) effectiveCity = intent.city;
        managerTitles = intent?.managerTitles || [];
        semanticKeywords = intent?.keywords || [];
      } catch (error) {
        console.error('Intent parse failed:', error.message);
      }
    }

    let source = 'database';
    let autoFallback = false;
    let scrapeAdded = 0;
    let scrapeUpdated = 0;
    let scrapeError = null;

    if (forceInternet) {
      source = 'internet';
      const result = await runInternetPipeline({
        role: effectiveRole,
        city: effectiveCity,
        strictHiringManager,
        sources,
        triggeredBy: 'search_internet',
      });
      scrapeAdded = result.added;
      scrapeUpdated = result.updated;
      scrapeError = result.errorMessage || null;
    }

    const mergedSearch = [naturalSearch, ...semanticKeywords].filter(Boolean).join(' ').trim();
    const buildQuery = () => fetchFilteredLeads({
      role: effectiveRole,
      city: effectiveCity,
      search: mergedSearch,
      managerTitles,
      page: 1,
      limit: 500,
    });
    let queryResult = await buildQuery();

    if (!forceInternet && Number(queryResult.total || 0) === 0) {
      autoFallback = true;
      source = 'internet';
      const result = await runInternetPipeline({
        role: effectiveRole,
        city: effectiveCity,
        strictHiringManager,
        sources,
        triggeredBy: 'search_auto_fallback',
      });
      scrapeAdded = result.added;
      scrapeUpdated = result.updated;
      scrapeError = result.errorMessage || null;
      queryResult = await buildQuery();
    }

    const scopeResult = await fetchFilteredLeads({
      role: effectiveRole,
      city: effectiveCity,
      page: 1,
      limit: 1,
    });
    const message = scrapeError
      ? `External APIs unavailable. Showing your saved database. (${scrapeError})`
      : createSearchSummaryMessage(source, scrapeAdded, scrapeUpdated, queryResult.total, {
          autoFallback,
          scopeTotal: scopeResult.total,
        });

    if (isMock) {
      mockSearchHistory.unshift({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        role,
        city,
        search_type: source,
        result_count: queryResult.total,
        created_at: nowIso(),
      });
    } else {
      await safeLog('search_history', {
        role,
        city,
        search_type: source,
        result_count: queryResult.total,
        created_at: nowIso(),
      });
    }

    return res.json({
      success: true,
      data: queryResult.leads,
      source,
      totalInDatabase: scopeResult.total,
      message,
      added: scrapeAdded,
      updated: scrapeUpdated,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/manual-pull', async (req, res) => {
  const role = req.body.role || req.body.function;
  const city = req.body.city;
  const sources = Array.isArray(req.body.sources) && req.body.sources.length ? req.body.sources : DEFAULT_SOURCES;
  const strictHiringManager = Boolean(req.body.strictHiringManager);
  const sessionId = req.body.sessionId || randomUUID();

  if (!role || !city) {
    return res.status(400).json({ success: false, message: 'role and city are required' });
  }

  const push = (payload) => emitManualEvent(sessionId, 'log', { at: nowIso(), ...payload });
  push({ message: `Manual pull started for ${role} in ${city}`, sources });

  const result = await runInternetPipeline({
    role,
    city,
    strictHiringManager,
    sources,
    triggeredBy: 'manual_pull',
    onProgress: (evt) => push(evt),
  });

  const queryResult = await fetchFilteredLeads({ role, city, page: 1, limit: 500 });
  const summary = {
    success: true,
    sessionId,
    scraped: result.scrapedCount,
    added: result.added,
    updated: result.updated,
    source: 'internet',
    totalInDatabase: queryResult.total,
    message: result.errorMessage
      ? `Manual pull completed with partial results (${result.errorMessage})`
      : `${result.added} new leads added, ${result.updated} updated`,
  };

  emitManualEvent(sessionId, 'summary', summary);
  closeManualStream(sessionId);
  return res.json(summary);
});

router.post('/bulk-email', async (req, res) => {
  const leadIds = Array.isArray(req.body.leadIds) ? req.body.leadIds : [];
  const customMessage = req.body.customMessage || {};
  if (!leadIds.length) {
    return res.status(400).json({ success: false, message: 'leadIds is required' });
  }

  ensureQueueRunner();
  const entries = leadIds.map((leadId) => ({
    leadId,
    subject: customMessage.subject || baseSubject,
    body: customMessage.body || baseBody,
    queuedAt: nowIso(),
  }));
  emailQueue.push(...entries);

  const queuedCount = entries.length;
  const estimatedHours = Math.ceil((emailQueue.length / EMAILS_PER_HOUR) * 10) / 10;
  const eta = new Date(Date.now() + (emailQueue.length * EMAIL_INTERVAL_MS)).toISOString();

  return res.json({
    success: true,
    queued: queuedCount,
    totalLeads: leadIds.length,
    estimatedCompletionTime: eta,
    estimatedHours,
    queueRate: '10 per hour',
  });
});

router.post('/send-email', async (req, res) => {
  const { leadId } = req.body;
  if (!leadId) return res.status(400).json({ success: false, message: 'leadId is required' });
  try {
    const result = await processQueuedEmail({
      leadId,
      subject: baseSubject,
      body: baseBody,
      queuedAt: nowIso(),
    });
    if (!result.success) {
      const errorMessage = typeof result.error === 'string'
        ? result.error
        : (result.error?.message || JSON.stringify(result.error || 'Email failed'));
      return res.status(500).json({ success: false, message: errorMessage });
    }
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/pipeline', async (req, res) => {
  const { leadId, stage } = req.body;
  if (!leadId || !VALID_STAGES.includes(stage)) {
    return res.status(400).json({ success: false, message: 'Invalid leadId or stage' });
  }
  try {
    const lead = await updateLeadStage(leadId, stage);
    if (isMock) {
      mockPipelineEvents.unshift({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        lead_id: leadId,
        stage,
        occurred_at: nowIso(),
      });
    } else {
      await safeLog('pipeline_events', { lead_id: leadId, stage, occurred_at: nowIso() });
    }
    return res.json({ success: true, lead });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/blacklist', async (req, res) => {
  const { leadId } = req.body;
  if (!leadId) return res.status(400).json({ success: false, message: 'leadId is required' });
  try {
    if (isMock) {
      mockLeads = mockLeads.map((lead) => (
        String(lead.id) === String(leadId)
          ? { ...lead, is_blacklisted: true, updated_at: nowIso() }
          : lead
      ));
    } else {
      const attempts = [
        { is_blacklisted: true, updated_at: nowIso() },
        { status: 'Blacklisted', updated_at: nowIso() },
        { status: 'Blacklisted' },
      ];
      let update = null;
      for (const payload of attempts) {
        update = await supabase.from('leads').update(payload).eq('id', leadId);
        if (!update.error) break;
        const message = String(update.error.message || '');
        if (!/(is_blacklisted|updated_at)/i.test(message)) break;
      }
      if (update.error) throw new Error(update.error.message);
    }
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/leads', async (req, res) => {
  try {
    const result = await fetchFilteredLeads(req.query || {});
    return res.json({
      success: true,
      leads: result.leads,
      total: result.total,
      page: result.page,
      limit: result.limit,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/stats', async (req, res) => {
  try {
    ensureMockSeedData();
    const source = isMock ? applyFiltersInMemory(mockLeads) : (await fetchFilteredLeads({ page: 1, limit: 100000 })).leads;
    const stageCount = (stage) => source.filter((lead) => stageOf(lead) === stage).length;
    const lastScrape = isMock
      ? mockScrapeLogs[0]?.completed_at || null
      : (await supabase.from('scrape_logs').select('completed_at,status').order('completed_at', { ascending: false }).limit(1)).data?.[0] || null;

    return res.json({
      success: true,
      totalLeads: source.length,
      selected: stageCount('Selected'),
      emailed: stageCount('Email Sent'),
      replied: stageCount('Replied'),
      onboarded: stageCount('Onboarded to Tal'),
      lastScrapeTime: isMock ? lastScrape : lastScrape?.completed_at || null,
      databaseHealth: 'healthy',
      lastScrapeStatus: isMock ? (mockScrapeLogs[0]?.status || null) : (lastScrape?.status || null),
      autoPullEnabled: isMock ? mockSettings.auto_pull_enabled : null,
      lastAutoPull: isMock ? mockSettings.last_auto_pull : null,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/pipeline', async (req, res) => {
  try {
    const result = await fetchFilteredLeads({ page: 1, limit: 100000 });
    const grouped = VALID_STAGES.reduce((acc, stage) => {
      acc[stage] = [];
      return acc;
    }, {});
    result.leads.forEach((lead) => {
      const stage = stageOf(lead);
      if (!grouped[stage]) grouped[stage] = [];
      grouped[stage].push(lead);
    });
    return res.json({ success: true, pipeline: grouped });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/email-logs', async (req, res) => {
  if (isMock) {
    const data = mockEmailLogs.map((log) => ({
      ...log,
      lead: mockLeads.find((lead) => String(lead.id) === String(log.lead_id)) || null,
    }));
    return res.json({ success: true, data });
  }
  let query = await supabase
    .from('email_logs')
    .select('*, leads(*)')
    .order('sent_at', { ascending: false });
  if (query.error) {
    query = await supabase
      .from('email_logs')
      .select('*')
      .order('sent_at', { ascending: false });
  }
  if (query.error) {
    return res.status(500).json({ success: false, message: query.error.message });
  }
  return res.json({ success: true, data: query.data || [] });
});

router.get('/scrape-logs', async (req, res) => {
  if (isMock) {
    return res.json({ success: true, data: mockScrapeLogs });
  }
  const { data, error } = await supabase
    .from('scrape_logs')
    .select('*')
    .order('started_at', { ascending: false });
  if (error) return res.status(500).json({ success: false, message: error.message });
  return res.json({ success: true, data: data || [] });
});

router.get('/search-history', async (req, res) => {
  ensureMockSeedData();
  if (isMock) {
    return res.json({ success: true, data: mockSearchHistory });
  }
  let history = await supabase
    .from('search_history')
    .select('*')
    .order('created_at', { ascending: false });
  if (history.error) {
    history = await supabase
      .from('scrape_logs')
      .select('triggered_by,started_at,leads_found')
      .order('started_at', { ascending: false });
    if (history.error) return res.status(500).json({ success: false, message: history.error.message });
    const mapped = (history.data || []).map((row, index) => ({
      id: `${index}-${row.started_at}`,
      search_type: row.triggered_by,
      created_at: row.started_at,
      result_count: row.leads_found,
    }));
    return res.json({ success: true, data: mapped });
  }
  return res.json({ success: true, data: history.data || [] });
});

router.post('/auto-pull/toggle', async (req, res) => {
  const enabled = Boolean(req.body.enabled);
  if (isMock) {
    mockSettings.auto_pull_enabled = enabled;
    mockSettings.updated_at = nowIso();
    return res.json({ success: true, enabled });
  }
  const attempts = [
    { id: 1, auto_pull_enabled: enabled, updated_at: nowIso() },
    { id: 1, auto_pull_enabled: enabled },
    { auto_pull_enabled: enabled, updated_at: nowIso() },
    { auto_pull_enabled: enabled },
  ];
  let update = null;
  for (const payload of attempts) {
    update = await supabase.from('settings').upsert(payload, { onConflict: 'id' }).select('*').limit(1);
    if (!update.error) break;
  }
  if (update?.error) {
    // Non-blocking fallback for partial schemas: keep API usable.
    mockSettings.auto_pull_enabled = enabled;
    mockSettings.updated_at = nowIso();
  }
  return res.json({ success: true, enabled });
});

router.post('/auto-pull/run', async (req, res) => {
  const combos = [
    ['Engineering', 'Mumbai'],
    ['Engineering', 'Delhi'],
    ['Engineering', 'Bangalore'],
    ['Product', 'Mumbai'],
    ['Product', 'Delhi'],
    ['Product', 'Bangalore'],
    ['Marketing', 'Mumbai'],
    ['Marketing', 'Delhi'],
    ['Marketing', 'Bangalore'],
  ];

  const results = [];
  for (const [role, city] of combos) {
    const result = await runInternetPipeline({
      role,
      city,
      strictHiringManager: true,
      sources: DEFAULT_SOURCES,
      triggeredBy: 'auto_pull',
    });
    results.push({ role, city, ...result });
  }

  if (isMock) {
    mockSettings.last_auto_pull = nowIso();
    mockSettings.updated_at = nowIso();
    return res.json({ success: true, results });
  }

  await supabase.from('settings').upsert({
    id: 1,
    last_auto_pull: nowIso(),
    updated_at: nowIso(),
  }, { onConflict: 'id' });

  return res.json({ success: true, results });
});

module.exports = router;
