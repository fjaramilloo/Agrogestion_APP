import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  AlertCircle,
  Info,
  Layers,
  LocateFixed,
  Lock,
  Maximize2,
  Minus,
  Navigation,
  Plus,
  RefreshCw,
  Upload,
  X,
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { findCurrentPaddockByGps } from '../utils/geoUtils';
import {
  MAP_LAYER_LABELS,
  MAP_LAYER_ORDER,
  type MapLayerMode,
  type MapNoticeState,
  type PotreroMapData,
  type ZonaAdicionalMapData,
  type ZoomTier,
} from './farm-map/types';
import {
  buildPotreroBadgeHtml,
  buildZonaBadgeHtml,
  createBadgeMarker,
  escapeHtml,
  getPotreroStyle,
  getZonaMeta,
  prefersReducedMotion,
} from './farm-map/mapHelpers';
import { MapHudAndDrawers } from './farm-map/MapHudAndDrawers';
import './InteractiveFarmMap.css';

export type { ZonaAdicionalMapData };

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
  const { isSunMode } = useTheme();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const userAccuracyCircleRef = useRef<L.Circle | null>(null);
  const polygonsGroupRef = useRef<L.FeatureGroup | null>(null);
  const badgesGroupRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const farmBoundsRef = useRef<L.LatLngBounds | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const gpsTrackingRef = useRef(false);
  const gpsFollowPausedRef = useRef(false);
  const hasCenteredFirstFixRef = useRef(false);
  const lastCenteredCoordsRef = useRef<L.LatLng | null>(null);

  const [mapType, setMapType] = useState<MapLayerMode>('satellite');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsTracking, setGpsTracking] = useState(false);
  const [gpsFollowPaused, setGpsFollowPaused] = useState(false);
  const [currentPaddock, setCurrentPaddock] = useState<PotreroMapData | null>(null);
  const [currentSpecialZone, setCurrentSpecialZone] = useState<ZonaAdicionalMapData | null>(null);
  const [selectedPotrero, setSelectedPotrero] = useState<PotreroMapData | null>(null);
  const [selectedZona, setSelectedZona] = useState<ZonaAdicionalMapData | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [mapNotice, setMapNotice] = useState<MapNoticeState | null>(null);
  const [toastPaused, setToastPaused] = useState(false);

  const [currentZoom, setCurrentZoom] = useState<number>(zoom);
  const fittedBoundsKeyRef = useRef<string>('');

  const showNotice = useCallback(
    (notice: Omit<MapNoticeState, 'id'>) => {
      setMapNotice({ id: Date.now(), ...notice });
    },
    []
  );

  // Auto-ocultar avisos informativos cuando no tienen foco/hover ni acción crítica
  useEffect(() => {
    if (!mapNotice || toastPaused || mapNotice.type === 'error' || mapNotice.actionLabel) return;
    const timer = setTimeout(() => setMapNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [mapNotice, toastPaused]);

  // Detectar si estamos en pantalla móvil (< 640px)
  const isMobile = useIsMobile(639);

  // Inicialización del Mapa de Leaflet (controles zoom custom en React para alcance táctil)
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [centerLat, centerLng],
        zoom: zoom,
        zoomControl: false,
      });

      map.on('zoomend', () => {
        setCurrentZoom(map.getZoom());
      });

      map.on('dragstart', () => {
        if (gpsTrackingRef.current && !gpsFollowPausedRef.current) {
          gpsFollowPausedRef.current = true;
          setGpsFollowPaused(true);
        }
      });

      const polyGroup = L.featureGroup().addTo(map);
      const badgeGroup = L.layerGroup().addTo(map);
      polygonsGroupRef.current = polyGroup;
      badgesGroupRef.current = badgeGroup;

      mapInstanceRef.current = map;

      setTimeout(() => map.invalidateSize(), 100);
      setTimeout(() => map.invalidateSize(), 300);
    }

    return () => {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        polygonsGroupRef.current = null;
        badgesGroupRef.current = null;
        tileLayerRef.current = null;
        userMarkerRef.current = null;
        userAccuracyCircleRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Permitir cerrar la ficha de potrero o zona con Escape
  useEffect(() => {
    if (!selectedPotrero && !selectedZona) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedPotrero(null);
        setSelectedZona(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedPotrero, selectedZona]);

  // ResizeObserver para recalcular el tamaño del mapa cuando cambie el viewport
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    const ro = new ResizeObserver(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    });
    ro.observe(container);

    return () => ro.disconnect();
  }, []);

  // Capa Base (Satélite / Plano sin tiles / Terreno OSM)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
      tileLayerRef.current = null;
    }

    if (mapType === 'plain') {
      return;
    }

    const tileLayer =
      mapType === 'satellite'
        ? L.tileLayer(
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            {
              attribution: 'Tiles &copy; Esri',
              maxZoom: 19,
            }
          )
        : L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
            maxZoom: 19,
          });

    tileLayer.addTo(map);
    tileLayerRef.current = tileLayer;
  }, [mapType]);

  // Precalcular centroides de polígonos
  const centroids = useMemo(() => {
    const potreroCentroids = new Map<string, L.LatLng>();
    const zonaCentroids = new Map<string, L.LatLng>();

    potreros.forEach((p) => {
      if (!p.geojson_geometry) return;
      try {
        const layer = L.geoJSON(p.geojson_geometry);
        const b = layer.getBounds();
        if (b.isValid()) {
          potreroCentroids.set(p.id, b.getCenter());
        }
      } catch (e) {
        console.warn('Error calculando centroide potrero:', p.nombre, e);
      }
    });

    zonasAdicionales.forEach((z) => {
      if (!z.geojson_geometry) return;
      try {
        const layer = L.geoJSON(z.geojson_geometry);
        const b = layer.getBounds();
        if (b.isValid()) {
          zonaCentroids.set(z.id, b.getCenter());
        }
      } catch (e) {
        console.warn('Error calculando centroide zona especial:', z.nombre, e);
      }
    });

    return { potreroCentroids, zonaCentroids };
  }, [potreros, zonasAdicionales]);

  // 1. Renderizar Polígonos GeoJSON en polygonsGroupRef
  useEffect(() => {
    const map = mapInstanceRef.current;
    const polyGroup = polygonsGroupRef.current;
    if (!map || !polyGroup) return;

    polyGroup.clearLayers();

    const bounds = L.latLngBounds([]);
    const isDemo = tipoLicencia === 'demo';

    potreros.forEach((p) => {
      if (!p.geojson_geometry) return;

      const isSelected = selectedPotrero?.id === p.id;
      const hasCattle = !isDemo && !!p.potrerada_actual;
      const style = getPotreroStyle(isSelected, hasCattle, isDemo, mapType, isSunMode);

      const geoJsonLayer = L.geoJSON(p.geojson_geometry, {
        style,
        onEachFeature: (_feature: any, layer: L.Layer) => {
          layer.on('click', () => {
            setSelectedZona(null);
            setSelectedPotrero(p);
          });
        },
      });

      const hoverTooltipContent = `
        <div>
          <strong>${escapeHtml(p.nombre)}</strong> (${p.area_hectareas} Ha)
          ${
            hasCattle
              ? `<div style="font-weight: 600; margin-top: 2px;">🐮 ${escapeHtml(p.potrerada_actual?.nombre || '')} (${p.potrerada_actual?.total_animales ?? 0} cbs)</div>`
              : '<div style="font-size: 0.72rem; opacity: 0.85;">🟢 Disponible / Descanso</div>'
          }
        </div>
      `;
      geoJsonLayer.bindTooltip(hoverTooltipContent, {
        className: 'farm-map-hover-tooltip',
        direction: 'top',
        sticky: true,
        opacity: 0.98,
      });

      polyGroup.addLayer(geoJsonLayer);

      try {
        const polyBounds = geoJsonLayer.getBounds();
        if (polyBounds.isValid()) {
          bounds.extend(polyBounds);
        }
      } catch {
        // ignore
      }
    });

    zonasAdicionales.forEach((z) => {
      if (!z.geojson_geometry) return;

      const isSelected = selectedZona?.id === z.id;
      const isBosque = z.tipo === 'bosque' || z.tipo === 'reforestacion' || z.tipo === 'reserva';
      const isAgua = z.tipo === 'agua';
      const { icon, longLabel, baseColor } = getZonaMeta(z, isSunMode, mapType);
      const zoneColor = isSelected ? (isSunMode ? '#B45309' : '#F59E0B') : baseColor;

      const geoJsonLayer = L.geoJSON(z.geojson_geometry, {
        style: {
          color: zoneColor,
          weight: isSelected ? 4 : mapType === 'plain' ? 2.5 : 2,
          dashArray: isBosque ? '5, 4' : undefined,
          opacity: isSelected ? 1 : 0.9,
          fillColor: baseColor,
          fillOpacity: isSelected ? 0.45 : isAgua ? 0.35 : 0.22,
        },
        onEachFeature: (_feature: any, layer: L.Layer) => {
          layer.on('click', () => {
            setSelectedPotrero(null);
            setSelectedZona(z);
          });
        },
      });

      geoJsonLayer.bindTooltip(
        `<div><strong>${icon} ${escapeHtml(z.nombre)}</strong> (${z.area_hectareas} Ha)<div style="font-weight: 600; font-size: 0.72rem;">${escapeHtml(longLabel)}</div></div>`,
        {
          className: 'farm-map-hover-tooltip',
          direction: 'top',
          sticky: true,
          opacity: 0.98,
        }
      );

      polyGroup.addLayer(geoJsonLayer);

      try {
        const polyBounds = geoJsonLayer.getBounds();
        if (polyBounds.isValid()) {
          bounds.extend(polyBounds);
        }
      } catch {
        // ignore
      }
    });

    if (bounds.isValid()) {
      farmBoundsRef.current = bounds;
    }

    const currentDataKey = `${potreros.length}-${zonasAdicionales.length}-${potreros.map((p) => p.id).join(',')}`;
    if (
      bounds.isValid() &&
      fittedBoundsKeyRef.current !== currentDataKey &&
      (potreros.some((p) => p.geojson_geometry) || zonasAdicionales.some((z) => z.geojson_geometry))
    ) {
      map.invalidateSize();
      map.fitBounds(bounds, { padding: isMobile ? [20, 20] : [40, 40], maxZoom: 17 });
      fittedBoundsKeyRef.current = currentDataKey;
    }
  }, [potreros, zonasAdicionales, tipoLicencia, selectedPotrero?.id, selectedZona?.id, isMobile, mapType, isSunMode]);

  // 2. Renderizar Etiquetas Flotantes Inteligentes (Badges en badgesGroupRef)
  useEffect(() => {
    const badgeGroup = badgesGroupRef.current;
    if (!badgeGroup) return;

    badgeGroup.clearLayers();

    const isDemo = tipoLicencia === 'demo';
    const isOverviewZoom = isMobile ? currentZoom < 15.5 : currentZoom < 14.5;
    const isMediumZoom = isMobile
      ? currentZoom >= 15.5 && currentZoom < 17.5
      : currentZoom >= 14.5 && currentZoom < 16.5;
    const tier: ZoomTier = isOverviewZoom ? 'overview' : isMediumZoom ? 'medium' : 'detail';

    potreros.forEach((p) => {
      const center = centroids.potreroCentroids.get(p.id);
      if (!center) return;

      const isSelected = selectedPotrero?.id === p.id;
      const hasCattle = !isDemo && !!p.potrerada_actual;

      if (tier === 'overview' && !hasCattle && !isSelected) {
        return;
      }

      const html = buildPotreroBadgeHtml(p, tier, isSelected, hasCattle, isMobile);
      const marker = createBadgeMarker(center, html, () => {
        setSelectedZona(null);
        setSelectedPotrero(p);
      });
      badgeGroup.addLayer(marker);
    });

    zonasAdicionales.forEach((z) => {
      const center = centroids.zonaCentroids.get(z.id);
      if (!center) return;

      const isSelected = selectedZona?.id === z.id;
      if (tier === 'overview' && !isSelected) return;

      const { icon, shortLabel, baseColor } = getZonaMeta(z, isSunMode, mapType);
      const html = buildZonaBadgeHtml(z, tier, isSelected, isMobile, icon, shortLabel, baseColor);
      const marker = createBadgeMarker(center, html, () => {
        setSelectedPotrero(null);
        setSelectedZona(z);
      });
      badgeGroup.addLayer(marker);
    });
  }, [
    potreros,
    zonasAdicionales,
    currentZoom,
    isMobile,
    selectedPotrero?.id,
    selectedZona?.id,
    tipoLicencia,
    centroids,
    isSunMode,
    mapType,
  ]);

  const handleCycleMapType = () => {
    const idx = MAP_LAYER_ORDER.indexOf(mapType);
    const next = MAP_LAYER_ORDER[(idx + 1) % MAP_LAYER_ORDER.length];
    setMapType(next);
  };

  const stopGpsTracking = useCallback((clearVisuals = true) => {
    if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    gpsTrackingRef.current = false;
    gpsFollowPausedRef.current = false;
    hasCenteredFirstFixRef.current = false;
    lastCenteredCoordsRef.current = null;
    setGpsTracking(false);
    setGpsFollowPaused(false);
    setGpsLoading(false);

    if (clearVisuals) {
      const map = mapInstanceRef.current;
      if (map) {
        if (userMarkerRef.current) {
          map.removeLayer(userMarkerRef.current);
          userMarkerRef.current = null;
        }
        if (userAccuracyCircleRef.current) {
          map.removeLayer(userAccuracyCircleRef.current);
          userAccuracyCircleRef.current = null;
        }
      }
      setUserLocation(null);
      setCurrentPaddock(null);
      setCurrentSpecialZone(null);
    }
  }, []);

  // Si la licencia deja de ser Premium mientras sigue el GPS, detener el watcher
  useEffect(() => {
    if (tipoLicencia !== 'premium' && gpsTrackingRef.current) {
      stopGpsTracking(true);
    }
  }, [tipoLicencia, stopGpsTracking]);

  // Detectar en vivo potrero o zona especial cada vez que cambia ubicación o inventario
  useEffect(() => {
    if (tipoLicencia !== 'premium' || !userLocation) {
      setCurrentPaddock(null);
      setCurrentSpecialZone(null);
      return;
    }

    const foundPotrero = findCurrentPaddockByGps(userLocation.lat, userLocation.lng, potreros);
    if (foundPotrero) {
      const fullPotrero = potreros.find((p) => p.id === foundPotrero.id) || null;
      setCurrentPaddock(fullPotrero);
      setCurrentSpecialZone(null);
      return;
    }

    setCurrentPaddock(null);
    const foundZone = findCurrentPaddockByGps(userLocation.lat, userLocation.lng, zonasAdicionales);
    if (foundZone) {
      const fullZone = zonasAdicionales.find((z) => z.id === foundZone.id) || null;
      setCurrentSpecialZone(fullZone);
    } else {
      setCurrentSpecialZone(null);
    }
  }, [userLocation, potreros, zonasAdicionales, tipoLicencia]);

  const handleFitFarmBounds = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    // Al pedir vista panorámica, pausar el auto-centrado para que el siguiente tick GPS no devuelva la cámara
    if (gpsTrackingRef.current) {
      gpsFollowPausedRef.current = true;
      setGpsFollowPaused(true);
    }
    if (farmBoundsRef.current && farmBoundsRef.current.isValid()) {
      map.fitBounds(farmBoundsRef.current, { padding: isMobile ? [20, 20] : [40, 40], maxZoom: 17 });
    } else {
      map.setView([centerLat, centerLng], zoom);
    }
  };

  const centerMapOnCoords = useCallback((coords: [number, number], ensureDetailZoom = false) => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const noMotion = prefersReducedMotion();
    if (ensureDetailZoom && map.getZoom() < 16) {
      map.setView(coords, 17, { animate: !noMotion, duration: noMotion ? 0 : 0.65 });
    } else {
      map.panTo(coords, { animate: !noMotion, duration: noMotion ? 0 : 0.45 });
    }
    lastCenteredCoordsRef.current = L.latLng(coords[0], coords[1]);
  }, []);

  const applyGpsPosition = useCallback(
    (pos: GeolocationPosition) => {
      const { latitude, longitude, accuracy } = pos.coords;
      const coords: [number, number] = [latitude, longitude];
      const nextLatLng = L.latLng(latitude, longitude);

      setUserLocation({ lat: latitude, lng: longitude, accuracy });
      setGpsLoading(false);

      const map = mapInstanceRef.current;
      if (!map) return;

      if (!userMarkerRef.current) {
        const userIcon = L.divIcon({
          html: `
            <div class="farm-map-user-marker">
              <div class="farm-map-user-pulse"></div>
              <div class="farm-map-user-dot"></div>
            </div>
          `,
          className: '',
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });
        userMarkerRef.current = L.marker(coords, { icon: userIcon, zIndexOffset: 1000 }).addTo(map);
      } else {
        userMarkerRef.current.setLatLng(coords);
      }

      if (!userAccuracyCircleRef.current) {
        userAccuracyCircleRef.current = L.circle(coords, {
          radius: accuracy,
          color: '#3B82F6',
          fillColor: '#3B82F6',
          fillOpacity: 0.14,
          weight: 1,
        }).addTo(map);
      } else {
        userAccuracyCircleRef.current.setLatLng(coords);
        userAccuracyCircleRef.current.setRadius(accuracy);
      }

      if (!gpsFollowPausedRef.current) {
        if (!hasCenteredFirstFixRef.current) {
          hasCenteredFirstFixRef.current = true;
          centerMapOnCoords(coords, true);
        } else {
          const prev = lastCenteredCoordsRef.current;
          const movedMeters = prev ? prev.distanceTo(nextLatLng) : Infinity;
          if (movedMeters >= 4) {
            centerMapOnCoords(coords, false);
          }
        }
      }
    },
    [centerMapOnCoords]
  );

  // Activar/desactivar seguimiento continuo GPS (Modo Vuelta)
  const handleToggleGps = () => {
    if (tipoLicencia !== 'premium') {
      showNotice({
        type: 'warning',
        message: 'El seguimiento GPS en vivo está disponible en el Plan Premium.',
        actionLabel: 'Ver Planes',
        onAction: () => {
          window.location.href = '/suscripcion';
        },
      });
      return;
    }

    if (!navigator.geolocation) {
      showNotice({
        type: 'error',
        message: 'Este navegador o dispositivo no soporta geolocalización GPS.',
      });
      return;
    }

    if (gpsTrackingRef.current) {
      stopGpsTracking(true);
      return;
    }

    setMapNotice(null);
    setGpsLoading(true);
    gpsTrackingRef.current = true;
    gpsFollowPausedRef.current = false;
    hasCenteredFirstFixRef.current = false;
    lastCenteredCoordsRef.current = null;
    setGpsTracking(true);
    setGpsFollowPaused(false);

    watchIdRef.current = navigator.geolocation.watchPosition(
      applyGpsPosition,
      (err) => {
        if (err.code === 1) {
          stopGpsTracking(true);
          showNotice({
            type: 'error',
            message: 'Permiso de GPS denegado. Habilita la ubicación en tu navegador o celular.',
          });
          return;
        }

        if (!hasCenteredFirstFixRef.current) {
          stopGpsTracking(true);
          showNotice({
            type: 'error',
            message: `No se pudo fijar tu posición GPS: ${err.message}`,
            actionLabel: 'Reintentar',
            onAction: handleToggleGps,
          });
          return;
        }

        // Fallo puntual en recorrido (ej. bajo árboles): conservar seguimiento activo
        setGpsLoading(false);
        showNotice({
          type: 'warning',
          message: 'Señal GPS débil momentánea; manteniendo seguimiento en recorrido.',
        });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 3000 }
    );
  };

  const handleRecenterGps = () => {
    gpsFollowPausedRef.current = false;
    setGpsFollowPaused(false);
    if (userLocation) {
      const map = mapInstanceRef.current;
      centerMapOnCoords([userLocation.lat, userLocation.lng], map ? map.getZoom() < 15.5 : false);
    }
  };

  const hasOpenSheet = Boolean(selectedPotrero || selectedZona);
  const wrapperClassName = [
    'farm-map-wrapper',
    hasOpenSheet ? 'farm-map-wrapper--sheet-open' : '',
    mapType === 'plain' ? 'farm-map-wrapper--plain' : '',
    isSunMode ? 'farm-map-wrapper--sun' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={wrapperClassName}>
      {/* Contenedor del Mapa Leaflet */}
      <div ref={mapContainerRef} className="farm-map-canvas" />

      {/* Controles principales: arriba en PC, zona del pulgar abajo en móvil/tablet */}
      <div className="farm-map-topbar">
        <div className="farm-map-left-controls">
          <button
            type="button"
            className={`farm-map-btn farm-map-gps-btn ${
              tipoLicencia !== 'premium'
                ? 'farm-map-gps-btn--locked'
                : gpsTracking
                ? 'farm-map-gps-btn--active'
                : 'farm-map-gps-btn--premium'
            }`}
            onClick={handleToggleGps}
            aria-pressed={tipoLicencia === 'premium' ? gpsTracking : undefined}
            aria-busy={gpsLoading}
            aria-label={
              tipoLicencia !== 'premium'
                ? 'GPS disponible en Plan Premium'
                : gpsTracking
                ? 'Desactivar seguimiento GPS continuo'
                : 'Activar seguimiento GPS continuo'
            }
          >
            {tipoLicencia !== 'premium' ? (
              <>
                <Lock size={15} color="var(--warning)" aria-hidden="true" />
                <span>{isMobile ? 'GPS' : 'GPS (Plan Premium)'}</span>
              </>
            ) : gpsLoading ? (
              <>
                <RefreshCw className="animate-spin" size={16} aria-hidden="true" />
                <span>{isMobile ? 'Buscando...' : 'Localizando GPS...'}</span>
              </>
            ) : (
              <>
                <Navigation
                  size={16}
                  aria-hidden="true"
                  style={{
                    color: gpsTracking ? '#A7F3D0' : '#FFFFFF',
                    transform: gpsTracking ? 'rotate(45deg)' : 'none',
                    transition: 'transform 0.25s ease',
                  }}
                />
                <span>Seguir GPS</span>
                {gpsTracking && (
                  <span
                    title="Seguimiento GPS en vivo activo"
                    aria-hidden="true"
                    className="farm-map-gps-dot"
                  />
                )}
              </>
            )}
          </button>

          {gpsTracking && gpsFollowPaused && (
            <button
              type="button"
              className="farm-map-btn farm-map-recenter-btn"
              onClick={handleRecenterGps}
              aria-label="Recentrar mapa en mi ubicación"
            >
              <LocateFixed size={16} aria-hidden="true" />
              <span>Recentrar</span>
            </button>
          )}
        </div>

        <div className="farm-map-right-controls">
          <button
            type="button"
            className="farm-map-btn farm-map-layers-btn"
            onClick={handleCycleMapType}
            title="Cambiar vista del mapa (Satélite, Plano, Terreno)"
            aria-label={`Cambiar vista del mapa, actual: ${MAP_LAYER_LABELS[mapType]}`}
          >
            <Layers size={16} color="var(--info)" aria-hidden="true" />
            <span>{MAP_LAYER_LABELS[mapType]}</span>
          </button>

          {userRole === 'administrador' && onOpenUploader && !isMobile && (
            <button
              type="button"
              className="farm-map-btn farm-map-kmz-btn"
              onClick={onOpenUploader}
            >
              <Upload size={15} aria-hidden="true" /> KMZ
            </button>
          )}
        </div>
      </div>

      {/* Controles accesibles de Zoom y Encuadre en zona del pulgar */}
      <div className="farm-map-zoom-dock" role="group" aria-label="Controles de zoom y vista de finca">
        <div className="farm-map-zoom-group">
          <button
            type="button"
            className="farm-map-zoom-btn"
            onClick={() => mapInstanceRef.current?.zoomIn()}
            aria-label="Acercar mapa"
            title="Acercar mapa"
          >
            <Plus size={20} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="farm-map-zoom-btn"
            onClick={() => mapInstanceRef.current?.zoomOut()}
            aria-label="Alejar mapa"
            title="Alejar mapa"
          >
            <Minus size={20} aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          className="farm-map-zoom-btn farm-map-fit-btn"
          onClick={handleFitFarmBounds}
          aria-label="Ver toda la finca"
          title="Ver toda la finca"
        >
          <Maximize2 size={18} aria-hidden="true" />
        </button>
      </div>

      {/* Avisos no bloqueantes dentro del mapa */}
      <div
        className="farm-map-toast-region"
        role="region"
        aria-label="Avisos del mapa"
        onMouseEnter={() => setToastPaused(true)}
        onMouseLeave={() => setToastPaused(false)}
        onFocus={() => setToastPaused(true)}
        onBlur={() => setToastPaused(false)}
      >
        {mapNotice && (
          <div
            className={`farm-map-toast farm-map-toast--${mapNotice.type}`}
            role={mapNotice.type === 'error' ? 'alert' : 'status'}
            aria-live={mapNotice.type === 'error' ? 'assertive' : 'polite'}
          >
            <div className="farm-map-toast-main">
              {mapNotice.type === 'error' || mapNotice.type === 'warning' ? (
                <AlertCircle
                  size={18}
                  aria-hidden="true"
                  color={mapNotice.type === 'error' ? 'var(--error)' : 'var(--warning)'}
                  style={{ flexShrink: 0, marginTop: '2px' }}
                />
              ) : (
                <Info
                  size={18}
                  aria-hidden="true"
                  color="var(--info)"
                  style={{ flexShrink: 0, marginTop: '2px' }}
                />
              )}
              <div style={{ minWidth: 0 }}>
                <div>{mapNotice.message}</div>
                {mapNotice.actionLabel && mapNotice.onAction && (
                  <div className="farm-map-toast-actions">
                    <button
                      type="button"
                      className="farm-map-toast-action-btn"
                      onClick={() => {
                        const action = mapNotice.onAction;
                        setMapNotice(null);
                        action?.();
                      }}
                    >
                      {mapNotice.actionLabel}
                    </button>
                  </div>
                )}
              </div>
            </div>
            <button
              type="button"
              className="farm-map-toast-close"
              onClick={() => setMapNotice(null)}
              aria-label="Cerrar aviso"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      <MapHudAndDrawers
        tipoLicencia={tipoLicencia}
        userRole={userRole}
        gpsTracking={gpsTracking}
        userLocation={userLocation}
        currentPaddock={currentPaddock}
        currentSpecialZone={currentSpecialZone}
        selectedPotrero={selectedPotrero}
        selectedZona={selectedZona}
        onSelectPotrero={setSelectedPotrero}
        onSelectZona={setSelectedZona}
        onMoveCattleToPotrero={onMoveCattleToPotrero}
      />
    </div>
  );
};
