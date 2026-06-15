import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Check, FolderOpen, Loader2, UserPlus, X } from 'lucide-react';
import supabase from '../utils/supabaseClient';
import {
  getTransactionCase,
  listTransactionEvents,
  listTransactionParticipants,
  type TransactionCaseRow,
  type TransactionEventRow,
  type TransactionParticipantRow,
} from '../utils/api/transactionCases';
import {
  auditLogService,
  brokerCaseService,
  commissionRecordService,
  customsCaseService,
  financingRequestService,
  inspectionService,
  logisticsTaskService,
  paymentRecordService,
  transactionDocumentService,
  transactionMessageService,
  transactionTaskService,
  transportRequestService,
  type AuditLogRow,
  type BrokerCaseRow,
  type CommissionRecordRow,
  type CustomsCaseRow,
  type FinancingRequestRow,
  type InspectionReportRow,
  type InspectionRequestRow,
  type LogisticsTaskRow,
  type PaymentRecordRow,
  type TransactionDocumentRow,
  type TransactionMessageRow,
  type TransactionTaskRow,
  type TransportRequestRow,
} from '../utils/api/transactionPlatform';

import {
  advanceTransactionCaseStep,
  assignTransactionPartner,
  revokeTransactionPartner,
  acceptTransactionInvitation,
  declineTransactionInvitation,
  type ChainStep,
  type PartnerRole,
} from '../utils/api/transactionChain';
import { openCaseEscrow } from '../utils/api/escrowBridge';
import { loadPartnerRankingForRole } from '../utils/partner/partnerPerformanceService';
import type { PartnerCandidate } from '../utils/partner/partnerMatching';

export interface TransactionCasePageProps {
  caseId: string;
}

const STEP_ACTIONS: Array<{ step: ChainStep; label: string }> = [
  { step: 'inspection', label: 'Demander une inspection' },
  { step: 'financing', label: 'Demander un financement' },
  { step: 'transport', label: 'Demander un transport' },
  { step: 'customs', label: 'Ouvrir un dossier douane' },
  { step: 'payment', label: 'Mettre en escrow (après inspection)' },
];

/**
 * Actions contrôlées d'avancement du dossier (write-side L3/L4). Appelle les RPC
 * SECURITY DEFINER via transactionChain ; feedback honnête (créé / non déployé /
 * non autorisé). Crée les lignes de chaîne qui rendent visibles les cartes cockpit M4-M7.
 */
function TransactionCaseActions({ caseId, onDone }: { caseId: string; onDone: () => void }) {
  const [pending, setPending] = useState<ChainStep | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [escrowPending, setEscrowPending] = useState(false);

  const run = async (step: ChainStep) => {
    setPending(step);
    setMsg(null);
    const r = await advanceTransactionCaseStep(caseId, step);
    setPending(null);
    if (r.ok) {
      setMsg('Étape enregistrée. Si aucun partenaire n’est disponible, elle reste « à assigner / en attente partenaire ».');
      onDone();
    } else if (r.reason === 'not_deployed') {
      setMsg('Workflow dossier non déployé sur cet environnement (RPC absente). Appliquez sql/2026-06_transaction_chain_write_side.sql.');
    } else if (r.reason === 'forbidden') {
      setMsg('Action non autorisée : vous devez être partie prenante de ce dossier.');
    } else {
      setMsg('Action impossible pour le moment.');
    }
  };

  // Pont escrow : ouvre un séquestre RÉEL (statut 'created' = non financé) lié au dossier.
  const openEscrow = async () => {
    setEscrowPending(true);
    setMsg(null);
    const r = await openCaseEscrow(caseId);
    setEscrowPending(false);
    if (r.ok) {
      setMsg('Séquestre ouvert (non financé). Le miroir paiement du dossier reflètera l’état réel du PSP.');
      onDone();
    } else if (r.reason === 'not_deployed') {
      setMsg('Pont escrow non déployé : appliquez 0_prerequis_escrow_prix.sql puis 7_pont_escrow.sql.');
    } else if (r.reason === 'buyer_required') {
      setMsg('Escrow impossible : ce dossier n’a pas d’acheteur relié (anti-façade : aucun escrow fictif).');
    } else if (r.reason === 'amount_required') {
      setMsg('Escrow impossible : le montant du dossier (total_amount) doit être renseigné.');
    } else if (r.reason === 'machine_required') {
      setMsg('Escrow impossible : aucune machine liée au dossier.');
    } else if (r.reason === 'forbidden') {
      setMsg('Seuls le vendeur ou l’acheteur du dossier peuvent ouvrir un séquestre.');
    } else {
      setMsg('Ouverture du séquestre impossible pour le moment.');
    }
  };

  return (
    <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-900 mb-1">Faire avancer le dossier</h2>
      <p className="text-xs text-gray-500 mb-3">
        Crée l’étape correspondante (inspection, financement, transport, douane, escrow). Idempotent : pas de doublon.
      </p>
      <div className="flex flex-wrap gap-2">
        {STEP_ACTIONS.map((a) => (
          <button
            key={a.step}
            type="button"
            disabled={pending !== null}
            onClick={() => void run(a.step)}
            className="inline-flex items-center gap-1 rounded-md border border-orange-300 bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-800 transition hover:bg-orange-100 disabled:opacity-50"
          >
            {pending === a.step ? 'Envoi…' : a.label}
          </button>
        ))}
        <button
          type="button"
          disabled={escrowPending || pending !== null}
          onClick={() => void openEscrow()}
          title="Ouvre un séquestre réel (PSP) lié au dossier — statut 'créé', non financé."
          className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50"
        >
          {escrowPending ? 'Ouverture…' : 'Ouvrir le séquestre (escrow réel)'}
        </button>
      </div>
      {msg && <p className="mt-2 text-xs text-gray-600">{msg}</p>}
    </div>
  );
}

