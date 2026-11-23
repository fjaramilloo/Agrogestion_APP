import { useEffect, useState } from 'react';
import { CloudUpload, CheckCircle2, AlertTriangle, RefreshCw, Trash2, X } from 'lucide-react';
import { SYNC_EVENT_NAME, type ResumenSincronizacion } from '../lib/syncService';
import { localDB } from '../lib/db';
import { etiquetaOperacion } from '../lib/httpOffline';
import { useConnection } from '../contexts/ConnectionContext';
import { useModalDialog } from '../hooks/useModalDialog';
import './SyncSummaryModal.css';

export const OPEN_SYNC_ERRORS_EVENT = 'agrogestion-open-sync-errors';

async function cargarResumenFallidosLocales(): Promise<ResumenSincronizacion | null> {
  try {
    const [httpFailed, pesajesFailed, aforosFailed, comprasFailed] = await Promise.all([
      localDB.httpWriteQueue.where('status').equals('failed').toArray(),
      localDB.pesajesOfflineQueue.where('status_sync').equals('failed').toArray(),
      localDB.aforosOfflineQueue.where('status_sync').equals('failed').toArray(),
      localDB.comprasOfflineQueue.where('status_sync').equals('failed').toArray(),
    ]);

    const errores: string[] = [];
    const total = httpFailed.length + pesajesFailed.length + aforosFailed.length + comprasFailed.length;
    if (total === 0) return null;

    httpFailed.forEach(item => {
      const label = etiquetaOperacion(item.method, item.tabla);
      errores.push(item.error_msg ? `${label}: ${item.error_msg}` : label);
    });
    pesajesFailed.forEach(item => {
      errores.push(`Pesaje ${item.chapeta_ref || ''}: ${item.error_msg || 'No se pudo subir'}`.trim());
    });
    aforosFailed.forEach(item => {
      errores.push(`Aforo ${item.potrero_nombre_ref || ''}: ${item.error_msg || 'No se pudo subir'}`.trim());
    });
    comprasFailed.forEach(item => {
      errores.push(`Compra (${item.fechaIngreso}): ${item.error_msg || 'No se pudo subir'}`);
    });

    return {
      fecha: new Date().toISOString(),
      lineas: [{ etiqueta: 'Pendientes con error', cantidad: total, ok: false }],
      exitosos: 0,
      fallidos: total,
      errores,
    };
  } catch {
    return null;
  }
}

/**
 * Pop-up nativo (<dialog>) que aparece cuando vuelve la señal y se termina de subir a la nube
 * todo lo que se hizo sin conexión, o al inspeccionar errores pendientes.
 */
