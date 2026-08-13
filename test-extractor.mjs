function extractSql(text) {
    const startMarker = '```sql';
    const endMarker = '```';
    const start = text.toLowerCase().indexOf(startMarker);
    if (start === -1) {
        // Tratar de buscar si empieza con SELECT directamente
        if (text.trim().toUpperCase().startsWith('SELECT')) {
            return text.trim();
        }
        // Buscar cualquier bloque de código
        const genericMatch = text.match(/```[\s\S]*?\n([\s\S]*?)```/);
        if (genericMatch && genericMatch[1].trim().toUpperCase().startsWith('SELECT')) {
            return genericMatch[1].trim();
        }
        return null;
    }
    const sqlStart = start + startMarker.length;
    const end = text.indexOf(endMarker, sqlStart);
    if (end === -1) return null;
    return text.slice(sqlStart, end).trim();
}

const test1 = "```sql SELECT * FROM a ```";
const test2 = "```SQL\nSELECT * FROM a\n```";
const test3 = "SELECT * FROM a";
const test4 = "```\nSELECT * FROM a\n```";

console.log("1:", extractSql(test1));
console.log("2:", extractSql(test2));
console.log("3:", extractSql(test3));
console.log("4:", extractSql(test4));
