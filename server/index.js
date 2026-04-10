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

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const getPersistedSchedule = async () => {
  if (isMock) return DEFAULT_AUTO_PULL_SCHEDULE;
  const settings = await supabase
    .from('settings')
    .select('auto_pull_schedule')
    .eq('id', 1)
    .limit(1)
    .maybeSingle();
  if (settings.error) return DEFAULT_AUTO_PULL_SCHEDULE;
  return normalizeAutoPullSchedule(settings.data?.auto_pull_schedule || DEFAULT_AUTO_PULL_SCHEDULE);
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

const diagnoseDatabaseValues = async () => {
  if (isMock || !supabase) return;
  try {
    const { data: sample } = await supabase.from('leads').select('city, function').limit(50);
    console.log('Sample city and function values:', sample);

    const { data: citiesRaw } = await supabase.from('leads').select('city');
    const { data: functionsRaw } = await supabase.from('leads').select('function');
    const uniqueCities = [...new Set((citiesRaw || []).map((r) => r.city))].filter(Boolean);
    const uniqueFunctions = [...new Set((functionsRaw || []).map((r) => r.function))].filter(Boolean);
    console.log('All unique cities in DB:', uniqueCities);
    console.log('All unique functions in DB:', uniqueFunctions);
  } catch (err) {
    console.error('Diagnostics failed:', err.message);
  }
};

const boot = async () => {
  setAutoPullRunner(triggerAutoPull);
  const schedule = await getPersistedSchedule();
  setAutoPullSchedule(schedule);

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    diagnoseDatabaseValues();
  });
};

boot();
