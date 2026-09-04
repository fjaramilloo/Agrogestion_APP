import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Layers, Navigation, RefreshCw, Upload, Users, ArrowRightLeft, Lock } from 'lucide-react';
import { findCurrentPaddockByGps } from '../utils/geoUtils';

interface PotreroMapData {
  id: string;
  nombre: string;
  area_hectareas: number;
  geojson_geometry?: any;
  color_mapa?: string;
  potrerada_actual?: {
    id: string;
    nombre: string;
    total_animales: number;
    peso_promedio: number;
    peso_promedio_estimado: number;
    dias_en_potrero: number;
    fecha_entrada?: string;
  } | null;
}

export interface ZonaAdicionalMapData {
  id: string;
  nombre: string;
  tipo: 'bosque' | 'reforestacion' | 'reserva' | 'agua' | 'infraestructura' | 'otro';
  area_hectareas: number;
  geojson_geometry: any;
  color?: string;
}

interface InteractiveFarmMapProps {
  fincaNombre?: string;
  potreros: PotreroMapData[];
  zonasAdicionales?: ZonaAdicionalMapData[];
  userRole: 'administrador' | 'vaquero' | 'observador';
  tipoLicencia?: 'demo' | 'finca' | 'premium';
  centerLat?: number;
  centerLng?: number;
  zoom?: number;
  onOpenUploader?: () => void;
  onMoveCattleToPotrero?: (potreroId: string, potreroNombre: string) => void;
}

