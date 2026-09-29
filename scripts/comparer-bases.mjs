#!/usr/bin/env node
/**
 * COMPARATEUR D'ENVIRONNEMENTS — production vs staging.
 *
 * POURQUOI CE SCRIPT EXISTE
 * -------------------------
 * Le 2026-08-18, CINQ pannes distinctes ont eu la MEME cause : un objet present
 * dans une base et absent dans l'autre, sans que rien ne le signale.
 *
 *   get_effective_subscription_for -> Global Monitor refuse malgre un abonnement valide
 *   tender_workspaces              -> module Appels d'offres bloque en mode local
 *   index unique pro_clients       -> code promo et webhook Paddle en echec
 *   p27 / p28 / p29                -> console d'administration incomplete
 *
 * Chacune a coute entre vingt minutes et deux heures de diagnostic, parce que le
 * symptome (« injoignable », « code invalide », « page introuvable ») ne
 * designait jamais la cause. Ce script rend l'ecart visible en trente secondes,
 * AVANT qu'il ne devienne une panne.
 *
 * AUCUN SECRET REQUIS
 * -------------------
 * Il interroge les deux bases avec leur cle ANON, publique par construction
 * (elle est embarquee dans le site). Lectures seules :
 *   table absente -> HTTP 404 · fonction absente -> code PGRST202
 *   presente mais protegee -> 401/403, ce qui prouve quand meme l'existence.
 *
 * PIEGE MAJEUR, APPRIS A NOS DEPENS
 * ---------------------------------
 * Une fonction appelee SANS ses arguments repond PGRST202 — exactement comme si
 * elle n'existait pas. Le 2026-08-18, un premier releve a ainsi declare absentes
 * six fonctions parfaitement presentes, et m'a envoye chercher des migrations
 * manquantes qui etaient toutes la. Chaque fonction declaree ici DOIT donc
 * fournir des arguments plausibles.
 *
 * USAGE
 *   node scripts/comparer-bases.mjs
 *   node scripts/comparer-bases.mjs --json
 * Sort en code 1 si un ecart est detecte : utilisable comme garde-fou en CI.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const PROJETS = {
  prod: { ref: 'tnfbggrftmtxpgbcwqzo' },
  staging: { ref: 'vrouxqofmlbkxgznftja' },
};

const U = '00000000-0000-0000-0000-000000000000';

/**
 * Objets attendus dans LES DEUX bases.
 *
 * Tenir cette liste a jour fait partie de la livraison d'une migration : une
 * migration qui ajoute une fonction ajoute sa ligne ici. Sans cela, le prochain
 * ecart redeviendra invisible — et c'est precisement ce qu'on veut empecher.
 */
const ATTENDUS = [
  { type: 'table', nom: 'machines' },
  { type: 'table', nom: 'pro_clients' },
  { type: 'table', nom: 'contact_messages' },
  { type: 'table', nom: 'promo_codes' },
  { type: 'table', nom: 'organizations' },
  { type: 'table', nom: 'organization_members' },
  { type: 'table', nom: 'user_invitations' },
  { type: 'table', nom: 'subscription_payments' },
  { type: 'table', nom: 'tender_workspaces' },

  { type: 'fonction', nom: 'get_org_members', args: {} },
  { type: 'fonction', nom: 'get_my_member_scope', args: {} },
  { type: 'fonction', nom: 'create_invitation', args: { p_email: 'x@y.ma', p_name: 'X', p_role: 'viewer' } },
  { type: 'fonction', nom: 'accept_invitation', args: { p_token: 'x' } },
  { type: 'fonction', nom: 'remove_org_member', args: { p_user_id: U } },
  { type: 'fonction', nom: 'set_org_member_role', args: { p_user_id: U, p_role: 'admin' } },

  { type: 'fonction', nom: 'get_effective_subscription', args: {} },
  { type: 'fonction', nom: 'get_effective_subscription_for', args: { p_user_id: U } },
  { type: 'fonction', nom: 'redeem_promo_code', args: { p_code: 'X' } },

  { type: 'fonction', nom: 'ensure_my_organization', args: {} },
  { type: 'fonction', nom: 'org_seat_limit', args: { p_org: U } },
  { type: 'fonction', nom: 'org_seats_used', args: { p_org: U } },

  { type: 'fonction', nom: 'is_platform_admin', args: {} },
  { type: 'fonction', nom: 'platform_admin_role', args: {} },
  { type: 'fonction', nom: 'list_platform_admins', args: {} },
  { type: 'fonction', nom: 'admin_list_subscribers', args: {} },
  { type: 'fonction', nom: 'admin_subscriber_stats', args: {} },
  { type: 'fonction', nom: 'admin_extend_subscription', args: { p_user_id: U, p_jours: 1, p_reason: 'x' } },
  { type: 'fonction', nom: 'admin_list_contact_messages', args: {} },
  { type: 'fonction', nom: 'admin_list_promo_codes', args: {} },
  { type: 'fonction', nom: 'admin_list_payments', args: {} },
  { type: 'fonction', nom: 'admin_payment_stats', args: {} },

  { type: 'fonction', nom: 'get_my_tender_workspace', args: {} },

  // p33 — recherche du catalogue cote base. Sans eux, le filtre et le tri par
  // prix restent limites aux annonces chargees, et le menu des marques n'en
  // propose que 44 sur 449.
  { type: 'table', nom: 'machines_catalogue' },
  { type: 'fonction', nom: 'catalogue_facettes', args: {} },
];

