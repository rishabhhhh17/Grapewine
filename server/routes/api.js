const express = require('express');
const { randomUUID } = require('crypto');
const { scrapeAllPlatforms, generateMockLeads } = require('../services/scraperService');
const { findHiringManagersBulk } = require('../services/linkedinService');
const { calculateActivityScore } = require('../services/scoringService');
const { sendOutreachEmail } = require('../services/emailService');
const { parseSearchIntent } = require('../services/intentService');
const { supabase, isMock } = require('../services/supabaseService');
const {
  DEFAULT_AUTO_PULL_SCHEDULE,
  normalizeAutoPullSchedule,
  setAutoPullSchedule,
  getAutoPullScheduleState,
} = require('../services/autoPullScheduler');

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
let mockSettings = {
  auto_pull_enabled: false,
  auto_pull_schedule: DEFAULT_AUTO_PULL_SCHEDULE,
  last_auto_pull: null,
  updated_at: new Date().toISOString(),
};
const leadColumnCache = new Map();

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
  const cities = ['Bangalore', 'Mumbai', 'Delhi', 'Gurugram', 'Pune'];
  const functions = ['Engineering', 'Product', 'Marketing'];
  const companies = ['Nexa Systems', 'Orbit Labs', 'KiteStack', 'BlueHive', 'QuantFox', 'NovaPeak'];
  const titlesByFunction = {
    Engineering: ['Engineering Manager', 'Director of Engineering', 'CTO'],
    Product: ['Head of Product', 'Product Director', 'VP Product'],
    Marketing: ['Marketing Director', 'Head of Growth', 'CMO'],
  };
  const seeded = [];
  for (let i = 0; i < 2200; i += 1) {
    const base = MOCK_LEAD_SEED[i % MOCK_LEAD_SEED.length];
    const fn = functions[i % functions.length];
    const company = `${companies[i % companies.length]} ${Math.floor(i / companies.length) + 1}`;
    const city = cities[i % cities.length];
    const title = titlesByFunction[fn][i % titlesByFunction[fn].length];
    const name = `${base.name.split(' ')[0]} ${String.fromCharCode(65 + (i % 26))}${Math.floor(i / 26)}`;
    seeded.push({
      ...base,
      id: `mock-${i + 1}`,
      name,
      title,
      company,
      city,
      function: fn,
      days_posted: (i % 14) + 1,
      activity_score: Math.max(1, 10 - (i % 9)),
      email: `contact${i + 1}@${company.replace(/\s+/g, '').toLowerCase()}.com`,
      linkedin_url: null,
      pipeline_stage: 'Found',
      status: 'Found',
      is_blacklisted: false,
      created_at: seededAt,
      updated_at: seededAt,
    });
  }
  mockLeads = seeded;
  mockSearchHistory.unshift({
    id: `seed-${Date.now()}`,
    role: 'Engineering',
    city: 'Bangalore',
    search_type: 'mock_seed',
    result_count: mockLeads.length,
    created_at: seededAt,
  });
};

const normalizeCity = (city) => {
  const cityMap = {
    bangalore: 'Bangalore', bengaluru: 'Bangalore', bengalore: 'Bangalore',
    mumbai: 'Mumbai', bombay: 'Mumbai',
    delhi: 'Delhi', 'new delhi': 'Delhi', ncr: 'Delhi',
    gurgaon: 'Delhi', noida: 'Delhi', gurugram: 'Delhi',
  };
  return cityMap[String(city).toLowerCase()] || city;
};

