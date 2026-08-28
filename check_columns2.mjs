import fetch from 'node-fetch'; // assuming node 18+ has fetch, but wait, let's use https module to avoid node-fetch issues or just use native fetch if available.

const supabaseUrl = 'https://attusafghupkdkjkmxkd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0dHVzYWZnaHVwa2RramtteGtkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4MTE1NzksImV4cCI6MjA4ODM4NzU3OX0.n2DQSNJ62AdNkx_sxHbcMwrwaWPjaIMJiD94GvBNHYw';

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
            console.log(`Table ${tableName} is empty or not accessible. Response:`, JSON.stringify(data));
        }
    } catch (e) {
        console.error(`Error fetching ${tableName}:`, e.message);
    }
}

checkTable('registros_aforo');
checkTable('registros_pesaje');
