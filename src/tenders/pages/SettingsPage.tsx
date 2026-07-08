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
import { toast } from '../../utils/toast';

/**
 * Repli « configuration technique » : masque par défaut les commandes
 * d'installation (à faire une seule fois) pour ne pas noyer l'utilisateur.
 */
function TechnicalDetails({ children }: { children: React.ReactNode }) {
  return (
    <details className="mt-3 rounded-lg border border-gray-200 bg-gray-50/60">
      <summary className="cursor-pointer select-none px-4 py-2.5 text-sm font-medium text-gray-700">
        Configuration technique (installation — une seule fois)
      </summary>
      <div className="border-t border-gray-200 px-4 py-3 text-sm text-gray-600">{children}</div>
    </details>
  );
}

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

          <TechnicalDetails>
            <p className="mb-2 font-medium text-gray-800">
              Activer l'IA réelle — 3 étapes :
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
          </TechnicalDetails>
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
          <TechnicalDetails>
            <p className="mb-2 font-medium text-gray-800">Activer le partage d'équipe :</p>
            <ol className="mb-3 list-inside list-decimal space-y-1.5">
              <li>
                Déployer la migration de base de données (crée l'espace de travail partagé) :
                <pre className="mt-1 overflow-x-auto rounded-lg bg-gray-900 px-4 py-2 text-xs text-gray-100">
{`supabase db push`}
                </pre>
                <span className="text-xs text-gray-400">
                  (applique <code>supabase/migrations/20260708160000_teamE_tender_workspace.sql</code>)
                </span>
              </li>
              <li>
                Activer côté application dans <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">.env.local</code>, puis redémarrer :
                <pre className="mt-1 overflow-x-auto rounded-lg bg-gray-900 px-4 py-2 text-xs text-gray-100">
{`VITE_TENDERS_SHARED=true`}
                </pre>
              </li>
            </ol>
            <p className="text-xs text-gray-400">
              Le partage réutilise votre système d'équipe existant (invitations, rôles, sécurité
              RLS). Chaque salarié doit être membre de la société (via un lien d'invitation) et
              connecté. Les affectations (rédacteur, responsable) deviennent visibles par toute
              l'équipe. En l'absence de connexion, l'app retombe automatiquement en mode local.
            </p>
          </TechnicalDetails>
        </SectionCard>

        <SectionCard
          title="Données"
          hint="En mode local, les données sont dans votre navigateur. En mode partagé, dans votre société (Supabase)."
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
