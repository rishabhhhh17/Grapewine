const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://mock.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'mock-key';
const forceMockMode = String(process.env.FORCE_MOCK_MODE || '').toLowerCase() === 'true';

// Mock mode when explicitly forced or when Supabase env vars are missing
const isMock = forceMockMode || !process.env.SUPABASE_URL || !process.env.SUPABASE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = { supabase, isMock };
