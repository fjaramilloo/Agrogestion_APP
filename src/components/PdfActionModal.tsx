import { useEffect, useState } from 'react';
import { Download, ExternalLink, FileText, Share2, X } from 'lucide-react';
import { useModalDialog } from '../hooks/useModalDialog';
import {
    closePdfAction,
    subscribePdfAction,
    type PendingPdfAction,
} from '../utils/exportPdf';

export default function PdfActionModal() {
    const [pendingAction, setPendingAction] = useState<PendingPdfAction | null>(null);
    const [sharing, setSharing] = useState(false);

    useEffect(() => {
        return subscribePdfAction((next) => {
            setPendingAction(next);
            setSharing(false);
        });
    }, []);

    const handleClose = () => {
        closePdfAction(pendingAction);
    };

    const dialogProps = useModalDialog(Boolean(pendingAction), handleClose, true, false);
    const isPdf = pendingAction?.mimeType === 'application/pdf';

    const handleShareClick = async () => {
        if (!pendingAction?.file || !pendingAction.canShareFile) return;
        setSharing(true);
        try {
            await navigator.share({
                files: [pendingAction.file],
                title: pendingAction.filename,
            });
            handleClose();
        } catch (err: any) {
            if (err?.name !== 'AbortError') {
                // Si el navegador rechaza el archivo en Share Sheet, permanecen Abrir y Descargar visibles
                console.warn('[PdfActionModal] Error compartiendo archivo:', err);
            }
        } finally {
            setSharing(false);
        }
    };

    return (
        <dialog
            {...dialogProps}
            aria-labelledby="pdf-action-title"
            style={{
                border: '1px solid var(--border-strong)',
                borderRadius: '16px',
                background: 'var(--bg-card)',
                color: 'var(--text-main)',
                maxWidth: '420px',
                width: 'calc(100% - 28px)',
                padding: 0,
                boxShadow: 'var(--shadow-popover)',
                overflow: 'hidden',
            }}
        >
            {pendingAction && (
                <div style={{ padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                            <div style={{
                                width: '40px',
                                height: '40px',
                                borderRadius: '10px',
                                background: 'var(--primary-soft-bg)',
                                border: '1px solid var(--primary-soft-border)',
                                color: 'var(--primary-light)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                            }}>
                                <FileText size={20} aria-hidden="true" />
                            </div>
                            <div style={{ minWidth: 0 }}>
                                <h3 id="pdf-action-title" style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-main)' }}>
                                    {isPdf ? 'Documento PDF listo' : 'Archivo listo'}
                                </h3>
                                <p style={{
                                    margin: '2px 0 0',
                                    fontSize: '0.78rem',
                                    color: 'var(--text-muted)',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                }}>
                                    {pendingAction.filename}
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={handleClose}
                            aria-label="Cerrar opciones de archivo"
                            style={{
                                width: '44px',
                                height: '44px',
                                borderRadius: '10px',
                                border: '1px solid var(--border-subtle)',
                                background: 'var(--surface-subtle)',
                                color: 'var(--text-muted)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                flexShrink: 0,
                                padding: 0,
                            }}
                        >
                            <X size={18} aria-hidden="true" />
                        </button>
                    </div>

                    <p style={{ margin: '0 0 16px', fontSize: '0.86rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                        Elige cómo quieres abrir o guardar el {isPdf ? 'PDF' : 'archivo'} en tu dispositivo:
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {pendingAction.canShareFile && (
                            <button
                                type="button"
                                onClick={handleShareClick}
                                disabled={sharing}
                                style={{
                                    width: '100%',
                                    minHeight: '48px',
                                    borderRadius: '10px',
                                    border: 'none',
                                    background: 'var(--primary)',
                                    color: 'var(--on-primary)',
                                    fontWeight: 700,
                                    fontSize: '0.92rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    cursor: 'pointer',
                                }}
                            >
                                <Share2 size={18} aria-hidden="true" />
                                {sharing ? 'Abriendo menú...' : 'Guardar en Archivos o Compartir'}
                            </button>
                        )}

                        {isPdf && (
                            <a
                                href={pendingAction.blobUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                    width: '100%',
                                    minHeight: '48px',
                                    borderRadius: '10px',
                                    border: '1px solid var(--info-soft-border)',
                                    background: 'var(--info-soft-bg)',
                                    color: 'var(--info)',
                                    fontWeight: 700,
                                    fontSize: '0.92rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    textDecoration: 'none',
                                    boxSizing: 'border-box',
                                }}
                            >
                                <ExternalLink size={18} aria-hidden="true" />
                                Abrir PDF en visor
                            </a>
                        )}

                        <a
                            href={pendingAction.blobUrl}
                            download={pendingAction.filename}
                            rel="noopener noreferrer"
                            style={{
                                width: '100%',
                                minHeight: '48px',
                                borderRadius: '10px',
                                border: '1px solid var(--border-strong)',
                                background: 'var(--surface-subtle)',
                                color: 'var(--text-main)',
                                fontWeight: 600,
                                fontSize: '0.92rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                textDecoration: 'none',
                                boxSizing: 'border-box',
                            }}
                        >
                            <Download size={18} aria-hidden="true" />
                            Descargar {isPdf ? 'PDF' : 'archivo'}
                        </a>
                    </div>
                </div>
            )}
        </dialog>
    );
}
