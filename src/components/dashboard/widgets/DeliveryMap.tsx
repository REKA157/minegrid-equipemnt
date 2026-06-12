import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { DeliveryRow, VehicleRow } from '../../../utils/enterpriseApi/transport';

interface DeliveryMapProps {
  deliveries: DeliveryRow[];
  vehicles: VehicleRow[];
  /** hauteur en CSS, défaut 100% du conteneur */
  height?: string;
}

const VEHICLE_STATUS_COLOR: Record<string, string> = {
  'En mission': '#f97316',
  'Disponible': '#22c55e',
  'Maintenance': '#94a3b8',
  'Hors service': '#ef4444',
};

const DELIVERY_STATUS_COLOR: Record<string, string> = {
  'En cours': '#f97316',
  'Planifiée': '#3b82f6',
  'Retardée': '#ef4444',
  'Livrée': '#22c55e',
};

function vehicleIcon(status: string) {
  const color = VEHICLE_STATUS_COLOR[status] || '#64748b';
  return L.divIcon({
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    html: `
      <div style="position:relative;display:flex;align-items:center;justify-content:center;width:28px;height:28px;">
        <span style="position:absolute;inset:0;border-radius:50%;background:${color};opacity:.25;animation:pulse 1.6s ease-out infinite;"></span>
        <span style="position:relative;width:18px;height:18px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;color:white;font-size:10px;">🚚</span>
      </div>
    `,
  });
}

function destinationIcon(status: string) {
  const color = DELIVERY_STATUS_COLOR[status] || '#64748b';
  return L.divIcon({
    className: '',
    iconSize: [22, 22],
    iconAnchor: [11, 22],
    html: `
      <div style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="${color}" stroke="white" stroke-width="1.5">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
          <circle cx="12" cy="9" r="2.5" fill="white"/>
        </svg>
      </div>
    `,
  });
}

const DeliveryMap: React.FC<DeliveryMapProps> = ({ deliveries, vehicles, height = '100%' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const linesRef = useRef<L.Polyline[]>([]);

  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return;

    // Maroc — centré sur Casablanca par défaut
    const map = L.map(containerRef.current, {
      center: [32.5, -6.5],
      zoom: 6,
      scrollWheelZoom: true,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 18,
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear previous markers/lines
    markersRef.current.forEach((m) => m.remove());
    linesRef.current.forEach((l) => l.remove());
    markersRef.current = [];
    linesRef.current = [];

    const allPoints: L.LatLngExpression[] = [];

    // Vehicles (positions GPS)
    vehicles.forEach((v) => {
      if (v.current_lat == null || v.current_lng == null) return;
      const marker = L.marker([Number(v.current_lat), Number(v.current_lng)], {
        icon: vehicleIcon(v.status),
      }).addTo(map);
      const lastUpdate = v.last_location_update
        ? new Date(v.last_location_update).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
        : 'Inconnu';
      marker.bindPopup(`
        <div style="min-width:160px;font-family:system-ui,sans-serif;">
          <div style="font-weight:600;color:#0f172a;">${v.plate_number}</div>
          <div style="font-size:11px;color:#64748b;">${v.brand || ''} ${v.model || v.type || ''}</div>
          <div style="margin-top:4px;font-size:11px;">
            <span style="color:#475569;">Statut :</span> <strong style="color:${VEHICLE_STATUS_COLOR[v.status] || '#64748b'}">${v.status}</strong>
          </div>
          ${typeof v.fuel_level === 'number' ? `<div style="font-size:11px;color:#475569;">⛽ ${v.fuel_level}%</div>` : ''}
          <div style="font-size:10px;color:#94a3b8;margin-top:2px;">MAJ : ${lastUpdate}</div>
        </div>
      `);
      markersRef.current.push(marker);
      allPoints.push([Number(v.current_lat), Number(v.current_lng)]);
    });

    // Deliveries (destinations + traces)
    deliveries.forEach((d) => {
      if (d.destination_lat == null || d.destination_lng == null) return;
      const dest: L.LatLngExpression = [Number(d.destination_lat), Number(d.destination_lng)];
      const destMarker = L.marker(dest, { icon: destinationIcon(d.status) }).addTo(map);
      destMarker.bindPopup(`
        <div style="min-width:180px;font-family:system-ui,sans-serif;">
          <div style="font-weight:600;color:#0f172a;">${d.equipment_label || 'Livraison'}</div>
          ${d.client_name ? `<div style="font-size:11px;color:#475569;">${d.client_name}</div>` : ''}
          <div style="font-size:11px;color:#64748b;margin-top:4px;">→ ${d.destination_address || ''}</div>
          <div style="margin-top:4px;font-size:11px;">
            <span style="color:#475569;">Statut :</span> <strong style="color:${DELIVERY_STATUS_COLOR[d.status] || '#64748b'}">${d.status}</strong>
          </div>
          ${d.priority === 'Urgente' || d.priority === 'Haute' ? `<div style="margin-top:2px;font-size:10px;color:#dc2626;font-weight:600;">⚠ ${d.priority}</div>` : ''}
        </div>
      `);
      markersRef.current.push(destMarker);
      allPoints.push(dest);

      // Trace origine → destination si dispo
      if (d.origin_lat != null && d.origin_lng != null) {
        const origin: L.LatLngExpression = [Number(d.origin_lat), Number(d.origin_lng)];
        const line = L.polyline([origin, dest], {
          color: DELIVERY_STATUS_COLOR[d.status] || '#64748b',
          weight: 2,
          opacity: 0.55,
          dashArray: d.status === 'Livrée' ? undefined : '6 6',
        }).addTo(map);
        linesRef.current.push(line);
        allPoints.push(origin);
      }
    });

    // Recadrage auto
    if (allPoints.length > 0) {
      const bounds = L.latLngBounds(allPoints as L.LatLngTuple[]);
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 9 });
    }
  }, [deliveries, vehicles]);

  return (
    <>
      <style>{`
        @keyframes pulse {
          0% { transform: scale(0.6); opacity: 0.7; }
          80% { transform: scale(1.6); opacity: 0; }
          100% { opacity: 0; }
        }
      `}</style>
      <div ref={containerRef} style={{ width: '100%', height, minHeight: 240, borderRadius: 8 }} />
    </>
  );
};

export default DeliveryMap;
