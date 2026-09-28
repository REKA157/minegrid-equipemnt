import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin } from 'lucide-react';

export interface Site {
  id: string;
  name: string;
  country: string;
  lat: number;
  lng: number;
  status: 'online' | 'offline' | 'warning';
  equipmentCount: number;
}

interface MonitorMapProps {
  sites: Site[];
  selectedSiteId: string | null;
  onSelectSite: (id: string) => void;
}

const statusColors: Record<Site['status'], { fill: string; border: string; pulse: string; label: string }> = {
  online:  { fill: '#22c55e', border: '#16a34a', pulse: 'rgba(34,197,94,0.35)',  label: 'En ligne' },
  warning: { fill: '#f59e0b', border: '#d97706', pulse: 'rgba(245,158,11,0.35)', label: 'Alerte' },
  offline: { fill: '#ef4444', border: '#dc2626', pulse: 'rgba(239,68,68,0.35)',   label: 'Hors ligne' },
};

function createSiteIcon(status: Site['status'], isSelected: boolean) {
  const cfg = statusColors[status];
  const size = isSelected ? 22 : 14;
  const outer = size + 10;

  return L.divIcon({
    className: '',
    iconSize: [outer, outer],
    iconAnchor: [outer / 2, outer / 2],
    html: `
      <div style="position:relative;width:${outer}px;height:${outer}px;display:flex;align-items:center;justify-content:center;">
        <span style="
          position:absolute;inset:0;border-radius:50%;
          background:${cfg.pulse};
          animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;
        "></span>
        <span style="
          position:relative;display:block;width:${size}px;height:${size}px;border-radius:50%;
          background:${cfg.fill};border:2.5px solid ${isSelected ? '#fff' : cfg.border};
          box-shadow:0 0 ${isSelected ? 12 : 6}px ${cfg.fill}${isSelected ? 'cc' : '88'};
          transition:all .2s;
        "></span>
      </div>
    `,
  });
}

export default function MonitorMap({ sites, selectedSiteId, onSelectSite }: MonitorMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [8, 10],
      zoom: 4,
      zoomControl: false,
      attributionControl: false,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 18,
      subdomains: 'abcd',
    }).addTo(map);

    L.control.attribution({ position: 'bottomleft', prefix: false })
      .addAttribution('&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>')
      .addTo(map);

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
    markersRef.current.clear();

    sites.forEach((site) => {
      const isSelected = site.id === selectedSiteId;
      const marker = L.marker([site.lat, site.lng], {
        icon: createSiteIcon(site.status, isSelected),
      });

      const cfg = statusColors[site.status];
      const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c);
      marker.bindTooltip(
        `<div style="font-family:system-ui;min-width:120px">
          <div style="font-weight:600;font-size:13px;margin-bottom:2px">${esc(site.name)}</div>
          <div style="font-size:11px;color:#94a3b8">${esc(site.country)}</div>
          <div style="margin-top:4px;display:flex;align-items:center;gap:5px;font-size:11px">
            <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${cfg.fill}"></span>
            ${esc(cfg.label)} — ${site.equipmentCount} machine${site.equipmentCount > 1 ? 's' : ''}
          </div>
        </div>`,
        { direction: 'top', offset: [0, -10], className: 'monitor-tooltip' }
      );

      marker.on('click', () => onSelectSite(site.id));
      marker.addTo(map);
      markersRef.current.set(site.id, marker);
    });
  }, [sites, selectedSiteId, onSelectSite]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedSiteId) return;
    const site = sites.find((s) => s.id === selectedSiteId);
    if (site) {
      map.flyTo([site.lat, site.lng], 6, { duration: 0.8 });
    }
  }, [selectedSiteId, sites]);

  return (
    <div className="relative h-full rounded-xl overflow-hidden border border-gray-700/30">
      <div ref={containerRef} className="h-full w-full" />

      <div className="absolute top-3 left-3 z-[1000]">
        <div className="bg-black/60 backdrop-blur-md rounded-lg px-3 py-2 text-white text-xs font-medium flex items-center gap-2">
          <MapPin className="h-3.5 w-3.5" />
          {sites.length} site{sites.length > 1 ? 's' : ''}
        </div>
      </div>

      <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-1.5">
        {Object.entries(statusColors).map(([key, cfg]) => (
          <div key={key} className="bg-black/60 backdrop-blur-md rounded-md px-2.5 py-1 text-white text-xs flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: cfg.fill }} />
            {cfg.label}
          </div>
        ))}
      </div>

      <style>{`
        @keyframes ping {
          75%, 100% { transform: scale(2); opacity: 0; }
        }
        .monitor-tooltip {
          background: white !important;
          border: 1px solid #e2e8f0 !important;
          border-radius: 8px !important;
          padding: 8px 10px !important;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
        }
        .monitor-tooltip::before {
          border-top-color: white !important;
        }
        .leaflet-control-zoom a {
          background: rgba(0,0,0,0.6) !important;
          color: white !important;
          border-color: rgba(255,255,255,0.1) !important;
          backdrop-filter: blur(8px);
        }
        .leaflet-control-zoom a:hover {
          background: rgba(0,0,0,0.8) !important;
        }
      `}</style>
    </div>
  );
}
