/**
 * Shell du module Appels d'offres : sidebar de navigation + zone de contenu.
 *
 * La sidebar est volontairement courte (8 entrées) et chaque entrée porte
 * un sous-titre d'usage. Sur mobile/tablette, elle devient une barre
 * horizontale scrollable en haut.
 */

import React, { useState } from 'react';
import {
  AlertTriangle,
  Building2,
  FileText,
  FolderOpen,
  Info,
  LayoutDashboard,
  Library,
  Loader2,
  ScrollText,
  Settings,
  UserCog,
  Users,
} from 'lucide-react';
import { useRouteParams } from '../../router';
import { useTendersStore } from '../store/tendersStore';
import { ROLE_LABELS } from '../types';
import { isTendersSharedConfigured } from '../../utils/api/tendersWorkspace';
import type { SyncStatus } from '../store/tendersSync';

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
  { segment: 'equipe-roles', label: 'Équipe & rôles', sub: 'Qui peut quoi (droits)', icon: UserCog },
  { segment: 'parametres', label: 'Paramètres', sub: 'IA, partage, données', icon: Settings },
];

export function TendersShell({
  children,
  syncStatus = 'local',
}: {
  children: React.ReactNode;
  /** Statut de la synchro société (useTendersSync) — affiché à l'écran. */
  syncStatus?: SyncStatus;
}) {
  const { segments } = useRouteParams();
  const settings = useTendersStore((s) => s.settings);
  const tenders = useTendersStore((s) => s.tenders);
  const [demoBannerHidden, setDemoBannerHidden] = useState(false);
  const sub = segments[1] ?? '';

  // Bannière d'honnêteté : au premier lancement (hors mode partagé), le module
  // affiche des appels d'offres/documents d'EXEMPLE (ids « demo_… »). On le signale
  // clairement pour ne pas les faire passer pour de vrais dossiers.
  const showDemoBanner =
    !demoBannerHidden &&
    !isTendersSharedConfigured() &&
    tenders.some((t) => typeof t.id === 'string' && t.id.startsWith('demo_'));

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
          {/* Badge d'état de la synchro société (le statut n'était affiché nulle part). */}
          {isTendersSharedConfigured() && (
            <div
              className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                syncStatus === 'partage'
                  ? 'bg-green-50 text-green-700'
                  : syncStatus === 'chargement'
                    ? 'bg-gray-100 text-gray-500'
                    : 'bg-amber-50 text-amber-700'
              }`}
            >
              {syncStatus === 'partage' ? (
                <>
                  <Users className="h-3 w-3" /> Partagé avec la société
                </>
              ) : syncStatus === 'chargement' ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" /> Chargement…
                </>
              ) : (
                <>
                  <AlertTriangle className="h-3 w-3" /> Non partagé
                </>
              )}
            </div>
          )}
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
      <main className="min-w-0 flex-1 bg-gray-50 px-4 py-6 sm:px-6 lg:px-8">
        {/* PERTE DE TRAVAIL ÉVITÉE : si la sauvegarde société échoue (réseau,
            rôle société lecture seule…), on le DIT — avant, l'utilisateur
            continuait d'éditer en croyant partager, et ses modifications
            étaient écrasées au rechargement suivant. */}
        {syncStatus === 'erreur' && (
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <span className="font-semibold">Vos modifications ne sont PAS partagées avec la société.</span>{' '}
              La synchronisation a échoué (connexion ou droits insuffisants) : ce que vous éditez
              maintenant restera sur ce poste et pourra être écrasé au prochain chargement.
              Rechargez la page pour retenter, ou contactez votre administrateur.
            </div>
          </div>
        )}
        {showDemoBanner && (
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1">
              <span className="font-semibold">Données de démonstration.</span>{' '}
              Les appels d'offres et documents affichés sont des <strong>exemples</strong> pour
              découvrir le module. Videz-les depuis{' '}
              <a href="#appels-offres/parametres" className="font-medium underline">
                Paramètres → Données
              </a>{' '}
              quand vous démarrez pour de vrai.
            </div>
            <button
              type="button"
              onClick={() => setDemoBannerHidden(true)}
              className="shrink-0 text-amber-500 hover:text-amber-700"
              aria-label="Masquer ce message"
            >
              ✕
            </button>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
