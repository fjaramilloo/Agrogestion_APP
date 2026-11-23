import { useEffect, useRef, useState } from 'react';
import { Download, Printer, X } from 'lucide-react';
import { useFeedback } from '../contexts/UiFeedbackContext';
import { exportElementToPdf } from '../utils/exportPdf';
import './ReportPrintShell.css';

interface ReportPrintShellProps {
    variant: 'letter' | 'compact';
    pageMargin?: string;
    printLabel?: string;
    documentTitle?: string;
    sheetClassName?: string;
    onClose: () => void;
    children: React.ReactNode;
}

export function ReportPrintShell({
    variant,
    pageMargin = '15mm',
    printLabel = 'Imprimir (Carta)',
    documentTitle,
    sheetClassName = '',
    onClose,
    children,
}: ReportPrintShellProps) {
    const sheetRef = useRef<HTMLDivElement>(null);
    const { showAlert } = useFeedback();
    const [exportingPdf, setExportingPdf] = useState(false);

    useEffect(() => {
        if (!documentTitle) return;
        const originalTitle = document.title;
        document.title = documentTitle;
        return () => {
            document.title = originalTitle;
        };
    }, [documentTitle]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const handlePrint = () => {
        if (documentTitle) {
            document.title = documentTitle;
        }
        window.print();
    };

    const handleDownloadPdf = async () => {
        if (!sheetRef.current || exportingPdf) return;
        setExportingPdf(true);
        try {
            const baseName = (documentTitle || 'Informe_AgroGestion')
                .trim()
                .replace(/[\\/:*?"<>|]/g, '-')
                .replace(/\s+/g, '_');
            const captureWidth = variant === 'letter' ? 820 : 880;
            await exportElementToPdf(sheetRef.current, {
                filename: `${baseName}.pdf`,
                backgroundColor: '#FFFFFF',
                format: 'JPEG',
                quality: 0.94,
                multiPage: true,
                windowWidth: Math.max(captureWidth + 80, 960),
                ignoreElements: (el) => el.classList?.contains('rps-no-print'),
                onclone: (_clonedDoc, clonedEl) => {
                    clonedEl.style.width = `${captureWidth}px`;
                    clonedEl.style.maxWidth = 'none';
                    clonedEl.style.minHeight = 'auto';
                    clonedEl.style.boxShadow = 'none';
                    clonedEl.style.borderRadius = '0';
                    clonedEl.style.padding = '24px';
                },
            });
        } catch (err) {
            console.error('[ReportPrintShell] Error generando PDF:', err);
            await showAlert('No se pudo generar el archivo PDF. Intenta usar "Imprimir" si el problema persiste.', {
                title: 'Error al generar PDF',
                variant: 'error',
            });
        } finally {
            setExportingPdf(false);
        }
    };

    return (
        <div className="rps-overlay" role="dialog" aria-modal="true" aria-label={documentTitle || 'Vista previa de impresión'}>
            <style>{`@media print { @page { size: letter; margin: ${pageMargin}; } }`}</style>
            <div ref={sheetRef} className={`rps-sheet rps-sheet--${variant}${sheetClassName ? ` ${sheetClassName}` : ''}`}>
                <div className="rps-no-print rps-actions">
                    <button type="button" onClick={handleDownloadPdf} disabled={exportingPdf} className="rps-btn-pdf">
                        <Download size={18} aria-hidden="true" />
                        <span>{exportingPdf ? 'Generando...' : 'Descargar PDF'}</span>
                    </button>
                    <button type="button" onClick={handlePrint} className="rps-btn-print">
                        <Printer size={18} aria-hidden="true" />
                        <span>{printLabel}</span>
                    </button>
                    <button type="button" onClick={onClose} className="rps-btn-close" aria-label="Cerrar vista previa">
                        <X size={20} aria-hidden="true" />
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}
