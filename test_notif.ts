import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
    const { data: userFincas, error: err1 } = await supabase
        .from('fincas_usuarios')
        .select('id_finca, fincas(nombre)');
    
    console.log("fincas_usuarios error:", err1?.message);
    const fincaIds = userFincas?.map(f => f.id_finca) || [];

    if (fincaIds.length > 0) {
        const { data, error } = await supabase
            .from('animales')
            .select(`
                id,
                numero_chapeta,
                fecha_ingreso,
                peso_ingreso,
                peso_compra,
                id_potrerada,
                id_finca,
                potreradas (nombre),
                registros_pesaje (
                    peso,
                    fecha,
                    gmp_calculada
                )
            `)
            .in('id_finca', fincaIds)
            .eq('estado', 'activo')
            .order('fecha', { foreignTable: 'registros_pesaje', ascending: false });
        
        if (error) {
            console.error("Error fetching animales:", error.message);
        } else {
            console.log("Success! Animales fetched:", data?.length);
        }
    }
}
test();
