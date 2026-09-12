import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Faltan las variables de entorno VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY");
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  global: {
    fetch: (url, options = {}) => {
      if (!options.signal && typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal) {
        return fetch(url, {
          ...options,
          signal: AbortSignal.timeout(20000)
        });
      }
      return fetch(url, options);
    }
  }
});
