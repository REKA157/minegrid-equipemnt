#!/usr/bin/env node
/**
 * PREUVE MG-H10 — « après un changement de formule, il reste UN SEUL abonnement actif ».
 *
 * Interroge directement Paddle et compte les abonnements actifs d'un client.
 * C'est la seule vérification qui engage vraiment : les tests du dépôt prouvent
 * que NOTRE code ne peut pas créer de doublon ; celui-ci prouve l'état RÉEL.
 *
 * UTILISATION (la clé n'est jamais écrite dans le dépôt ni affichée) :
 *
 *   # PowerShell
 *   $env:PADDLE_API_KEY = "ta_cle_sandbox"
 *   $env:PADDLE_ENV = "sandbox"          # ou "production"
 *   node .audit/verifier-un-seul-abonnement.mjs test@minegrid.ma
 *
 * PROTOCOLE DE PREUVE (à faire dans cet ordre) :
 *   1. lancer le script  -> note le nombre d'abonnements actifs AVANT
 *   2. sur le site, changer de formule (ex. Premium 20 $ -> Enterprise 200 $)
 *   3. relancer le script -> il doit rester EXACTEMENT 1 abonnement actif,
 *      au NOUVEAU prix, avec le MÊME identifiant qu'avant.
 *
 * Le script ne modifie rien : il ne fait que lire.
 */

const CLE = process.env.PADDLE_API_KEY ?? '';
const BASE =
  (process.env.PADDLE_ENV ?? 'sandbox') === 'production'
    ? 'https://api.paddle.com'
    : 'https://sandbox-api.paddle.com';

const cible = process.argv[2];

if (!CLE) {
  console.error("\n❌ PADDLE_API_KEY absente de l'environnement.");
  console.error('   PowerShell :  $env:PADDLE_API_KEY = "ta_cle"');
  console.error('   Ne la colle jamais dans un fichier du dépôt ni dans une conversation.\n');
  process.exit(2);
}
if (!cible) {
  console.error('\n❌ Indiquez l’e-mail du client, ou son identifiant ctm_…');
  console.error('   node .audit/verifier-un-seul-abonnement.mjs test@minegrid.ma\n');
  process.exit(2);
}

async function paddle(chemin) {
  const r = await fetch(`${BASE}${chemin}`, {
    headers: { Authorization: `Bearer ${CLE}`, 'Content-Type': 'application/json' },
  });
  const corps = await r.json().catch(() => ({}));
  if (!r.ok) {
    // On n'affiche jamais l'en-tête d'autorisation.
    throw new Error(`Paddle ${r.status} sur ${chemin} : ${JSON.stringify(corps).slice(0, 300)}`);
  }
  return corps;
}

const ETATS_ACTIFS = new Set(['active', 'trialing', 'past_due']);

function montant(sub) {
  const item = sub.items?.[0];
  const prix = item?.price?.unit_price;
  if (!prix) return '?';
  // Paddle exprime les montants en CENTIMES.
  return `${(Number(prix.amount) / 100).toFixed(2)} ${prix.currency_code}`;
}

try {
  console.log(`\nEnvironnement : ${BASE}`);

  let customerId = cible;
  if (!cible.startsWith('ctm_')) {
    const clients = await paddle(`/customers?email=${encodeURIComponent(cible)}`);
    const trouve = clients.data?.[0];
    if (!trouve) {
      console.error(`\n❌ Aucun client Paddle pour « ${cible} » dans cet environnement.\n`);
      process.exit(1);
    }
    customerId = trouve.id;
    console.log(`Client        : ${cible} -> ${customerId}`);
  }

  const abos = await paddle(`/subscriptions?customer_id=${customerId}&per_page=100`);
  const tous = abos.data ?? [];
  const actifs = tous.filter((s) => ETATS_ACTIFS.has(s.status));

  console.log(`\nAbonnements (tous statuts) : ${tous.length}`);
  for (const s of tous) {
    const marque = ETATS_ACTIFS.has(s.status) ? '●' : '·';
    const programmee = s.scheduled_change?.action ? ` [${s.scheduled_change.action} programmé]` : '';
    console.log(`  ${marque} ${s.id}  ${s.status.padEnd(9)}  ${montant(s)}${programmee}`);
  }

  const total = actifs.reduce((somme, s) => {
    const p = s.items?.[0]?.price?.unit_price;
    return somme + (p ? Number(p.amount) / 100 : 0);
  }, 0);

  console.log('');
  if (actifs.length === 1) {
    console.log(`✅ UN SEUL abonnement actif — ${actifs[0].id}, ${montant(actifs[0])}.`);
    console.log("   L'invariant est respecté : pas de double facturation.\n");
    process.exit(0);
  }
  if (actifs.length === 0) {
    console.log('⚠️  AUCUN abonnement actif pour ce client.');
    console.log("   Attendu après une résiliation ; anormal juste après un changement de formule.\n");
    process.exit(1);
  }
  console.error(`❌ ${actifs.length} abonnements ACTIFS en même temps — le client est facturé ${total.toFixed(2)} au lieu d'un seul montant.`);
  console.error('   C’est exactement le défaut MG-H10. Résiliez les doublons dans le tableau de bord Paddle.\n');
  process.exit(1);
} catch (e) {
  console.error(`\n❌ ${e.message}\n`);
  process.exit(2);
}