const normalizeFunction = (func) => {
  const funcMap = {
    engineering: 'Engineering', engineer: 'Engineering', tech: 'Engineering', technology: 'Engineering',
    product: 'Product', 'product management': 'Product', pm: 'Product',
    marketing: 'Marketing', growth: 'Marketing', sales: 'Marketing',
  };
  return funcMap[String(func).toLowerCase()] || func;
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

const createSearchSummaryMessage = (source, added, updated, total) => {
  if (source === 'internet, now saved to database') {
    if (added === 0 && updated > 0) {
      return `Fresh from internet. 0 new leads saved. ${updated} already existed and were updated.`;
    }
    return `Fresh from internet. ${added} new leads saved to your database. ${updated} already existed and were updated.`;
  }
  if (total === 0) {
    return 'No leads found in your database for this search. Use Search Internet to find new leads.';
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
    .filter((lead) => (role && role !== 'all' ? String(lead.function || '').toLowerCase().includes(normalizeFunction(role).toLowerCase()) : true))
    .filter((lead) => (city && city !== 'all' ? String(lead.city || '').toLowerCase().includes(normalizeCity(city).toLowerCase()) : true))
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

const supportsLeadColumn = async (column) => {
  if (isMock) return true;
  if (leadColumnCache.has(column)) return leadColumnCache.get(column);
  const probe = await supabase.from('leads').select(column).limit(1);
  const supported = !probe.error || !new RegExp(`column .*${column}`, 'i').test(String(probe.error.message || ''));
  leadColumnCache.set(column, supported);
  return supported;
};

const fetchSettings = async () => {
  if (isMock) return { ...mockSettings };
  const query = await supabase
    .from('settings')
    .select('*')
    .eq('id', 1)
    .limit(1)
    .maybeSingle();
  if (query.error) return {};
  return query.data || {};
};

const persistSettings = async (partial) => {
  if (isMock) {
    mockSettings = { ...mockSettings, ...partial, updated_at: nowIso() };
    return { ...mockSettings };
  }

  const payloadWithId = { id: 1, ...partial, updated_at: nowIso() };
  const payloadNoUpdatedAt = { id: 1, ...partial };
  const payloadNoId = { ...partial, updated_at: nowIso() };
  const payloadMinimal = { ...partial };
  const attempts = [payloadWithId, payloadNoUpdatedAt, payloadNoId, payloadMinimal];
  let result = null;
  for (const payload of attempts) {
    result = await supabase.from('settings').upsert(payload, { onConflict: 'id' }).select('*').limit(1);
    if (!result.error) break;
  }
  if (result?.error) {
    return {};
  }
  return result.data?.[0] || partial;
};

const cleanupFakeSentEmailLogs = async () => {
  if (isMock) {
    mockEmailLogs = mockEmailLogs.filter((row) => row.status !== 'sent');
    return;
  }

  if (!process.env.RESEND_API_KEY) {
    await supabase.from('email_logs').delete().eq('status', 'sent');
    return;
  }

  let cleanup = await supabase
    .from('email_logs')
    .delete()
    .eq('status', 'sent')
    .not('error_message', 'is', null);
  if (cleanup.error && /column .*error_message/i.test(String(cleanup.error.message || ''))) {
    cleanup = { error: null };
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
  const hasUpdatedAt = await supportsLeadColumn('updated_at');
  let payload = { pipeline_stage: stage, status: stage, ...(hasUpdatedAt ? { updated_at: nowIso() } : {}) };
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
  const buildDbQuery = (excludeBlacklisted = true, stageMode = 'both') => {
    let dbQuery = supabase.from('leads').select('*', { count: 'exact' });
    if (role && role !== 'all') dbQuery = dbQuery.ilike('function', `%${normalizeFunction(role)}%`);
    if (query.city && query.city !== 'all') dbQuery = dbQuery.ilike('city', `%${normalizeCity(query.city)}%`);
    if (query.stage) {
      const escapedStage = String(query.stage).replaceAll('"', '\\"');
      if (stageMode === 'status') {
        dbQuery = dbQuery.eq('status', query.stage);
      } else if (stageMode === 'pipeline') {
        dbQuery = dbQuery.eq('pipeline_stage', query.stage);
      } else {
        dbQuery = dbQuery.or(`pipeline_stage.eq."${escapedStage}",status.eq."${escapedStage}"`);
      }
    }
    if (query.minScore !== undefined) dbQuery = dbQuery.gte('activity_score', Number(query.minScore));
    if (query.maxScore !== undefined) dbQuery = dbQuery.lte('activity_score', Number(query.maxScore));
    if (query.source) dbQuery = dbQuery.contains('source_platforms', [query.source]);
    if (query.search) {
      const term = String(query.search).replaceAll(',', ' ');
      dbQuery = dbQuery.or(SEARCHABLE_FIELDS.map((f) => `${f}.ilike.%${term}%`).join(','));
    }
    if (excludeBlacklisted) dbQuery = dbQuery.or('is_blacklisted.is.null,is_blacklisted.eq.false');
    return dbQuery
      .order('activity_score', { ascending: false })
      .order('id', { ascending: false });
  };

  const executeRange = async (rangeStart, rangeEnd) => {
    const stageModes = query.stage ? ['both', 'status', 'pipeline'] : ['both'];
    let lastError = null;

    for (const excludeBlacklisted of [true, false]) {
      for (const stageMode of stageModes) {
        const response = await buildDbQuery(excludeBlacklisted, stageMode).range(rangeStart, rangeEnd);
        if (!response.error) return response;
        const message = String(response.error.message || '');
        lastError = response.error;

        const isBlacklistedMissing = /column .*is_blacklisted/i.test(message);
        const pipelineMissing = /column .*pipeline_stage/i.test(message);
        const statusMissing = /column .*status/i.test(message);

        if (excludeBlacklisted && isBlacklistedMissing) break;
        if (stageMode === 'both' && (pipelineMissing || statusMissing)) continue;
        if (stageMode === 'status' && statusMissing) continue;
        if (stageMode === 'pipeline' && pipelineMissing) continue;
        return response;
      }
    }

    return { data: null, count: 0, error: lastError || new Error('Lead query failed') };
  };

  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.min(100000, Math.max(1, Number(query.limit || 100)));
  const start = (page - 1) * limit;
  const end = start + limit - 1;
  if (managerTitles.length) {
    const chunkSize = 1000;
    const allRows = [];
    let chunkStart = 0;
    while (true) {
      const chunk = await executeRange(chunkStart, chunkStart + chunkSize - 1);
      if (chunk.error) throw new Error(chunk.error.message);
      const rows = chunk.data || [];
      allRows.push(...rows);
      if (rows.length < chunkSize) break;
      chunkStart += chunkSize;
    }

    const filtered = allRows
      .map(normalizeLead)
      .filter((lead) => managerTitles.some((title) => String(lead.title || '').toLowerCase().includes(title)));

    return {
      leads: filtered.slice(start, start + limit),
      total: filtered.length,
      page,
      limit,
    };
  }

  const rows = [];
  let totalCount = 0;
  let currentStart = start;
  let remaining = limit;
  const chunkSize = 1000;

  while (remaining > 0) {
    const chunkLimit = Math.min(chunkSize, remaining);
    const chunk = await executeRange(currentStart, currentStart + chunkLimit - 1);
    if (chunk.error) throw new Error(chunk.error.message);
    if (totalCount === 0 && Number.isFinite(Number(chunk.count))) totalCount = Number(chunk.count);
    const batch = chunk.data || [];
    rows.push(...batch);
    if (batch.length < chunkLimit) break;
    currentStart += chunkLimit;
    remaining -= chunkLimit;
  }

  return {
    leads: rows.map(normalizeLead),
    total: totalCount,
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

  const hasUpdatedAt = await supportsLeadColumn('updated_at');
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
    ...(hasUpdatedAt ? { updated_at: nowIso() } : {}),
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
    upsert = { error: null };
    for (const row of activePayload) {
      const key = getLeadKey(row);
      let updatePayload = {
        activity_score: row.activity_score,
        days_posted: row.days_posted,
        source_platforms: row.source_platforms,
        linkedin_url: row.linkedin_url,
        title: row.title,
        ...(hasUpdatedAt ? { updated_at: nowIso() } : {}),
      };
      if (existingKeys.has(key)) {
        let updateResult = await supabase
          .from('leads')
          .update(updatePayload)
          .eq('name', row.name)
          .eq('company', row.company);
        if (updateResult.error && /column .*updated_at/i.test(String(updateResult.error.message || ''))) {
          const { updated_at: omitted, ...nextPayload } = updatePayload;
          updatePayload = nextPayload;
          updateResult = await supabase
            .from('leads')
            .update(updatePayload)
            .eq('name', row.name)
            .eq('company', row.company);
        }
        if (updateResult.error) {
          upsert = updateResult;
          break;
        }
      } else {
        let insertPayload = { ...row };
        let insertResult = await supabase.from('leads').insert(insertPayload);
        if (insertResult.error && /column .*updated_at/i.test(String(insertResult.error.message || ''))) {
          const { updated_at: omitted, ...nextPayload } = insertPayload;
          insertPayload = nextPayload;
          insertResult = await supabase.from('leads').insert(insertPayload);
        }
        if (insertResult.error) {
          upsert = insertResult;
          break;
        }
      }
    }
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
  count = 50,
  triggeredBy = 'manual',
  onProgress,
}) => {
  const startedAt = nowIso();
  let status = 'success';
  let errorMessage = null;

  // No Firecrawl key → fast mock path: skip scrape + Apify entirely
  if (!process.env.FIRECRAWL_API_KEY) {
    try {
      if (onProgress) onProgress({ stage: 'mock', message: `Mock mode — generating ${count} test leads...` });
      const prepared = generateMockLeads(role, city, count);
      console.log(`[mock pipeline] Generated ${prepared.length} leads. Saving to Supabase...`);
      if (onProgress) onProgress({ stage: 'saving', message: `Saving ${prepared.length} leads to database...` });
      const { added, updated } = await upsertLeads(prepared, {
        triggeredBy,
        sourcesScraped: sources,
        leadsFound: prepared.length,
        startedAt,
        status: 'success',
        errorMessage: null,
      });
      console.log(`[mock pipeline] Done. added=${added} updated=${updated}`);
      if (onProgress) onProgress({ stage: 'done', message: `Done — ${added} new leads added, ${updated} updated.` });
      return { added, updated, scrapedCount: prepared.length };
    } catch (err) {
      console.error('[mock pipeline] upsert failed:', err.message);
      return { added: 0, updated: 0, scrapedCount: 0, errorMessage: err.message };
    }
  }

  let rawJobs = [];
  try {
    rawJobs = await scrapeAllPlatforms(role, city, strictHiringManager, { sources, count, onProgress });
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

  const emailSucceeded = result.success;
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
  const rawRole = req.body.role || req.body.function;
  const rawCity = req.body.city;
  // Treat 'all' or empty as "no filter"
  const role = (rawRole && rawRole !== 'all') ? rawRole : undefined;
  const city = (rawCity && rawCity !== 'all') ? rawCity : undefined;
  const forceInternet = Boolean(req.body.forceInternet);
  const strictHiringManager = Boolean(req.body.strictHiringManager);
  const sources = Array.isArray(req.body.sources) && req.body.sources.length ? req.body.sources : DEFAULT_SOURCES;
  const naturalSearch = String(req.body.search || '').trim();
  const count = Math.max(10, Math.min(500, Number(req.body.count || 50)));

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
    let scrapeAdded = 0;
    let scrapeUpdated = 0;
    let scrapeError = null;

    if (forceInternet) {
      source = 'internet, now saved to database';
      const result = await runInternetPipeline({
        role: effectiveRole,
        city: effectiveCity,
        strictHiringManager,
        sources,
        count,
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
      limit: 5000,
    });
    let queryResult = await buildQuery();

    const scopeResult = await fetchFilteredLeads({
      role: effectiveRole,
      city: effectiveCity,
      page: 1,
      limit: 1,
    });
    const message = scrapeError
      ? `External APIs unavailable. Showing your saved database. (${scrapeError})`
      : createSearchSummaryMessage(source, scrapeAdded, scrapeUpdated, queryResult.total);

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
  const count = Math.max(10, Math.min(500, Number(req.body.count || 50)));
  const sessionId = req.body.sessionId || randomUUID();

  if (!role || !city) {
    return res.status(400).json({ success: false, message: 'role and city are required' });
  }

  const push = (payload) => emitManualEvent(sessionId, 'log', { at: nowIso(), ...payload });
  push({ message: `Manual pull started for ${role} in ${city} (${count} leads)`, sources });

  const result = await runInternetPipeline({
    role,
    city,
    strictHiringManager,
    sources,
    count,
    triggeredBy: 'manual_pull',
    onProgress: (evt) => push(evt),
  });

  const queryResult = await fetchFilteredLeads({ role, city, page: 1, limit: 5000 });
  const summary = {
    success: true,
    sessionId,
    scraped: result.scrapedCount,
    added: result.added,
    updated: result.updated,
    source: 'internet',
    totalInDatabase: queryResult.total,
    data: queryResult.leads,
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
      const hasUpdatedAt = await supportsLeadColumn('updated_at');
      const attempts = [
        { is_blacklisted: true, ...(hasUpdatedAt ? { updated_at: nowIso() } : {}) },
        { status: 'Blacklisted', ...(hasUpdatedAt ? { updated_at: nowIso() } : {}) },
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
    await cleanupFakeSentEmailLogs();
    const source = isMock ? applyFiltersInMemory(mockLeads) : [];
    const stageCount = (stage) => source.filter((lead) => stageOf(lead) === stage).length;
    const lastScrape = isMock
      ? mockScrapeLogs[0]?.completed_at || null
      : (await supabase.from('scrape_logs').select('completed_at,status').order('completed_at', { ascending: false }).limit(1)).data?.[0] || null;
    const settings = await fetchSettings();
    const runtimeSchedule = getAutoPullScheduleState().schedule;
    const schedule = normalizeAutoPullSchedule(
      settings?.auto_pull_schedule || runtimeSchedule || DEFAULT_AUTO_PULL_SCHEDULE
    );
    setAutoPullSchedule(schedule);

    let totalLeads = source.length;
    let selected = isMock ? stageCount('Selected') : 0;
    let replied = isMock ? stageCount('Replied') : 0;
    let onboarded = isMock ? stageCount('Onboarded to Tal') : 0;
    let emailed = isMock ? 0 : stageCount('Email Sent');
    if (!isMock) {
      totalLeads = (await fetchFilteredLeads({ page: 1, limit: 1 })).total;
      selected = (await fetchFilteredLeads({ page: 1, limit: 1, stage: 'Selected' })).total;
      replied = (await fetchFilteredLeads({ page: 1, limit: 1, stage: 'Replied' })).total;
      onboarded = (await fetchFilteredLeads({ page: 1, limit: 1, stage: 'Onboarded to Tal' })).total;

      let emailCount = await supabase
        .from('email_logs')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'sent');
      if (!emailCount.error && Number.isFinite(Number(emailCount.count))) {
        emailed = Number(emailCount.count);
      } else {
        emailed = 0;
      }
    }
    const autoPullEnabled = isMock ? mockSettings.auto_pull_enabled : Boolean(settings?.auto_pull_enabled);
    const lastAutoPull = isMock ? mockSettings.last_auto_pull : (settings?.last_auto_pull || null);
    const scheduleState = getAutoPullScheduleState({ lastAutoPull });

    return res.json({
      success: true,
      totalLeads,
      selected,
      emailed,
      replied,
      onboarded,
      isMock,
      lastScrapeTime: isMock ? lastScrape : lastScrape?.completed_at || null,
      databaseHealth: 'healthy',
      lastScrapeStatus: isMock ? (mockScrapeLogs[0]?.status || null) : (lastScrape?.status || null),
      autoPullEnabled,
      autoPullSchedule: schedule,
      nextAutoPullAt: autoPullEnabled ? scheduleState.nextRunAt : null,
      lastAutoPull,
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
  const saved = await persistSettings({ auto_pull_enabled: enabled });
  const schedule = normalizeAutoPullSchedule(
    saved?.auto_pull_schedule || getAutoPullScheduleState().schedule || mockSettings.auto_pull_schedule || DEFAULT_AUTO_PULL_SCHEDULE
  );
  setAutoPullSchedule(schedule);
  const lastAutoPull = saved?.last_auto_pull || mockSettings.last_auto_pull || null;
  const scheduleState = getAutoPullScheduleState({ lastAutoPull });
  return res.json({
    success: true,
    enabled,
    autoPullSchedule: schedule,
    nextAutoPullAt: enabled ? scheduleState.nextRunAt : null,
  });
});

router.post('/auto-pull/schedule', async (req, res) => {
  const normalized = normalizeAutoPullSchedule(req.body.schedule || DEFAULT_AUTO_PULL_SCHEDULE);
  const saved = await persistSettings({ auto_pull_schedule: normalized });
  const enabled = Boolean(saved?.auto_pull_enabled ?? mockSettings.auto_pull_enabled);
  setAutoPullSchedule(normalized);
  const lastAutoPull = saved?.last_auto_pull || mockSettings.last_auto_pull || null;
  const scheduleState = getAutoPullScheduleState({ lastAutoPull });
  return res.json({
    success: true,
    autoPullSchedule: normalized,
    autoPullEnabled: enabled,
    nextAutoPullAt: enabled ? scheduleState.nextRunAt : null,
  });
});

router.post('/auto-pull/run', async (req, res) => {
  const settings = await fetchSettings();
  const enabled = isMock ? mockSettings.auto_pull_enabled : Boolean(settings?.auto_pull_enabled);
  if (!enabled) {
    return res.json({ success: true, skipped: true, message: 'Auto pull is disabled' });
  }

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

  await persistSettings({ last_auto_pull: nowIso() });

  return res.json({ success: true, results });
});

module.exports = router;
