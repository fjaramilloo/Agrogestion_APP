import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

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
}

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
    } = options;

    if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    const canvas = await html2canvas(element, {
        scale,
        useCORS: true,
        backgroundColor,
        logging: false,
        ...(windowWidth ? { windowWidth } : {}),
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

    pdf.save(filename);
}
