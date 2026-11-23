import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export interface PendingPdfAction {
    id: number;
    blobUrl: string;
    filename: string;
    mimeType: string;
    file: File | null;
    canShareFile: boolean;
}

type PdfActionListener = (action: PendingPdfAction | null) => void;

let currentPendingPdfAction: PendingPdfAction | null = null;
const pdfActionListeners = new Set<PdfActionListener>();

function emitPdfAction(action: PendingPdfAction | null) {
    currentPendingPdfAction = action;
    pdfActionListeners.forEach((listener) => listener(action));
}

export function subscribePdfAction(listener: PdfActionListener): () => void {
    pdfActionListeners.add(listener);
    if (currentPendingPdfAction) {
        listener(currentPendingPdfAction);
    }
    return () => {
        pdfActionListeners.delete(listener);
    };
}

export function closePdfAction(actionToClose?: PendingPdfAction | null) {
    const target = actionToClose ?? currentPendingPdfAction;
    if (target?.blobUrl) {
        setTimeout(() => {
            try {
                URL.revokeObjectURL(target.blobUrl);
            } catch {}
        }, 5000);
    }
    emitPdfAction(null);
}

function isMobileOrWebView(): boolean {
    if (typeof window === 'undefined') return false;
    const isCapacitorNative = Boolean((window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());
    const ua = navigator.userAgent || '';
    const isMobileUa = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
    const isIpadOs = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    const isStandalone = Boolean(
        window.matchMedia?.('(display-mode: standalone)')?.matches ||
        (navigator as { standalone?: boolean }).standalone
    );
    return isCapacitorNative || isMobileUa || isIpadOs || isStandalone;
}

function triggerAnchorDownload(blobUrl: string, filename: string, revokeDelayMs = 60000) {
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    link.rel = 'noopener noreferrer';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    if (revokeDelayMs > 0) {
        setTimeout(() => {
            try {
                URL.revokeObjectURL(blobUrl);
            } catch {}
        }, revokeDelayMs);
    }
}

export async function deliverFileBlob(
    blob: Blob,
    filename: string,
    mimeType = 'application/pdf'
): Promise<void> {
    const blobUrl = URL.createObjectURL(blob);

    if (!isMobileOrWebView()) {
        triggerAnchorDownload(blobUrl, filename, 60000);
        return;
    }

    let file: File | null = null;
    let canShareFile = false;
    try {
        file = new File([blob], filename, { type: mimeType });
        canShareFile =
            typeof navigator.share === 'function' &&
            typeof navigator.canShare === 'function' &&
            navigator.canShare({ files: [file] });
    } catch {
        file = null;
        canShareFile = false;
    }

    // Intentar hoja nativa de compartir (iOS / Android) mientras el gesto siga activo
    if (canShareFile && file) {
        try {
            await navigator.share({ files: [file], title: filename });
            setTimeout(() => {
                try {
                    URL.revokeObjectURL(blobUrl);
                } catch {}
            }, 60000);
            return;
        } catch (err: any) {
            // Si el usuario canceló manualmente la hoja de compartir, no abrir modal extra
            if (err?.name === 'AbortError') {
                setTimeout(() => {
                    try {
                        URL.revokeObjectURL(blobUrl);
                    } catch {}
                }, 5000);
                return;
            }
            // Si expiró el gesto (NotAllowedError tras async html2canvas) u otro bloqueo, caer al modal interactivo
        }
    }

    // Mostrar diálogo con tap directo (Compartir, Abrir en visor PDF o Descargar)
    emitPdfAction({
        id: Date.now(),
        blobUrl,
        filename,
        mimeType,
        file,
        canShareFile,
    });
}

export async function deliverPdfDocument(doc: jsPDF, filename: string): Promise<void> {
    const safeFilename = filename.toLowerCase().endsWith('.pdf') ? filename : `${filename}.pdf`;
    const blob = doc.output('blob');
    await deliverFileBlob(blob, safeFilename, 'application/pdf');
}

export function splitIntoColumns<T>(items: T[], columns = 3): { itemsPerCol: number; columnData: T[][] } {
    const safeColumns = Math.max(1, columns);
    const itemsPerCol = Math.ceil(items.length / safeColumns);
    const columnData = Array.from({ length: safeColumns }, (_, colIdx) =>
        items.slice(colIdx * itemsPerCol, (colIdx + 1) * itemsPerCol)
    );
    return { itemsPerCol, columnData };
}

export interface CaptureElementOptions {
    backgroundColor: string;
    scale?: number;
    windowWidth?: number;
    delayMs?: number;
    format?: 'PNG' | 'JPEG';
    quality?: number;
    ignoreElements?: (element: Element) => boolean;
    onclone?: (clonedDoc: Document, clonedElement: HTMLElement) => void;
}

const MAX_MOBILE_CANVAS_PIXELS = 11_000_000;

export async function captureElementCanvas(
    element: HTMLElement,
    options: CaptureElementOptions
) {
    const {
        backgroundColor,
        scale = 2,
        windowWidth,
        delayMs = 0,
        format = 'PNG',
        quality = 0.95,
        ignoreElements,
        onclone,
    } = options;

    if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    const estWidth = Math.max(element.scrollWidth || element.clientWidth || 800, windowWidth || 0);
    const estHeight = Math.max(element.scrollHeight || element.clientHeight || 800, 1);
    let safeScale = scale;
    const totalPixelsAtRequestedScale = estWidth * estHeight * scale * scale;
    if (totalPixelsAtRequestedScale > MAX_MOBILE_CANVAS_PIXELS) {
        safeScale = Math.max(
            1,
            Number(Math.sqrt(MAX_MOBILE_CANVAS_PIXELS / (estWidth * estHeight)).toFixed(2))
        );
    }

    const canvas = await html2canvas(element, {
        scale: safeScale,
        useCORS: true,
        backgroundColor,
        logging: false,
        ...(windowWidth ? { windowWidth } : {}),
        ...(ignoreElements ? { ignoreElements } : {}),
        ...(onclone ? { onclone } : {}),
    });

    const mime = format === 'JPEG' ? 'image/jpeg' : 'image/png';
    const imgData =
        format === 'JPEG' ? canvas.toDataURL(mime, quality) : canvas.toDataURL(mime);

    return { canvas, imgData };
}

export interface ExportElementToPdfOptions extends CaptureElementOptions {
    filename: string;
    multiPage?: boolean;
}

export async function exportElementToPdf(
    element: HTMLElement,
    options: ExportElementToPdfOptions
) {
    const { filename, multiPage = false, format = 'PNG', ...captureOptions } = options;
    const { canvas, imgData } = await captureElementCanvas(element, {
        ...captureOptions,
        format,
    });

    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const imgHeight = (canvas.height * pdfWidth) / canvas.width;

    if (!multiPage || imgHeight <= pdfHeight) {
        pdf.addImage(imgData, format, 0, 0, pdfWidth, imgHeight);
    } else {
        const pageHeightPx = (canvas.width * pdfHeight) / pdfWidth;
        const mime = format === 'JPEG' ? 'image/jpeg' : 'image/png';
        let yOffset = 0;

        while (yOffset < canvas.height) {
            const pageCanvas = document.createElement('canvas');
            pageCanvas.width = canvas.width;
            pageCanvas.height = Math.min(pageHeightPx, canvas.height - yOffset);
            const ctx = pageCanvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(
                    canvas,
                    0,
                    yOffset,
                    canvas.width,
                    pageCanvas.height,
                    0,
                    0,
                    canvas.width,
                    pageCanvas.height
                );
            }
            const pageImg =
                format === 'JPEG'
                    ? pageCanvas.toDataURL(mime, captureOptions.quality ?? 0.95)
                    : pageCanvas.toDataURL(mime);
            const pageImgHeight = (pageCanvas.height * pdfWidth) / canvas.width;
            if (yOffset > 0) pdf.addPage();
            pdf.addImage(pageImg, format, 0, 0, pdfWidth, pageImgHeight);
            yOffset += pageHeightPx;
        }
    }

    await deliverPdfDocument(pdf, filename);
}
