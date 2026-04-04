import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '.env.local') });
dotenv.config({ path: resolve(__dirname, '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: p, error: e1 } = await supabase.from('potreros').select('*').limit(1);
  console.log("Potreros fields:", p ? Object.keys(p[0] || {}) : e1);

  // Intentamos crear la tabla registros_aforo
  const query = `
    CREATE TABLE IF NOT EXISTS registros_aforo (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        id_finca UUID NOT NULL REFERENCES fincas(id) ON DELETE CASCADE,
        id_potrero UUID NOT NULL REFERENCES potreros(id) ON DELETE CASCADE,
        fecha DATE NOT NULL,
        muestras JSONB NOT NULL,
        promedio_muestras_kg NUMERIC NOT NULL,
        viabilidad NUMERIC NOT NULL,
        aforo_real_kg NUMERIC NOT NULL,
        id_potrerada UUID REFERENCES potreradas(id) ON DELETE SET NULL,
        animales_presentes INTEGER,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
    );
  `;
  
  // Como el VITE_SUPABASE_ANON_KEY no puede hacer DDL en el cliente si RLS lo previene
  // vamos a imprimir el schema de potreradas y animales para inferir las relaciones
  const { data: potreradas, error: e2 } = await supabase.from('potreradas').select('*').limit(1);
  console.log("Potreradas fields:", potreradas ? Object.keys(potreradas[0] || {}) : e2);
}
check();