const PARTNER_ROLES: Array<{ role: PartnerRole; label: string }> = [
  { role: 'mechanic', label: 'Mécanicien (inspection)' },
  { role: 'broker', label: 'Courtier (financement)' },
  { role: 'carrier', label: 'Transporteur' },
  { role: 'forwarder', label: 'Transitaire (douane)' },
  { role: 'logistician', label: 'Logisticien' },
  { role: 'investor', label: 'Investisseur' },
];

/**
 * Réseau partenaire (write-side) : assigne un partenaire réel (par email) à un rôle
 * du dossier. C'est ce qui rend les étapes de chaîne « assignées » plutôt que « à
 * assigner » → leur cockpit (mécanicien, courtier, transporteur, transitaire…) voit
 * enfin la carte. Anti-façade : un email inconnu renvoie « introuvable », jamais un
 * acteur fictif.
 */
function AssignPartnerPanel({ caseId, onChanged }: { caseId: string; onChanged: () => void }) {
  const [role, setRole] = useState<PartnerRole>('mechanic');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  // Matching P6 : meilleur partenaire du rôle par performance réelle (anti-façade : rien si pas de donnée).
  const [suggestion, setSuggestion] = useState<PartnerCandidate | null>(null);
  useEffect(() => {
    const RANKABLE = ['mechanic', 'carrier', 'broker', 'forwarder'];
    if (!RANKABLE.includes(role)) {
      setSuggestion(null);
      return;
    }
    let cancelled = false;
    void loadPartnerRankingForRole(role as 'mechanic' | 'carrier' | 'broker' | 'forwarder').then((ranked) => {
      if (!cancelled) setSuggestion(ranked[0] ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [role]);

  const submit = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      setMsg({ tone: 'err', text: 'Indiquez l’email du partenaire.' });
      return;
    }
    setBusy(true);
    setMsg(null);
    const r = await assignTransactionPartner(caseId, role, trimmed);
    setBusy(false);
    if (r.ok) {
      setEmail('');
      setMsg({
        tone: 'ok',
        text: 'Invitation envoyée. Le partenaire doit l’accepter dans son espace avant de recevoir les étapes de ce rôle.',
      });
      onChanged();
    } else if (r.reason === 'partner_not_found') {
      setMsg({ tone: 'err', text: 'Aucun utilisateur avec cet email. Le partenaire doit avoir un compte MineGrid.' });
    } else if (r.reason === 'not_deployed') {
      setMsg({ tone: 'err', text: 'Module non déployé : appliquez sql/2026-06_transaction_participant_assign.sql.' });
    } else if (r.reason === 'forbidden') {
      setMsg({ tone: 'err', text: 'Seuls le vendeur, l’acheteur ou un délégué du dossier peuvent assigner un partenaire.' });
    } else {
      setMsg({ tone: 'err', text: 'Assignation impossible pour le moment.' });
    }
  };

  return (
    <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-1.5">
        <UserPlus className="h-4 w-4 text-orange-600" />
        Assigner un partenaire
      </h2>
      <p className="text-xs text-gray-500 mb-3">
        Rattachez un partenaire (par email) à un rôle du dossier. Il reçoit une invitation à accepter ;
        une fois acceptée, les étapes de ce rôle lui sont attribuées et apparaissent dans son cockpit.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-600">Rôle</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as PartnerRole)}
            disabled={busy}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-800 disabled:opacity-50"
          >
            {PARTNER_ROLES.map((r) => (
              <option key={r.role} value={r.role}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 flex-1 min-w-[200px]">
          <span className="text-xs text-gray-600">Email du partenaire</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !busy && void submit()}
            disabled={busy}
            placeholder="partenaire@exemple.com"
            className="rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-800 disabled:opacity-50"
          />
        </label>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md bg-orange-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-orange-700 disabled:opacity-50"
        >
          {busy ? 'Envoi…' : 'Assigner'}
        </button>
      </div>
      {suggestion && suggestion.score.score != null && (
        <p className="mt-2 text-xs text-emerald-700">
          💡 Meilleur {role} par performance (dossiers réels) :{' '}
          <span className="font-mono">{suggestion.partnerId.slice(0, 8)}…</span> · score {suggestion.score.score}/100.
        </p>
      )}
      {msg && (
        <p className={`mt-2 text-xs ${msg.tone === 'ok' ? 'text-green-700' : 'text-red-700'}`}>{msg.text}</p>
      )}
    </div>
  );
}

/** Affiche données secondaires après chargement du dossier (RLS décide les lignes visibles). */
function useTransactionCaseBundles(caseRow: TransactionCaseRow | null, refreshToken: number) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<TransactionDocumentRow[]>([]);
  const [financing, setFinancing] = useState<FinancingRequestRow[]>([]);
  const [brokers, setBrokers] = useState<BrokerCaseRow[]>([]);
  const [inspections, setInspections] = useState<InspectionRequestRow[]>([]);
  const [inspectionReports, setInspectionReports] = useState<InspectionReportRow[]>([]);
  const [transport, setTransport] = useState<TransportRequestRow[]>([]);
  const [customs, setCustoms] = useState<CustomsCaseRow[]>([]);
  const [logistics, setLogistics] = useState<LogisticsTaskRow[]>([]);
  const [tasks, setTasks] = useState<TransactionTaskRow[]>([]);
  const [messages, setMessages] = useState<TransactionMessageRow[]>([]);
  const [payments, setPayments] = useState<PaymentRecordRow[]>([]);
  const [commissions, setCommissions] = useState<CommissionRecordRow[]>([]);
  const [audit, setAudit] = useState<AuditLogRow[]>([]);

  useEffect(() => {
    if (!caseRow?.id) {
      setDocuments([]);
      setFinancing([]);
      setBrokers([]);
      setInspections([]);
      setInspectionReports([]);
      setTransport([]);
      setCustoms([]);
      setLogistics([]);
      setTasks([]);
      setMessages([]);
      setPayments([]);
      setCommissions([]);
      setAudit([]);
      return;
    }
    let cancelled = false;
    const id = caseRow.id;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [
          d,
          f,
          b,
          ir,
          irp,
          tr,
          cu,
          lo,
          ta,
          me,
          pa,
          co,
          au,
        ] = await Promise.all([
          transactionDocumentService.listByCase(id),
          financingRequestService.listByCase(id),
          brokerCaseService.listByCase(id),
          inspectionService.listRequestsByCase(id),
          inspectionService.listReportsByCase(id),
          transportRequestService.listByCase(id),
          customsCaseService.listByCase(id),
          logisticsTaskService.listByCase(id),
          transactionTaskService.listByCase(id),
          transactionMessageService.listByCase(id),
          paymentRecordService.listByCase(id),
          commissionRecordService.listByCase(id),
          auditLogService.listByCase(id),
        ]);
        if (cancelled) return;
        setDocuments(Array.isArray(d) ? d : []);
        setFinancing(Array.isArray(f) ? f : []);
        setBrokers(Array.isArray(b) ? b : []);
        setInspections(Array.isArray(ir) ? ir : []);
        setInspectionReports(Array.isArray(irp) ? irp : []);
        setTransport(Array.isArray(tr) ? tr : []);
        setCustoms(Array.isArray(cu) ? cu : []);
        setLogistics(Array.isArray(lo) ? lo : []);
        setTasks(Array.isArray(ta) ? ta : []);
        setMessages(Array.isArray(me) ? me : []);
        setPayments(Array.isArray(pa) ? pa : []);
        setCommissions(Array.isArray(co) ? co : []);
        setAudit(Array.isArray(au) ? au : []);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Erreur de chargement des détails métier');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [caseRow?.id, refreshToken]);

  return {
    loading,
    error,
    documents,
    financing,
    brokers,
    inspections,
    inspectionReports,
    transport,
    customs,
    logistics,
    tasks,
    messages,
    payments,
    commissions,
    audit,
  };
}

export default function TransactionCasePage({ caseId }: TransactionCasePageProps) {
  const [caseRow, setCaseRow] = useState<TransactionCaseRow | null | undefined>(undefined);
  const [participants, setParticipants] = useState<TransactionParticipantRow[]>([]);
  const [events, setEvents] = useState<TransactionEventRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionTick, setActionTick] = useState(0);
  const bundle = useTransactionCaseBundles(caseRow ?? null, actionTick);

  /** Recharge participants + timeline (après assignation/révocation de partenaire). */
  const refreshMeta = useCallback(async () => {
    try {
      const [p, e] = await Promise.all([
        listTransactionParticipants(caseId),
        listTransactionEvents(caseId),
      ]);
      setParticipants(p);
      setEvents(e);
    } catch {
      /* lecture best-effort : on garde l'affichage courant en cas d'échec */
    }
    setActionTick((t) => t + 1);
  }, [caseId]);

  const [revoking, setRevoking] = useState<string | null>(null);
  const handleRevoke = useCallback(
    async (participantId: string) => {
      setRevoking(participantId);
      const r = await revokeTransactionPartner(caseId, participantId);
      setRevoking(null);
      if (r.ok || r.reason === 'revoked') await refreshMeta();
    },
    [caseId, refreshMeta],
  );

  // Utilisateur courant : pour décider quelles invitations sont actionnables par lui.
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setCurrentUserId(data.user?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const [invAction, setInvAction] = useState<string | null>(null);
  const handleInvitation = useCallback(
    async (participantId: string, accept: boolean) => {
      setInvAction(participantId);
      const r = accept
        ? await acceptTransactionInvitation(participantId)
        : await declineTransactionInvitation(participantId);
      setInvAction(null);
      if (r.ok) await refreshMeta();
    },
    [refreshMeta],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      setCaseRow(undefined);
      try {
        const [c, p, e] = await Promise.all([
          getTransactionCase(caseId),
          listTransactionParticipants(caseId),
          listTransactionEvents(caseId),
        ]);
        if (cancelled) return;
        setCaseRow(c);
        setParticipants(p);
        setEvents(e);
      } catch (err) {
        if (!cancelled) {
          setCaseRow(null);
          setError(err instanceof Error ? err.message : 'Impossible de charger le dossier');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  if (caseRow === undefined) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3 text-gray-600">
        <Loader2 className="h-10 w-10 animate-spin text-orange-600" />
        <span className="text-sm">Chargement du dossier…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <a
          href="#dossiers"
          className="inline-flex items-center gap-2 text-sm text-orange-700 hover:underline mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour aux dossiers
        </a>
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      </div>
    );
  }

  if (!caseRow) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <FolderOpen className="h-12 w-12 mx-auto text-gray-300 mb-4" />
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Dossier introuvable</h1>
        <p className="text-gray-600 mb-6 text-sm">
          Ce dossier n’existe pas ou vous n’y avez pas accès. Vérifiez que le module transaction est déployé (
          <code className="text-xs bg-gray-100 px-1 rounded">transaction_platform_core.sql</code>
          puis éventuellement <code className="text-xs bg-gray-100 px-1 rounded">transaction_platform_extended.sql</code>
          ).
        </p>
        <a
          href="#dossiers"
          className="inline-flex items-center gap-2 rounded-md bg-orange-600 px-4 py-2 text-white text-sm font-medium hover:bg-orange-700"
        >
          Retour aux dossiers
        </a>
      </div>
    );
  }

  const formatCurrency = (n: number | null | undefined, cur?: string | null) => {
    if (n == null || Number.isNaN(n)) return '—';
    return `${Number(n).toLocaleString('fr-FR')} ${cur || caseRow.currency || 'MAD'}`;
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <a
        href="#dossiers"
        className="inline-flex items-center gap-2 text-sm text-orange-700 hover:underline mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Mes dossiers
      </a>

      <header className="mb-8 border-b border-gray-200 pb-6">
        <div className="flex flex-wrap items-start gap-3">
          <div className="rounded-lg bg-orange-50 p-2 text-orange-700">
            <FolderOpen className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {caseRow.title?.trim() || 'Dossier transaction'}
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              {caseRow.kind} · {caseRow.status}
              {caseRow.stage ? ` · ${caseRow.stage}` : ''}
              {caseRow.machine_id && (
                <>
                  {' '}
                  · machine{' '}
                  <a href={`#machines/${caseRow.machine_id}`} className="text-orange-700 hover:underline">
                    {caseRow.machine_id.slice(0, 8)}…
                  </a>
                </>
              )}
            </p>
            <p className="text-xs text-gray-400 mt-2 font-mono">ID {caseRow.id}</p>
            {(caseRow.total_amount != null || caseRow.priority) && (
              <p className="text-xs text-gray-600 mt-2">
                {caseRow.total_amount != null && (
                  <span className="mr-3">Montant : {formatCurrency(caseRow.total_amount)}</span>
                )}
                {caseRow.priority && <span>Priorité : {caseRow.priority}</span>}
              </p>
            )}
          </div>
        </div>
        {caseRow.notes && (
          <p className="mt-4 text-sm text-gray-700 whitespace-pre-wrap">{caseRow.notes}</p>
        )}
      </header>

      <TransactionCaseActions caseId={caseRow.id} onDone={() => setActionTick((t) => t + 1)} />
      <AssignPartnerPanel caseId={caseRow.id} onChanged={() => void refreshMeta()} />

      {bundle.loading && (
        <div className="mb-6 flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin text-orange-600" />
          Chargement des objets liés (financement, transport, documents…)…
        </div>
      )}
      {bundle.error && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {bundle.error}
        </div>
      )}

      <div className="space-y-10">
        <section className="grid gap-8 md:grid-cols-2">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Participants</h2>
            {participants.length === 0 ? (
              <p className="text-sm text-gray-500">Aucune ligne participant (droits élargis via acheteur / vendeur).</p>
            ) : (
              <ul className="rounded-lg border border-gray-200 divide-y divide-gray-100 bg-white text-sm">
                {participants.map((p) => {
                  const isPartner = ['mechanic', 'broker', 'carrier', 'forwarder', 'logistician', 'investor'].includes(
                    p.role,
                  );
                  const status = p.revoked_at ? 'revoked' : p.accepted_at ? 'accepted' : 'pending';
                  const isMyPendingInvite = isPartner && p.user_id === currentUserId && status === 'pending';
                  const badge =
                    !isPartner
                      ? null
                      : status === 'accepted'
                        ? { text: 'Accepté', cls: 'bg-green-100 text-green-800' }
                        : status === 'revoked'
                          ? { text: 'Révoqué', cls: 'bg-gray-100 text-gray-500' }
                          : { text: 'En attente', cls: 'bg-amber-100 text-amber-800' };
                  return (
                    <li key={p.id} className="px-3 py-2 flex items-center justify-between gap-2">
                      <span className="font-medium text-gray-800">{p.role}</span>
                      <span className="flex items-center gap-2 min-w-0">
                        {badge && (
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.cls}`}
                          >
                            {badge.text}
                          </span>
                        )}
                        <span className="text-gray-500 font-mono text-xs truncate">{p.user_id}</span>
                        {isMyPendingInvite ? (
                          <span className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              title="Accepter l’invitation"
                              disabled={invAction === p.id}
                              onClick={() => void handleInvitation(p.id, true)}
                              className="rounded p-0.5 text-gray-400 transition hover:bg-green-50 hover:text-green-600 disabled:opacity-40"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              title="Refuser l’invitation"
                              disabled={invAction === p.id}
                              onClick={() => void handleInvitation(p.id, false)}
                              className="rounded p-0.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </span>
                        ) : (
                          isPartner &&
                          status !== 'revoked' && (
                            <button
                              type="button"
                              title="Révoquer ce partenaire"
                              disabled={revoking === p.id}
                              onClick={() => void handleRevoke(p.id)}
                              className="shrink-0 rounded p-0.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div>
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">
              Timeline (événements)
            </h2>
            {events.length === 0 ? (
              <p className="text-sm text-gray-500">Pas encore d’événement enregistré.</p>
            ) : (
              <ul className="space-y-3">
                {events.map((ev) => {
                  const summary =
                    (typeof ev.payload?.summary === 'string' && ev.payload.summary) ||
                    ev.description?.trim() ||
                    null;
                  return (
                    <li
                      key={ev.id}
                      className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm"
                    >
                      <div className="font-medium text-gray-900">{ev.event_type}</div>
                      {summary && <div className="text-xs text-gray-600 mt-1">{summary}</div>}
                      <div className="text-xs text-gray-500 mt-1">
                        {new Date(ev.created_at).toLocaleString('fr-FR')}
                      </div>
                      {ev.payload &&
                        typeof ev.payload === 'object' &&
                        Object.keys(ev.payload).length > 0 &&
                        ev.event_type !== 'case.created_from_quote' && (
                          <pre className="mt-2 text-xs text-gray-600 overflow-x-auto max-h-24">
                            {JSON.stringify(ev.payload)}
                          </pre>
                        )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Documents</h2>
          {bundle.documents.length === 0 ? (
            <p className="text-sm text-gray-500">Aucun document lié ou non visible avec votre rôle.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {bundle.documents.map((doc) => (
                <li
                  key={doc.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-100 bg-white px-3 py-2"
                >
                  <div>
                    <div className="font-medium text-gray-900">{doc.title || doc.document_type}</div>
                    <div className="text-xs text-gray-500">
                      {doc.document_type}
                      {doc.requires_consent ? ` · consentement ${doc.consent_status || '?'}` : ''}
                    </div>
                  </div>
                  <span className="text-[10px] text-gray-400 font-mono">{doc.storage_bucket}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="grid gap-8 md:grid-cols-2">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Financement</h2>
            {bundle.financing.length === 0 ? (
              <p className="text-sm text-gray-500">Aucune demande.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {bundle.financing.map((r) => (
                  <li key={r.id} className="rounded border border-gray-100 bg-white px-3 py-2">
                    <div className="font-medium">{r.status}</div>
                    <div className="text-xs text-gray-600">{formatCurrency(r.requested_amount, r.currency)}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Courtage</h2>
            {bundle.brokers.length === 0 ? (
              <p className="text-sm text-gray-500">Aucun dossier courtier.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {bundle.brokers.map((b) => (
                  <li key={b.id} className="rounded border border-gray-100 bg-white px-3 py-2">
                    <div className="font-medium">{b.case_status}</div>
                    {b.commission_amount != null && (
                      <div className="text-xs text-gray-600">
                        Commission {formatCurrency(b.commission_amount)}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="grid gap-8 md:grid-cols-2">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Inspections</h2>
            {bundle.inspections.length === 0 ? (
              <p className="text-sm text-gray-500">Aucune demande.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {bundle.inspections.map((x) => (
                  <li key={x.id} className="rounded border border-gray-100 bg-white px-3 py-2">
                    <div className="font-medium">{x.status}</div>
                    {x.scheduled_at && (
                      <div className="text-xs text-gray-600">
                        {new Date(x.scheduled_at).toLocaleString('fr-FR')}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">
              Rapports d’inspection
            </h2>
            {bundle.inspectionReports.length === 0 ? (
              <p className="text-sm text-gray-500">Aucun rapport.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {bundle.inspectionReports.map((r) => (
                  <li key={r.id} className="rounded border border-gray-100 bg-white px-3 py-2">
                    {r.condition_score != null && (
                      <div className="font-medium text-gray-900">Score {r.condition_score}/100</div>
                    )}
                    {r.summary && <div className="text-xs text-gray-700 mt-1">{r.summary}</div>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="grid gap-8 md:grid-cols-2">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Transport</h2>
            {bundle.transport.length === 0 ? (
              <p className="text-sm text-gray-500">Aucune demande.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {bundle.transport.map((t) => (
                  <li key={t.id} className="rounded border border-gray-100 bg-white px-3 py-2">
                    <div className="font-medium">{t.status}</div>
                    <div className="text-xs text-gray-600">
                      {[t.pickup_location, t.delivery_location].filter(Boolean).join(' → ') || '—'}
                    </div>
                    {t.machine_weight != null && (
                      <div className="text-xs text-gray-500">Poids {t.machine_weight} t</div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Douane</h2>
            {bundle.customs.length === 0 ? (
              <p className="text-sm text-gray-500">Aucun dossier douanier.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {bundle.customs.map((c) => (
                  <li key={c.id} className="rounded border border-gray-100 bg-white px-3 py-2">
                    <div className="font-medium">{c.customs_status}</div>
                    <div className="text-xs text-gray-600">
                      {[c.origin_country, c.destination_country].filter(Boolean).join(' → ') || '—'}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="grid gap-8 md:grid-cols-2">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Logistique</h2>
            {bundle.logistics.length === 0 ? (
              <p className="text-sm text-gray-500">Aucune tâche.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {bundle.logistics.map((l) => (
                  <li key={l.id} className="rounded border border-gray-100 bg-white px-3 py-2">
                    <div className="font-medium">
                      {l.task_type} · {l.status}
                    </div>
                    {l.location && <div className="text-xs text-gray-600">{l.location}</div>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">
              Paiements & commissions
            </h2>
            {bundle.payments.length === 0 && bundle.commissions.length === 0 ? (
              <p className="text-sm text-gray-500">Aucun enregistrement.</p>
            ) : (
              <div className="space-y-3">
                {bundle.payments.length > 0 && (
                  <ul className="space-y-1 text-sm">
                    {bundle.payments.map((p) => (
                      <li key={p.id} className="text-xs text-gray-700">
                        {p.payment_type} · {p.status} · {formatCurrency(p.amount, p.currency)}
                      </li>
                    ))}
                  </ul>
                )}
                {bundle.commissions.length > 0 && (
                  <ul className="space-y-1 text-sm">
                    {bundle.commissions.map((c) => (
                      <li key={c.id} className="text-xs text-gray-700">
                        {c.role} · {c.status} · {formatCurrency(c.amount, c.currency)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="grid gap-8 md:grid-cols-2">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Tâches dossier</h2>
            {bundle.tasks.length === 0 ? (
              <p className="text-sm text-gray-500">Aucune tâche.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {bundle.tasks.map((t) => (
                  <li key={t.id} className="rounded border border-gray-100 bg-white px-3 py-2">
                    <div className="font-medium">{t.title}</div>
                    <div className="text-xs text-gray-600">
                      {t.status}
                      {t.due_date ? ` · échéance ${new Date(t.due_date).toLocaleDateString('fr-FR')}` : ''}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Messages</h2>
            {bundle.messages.length === 0 ? (
              <p className="text-sm text-gray-500">Aucun message.</p>
            ) : (
              <ul className="space-y-2 text-sm max-h-64 overflow-y-auto">
                {bundle.messages.map((m) => (
                  <li key={m.id} className="rounded border border-gray-100 bg-white px-3 py-2 text-xs">
                    <div className="text-gray-500 mb-1">
                      {new Date(m.created_at).toLocaleString('fr-FR')} · {m.sender_id.slice(0, 8)}…
                    </div>
                    <div className="text-gray-800 whitespace-pre-wrap">{m.message}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">
            Journal d’audit (dossier)
          </h2>
          {bundle.audit.length === 0 ? (
            <p className="text-sm text-gray-500">
              Aucune entrée visible (déployez <code className="text-xs bg-gray-100 px-1 rounded">transaction_platform_extended.sql</code>{' '}
              et la colonne <code className="text-xs bg-gray-100 px-1 rounded">transaction_case_id</code> sur{' '}
              <code className="text-xs bg-gray-100 px-1 rounded">audit_logs</code>).
            </p>
          ) : (
            <ul className="space-y-2 text-xs text-gray-700">
              {bundle.audit.map((a) => (
                <li key={a.id} className="border-l-2 border-orange-200 pl-3">
                  <div className="font-medium">{a.action}</div>
                  <div className="text-gray-500">
                    {a.entity_type} · {new Date(a.created_at).toLocaleString('fr-FR')}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
