import React from 'react';
import { ArrowRightLeft, Lock, Users, X } from 'lucide-react';
import {
  ZONA_META_BY_TIPO,
  type PotreroMapData,
  type ZonaAdicionalMapData,
} from './types';

interface MapHudAndDrawersProps {
  tipoLicencia: 'demo' | 'finca' | 'premium';
  userRole: 'administrador' | 'vaquero' | 'observador';
  gpsTracking: boolean;
  userLocation: { lat: number; lng: number; accuracy: number } | null;
  currentPaddock: PotreroMapData | null;
  currentSpecialZone: ZonaAdicionalMapData | null;
  selectedPotrero: PotreroMapData | null;
  selectedZona: ZonaAdicionalMapData | null;
  onSelectPotrero: (potrero: PotreroMapData | null) => void;
  onSelectZona: (zona: ZonaAdicionalMapData | null) => void;
  onMoveCattleToPotrero?: (potreroId: string, potreroNombre: string) => void;
}

export const MapHudAndDrawers: React.FC<MapHudAndDrawersProps> = ({
  tipoLicencia,
  userRole,
  gpsTracking,
  userLocation,
  currentPaddock,
  currentSpecialZone,
  selectedPotrero,
  selectedZona,
  onSelectPotrero,
  onSelectZona,
  onMoveCattleToPotrero,
}) => {
  return (
    <>
      {/* HUD en Vivo de Ubicación Actual (Modo Vuelta) */}
      {tipoLicencia === 'premium' && gpsTracking && currentPaddock && (
        <div
          className="farm-map-gps-banner"
          role="region"
          aria-label="Potrero actual detectado por GPS"
        >
          <div className="farm-map-gps-banner-top">
            <div className="farm-map-gps-banner-title">
              <span
                aria-hidden="true"
                style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: 'var(--info)', flexShrink: 0 }}
              />
              <span>
                Estás en: <span style={{ color: 'var(--info)' }}>{currentPaddock.nombre}</span>
              </span>
              <span style={{ color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.78rem' }}>
                {currentPaddock.area_hectareas} Ha
              </span>
              {userLocation && (
                <span className="farm-map-gps-accuracy">±{Math.round(userLocation.accuracy)} m</span>
              )}
            </div>
            <button
              type="button"
              className="farm-map-gps-hud-btn"
              onClick={() => {
                onSelectZona(null);
                onSelectPotrero(currentPaddock);
              }}
            >
              Ver ficha
            </button>
          </div>

          {currentPaddock.potrerada_actual ? (
            <>
              <div className="farm-map-gps-metrics">
                <span>🐄 <strong style={{ color: 'var(--text-main)' }}>{currentPaddock.potrerada_actual.total_animales} cab.</strong></span>
                <span>⏱️ <strong>{currentPaddock.potrerada_actual.dias_en_potrero}d</strong></span>
                <span>⚖️ Prom: <strong>{currentPaddock.potrerada_actual.peso_promedio} kg</strong></span>
                <span>
                  📈 Est:{' '}
                  <strong style={{ color: currentPaddock.potrerada_actual.confianza_peso === 'vencida' ? 'var(--warning)' : undefined }}>
                    {currentPaddock.potrerada_actual.peso_promedio_estimado} kg
                  </strong>
                  {currentPaddock.potrerada_actual.confianza_peso === 'vencida' && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--warning)', marginLeft: '3px' }}>⚠️</span>
                  )}
                </span>
              </div>
              {currentPaddock.potrerada_actual.marcas && currentPaddock.potrerada_actual.marcas.length > 0 && (
                <div className="farm-map-gps-marcas">
                  <span>🏷️ Marca{currentPaddock.potrerada_actual.marcas.length > 1 ? 's' : ''}:</span>
                  {currentPaddock.potrerada_actual.marcas.map((m, i) => (
                    <span key={i} className="farm-map-gps-marca-pill">{m}</span>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="farm-map-gps-metrics">
              <span>🌱 Potrero libre / en descanso</span>
            </div>
          )}
        </div>
      )}

      {/* HUD de Zona Especial Actual */}
      {tipoLicencia === 'premium' && gpsTracking && !currentPaddock && currentSpecialZone && (() => {
        const meta = ZONA_META_BY_TIPO[currentSpecialZone.tipo] || ZONA_META_BY_TIPO.otro;
        return (
          <div
            className="farm-map-gps-banner"
            style={{ borderColor: meta.themeVar }}
            role="region"
            aria-label="Zona especial actual detectada por GPS"
          >
            <div className="farm-map-gps-banner-top">
              <div className="farm-map-gps-banner-title">
                <span>
                  📍 Estás en: <span style={{ color: meta.themeVar }}>
                    {meta.icon} {currentSpecialZone.nombre}
                  </span> ({currentSpecialZone.area_hectareas} Ha &bull; {meta.longLabel})
                </span>
              </div>
              <button
                type="button"
                className="farm-map-gps-hud-btn"
                onClick={() => {
                  onSelectPotrero(null);
                  onSelectZona(currentSpecialZone);
                }}
              >
                Ver
              </button>
            </div>
          </div>
        );
      })()}

      {/* HUD cuando estás en camino o fuera de polígonos delimitados */}
      {tipoLicencia === 'premium' && gpsTracking && userLocation && !currentPaddock && !currentSpecialZone && (
        <div
          className="farm-map-gps-banner farm-map-gps-banner--corridor"
          role="region"
          aria-label="Estado de recorrido GPS"
        >
          <span style={{ fontWeight: 600 }}>
            📍 En recorrido · Fuera de potrero delimitado
          </span>
          <span className="farm-map-gps-accuracy">±{Math.round(userLocation.accuracy)} m</span>
        </div>
      )}

      {/* Drawer / Modal de Detalle de Potrero Seleccionado */}
      {selectedPotrero && (
        <div className="farm-map-sheet" role="region" aria-label={`Detalle del potrero ${selectedPotrero.nombre}`}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px', gap: '8px' }}>
            <div style={{ minWidth: 0 }}>
              <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>Potrero de Pastoreo</span>
              <h3 style={{ margin: '2px 0 0 0', fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)' }}>{selectedPotrero.nombre}</h3>
            </div>
            <button
              type="button"
              aria-label="Cerrar detalle de potrero"
              className="farm-map-sheet-close"
              onClick={() => onSelectPotrero(null)}
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
            <div style={{ backgroundColor: 'var(--surface-inset)', border: '1px solid var(--border-subtle)', padding: '10px', borderRadius: '10px' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Área</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--success)' }}>{selectedPotrero.area_hectareas} Ha</div>
            </div>
            <div style={{ backgroundColor: 'var(--surface-inset)', border: '1px solid var(--border-subtle)', padding: '10px', borderRadius: '10px' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Estado</div>
              <div style={{
                fontSize: '0.9rem',
                fontWeight: 600,
                color: tipoLicencia === 'demo' ? 'var(--text-muted)' : selectedPotrero.potrerada_actual ? 'var(--text-main)' : 'var(--success)',
              }}>
                {tipoLicencia === 'demo' ? 'Vista Previa' : selectedPotrero.potrerada_actual ? 'Ocupado' : 'Libre'}
              </div>
            </div>
          </div>

          {tipoLicencia === 'demo' ? (
            <div style={{
              backgroundColor: 'var(--info-soft-bg)',
              border: '1px solid var(--info-soft-border)',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '16px',
              textAlign: 'center',
            }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                backgroundColor: 'var(--surface-subtle)',
                border: '1px solid var(--info-soft-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 8px auto',
                color: 'var(--info)',
              }}>
                <Lock size={18} />
              </div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '4px' }}>
                Integración de Lotes y Pesos
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: '12px' }}>
                Actualiza al <strong>Plan Finca</strong> o <strong>Premium</strong> para vincular tus animales, ver pesos y mover ganado sobre el mapa.
              </div>
              <button
                type="button"
                className="farm-map-cta-btn"
                onClick={() => (window.location.href = '/suscripcion')}
                style={{
                  backgroundColor: 'var(--info)',
                  color: 'var(--on-primary)',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  width: '100%',
                }}
              >
                Ver Planes de Suscripción →
              </button>
            </div>
          ) : selectedPotrero.potrerada_actual ? (
            <div style={{
              backgroundColor: 'var(--surface-subtle)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '12px',
              padding: '14px',
              marginBottom: '16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
                <Users size={18} color="var(--text-muted)" />
                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)' }}>
                  Lote de Ganado
                </span>
                {selectedPotrero.potrerada_actual.nombre !== selectedPotrero.nombre && (
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                    · {selectedPotrero.potrerada_actual.nombre}
                  </span>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <div style={{ backgroundColor: 'var(--surface-inset)', border: '1px solid var(--border-subtle)', padding: '8px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>🐄 Animales</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-main)' }}>
                    {selectedPotrero.potrerada_actual.total_animales} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)' }}>cabezas</span>
                  </div>
                </div>

                <div style={{ backgroundColor: 'var(--surface-inset)', border: '1px solid var(--border-subtle)', padding: '8px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>⏱️ Ocupación</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--warning)' }}>
                    {selectedPotrero.potrerada_actual.dias_en_potrero} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)' }}>días</span>
                  </div>
                </div>

                <div style={{ backgroundColor: 'var(--surface-inset)', border: '1px solid var(--border-subtle)', padding: '8px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>⚖️ Peso Promedio</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--info)' }}>
                    {selectedPotrero.potrerada_actual.peso_promedio} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)' }}>kg</span>
                  </div>
                  {selectedPotrero.potrerada_actual.fecha_ultimo_pesaje && (
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px', fontWeight: 500 }}>
                      📅 {selectedPotrero.potrerada_actual.fecha_ultimo_pesaje}
                    </div>
                  )}
                </div>

                <div style={{ backgroundColor: 'var(--surface-inset)', border: '1px solid var(--border-subtle)', padding: '8px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>📈 Peso Estimado</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: selectedPotrero.potrerada_actual.confianza_peso === 'vencida' ? 'var(--warning)' : 'var(--success)' }}>
                    {selectedPotrero.potrerada_actual.peso_promedio_estimado} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)' }}>kg</span>
                  </div>
                  {selectedPotrero.potrerada_actual.confianza_peso === 'vencida' && (
                    <div style={{ fontSize: '0.64rem', color: 'var(--warning)', marginTop: '2px', fontWeight: 600 }}>
                      ⚠️ +180d sin pesar (requiere báscula)
                    </div>
                  )}
                  {selectedPotrero.potrerada_actual.confianza_peso === 'media' && (
                    <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)', marginTop: '2px', fontWeight: 500 }}>
                      Confianza media (91-180d)
                    </div>
                  )}
                </div>
              </div>

              {selectedPotrero.potrerada_actual.marcas && selectedPotrero.potrerada_actual.marcas.length > 0 && (
                <div style={{ backgroundColor: 'var(--surface-inset)', border: '1px solid var(--border-subtle)', padding: '10px 12px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '6px' }}>🏷️ Marca / Propietario</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {selectedPotrero.potrerada_actual.marcas.map((m, i) => (
                      <span key={i} style={{
                        backgroundColor: 'var(--info-soft-bg)',
                        color: 'var(--info)',
                        border: '1px solid var(--info-soft-border)',
                        padding: '3px 10px',
                        borderRadius: '99px',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                      }}>{m}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px', fontStyle: 'italic', backgroundColor: 'var(--surface-inset)', border: '1px solid var(--border-subtle)', padding: '12px', borderRadius: '10px' }}>
              🌱 Potrero en descanso. Sin lote de ganado asignado actualmente.
            </div>
          )}

          {tipoLicencia !== 'demo' && (userRole === 'administrador' || userRole === 'vaquero') && onMoveCattleToPotrero && !selectedPotrero.potrerada_actual && (
            <button
              type="button"
              className="farm-map-cta-btn"
              onClick={() => {
                onMoveCattleToPotrero(selectedPotrero.id, selectedPotrero.nombre);
                onSelectPotrero(null);
              }}
              style={{
                width: '100%',
                backgroundColor: 'var(--info)',
                color: 'var(--on-primary)',
                border: 'none',
                padding: '10px',
                borderRadius: '10px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <ArrowRightLeft size={16} aria-hidden="true" /> Ingresar Ganado a este Potrero
            </button>
          )}
        </div>
      )}

      {/* Drawer / Modal de Detalle de Zona Especial Seleccionada */}
      {selectedZona && (() => {
        const meta = ZONA_META_BY_TIPO[selectedZona.tipo] || ZONA_META_BY_TIPO.otro;
        const zoneDescription =
          selectedZona.tipo === 'bosque' || selectedZona.tipo === 'reforestacion' || selectedZona.tipo === 'reserva'
            ? '🌿 Área de conservación, bosque nativo o reforestación. Se muestra en el plano para control espacial y ambiental sin crear potreros de pastoreo.'
            : selectedZona.tipo === 'agua'
            ? '💧 Cuerpo de agua natural, lago, reservorio o humedal.'
            : selectedZona.tipo === 'infraestructura'
            ? '🏠 Infraestructura e instalaciones de la finca (casa principal, corrales, bodega o campamento).'
            : '📍 Zona espacial no ganadera delimitada en el plano de la finca.';
        return (
          <div className="farm-map-sheet" role="region" aria-label={`Detalle de ${selectedZona.nombre}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px', gap: '8px' }}>
              <div style={{ minWidth: 0 }}>
                <span style={{
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  color: meta.themeVar,
                  fontWeight: 700,
                }}>
                  {meta.icon} {meta.longLabel}
                </span>
                <h3 style={{ margin: '2px 0 0 0', fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)' }}>{selectedZona.nombre}</h3>
              </div>
              <button
                type="button"
                aria-label="Cerrar detalle de zona"
                className="farm-map-sheet-close"
                onClick={() => onSelectZona(null)}
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
              <div style={{ backgroundColor: 'var(--surface-inset)', border: '1px solid var(--border-subtle)', padding: '10px', borderRadius: '10px' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Superficie</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--success)' }}>{selectedZona.area_hectareas} Ha</div>
              </div>
              <div style={{ backgroundColor: 'var(--surface-inset)', border: '1px solid var(--border-subtle)', padding: '10px', borderRadius: '10px' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Uso</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>No ganadero</div>
              </div>
            </div>

            <div style={{
              backgroundColor: 'var(--surface-subtle)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '12px',
              padding: '14px',
              fontSize: '0.85rem',
              color: 'var(--text-muted)',
              lineHeight: 1.5,
            }}>
              <span>{zoneDescription}</span>
            </div>
          </div>
        );
      })()}
    </>
  );
};
