import { useEffect, useState } from 'react';
import { CloudUpload, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { SYNC_EVENT_NAME, type ResumenSincronizacion } from '../lib/syncService';

/**
 * Pop-up que aparece cuando vuelve la señal y se termina de subir a la nube
 * todo lo que se hizo sin conexión.
 */
export default function SyncSummaryModal() {
  const [resumen, setResumen] = useState<ResumenSincronizacion | null>(null);

  useEffect(() => {
    const handler = (e: Event) => setResumen((e as CustomEvent<ResumenSincronizacion>).detail);
    window.addEventListener(SYNC_EVENT_NAME, handler);
    return () => window.removeEventListener(SYNC_EVENT_NAME, handler);
  }, []);

  if (!resumen) return null;

  const hayErrores = resumen.fallidos > 0;
  const exitosas = resumen.lineas.filter(l => l.ok);
  const fallidas = resumen.lineas.filter(l => !l.ok);
  const hora = new Date(resumen.fecha).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sync-resumen-titulo"
      style={{
        position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px', backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)'
      }}
      onClick={() => setResumen(null)}
    >
      <div
        className="card"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '460px', width: '100%', maxHeight: '85vh', overflowY: 'auto', position: 'relative',
          border: `1px solid ${hayErrores ? 'rgba(245, 158, 11, 0.5)' : 'rgba(76, 175, 80, 0.5)'}`
        }}
      >
        <button
          onClick={() => setResumen(null)}
          aria-label="Cerrar"
          style={{ position: 'absolute', top: 10, right: 10, background: 'transparent', border: 'none', color: 'var(--text-muted)', width: 'auto', padding: 6, cursor: 'pointer' }}
        >
          <X size={20} />
        </button>

        <div style={{ textAlign: 'center', marginBottom: '16px' }}>
          <CloudUpload size={40} color={hayErrores ? '#fbbf24' : 'var(--success)'} />
          <h2 id="sync-resumen-titulo" style={{ margin: '10px 0 4px' }}>Información sincronizada</h2>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Volvió la señal y se subió a la nube lo que hiciste sin conexión ({hora}).
          </p>
        </div>

        {exitosas.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {exitosas.map((l, i) => (
              <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '10px', backgroundColor: 'rgba(76, 175, 80, 0.1)' }}>
                <CheckCircle2 size={18} color="var(--success)" />
                <span style={{ flex: 1 }}>{l.etiqueta}</span>
                <b>{l.cantidad}</b>
              </li>
            ))}
          </ul>
        )}

        {(fallidas.length > 0 || resumen.errores.length > 0) && (
          <div style={{ padding: '10px 12px', borderRadius: '10px', backgroundColor: 'rgba(245, 158, 11, 0.12)', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', color: '#fbbf24', marginBottom: '6px' }}>
              <AlertTriangle size={18} /> No se pudieron subir ({resumen.fallidos})
            </div>
            <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {resumen.errores.map((m, i) => <li key={i}>{m}</li>)}
              {resumen.errores.length === 0 && fallidas.map((l, i) => <li key={i}>{l.etiqueta}: {l.cantidad}</li>)}
            </ul>
            <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Revisa esos registros y vuelve a hacerlos con conexión.
            </p>
          </div>
        )}

        <button onClick={() => setResumen(null)} style={{ width: '100%' }}>
          Entendido
        </button>
      </div>
    </div>
  );
}
