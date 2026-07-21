/**
 * Paramètres du module : identité de l'utilisateur courant et son rôle
 * (les droits sont réellement appliqués dans tous les écrans), état de la
 * connexion IA (variables d'environnement), et gestion des données de
 * démonstration.
 */

import React, { useState } from 'react';
import { Bot, PlugZap, RefreshCcw, ShieldCheck, UserCog, Users } from 'lucide-react';
import { useTendersStore } from '../store/tendersStore';
import { isAiConnected, pingAi } from '../ai/aiService';
import { isTendersSharedConfigured } from '../../utils/api/tendersWorkspace';
import {
  ConfirmDialog,
  Field,
  GuideBanner,
  PageHeader,
  SecondaryButton,
  SectionCard,
  Select,
  TextInput,
} from '../components/ui';
import type { UserRole } from '../types';
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '../types';
import { useMemberScope } from '../../hooks/useMemberScope';
import { isInvitedMember } from '../../utils/api/memberScope';
import { toast } from '../../utils/toast';

// Les procédures d'installation (clé IA, migrations, variables d'env) sont de la
// documentation EXPLOITANT, pas du produit : retirées de l'interface, elles
// vivent désormais dans docs/TENDERS_OPERATIONS.md.

export default function SettingsPage() {
  const settings = useTendersStore((s) => s.settings);
  const updateSettings = useTendersStore((s) => s.updateSettings);
  const resetDemoData = useTendersStore((s) => s.resetDemoData);
  // Actions destructrices (reset des données AO) : propriétaire uniquement.
  const { scope: memberScope } = useMemberScope();
  const canManage = !isInvitedMember(memberScope);
  const tenders = useTendersStore((s) => s.tenders);
  const documents = useTendersStore((s) => s.documents);
  const [confirmReset, setConfirmReset] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; detail: string } | null>(null);

  const runPing = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await pingAi());
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        overline="Appels d'offres"
        title="Paramètres"
        description="Votre compte, connexion IA, partage d'équipe et données de démonstration."
      />

      <div className="space-y-6">
        <SectionCard
          title="Utilisateur courant"
          hint="Le nom signe les actions dans l'historique ; le rôle détermine les droits réels dans tous les écrans."
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Votre nom">
              <TextInput
                value={settings.currentUserName}
                onChange={(e) => updateSettings({ currentUserName: e.target.value })}
              />
            </Field>
            <Field label="Votre rôle">
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                <span className="font-medium">{ROLE_LABELS[settings.currentUserRole]}</span>
                <span className="text-xs text-gray-400">— défini par le propriétaire (Gestion d'équipe)</span>
              </div>
            </Field>
          </div>
          <div className="mt-3 rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600">
            <ShieldCheck className="mr-1.5 inline h-4 w-4 text-primary-500" />
            {ROLE_DESCRIPTIONS[settings.currentUserRole]}
          </div>
          <a
            href="#appels-offres/equipe-roles"
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary-50 px-3 py-2 text-sm font-medium text-primary-700 hover:bg-primary-100"
          >
            <UserCog className="h-4 w-4" />
            Attribuer les rôles de vos salariés (lecteur, rédacteur, validateur…) →
          </a>
        </SectionCard>

        <SectionCard title="Intelligence artificielle" hint="Analyse réelle des PDF du DCE, génération et amélioration de documents via l'API Claude.">
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              isAiConnected()
                ? 'border-green-200 bg-green-50 text-green-900'
                : 'border-amber-200 bg-amber-50 text-amber-900'
            }`}
          >
            <Bot className="mr-1.5 inline h-4 w-4" />
            {isAiConnected() ? (
              <>API IA configurée — utilisez « Tester la connexion » pour vérifier le serveur.</>
            ) : (
              <>
                <strong>Mode simulation actif.</strong> Toutes les fonctions marchent avec des
                résultats réalistes générés localement.
              </>
            )}
          </div>

          <div className="mt-3 flex items-center gap-3">
            <SecondaryButton onClick={runPing} disabled={testing}>
              <PlugZap className="h-4 w-4" />
              {testing ? 'Test en cours…' : 'Tester la connexion'}
            </SecondaryButton>
            {testResult && (
              <span className={`text-sm ${testResult.ok ? 'text-green-700' : 'text-red-600'}`}>
                {testResult.ok ? '✓ ' : '✗ '}
                {testResult.detail}
              </span>
            )}
          </div>

        </SectionCard>

        <SectionCard
          title="Collaboration d'équipe (partage)"
          hint="Partager les dossiers entre l'admin et les salariés via votre base Supabase."
        >
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              isTendersSharedConfigured()
                ? 'border-green-200 bg-green-50 text-green-900'
                : 'border-gray-200 bg-gray-50 text-gray-700'
            }`}
          >
            <Users className="mr-1.5 inline h-4 w-4" />
            {isTendersSharedConfigured() ? (
              <>Partage d'équipe activé — les dossiers sont synchronisés avec votre société (si vous êtes connecté à une organisation).</>
            ) : (
              <>
                <strong>Mode local (par défaut).</strong> Chaque navigateur a ses propres dossiers.
                Activez le partage pour que l'admin affecte des AO et que les salariés les voient
                sur leur poste.
              </>
            )}
          </div>
          <a
            href="#appels-offres/equipe-roles"
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary-50 px-3 py-2 text-sm font-medium text-primary-700 hover:bg-primary-100"
          >
            <UserCog className="h-4 w-4" />
            Attribuer un rôle à chaque salarié (Équipe & rôles) →
          </a>
        </SectionCard>

        <SectionCard
          title="Données"
          hint="En mode local, les données sont dans votre navigateur. En mode partagé, dans votre société (Supabase)."
        >
          <p className="text-sm text-gray-600">
            {tenders.length} appel(s) d'offres · {documents.length} document(s) généré(s).
          </p>
          {/* En mode PARTAGÉ, restaurer la démo écraserait l'espace de toute la
              société (la sauvegarde synchronise vers la base) : bouton réservé
              au mode local. */}
          {isTendersSharedConfigured() ? (
            <p className="mt-3 text-xs italic text-gray-400">
              Mode partagé : la restauration des données de démonstration est désactivée
              (elle remplacerait les dossiers de toute votre société).
            </p>
          ) : canManage ? (
            <>
              <div className="mt-3">
                <SecondaryButton onClick={() => setConfirmReset(true)}>
                  <RefreshCcw className="h-4 w-4" /> Restaurer les données de démonstration
                </SecondaryButton>
              </div>
              <GuideBanner>
                La restauration remplace <strong>tous</strong> les dossiers, documents, la
                bibliothèque et la Base entreprise par le jeu de démonstration (3 AO : BTP,
                télésurveillance, informatique).
              </GuideBanner>
            </>
          ) : (
            <p className="mt-3 text-xs italic text-gray-400">
              Seul le propriétaire du compte peut réinitialiser les données.
            </p>
          )}
        </SectionCard>
      </div>

      <ConfirmDialog
        open={confirmReset}
        title="Restaurer les données de démonstration ?"
        message="Tous vos dossiers, documents, contenus de bibliothèque et informations entreprise actuels seront remplacés. Cette action est irréversible."
        confirmLabel="Tout remplacer"
        onConfirm={() => {
          resetDemoData();
          setConfirmReset(false);
          toast.success('Données de démonstration restaurées.');
        }}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}
