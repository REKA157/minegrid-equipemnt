import supabase from '../supabaseClient';

/**
 * Console d'administration de la plateforme — accès aux fonctions serveur.
 *
 * RÈGLE : le navigateur ne décide JAMAIS qui est administrateur. Il pose la
 * question au serveur (`is_platform_admin`, sans paramètre : l'identité vient
 * de la session), et le serveur revérifie de toute façon à chaque geste. Les
 * écrans ne sont qu'un confort d'affichage — la sécurité est en base.
 *
 * En cas de doute — erreur réseau, réponse inattendue, session absente — on
 * répond NON. Un refus injustifié se corrige d'un rechargement ; un accès
 * accordé par erreur ouvre la liste de tous les abonnés.
 */

export interface PlatformAdmin {
  userId: string;
  email: string;
  role: 'owner' | 'support' | 'finance' | 'moderation';
  grantedAt: string | null;
  revokedAt: string | null;
  actif: boolean;
}

/** L'utilisateur connecté est-il administrateur de la plateforme, MAINTENANT ? */
export async function isPlatformAdmin(): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('is_platform_admin');
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

/** Rôle d'administration de l'appelant, ou null s'il n'en a aucun. */
export async function getPlatformAdminRole(): Promise<PlatformAdmin['role'] | null> {
  try {
    const { data, error } = await supabase.rpc('platform_admin_role');
    if (error || typeof data !== 'string') return null;
    return data as PlatformAdmin['role'];
  } catch {
    return null;
  }
}

/** La liste des administrateurs — le serveur refuse si l'appelant n'en est pas un. */
export async function listPlatformAdmins(): Promise<PlatformAdmin[]> {
  const { data, error } = await supabase.rpc('list_platform_admins');
  if (error) throw new Error(error.message);
  const lignes = Array.isArray(data) ? data : [];
  return lignes.map((l: Record<string, unknown>) => ({
    userId: String(l.user_id ?? ''),
    email: String(l.email ?? ''),
    role: (l.role as PlatformAdmin['role']) ?? 'support',
    grantedAt: (l.granted_at as string) ?? null,
    revokedAt: (l.revoked_at as string) ?? null,
    actif: Boolean(l.actif),
  }));
}

/** Nommer un administrateur. Motif écrit obligatoire — le serveur l'exige aussi. */
export async function grantPlatformAdmin(
  email: string,
  role: PlatformAdmin['role'],
  motif: string,
): Promise<void> {
  const { error } = await supabase.rpc('grant_platform_admin', {
    p_email: email,
    p_role: role,
    p_reason: motif,
  });
  if (error) throw new Error(error.message);
}

/** Révoquer un administrateur. Le serveur refuse le dernier actif et soi-même. */
export async function revokePlatformAdmin(userId: string, motif: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_platform_admin', {
    p_user_id: userId,
    p_reason: motif,
  });
  if (error) throw new Error(error.message);
}

/* ------------------------------------------------------------------ */
/* Écran « Abonnés »                                                    */
/* ------------------------------------------------------------------ */

export interface Subscriber {
  userId: string;
  email: string;
  companyName: string;
  /**
   * CODE INTERNE ('pro' | 'premium' | 'enterprise'), jamais le libellé.
   * ⚠️ Les codes sont CROISÉS à l'affichage : 'pro' se dit « Premium » (20 $) et
   * 'premium' se dit « Pro » (50 $). Toujours passer par `planDisplayName()`.
   */
  type: string;
  /** Statut BRUT en base — peut valoir 'active' sur un abonnement expiré. */
  statusBrut: string;
  /** Statut VRAI : croise le statut et la date d'échéance. C'est celui à afficher. */
  actif: boolean;
  debut: string | null;
  echeance: string | null;
  joursRestants: number | null;
  maxUsers: number;
  siegesUtilises: number;
  paiement: string | null;
  codePromo: string | null;
  derniereConnexion: string | null;
}

export interface SubscriberStats {
  actifs: number;
  parPalier: Record<string, number>;
  expirent7j: number;
  nouveaux30j: number;
  sansPaiement: number;
}

export type FiltreAbonnes = 'tous' | 'actifs' | 'expirent' | 'inactifs';

