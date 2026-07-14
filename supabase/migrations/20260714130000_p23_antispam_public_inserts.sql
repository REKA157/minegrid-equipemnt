-- =====================================================================
-- P23 — Anti-spam des inserts PUBLICS (devis + contact) — abus / DoS
-- =====================================================================
-- FAILLE : quote_requests et contact_messages acceptent des INSERT `anon` avec
-- `with check (true)` (formulaires publics). Un visiteur (ou un script) peut donc
-- inonder la boîte des vendeurs de fausses demandes/contacts sans aucune limite.
--
-- CORRECTIF : un trigger BEFORE INSERT limite le débit par ADRESSE E-MAIL sur deux
-- fenêtres — rafale (2 min) et soutenu (1 h). Au-delà, l'insert est refusé avec un
-- message clair (le front l'affiche). Le compteur lit les lignes récentes ; comme
-- `anon` n'a PAS de policy SELECT sur ces tables, la fonction est SECURITY DEFINER
-- (elle lit hors RLS) — sinon le count vaudrait 0 et le throttle serait inopérant.
--
-- Remarque : l'e-mail est fourni par le client (falsifiable), mais le throttle relève
-- nettement le coût du flood et couvre le cas réaliste (même formulaire ré-envoyé).
-- to_regclass -> sûr si une table est absente. $fn$ / $do$ nommés. Idempotent.
-- =====================================================================

-- --- Devis (quote_requests, clé = buyer_email) --------------------------------
create or replace function public.quote_requests_antispam_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_email text := lower(trim(coalesce(new.buyer_email, '')));
  v_burst int;
  v_hour  int;
begin
  if v_email = '' then
    return new;  -- pas d'e-mail : laissé aux autres contraintes
  end if;

  v_burst := (
    select count(*) from public.quote_requests q
    where lower(trim(q.buyer_email)) = v_email
      and q.created_at > now() - interval '2 minutes'
  );
  if v_burst >= 3 then
    raise exception 'Trop de demandes envoyees en peu de temps. Merci de patienter quelques minutes avant de renvoyer une demande.';
  end if;

  v_hour := (
    select count(*) from public.quote_requests q
    where lower(trim(q.buyer_email)) = v_email
      and q.created_at > now() - interval '1 hour'
  );
  if v_hour >= 15 then
    raise exception 'Limite horaire de demandes atteinte pour cette adresse e-mail. Merci de reessayer plus tard.';
  end if;

  return new;
end
$fn$;

revoke execute on function public.quote_requests_antispam_fn() from public;

-- --- Contact (contact_messages, clé = email) ----------------------------------
create or replace function public.contact_messages_antispam_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_email text := lower(trim(coalesce(new.email, '')));
  v_burst int;
  v_hour  int;
begin
  if v_email = '' then
    return new;
  end if;

  v_burst := (
    select count(*) from public.contact_messages c
    where lower(trim(c.email)) = v_email
      and c.created_at > now() - interval '2 minutes'
  );
  if v_burst >= 3 then
    raise exception 'Trop de messages envoyes en peu de temps. Merci de patienter quelques minutes.';
  end if;

  v_hour := (
    select count(*) from public.contact_messages c
    where lower(trim(c.email)) = v_email
      and c.created_at > now() - interval '1 hour'
  );
  if v_hour >= 10 then
    raise exception 'Limite horaire de messages atteinte pour cette adresse e-mail. Merci de reessayer plus tard.';
  end if;

  return new;
end
$fn$;

revoke execute on function public.contact_messages_antispam_fn() from public;

-- --- Attache les triggers (gardé : seulement si la table existe) ---------------
do $do$
begin
  if to_regclass('public.quote_requests') is not null then
    execute 'drop trigger if exists quote_requests_antispam on public.quote_requests';
    execute 'create trigger quote_requests_antispam before insert on public.quote_requests '
         || 'for each row execute function public.quote_requests_antispam_fn()';
  end if;

  if to_regclass('public.contact_messages') is not null then
    execute 'drop trigger if exists contact_messages_antispam on public.contact_messages';
    execute 'create trigger contact_messages_antispam before insert on public.contact_messages '
         || 'for each row execute function public.contact_messages_antispam_fn()';
  end if;
end
$do$;