function cleAnon(env) {
  if (env === 'staging') {
    if (!existsSync('.env.staging')) return null;
    const l = readFileSync('.env.staging', 'utf8')
      .split(/\r?\n/)
      .find((x) => x.startsWith('VITE_SUPABASE_ANON_KEY='));
    return l ? l.split('=').slice(1).join('=').trim() : null;
  }
  const d = join('dist', 'assets');
  if (!existsSync(d)) return null;
  for (const f of readdirSync(d)) {
    if (!f.endsWith('.js')) continue;
    const m = readFileSync(join(d, f), 'utf8').match(/eyJ[A-Za-z0-9_.-]{100,}/);
    if (m) return m[0];
  }
  return null;
}

async function sonder(ref, cle, o) {
  const base = `https://${ref}.supabase.co/rest/v1`;
  const h = { apikey: cle, Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' };
  try {
    if (o.type === 'table') {
      const r = await fetch(`${base}/${o.nom}?select=*&limit=1`, { headers: h });
      return r.status === 404 ? 'absent' : 'present';
    }
    const r = await fetch(`${base}/rpc/${o.nom}`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify(o.args ?? {}),
    });
    if (r.status === 404) {
      const c = await r.text().catch(() => '');
      return c.includes('PGRST202') ? 'absent' : 'present';
    }
    return 'present';
  } catch {
    return 'injoignable';
  }
}

const cles = { prod: cleAnon('prod'), staging: cleAnon('staging') };
for (const [env, c] of Object.entries(cles)) {
  if (!c) {
    console.error(
      `\n❌ Cle anon introuvable pour ${env}.` +
        (env === 'prod'
          ? ' Lancez npm run build d abord : elle est lue dans dist/assets.'
          : ' Fichier .env.staging absent.') +
        '\n',
    );
    process.exit(2);
  }
}

const lignes = [];
for (const o of ATTENDUS) {
  const [p, s] = await Promise.all([
    sonder(PROJETS.prod.ref, cles.prod, o),
    sonder(PROJETS.staging.ref, cles.staging, o),
  ]);
  // TROIS etats, pas deux. Une premiere version ne signalait que les ECARTS —
  // et taisait donc les objets absents des DEUX bases, qui sont pourtant du
  // travail non livre (p27/p28/p29 l'etaient, sans un mot). Un comparateur qui
  // ne regarde que la difference declare « tout va bien » sur deux bases
  // egalement incompletes.
  const etat = p === s ? (p === 'present' ? 'ok' : 'manquant-partout') : 'ecart';
  lignes.push({ objet: o.nom, type: o.type, prod: p, staging: s, etat });
}

const ecarts = lignes.filter((l) => l.etat === 'ecart');
const manquants = lignes.filter((l) => l.etat === 'manquant-partout');

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ ecarts: ecarts.length, manquants: manquants.length, lignes }, null, 2));
  process.exit(ecarts.length || manquants.length ? 1 : 0);
}

const MARQUE = { ok: ' ', ecart: '⚠', 'manquant-partout': '✗' };
const w = Math.max(...lignes.map((l) => l.objet.length), 10);
console.log(`\n  ${'OBJET'.padEnd(w)}  ${'PROD'.padEnd(10)}  STAGING`);
console.log(`  ${'-'.repeat(w)}  ${'-'.repeat(10)}  ${'-'.repeat(10)}`);
for (const l of lignes) {
  console.log(`${MARQUE[l.etat]} ${l.objet.padEnd(w)}  ${l.prod.padEnd(10)}  ${l.staging}`);
}

console.log('');
if (!ecarts.length && !manquants.length) {
  console.log('✅ Les deux bases portent tous les objets attendus.\n');
  process.exit(0);
}

if (ecarts.length) {
  console.log(`⚠  ${ecarts.length} ECART(S) entre les deux bases — la cause classique des pannes silencieuses :\n`);
  for (const l of ecarts) {
    console.log(`   • ${l.objet} (${l.type}) manque en ${l.prod === 'absent' ? 'PRODUCTION' : 'STAGING'}`);
  }
  console.log('');
}

if (manquants.length) {
  console.log(`✗  ${manquants.length} OBJET(S) absent(s) des DEUX bases — migration ecrite mais jamais appliquee :\n`);
  for (const l of manquants) {
    console.log(`   • ${l.objet} (${l.type})`);
  }
  console.log('');
}

console.log('   Appliquez les migrations correspondantes, puis relancez ce script.\n');
process.exit(1);
