import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { InteractiveFarmMap } from '../components/InteractiveFarmMap';
import { MultiFarmMap, type FarmSummaryData } from '../components/MultiFarmMap';
import { KmzUploaderModal } from '../components/KmzUploaderModal';
import { MapPin, Upload, Lock, RefreshCw } from 'lucide-react';

export const FarmMapPage: React.FC = () => {
  const { fincaId, userFincas, role, licenciaInfo, setFincaId } = useAuth();

  const currentFincaName = userFincas.find((f) => f.id_finca === fincaId)?.nombre_finca || 'Mi Finca';

  const [viewMode, setViewMode] = useState<'single' | 'multi'>('single');
  const [potreros, setPotreros] = useState<any[]>([]);
  const [multiFincasData, setMultiFincasData] = useState<FarmSummaryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploaderOpen, setUploaderOpen] = useState(false);
  const [mapMeta, setMapMeta] = useState<{ lat?: number; lng?: number } | null>(null);

  // Modal para traslado rápido de ganado a potrero desde el mapa
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [targetPotrero, setTargetPotrero] = useState<{ id: string; nombre: string } | null>(null);
  const [potreradas, setPotreradas] = useState<{ id: string; nombre: string }[]>([]);
  const [selectedPotreradaId, setSelectedPotreradaId] = useState('');
  const [transferring, setTransferring] = useState(false);

  // Cargar datos de la finca activa
  useEffect(() => {
    if (!fincaId) return;
    loadFarmMapData();
  }, [fincaId]);

  // Cargar datos multi-finca si aplica
  useEffect(() => {
    if (userFincas && userFincas.length > 1) {
      loadMultiFincasData();
    }
  }, [userFincas]);

  const loadFarmMapData = async () => {
    if (!fincaId) return;
    setLoading(true);

    try {
      // 1. Cargar metadatos del mapa de la finca
      const { data: mapData } = await supabase
        .from('mapas_finca')
        .select('*')
        .eq('id_finca', fincaId)
        .maybeSingle();

      if (mapData) {
        setMapMeta({
          lat: mapData.centro_latitud,
          lng: mapData.centro_longitud,
        });
      }

      // 2. Cargar potreros con geometrías
      const { data: potsData, error: potErr } = await supabase
        .from('potreros')
        .select('id, nombre, area_hectareas, geojson_geometry, color_mapa')
        .eq('id_finca', fincaId);

      if (potErr) throw potErr;

      // 3. Cargar movimientos activos de potreradas para saber qué ganado está en qué potrero
      const { data: movsData } = await supabase
        .from('movimientos_potreros')
        .select('id_potrero, id_potrerada, potreradas(nombre)')
        .eq('id_finca', fincaId)
        .is('fecha_salida', null);

      // Cargar conteo de animales por potrerada
      const { data: animalesData } = await supabase
        .from('animales')
        .select('id_potrerada')
        .eq('id_finca', fincaId)
        .eq('estado', 'activo');

      const countMap = new Map<string, number>();
      animalesData?.forEach((a) => {
        if (a.id_potrerada) {
          countMap.set(a.id_potrerada, (countMap.get(a.id_potrerada) || 0) + 1);
        }
      });

      const potreroAssignmentMap = new Map<string, { id: string; nombre: string; total_animales: number }>();
      movsData?.forEach((m: any) => {
        if (m.id_potrero && m.id_potrerada) {
          potreroAssignmentMap.set(m.id_potrero, {
            id: m.id_potrerada,
            nombre: m.potreradas?.nombre || 'Lote Ganado',
            total_animales: countMap.get(m.id_potrerada) || 0,
          });
        }
      });

      const processedPotreros = (potsData || []).map((p) => ({
        ...p,
        potrerada_actual: potreroAssignmentMap.get(p.id) || null,
      }));

      setPotreros(processedPotreros);

      // Cargar lista de potreradas para el modal de traslado
      const { data: potsList } = await supabase
        .from('potreradas')
        .select('id, nombre')
        .eq('id_finca', fincaId);

      setPotreradas(potsList || []);
    } catch (e) {
      console.error('Error cargando mapa de finca:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadMultiFincasData = async () => {
    try {
      const summaries: FarmSummaryData[] = [];
      for (const f of userFincas) {
        const { data: mapData } = await supabase
          .from('mapas_finca')
          .select('centro_latitud, centro_longitud')
          .eq('id_finca', f.id_finca)
          .maybeSingle();

        const { count: potCount } = await supabase
          .from('potreros')
          .select('*', { count: 'exact', head: true })
          .eq('id_finca', f.id_finca);

        const { count: animCount } = await supabase
          .from('animales')
          .select('*', { count: 'exact', head: true })
          .eq('id_finca', f.id_finca)
          .eq('estado', 'activo');

        summaries.push({
          id: f.id_finca,
          nombre: f.nombre_finca,
          latitud: mapData?.centro_latitud || 4.5709,
          longitud: mapData?.centro_longitud || -74.2973,
          total_hectareas: 0,
          total_animales: animCount || 0,
          total_potreros: potCount || 0,
        });
      }
      setMultiFincasData(summaries);
    } catch (e) {
      console.error('Error cargando multi-fincas:', e);
    }
  };

  const handleOpenTransferModal = (potreroId: string, potreroNombre: string) => {
    setTargetPotrero({ id: potreroId, nombre: potreroNombre });
    setSelectedPotreradaId('');
    setTransferModalOpen(true);
  };

  const handleExecuteTransfer = async () => {
    if (!targetPotrero || !selectedPotreradaId || !fincaId) return;
    setTransferring(true);

    try {
      // 1. Cerrar movimiento anterior de la potrerada si existe
      await supabase
        .from('movimientos_potreros')
        .update({ fecha_salida: new Date().toISOString() })
        .eq('id_finca', fincaId)
        .eq('id_potrerada', selectedPotreradaId)
        .is('fecha_salida', null);

      // 2. Registrar el nuevo movimiento al potrero seleccionado
      await supabase.from('movimientos_potreros').insert({
        id_finca: fincaId,
        id_potrero: targetPotrero.id,
        id_potrerada: selectedPotreradaId,
        fecha_entrada: new Date().toISOString(),
      });

      // 3. Actualizar id_potrero_actual en los animales de esa potrerada
      await supabase
        .from('animales')
        .update({ id_potrero_actual: targetPotrero.id })
        .eq('id_finca', fincaId)
        .eq('id_potrerada', selectedPotreradaId);

      setTransferModalOpen(false);
      await loadFarmMapData();
    } catch (err) {
      alert('Error trasladando el ganado: ' + (err as any).message);
    } finally {
      setTransferring(false);
    }
  };

  // Bloqueo si no tiene licencia
  if (licenciaInfo?.licencia === 'demo' && !fincaId) {
    return (
      <div style={{
        padding: '48px 24px',
        textAlign: 'center',
        backgroundColor: '#0F172A',
        borderRadius: '16px',
        color: '#F8FAFC',
        border: '1px solid #334155',
        maxWidth: '600px',
        margin: '40px auto',
      }}>
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          backgroundColor: '#3B82F620',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px auto',
          color: '#3B82F6',
        }}>
          <Lock size={32} />
        </div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '8px' }}>Módulo Plano de Finca (KMZ/KML)</h2>
        <p style={{ color: '#94A3B8', fontSize: '0.95rem', marginBottom: '24px', lineHeight: 1.5 }}>
          La carga de mapas vectoriales, visualización satelital y localización por GPS requiere una suscripción activa.
        </p>
        <button
          onClick={() => window.location.href = '/suscripcion'}
          style={{
            backgroundColor: '#10B981',
            color: 'white',
            border: 'none',
            padding: '12px 24px',
            borderRadius: '10px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Ver Planes de Suscripción →
        </button>
      </div>
    );
  }

  const existingPotrerosForUploader = potreros.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    area_hectareas: p.area_hectareas,
    geojson_geometry: p.geojson_geometry,
  }));

  const hasMapPolygons = potreros.some((p) => p.geojson_geometry);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Barra de Encabezado */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#0F172A',
        padding: '16px 20px',
        borderRadius: '16px',
        border: '1px solid #334155',
        color: '#F8FAFC',
        flexWrap: 'wrap',
        gap: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            backgroundColor: '#3B82F620',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#3B82F6',
          }}>
            <MapPin size={22} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Plano de la Finca: {currentFincaName}</h2>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#94A3B8' }}>
              {potreros.length} Potreros registrados &bull; {potreros.filter(p => p.geojson_geometry).length} delimitados en el mapa
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {userFincas && userFincas.length > 1 && (
            <div style={{ display: 'flex', backgroundColor: '#1E293B', borderRadius: '10px', padding: '3px', border: '1px solid #334155' }}>
              <button
                onClick={() => setViewMode('single')}
                style={{
                  backgroundColor: viewMode === 'single' ? '#3B82F6' : 'transparent',
                  color: viewMode === 'single' ? 'white' : '#94A3B8',
                  border: 'none',
                  padding: '6px 14px',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Finca Actual
              </button>
              <button
                onClick={() => setViewMode('multi')}
                style={{
                  backgroundColor: viewMode === 'multi' ? '#3B82F6' : 'transparent',
                  color: viewMode === 'multi' ? 'white' : '#94A3B8',
                  border: 'none',
                  padding: '6px 14px',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Multi-Finca
              </button>
            </div>
          )}

          {role === 'administrador' && (
            <button
              onClick={() => setUploaderOpen(true)}
              style={{
                backgroundColor: '#10B981',
                color: 'white',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '10px',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Upload size={16} /> Cargar Plano KMZ
            </button>
          )}
        </div>
      </div>

      {/* Contenido Principal: Mapa o Estado Vacío */}
      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: '#94A3B8' }}>
          <RefreshCw className="animate-spin" size={32} style={{ color: '#3B82F6', marginBottom: '12px' }} />
          <div>Cargando mapa e información geospacial...</div>
        </div>
      ) : viewMode === 'multi' ? (
        <MultiFarmMap
          fincas={multiFincasData}
          onSelectFinca={(selectedId) => {
            setFincaId(selectedId);
            setViewMode('single');
          }}
        />
      ) : !hasMapPolygons ? (
        /* Estado sin plano cargado aún */
        <div style={{
          backgroundColor: '#0F172A',
          borderRadius: '16px',
          border: '1px dashed #334155',
          padding: '48px 24px',
          textAlign: 'center',
          color: '#F8FAFC',
        }}>
          <MapPin size={48} color="#3B82F6" style={{ marginBottom: '16px' }} />
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '8px' }}>
            Aún no has cargado el plano KMZ/KML de esta finca
          </h3>
          <p style={{ color: '#94A3B8', fontSize: '0.9rem', maxWidth: '500px', margin: '0 auto 24px auto', lineHeight: 1.5 }}>
            Sube el archivo de tu finca exportado desde Google Earth, QGIS o tu GPS. El sistema vinculará automáticamente tus potreros y calculará sus superficies.
          </p>
          {role === 'administrador' ? (
            <button
              onClick={() => setUploaderOpen(true)}
              style={{
                backgroundColor: '#3B82F6',
                color: 'white',
                border: 'none',
                padding: '12px 24px',
                borderRadius: '10px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Upload size={18} /> Cargar Archivo .KMZ o .KML
            </button>
          ) : (
            <div style={{ fontSize: '0.85rem', color: '#64748B' }}>
              Pide al administrador de la finca que suba el archivo KMZ para habilitar el mapa.
            </div>
          )}
        </div>
      ) : (
        <InteractiveFarmMap
          fincaNombre={currentFincaName}
          potreros={potreros}
          userRole={role as any}
          centerLat={mapMeta?.lat || 4.5709}
          centerLng={mapMeta?.lng || -74.2973}
          onOpenUploader={() => setUploaderOpen(true)}
          onMoveCattleToPotrero={handleOpenTransferModal}
        />
      )}

      {/* Modal de Carga de KMZ */}
      {fincaId && (
        <KmzUploaderModal
          fincaId={fincaId}
          existingPotreros={existingPotrerosForUploader}
          isOpen={uploaderOpen}
          onClose={() => setUploaderOpen(false)}
          onSuccess={loadFarmMapData}
        />
      )}

      {/* Modal Rápido de Traslado de Ganado */}
      {transferModalOpen && targetPotrero && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '16px',
        }}>
          <div style={{
            backgroundColor: '#1E293B',
            borderRadius: '16px',
            padding: '24px',
            width: '100%',
            maxWidth: '440px',
            color: '#F8FAFC',
            border: '1px solid #334155',
          }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '1.15rem', fontWeight: 700 }}>
              Mover Ganado a: <span style={{ color: '#3B82F6' }}>{targetPotrero.nombre}</span>
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#94A3B8', marginBottom: '20px' }}>
              Selecciona la potrerada / lote que vas a trasladar a este potrero:
            </p>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#CBD5E1', marginBottom: '6px' }}>
                Potrerada / Lote de Ganado:
              </label>
              <select
                value={selectedPotreradaId}
                onChange={(e) => setSelectedPotreradaId(e.target.value)}
                style={{
                  width: '100%',
                  backgroundColor: '#0F172A',
                  color: '#F8FAFC',
                  border: '1px solid #475569',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  outline: 'none',
                }}
              >
                <option value="">-- Seleccionar Lote --</option>
                {potreradas.map((p) => (
                  <option key={p.id} value={p.id}>
                    🐮 {p.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                onClick={() => setTransferModalOpen(false)}
                style={{
                  backgroundColor: 'transparent',
                  border: '1px solid #475569',
                  color: '#CBD5E1',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleExecuteTransfer}
                disabled={!selectedPotreradaId || transferring}
                style={{
                  backgroundColor: '#10B981',
                  color: 'white',
                  border: 'none',
                  padding: '8px 18px',
                  borderRadius: '8px',
                  fontWeight: 600,
                  cursor: (!selectedPotreradaId || transferring) ? 'not-allowed' : 'pointer',
                }}
              >
                {transferring ? 'Trasladando...' : 'Confirmar Traslado'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
