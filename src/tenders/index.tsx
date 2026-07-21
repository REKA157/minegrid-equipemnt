/**
 * Point d'entrée du module Appels d'offres (route #appels-offres).
 *
 * Sous-routes :
 *   #appels-offres                    → tableau de bord
 *   #appels-offres/liste              → liste des AO
 *   #appels-offres/nouveau            → assistant nouvelle opportunité
 *   #appels-offres/ao/:id[/:onglet]   → détail d'un AO (dce, exigences,
 *                                       gonogo, strategie, memoire, documents,
 *                                       taches ; « conformite » = alias legacy
 *                                       d'exigences)
 *   #appels-offres/cahiers            → cahiers des charges
 *   #appels-offres/cahiers/nouveau    → assistant cahier des charges
 *   #appels-offres/documents          → tous les documents générés
 *   #appels-offres/document/:id       → éditeur de document
 *   #appels-offres/bibliotheque       → bibliothèque de contenus
 *   #appels-offres/entreprise         → base entreprise
 *   #appels-offres/equipe-roles       → équipe & rôles (qui peut quoi)
 *   #appels-offres/parametres         → paramètres (IA, partage, données)
 */

import React, { useEffect } from 'react';
import { useRouteParams } from '../router';
import { useTendersStore } from './store/tendersStore';
import { TendersShell } from './components/TendersShell';
import TendersDashboard from './pages/TendersDashboard';
import TendersList from './pages/TendersList';
import TenderNew from './pages/TenderNew';
import TenderDetail from './pages/tender/TenderDetail';
import CdcList from './pages/CdcList';
import CdcWizard from './pages/CdcWizard';
import DocumentsPage from './pages/DocumentsPage';
import DocumentEditorPage from './pages/DocumentEditorPage';
import LibraryPage from './pages/LibraryPage';
import CompanyPage from './pages/CompanyPage';
import TeamRolesPage from './pages/TeamRolesPage';
import SettingsPage from './pages/SettingsPage';
import { useTendersSync } from './store/tendersSync';
import { isTendersSharedConfigured } from '../utils/api/tendersWorkspace';

export default function TendersApp() {
  const { segments } = useRouteParams();
  const seedIfNeeded = useTendersStore((s) => s.seedIfNeeded);

  // Synchronise l'espace de travail avec la société (opt-in ; no-op en local).
  // Le statut est AFFICHÉ (badge sidebar + bandeau d'échec) : une synchro en
  // erreur silencieuse faisait perdre du travail sans prévenir.
  const syncStatus = useTendersSync();

  // Injecte les données de démonstration au premier lancement — SAUF en mode
  // partagé (la synchro charge les vraies données de la société).
  useEffect(() => {
    if (!isTendersSharedConfigured()) seedIfNeeded();
  }, [seedIfNeeded]);

  const sub = segments[1] ?? '';
  const param = segments[2];

  const renderPage = () => {
    switch (sub) {
      case '':
        return <TendersDashboard />;
      case 'liste':
        return <TendersList />;
      case 'nouveau':
        return <TenderNew />;
      case 'ao':
        return param ? <TenderDetail tenderId={param} /> : <TendersList />;
      case 'cahiers':
        return param === 'nouveau' ? <CdcWizard /> : <CdcList />;
      case 'documents':
        return <DocumentsPage />;
      case 'document':
        return param ? <DocumentEditorPage docId={param} /> : <DocumentsPage />;
      case 'bibliotheque':
        return <LibraryPage />;
      case 'entreprise':
        return <CompanyPage />;
      case 'equipe-roles':
        return <TeamRolesPage />;
      case 'parametres':
        return <SettingsPage />;
      default:
        return <TendersDashboard />;
    }
  };

  return <TendersShell syncStatus={syncStatus}>{renderPage()}</TendersShell>;
}
