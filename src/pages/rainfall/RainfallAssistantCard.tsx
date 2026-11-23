import { Lock, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { DiagnosticoClimatico } from '../../services/climateAiService';
import { type PerfilClimatico, generarRecomendacion } from '../../utils/climateRegions';

type RecomendacionHidro = ReturnType<typeof generarRecomendacion>;

interface RainfallKpisSummary {
    diasSecos: number;
    mm30dias: number;
    mm15dias: number;
    mm7dias: number;
    diasSecosMes: number;
    diasTranscurridos: number;
}

interface RainfallAssistantCardProps {
    esDemo: boolean;
    perfil: PerfilClimatico;
    accentPurple: string;
    diagnosticoIA: DiagnosticoClimatico | null;
    recomendacion: RecomendacionHidro | null;
    kpis: RainfallKpisSummary | null;
    analysisLoading: boolean;
    analysisError: string | null;
    onReanalizar: () => void;
}

export default function RainfallAssistantCard({
    esDemo,
    perfil,
    accentPurple,
    diagnosticoIA,
    recomendacion,
    kpis,
    analysisLoading,
    analysisError,
    onReanalizar
}: RainfallAssistantCardProps) {
    const navigate = useNavigate();

    if (esDemo) {
        return (
            <div style={{
                borderRadius: '12px', marginBottom: '28px', overflow: 'hidden',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                boxShadow: 'var(--shadow-card)',
            }}>
                <div style={{
                    padding: '28px', display: 'flex', flexDirection: 'column', alignItems: 'center',
                    textAlign: 'center', gap: '12px',
                    background: 'var(--surface-subtle)',
                }}>
                    <div style={{ padding: '14px', borderRadius: '50%', background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)' }}>
                        <Lock size={28} color={accentPurple} />
                    </div>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-main)' }}>Asistente Zootécnico IA</h3>
                    <p style={{ color: 'var(--text-muted)', margin: 0, maxWidth: '420px', lineHeight: 1.6 }}>
                        Recomendaciones de manejo de pasturas y carga animal personalizadas para la <strong style={{ color: accentPurple }}>zona {perfil.zona}</strong>, disponibles en los planes <strong>Finca</strong> y <strong>Premium</strong>.
                    </p>
                    <button
                        className="btn btn-primary"
                        style={{ width: 'auto', padding: '10px 28px', marginTop: '4px', background: 'linear-gradient(135deg, #9333ea, #0284c7)', color: '#ffffff' }}
                        onClick={() => navigate('/suscripcion')}
                    >
                        Ver Planes
                    </button>
                </div>
            </div>
        );
    }

    const COLOR_MAP: Record<string, { bg: string; border: string; text: string; badge: string }> = {
        estres:           { bg: 'var(--error-soft-bg)',     border: 'var(--error-soft-border)',     text: 'var(--error)',     badge: 'var(--surface-subtle)' },
        excesoCritico:    { bg: 'var(--info-soft-bg)',      border: 'var(--info-soft-border)',      text: 'var(--info)',      badge: 'var(--surface-subtle)' },
        preAlerta:        { bg: 'var(--warning-soft-bg)',   border: 'var(--warning-soft-border)',   text: 'var(--warning)',   badge: 'var(--surface-subtle)' },
        excesoPreventivo: { bg: 'var(--info-soft-bg)',      border: 'var(--info-soft-border)',      text: 'var(--info)',      badge: 'var(--surface-subtle)' },
        oreo:             { bg: 'var(--success-soft-bg)',   border: 'var(--success-soft-border)',   text: 'var(--success)',   badge: 'var(--surface-subtle)' },
        transicion:       { bg: 'var(--secondary-soft-bg)', border: 'var(--secondary-soft-border)', text: 'var(--secondary)', badge: 'var(--surface-subtle)' },
        optima:           { bg: 'var(--success-soft-bg)',   border: 'var(--success-soft-border)',   text: 'var(--success)',   badge: 'var(--surface-subtle)' },
    };
    const LABEL_MAP: Record<string, string> = {
        estres: 'ALERTA ROJA – SEQUÍA', excesoCritico: 'ANEGAMIENTO CRÍTICO',
        preAlerta: 'PRE-ALERTA SEQUÍA', excesoPreventivo: 'ENCHARCAMIENTO PREVENTIVO',
        oreo: 'OREO ACTIVO', transicion: 'TRANSICIÓN', optima: 'CONDICIÓN ÓPTIMA',
    };

    const diag = diagnosticoIA;
    const recomLocal = recomendacion;
    const nivelActivo = diag?.nivel_alerta ?? recomLocal?.tipo ?? 'optima';
    const c = COLOR_MAP[nivelActivo] ?? COLOR_MAP.optima;
    const emojiActivo = diag?.emoji_estado ?? '✅';

    let resumen = (diag?.resumen_diagnostico?.trim()) ? diag.resumen_diagnostico : (recomLocal?.mensaje ?? '');
    if (nivelActivo !== 'optima' && (resumen.toLowerCase().includes('ideales') || resumen.toLowerCase().includes('condición hídrica óptima'))) {
        resumen = recomLocal?.mensaje ?? perfil.recomendaciones.lluviaAislada;
    }

    const impacto = diag?.impacto_pasturas ?? '';
    const recRotacion = diag?.recomendacion_rotacion ?? '';
    const recFertilizacion = diag?.recomendacion_fertilizacion ?? '';
    const recNutricion = diag?.recomendacion_nutricion ?? '';
    const estadoHidrico = diag?.estado_hidrico
        ? diag.estado_hidrico
        : (recomLocal?.lluviaAislada ? 'Lluvia Aislada – Déficit Hídrico Quincenal Activo' : LABEL_MAP[nivelActivo]);
    const bh15 = diag?.balance_hidrico_15d
        ?? (kpis ? parseFloat((kpis.mm15dias - 15 * perfil.et0DiariaNumerica).toFixed(1)) : null);
    const fuenteLabel = diag?.fuente === 'ia' ? '✨ IA' : '⚡ Motor Local';

    const FALLBACK_COLORS: Record<string, { bg: string; border: string; text: string; badge: string; emoji: string; label: string }> = {
        estres:           { bg: 'var(--error-soft-bg)',     border: 'var(--error-soft-border)',     text: 'var(--error)',     badge: 'var(--surface-subtle)', emoji: '🔴', label: 'ALERTA ROJA – SEQUÍA' },
        excesoCritico:    { bg: 'var(--info-soft-bg)',      border: 'var(--info-soft-border)',      text: 'var(--info)',      badge: 'var(--surface-subtle)', emoji: '🌊', label: 'ANEGAMIENTO CRÍTICO' },
        preAlerta:        { bg: 'var(--warning-soft-bg)',   border: 'var(--warning-soft-border)',   text: 'var(--warning)',   badge: 'var(--surface-subtle)', emoji: '🟡', label: 'PRE-ALERTA SEQUÍA' },
        excesoPreventivo: { bg: 'var(--info-soft-bg)',      border: 'var(--info-soft-border)',      text: 'var(--info)',      badge: 'var(--surface-subtle)', emoji: '💧', label: 'ENCHARCAMIENTO PREVENTIVO' },
        oreo:             { bg: 'var(--success-soft-bg)',   border: 'var(--success-soft-border)',   text: 'var(--success)',   badge: 'var(--surface-subtle)', emoji: '🌾', label: 'OREO ACTIVO – MANEJO TOPOGRÁFICO' },
        transicion:       { bg: 'var(--secondary-soft-bg)', border: 'var(--secondary-soft-border)', text: 'var(--secondary)', badge: 'var(--surface-subtle)', emoji: '🌤️', label: 'TRANSICIÓN' },
        optima:           { bg: 'var(--success-soft-bg)',   border: 'var(--success-soft-border)',   text: 'var(--success)',   badge: 'var(--surface-subtle)', emoji: '✅', label: 'CONDICIÓN ÓPTIMA' },
    };

    const fb = recomendacion ? (FALLBACK_COLORS[recomendacion.tipo] ?? FALLBACK_COLORS.optima) : null;
    const esExceso = recomendacion?.tipo === 'excesoCritico' || recomendacion?.tipo === 'excesoPreventivo';
    const esOreo = recomendacion?.tipo === 'oreo';

    return (
        <>
            <div
                className="rainfall-ia-card"
                style={{
                    background: c.bg, border: `1px solid ${c.border}`,
                }}
            >
                {/* Cabecera compacta */}
                <div className="rainfall-ia-header" style={{ borderBottom: `1px solid ${c.border}` }}>
                    <span style={{ fontSize: '1.3rem', lineHeight: 1 }} aria-hidden="true">{emojiActivo}</span>
                    <div className="rainfall-ia-meta">
                        <div className="rainfall-ia-meta-top">
                            <p className="rainfall-ia-title">
                                Asistente Zootécnico – {perfil.emoji} {perfil.zona}
                            </p>
                            <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', background: c.badge, border: `1px solid ${c.border}`, color: c.text, whiteSpace: 'nowrap' }}>
                                {LABEL_MAP[nivelActivo]}
                            </span>
                            <span className="rainfall-ia-source">{fuenteLabel}</span>
                        </div>
                        {bh15 !== null && (
                            <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {estadoHidrico} · Balance 15d: <span style={{ color: bh15 < 0 ? 'var(--warning)' : 'var(--success)', fontWeight: 600 }}>{bh15 > 0 ? '+' : ''}{bh15.toFixed(1)} mm</span>
                                {kpis && <> · {kpis.diasSecosMes}/{kpis.diasTranscurridos} días secos</>}
                            </p>
                        )}
                    </div>
                    <div className="rainfall-ia-actions">
                        <button
                            type="button"
                            className="rainfall-reanalizar-btn"
                            onClick={onReanalizar}
                            disabled={analysisLoading}
                            title="Solicitar análisis completo a la IA"
                            style={{
                                border: `1px solid ${c.border}`,
                                color: c.text,
                                opacity: analysisLoading ? 0.65 : 1,
                            }}
                        >
                            <RefreshCw size={14} className={analysisLoading ? 'rainfall-spin' : undefined} aria-hidden="true" />
                            {analysisLoading ? 'Analizando…' : 'Reanalizar'}
                        </button>
                        {analysisError && (
                            <span role="alert" style={{ fontSize: '0.7rem', color: 'var(--error)', maxWidth: '220px', lineHeight: 1.3 }}>
                                ⚠️ {analysisError}
                            </span>
                        )}
                    </div>
                </div>

                {/* Resumen e impacto */}
                <div style={{ padding: '10px 18px 8px' }}>
                    <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.55 }}>
                        {resumen}
                    </p>
                    {impacto && (
                        <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: '0.76rem', lineHeight: 1.4 }}>
                            {impacto}
                        </p>
                    )}
                </div>

                {/* Píldoras de acción */}
                {(recRotacion || recFertilizacion || recNutricion) && (
                    <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        {recRotacion && (
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '7px', background: 'var(--surface-subtle)', border: '1px solid var(--border-subtle)', borderRadius: '7px', padding: '7px 10px' }}>
                                <span style={{ fontSize: '0.85rem', flexShrink: 0 }}>🌾</span>
                                <p style={{ margin: 0, fontSize: '0.77rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                                    <strong style={{ color: 'var(--text-main)', fontWeight: 600 }}>Rotación:</strong> {recRotacion}
                                </p>
                            </div>
                        )}
                        {recFertilizacion && (
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '7px', background: 'var(--surface-subtle)', border: '1px solid var(--border-subtle)', borderRadius: '7px', padding: '7px 10px' }}>
                                <span style={{ fontSize: '0.85rem', flexShrink: 0 }}>⛔</span>
                                <p style={{ margin: 0, fontSize: '0.77rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                                    <strong style={{ color: 'var(--text-main)', fontWeight: 600 }}>Fertilización:</strong> {recFertilizacion}
                                </p>
                            </div>
                        )}
                        {recNutricion && (
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '7px', background: 'var(--surface-subtle)', border: '1px solid var(--border-subtle)', borderRadius: '7px', padding: '7px 10px' }}>
                                <span style={{ fontSize: '0.85rem', flexShrink: 0 }}>🧂</span>
                                <p style={{ margin: 0, fontSize: '0.77rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                                    <strong style={{ color: 'var(--text-main)', fontWeight: 600 }}>Nutrición:</strong> {recNutricion}
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Fallback: render del motor local cuando no hay diagnóstico IA todavía */}
            {!diagnosticoIA && recomendacion && fb && (
                <div style={{
                    borderRadius: '12px', marginBottom: '28px', padding: '20px 24px',
                    background: fb.bg, border: `1px solid ${fb.border}`,
                }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                        <div style={{ fontSize: '1.6rem', lineHeight: 1 }}>{fb.emoji}</div>
                        <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
                                <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-main)', fontSize: '0.95rem' }}>
                                    Asistente Zootécnico – {perfil.emoji} {perfil.zona}
                                </p>
                                <span style={{
                                    fontSize: '0.72rem', fontWeight: 700, padding: '2px 10px',
                                    borderRadius: '20px', letterSpacing: '0.5px',
                                    background: fb.badge, border: `1px solid ${fb.border}`, color: fb.text,
                                }}>
                                    {fb.label}
                                </span>
                            </div>
                            {kpis && (
                                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '10px' }}>
                                    {esOreo ? (
                                        <>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: 600 }}>
                                                🌾 Día {kpis.diasSecos} de {perfil.diasBufferPostExceso} de amortiguación hídrica
                                            </span>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                Lluvia previa: {kpis.mm7dias.toFixed(1)} mm (7d) / {kpis.mm30dias.toFixed(1)} mm (30d)
                                                {' · '}Estrés computado: 0 días (humedad retenida)
                                            </span>
                                        </>
                                    ) : esExceso ? (
                                        <>
                                            <span style={{ fontSize: '0.75rem', color: fb.text, fontWeight: 600 }}>
                                                🌧 {kpis.mm7dias.toFixed(1)} mm en 7 días
                                                {recomendacion.tipo === 'excesoCritico'
                                                    ? ` · Umbral crítico: ≥ ${perfil.exceso7dRoja} mm`
                                                    : ` · Umbral alerta: ≥ ${perfil.exceso7dAmarilla} mm`}
                                            </span>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                {kpis.mm30dias.toFixed(1)} mm en 30 días · Umbral mensual: {perfil.exceso30d} mm
                                            </span>
                                        </>
                                    ) : (
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                            {kpis.diasSecos > 0 ? `${kpis.diasSecos} días sin lluvia efectiva` : 'Lluvia efectiva reciente'}
                                            {' · '}{kpis.mm30dias.toFixed(1)} mm últimos 30 días
                                            {' · '}{kpis.mm7dias.toFixed(1)} mm últimos 7 días
                                        </span>
                                    )}
                                </div>
                            )}
                            <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.7, fontSize: '0.92rem' }}>
                                {recomendacion.mensaje}
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
