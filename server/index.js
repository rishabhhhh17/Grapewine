require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const apiRoutes = require('./routes/api');
const { supabase, isMock } = require('./services/supabaseService');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/api', apiRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

cron.schedule('0 9 * * 1', async () => {
  try {
    let enabled = false;
    if (isMock) {
      enabled = true;
    } else {
      const { data, error } = await supabase
        .from('settings')
        .select('auto_pull_enabled')
        .eq('id', 1)
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error('Auto pull setting read failed:', error.message);
        return;
      }
      enabled = Boolean(data?.auto_pull_enabled);
    }

    if (!enabled) {
      console.log('Auto pull skipped: disabled');
      return;
    }

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
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