export default function SyncSummaryModal() {
  const [resumen, setResumen] = useState<ResumenSincronizacion | null>(null);
  const [procesandoAccion, setProcesandoAccion] = useState(false);
  const [confirmandoDescarte, setConfirmandoDescarte] = useState(false);
  const { isOnline, conteoFallidosTotal, reintentarFallidos, descartarFallidos } = useConnection();

  const cerrarModal = () => {
    if (procesandoAccion) return;
    setConfirmandoDescarte(false);
    setResumen(null);
  };

  const dialogProps = useModalDialog(Boolean(resumen), cerrarModal, !procesandoAccion, procesandoAccion);

  useEffect(() => {
    const onResumen = (e: Event) => {
      setConfirmandoDescarte(false);
      setResumen((e as CustomEvent<ResumenSincronizacion>).detail);
    };
    const onOpenErrors = async () => {
      const fallidosResumen = await cargarResumenFallidosLocales();
      if (fallidosResumen) {
        setConfirmandoDescarte(false);
        setResumen(fallidosResumen);
      }
    };
    window.addEventListener(SYNC_EVENT_NAME, onResumen);
    window.addEventListener(OPEN_SYNC_ERRORS_EVENT, onOpenErrors);
    return () => {
      window.removeEventListener(SYNC_EVENT_NAME, onResumen);
      window.removeEventListener(OPEN_SYNC_ERRORS_EVENT, onOpenErrors);
    };
  }, []);

  const hayErrores = Boolean(resumen && (resumen.fallidos > 0 || conteoFallidosTotal > 0));
  const exitosas = resumen ? resumen.lineas.filter(l => l.ok) : [];
  const fallidas = resumen ? resumen.lineas.filter(l => !l.ok) : [];
  const hora = resumen
    ? new Date(resumen.fecha).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
    : '';

  const handleReintentar = async () => {
    setProcesandoAccion(true);
    setConfirmandoDescarte(false);
    setResumen(null);
    try {
      await reintentarFallidos();
    } finally {
      setProcesandoAccion(false);
    }
  };

  const handleDescartar = async () => {
    if (!confirmandoDescarte) {
      setConfirmandoDescarte(true);
      return;
    }
    setProcesandoAccion(true);
    try {
      await descartarFallidos();
      setConfirmandoDescarte(false);
      setResumen(null);
    } finally {
      setProcesandoAccion(false);
    }
  };

  return (
    <dialog
      {...dialogProps}
      aria-labelledby="sync-resumen-titulo"
      className={`sync-summary-dialog ${hayErrores ? 'sync-summary-dialog--error' : ''}`}
    >
      {resumen && (
        <div className="sync-summary-body">
          <button
            type="button"
            onClick={cerrarModal}
            aria-label="Cerrar"
            className="sync-summary-close-btn"
            disabled={procesandoAccion}
          >
            <X size={20} aria-hidden="true" />
          </button>

          <div className="sync-summary-header">
            <CloudUpload
              size={40}
              aria-hidden="true"
              color={hayErrores ? 'var(--secondary)' : 'var(--success)'}
            />
            <h2 id="sync-resumen-titulo" className="sync-summary-title">
              {resumen.exitosos > 0 ? 'Información sincronizada' : 'Registros pendientes de sincronizar'}
            </h2>
            <p className="sync-summary-subtitle">
              {resumen.exitosos > 0
                ? `Volvió la señal y se subió a la nube lo que hiciste sin conexión (${hora}).`
                : `Detalle de la cola local (${hora}).`}
            </p>
          </div>

          {exitosas.length > 0 && (
            <ul className="sync-summary-list">
              {exitosas.map((l, i) => (
                <li key={i} className="sync-summary-item">
                  <CheckCircle2 size={18} color="var(--success)" aria-hidden="true" />
                  <span className="sync-summary-item-label">{l.etiqueta}</span>
                  <b>{l.cantidad}</b>
                </li>
              ))}
            </ul>
          )}

          {(fallidas.length > 0 || resumen.errores.length > 0) && (
            <div className="sync-summary-errors">
              <div className="sync-summary-errors-title">
                <AlertTriangle size={18} aria-hidden="true" />
                <span>No se pudieron subir ({resumen.fallidos || conteoFallidosTotal})</span>
              </div>
              <ul className="sync-summary-errors-list">
                {resumen.errores.map((m, i) => <li key={i}>{m}</li>)}
                {resumen.errores.length === 0 && fallidas.map((l, i) => <li key={i}>{l.etiqueta}: {l.cantidad}</li>)}
              </ul>
              <p className="sync-summary-errors-hint">
                Puedes reintentar cuando tengas buena conexión o descartarlos si ya los corregiste manualmente.
              </p>
            </div>
          )}

          <div className="sync-summary-actions">
            {hayErrores && (
              <div className="sync-summary-error-actions">
                <button
                  type="button"
                  onClick={handleReintentar}
                  disabled={procesandoAccion || !isOnline}
                  className="sync-summary-btn sync-summary-btn--retry"
                >
                  <RefreshCw size={16} aria-hidden="true" />
                  <span>{isOnline ? 'Reintentar fallidos' : 'Sin señal para reintentar'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDescartar}
                  disabled={procesandoAccion}
                  className={`sync-summary-btn ${confirmandoDescarte ? 'sync-summary-btn--discard-confirm' : 'sync-summary-btn--discard'}`}
                >
                  <Trash2 size={16} aria-hidden="true" />
                  <span>{confirmandoDescarte ? 'Confirmar descarte' : 'Descartar errores'}</span>
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={cerrarModal}
              disabled={procesandoAccion}
              className="sync-summary-btn sync-summary-btn--primary"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
