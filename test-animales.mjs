import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.from('animales').select('id, numero_chapeta, estado, comprador_venta, fecha_venta, id_finca').eq('estado', 'vendido');
  if (error) {
    console.error(error);
  } else {
    console.log("Animales vendidos:");
    data.forEach(a => console.log(a));
  }
}
run();
