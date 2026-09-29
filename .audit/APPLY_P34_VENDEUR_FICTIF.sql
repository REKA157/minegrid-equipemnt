-- ============================================================================
-- p34 — Le vendeur fictif ne peut plus entrer dans la chaîne transactionnelle
-- ============================================================================
--
-- LE PROBLÈME
-- -----------
-- Mesuré sur la production le 2026-09-29 :
--
--     total des annonces                            16 397
--     portant 00000000-0000-0000-0000-000000000001  13 717   (83,7 %)
--     portant un vendeur réel                        2 680
--
-- Cet identifiant est celui de l'import automatique du catalogue. **Le compte
-- n'existe pas.** Une demande de devis adressée à l'une de ces 13 717 annonces
-- désigne donc un destinataire inexistant.
--
-- POURQUOI UN CORRECTIF CÔTÉ NAVIGATEUR NE SUFFIT PAS
-- ---------------------------------------------------
-- Le filtre a d'abord été posé dans le code du site (`parseSellerUuid`, puis
-- `cleanQuotePayload`). Une relecture indépendante a montré que cela ne
-- fermait pas la porte :
--
--   * `ensure_transaction_case_for_quote_request` (baseline:1078) fait
--     `coalesce(m.seller_id, m.sellerid, m.user_id, m.owner_id)` SANS filtre —
--     et sur les 13 717 annonces concernées, **les quatre colonnes** portent
--     l'identifiant fictif ;
--   * cette fonction est le REPLI qu'utilise le site lui-même quand
--     l'insertion directe échoue ;
--   * n'importe quel autre appelant, présent ou futur, contourne un filtre
--     écrit dans le navigateur.
--
-- CE QUE FAIT CETTE MIGRATION
-- ---------------------------
-- Plutôt que de corriger chaque appelant — il y en aura toujours un de plus —
-- l'invariant est posé **sur les tables**, par des déclencheurs. Un
-- déclencheur s'applique à TOUT LE MONDE : le site, la fonction serveur, une
-- requête API directe, et même la clé de service. Une politique RLS, elle, ne
-- s'applique pas au `service_role`.
--
-- Deux traitements différents, et la différence est voulue :
--
--   quote_requests      → l'identifiant fictif est REMPLACÉ PAR NULL.
--                         La demande de l'acheteur est légitime et doit être
--                         enregistrée ; c'est seulement le destinataire qui
--                         est inconnu. Le code sait déjà traiter « pas de
--                         vendeur identifié ». Refuser ferait perdre le lead.
--
--   transaction_cases   → l'insertion est REFUSÉE.
--                         Un dossier transactionnel avec un vendeur qui
--                         n'existe pas est un dossier orphelin : il porte un
--                         montant, des participants, un séquestre éventuel, et
--                         personne en face. Mieux vaut un échec visible.
--
-- Cette migration ne modifie AUCUNE donnée existante et ne change aucune
-- fonction. Elle ajoute une fonction de lecture et deux déclencheurs, et se
-- retire par trois DROP (voir la fin du fichier).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. La liste des identifiants fictifs, à un seul endroit
-- ----------------------------------------------------------------------------
-- La même liste existe déjà dans src/pages/machineDetailHelpers.ts, dans
-- src/utils/api/quoteRequests.ts et dans supabase/functions/send-contact-email.
-- Celle-ci est la seule qui soit opposable : les trois autres peuvent être
-- contournées, pas celle-ci.

create or replace function public.est_vendeur_fictif(p_id uuid)
returns boolean
language sql
immutable
parallel safe
as $fn_fictif$
  select p_id in (
    '00000000-0000-0000-0000-000000000000'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid
  );
$fn_fictif$;

comment on function public.est_vendeur_fictif(uuid) is
  'Vrai si cet identifiant est un vendeur fictif laissé par l''import automatique du '
  'catalogue (13 717 annonces sur 16 397 au 2026-09-29). Ces comptes n''existent pas.';

-- ----------------------------------------------------------------------------
-- 2. quote_requests : on normalise, on ne refuse pas
-- ----------------------------------------------------------------------------

create or replace function public.qr_normaliser_vendeur_fn()
returns trigger
language plpgsql
as $fn_qr$
begin
  if new.seller_id is not null and public.est_vendeur_fictif(new.seller_id) then
    -- La demande est conservée : seul le destinataire fictif est effacé.
    -- Le code appelant sait traiter un vendeur inconnu ; il ne sait pas
    -- traiter un vendeur qui n'existe pas.
    new.seller_id := null;
  end if;
  return new;
end;
$fn_qr$;

drop trigger if exists qr_normaliser_vendeur on public.quote_requests;
create trigger qr_normaliser_vendeur
  before insert or update of seller_id on public.quote_requests
  for each row execute function public.qr_normaliser_vendeur_fn();

-- ----------------------------------------------------------------------------
-- 3. transaction_cases : on refuse
-- ----------------------------------------------------------------------------

create or replace function public.tc_refuser_vendeur_fictif_fn()
returns trigger
language plpgsql
as $fn_tc$
begin
  if new.seller_user_id is not null and public.est_vendeur_fictif(new.seller_user_id) then
    raise exception
      'Dossier impossible : cette annonce provient de l''import automatique et n''a pas de vendeur réel. '
      'Contactez contact@minegrid.ma pour être mis en relation.'
      using errcode = '23514';
  end if;
  return new;
end;
$fn_tc$;

drop trigger if exists tc_refuser_vendeur_fictif on public.transaction_cases;
create trigger tc_refuser_vendeur_fictif
  before insert or update of seller_user_id on public.transaction_cases
  for each row execute function public.tc_refuser_vendeur_fictif_fn();

-- ============================================================================
-- POUR ANNULER CETTE MIGRATION
--   drop trigger if exists tc_refuser_vendeur_fictif on public.transaction_cases;
--   drop trigger if exists qr_normaliser_vendeur on public.quote_requests;
--   drop function if exists public.tc_refuser_vendeur_fictif_fn();
--   drop function if exists public.qr_normaliser_vendeur_fn();
--   drop function if exists public.est_vendeur_fictif(uuid);
--
-- CE QU'ELLE NE FAIT PAS, VOLONTAIREMENT
--   * Elle ne touche pas aux 13 717 annonces : ce sont des données, et décider
--     de les masquer, de les rattacher ou de les étiqueter est une décision
--     produit, pas une correction technique.
--   * Elle ne modifie pas `moderer_annonce` (p32), qui résout le propriétaire
--     pour empêcher un administrateur de modérer sa propre annonce. Y filtrer
--     le fantôme inverserait le sens du contrôle.
-- ============================================================================