export const InteractiveFarmMap: React.FC<InteractiveFarmMapProps> = ({
  potreros,
  zonasAdicionales = [],
  userRole,
  tipoLicencia = 'premium',
  centerLat = 4.5709,
  centerLng = -74.2973,
  zoom = 15,
  onOpenUploader,
  onMoveCattleToPotrero,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const userAccuracyCircleRef = useRef<L.Circle | null>(null);

  const [mapType, setMapType] = useState<'satellite' | 'street'>('satellite');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [currentPaddock, setCurrentPaddock] = useState<PotreroMapData | null>(null);
  const [currentSpecialZone, setCurrentSpecialZone] = useState<ZonaAdicionalMapData | null>(null);
  const [selectedPotrero, setSelectedPotrero] = useState<PotreroMapData | null>(null);
  const [selectedZona, setSelectedZona] = useState<ZonaAdicionalMapData | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);

  // Inicialización del Mapa de Leaflet
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [centerLat, centerLng],
        zoom: zoom,
        zoomControl: false,
      });

      // Añadir control de zoom abajo a la derecha
      L.control.zoom({ position: 'bottomright' }).addTo(map);

      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;

    // Remover capas antiguas
    map.eachLayer((layer: L.Layer) => {
      if (layer instanceof L.TileLayer) {
        map.removeLayer(layer);
      }
    });

    // Agregar Capa Satelital (Esri World Imagery) o Capa de Terreno (OSM)
    if (mapType === 'satellite') {
      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
          maxZoom: 19,
        }
      ).addTo(map);
    } else {
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);
    }

    return () => {
      // no destruir mapa para renderizado suave
    };
  }, [mapType, centerLat, centerLng, zoom]);

  // Dibujar Polígonos de Potreros y Etiquetas Flotantes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Limpiar polígonos y marcadores anteriores (excepto capa base)
    map.eachLayer((layer: L.Layer) => {
      if (layer instanceof L.GeoJSON || layer instanceof L.Polygon || (layer instanceof L.Marker && layer !== userMarkerRef.current)) {
        map.removeLayer(layer);
      }
    });

    const bounds = L.latLngBounds([]);
    const isDemo = tipoLicencia === 'demo';

    // 1. Renderizar Potreros de Pastoreo
    potreros.forEach((p) => {
      if (!p.geojson_geometry) return;

      const hasCattle = !isDemo && !!p.potrerada_actual;
      const polyColor = isDemo ? '#10B981' : hasCattle ? '#3B82F6' : '#10B981'; // Azul si tiene animales, verde si libre o demo

      const geoJsonLayer = L.geoJSON(p.geojson_geometry, {
        style: {
          color: polyColor,
          weight: 2,
          opacity: 0.9,
          fillColor: polyColor,
          fillOpacity: 0.25,
        },
        onEachFeature: (_feature: any, layer: L.Layer) => {
          layer.on('click', () => {
            setSelectedZona(null);
            setSelectedPotrero(p);
          });
        },
      }).addTo(map);

      // Calcular centroide del polígono para poner el Badge
      try {
        const polyBounds = geoJsonLayer.getBounds();
        if (polyBounds.isValid()) {
          bounds.extend(polyBounds);
          const center = polyBounds.getCenter();

          // Crear Badge HTML flotante sobre el potrero
          const badgeHtml = `
            <div style="
              background-color: rgba(15, 23, 42, 0.92);
              backdrop-filter: blur(4px);
              border: 1px solid ${polyColor};
              border-radius: 8px;
              padding: 4px 8px;
              color: white;
              font-family: sans-serif;
              font-size: 11px;
              font-weight: 600;
              text-align: center;
              box-shadow: 0 4px 12px rgba(0,0,0,0.4);
              white-space: nowrap;
              pointer-events: auto;
              cursor: pointer;
            ">
              <div style="color: #F8FAFC; font-weight: 700;">${p.nombre}</div>
              <div style="font-size: 9.5px; color: #94A3B8;">${p.area_hectareas} Ha</div>
              ${
                hasCattle
                  ? `<div style="margin-top: 2px; font-size: 9px; background: #3B82F6; color: white; padding: 2px 5px; border-radius: 4px;">🐮 ${p.potrerada_actual?.nombre} (${p.potrerada_actual?.total_animales} cbs &bull; ${p.potrerada_actual?.peso_promedio}kg)</div>`
                  : ''
              }
            </div>
          `;

          const customIcon = L.divIcon({
            html: badgeHtml,
            className: '',
            iconSize: [120, 44],
            iconAnchor: [60, 22],
          });

          const badgeMarker = L.marker(center, { icon: customIcon }).addTo(map);
          badgeMarker.on('click', () => {
            setSelectedZona(null);
            setSelectedPotrero(p);
          });
        }
      } catch (e) {
        console.warn('Error calculando centro de polígono potrero:', e);
      }
    });

    // 2. Renderizar Zonas Especiales No Ganaderas (Bosques, Agua, Infraestructura)
    zonasAdicionales.forEach((z) => {
      if (!z.geojson_geometry) return;

      const isBosque = z.tipo === 'bosque' || z.tipo === 'reforestacion' || z.tipo === 'reserva';
      const isAgua = z.tipo === 'agua';
      const isInfra = z.tipo === 'infraestructura';

      const zoneColor = z.color || (isBosque ? '#059669' : isAgua ? '#0284C7' : isInfra ? '#D97706' : '#8B5CF6');
      const zoneIcon = isBosque ? '🌳' : isAgua ? '💧' : isInfra ? '🏠' : '📍';
      const zoneLabel = isBosque ? 'Bosque/Reforestación' : isAgua ? 'Agua' : isInfra ? 'Infraestructura' : 'Zona Especial';

      const geoJsonLayer = L.geoJSON(z.geojson_geometry, {
        style: {
          color: zoneColor,
          weight: 2,
          dashArray: isBosque ? '4, 4' : undefined,
          opacity: 0.9,
          fillColor: zoneColor,
          fillOpacity: isAgua ? 0.4 : 0.25,
        },
        onEachFeature: (_feature: any, layer: L.Layer) => {
          layer.on('click', () => {
            setSelectedPotrero(null);
            setSelectedZona(z);
          });
        },
      }).addTo(map);

      try {
        const polyBounds = geoJsonLayer.getBounds();
        if (polyBounds.isValid()) {
          bounds.extend(polyBounds);
          const center = polyBounds.getCenter();

          const badgeHtml = `
            <div style="
              background-color: rgba(15, 23, 42, 0.92);
              backdrop-filter: blur(4px);
              border: 1px solid ${zoneColor};
              border-radius: 8px;
              padding: 4px 8px;
              color: white;
              font-family: sans-serif;
              font-size: 11px;
              font-weight: 600;
              text-align: center;
              box-shadow: 0 4px 12px rgba(0,0,0,0.4);
              white-space: nowrap;
              pointer-events: auto;
              cursor: pointer;
            ">
              <div style="color: #F8FAFC; font-weight: 700;">${zoneIcon} ${z.nombre}</div>
              <div style="font-size: 9.5px; color: ${zoneColor}; font-weight: 600;">${z.area_hectareas} Ha &bull; ${zoneLabel}</div>
            </div>
          `;

          const customIcon = L.divIcon({
            html: badgeHtml,
            className: '',
            iconSize: [130, 44],
            iconAnchor: [65, 22],
          });

          const badgeMarker = L.marker(center, { icon: customIcon }).addTo(map);
          badgeMarker.on('click', () => {
            setSelectedPotrero(null);
            setSelectedZona(z);
          });
        }
      } catch (e) {
        console.warn('Error calculando centro de polígono zona especial:', e);
      }
    });

    // Ajustar vista del mapa si hay potreros o zonas
    if (bounds.isValid() && (potreros.some((p) => p.geojson_geometry) || zonasAdicionales.some((z) => z.geojson_geometry))) {
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [potreros, zonasAdicionales, tipoLicencia]);

  // Manejar Geolocalización GPS del Usuario en Tiempo Real (Exclusivo Plan Premium)
  const handleTrackGps = () => {
    if (tipoLicencia !== 'premium') {
      alert('🔒 La geolocalización GPS en tiempo real sobre el plano está disponible exclusivamente en el Plan Premium.\n\nActualiza tu suscripción para ubicarte dentro de tus potreros en campo.');
      return;
    }

    if (!navigator.geolocation) {
      alert('Tu navegador o dispositivo no soporta geolocalización GPS.');
      return;
    }

    setGpsLoading(true);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        const coords: [number, number] = [latitude, longitude];

        setUserLocation({ lat: latitude, lng: longitude, accuracy });
        setGpsLoading(false);

        const map = mapInstanceRef.current;
        if (!map) return;

        // Centrar suavemente en la posición
        map.flyTo(coords, 17, { animate: true, duration: 1.5 });

        // Crear o actualizar Marcador de Punto Azul Pulsante
        if (!userMarkerRef.current) {
          const userIcon = L.divIcon({
            html: `
              <div style="position: relative; width: 22px; height: 22px;">
                <div style="
                  position: absolute;
                  width: 22px;
                  height: 22px;
                  background-color: #3B82F6;
                  border-radius: 50%;
                  opacity: 0.4;
                  animation: pulse 2s infinite;
                "></div>
                <div style="
                  position: absolute;
                  top: 3px;
                  left: 3px;
                  width: 16px;
                  height: 16px;
                  background-color: #2563EB;
                  border: 2px solid #FFFFFF;
                  border-radius: 50%;
                  box-shadow: 0 0 8px rgba(37, 99, 235, 0.8);
                "></div>
              </div>
            `,
            className: '',
            iconSize: [22, 22],
            iconAnchor: [11, 11],
          });

          userMarkerRef.current = L.marker(coords, { icon: userIcon, zIndexOffset: 1000 }).addTo(map);
        } else {
          userMarkerRef.current.setLatLng(coords);
        }

        // Círculo de Precisión
        if (userAccuracyCircleRef.current) {
          map.removeLayer(userAccuracyCircleRef.current);
        }

        userAccuracyCircleRef.current = L.circle(coords, {
          radius: accuracy,
          color: '#3B82F6',
          fillColor: '#3B82F6',
          fillOpacity: 0.15,
          weight: 1,
        }).addTo(map);

        // Detectar potrero actual o zona especial por GPS
        const foundPotrero = findCurrentPaddockByGps(latitude, longitude, potreros);
        if (foundPotrero) {
          const fullPotrero = potreros.find((p) => p.id === foundPotrero.id) || null;
          setCurrentPaddock(fullPotrero);
          setCurrentSpecialZone(null);
        } else {
          setCurrentPaddock(null);
          const foundZone = findCurrentPaddockByGps(latitude, longitude, zonasAdicionales);
          if (foundZone) {
            const fullZone = zonasAdicionales.find((z) => z.id === foundZone.id) || null;
            setCurrentSpecialZone(fullZone);
          } else {
            setCurrentSpecialZone(null);
          }
        }
      },
      (err) => {
        setGpsLoading(false);
        alert('No se pudo obtener tu ubicación GPS: ' + err.message);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: 'calc(100vh - 120px)', borderRadius: '16px', overflow: 'hidden', border: '1px solid #334155' }}>
      {/* Contenedor del Mapa Leaflet */}
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%', zIndex: 1 }} />

      {/* Banner de Estado GPS / Ubicación Actual (Solo Premium) */}
      {tipoLicencia === 'premium' && currentPaddock && (
        <div style={{
          position: 'absolute',
          top: '16px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(10px)',
          border: '1px solid #3B82F6',
          borderRadius: '20px',
          padding: '10px 22px',
          color: '#F8FAFC',
          fontSize: '0.85rem',
          zIndex: 1000,
          boxShadow: '0 10px 30px -5px rgba(0, 0, 0, 0.6)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '4px',
          maxWidth: '90%',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#3B82F6' }} />
            📍 Estás en: <span style={{ color: '#60A5FA' }}>{currentPaddock.nombre}</span> ({currentPaddock.area_hectareas} Ha)
          </div>
          {currentPaddock.potrerada_actual && (
            <div style={{ fontSize: '0.78rem', color: '#94A3B8', display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <span>🐮 <strong>{currentPaddock.potrerada_actual.nombre}</strong> ({currentPaddock.potrerada_actual.total_animales} cbs)</span>
              <span>⏱️ <strong>{currentPaddock.potrerada_actual.dias_en_potrero} días</strong></span>
              <span>⚖️ Prom: <strong>{currentPaddock.potrerada_actual.peso_promedio} kg</strong></span>
              <span>📈 Est: <strong>{currentPaddock.potrerada_actual.peso_promedio_estimado} kg</strong></span>
            </div>
          )}
        </div>
      )}

      {/* Banner de Zona Especial Actual (Solo Premium) */}
      {tipoLicencia === 'premium' && !currentPaddock && currentSpecialZone && (
        <div style={{
          position: 'absolute',
          top: '16px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(10px)',
          border: currentSpecialZone.tipo === 'bosque' ? '1px solid #059669' : currentSpecialZone.tipo === 'agua' ? '1px solid #0284C7' : '1px solid #D97706',
          borderRadius: '20px',
          padding: '10px 22px',
          color: '#F8FAFC',
          fontSize: '0.85rem',
          zIndex: 1000,
          boxShadow: '0 10px 30px -5px rgba(0, 0, 0, 0.6)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontWeight: 700,
          maxWidth: '90%',
        }}>
          <span>
            📍 Estás en: <span style={{ color: currentSpecialZone.tipo === 'bosque' ? '#34D399' : currentSpecialZone.tipo === 'agua' ? '#38BDF8' : '#FBBF24' }}>
              {currentSpecialZone.tipo === 'bosque' ? '🌳' : currentSpecialZone.tipo === 'agua' ? '💧' : '🏠'} {currentSpecialZone.nombre}
            </span> ({currentSpecialZone.area_hectareas} Ha &bull; {currentSpecialZone.tipo === 'bosque' ? 'Zona Ambiental / Forestal' : currentSpecialZone.tipo === 'agua' ? 'Cuerpo de Agua' : 'Infraestructura'})
          </span>
        </div>
      )}

      {/* Botones Flotantes de Control Superior */}
      <div style={{
        position: 'absolute',
        top: '16px',
        right: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        zIndex: 1000,
      }}>
        {/* Cambiar Capa Satélite/Calle */}
        <button
          onClick={() => setMapType(mapType === 'satellite' ? 'street' : 'satellite')}
          title="Cambiar tipo de mapa"
          style={{
            backgroundColor: 'rgba(15, 23, 42, 0.9)',
            border: '1px solid #334155',
            color: '#F8FAFC',
            padding: '10px 14px',
            borderRadius: '12px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.85rem',
            fontWeight: 500,
            backdropFilter: 'blur(6px)',
          }}
        >
          <Layers size={18} color="#3B82F6" />
          {mapType === 'satellite' ? 'Satélite' : 'Mapa Terreno'}
        </button>

        {/* Botón Cargar Plano KMZ (Para Administradores) */}
        {userRole === 'administrador' && onOpenUploader && (
          <button
            onClick={onOpenUploader}
            style={{
              backgroundColor: '#10B981',
              color: '#FFFFFF',
              border: 'none',
              padding: '10px 16px',
              borderRadius: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.85rem',
              fontWeight: 600,
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)',
            }}
          >
            <Upload size={18} /> Cargar Plano KMZ
          </button>
        )}
      </div>

      {/* Botón Flotante "Centrar en mi GPS" */}
      <button
        onClick={handleTrackGps}
        disabled={gpsLoading}
        style={{
          position: 'absolute',
          bottom: '24px',
          left: '24px',
          backgroundColor: tipoLicencia === 'premium' ? '#3B82F6' : '#1E293B',
          border: tipoLicencia === 'premium' ? 'none' : '1px solid #475569',
          color: tipoLicencia === 'premium' ? '#FFFFFF' : '#94A3B8',
          padding: '12px 20px',
          borderRadius: '30px',
          cursor: gpsLoading ? 'wait' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '0.9rem',
          fontWeight: 600,
          boxShadow: tipoLicencia === 'premium' ? '0 4px 20px rgba(59, 130, 246, 0.5)' : '0 4px 12px rgba(0, 0, 0, 0.4)',
          zIndex: 1000,
        }}
      >
        {tipoLicencia !== 'premium' ? (
          <>
            <Lock size={16} color="#F59E0B" />
            <span>GPS en vivo (Plan Premium)</span>
          </>
        ) : gpsLoading ? (
          <>
            <RefreshCw className="animate-spin" size={18} />
            <span>Detectando GPS...</span>
          </>
        ) : (
          <>
            <Navigation size={18} />
            <span>{userLocation ? 'Mi Ubicación GPS' : 'Localizarme en el mapa'}</span>
          </>
        )}
      </button>

      {/* Drawer / Modal de Detalle de Potrero Seleccionado */}
      {selectedPotrero && (
        <div style={{
          position: 'absolute',
          bottom: '16px',
          right: '16px',
          width: '340px',
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(12px)',
          border: '1px solid #334155',
          borderRadius: '16px',
          padding: '20px',
          color: '#F8FAFC',
          zIndex: 1000,
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.6)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <div>
              <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#94A3B8', fontWeight: 600 }}>Potrero de Pastoreo</span>
              <h3 style={{ margin: '2px 0 0 0', fontSize: '1.25rem', fontWeight: 700 }}>{selectedPotrero.nombre}</h3>
            </div>
            <button
              onClick={() => setSelectedPotrero(null)}
              style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '1.2rem' }}
            >
              ✕
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
            <div style={{ backgroundColor: '#1E293B', padding: '10px', borderRadius: '10px' }}>
              <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Área</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#10B981' }}>{selectedPotrero.area_hectareas} Ha</div>
            </div>
            <div style={{ backgroundColor: '#1E293B', padding: '10px', borderRadius: '10px' }}>
              <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Estado</div>
              <div style={{
                fontSize: '0.9rem',
                fontWeight: 600,
                color: tipoLicencia === 'demo' ? '#94A3B8' : selectedPotrero.potrerada_actual ? '#60A5FA' : '#34D399',
              }}>
                {tipoLicencia === 'demo' ? 'Vista Previa' : selectedPotrero.potrerada_actual ? 'Ocupado' : 'Libre'}
              </div>
            </div>
          </div>

          {/* Si es Plan Demo: Mostrar tarjeta bloqueada invitando a Plan Finca */}
          {tipoLicencia === 'demo' ? (
            <div style={{
              backgroundColor: '#1E293B80',
              border: '1px solid #3B82F640',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '16px',
              textAlign: 'center',
            }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                backgroundColor: '#3B82F620',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 8px auto',
                color: '#60A5FA',
              }}>
                <Lock size={18} />
              </div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#F1F5F9', marginBottom: '4px' }}>
                Integración de Lotes y Pesos
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94A3B8', lineHeight: 1.4, marginBottom: '12px' }}>
                Actualiza al <strong>Plan Finca</strong> o <strong>Premium</strong> para vincular tus animales, ver pesos y mover ganado sobre el mapa.
              </div>
              <button
                onClick={() => (window.location.href = '/suscripcion')}
                style={{
                  backgroundColor: '#3B82F6',
                  color: 'white',
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
              backgroundColor: '#1E293B90',
              border: '1px solid #3B82F640',
              borderRadius: '12px',
              padding: '14px',
              marginBottom: '16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', borderBottom: '1px solid #334155', paddingBottom: '8px' }}>
                <Users size={18} color="#3B82F6" />
                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#F1F5F9' }}>
                  {selectedPotrero.potrerada_actual.nombre}
                </span>
              </div>

              {/* Grid de 4 Métricas Clave */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '4px' }}>
                <div style={{ backgroundColor: '#0F172A', padding: '8px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.7rem', color: '#94A3B8' }}>🐮 Animales</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#F8FAFC' }}>
                    {selectedPotrero.potrerada_actual.total_animales} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#94A3B8' }}>cabezas</span>
                  </div>
                </div>

                <div style={{ backgroundColor: '#0F172A', padding: '8px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.7rem', color: '#94A3B8' }}>⏱️ Ocupación</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#F59E0B' }}>
                    {selectedPotrero.potrerada_actual.dias_en_potrero} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#94A3B8' }}>días</span>
                  </div>
                </div>

                <div style={{ backgroundColor: '#0F172A', padding: '8px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.7rem', color: '#94A3B8' }}>⚖️ Peso Promedio</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#38BDF8' }}>
                    {selectedPotrero.potrerada_actual.peso_promedio} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#94A3B8' }}>kg</span>
                  </div>
                </div>

                <div style={{ backgroundColor: '#0F172A', padding: '8px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.7rem', color: '#94A3B8' }}>📈 Peso Estimado</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#34D399' }}>
                    {selectedPotrero.potrerada_actual.peso_promedio_estimado} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#94A3B8' }}>kg</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: '0.85rem', color: '#94A3B8', marginBottom: '16px', fontStyle: 'italic', backgroundColor: '#1E293B50', padding: '12px', borderRadius: '10px' }}>
              🌱 Potrero en descanso. Sin lote de ganado asignado actualmente.
            </div>
          )}

          {/* Acciones del Potrero (Solo para Finca y Premium) */}
          {tipoLicencia !== 'demo' && userRole !== 'observador' && onMoveCattleToPotrero && (
            <button
              onClick={() => {
                onMoveCattleToPotrero(selectedPotrero.id, selectedPotrero.nombre);
                setSelectedPotrero(null);
              }}
              style={{
                width: '100%',
                backgroundColor: '#3B82F6',
                color: '#FFFFFF',
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
              <ArrowRightLeft size={16} /> Mover Ganado a este Potrero
            </button>
          )}
        </div>
      )}

      {/* Drawer / Modal de Detalle de Zona Especial Seleccionada (Bosques, Agua, Infraestructura) */}
      {selectedZona && (
        <div style={{
          position: 'absolute',
          bottom: '16px',
          right: '16px',
          width: '340px',
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(12px)',
          border: '1px solid #334155',
          borderRadius: '16px',
          padding: '20px',
          color: '#F8FAFC',
          zIndex: 1000,
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.6)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <div>
              <span style={{
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                color: selectedZona.tipo === 'bosque' || selectedZona.tipo === 'reforestacion' || selectedZona.tipo === 'reserva'
                  ? '#34D399'
                  : selectedZona.tipo === 'agua'
                  ? '#38BDF8'
                  : '#FBBF24',
                fontWeight: 700,
              }}>
                {selectedZona.tipo === 'bosque' || selectedZona.tipo === 'reforestacion' || selectedZona.tipo === 'reserva'
                  ? '🌳 Zona Ambiental / Forestal'
                  : selectedZona.tipo === 'agua'
                  ? '💧 Cuerpo de Agua'
                  : '🏠 Infraestructura'}
              </span>
              <h3 style={{ margin: '2px 0 0 0', fontSize: '1.25rem', fontWeight: 700 }}>{selectedZona.nombre}</h3>
            </div>
            <button
              onClick={() => setSelectedZona(null)}
              style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '1.2rem' }}
            >
              ✕
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
            <div style={{ backgroundColor: '#1E293B', padding: '10px', borderRadius: '10px' }}>
              <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Superficie</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#10B981' }}>{selectedZona.area_hectareas} Ha</div>
            </div>
            <div style={{ backgroundColor: '#1E293B', padding: '10px', borderRadius: '10px' }}>
              <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Uso</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#CBD5E1' }}>No ganadero</div>
            </div>
          </div>

          <div style={{
            backgroundColor: '#1E293B80',
            border: '1px solid #334155',
            borderRadius: '12px',
            padding: '14px',
            fontSize: '0.85rem',
            color: '#94A3B8',
            lineHeight: 1.5,
          }}>
            {(selectedZona.tipo === 'bosque' || selectedZona.tipo === 'reforestacion' || selectedZona.tipo === 'reserva') && (
              <span>🌿 Área de conservación, bosque nativo o reforestación. Se muestra en el plano para control espacial y ambiental sin crear potreros de pastoreo.</span>
            )}
            {selectedZona.tipo === 'agua' && (
              <span>💧 Cuerpo de agua natural, lago, reservorio o humedal.</span>
            )}
            {selectedZona.tipo === 'infraestructura' && (
              <span>🏠 Infraestructura e instalaciones de la finca (casa principal, corrales, bodega o campamento).</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
