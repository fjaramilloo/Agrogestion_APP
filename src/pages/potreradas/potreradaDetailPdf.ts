import { format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../../lib/supabase';
import { captureElementCanvas, deliverPdfDocument } from '../../utils/exportPdf';
import {
    toDisplayValue,
    toStorageValue,
    getUnidadLabel,
    getModoLabel,
    getGmpRgb,
    type ModoGanancia
} from '../../utils/ganancia';
import type { AnimalPotrero, PotreradaDetailData } from './types';

interface ExportPotreradaPdfParams {
    fincaId: string | null;
    detailData: PotreradaDetailData;
    sortedAnimals: AnimalPotrero[];
    chartsElement: HTMLDivElement | null;
    modoGanancia: ModoGanancia;
    umbralMedio: number;
    umbralAlto: number;
}

export async function exportarDetallePotreradaPdf({
    fincaId,
    detailData,
    sortedAnimals,
    chartsElement,
    modoGanancia,
    umbralMedio,
    umbralAlto
}: ExportPotreradaPdfParams): Promise<void> {
    const doc = new jsPDF('l', 'mm', 'letter');

    const { data: configKpi } = await supabase
        .from('configuracion_kpi')
        .select('precio_venta_promedio, costo_mensual_animal, participacion_utilidad')
        .eq('id_finca', fincaId)
        .single();

    const precioVenta = parseFloat(configKpi?.precio_venta_promedio as any) || 0;
    const costoMensual = parseFloat(configKpi?.costo_mensual_animal as any) || 0;
    const participacion = parseFloat(configKpi?.participacion_utilidad as any) || 0.6;
    const peKgMes = precioVenta > 0 ? (costoMensual / participacion) / precioVenta : 0;

    const p = detailData.potrerada;
    const fechaDoc = format(new Date(), 'dd/MM/yyyy');
    const marginX = 14;
    let currentY = 18;

    const etapaStr = p.etapa || 'N/A';
    const headerBoxW = doc.internal.pageSize.width - (marginX * 2);
    const headerBoxH = 20;

    doc.setFillColor(252, 253, 254);
    doc.setDrawColor(220, 224, 228);
    doc.setLineWidth(0.3);
    doc.roundedRect(marginX, currentY - 6, headerBoxW, headerBoxH, 2, 2, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(60, 60, 60);

    const textPadding = 6;
    const topRowY = currentY + 1;
    const bottomRowY = currentY + 9;

    doc.setFont('helvetica', 'bold');
    doc.text('Finca:', marginX + textPadding, topRowY);
    doc.setFont('helvetica', 'normal');
    doc.text(detailData.fincaNombre, marginX + textPadding + 13, topRowY);

    doc.setFont('helvetica', 'bold');
    doc.text('Fecha:', doc.internal.pageSize.width - marginX - textPadding - 35, topRowY);
    doc.setFont('helvetica', 'normal');
    doc.text(fechaDoc, doc.internal.pageSize.width - marginX - textPadding, topRowY, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.text('Lote:', marginX + textPadding, bottomRowY);
    doc.setFont('helvetica', 'normal');
    doc.text(p.nombre, marginX + textPadding + 11, bottomRowY);

    doc.setFont('helvetica', 'bold');
    doc.text('Etapa:', doc.internal.pageSize.width - marginX - textPadding - 35, bottomRowY);
    doc.setFont('helvetica', 'normal');
    doc.text(etapaStr, doc.internal.pageSize.width - marginX - textPadding, bottomRowY, { align: 'right' });

    currentY += 22;

    const boxesPerRow = 3;
    const boxWidth = 78;
    const boxHeight = 22;
    const rowGap = 5;
    const totalWidthAvailable = doc.internal.pageSize.width - (marginX * 2);
    const colGap = (totalWidthAvailable - (boxWidth * boxesPerRow)) / (boxesPerRow - 1);

    const drawBox = (x: number, y: number, title: string, value: string, subtitle: string, valueColor: number[]) => {
        doc.setFillColor(252, 253, 254);
        doc.setDrawColor(220, 224, 228);
        doc.setLineWidth(0.3);
        doc.roundedRect(x, y, boxWidth, boxHeight, 2, 2, 'FD');

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(130);
        doc.text(title.toUpperCase(), x + boxWidth / 2, y + 6, { align: 'center' });

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(valueColor[0], valueColor[1], valueColor[2]);
        doc.text(value, x + boxWidth / 2, y + 15, { align: 'center' });

        if (subtitle) {
            doc.setFontSize(7);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(150);
            doc.text(subtitle, x + boxWidth / 2, y + 19, { align: 'center' });
        }
    };

    const ultimoGmpLote = detailData.gmpPromedioGrupo;
    const historicoGmpLote = p.gmpAcumulado ?? detailData.gmpPromedioGrupo;

    const lastGmpColor = getGmpRgb(ultimoGmpLote, umbralMedio, umbralAlto);
    const acumGmpColor = getGmpRgb(historicoGmpLote, umbralMedio, umbralAlto);

    let xPos = marginX;
    drawBox(xPos, currentY, 'TOTAL ANIMALES', `${detailData.animales.length} Cabezas`, 'Población actual', [40, 40, 40]);
    xPos += boxWidth + colGap;

    const diasTxt = detailData.diasPotreroActual !== null ? `${detailData.diasPotreroActual} Días` : '-';
    drawBox(xPos, currentY, 'TIEMPO EN POTRERO', diasTxt, detailData.potreroActual, [40, 40, 40]);
    xPos += boxWidth + colGap;

    const numAnimales = detailData.animales.length;
    const avgGmp = ultimoGmpLote;
    const hasArea = Boolean(detailData.areaTotalSistema && detailData.areaTotalSistema > 0);
    const areaSistema = hasArea ? detailData.areaTotalSistema! : 1;
    const kilosHaMes = hasArea ? (numAnimales * avgGmp) / areaSistema : 0;
    const cargaGlobalStr = hasArea ? (numAnimales / areaSistema).toFixed(2) : '-';
    drawBox(xPos, currentY, 'PRODUCTIVIDAD', hasArea ? `${kilosHaMes.toFixed(1)} kg/Ha/Mes` : 'N/A', hasArea ? `Carga: ${cargaGlobalStr} Cab/Ha` : 'Sin área asignada', [40, 40, 40]);

    currentY += boxHeight + rowGap;

    xPos = marginX;
    drawBox(xPos, currentY, `${getModoLabel(modoGanancia)} HISTÓRICO LOTE`, `${toDisplayValue(historicoGmpLote, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)} ${getUnidadLabel(modoGanancia)}`, 'ACUMULADO', acumGmpColor);
    xPos += boxWidth + colGap;

    drawBox(xPos, currentY, `ÚLTIMO ${getModoLabel(modoGanancia)}`, `${toDisplayValue(ultimoGmpLote, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)} ${getUnidadLabel(modoGanancia)}`, 'Muestra más reciente', lastGmpColor);
    xPos += boxWidth + colGap;

    drawBox(xPos, currentY, 'PUNTO DE EQUILIBRIO', `${toDisplayValue(peKgMes, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)} ${getUnidadLabel(modoGanancia)}`, `${getModoLabel(modoGanancia)} por animal`, [40, 40, 40]);

    currentY += boxHeight + 12;

    if (chartsElement && detailData.history.length > 1) {
        const exportBg = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#1E1E1E';
        const { canvas, imgData } = await captureElementCanvas(chartsElement, {
            backgroundColor: exportBg,
        });

        const imgWidth = 250;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        if (currentY + imgHeight > 200) {
            doc.addPage();
            currentY = 20;
        }

        doc.addImage(imgData, 'PNG', marginX, currentY, imgWidth, imgHeight);
    }

    const tableHead: any[][] = [];
    if (p.etapa === 'levante') {
        const fechaIngreso = sortedAnimals[0]?.fechaIngresoEtapa
            ? format(new Date(sortedAnimals[0].fechaIngresoEtapa + 'T12:00:00'), 'dd/MM/yy')
            : '';
        tableHead.push(['#', 'Chapeta', 'Propietario', `Peso Compra\n${fechaIngreso}`, `Peso Ingreso\n${fechaIngreso}`, 'Peso Actual']);
    } else {
        const fechaIngreso = sortedAnimals[0]?.fechaIngresoEtapa
            ? format(new Date(sortedAnimals[0].fechaIngresoEtapa + 'T12:00:00'), 'dd/MM/yy')
            : '';
        tableHead.push(['#', 'Chapeta', 'Propietario', `Peso Ingreso\n${fechaIngreso}`, 'Peso Actual']);
    }

    const ingresoFecha = sortedAnimals[0]?.fechaIngresoEtapa || null;
    const activeSortedDates = [...detailData.fechasColumnas]
        .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
        .filter(fecha => fecha !== ingresoFecha && detailData.animales.some(a => a.pesajesFiltrados && a.pesajesFiltrados[fecha] && a.fechaIngresoEtapa !== fecha));

    activeSortedDates.forEach(fecha => {
        tableHead[0].push(`Pesaje ${format(new Date(fecha + 'T12:00:00'), 'dd/MM/yy')}`);
    });
    tableHead[0].push(`${getModoLabel(modoGanancia)} Prom. (${getUnidadLabel(modoGanancia)})`);

    const tableBody = sortedAnimals.map((a, idx) => {
        const row: any[] = [
            idx + 1,
            `${a.numero_chapeta}${a.estado === 'vendido' ? ' (Vendido)' : ''}`,
            a.nombre_propietario || '-',
        ];

        if (p.etapa === 'levante') {
            row.push(a.peso_compra ? `${Math.round(a.peso_compra)} kg` : '-');
        }

        row.push(a.pesoIngresoEtapa ? `${Math.round(a.pesoIngresoEtapa)} kg` : '-');
        row.push(a.pesoActual ? `${Math.round(a.pesoActual)} kg` : '-');

        activeSortedDates.forEach(fecha => {
            const isEntryDate = a.fechaIngresoEtapa === fecha;
            row.push(a.pesajesFiltrados?.[fecha] && !isEntryDate ? `${Math.round(a.pesajesFiltrados[fecha])} kg` : '-');
        });

        row.push(a.gmp ? toDisplayValue(a.gmp, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1) : '-');
        return row;
    });

    const colCount = tableHead[0].length;
    const rowTotales = Array(colCount).fill('');
    rowTotales[2] = 'TOTALES:';

    let colIdx = 3;
    if (p.etapa === 'levante') {
        const totalCompra = detailData.animales.reduce((sum, a) => sum + (a.peso_compra || 0), 0);
        rowTotales[colIdx] = totalCompra > 0 ? `${Math.round(totalCompra).toLocaleString('es-CO')} kg` : '-';
        colIdx++;
    }
    const totalIngreso = detailData.animales.reduce((sum, a) => sum + (a.pesoIngresoEtapa || 0), 0);
    rowTotales[colIdx] = totalIngreso > 0 ? `${Math.round(totalIngreso).toLocaleString('es-CO')} kg` : '-';
    colIdx++;
    const totalActual = detailData.animales.reduce((sum, a) => sum + (a.pesoActual || 0), 0);
    rowTotales[colIdx] = totalActual > 0 ? `${Math.round(totalActual).toLocaleString('es-CO')} kg` : '-';
    colIdx++;
    activeSortedDates.forEach(fecha => {
        const total = detailData.animales.reduce((acc, a) => acc + (a.pesajesFiltrados?.[fecha] || 0), 0);
        rowTotales[colIdx] = total > 0 ? `${Math.round(total).toLocaleString('es-CO')} kg` : '-';
        colIdx++;
    });

    const rowPromedios = Array(colCount).fill('');
    rowPromedios[2] = 'PROMEDIOS:';
    let promIdx = 3;
    if (p.etapa === 'levante') {
        const valid = detailData.animales.filter(a => a.peso_compra);
        const prom = valid.length > 0 ? valid.reduce((s, a) => s + (a.peso_compra || 0), 0) / valid.length : 0;
        rowPromedios[promIdx] = prom > 0 ? `${Math.round(prom)} kg` : '-';
        promIdx++;
    }
    const validIng = detailData.animales.filter(a => a.pesoIngresoEtapa);
    const promIng = validIng.length > 0 ? validIng.reduce((s, a) => s + (a.pesoIngresoEtapa || 0), 0) / validIng.length : 0;
    rowPromedios[promIdx] = promIng > 0 ? `${Math.round(promIng)} kg` : '-';
    promIdx++;
    const promActual = detailData.animales.length > 0 ? totalActual / detailData.animales.length : 0;
    rowPromedios[promIdx] = promActual > 0 ? `${Math.round(promActual)} kg` : '-';
    promIdx++;
    activeSortedDates.forEach(fecha => {
        const validAnimals = detailData.animales.filter(a => a.pesajesFiltrados?.[fecha]);
        const total = validAnimals.reduce((acc, a) => acc + (a.pesajesFiltrados![fecha] || 0), 0);
        const avg = validAnimals.length > 0 ? total / validAnimals.length : 0;
        rowPromedios[promIdx] = avg > 0 ? `${Math.round(avg)} kg` : '-';
        promIdx++;
    });

    doc.addPage();
    currentY = 20;

    autoTable(doc, {
        startY: currentY,
        head: tableHead,
        body: tableBody,
        foot: [rowTotales, rowPromedios],
        theme: 'striped',
        headStyles: { fillColor: [46, 125, 50], fontSize: 8, halign: 'center' },
        footStyles: { fillColor: [240, 240, 240], textColor: [40, 40, 40], fontSize: 8, fontStyle: 'bold' },
        styles: { fontSize: 7, halign: 'center', valign: 'middle' },
        columnStyles: {
            0: { cellWidth: 10 },
            1: { halign: 'left', fontStyle: 'bold' },
            2: { halign: 'left' }
        },
        didParseCell: function(data) {
            if (data.section === 'body' && data.column.index === tableHead[0].length - 1) {
                const val = parseFloat(data.cell.raw as string);
                if (!isNaN(val)) {
                    const gmpEquivalente = toStorageValue(val, modoGanancia);
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.textColor = getGmpRgb(gmpEquivalente, umbralMedio, umbralAlto);
                }
            }
            if (data.section === 'foot' && data.row.index === 1) {
                data.cell.styles.fillColor = [232, 245, 233];
                data.cell.styles.textColor = [46, 125, 50];
            }
        }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text('Agrogestión v3.0 - Página 1', 260, finalY, { align: 'right' });

    await deliverPdfDocument(doc, `Informe_Lote_${p.nombre.replace(/\s+/g, '_')}_${format(new Date(), 'dd-MM-yyyy')}.pdf`);
}
