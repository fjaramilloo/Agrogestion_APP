import { createClient } from '@supabase/supabase-js'
import { offlineAwareFetch, isModoCampoActivo } from './httpOffline'

export { isModoCampoActivo };

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Faltan las variables de entorno VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY");
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    persistSession: true,
    autoRefreshToken: !isModoCampoActivo(),
    detectSessionInUrl: true,
  },
  global: {
    // Capa offline global: en Modo Campo (o sin señal) lee de la memoria local y encola las escrituras.
    fetch: offlineAwareFetch
  }
});
