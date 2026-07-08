/**
 * Paramètres du module : identité de l'utilisateur courant et son rôle
 * (les droits sont réellement appliqués dans tous les écrans), état de la
 * connexion IA (variables d'environnement), et gestion des données de
 * démonstration.
 */

import React, { useState } from 'react';
import { Bot, RefreshCcw, ShieldCheck } from 'lucide-react';
import { useTendersStore } from '../store/tendersStore';
import { isAiConnected } from '../ai/aiService';
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
import { ROLE_LABELS } from '../types';
import { toast } from '../../utils/toast';

const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  admin: 'Tous les droits : édition, validation, suppression, Base entreprise.',
  redacteur: 'Crée et modifie les dossiers et documents ; ne peut pas valider ni supprimer.',
  validateur: 'Valide les documents et acte les décisions go/no-go ; ne modifie pas le contenu.',
  lecteur: 'Consultation seule de tous les écrans.',
};

export default function SettingsPage() {
  const settings = useTendersStore((s) => s.settings);
  const updateSettings = useTendersStore((s) => s.updateSettings);
  const resetDemoData = useTendersStore((s) => s.resetDemoData);
  const tenders = useTendersStore((s) => s.tenders);
  const documents = useTendersStore((s) => s.documents);
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        overline="Appels d'offres"
        title="Paramètres"
        description="Utilisateur courant, rôles, connexion IA et données de démonstration."
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
              <Select
                value={settings.currentUserRole}
                onChange={(e) => {
                  updateSettings({ currentUserRole: e.target.value as UserRole });
                  toast.success(`Rôle changé : ${ROLE_LABELS[e.target.value as UserRole]}.`);
                }}
              >
                {Object.entries(ROLE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="mt-3 rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600">
            <ShieldCheck className="mr-1.5 inline h-4 w-4 text-primary-500" />
            {ROLE_DESCRIPTIONS[settings.currentUserRole]}
          </div>
          <p className="mt-2 text-xs text-gray-400">
            En production multi-utilisateurs, les rôles seront portés par les comptes (Supabase
            Auth + RLS) — l'interface et les droits resteront identiques.
          </p>
        </SectionCard>

        <SectionCard title="Intelligence artificielle" hint="Analyse DCE, génération et amélioration de documents.">
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              isAiConnected()
                ? 'border-green-200 bg-green-50 text-green-900'
                : 'border-amber-200 bg-amber-50 text-amber-900'
            }`}
          >
            <Bot className="mr-1.5 inline h-4 w-4" />
            {isAiConnected() ? (
              <>API IA connectée — les analyses et générations utilisent votre endpoint.</>
            ) : (
              <>
                <strong>Mode simulation actif.</strong> Toutes les fonctions marchent avec des
                résultats réalistes générés localement.
              </>
            )}
          </div>
          <div className="mt-3 text-sm text-gray-600">
            <p className="mb-2">
              Pour brancher une vraie API, définissez ces variables dans le fichier{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">.env.local</code> à la
              racine du projet, puis redémarrez :
            </p>
            <pre className="overflow-x-auto rounded-lg bg-gray-900 px-4 py-3 text-xs text-gray-100">
{`VITE_TENDERS_AI_URL=https://votre-api.exemple.com/tenders-ai
VITE_TENDERS_AI_KEY=votre_cle_api`}
            </pre>
            <p className="mt-2 text-xs text-gray-400">
              ⚠ Gardez la clé locale : ne la collez jamais dans un chat, un email ou un dépôt
              public. L'endpoint reçoit <code>{'{ action, payload }'}</code> et répond en JSON ;
              en cas d'échec, l'application retombe automatiquement sur la simulation.
            </p>
          </div>
        </SectionCard>

        <SectionCard
          title="Données"
          hint="Les données sont stockées localement dans votre navigateur (aucun envoi externe)."
        >
          <p className="text-sm text-gray-600">
            {tenders.length} appel(s) d'offres · {documents.length} document(s) généré(s).
          </p>
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
