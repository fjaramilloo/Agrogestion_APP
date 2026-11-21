import { useEffect } from 'react';
import { Printer, X } from 'lucide-react';
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

    return (
        <div className="rps-overlay" role="dialog" aria-modal="true" aria-label={documentTitle || 'Vista previa de impresión'}>
            <style>{`@media print { @page { size: letter; margin: ${pageMargin}; } }`}</style>
            <div className={`rps-sheet rps-sheet--${variant}${sheetClassName ? ` ${sheetClassName}` : ''}`}>
                <div className="rps-no-print rps-actions">
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
