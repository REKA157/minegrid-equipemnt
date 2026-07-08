/**
 * Paramètres du module : identité de l'utilisateur courant et son rôle
 * (les droits sont réellement appliqués dans tous les écrans), état de la
 * connexion IA (variables d'environnement), et gestion des données de
 * démonstration.
 */

import React, { useState } from 'react';
import { Bot, PlugZap, RefreshCcw, ShieldCheck } from 'lucide-react';
import { useTendersStore } from '../store/tendersStore';
import { isAiConnected, pingAi } from '../ai/aiService';
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

          <div className="mt-4 text-sm text-gray-600">
            <p className="mb-2 font-medium text-gray-800">
              Activer l'IA réelle (3 étapes, une seule fois) :
            </p>
            <ol className="mb-3 list-inside list-decimal space-y-1.5 text-sm">
              <li>
                Créez une clé API sur{' '}
                <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">console.anthropic.com</code>{' '}
                et enregistrez-la comme <strong>secret Supabase</strong> (jamais dans le code) :
                <pre className="mt-1 overflow-x-auto rounded-lg bg-gray-900 px-4 py-2 text-xs text-gray-100">
{`supabase secrets set ANTHROPIC_API_KEY=sk-ant-...`}
                </pre>
              </li>
              <li>
                Déployez la fonction serveur (incluse dans le projet) :
                <pre className="mt-1 overflow-x-auto rounded-lg bg-gray-900 px-4 py-2 text-xs text-gray-100">
{`supabase functions deploy tenders-ai`}
                </pre>
              </li>
              <li>
                Activez côté application, dans{' '}
                <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">.env.local</code>, puis
                redémarrez :
                <pre className="mt-1 overflow-x-auto rounded-lg bg-gray-900 px-4 py-2 text-xs text-gray-100">
{`VITE_TENDERS_AI_URL=supabase`}
                </pre>
              </li>
            </ol>
            <p className="text-xs text-gray-400">
              ⚠ La clé Anthropic reste sur le serveur Supabase : ne la collez jamais dans un
              chat, un fichier du site ou un dépôt. En production, ajoutez le secret{' '}
              <code>TENDERS_AI_REQUIRE_AUTH=true</code> pour réserver l'IA aux utilisateurs
              connectés (protège votre crédit API). En cas de panne ou de quota, l'application
              retombe automatiquement sur la simulation — personne n'est bloqué.
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
