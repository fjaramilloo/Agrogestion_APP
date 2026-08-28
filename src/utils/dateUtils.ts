/**
 * Retorna la fecha local actual en formato YYYY-MM-DD.
 * Previene el salto de día que ocurre al usar toISOString() en zonas horarias como UTC-5.
 */
export function getLocalIsoDate(): string {
    const tzOffset = (new Date()).getTimezoneOffset() * 60000;
    return (new Date(Date.now() - tzOffset)).toISOString().split('T')[0];
}
