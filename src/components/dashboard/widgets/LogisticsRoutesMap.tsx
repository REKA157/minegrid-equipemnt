import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { LogisticsRouteRow } from '../../../utils/enterpriseApi/logisticien';

const STATUS_COLOR: Record<string, string> = {
  'Planifié': '#3b82f6',
  'En route': '#f97316',
  'Livré': '#22c55e',
  'Retard': '#ef4444',
  'Annulé': '#94a3b8',
};

function endIcon(status: string) {
  const color = STATUS_COLOR[status] || '#64748b';
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

function startIcon() {
  return L.divIcon({
    className: '',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    html: `<div style="width:14px;height:14px;border-radius:50%;background:#0f766e;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.3);"></div>`,
  });
}

function vehicleIcon(status: string) {
  const color = STATUS_COLOR[status] || '#64748b';
  return L.divIcon({
    className: '',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    html: `
      <div style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;">
        <span style="width:20px;height:20px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;color:white;font-size:10px;">🚛</span>
      </div>
    `,
  });
}

export interface LogisticsRoutesMapProps {
  routes: LogisticsRouteRow[];
  height?: string;
}

const LogisticsRoutesMap: React.FC<LogisticsRoutesMapProps> = ({ routes, height = '100%' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const linesRef = useRef<L.Polyline[]>([]);

  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return;

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

    markersRef.current.forEach((m) => m.remove());
    linesRef.current.forEach((l) => l.remove());
    markersRef.current = [];
    linesRef.current = [];

    const allPoints: L.LatLngExpression[] = [];

    routes.forEach((rt) => {
      const oLat = rt.origin_lat != null ? Number(rt.origin_lat) : null;
      const oLng = rt.origin_lng != null ? Number(rt.origin_lng) : null;
      const dLat = rt.dest_lat != null ? Number(rt.dest_lat) : null;
      const dLng = rt.dest_lng != null ? Number(rt.dest_lng) : null;
      const cLat = rt.current_lat != null ? Number(rt.current_lat) : null;
      const cLng = rt.current_lng != null ? Number(rt.current_lng) : null;

      const color = STATUS_COLOR[rt.status] || '#64748b';

      if (oLat != null && oLng != null) {
        const om = L.marker([oLat, oLng], { icon: startIcon() }).addTo(map);
        om.bindPopup(
          `<div style="font-size:12px;min-width:140px;"><strong>Départ</strong><br/>${rt.origin_label || ''}<br/><span style="color:${color}">${rt.route_ref}</span></div>`,
        );
        markersRef.current.push(om);
        allPoints.push([oLat, oLng]);
      }

      if (dLat != null && dLng != null) {
        const dm = L.marker([dLat, dLng], { icon: endIcon(rt.status) }).addTo(map);
        const eta = rt.eta ? new Date(rt.eta).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
        dm.bindPopup(`
          <div style="font-size:12px;min-width:160px;font-family:system-ui;">
            <div style="font-weight:600;">${rt.dest_label || 'Arrivée'}</div>
            <div>${rt.route_ref} · ${rt.vehicle_label || ''}</div>
            <div style="margin-top:4px;color:${color};font-weight:600;">${rt.status}</div>
            <div style="font-size:10px;color:#64748b;">ETA : ${eta}</div>
          </div>
        `);
        markersRef.current.push(dm);
        allPoints.push([dLat, dLng]);
      }

      if (cLat != null && cLng != null && rt.status !== 'Planifié' && rt.status !== 'Livré' && rt.status !== 'Annulé') {
        const vm = L.marker([cLat, cLng], { icon: vehicleIcon(rt.status) }).addTo(map);
        vm.bindPopup(
          `<div style="font-size:12px;"><strong>${rt.vehicle_label || 'Véhicule'}</strong><br/>${rt.route_ref}<br/>${rt.cargo_summary || ''}</div>`,
        );
        markersRef.current.push(vm);
        allPoints.push([cLat, cLng]);
      }

      if (oLat != null && oLng != null && dLat != null && dLng != null) {
        const line = L.polyline(
          [
            [oLat, oLng] as L.LatLngTuple,
            [dLat, dLng] as L.LatLngTuple,
          ],
          {
            color,
            weight: 2,
            opacity: 0.55,
            dashArray: rt.status === 'Planifié' ? '6 6' : undefined,
          },
        ).addTo(map);
        linesRef.current.push(line);
      }
    });

    if (allPoints.length > 0) {
      const bounds = L.latLngBounds(allPoints as L.LatLngTuple[]);
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: 8 });
    }
  }, [routes]);

  return <div ref={containerRef} style={{ height, width: '100%', minHeight: 220 }} className="z-0 rounded border border-gray-200" />;
};

export default LogisticsRoutesMap;
