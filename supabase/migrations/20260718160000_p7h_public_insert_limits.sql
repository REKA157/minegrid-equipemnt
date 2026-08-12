-- ============================================================================
-- P7h - Anti-abus des inserts publics restants (MG-M09)
-- ============================================================================
-- CONSTAT
--   P23 a couvert `quote_requests` et `contact_messages` par un throttle sur
--   l'adresse e-mail. `machine_views` est reste SANS AUCUNE limite : la policy
--   `anon can insert machine views` accepte tout.
--
--   Deux abus concrets, non hypothetiques :
--     1. Gonflage de compteur — un vendeur (ou un script) inflate les vues de sa
--        propre annonce. Ces compteurs alimentent le classement et les widgets
--        d'engagement : la valeur affichee aux acheteurs devient mensongere.
--     2. Gonflage de table — insertion massive, sans plafond, sur une table
--        indexee. Cout de stockage et degradation des agregats.
--
--   Limite reconnue de P23 : la cle de throttle est une adresse e-mail fournie
--   par le client, donc falsifiable en la faisant varier. Le present correctif
--   ajoute un plafond par MACHINE, independant de toute donnee declarative,
--   qui borne le degat meme quand l'identite est forgee.
--
-- CE QUE CE CORRECTIF NE FAIT PAS
--   Il n'y a pas d'identite fiable cote `anon` en base : `ip_address` est
--   renseignee par l'appelant et reste falsifiable. Un throttle applicatif au
--   bord (WAF, rate limit edge, CAPTCHA) reste necessaire — inscrit dans
--   BLOCKERS. Ce correctif borne le degat, il ne l'elimine pas.
-- ============================================================================

create or replace function public.machine_views_antispam_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_recent int;
  v_machine_burst int;
begin
  -- --- Niveau 1 : deduplication par observateur -----------------------------
  -- Un meme visiteur identifie (compte connecte ou adresse IP transmise) ne
  -- doit pas generer un flot de vues sur la meme annonce. Fenetre courte : un
  -- rechargement de page legitime reste compte, un script ne l'est plus.
  if new.viewer_id is not null then
    select count(*) into v_recent
      from public.machine_views mv
     where mv.machine_id = new.machine_id
       and mv.viewer_id = new.viewer_id
       and mv.created_at > now() - interval '5 minutes';
    if v_recent >= 5 then
      -- Silencieux : une vue n'est pas une action metier, la refuser bruyamment
      -- casserait la navigation. On ignore l'insert.
      return null;
    end if;

  elsif new.ip_address is not null and length(trim(new.ip_address)) > 0 then
    select count(*) into v_recent
      from public.machine_views mv
     where mv.machine_id = new.machine_id
       and mv.ip_address = new.ip_address
       and mv.created_at > now() - interval '5 minutes';
    if v_recent >= 10 then
      return null;
    end if;
  end if;

  -- --- Niveau 2 : plafond par MACHINE ---------------------------------------
  -- Independant de toute donnee fournie par le client : meme en faisant varier
  -- viewer_id et ip_address, le compteur d'une annonce ne peut pas exploser.
  -- Le seuil est large a dessein — une annonce populaire doit rester comptee —
  -- mais il borne l'inflation artificielle.
  select count(*) into v_machine_burst
    from public.machine_views mv
   where mv.machine_id = new.machine_id
     and mv.created_at > now() - interval '1 minute';
  if v_machine_burst >= 120 then
    return null;
  end if;

  return new;
end
$fn$;

revoke execute on function public.machine_views_antispam_fn() from public;

drop trigger if exists trg_machine_views_antispam on public.machine_views;
create trigger trg_machine_views_antispam
  before insert on public.machine_views
  for each row execute function public.machine_views_antispam_fn();

-- Index de support : sans lui, chaque insert declenche un scan sequentiel et le
-- correctif anti-DoS devient lui-meme un vecteur de charge.
create index if not exists machine_views_machine_viewer_created_idx
  on public.machine_views(machine_id, viewer_id, created_at desc);

create index if not exists machine_views_machine_ip_created_idx
  on public.machine_views(machine_id, ip_address, created_at desc);

comment on function public.machine_views_antispam_fn() is
  'Anti-abus machine_views (MG-M09) : dedup par observateur + plafond par machine. Ignore silencieusement les vues excedentaires.';
