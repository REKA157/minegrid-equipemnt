import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { FreightContainerRow } from '../../../utils/enterpriseApi/transitaire';

const STATUS_COLOR: Record<string, string> = {
  'En mer': '#3b82f6',
  'Transbordement': '#8b5cf6',
  'À quai': '#22c55e',
  'Douane': '#f97316',
  'Livré': '#64748b',
  'Retard': '#ef4444',
};

function containerIcon(status: string) {
  const color = STATUS_COLOR[status] || '#64748b';
  return L.divIcon({
    className: '',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    html: `
      <div style="position:relative;display:flex;align-items:center;justify-content:center;width:26px;height:26px;">
        <span style="position:relative;width:20px;height:20px;border-radius:4px;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;color:white;font-size:11px;">📦</span>
      </div>
    `,
  });
}

export interface FreightContainerMapProps {
  containers: FreightContainerRow[];
  height?: string;
}

const FreightContainerMap: React.FC<FreightContainerMapProps> = ({ containers, height = '100%' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);

  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [32.5, -8],
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
    markersRef.current = [];

    const points: L.LatLngExpression[] = [];

    containers.forEach((c) => {
      if (c.lat == null || c.lng == null) return;
      const lat = Number(c.lat);
      const lng = Number(c.lng);
      points.push([lat, lng]);
      const marker = L.marker([lat, lng], { icon: containerIcon(c.status) }).addTo(map);
      const eta = c.eta ? new Date(c.eta).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
      marker.bindPopup(`
        <div style="min-width:180px;font-family:system-ui,sans-serif;font-size:12px;">
          <div style="font-weight:600;">${c.container_number}</div>
          <div style="color:#64748b;font-size:11px;">${c.vessel_name || c.voyage_ref || '—'}</div>
          <div style="margin-top:4px;"><strong style="color:${STATUS_COLOR[c.status] || '#64748b'}">${c.status}</strong></div>
          <div style="font-size:11px;color:#475569;">${c.last_port || '—'} → ${c.next_port || '—'}</div>
          <div style="font-size:10px;color:#94a3b8;margin-top:2px;">ETA : ${eta}</div>
        </div>
      `);
      markersRef.current.push(marker);
    });

    if (points.length > 0) {
      const b = L.latLngBounds(points as L.LatLngExpression[]);
      map.fitBounds(b, { padding: [24, 24], maxZoom: 8 });
    }
  }, [containers]);

  return <div ref={containerRef} style={{ height, width: '100%', minHeight: 220 }} className="z-0 rounded border border-gray-200" />;
};

export default FreightContainerMap;
