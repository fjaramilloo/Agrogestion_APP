import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data, error } = await supabase.from('animales').select('id, numero_chapeta, peso_ingreso, peso_compra, fecha_ingreso, registros_pesaje(peso, fecha, etapa)').eq('numero_chapeta', '26-44');
  console.log(JSON.stringify(data, null, 2));
}
main();
