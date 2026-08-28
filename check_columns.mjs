import dotenv from 'dotenv';
import fetch from 'node-fetch'; // Vite project, let's just use native fetch if Node 18+

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

async function checkTable(tableName) {
    try {
        const res = await fetch(`${supabaseUrl}/rest/v1/${tableName}?limit=1`, {
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`
            }
        });
        const data = await res.json();
        if (data && data.length > 0) {
            console.log(`Columns for ${tableName}:`, Object.keys(data[0]));
        } else {
            console.log(`Table ${tableName} is empty or not accessible.`);
        }
    } catch (e) {
        console.error(`Error fetching ${tableName}:`, e.message);
    }
}

checkTable('registros_aforo');
checkTable('registros_pesaje');
