import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin } from 'lucide-react';

export interface FarmSummaryData {
  id: string;
  nombre: string;
  latitud?: number;
  longitud?: number;
  total_hectareas?: number;
  total_animales?: number;
  total_potreros?: number;
}

interface MultiFarmMapProps {
  fincas: FarmSummaryData[];
  onSelectFinca: (fincaId: string) => void;
}

export const MultiFarmMap: React.FC<MultiFarmMapProps> = ({ fincas, onSelectFinca }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [4.5709, -74.2973], // Centro por defecto de Colombia
        zoom: 6,
        zoomControl: false,
      });

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Tiles &copy; Esri',
          maxZoom: 18,
        }
      ).addTo(map);

      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;
    const bounds = L.latLngBounds([]);

    // Limpiar marcadores antiguos
    map.eachLayer((layer: L.Layer) => {
      if (layer instanceof L.Marker) {
        map.removeLayer(layer);
      }
    });

    fincas.forEach((finca) => {
      if (!finca.latitud || !finca.longitud) return;

      const coords: [number, number] = [finca.latitud, finca.longitud];
      bounds.extend(coords);

      const pinIcon = L.divIcon({
        html: `
          <div style="
            background-color: #10B981;
            border: 2px solid #FFFFFF;
            border-radius: 50%;
            width: 36px;
            height: 36px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            box-shadow: 0 4px 15px rgba(0,0,0,0.5);
            cursor: pointer;
          ">
            📍
          </div>
        `,
        className: '',
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      const marker = L.marker(coords, { icon: pinIcon }).addTo(map);

      const popupHtml = `
        <div style="font-family: sans-serif; padding: 4px; color: #0F172A;">
          <h4 style="margin: 0 0 6px 0; font-size: 14px; font-weight: 700; color: #0F172A;">${finca.nombre}</h4>
          <div style="font-size: 12px; color: #475569; margin-bottom: 8px;">
            <div>🌾 Hectáreas: <strong>${finca.total_hectareas || 'N/A'} Ha</strong></div>
            <div>🐮 Ganado: <strong>${finca.total_animales || 0} cabezas</strong></div>
            <div>🧩 Potreros: <strong>${finca.total_potreros || 0}</strong></div>
          </div>
          <button id="btn-finca-${finca.id}" style="
            width: 100%;
            background-color: #3B82F6;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
          ">
            Ver Plano de esta Finca →
          </button>
        </div>
      `;

      marker.bindPopup(popupHtml);

      marker.on('popupopen', () => {
        const btn = document.getElementById(`btn-finca-${finca.id}`);
        if (btn) {
          btn.onclick = () => onSelectFinca(finca.id);
        }
      });
    });

    if (bounds.isValid() && fincas.some((f) => f.latitud && f.longitud)) {
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [fincas, onSelectFinca]);

  return (
    <div style={{ position: 'relative', width: '100%', height: 'calc(100vh - 120px)', borderRadius: '16px', overflow: 'hidden', border: '1px solid #334155' }}>
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

      <div style={{
        position: 'absolute',
        top: '16px',
        left: '16px',
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        backdropFilter: 'blur(8px)',
        border: '1px solid #334155',
        borderRadius: '12px',
        padding: '12px 18px',
        color: '#F8FAFC',
        zIndex: 1000,
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
      }}>
        <h3 style={{ margin: '0 0 2px 0', fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MapPin size={18} color="#10B981" /> Tablero Multi-Finca
        </h3>
        <p style={{ margin: 0, fontSize: '0.8rem', color: '#94A3B8' }}>
          Visualiza la ubicación regional de tus {fincas.length} fincas registradas
        </p>
      </div>
    </div>
  );
};
