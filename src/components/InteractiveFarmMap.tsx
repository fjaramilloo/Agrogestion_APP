import React, { useEffect, useMemo, useRef, useState } from 'react';
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
    marcas: string[];
    fecha_ultimo_pesaje?: string | null;
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
  const polygonsGroupRef = useRef<L.FeatureGroup | null>(null);
  const badgesGroupRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  const [mapType, setMapType] = useState<'satellite' | 'street'>('satellite');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [currentPaddock, setCurrentPaddock] = useState<PotreroMapData | null>(null);
  const [currentSpecialZone, setCurrentSpecialZone] = useState<ZonaAdicionalMapData | null>(null);
  const [selectedPotrero, setSelectedPotrero] = useState<PotreroMapData | null>(null);
  const [selectedZona, setSelectedZona] = useState<ZonaAdicionalMapData | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);

  const [currentZoom, setCurrentZoom] = useState<number>(zoom);
  const fittedBoundsKeyRef = useRef<string>('');

  // Detectar si estamos en pantalla móvil
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // Inicialización del Mapa de Leaflet y Capas Base
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [centerLat, centerLng],
        zoom: zoom,
        zoomControl: false,
      });

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      map.on('zoomend', () => {
        setCurrentZoom(map.getZoom());
      });

      // Crear grupos dedicados para evitar redraws masivos del mapa
      const polyGroup = L.featureGroup().addTo(map);
      const badgeGroup = L.layerGroup().addTo(map);
      polygonsGroupRef.current = polyGroup;
      badgesGroupRef.current = badgeGroup;

      mapInstanceRef.current = map;

      // Invalidate size para asegurar que el mapa ocupe el 100% del contenedor sin franjas negras
      setTimeout(() => map.invalidateSize(), 100);
      setTimeout(() => map.invalidateSize(), 300);
    }

    return () => {
      // Cleanup al desmontar para evitar fugas de memoria
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        polygonsGroupRef.current = null;
        badgesGroupRef.current = null;
        tileLayerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Capa Base (Satélite vs Calles) gestionada sin reiniciar el mapa
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    const tileLayer = mapType === 'satellite'
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

  // Precalcular centroides de polígonos para evitar recalcularlos en cada evento de zoom/render
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

  // 1. Renderizar Polígonos GeoJSON en polygonsGroupRef (Solo cuando cambia data o selección)
  // Este efecto NUNCA se ejecuta al cambiar el zoom, lo que hace el mapa ultra fluido
  useEffect(() => {
    const map = mapInstanceRef.current;
    const polyGroup = polygonsGroupRef.current;
    if (!map || !polyGroup) return;

    // Limpiar únicamente la capa de polígonos
    polyGroup.clearLayers();

    const bounds = L.latLngBounds([]);
    const isDemo = tipoLicencia === 'demo';

    // 1. Renderizar Polígonos de Potreros
    potreros.forEach((p) => {
      if (!p.geojson_geometry) return;

      const isSelected = selectedPotrero?.id === p.id;
      const hasCattle = !isDemo && !!p.potrerada_actual;
      const baseColor = isDemo ? '#10B981' : hasCattle ? '#64748B' : '#10B981';
      const polyColor = isSelected ? '#F59E0B' : baseColor;

      const geoJsonLayer = L.geoJSON(p.geojson_geometry, {
        style: {
          color: polyColor,
          weight: isSelected ? 3.5 : 2,
          opacity: isSelected ? 1 : 0.85,
          fillColor: baseColor,
          fillOpacity: isSelected ? 0.38 : 0.22,
        },
        onEachFeature: (_feature: any, layer: L.Layer) => {
          layer.on('click', () => {
            setSelectedZona(null);
            setSelectedPotrero(p);
          });
        },
      });

      // Tooltip informativo rápido al pasar el cursor (Hover en PC)
      const hoverTooltipContent = `
        <div style="font-family: system-ui, sans-serif; font-size: 11px; padding: 2px;">
          <strong style="color: #0F172A;">${p.nombre}</strong> (${p.area_hectareas} Ha)
          ${hasCattle ? `<div style="color: #475569; font-weight: 600; margin-top: 2px;">🐮 ${p.potrerada_actual?.nombre} (${p.potrerada_actual?.total_animales} cbs)</div>` : '<div style="color: #16A34A; font-size: 10px;">🟢 Disponible / Descanso</div>'}
        </div>
      `;
      geoJsonLayer.bindTooltip(hoverTooltipContent, {
        direction: 'top',
        sticky: true,
        opacity: 0.95,
      });

      polyGroup.addLayer(geoJsonLayer);

      try {
        const polyBounds = geoJsonLayer.getBounds();
        if (polyBounds.isValid()) {
          bounds.extend(polyBounds);
        }
      } catch (e) {
        // ignore
      }
    });

    // 2. Renderizar Zonas Especiales No Ganaderas (Bosques, Agua, Infraestructura)
    zonasAdicionales.forEach((z) => {
      if (!z.geojson_geometry) return;

      const isSelected = selectedZona?.id === z.id;
      const isBosque = z.tipo === 'bosque' || z.tipo === 'reforestacion' || z.tipo === 'reserva';
      const isAgua = z.tipo === 'agua';
      const isInfra = z.tipo === 'infraestructura';

      const baseZoneColor = z.color || (isBosque ? '#059669' : isAgua ? '#0284C7' : isInfra ? '#D97706' : '#8B5CF6');
      const zoneColor = isSelected ? '#F59E0B' : baseZoneColor;
      const zoneIcon = isBosque ? '🌳' : isAgua ? '💧' : isInfra ? '🏠' : '📍';
      const zoneLabel = isBosque ? 'Bosque/Reforestación' : isAgua ? 'Agua' : isInfra ? 'Infraestructura' : 'Zona Especial';

      const geoJsonLayer = L.geoJSON(z.geojson_geometry, {
        style: {
          color: zoneColor,
          weight: isSelected ? 3.5 : 2,
          dashArray: isBosque ? '4, 4' : undefined,
          opacity: isSelected ? 1 : 0.85,
          fillColor: baseZoneColor,
          fillOpacity: isSelected ? 0.45 : isAgua ? 0.35 : 0.22,
        },
        onEachFeature: (_feature: any, layer: L.Layer) => {
          layer.on('click', () => {
            setSelectedPotrero(null);
            setSelectedZona(z);
          });
        },
      });

      geoJsonLayer.bindTooltip(`
        <div style="font-family: system-ui, sans-serif; font-size: 11px; padding: 2px;">
          <strong style="color: #0F172A;">${zoneIcon} ${z.nombre}</strong> (${z.area_hectareas} Ha)
          <div style="color: ${baseZoneColor}; font-weight: 600; font-size: 10px;">${zoneLabel}</div>
        </div>
      `, {
        direction: 'top',
        sticky: true,
        opacity: 0.95,
      });

      polyGroup.addLayer(geoJsonLayer);

      try {
        const polyBounds = geoJsonLayer.getBounds();
        if (polyBounds.isValid()) {
          bounds.extend(polyBounds);
        }
      } catch (e) {
        // ignore
      }
    });

    // Ajustar vista del mapa al cargar la finca por primera vez
    const currentDataKey = `${potreros.length}-${zonasAdicionales.length}-${potreros.map(p => p.id).join(',')}`;
    if (bounds.isValid() && fittedBoundsKeyRef.current !== currentDataKey && (potreros.some((p) => p.geojson_geometry) || zonasAdicionales.some((z) => z.geojson_geometry))) {
      map.invalidateSize();
      map.fitBounds(bounds, { padding: isMobile ? [20, 20] : [40, 40], maxZoom: 17 });
      fittedBoundsKeyRef.current = currentDataKey;
    }
  }, [potreros, zonasAdicionales, tipoLicencia, selectedPotrero?.id, selectedZona?.id, isMobile]);

  // 2. Renderizar Etiquetas Flotantes Inteligentes (Badges en badgesGroupRef)
  // Controla la densidad visual para que en zoom panorámico NO se amontonen las 50 etiquetas
  useEffect(() => {
    const badgeGroup = badgesGroupRef.current;
    if (!badgeGroup) return;

    badgeGroup.clearLayers();

    const isDemo = tipoLicencia === 'demo';
    // Determinar umbral según dispositivo:
    // En celular una finca completa suele quedar en zoom 13-15.5
    // En PC suele quedar en zoom 13-14
    const isOverviewZoom = isMobile ? currentZoom < 15.5 : currentZoom < 14.5;
    const isMediumZoom = isMobile ? (currentZoom >= 15.5 && currentZoom < 17.5) : (currentZoom >= 14.5 && currentZoom < 16.5);

    // 1. Badges de Potreros
    potreros.forEach((p) => {
      const center = centroids.potreroCentroids.get(p.id);
      if (!center) return;

      const isSelected = selectedPotrero?.id === p.id;
      const hasCattle = !isDemo && !!p.potrerada_actual;
      const baseColor = isDemo ? '#10B981' : hasCattle ? '#64748B' : '#10B981';
      const polyColor = isSelected ? '#F59E0B' : baseColor;

      // EN VISTA PANORÁMICA (Zoom alejado):
      // Para evitar que 50 etiquetas se encimen formando una pirámide ilegible:
      // - Si tiene ganado: Mostrar badge compacto con ícono de vaca y nombre del lote
      // - Si está seleccionado: Mostrar badge destacado en ámbar
      // - Si está vacío y no seleccionado: NO mostrar texto (mapa limpio y despejado)
      if (isOverviewZoom) {
        if (!hasCattle && !isSelected) {
          // Potrero vacío en vista panorámica: no genera marcador DOM, máxima fluidez
          return;
        }

        let badgeHtml = '';
        let iconWidth = 90;
        let iconHeight = 22;

        if (isSelected) {
          badgeHtml = `
            <div style="
              background-color: #D97706;
              border: 1.5px solid #FEF3C7;
              border-radius: 6px;
              padding: 2px 7px;
              color: white;
              font-family: system-ui, sans-serif;
              font-size: 10px;
              font-weight: 700;
              text-align: center;
              box-shadow: 0 2px 8px rgba(0,0,0,0.6);
              white-space: nowrap;
              cursor: pointer;
            ">
              ${p.nombre} (${p.area_hectareas} Ha)
            </div>
          `;
          iconWidth = 100;
          iconHeight = 22;
        } else if (hasCattle) {
          const potreradaNombre = p.potrerada_actual?.nombre || 'Lote';
          const nombreCorto = potreradaNombre.length > 12 ? potreradaNombre.substring(0, 10) + '…' : potreradaNombre;
          badgeHtml = `
            <div style="
              background-color: #1E293B;
              border: 1.5px solid #38BDF8;
              border-radius: 12px;
              padding: 2px 7px;
              color: #F8FAFC;
              font-family: system-ui, sans-serif;
              font-size: 9.5px;
              font-weight: 700;
              text-align: center;
              box-shadow: 0 2px 8px rgba(0,0,0,0.6);
              white-space: nowrap;
              cursor: pointer;
              display: inline-flex;
              align-items: center;
              gap: 4px;
            ">
              <span>🐮</span>
              <span style="color: #BAE6FD;">${nombreCorto}</span>
              <span style="background: rgba(56, 189, 248, 0.2); color: #38BDF8; font-size: 8.5px; padding: 0 3px; border-radius: 4px;">${p.potrerada_actual?.total_animales || ''}</span>
            </div>
          `;
          iconWidth = 90;
          iconHeight = 22;
        }

        const customIcon = L.divIcon({
          html: badgeHtml,
          className: '',
          iconSize: [iconWidth, iconHeight],
          iconAnchor: [iconWidth / 2, iconHeight / 2],
        });

        const marker = L.marker(center, { icon: customIcon });
        marker.on('click', () => {
          setSelectedZona(null);
          setSelectedPotrero(p);
        });
        badgeGroup.addLayer(marker);
        return;
      }

      // EN VISTA DE SECTOR (Zoom medio):
      if (isMediumZoom) {
        const nombreDisplay = isMobile && p.nombre.length > 10 ? p.nombre.substring(0, 10) + '…' : p.nombre;
        const badgeHtml = `
          <div style="
            background-color: ${isSelected ? '#D97706' : 'rgba(15, 23, 42, 0.94)'};
            border: 1.5px solid ${isSelected ? '#FFFFFF' : polyColor};
            border-radius: 6px;
            padding: 2px 7px;
            color: white;
            font-family: system-ui, sans-serif;
            font-size: 10px;
            font-weight: 600;
            text-align: center;
            box-shadow: 0 2px 6px rgba(0,0,0,0.5);
            white-space: nowrap;
            cursor: pointer;
          ">
            <div style="display: flex; align-items: center; justify-content: center; gap: 4px;">
              <span style="font-weight: 700; color: #F8FAFC;">${nombreDisplay}</span>
              <span style="font-size: 9px; color: ${isSelected ? '#FEF3C7' : '#94A3B8'};">${p.area_hectareas} Ha</span>
            </div>
            ${hasCattle ? `<div style="margin-top: 2px; font-size: 8.5px; background: #334155; color: #38BDF8; padding: 1px 4px; border-radius: 3px; font-weight: 600;">🐮 ${p.potrerada_actual?.nombre} (${p.potrerada_actual?.total_animales} cbs)</div>` : ''}
          </div>
        `;
        const iconWidth = hasCattle ? 110 : 85;
        const iconHeight = hasCattle ? 34 : 22;

        const customIcon = L.divIcon({
          html: badgeHtml,
          className: '',
          iconSize: [iconWidth, iconHeight],
          iconAnchor: [iconWidth / 2, iconHeight / 2],
        });

        const marker = L.marker(center, { icon: customIcon });
        marker.on('click', () => {
          setSelectedZona(null);
          setSelectedPotrero(p);
        });
        badgeGroup.addLayer(marker);
        return;
      }

      // EN VISTA DETALLADA (Zoom cercano):
      const badgeHtml = `
        <div style="
          background-color: ${isSelected ? '#D97706' : 'rgba(15, 23, 42, 0.95)'};
          border: 1.5px solid ${isSelected ? '#FFFFFF' : polyColor};
          border-radius: 8px;
          padding: 4px 8px;
          color: white;
          font-family: system-ui, sans-serif;
          font-size: 11px;
          font-weight: 600;
          text-align: center;
          box-shadow: 0 4px 14px rgba(0,0,0,0.5);
          white-space: nowrap;
          cursor: pointer;
        ">
          <div style="color: #F8FAFC; font-weight: 700;">${p.nombre}</div>
          <div style="font-size: 9.5px; color: ${isSelected ? '#FEF3C7' : '#94A3B8'};">${p.area_hectareas} Ha</div>
          ${
            hasCattle
              ? `<div style="margin-top: 3px; font-size: 9px; background: #334155; color: #38BDF8; padding: 2px 6px; border-radius: 4px; font-weight: 600;">🐮 ${p.potrerada_actual?.nombre} (${p.potrerada_actual?.total_animales} cbs &bull; ${p.potrerada_actual?.peso_promedio}kg)</div>`
              : ''
          }
        </div>
      `;
      const iconWidth = 125;
      const iconHeight = hasCattle ? 46 : 30;

      const customIcon = L.divIcon({
        html: badgeHtml,
        className: '',
        iconSize: [iconWidth, iconHeight],
        iconAnchor: [iconWidth / 2, iconHeight / 2],
      });

      const marker = L.marker(center, { icon: customIcon });
      marker.on('click', () => {
        setSelectedZona(null);
        setSelectedPotrero(p);
      });
      badgeGroup.addLayer(marker);
    });

    // 2. Badges de Zonas Especiales
    zonasAdicionales.forEach((z) => {
      const center = centroids.zonaCentroids.get(z.id);
      if (!center) return;

      const isSelected = selectedZona?.id === z.id;
      const isBosque = z.tipo === 'bosque' || z.tipo === 'reforestacion' || z.tipo === 'reserva';
      const isAgua = z.tipo === 'agua';
      const isInfra = z.tipo === 'infraestructura';

      const baseZoneColor = z.color || (isBosque ? '#059669' : isAgua ? '#0284C7' : isInfra ? '#D97706' : '#8B5CF6');
      const zoneColor = isSelected ? '#F59E0B' : baseZoneColor;
      const zoneIcon = isBosque ? '🌳' : isAgua ? '💧' : isInfra ? '🏠' : '📍';
      const zoneLabel = isBosque ? 'Bosque' : isAgua ? 'Agua' : isInfra ? 'Infraestructura' : 'Zona Especial';

      // En vista panorámica: Solo mostrar si está seleccionada
      if (isOverviewZoom) {
        if (!isSelected) return;

        const badgeHtml = `
          <div style="
            background-color: #D97706;
            border: 1.5px solid #FEF3C7;
            border-radius: 6px;
            padding: 2px 7px;
            color: white;
            font-family: system-ui, sans-serif;
            font-size: 10px;
            font-weight: 700;
            box-shadow: 0 2px 8px rgba(0,0,0,0.6);
            white-space: nowrap;
            cursor: pointer;
          ">
            ${zoneIcon} ${z.nombre}
          </div>
        `;
        const customIcon = L.divIcon({
          html: badgeHtml,
          className: '',
          iconSize: [90, 22],
          iconAnchor: [45, 11],
        });
        const marker = L.marker(center, { icon: customIcon });
        marker.on('click', () => {
          setSelectedPotrero(null);
          setSelectedZona(z);
        });
        badgeGroup.addLayer(marker);
        return;
      }

      // En vista de sector:
      if (isMediumZoom) {
        const nombreDisplay = isMobile && z.nombre.length > 10 ? z.nombre.substring(0, 10) + '…' : z.nombre;
        const badgeHtml = `
          <div style="
            background-color: ${isSelected ? '#D97706' : 'rgba(15, 23, 42, 0.94)'};
            border: 1px solid ${isSelected ? '#FFFFFF' : zoneColor};
            border-radius: 6px;
            padding: 2px 7px;
            color: white;
            font-family: system-ui, sans-serif;
            font-size: 10px;
            font-weight: 600;
            text-align: center;
            box-shadow: 0 2px 6px rgba(0,0,0,0.5);
            white-space: nowrap;
            cursor: pointer;
          ">
            <span style="font-weight: 700; color: #F8FAFC;">${zoneIcon} ${nombreDisplay}</span>
            <span style="font-size: 9px; color: ${isSelected ? '#FEF3C7' : '#94A3B8'}; margin-left: 4px;">${z.area_hectareas} Ha</span>
          </div>
        `;
        const customIcon = L.divIcon({
          html: badgeHtml,
          className: '',
          iconSize: [100, 22],
          iconAnchor: [50, 11],
        });
        const marker = L.marker(center, { icon: customIcon });
        marker.on('click', () => {
          setSelectedPotrero(null);
          setSelectedZona(z);
        });
        badgeGroup.addLayer(marker);
        return;
      }

      // En vista detallada:
      const badgeHtml = `
        <div style="
          background-color: ${isSelected ? '#D97706' : 'rgba(15, 23, 42, 0.95)'};
          border: 1.5px solid ${isSelected ? '#FFFFFF' : zoneColor};
          border-radius: 8px;
          padding: 4px 8px;
          color: white;
          font-family: system-ui, sans-serif;
          font-size: 11px;
          font-weight: 600;
          text-align: center;
          box-shadow: 0 4px 14px rgba(0,0,0,0.5);
          white-space: nowrap;
          cursor: pointer;
        ">
          <div style="color: #F8FAFC; font-weight: 700;">${zoneIcon} ${z.nombre}</div>
          <div style="font-size: 9.5px; color: ${isSelected ? '#FEF3C7' : baseZoneColor}; font-weight: 600;">${z.area_hectareas} Ha &bull; ${zoneLabel}</div>
        </div>
      `;
      const customIcon = L.divIcon({
        html: badgeHtml,
        className: '',
        iconSize: [125, 42],
        iconAnchor: [62, 21],
      });
      const marker = L.marker(center, { icon: customIcon });
      marker.on('click', () => {
        setSelectedPotrero(null);
        setSelectedZona(z);
      });
      badgeGroup.addLayer(marker);
    });
  }, [potreros, zonasAdicionales, currentZoom, isMobile, selectedPotrero?.id, selectedZona?.id, tipoLicencia, centroids]);

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
    <div style={{ position: 'relative', width: '100%', height: 'calc(100vh - 120px)', borderRadius: '16px', overflow: 'hidden', border: '1px solid #334155', zIndex: 1, isolation: 'isolate' }}>
      {/* Contenedor del Mapa Leaflet */}
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%', zIndex: 1, backgroundColor: '#0f1715' }} />

      {/* Barra Superior Flotante: Mi Ubicación GPS (Izquierda, Hero) y Capas (Derecha) */}
      <div style={{
        position: 'absolute',
        top: '14px',
        left: '14px',
        right: '14px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 1000,
        pointerEvents: 'none',
      }}>
        {/* Botón Principal y Prioritario: Mi Ubicación GPS */}
        <button
          onClick={handleTrackGps}
          disabled={gpsLoading}
          style={{
            pointerEvents: 'auto',
            background: tipoLicencia === 'premium'
              ? 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)'
              : '#1E293B',
            border: tipoLicencia === 'premium' ? '1px solid rgba(147, 197, 253, 0.45)' : '1px solid #475569',
            color: tipoLicencia === 'premium' ? '#FFFFFF' : '#94A3B8',
            padding: isMobile ? '8px 14px' : '9px 18px',
            borderRadius: '30px',
            cursor: gpsLoading ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: isMobile ? '0.82rem' : '0.88rem',
            fontWeight: 700,
            letterSpacing: '0.01em',
            boxShadow: tipoLicencia === 'premium'
              ? '0 4px 18px rgba(37, 99, 235, 0.55), 0 2px 6px rgba(0, 0, 0, 0.35)'
              : '0 4px 12px rgba(0, 0, 0, 0.4)',
            transition: 'all 0.2s ease',
          }}
        >
          {tipoLicencia !== 'premium' ? (
            <>
              <Lock size={15} color="#F59E0B" />
              <span>GPS (Plan Premium)</span>
            </>
          ) : gpsLoading ? (
            <>
              <RefreshCw className="animate-spin" size={16} />
              <span>Localizando GPS...</span>
            </>
          ) : (
            <>
              <Navigation 
                size={16} 
                style={{ 
                  color: userLocation ? '#67E8F9' : '#FFFFFF',
                  transform: userLocation ? 'rotate(45deg)' : 'none',
                  transition: 'transform 0.3s ease'
                }} 
              />
              <span>{userLocation ? 'Mi Ubicación GPS' : 'Mi Ubicación GPS'}</span>
              {userLocation && (
                <span 
                  title="GPS Activo en vivo"
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: '#4ADE80',
                    boxShadow: '0 0 8px #4ADE80',
                    display: 'inline-block',
                    marginLeft: '2px',
                    flexShrink: 0,
                  }} 
                />
              )}
            </>
          )}
        </button>

        {/* Grupo Superior Derecho: Capas y KMZ */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', pointerEvents: 'auto' }}>
          {/* Cambiar Capa Satélite/Calle */}
          <button
            onClick={() => setMapType(mapType === 'satellite' ? 'street' : 'satellite')}
            title="Cambiar tipo de mapa"
            style={{
              backgroundColor: 'rgba(15, 23, 42, 0.88)',
              border: '1px solid #334155',
              color: '#F8FAFC',
              padding: isMobile ? '7px 11px' : '8px 14px',
              borderRadius: '20px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.78rem',
              fontWeight: 500,
              backdropFilter: 'blur(8px)',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
            }}
          >
            <Layers size={15} color="#38BDF8" />
            <span>{mapType === 'satellite' ? 'Satélite' : 'Terreno'}</span>
          </button>

          {/* Botón Cargar Plano KMZ (Solo Administradores en Escritorio) */}
          {userRole === 'administrador' && onOpenUploader && !isMobile && (
            <button
              onClick={onOpenUploader}
              style={{
                backgroundColor: '#10B981',
                color: '#FFFFFF',
                border: 'none',
                padding: '8px 14px',
                borderRadius: '20px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.8rem',
                fontWeight: 600,
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)',
              }}
            >
              <Upload size={15} /> KMZ
            </button>
          )}
        </div>
      </div>

      {/* Banner de Estado GPS / Ubicación Actual (Solo Premium, posicionado bajo la barra superior) */}
      {tipoLicencia === 'premium' && currentPaddock && (
        <div style={{
          position: 'absolute',
          top: '64px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(10px)',
          border: '1px solid #3B82F6',
          borderRadius: '16px',
          padding: '10px 18px',
          color: '#F8FAFC',
          fontSize: '0.82rem',
          zIndex: 999,
          boxShadow: '0 10px 30px -5px rgba(0, 0, 0, 0.6)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: '5px',
          maxWidth: '92%',
          width: isMobile ? 'calc(100% - 28px)' : 'auto',
          boxSizing: 'border-box',
        }}>
          {/* Fila 1: dónde estás */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '0.88rem' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#3B82F6', flexShrink: 0 }} />
            📍 Estás en: <span style={{ color: '#60A5FA' }}>{currentPaddock.nombre}</span>
            <span style={{ color: '#94A3B8', fontWeight: 400, fontSize: '0.78rem' }}>{currentPaddock.area_hectareas} Ha</span>
          </div>
          {currentPaddock.potrerada_actual && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '18px' }}>
              {/* Fila 2: animales */}
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', color: '#CBD5E1', fontSize: '0.78rem' }}>
                <span>🐄 <strong style={{ color: '#F8FAFC' }}>{currentPaddock.potrerada_actual.total_animales} animales</strong></span>
                <span>⏱️ <strong>{currentPaddock.potrerada_actual.dias_en_potrero} días</strong></span>
                <span>⚖️ Prom: <strong>{currentPaddock.potrerada_actual.peso_promedio} kg</strong></span>
                <span>📈 Est: <strong>{currentPaddock.potrerada_actual.peso_promedio_estimado} kg</strong></span>
              </div>
              {/* Fila 3: marcas / propietarios */}
              {currentPaddock.potrerada_actual.marcas && currentPaddock.potrerada_actual.marcas.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', fontSize: '0.75rem', color: '#94A3B8' }}>
                  <span>🏷️ Marca{currentPaddock.potrerada_actual.marcas.length > 1 ? 's' : ''}:</span>
                  {currentPaddock.potrerada_actual.marcas.map((m, i) => (
                    <span key={i} style={{
                      backgroundColor: '#1E3A5F',
                      color: '#93C5FD',
                      padding: '1px 7px',
                      borderRadius: '99px',
                      fontWeight: 600,
                      fontSize: '0.72rem',
                    }}>{m}</span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Banner de Zona Especial Actual (Solo Premium, posicionado bajo la barra superior) */}
      {tipoLicencia === 'premium' && !currentPaddock && currentSpecialZone && (
        <div style={{
          position: 'absolute',
          top: '64px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(10px)',
          border: currentSpecialZone.tipo === 'bosque' ? '1px solid #059669' : currentSpecialZone.tipo === 'agua' ? '1px solid #0284C7' : '1px solid #D97706',
          borderRadius: '20px',
          padding: '10px 22px',
          color: '#F8FAFC',
          fontSize: '0.85rem',
          zIndex: 999,
          boxShadow: '0 10px 30px -5px rgba(0, 0, 0, 0.6)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontWeight: 700,
          maxWidth: '92%',
          width: isMobile ? 'calc(100% - 28px)' : 'auto',
          boxSizing: 'border-box',
        }}>
          <span>
            📍 Estás en: <span style={{ color: currentSpecialZone.tipo === 'bosque' ? '#34D399' : currentSpecialZone.tipo === 'agua' ? '#38BDF8' : '#FBBF24' }}>
              {currentSpecialZone.tipo === 'bosque' ? '🌳' : currentSpecialZone.tipo === 'agua' ? '💧' : '🏠'} {currentSpecialZone.nombre}
            </span> ({currentSpecialZone.area_hectareas} Ha &bull; {currentSpecialZone.tipo === 'bosque' ? 'Zona Ambiental / Forestal' : currentSpecialZone.tipo === 'agua' ? 'Cuerpo de Agua' : 'Infraestructura'})
          </span>
        </div>
      )}

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
                color: tipoLicencia === 'demo' ? '#94A3B8' : selectedPotrero.potrerada_actual ? '#CBD5E1' : '#34D399',
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
              border: '1px solid #64748B50',
              borderRadius: '12px',
              padding: '14px',
              marginBottom: '16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', borderBottom: '1px solid #334155', paddingBottom: '8px' }}>
                <Users size={18} color="#94A3B8" />
                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#F1F5F9' }}>
                  Lote de Ganado
                </span>
                {/* Mostrar nombre del lote solo si difiere del nombre del potrero */}
                {selectedPotrero.potrerada_actual.nombre !== selectedPotrero.nombre && (
                  <span style={{ fontSize: '0.78rem', color: '#94A3B8', fontWeight: 400 }}>
                    · {selectedPotrero.potrerada_actual.nombre}
                  </span>
                )}
              </div>

              {/* Grid de 4 Métricas Clave */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <div style={{ backgroundColor: '#0F172A', padding: '8px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.7rem', color: '#94A3B8' }}>🐄 Animales</div>
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
                  {selectedPotrero.potrerada_actual.fecha_ultimo_pesaje && (
                    <div style={{ fontSize: '0.65rem', color: '#64748B', marginTop: '2px', fontWeight: 500 }}>
                      📅 {selectedPotrero.potrerada_actual.fecha_ultimo_pesaje}
                    </div>
                  )}
                </div>

                <div style={{ backgroundColor: '#0F172A', padding: '8px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.7rem', color: '#94A3B8' }}>📈 Peso Estimado</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#34D399' }}>
                    {selectedPotrero.potrerada_actual.peso_promedio_estimado} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#94A3B8' }}>kg</span>
                  </div>
                </div>
              </div>

              {/* Marcas / Propietarios */}
              {selectedPotrero.potrerada_actual.marcas && selectedPotrero.potrerada_actual.marcas.length > 0 && (
                <div style={{ backgroundColor: '#0F172A', padding: '10px 12px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.7rem', color: '#94A3B8', marginBottom: '6px' }}>🏷️ Marca / Propietario</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {selectedPotrero.potrerada_actual.marcas.map((m, i) => (
                      <span key={i} style={{
                        backgroundColor: '#1E3A5F',
                        color: '#93C5FD',
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
            <div style={{ fontSize: '0.85rem', color: '#94A3B8', marginBottom: '16px', fontStyle: 'italic', backgroundColor: '#1E293B50', padding: '12px', borderRadius: '10px' }}>
              🌱 Potrero en descanso. Sin lote de ganado asignado actualmente.
            </div>
          )}

          {/* Acción: Mover Ganado (Disponible para Administradores y Vaqueros) */}
          {tipoLicencia !== 'demo' && (userRole === 'administrador' || userRole === 'vaquero') && onMoveCattleToPotrero && !selectedPotrero.potrerada_actual && (
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
              <ArrowRightLeft size={16} /> Ingresar Ganado a este Potrero
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
