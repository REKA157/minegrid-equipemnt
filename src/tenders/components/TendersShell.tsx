/**
 * Shell du module Appels d'offres : sidebar de navigation + zone de contenu.
 *
 * La sidebar est volontairement courte (7 entrées) et chaque entrée porte
 * un sous-titre d'usage. Sur mobile/tablette, elle devient une barre
 * horizontale scrollable en haut.
 */

import React from 'react';
import {
  Building2,
  FileText,
  FolderOpen,
  LayoutDashboard,
  Library,
  ScrollText,
  Settings,
} from 'lucide-react';
import { useRouteParams } from '../../router';
import { useTendersStore } from '../store/tendersStore';
import { ROLE_LABELS } from '../types';

interface NavItem {
  /** Segment après appels-offres ('' = dashboard). */
  segment: string;
  label: string;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Segments supplémentaires qui activent cette entrée. */
  match?: string[];
}

const NAV: NavItem[] = [
  { segment: '', label: 'Tableau de bord', sub: 'Vue d\'ensemble et urgences', icon: LayoutDashboard },
  { segment: 'liste', label: 'Appels d\'offres', sub: 'Dossiers de réponse', icon: FolderOpen, match: ['ao', 'nouveau'] },
  { segment: 'cahiers', label: 'Cahiers des charges', sub: 'Rédiger une consultation', icon: ScrollText },
  { segment: 'documents', label: 'Documents générés', sub: 'Tous vos documents', icon: FileText, match: ['document'] },
  { segment: 'bibliotheque', label: 'Bibliothèque', sub: 'Contenus réutilisables', icon: Library },
  { segment: 'entreprise', label: 'Base entreprise', sub: 'Vos infos, équipes, refs', icon: Building2 },
  { segment: 'parametres', label: 'Paramètres', sub: 'Rôles, IA, données', icon: Settings },
];

export function TendersShell({ children }: { children: React.ReactNode }) {
  const { segments } = useRouteParams();
  const settings = useTendersStore((s) => s.settings);
  const sub = segments[1] ?? '';

  const isActive = (item: NavItem) =>
    item.segment === sub || (item.match ?? []).includes(sub);

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col lg:flex-row">
      {/* Sidebar desktop */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-gray-200 bg-white min-h-[calc(100vh-4rem)]">
        <div className="px-5 pt-6 pb-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">Module</div>
          <div className="text-lg font-bold text-gray-900">Appels d'offres</div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(item);
            return (
              <a
                key={item.segment}
                href={`#appels-offres${item.segment ? `/${item.segment}` : ''}`}
                className={`flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                  active
                    ? 'bg-primary-50 text-primary-800'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${active ? 'text-primary-600' : 'text-gray-400'}`} />
                <span>
                  <span className={`block text-sm ${active ? 'font-semibold' : 'font-medium'}`}>
                    {item.label}
                  </span>
                  <span className="block text-xs text-gray-400">{item.sub}</span>
                </span>
              </a>
            );
          })}
        </nav>
        <div className="border-t border-gray-100 px-5 py-4">
          <div className="text-sm font-medium text-gray-900">{settings.currentUserName}</div>
          <div className="text-xs text-gray-500">{ROLE_LABELS[settings.currentUserRole]}</div>
        </div>
      </aside>

      {/* Barre horizontale mobile / tablette */}
      <div className="lg:hidden sticky top-0 z-30 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-1 overflow-x-auto px-2 py-2">
          {NAV.map((item) => {
            const active = isActive(item);
            return (
              <a
                key={item.segment}
                href={`#appels-offres${item.segment ? `/${item.segment}` : ''}`}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium ${
                  active ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {item.label}
              </a>
            );
          })}
        </div>
      </div>

      {/* Contenu */}
      <main className="min-w-0 flex-1 bg-gray-50 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