export async function listSubscribers(
  recherche = '',
  filtre: FiltreAbonnes = 'tous',
  limite = 100,
): Promise<Subscriber[]> {
  const { data, error } = await supabase.rpc('admin_list_subscribers', {
    p_recherche: recherche || null,
    p_statut: filtre,
    p_limite: limite,
  });
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? data : []).map((l: Record<string, unknown>) => ({
    userId: String(l.user_id ?? ''),
    email: String(l.email ?? ''),
    companyName: String(l.company_name ?? ''),
    type: String(l.subscription_type ?? ''),
    statusBrut: String(l.subscription_status ?? ''),
    actif: Boolean(l.reellement_actif),
    debut: (l.subscription_start as string) ?? null,
    echeance: (l.subscription_end as string) ?? null,
    joursRestants: l.jours_restants === null ? null : Number(l.jours_restants),
    maxUsers: Number(l.max_users ?? 1),
    siegesUtilises: Number(l.sieges_utilises ?? 1),
    paiement: (l.payment_method as string) ?? null,
    codePromo: (l.promo_code_used as string) ?? null,
    derniereConnexion: (l.derniere_connexion as string) ?? null,
  }));
}

export async function getSubscriberStats(): Promise<SubscriberStats> {
  const { data, error } = await supabase.rpc('admin_subscriber_stats');
  if (error) throw new Error(error.message);
  const l = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  return {
    actifs: Number(l?.actifs ?? 0),
    parPalier: (l?.par_palier as Record<string, number>) ?? {},
    expirent7j: Number(l?.expirent_7j ?? 0),
    nouveaux30j: Number(l?.nouveaux_30j ?? 0),
    sansPaiement: Number(l?.sans_paiement ?? 0),
  };
}

/** Résultat commun aux gestes : le serveur signale si Paddle écrasera la retouche. */
export interface ResultatGeste {
  ok: boolean;
  factureParPaddle?: boolean;
  nouvelleEcheance?: string;
}

function versResultat(data: unknown): ResultatGeste {
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    ok: Boolean(d.ok),
    factureParPaddle: Boolean(d.facture_par_paddle),
    nouvelleEcheance: (d.nouvelle_echeance as string) ?? undefined,
  };
}

export async function extendSubscription(
  userId: string,
  jours: number,
  motif: string,
): Promise<ResultatGeste> {
  const { data, error } = await supabase.rpc('admin_extend_subscription', {
    p_user_id: userId,
    p_jours: jours,
    p_reason: motif,
  });
  if (error) throw new Error(error.message);
  return versResultat(data);
}

export async function changePlan(
  userId: string,
  plan: string,
  motif: string,
): Promise<ResultatGeste> {
  const { data, error } = await supabase.rpc('admin_change_plan', {
    p_user_id: userId,
    p_plan: plan,
    p_reason: motif,
  });
  if (error) throw new Error(error.message);
  return versResultat(data);
}

export async function setSubscriptionStatus(
  userId: string,
  statut: 'active' | 'suspended' | 'inactive',
  motif: string,
): Promise<ResultatGeste> {
  const { data, error } = await supabase.rpc('admin_set_subscription_status', {
    p_user_id: userId,
    p_statut: statut,
    p_reason: motif,
  });
  if (error) throw new Error(error.message);
  return versResultat(data);
}

/* ------------------------------------------------------------------ */
/* Boîte de réception Contact                                           */
/* ------------------------------------------------------------------ */

export type StatutMessage = 'new' | 'read' | 'replied' | 'archived';

export interface MessageContact {
  id: string;
  date: string;
  nom: string;
  email: string;
  societe: string | null;
  sujet: string;
  message: string;
  service: string | null;
  statut: StatutMessage;
}

export async function listContactMessages(
  statut: StatutMessage | 'tous' = 'tous',
  limite = 100,
): Promise<MessageContact[]> {
  const { data, error } = await supabase.rpc('admin_list_contact_messages', {
    p_statut: statut,
    p_limite: limite,
  });
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? data : []).map((l: Record<string, unknown>) => ({
    id: String(l.id ?? ''),
    date: String(l.created_at ?? ''),
    nom: String(l.name ?? ''),
    email: String(l.email ?? ''),
    societe: (l.company as string) ?? null,
    sujet: String(l.subject ?? ''),
    message: String(l.message ?? ''),
    service: (l.service as string) ?? null,
    statut: (l.status as StatutMessage) ?? 'new',
  }));
}

export async function contactUnreadCount(): Promise<number> {
  const { data, error } = await supabase.rpc('admin_contact_unread_count');
  if (error) return 0;
  return Number(data ?? 0);
}

export async function setContactStatus(id: string, statut: StatutMessage): Promise<void> {
  const { error } = await supabase.rpc('admin_set_contact_status', {
    p_id: id,
    p_statut: statut,
  });
  if (error) throw new Error(error.message);
}

