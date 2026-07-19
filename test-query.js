import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://attusafghupkdkjkmxkd.supabase.co', process.env.SUPABASE_KEY || ''); // Wait, I don't have the API key!
