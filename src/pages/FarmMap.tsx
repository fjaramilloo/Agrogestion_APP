import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { InteractiveFarmMap } from '../components/InteractiveFarmMap';
import { MultiFarmMap, type FarmSummaryData } from '../components/MultiFarmMap';
import { KmzUploaderModal } from '../components/KmzUploaderModal';
import { localDB } from '../lib/db';
import { MapPin, Upload, Lock, RefreshCw, Trash2, Sparkles, WifiOff, AlertOctagon } from 'lucide-react';
import ModalUpsell from '../components/ModalUpsell';

// Hook para saber si estamos en pantalla móvil
function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < breakpoint);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [breakpoint]);
  return isMobile;
}

export const FarmMapPage: React.FC = () => {
  const { fincaId, userFincas, role, licenciaInfo, setFincaId } = useAuth();
  const isVencida = Boolean(licenciaInfo?.isVencida);
  const isSobrecupo = Boolean(licenciaInfo && (licenciaInfo.isSobrecupo || licenciaInfo.totalAnimalesOrganizacion > licenciaInfo.limiteAnimales));
  const isBloqueado = isVencida || isSobrecupo;
  const [showUpsellModal, setShowUpsellModal] = useState(false);
  const isMobile = useIsMobile();

  const currentFincaName = userFincas.find((f) => f.id_finca === fincaId)?.nombre_finca || 'Mi Finca';

  const [viewMode, setViewMode] = useState<'single' | 'multi'>('single');
  const [potreros, setPotreros] = useState<any[]>([]);
  const [multiFincasData, setMultiFincasData] = useState<FarmSummaryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploaderOpen, setUploaderOpen] = useState(false);
  const [mapMeta, setMapMeta] = useState<{ lat?: number; lng?: number } | null>(null);
  const [zonasAdicionales, setZonasAdicionales] = useState<any[]>([]);
  const [isOfflineData, setIsOfflineData] = useState(false);
  const [offlineUpdatedTime, setOfflineUpdatedTime] = useState<string | null>(null);

  // Modal para traslado rápido de ganado a potrero desde el mapa
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [targetPotrero, setTargetPotrero] = useState<{ id: string; nombre: string } | null>(null);
  const [potreradas, setPotreradas] = useState<{ id: string; nombre: string }[]>([]);
  const [selectedPotreradaId, setSelectedPotreradaId] = useState('');
  const [transferring, setTransferring] = useState(false);

  // Escuchar cuando vuelva el internet para recargar
  useEffect(() => {
    const handleOnline = () => {
      if (fincaId) {
        loadFarmMapData();
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [fincaId]);

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

  const loadOfflineMapData = async (targetFincaId: string) => {
    try {
      // 1. Intentar desde snapshot consolidado
      const snapshot = await localDB.mapaSnapshotCache.get(targetFincaId);
      if (snapshot && snapshot.potreros && snapshot.potreros.length > 0) {
        setPotreros(snapshot.potreros);
        if (snapshot.map_meta) {
          setMapMeta(snapshot.map_meta);
        }
        setZonasAdicionales(snapshot.zonas_adicionales || []);
        setIsOfflineData(true);
        if (snapshot.actualizado_en) {
          const d = new Date(snapshot.actualizado_en);
          setOfflineUpdatedTime(`Guardado local: ${d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
        }
        return true;
      }

      // 2. Fallback a potrerosCache y mapasFincaCache individuales
      const cachedMap = await localDB.mapasFincaCache.get(targetFincaId);
      if (cachedMap) {
        setMapMeta({ lat: cachedMap.centro_latitud, lng: cachedMap.centro_longitud });
        setZonasAdicionales(cachedMap.zonas_adicionales || []);
      }

      const cachedPotreros = await localDB.potrerosCache.where('id_finca').equals(targetFincaId).toArray();
      if (cachedPotreros.length > 0) {
        setPotreros(cachedPotreros.map(p => ({
          id: p.id,
          nombre: p.nombre,
          area_hectareas: p.area_ha || 0,
          geojson_geometry: p.geojson_geometry,
          color_mapa: p.color_mapa,
          potrerada_actual: null,
        })));
        setIsOfflineData(true);
        setOfflineUpdatedTime('Datos básicos en memoria local');
        return true;
      }

      return false;
    } catch (err) {
      console.error('Error al cargar datos de mapa offline:', err);
      return false;
    }
  };

  const loadFarmMapData = async () => {
    if (!fincaId) return;
    setLoading(true);

    // Si no hay conexión de red, cargar directamente de la memoria local
    if (!navigator.onLine) {
      await loadOfflineMapData(fincaId);
      setLoading(false);
      return;
    }

    try {
      // 1. Cargar metadatos del mapa de la finca
      const { data: mapData } = await supabase
        .from('mapas_finca')
        .select('*')
        .eq('id_finca', fincaId)
        .maybeSingle();

      const currentZonas = mapData?.zonas_adicionales || [];
      const currentMeta = mapData ? {
        lat: mapData.centro_latitud,
        lng: mapData.centro_longitud,
      } : null;

      if (mapData) {
        setMapMeta(currentMeta);
        setZonasAdicionales(currentZonas);
      } else {
        setZonasAdicionales([]);
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
        .select('id_potrero, id_potrerada, fecha_entrada, potreradas(nombre)')
        .eq('id_finca', fincaId)
        .is('fecha_salida', null);

      // Cargar animales con sus pesajes para calcular peso promedio y peso estimado
      const { data: animalesData } = await supabase
        .from('animales')
        .select(`
          id,
          id_potrerada,
          nombre_propietario,
          peso_ingreso,
          peso_compra,
          fecha_ingreso,
          registros_pesaje (
            peso,
            fecha,
            gdp_calculada,
            gmp_calculada
          )
        `)
        .eq('id_finca', fincaId)
        .eq('estado', 'activo')
        .or('is_deleted.is.null,is_deleted.eq.false');

      const calculateDaysDiff = (dateStr: string) => {
        if (!dateStr) return 0;
        const target = new Date(dateStr.split('T')[0] + 'T00:00:00');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const diffTime = today.getTime() - target.getTime();
        return Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
      };

      // Agrupar métricas por potrerada
      const potreradaMetricsMap = new Map<string, {
        total_animales: number;
        peso_promedio: number;
        peso_promedio_estimado: number;
        marcas: string[];
        fecha_ultimo_pesaje?: string | null;
      }>();

      const animalesPorPotrerada = new Map<string, any[]>();
      (animalesData || []).forEach((a: any) => {
        if (a.id_potrerada) {
          if (!animalesPorPotrerada.has(a.id_potrerada)) {
            animalesPorPotrerada.set(a.id_potrerada, []);
          }
          animalesPorPotrerada.get(a.id_potrerada)!.push(a);
        }
      });

      animalesPorPotrerada.forEach((animales, potreradaId) => {
        let sumPeso = 0;
        let sumPesoEstimado = 0;
        let validCount = 0;
        let latestPesajeDate: string | null = null;

        animales.forEach((a: any) => {
          const registros = (a.registros_pesaje || []).sort(
            (x: any, y: any) => new Date(y.fecha).getTime() - new Date(x.fecha).getTime()
          );

          const lastP = registros[0];
          const pesoBase = Number(a.peso_compra ?? a.peso_ingreso ?? 0);
          const pesoActual = lastP ? Number(lastP.peso) : pesoBase;

          if (lastP?.fecha) {
            if (!latestPesajeDate || new Date(lastP.fecha).getTime() > new Date(latestPesajeDate).getTime()) {
              latestPesajeDate = lastP.fecha;
            }
          }

          sumPeso += pesoActual;
          validCount++;

          // Estimación de peso
          if (lastP) {
            const gmp = lastP.gmp_calculada !== null && lastP.gmp_calculada !== undefined 
              ? Number(lastP.gmp_calculada) 
              : (lastP.gdp_calculada ? Number(lastP.gdp_calculada) * 30 : 10.3);
            const diasDesdePesaje = calculateDaysDiff(lastP.fecha);
            const pesoEst = pesoActual + (diasDesdePesaje * (gmp / 30));
            sumPesoEstimado += pesoEst;
          } else if (a.fecha_ingreso) {
            const diasDesdeIngreso = calculateDaysDiff(a.fecha_ingreso);
            const pesoEst = pesoBase + (diasDesdeIngreso * (10.3 / 30));
            sumPesoEstimado += pesoEst;
          } else {
            sumPesoEstimado += pesoActual;
          }
        });

        // Formato legible de fecha de pesaje (ej. 15 Ago o hace X días)
        let formattedPesajeDate: string | null = null;
        if (latestPesajeDate) {
          const d = new Date(latestPesajeDate.split('T')[0] + 'T00:00:00');
          const dias = calculateDaysDiff(latestPesajeDate);
          const dateStr = d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
          formattedPesajeDate = dias === 0 ? 'Hoy' : dias === 1 ? 'Ayer' : `${dateStr} (hace ${dias}d)`;
        }

        // Calcular marcas (propietarios únicos) de esta potrerada
        const marcasSet = new Set<string>();
        animales.forEach((a: any) => {
          if (a.nombre_propietario) marcasSet.add(a.nombre_propietario);
        });

        potreradaMetricsMap.set(potreradaId, {
          total_animales: validCount,
          peso_promedio: validCount > 0 ? Math.round(sumPeso / validCount) : 0,
          peso_promedio_estimado: validCount > 0 ? Math.round(sumPesoEstimado / validCount) : 0,
          marcas: Array.from(marcasSet).sort(),
          fecha_ultimo_pesaje: formattedPesajeDate,
        });
      });

      const potreroAssignmentMap = new Map<string, {
        id: string;
        nombre: string;
        total_animales: number;
        peso_promedio: number;
        peso_promedio_estimado: number;
        dias_en_potrero: number;
        fecha_entrada?: string;
        marcas: string[];
        fecha_ultimo_pesaje?: string | null;
      }>();

      (movsData || []).forEach((m: any) => {
        if (m.id_potrero && m.id_potrerada) {
          const metrics = potreradaMetricsMap.get(m.id_potrerada) || {
            total_animales: 0,
            peso_promedio: 0,
            peso_promedio_estimado: 0,
            marcas: [] as string[],
          };
          const diasOcupacion = m.fecha_entrada ? calculateDaysDiff(m.fecha_entrada) : 0;

          potreroAssignmentMap.set(m.id_potrero, {
            id: m.id_potrerada,
            nombre: m.potreradas?.nombre || 'Lote Ganado',
            total_animales: metrics.total_animales,
            peso_promedio: metrics.peso_promedio,
            peso_promedio_estimado: metrics.peso_promedio_estimado,
            dias_en_potrero: diasOcupacion,
            fecha_entrada: m.fecha_entrada,
            marcas: metrics.marcas,
            fecha_ultimo_pesaje: metrics.fecha_ultimo_pesaje,
          });
        }
      });

      const processedPotreros = (potsData || []).map((p) => ({
        ...p,
        potrerada_actual: potreroAssignmentMap.get(p.id) || null,
      }));

      setPotreros(processedPotreros);
      setIsOfflineData(false);
      setOfflineUpdatedTime(null);

      // Guardar snapshot local en IndexedDB para disponibilidad offline
      localDB.mapaSnapshotCache.put({
        id_finca: fincaId,
        actualizado_en: new Date().toISOString(),
        potreros: processedPotreros,
        map_meta: currentMeta,
        zonas_adicionales: currentZonas,
      }).catch(err => console.warn('[OfflineMap] Error guardando snapshot local:', err));

      // Cargar lista de potreradas para el modal de traslado
      const { data: potsList } = await supabase
        .from('potreradas')
        .select('id, nombre')
        .eq('id_finca', fincaId);

      setPotreradas(potsList || []);
    } catch (e) {
      console.warn('Error cargando mapa en línea, activando respaldo offline:', e);
      await loadOfflineMapData(fincaId);
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
    if (isBloqueado) {
      setShowUpsellModal(true);
      return;
    }
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

  const handleClearFarmMap = async () => {
    if (!fincaId) return;
    const confirmed = window.confirm(
      '¿Estás seguro de que deseas eliminar y revertir el plano de esta finca?\n\nEsto quitará los polígonos del mapa, pero tus potreros, animales, lotes y pesajes permanecerán 100% intactos.'
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      // 1. Eliminar registro del mapa
      await supabase.from('mapas_finca').delete().eq('id_finca', fincaId);

      // 2. Limpiar geometrías asociadas a los potreros de esta finca
      await supabase
        .from('potreros')
        .update({ geojson_geometry: null, kml_name: null })
        .eq('id_finca', fincaId);

      // 3. Limpiar caché local
      await localDB.mapasFincaCache.where('id_finca').equals(fincaId).delete();

      await loadFarmMapData();
    } catch (err: any) {
      alert('Error al revertir el plano: ' + err.message);
    } finally {
      setLoading(false);
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

  const hasMapPolygons = potreros.some((p) => p.geojson_geometry) || zonasAdicionales.length > 0;

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
              {potreros.length} Potreros registrados &bull; {potreros.filter(p => p.geojson_geometry).length} potreros delimitados {zonasAdicionales.length > 0 ? `&bull; ${zonasAdicionales.length} zonas no ganaderas` : ''}
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

          {/* Botones de administración: solo visibles en escritorio */}
          {role === 'administrador' && !isMobile && (
            <div style={{ display: 'flex', gap: '8px' }}>
              {hasMapPolygons && (
                <button
                  onClick={handleClearFarmMap}
                  title="Eliminar plano y revertir potreros"
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    color: '#FCA5A5',
                    padding: '8px 14px',
                    borderRadius: '10px',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Trash2 size={16} /> Quitar Plano
                </button>
              )}

              <button
                onClick={() => {
                  if (isBloqueado) {
                    setShowUpsellModal(true);
                  } else {
                    setUploaderOpen(true);
                  }
                }}
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
                <Upload size={16} /> {hasMapPolygons ? 'Reemplazar Plano' : 'Cargar Plano KMZ'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Banner Informativo para Licencia Vencida o Sobrecupo */}
      {isBloqueado ? (
        <div style={{
          background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(220, 38, 38, 0.08))',
          border: '1px solid rgba(239, 68, 68, 0.4)',
          borderRadius: '12px',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          color: '#FCA5A5',
          fontSize: '0.85rem',
          flexWrap: 'wrap',
          marginBottom: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertOctagon size={20} color="#F87171" style={{ flexShrink: 0 }} />
            <span>
              {isVencida ? (
                <>
                  <strong>Modo Solo Lectura (Licencia Vencida):</strong> Tu suscripción ha vencido. Puedes explorar tus potreros y plano de finca en modo visualización, pero los traslados y el seguimiento GPS en campo se encuentran pausados hasta la renovación.
                </>
              ) : (
                <>
                  <strong>Modo Solo Lectura (Sobrecupo):</strong> Tu organización tiene <strong>{licenciaInfo?.totalAnimalesOrganizacion} animales</strong> registrados (límite de plan: <strong>{licenciaInfo?.limiteAnimales}</strong>). Los traslados interactivos se encuentran pausados en modo lectura.
                </>
              )}
            </span>
          </div>
          <button
            onClick={() => setShowUpsellModal(true)}
            style={{
              backgroundColor: '#EF4444',
              color: 'white',
              border: 'none',
              padding: '7px 16px',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '0.8rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {isVencida ? 'Renovar Plan' : 'Ver Planes'}
          </button>
        </div>
      ) : licenciaInfo?.licencia === 'demo' ? (
        <div style={{
          backgroundColor: 'rgba(59, 130, 246, 0.12)',
          border: '1px solid rgba(59, 130, 246, 0.35)',
          borderRadius: '12px',
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          color: '#93C5FD',
          fontSize: '0.85rem',
          flexWrap: 'wrap',
          marginBottom: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Sparkles size={18} color="#60A5FA" style={{ flexShrink: 0 }} />
            <span>
              <strong>Vista Previa (Plan Demo):</strong> Estás visualizando la delimitación y áreas de tu plano. Pasa al <strong>Plan Finca</strong> para ver tus lotes de ganado, pesos y traslados, o al <strong>Plan Premium</strong> para activar la geolocalización GPS en campo.
            </span>
          </div>
          <button
            onClick={() => (window.location.href = '/suscripcion')}
            style={{
              backgroundColor: '#3B82F6',
              color: 'white',
              border: 'none',
              padding: '7px 16px',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '0.8rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Ver Planes de Suscripción →
          </button>
        </div>
      ) : null}

      {/* Banner Informativo de Modo Sin Conexión */}
      {isOfflineData && (
        <div style={{
          backgroundColor: 'rgba(234, 179, 8, 0.12)',
          border: '1px solid rgba(234, 179, 8, 0.35)',
          borderRadius: '12px',
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          color: '#FEF08A',
          fontSize: '0.85rem',
        }}>
          <WifiOff size={20} color="#EAB308" style={{ flexShrink: 0 }} />
          <div>
            <strong>Modo Sin Conexión activo:</strong> Estás navegando con el plano, potreros y distribución de ganado guardados en la memoria local {offlineUpdatedTime ? `(${offlineUpdatedTime})` : ''}.
            <div style={{ fontSize: '0.8rem', color: '#FDE047', marginTop: '2px' }}>
              Tu posición GPS por satélite sigue activa en tiempo real para orientarte durante la vuelta a los potreros.
            </div>
          </div>
        </div>
      )}

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
            isMobile ? (
              <div style={{
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                borderRadius: '10px',
                padding: '12px 16px',
                color: '#93C5FD',
                fontSize: '0.85rem',
                display: 'inline-block',
                maxWidth: '420px',
              }}>
                💻 Para cargar o configurar el archivo KMZ de la finca, por favor ingresa desde una computadora (versión de escritorio).
              </div>
            ) : (
              <button
                onClick={() => {
                  if (isBloqueado) {
                    setShowUpsellModal(true);
                  } else {
                    setUploaderOpen(true);
                  }
                }}
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
            )
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
          zonasAdicionales={zonasAdicionales}
          userRole={role as any}
          tipoLicencia={isBloqueado ? 'demo' : (licenciaInfo?.licencia || 'demo')}
          centerLat={mapMeta?.lat || 4.5709}
          centerLng={mapMeta?.lng || -74.2973}
          onOpenUploader={() => {
            if (isBloqueado) {
              setShowUpsellModal(true);
            } else {
              setUploaderOpen(true);
            }
          }}
          onMoveCattleToPotrero={isBloqueado ? undefined : handleOpenTransferModal}
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

      {licenciaInfo && (
        <ModalUpsell
          isOpen={showUpsellModal}
          onClose={() => setShowUpsellModal(false)}
          licenciaInfo={licenciaInfo}
        />
      )}
    </div>
  );
};