/* ------------------------------------------------------------------ */
/* Codes promo                                                          */
/* ------------------------------------------------------------------ */

export interface CodePromo {
  id: string;
  code: string;
  plan: string;
  jours: number;
  maxUses: number;
  usesCount: number;
  expireLe: string | null;
  actif: boolean;
  /** Croise actif, échéance ET quota — le seul drapeau `actif` mentirait. */
  utilisable: boolean;
}

export async function listPromoCodes(): Promise<CodePromo[]> {
  const { data, error } = await supabase.rpc('admin_list_promo_codes');
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? data : []).map((l: Record<string, unknown>) => ({
    id: String(l.id ?? ''),
    code: String(l.code ?? ''),
    plan: String(l.subscription_type ?? ''),
    jours: Number(l.duration_days ?? 0),
    maxUses: Number(l.max_uses ?? 0),
    usesCount: Number(l.uses_count ?? 0),
    expireLe: (l.expires_at as string) ?? null,
    actif: Boolean(l.active),
    utilisable: Boolean(l.utilisable),
  }));
}

export async function createPromoCode(
  code: string,
  plan: string,
  jours: number,
  maxUses: number,
  motif: string,
  expireLe: string | null = null,
): Promise<void> {
  const { error } = await supabase.rpc('admin_create_promo_code', {
    p_code: code,
    p_plan: plan,
    p_jours: jours,
    p_max_uses: maxUses,
    p_expire: expireLe,
    p_reason: motif,
  });
  if (error) throw new Error(error.message);
}

export async function setPromoActive(id: string, actif: boolean, motif: string): Promise<void> {
  const { error } = await supabase.rpc('admin_set_promo_active', {
    p_id: id,
    p_active: actif,
    p_reason: motif,
  });
  if (error) throw new Error(error.message);
}

export async function promoRedemptions(id: string): Promise<{ email: string; date: string }[]> {
  const { data, error } = await supabase.rpc('admin_promo_redemptions', { p_id: id });
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? data : []).map((l: Record<string, unknown>) => ({
    email: String(l.email ?? ''),
    date: String(l.redeemed_at ?? ''),
  }));
}

/* ------------------------------------------------------------------ */
/* Registre des paiements                                               */
/* ------------------------------------------------------------------ */

export interface Paiement {
  date: string;
  email: string;
  plan: string;
  /** EN CENTIMES, tel que Paddle le renvoie. Diviser par 100 pour afficher. */
  montantCentimes: number | null;
  devise: string;
  evenement: string;
  reference: string | null;
}

export interface StatsPaiements {
  moisCentimes: number;
  moisNombre: number;
  totalCentimes: number;
  totalNombre: number;
  /** Liste des devises présentes. Plusieurs -> ne pas additionner. */
  devises: string;
}

export async function listPayments(limite = 50): Promise<Paiement[]> {
  const { data, error } = await supabase.rpc('admin_list_payments', { p_limite: limite });
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? data : []).map((l: Record<string, unknown>) => ({
    date: String(l.occurred_at ?? ''),
    email: String(l.email ?? ''),
    plan: String(l.plan ?? ''),
    montantCentimes: l.amount_cents === null ? null : Number(l.amount_cents),
    devise: String(l.currency ?? 'USD'),
    evenement: String(l.event_type ?? ''),
    reference: (l.reference as string) ?? null,
  }));
}

export async function getPaymentStats(): Promise<StatsPaiements> {
  const { data, error } = await supabase.rpc('admin_payment_stats');
  if (error) throw new Error(error.message);
  const l = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  return {
    moisCentimes: Number(l?.encaisse_mois_cents ?? 0),
    moisNombre: Number(l?.paiements_mois ?? 0),
    totalCentimes: Number(l?.encaisse_total_cents ?? 0),
    totalNombre: Number(l?.paiements_total ?? 0),
    devises: String(l?.devises ?? 'USD'),
  };
}

export interface ActionJournal {
  date: string;
  acteur: string;
  action: string;
  cible: string | null;
  motif: string;
}

export async function listRecentActions(limite = 50): Promise<ActionJournal[]> {
  const { data, error } = await supabase.rpc('admin_recent_actions', { p_limite: limite });
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? data : []).map((l: Record<string, unknown>) => ({
    date: String(l.created_at ?? ''),
    acteur: String(l.acteur ?? ''),
    action: String(l.action ?? ''),
    cible: (l.target_id as string) ?? null,
    motif: String(l.reason ?? ''),
  }));
}
