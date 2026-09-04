import React, { useState } from 'react';
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, RefreshCw, X, MapPin } from 'lucide-react';
import { parseKmzOrKmlFile, type ParsedKmlResult } from '../utils/kmlParser';
import { matchKmzWithExistingPotreros, type MatchCandidate, type ExistingPotrero } from '../utils/potreroMatcher';
import { supabase } from '../lib/supabase';
import { localDB } from '../lib/db';

interface KmzUploaderModalProps {
  fincaId: string;
  existingPotreros: ExistingPotrero[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const KmzUploaderModal: React.FC<KmzUploaderModalProps> = ({
  fincaId,
  existingPotreros,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<ParsedKmlResult | null>(null);
  const [matches, setMatches] = useState<MatchCandidate[]>([]);
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);

    try {
      const result = await parseKmzOrKmlFile(file);
      if (result.polygons.length === 0) {
        throw new Error('El archivo cargado no contiene polígonos de potreros válidos.');
      }

      setParsedData(result);
      const autoMatches = matchKmzWithExistingPotreros(result.polygons, existingPotreros);
      setMatches(autoMatches);
      setStep(2);
    } catch (err: any) {
      setError(err.message || 'Error al procesar el archivo KMZ/KML.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPotrero = (kmzIndex: number, potreroId: string) => {
    const updated = [...matches];
    if (potreroId === 'OMIT') {
      updated[kmzIndex].matchedPotreroId = null;
      updated[kmzIndex].status = 'omit';
    } else if (potreroId === 'BOSQUE') {
      updated[kmzIndex].matchedPotreroId = null;
      updated[kmzIndex].status = 'bosque';
    } else if (potreroId === 'AGUA') {
      updated[kmzIndex].matchedPotreroId = null;
      updated[kmzIndex].status = 'agua';
    } else if (potreroId === 'INFRA') {
      updated[kmzIndex].matchedPotreroId = null;
      updated[kmzIndex].status = 'infraestructura';
    } else if (potreroId === 'NEW') {
      updated[kmzIndex].matchedPotreroId = null;
      updated[kmzIndex].status = 'new';
    } else {
      const selected = existingPotreros.find((p) => p.id === potreroId);
      updated[kmzIndex].matchedPotreroId = potreroId;
      updated[kmzIndex].matchedPotreroName = selected?.nombre;
      updated[kmzIndex].status = 'exact';
    }
    setMatches(updated);
  };

  const handleSaveMap = async () => {
    if (!parsedData) return;
    setSaving(true);
    setError(null);

    try {
      // 1. Extraer zonas especiales no ganaderas (bosques, agua, infraestructura)
      const zonasAdicionales = matches
        .filter((m) => m.status === 'bosque' || m.status === 'agua' || m.status === 'infraestructura')
        .map((m, idx) => ({
          id: `zona_${Date.now()}_${idx}`,
          nombre: m.kmzFeature.name,
          tipo: m.status as 'bosque' | 'agua' | 'infraestructura',
          area_hectareas: m.kmzFeature.areaHa > 0 ? m.kmzFeature.areaHa : 0,
          geojson_geometry: m.kmzFeature.geometry,
          color: m.status === 'bosque' ? '#059669' : m.status === 'agua' ? '#0284C7' : '#D97706',
        }));

      // 2. Guardar metadatos del mapa en la tabla mapas_finca
      const { error: mapErr } = await supabase.from('mapas_finca').upsert({
        id_finca: fincaId,
        nombre_archivo: parsedData.fileName,
        centro_latitud: parsedData.center[0],
        centro_longitud: parsedData.center[1],
        zoom_inicial: 16,
        zonas_adicionales: zonasAdicionales,
        actualizado_en: new Date().toISOString(),
      });

      if (mapErr) throw mapErr;

      // Guardar también en IndexedDB local
      await localDB.mapasFincaCache.put({
        id_finca: fincaId,
        nombre_archivo: parsedData.fileName,
        centro_latitud: parsedData.center[0],
        centro_longitud: parsedData.center[1],
        zoom_inicial: 16,
        zonas_adicionales: zonasAdicionales,
        actualizado_en: new Date().toISOString(),
      });

      // 3. Procesar potreros vinculados o nuevos (omitiendo zonas especiales y omitidos)
      for (const item of matches) {
        if (
          item.status === 'omit' ||
          item.status === 'bosque' ||
          item.status === 'agua' ||
          item.status === 'infraestructura'
        ) {
          // No crear ni tocar la tabla potreros
          continue;
        }

        const { kmzFeature, matchedPotreroId } = item;

        if (matchedPotreroId) {
          // Actualizar potrero existente con la geometría del KMZ y el área calculada si aplica
          const { error: potErr } = await supabase
            .from('potreros')
            .update({
              geojson_geometry: kmzFeature.geometry,
              kml_name: kmzFeature.name,
              area_hectareas: kmzFeature.areaHa > 0 ? kmzFeature.areaHa : undefined,
            })
            .eq('id', matchedPotreroId);

          if (potErr) console.warn('Error al actualizar potrero:', potErr);
        } else {
          // Crear un nuevo potrero de pastoreo en la finca
          const { error: insErr } = await supabase.from('potreros').insert({
            id_finca: fincaId,
            nombre: kmzFeature.name,
            area_hectareas: kmzFeature.areaHa > 0 ? kmzFeature.areaHa : 1.0,
            geojson_geometry: kmzFeature.geometry,
            kml_name: kmzFeature.name,
          });

          if (insErr) console.warn('Error al insertar nuevo potrero:', insErr);
        }
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Ocurrió un error al guardar los potreros en la base de datos.');
    } finally {
      setSaving(false);
    }
  };

  const matchedCount = matches.filter((m) => m.matchedPotreroId !== null).length;
  const newPastureCount = matches.filter((m) => m.status === 'new').length;
  const specialZoneCount = matches.filter((m) => m.status === 'bosque' || m.status === 'agua' || m.status === 'infraestructura').length;
  const omittedCount = matches.filter((m) => m.status === 'omit').length;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '16px',
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        backgroundColor: '#1E293B',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '720px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        border: '1px solid #334155',
        color: '#F8FAFC',
      }}>
        {/* Encabezado */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #334155',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              backgroundColor: '#10B98120',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#10B981',
            }}>
              <MapPin size={22} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600 }}>Cargar Plano de la Finca (KMZ / KML)</h3>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#94A3B8' }}>
                {step === 1
                  ? 'Selecciona tu archivo de potreros para importarlo al mapa'
                  : `Revisa la vinculación (${matchedCount} vinculados, ${newPastureCount} nuevos${specialZoneCount > 0 ? `, ${specialZoneCount} zonas ambientales` : ''}${omittedCount > 0 ? `, ${omittedCount} omitidos` : ''})`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94A3B8',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '8px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Cuerpo */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {error && (
            <div style={{
              backgroundColor: '#EF444415',
              border: '1px solid #EF444440',
              color: '#FCA5A5',
              padding: '12px 16px',
              borderRadius: '10px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '0.9rem',
            }}>
              <AlertCircle size={18} /> {error}
            </div>
          )}

          {step === 1 && (
            <div style={{ textAlign: 'center', padding: '32px 16px' }}>
              <label style={{
                border: '2px dashed #3B82F660',
                borderRadius: '16px',
                padding: '40px 24px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: loading ? 'wait' : 'pointer',
                backgroundColor: '#1E293B50',
                transition: 'border-color 0.2s',
              }}>
                <input
                  type="file"
                  accept=".kmz,.kml"
                  onChange={handleFileChange}
                  disabled={loading}
                  style={{ display: 'none' }}
                />
                {loading ? (
                  <RefreshCw className="animate-spin" size={42} style={{ color: '#3B82F6', marginBottom: '16px' }} />
                ) : (
                  <Upload size={48} style={{ color: '#3B82F6', marginBottom: '16px' }} />
                )}
                <span style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '6px' }}>
                  {loading ? 'Procesando archivo KMZ/KML...' : 'Haz clic para seleccionar tu plano (.KMZ o .KML)'}
                </span>
                <span style={{ fontSize: '0.85rem', color: '#94A3B8' }}>
                  Soporta planos exportados desde Google Earth, QGIS, GPS Garmin o Drones
                </span>
              </label>
            </div>
          )}

          {step === 2 && parsedData && (
            <div>
              <div style={{
                backgroundColor: '#1E293B80',
                borderRadius: '10px',
                padding: '12px 16px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                border: '1px solid #334155',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <FileSpreadsheet size={18} color="#10B981" />
                  <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{parsedData.fileName}</span>
                </div>
                <span style={{ fontSize: '0.85rem', color: '#94A3B8' }}>
                  {parsedData.polygons.length} Polígonos detectados
                </span>
              </div>

              <div style={{ marginBottom: '12px', fontSize: '0.85rem', color: '#CBD5E1' }}>
                Asigna el tipo de cada polígono. Puedes vincularlo a un potrero existente, crearlo como nuevo, o cargarlo como <strong>zona ambiental (bosque, agua, infraestructura)</strong> para que se vea en el mapa sin crear potreros de pastoreo:
              </div>

              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                maxHeight: '340px',
                overflowY: 'auto',
                paddingRight: '4px',
              }}>
                {matches.map((match, idx) => {
                  const isOmitted = match.status === 'omit';
                  const isBosque = match.status === 'bosque';
                  const isAgua = match.status === 'agua';
                  const isInfra = match.status === 'infraestructura';
                  const isSpecial = isBosque || isAgua || isInfra;

                  const rowBg = isOmitted
                    ? '#0F172A60'
                    : isBosque
                    ? 'rgba(5, 150, 105, 0.08)'
                    : isAgua
                    ? 'rgba(2, 132, 199, 0.08)'
                    : isInfra
                    ? 'rgba(217, 119, 6, 0.08)'
                    : '#0F172A';

                  const rowBorder = isOmitted
                    ? '1px dashed #EF444450'
                    : isBosque
                    ? '1px solid rgba(5, 150, 105, 0.4)'
                    : isAgua
                    ? '1px solid rgba(2, 132, 199, 0.4)'
                    : isInfra
                    ? '1px solid rgba(217, 119, 6, 0.4)'
                    : match.status === 'exact'
                    ? '1px solid rgba(16, 185, 129, 0.4)'
                    : '1px solid #334155';

                  const selectValue = isOmitted
                    ? 'OMIT'
                    : isBosque
                    ? 'BOSQUE'
                    : isAgua
                    ? 'AGUA'
                    : isInfra
                    ? 'INFRA'
                    : match.matchedPotreroId || 'NEW';

                  return (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        backgroundColor: rowBg,
                        padding: '12px 16px',
                        borderRadius: '10px',
                        border: rowBorder,
                        gap: '12px',
                        opacity: isOmitted ? 0.65 : 1,
                        transition: 'all 0.2s',
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontWeight: 600,
                          fontSize: '0.95rem',
                          color: isOmitted
                            ? '#94A3B8'
                            : isBosque
                            ? '#34D399'
                            : isAgua
                            ? '#38BDF8'
                            : isInfra
                            ? '#FBBF24'
                            : '#F1F5F9',
                          textDecoration: isOmitted ? 'line-through' : 'none',
                        }}>
                          {match.kmzFeature.name}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: isOmitted ? '#EF4444' : '#94A3B8', marginTop: '2px' }}>
                          {isOmitted
                            ? '🚫 Omitido (No se incluirá en el mapa)'
                            : isBosque
                            ? `🌳 Bosque / Reforestación (${match.kmzFeature.areaHa} Ha &bull; Visual en mapa)`
                            : isAgua
                            ? `💧 Cuerpo de Agua / Lago (${match.kmzFeature.areaHa} Ha &bull; Visual en mapa)`
                            : isInfra
                            ? `🏠 Infraestructura / Corrales (${match.kmzFeature.areaHa} Ha &bull; Visual en mapa)`
                            : `Superficie: ${match.kmzFeature.areaHa} Hectáreas (Potrero)`}
                        </div>
                      </div>

                      <div style={{ minWidth: '240px' }}>
                        <select
                          value={selectValue}
                          onChange={(e) => handleSelectPotrero(idx, e.target.value)}
                          style={{
                            width: '100%',
                            backgroundColor: isOmitted ? '#1E293B80' : '#1E293B',
                            color: isOmitted
                              ? '#FCA5A5'
                              : isBosque
                              ? '#34D399'
                              : isAgua
                              ? '#38BDF8'
                              : isInfra
                              ? '#FBBF24'
                              : '#F8FAFC',
                            border: isOmitted
                              ? '1px solid #EF444470'
                              : isSpecial
                              ? '1px solid #3B82F6'
                              : match.status === 'exact'
                              ? '1px solid #10B981'
                              : '1px solid #475569',
                            padding: '8px 12px',
                            borderRadius: '8px',
                            fontSize: '0.85rem',
                            outline: 'none',
                          }}
                        >
                          <option value="NEW">➕ Crear como nuevo potrero</option>
                          <optgroup label="Zonas no ganaderas (Visuales en mapa):">
                            <option value="BOSQUE">🌳 Cargar como Bosque / Reforestación</option>
                            <option value="AGUA">💧 Cargar como Cuerpo de Agua / Lago</option>
                            <option value="INFRA">🏠 Cargar como Infraestructura / Instalación</option>
                          </optgroup>
                          <option value="OMIT" style={{ color: '#EF4444' }}>
                            🚫 Omitir / No incluir en el mapa
                          </option>
                          <optgroup label="Vincular a potrero existente:">
                            {existingPotreros.map((p) => (
                              <option key={p.id} value={p.id}>
                                🔗 Vincular a: {p.nombre} ({p.area_hectareas} Ha)
                              </option>
                            ))}
                          </optgroup>
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Pie de modal */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid #334155',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#0F172A',
          borderBottomLeftRadius: '16px',
          borderBottomRightRadius: '16px',
        }}>
          {step === 2 ? (
            <button
              onClick={() => setStep(1)}
              style={{
                backgroundColor: 'transparent',
                border: '1px solid #475569',
                color: '#CBD5E1',
                padding: '10px 18px',
                borderRadius: '10px',
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
            >
              Cambiar archivo
            </button>
          ) : (
            <div />
          )}

          {step === 2 && (
            <button
              onClick={handleSaveMap}
              disabled={saving}
              style={{
                backgroundColor: '#10B981',
                color: '#FFFFFF',
                border: 'none',
                padding: '10px 24px',
                borderRadius: '10px',
                cursor: saving ? 'wait' : 'pointer',
                fontWeight: 600,
                fontSize: '0.95rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
              }}
            >
              {saving ? <RefreshCw className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
              {saving ? 'Guardando Mapa...' : 'Guardar Plano y Vincular'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
