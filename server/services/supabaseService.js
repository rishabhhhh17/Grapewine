const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://mock.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'mock-key';

// Mock mode if env vars are missing
const isMock = !process.env.SUPABASE_URL;

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = { supabase, isMock };
