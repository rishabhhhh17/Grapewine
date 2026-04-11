require('dotenv').config();
const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes/api');
const { supabase, isMock } = require('./services/supabaseService');
const {
  DEFAULT_AUTO_PULL_SCHEDULE,
  normalizeAutoPullSchedule,
  setAutoPullRunner,
  setAutoPullSchedule,
} = require('./services/autoPullScheduler');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/api', apiRoutes);

const logApiKeyStatus = () => {
  const has = (key) => Boolean(process.env[key]);
  console.log('\n── Grape Hiring Manager Engine ─────────────────────────');
  console.log(has('SUPABASE_URL') && has('SUPABASE_KEY') && !isMock
    ? '  ✅ Supabase  : connected'
    : '  ❌ Supabase  : missing key — running in mock mode');
  console.log(has('FIRECRAWL_API_KEY')
    ? '  ✅ Firecrawl : ready — internet scraping enabled'
    : '  ❌ Firecrawl : missing key — internet scraping disabled');
  console.log(has('APIFY_API_KEY')
    ? '  ✅ Apify     : ready — LinkedIn matching enabled'
    : '  ❌ Apify     : missing key — LinkedIn matching disabled');
  console.log(has('RESEND_API_KEY')
    ? '  ✅ Resend    : ready — email sending enabled'
    : '  ❌ Resend    : missing key — email sending disabled');
  console.log(has('GROQ_API_KEY')
    ? '  ✅ Groq      : ready — intent parsing enabled'
    : '  ❌ Groq      : missing key — natural search disabled');
  console.log('  (Visit /api/health to verify each key actually works)');
  console.log('────────────────────────────────────────────────────────\n');
};

const getPersistedSchedule = async () => {
  if (isMock) return DEFAULT_AUTO_PULL_SCHEDULE;
  try {
    const settings = await supabase
      .from('settings')
      .select('auto_pull_schedule')
      .eq('id', 1)
      .limit(1)
      .maybeSingle();
    if (settings.error) return DEFAULT_AUTO_PULL_SCHEDULE;
    return normalizeAutoPullSchedule(settings.data?.auto_pull_schedule || DEFAULT_AUTO_PULL_SCHEDULE);
  } catch {
    return DEFAULT_AUTO_PULL_SCHEDULE;
  }
};

const triggerAutoPull = async () => {
  try {
    const autoPullEndpoint = `http://localhost:${PORT}/api/auto-pull/run`;
    const response = await fetch(autoPullEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Auto pull request failed with ${response.status}`);
    }

    console.log('Auto pull completed successfully.');
  } catch (error) {
    console.error('Auto pull failed:', error.message);
  }
};

const boot = async () => {
  setAutoPullRunner(triggerAutoPull);
  const schedule = await getPersistedSchedule();
  setAutoPullSchedule(schedule);

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    logApiKeyStatus();
  });
};

boot().catch((err) => {
  console.error('Server failed to start:', err.message);
  process.exit(1);
});
