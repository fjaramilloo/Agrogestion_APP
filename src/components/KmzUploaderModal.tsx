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
    if (potreroId === 'NEW') {
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
      // 1. Guardar metadatos del mapa en la tabla mapas_finca
      const { error: mapErr } = await supabase.from('mapas_finca').upsert({
        id_finca: fincaId,
        nombre_archivo: parsedData.fileName,
        centro_latitud: parsedData.center[0],
        centro_longitud: parsedData.center[1],
        zoom_inicial: 16,
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
        actualizado_en: new Date().toISOString(),
      });

      // 2. Procesar cada potrero vinculado o nuevo
      for (const item of matches) {
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
          // Crear un nuevo potrero en la finca
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
                {step === 1 ? 'Selecciona tu archivo de potreros para importarlo al mapa' : `Revisa la vinculación de potreros (${matchedCount} vinculados de ${matches.length})`}
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
                  {parsedData.polygons.length} Potreros detectados
                </span>
              </div>

              <div style={{ marginBottom: '12px', fontSize: '0.85rem', color: '#CBD5E1' }}>
                Nuestro algoritmo relacionó automáticamente los potreros del KMZ con los registrados en la app. Puedes ajustar la vinculación en la lista:
              </div>

              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                maxHeight: '340px',
                overflowY: 'auto',
                paddingRight: '4px',
              }}>
                {matches.map((match, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: '#0F172A',
                      padding: '12px 16px',
                      borderRadius: '10px',
                      border: '1px solid #334155',
                      gap: '12px',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#F1F5F9' }}>
                        {match.kmzFeature.name}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#64748B' }}>
                        Superficie: {match.kmzFeature.areaHa} Hectáreas
                      </div>
                    </div>

                    <div style={{ minWidth: '220px' }}>
                      <select
                        value={match.matchedPotreroId || 'NEW'}
                        onChange={(e) => handleSelectPotrero(idx, e.target.value)}
                        style={{
                          width: '100%',
                          backgroundColor: '#1E293B',
                          color: '#F8FAFC',
                          border: match.status === 'exact' ? '1px solid #10B981' : '1px solid #475569',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          fontSize: '0.85rem',
                          outline: 'none',
                        }}
                      >
                        <option value="NEW">➕ Crear como nuevo potrero</option>
                        {existingPotreros.map((p) => (
                          <option key={p.id} value={p.id}>
                            🔗 Vincular a: {p.nombre} ({p.area_hectareas} Ha)
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
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
