-- =====================================================================
-- p25 — DURCISSEMENT DE L'APPARTENANCE À UNE SOCIÉTÉ
--
-- Trois défauts découverts en préparant la console d'administration, tous
-- confirmés dans le code avant correction. Ils bloquent une ouverture
-- commerciale : le premier laisse fuiter les données entre sociétés, les deux
-- autres touchent directement l'argent.
--
-- C1 — ÉLÉVATION DE PRIVILÈGE (sécurité, critique)
--   La règle d'écriture `organization_members_insert_admin` (baseline) ne
--   vérifiait QUE `user_id = auth.uid()` : rien sur la société visée ni sur le
--   rôle demandé. N'importe quel compte connecté pouvait donc s'insérer
--   PROPRIÉTAIRE de N'IMPORTE QUELLE société dont il connaît l'identifiant.
--   Conséquences : lecture des devis / documents / appels d'offres / planning
--   de cette société (tout passe par `user_in_org`), ET héritage gratuit de son
--   abonnement (`get_effective_subscription`, teamD). Un membre retiré via
--   `remove_org_member` (p19) pouvait se remettre seul.
--   Vérifié : AUCUN écran n'écrit dans cette table (recherche dans tout `src/`) ;
--   le seul chemin légitime est `accept_invitation`, en SECURITY DEFINER, qui
--   n'est pas soumis aux règles RLS. Supprimer la règle ne casse donc rien.
--
-- C2 — SOCIÉTÉ JAMAIS CRÉÉE POUR UN NOUVEAU CLIENT (promesse non tenue)
--   La création de la société était un rattrapage unique (teamA_backfill, juillet).
--   Rien ne la crée pour un nouvel inscrit : `create_invitation` refuse avec
--   « Vous devez être administrateur d'une société pour inviter ». Un client qui
--   achète Enterprise (200 $, « Équipe : 5 utilisateurs ») ne peut inviter
--   personne.
--
-- C3 — LIMITE DE SIÈGES JAMAIS APPLIQUÉE (fuite de revenus)
--   `pro_clients.max_users` est bien renseignée par le webhook Paddle
--   (pro:1, premium:1, enterprise:5) mais n'était lue NULLE PART. Or tout membre
--   hérite de l'abonnement du propriétaire (teamD) : un seul abonné Premium à
--   20 $/mois pouvait inviter un nombre illimité de collègues, tous servis
--   gratuitement.
--
-- Idempotente. Ne modifie aucune donnée existante.
-- =====================================================================

-- ---------------------------------------------------------------------
-- C1 — fermer l'élévation de privilège
-- ---------------------------------------------------------------------

-- Plus aucune écriture directe : l'appartenance ne se gagne que par
-- `accept_invitation` (invitation nominative + email vérifié) ou par les
-- fonctions serveur ci-dessous.
drop policy if exists "organization_members_insert_admin" on public.organization_members;

-- Défense en profondeur : même si une règle permissive réapparaissait un jour,
-- le droit SQL d'écrire n'existe plus pour le public. La lecture reste ouverte,
-- bornée par `organization_members_select_self` (sa propre ligne uniquement).
revoke insert, update, delete, truncate on table public.organization_members from anon;
revoke insert, update, delete, truncate on table public.organization_members from authenticated;
revoke insert, update, delete, truncate on table public.organizations         from anon;
revoke insert, update, delete, truncate on table public.organizations         from authenticated;

-- ---------------------------------------------------------------------
-- Outils communs (lecture de données protégées -> SECURITY DEFINER)
-- ---------------------------------------------------------------------

-- Nombre de sièges payés par le propriétaire de la société.
-- Aligné sur `get_effective_subscription` : seul un abonnement 'active' et non
-- expiré compte. Sans abonnement actif -> 1 siège (le propriétaire seul).
create or replace function public.org_seat_limit(p_org uuid)
returns integer
language plpgsql
security definer
set search_path = public
stable
as $fn_seat_limit$
declare
  v_limit integer;
begin
  v_limit := (
    select max(coalesce(pc.max_users, 1))
    from public.organization_members om
    join public.pro_clients pc on pc.user_id = om.user_id
    where om.organization_id = p_org
      and om.role = 'owner'
      and pc.subscription_status = 'active'
      and (pc.subscription_end is null or pc.subscription_end > now())
  );
  return coalesce(v_limit, 1);
end
$fn_seat_limit$;

-- Sièges consommés. Les invitations en attente comptent (sinon on peut envoyer
-- 50 invitations d'un coup et dépasser la limite à l'acceptation).
create or replace function public.org_seats_used(p_org uuid, p_include_pending boolean default true)
returns integer
language plpgsql
security definer
set search_path = public
stable
as $fn_seats_used$
declare
  v_members integer;
  v_pending integer := 0;
begin
  v_members := (
    select count(*) from public.organization_members where organization_id = p_org
  );
  if p_include_pending then
    v_pending := (
      select count(*)
      from public.user_invitations
      where organization_id = p_org
        and status = 'pending'
        and (expires_at is null or expires_at > now())
    );
  end if;
  return coalesce(v_members, 0) + coalesce(v_pending, 0);
end
$fn_seats_used$;

grant execute on function public.org_seat_limit(uuid) to authenticated;
grant execute on function public.org_seats_used(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- C2 — créer la société de l'appelant si elle n'existe pas
-- ---------------------------------------------------------------------

-- Idempotente : renvoie la société existante le cas échéant. C'est désormais le
-- SEUL moyen pour un compte de devenir propriétaire d'une société — et il ne
-- peut le faire que d'une société NEUVE, créée pour lui.
create or replace function public.ensure_my_organization()
returns uuid
language plpgsql
security definer
set search_path = public
as $fn_ensure_org$
declare
  v_uid  uuid := auth.uid();
  v_org  uuid;
  v_name text;
begin
  if v_uid is null then
    raise exception 'Connexion requise.' using errcode = '28000';
  end if;

  v_org := (
    select organization_id
    from public.organization_members
    where user_id = v_uid
    order by (role = 'owner') desc
    limit 1
  );
  if v_org is not null then
    return v_org;
  end if;

  v_name := coalesce(
    nullif(trim((select pc.company_name from public.pro_clients pc where pc.user_id = v_uid limit 1)), ''),
    'Ma société'
  );

  insert into public.organizations (name) values (v_name) returning id into v_org;
  insert into public.organization_members (organization_id, user_id, role)
  values (v_org, v_uid, 'owner');

  return v_org;
end
$fn_ensure_org$;

grant execute on function public.ensure_my_organization() to authenticated;

-- Filet automatique : dès qu'un compte devient client (création de la ligne
-- pro_clients par le webhook Paddle ou par un code promo), sa société existe.
create or replace function public.pro_clients_ensure_org_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn_pc_org$
declare
  v_org  uuid;
  v_name text;
begin
  if new.user_id is null then
    return new;
  end if;
  -- Lignes de démonstration / orphelines : pas de compte -> la clé étrangère
  -- de organization_members échouerait et ferait échouer l'activation.
  if not exists (select 1 from auth.users u where u.id = new.user_id) then
    return new;
  end if;

  v_org := (
    select organization_id
    from public.organization_members
    where user_id = new.user_id
    order by (role = 'owner') desc
    limit 1
  );
  if v_org is not null then
    return new;
  end if;

  v_name := coalesce(nullif(trim(new.company_name), ''), 'Ma société');
  insert into public.organizations (name) values (v_name) returning id into v_org;
  insert into public.organization_members (organization_id, user_id, role)
  values (v_org, new.user_id, 'owner');

  return new;
end
$fn_pc_org$;

drop trigger if exists trg_pro_clients_ensure_org on public.pro_clients;
create trigger trg_pro_clients_ensure_org
after insert or update on public.pro_clients
for each row execute function public.pro_clients_ensure_org_fn();

-- ---------------------------------------------------------------------
-- C2 + C3 — inviter : créer la société au besoin, refuser au-delà des sièges
-- ---------------------------------------------------------------------

create or replace function public.create_invitation(
  p_email text,
  p_name  text,
  p_role  text
)
returns table (
  id              uuid,
  organization_id uuid,
  token           text,
  email           text,
  role            text,
  expires_at      timestamptz
)
language plpgsql
security definer
set search_path = public
as $fn_create_inv$
#variable_conflict use_column
declare
  v_uid   uuid := auth.uid();
  v_org   uuid;
  v_token text;
  v_email text := lower(trim(p_email));
  v_role  text := lower(trim(p_role));
  v_id    uuid;
  v_exp   timestamptz := now() + interval '14 days';
  v_limit integer;
  v_used  integer;
begin
  if v_uid is null then
    raise exception 'Connexion requise pour inviter.' using errcode = '28000';
  end if;
  if v_email is null or v_email = '' then
    raise exception 'Email invité manquant.' using errcode = '22023';
  end if;
  if v_role not in ('admin', 'manager', 'viewer') then
    raise exception 'Rôle invalide (admin, manager ou viewer).' using errcode = '22023';
  end if;

  -- Société où l'appelant est admin/owner/manager (priorité owner > admin > manager).
  v_org := (
    select m.organization_id
    from public.organization_members m
    where m.user_id = v_uid
      and m.role in ('owner', 'admin', 'manager')
    order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end
    limit 1
  );

  if v_org is null then
    -- Membre d'une société SANS être admin (ex. un simple lecteur) : refus,
    -- comportement d'origine inchangé. On ne lui fabrique pas une société.
    if exists (select 1 from public.organization_members m where m.user_id = v_uid) then
      raise exception 'Vous devez être administrateur d''une société pour inviter.' using errcode = '42501';
    end if;
    -- C2 : aucun rattachement du tout = nouveau client -> sa société est créée.
    v_org := public.ensure_my_organization();
  end if;

  -- C3 : limite de sièges du forfait du propriétaire.
  v_limit := public.org_seat_limit(v_org);
  v_used  := public.org_seats_used(v_org, true);
  if v_used >= v_limit then
    raise exception
      'Limite d''utilisateurs atteinte (% sur % inclus dans le forfait). Passez à un forfait supérieur pour inviter davantage de collaborateurs.',
      v_used, v_limit
      using errcode = '42501';
  end if;

  -- Déjà membre ? (email déjà rattaché à cette société) -> rien à faire.
  if exists (
    select 1 from public.organization_members om
    join auth.users au on au.id = om.user_id
    where om.organization_id = v_org and lower(au.email) = v_email
  ) then
    raise exception 'Cette personne fait déjà partie de votre société.' using errcode = '23505';
  end if;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  -- Réutiliser une invitation en attente pour le même couple (société, email),
  -- sinon en créer une. Rafraîchit le jeton et l'échéance.
  v_id := (
    select ui.id
    from public.user_invitations ui
    where ui.organization_id = v_org and lower(ui.email) = v_email and ui.status = 'pending'
    limit 1
  );

  if v_id is null then
    insert into public.user_invitations
      (organization_id, email, name, role, token, invited_by, status, expires_at)
    values
      (v_org, v_email, p_name, v_role, v_token, v_uid, 'pending', v_exp)
    returning user_invitations.id into v_id;
  else
    update public.user_invitations ui
    set token = v_token, role = v_role, name = coalesce(p_name, ui.name),
        invited_by = v_uid, expires_at = v_exp, updated_at = now()
    where ui.id = v_id;
  end if;

  return query
    select ui.id, ui.organization_id, ui.token, ui.email, ui.role, ui.expires_at
    from public.user_invitations ui where ui.id = v_id;
end;
$fn_create_inv$;

grant execute on function public.create_invitation(text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- C3 — accepter : re-vérifier les sièges au moment du rattachement
-- ---------------------------------------------------------------------
-- (Le forfait a pu être rétrogradé entre l'envoi et l'acceptation.)
-- Les invitations en attente ne sont PAS comptées ici : une invitation
-- légitimement émise ne doit pas être bloquée par les autres invitations.

create or replace function public.accept_invitation(p_token text)
returns table (organization_id uuid, organization_name text, role text)
language plpgsql
security definer
set search_path = public
as $fn_accept_inv$
#variable_conflict use_column
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_inv   public.user_invitations%rowtype;
  v_limit integer;
  v_used  integer;
begin
  if v_uid is null then
    raise exception 'Connexion requise pour accepter l''invitation.' using errcode = '28000';
  end if;

  v_email := (select lower(au.email) from auth.users au where au.id = v_uid);

  select * into v_inv
  from public.user_invitations ui
  where ui.token = p_token
  limit 1;

  if v_inv.id is null then
    raise exception 'Invitation introuvable.' using errcode = 'P0002';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'Cette invitation a déjà été utilisée ou annulée.' using errcode = '22023';
  end if;
  if v_inv.expires_at is not null and v_inv.expires_at < now() then
    update public.user_invitations set status = 'expired', updated_at = now() where id = v_inv.id;
    raise exception 'Cette invitation a expiré.' using errcode = '22023';
  end if;
  -- Le lien seul ne suffit pas : l'email connecté doit correspondre à l'invité.
  if v_email is null or lower(v_inv.email) <> v_email then
    raise exception 'Cette invitation ne correspond pas à l''email de votre compte.' using errcode = '42501';
  end if;

  -- C3 : la société a-t-elle encore un siège libre ? (déjà membre = pas de siège
  -- supplémentaire consommé, on laisse passer la mise à jour de rôle.)
  if not exists (
    select 1 from public.organization_members
    where organization_id = v_inv.organization_id and user_id = v_uid
  ) then
    v_limit := public.org_seat_limit(v_inv.organization_id);
    v_used  := public.org_seats_used(v_inv.organization_id, false);
    if v_used >= v_limit then
      raise exception
        'Cette société a atteint la limite d''utilisateurs de son forfait (% sur %). Demandez à son administrateur de faire évoluer l''abonnement.',
        v_used, v_limit
        using errcode = '42501';
    end if;
  end if;

  -- Rattachement (idempotent : si déjà membre, on met à jour le rôle).
  insert into public.organization_members (organization_id, user_id, role)
  values (v_inv.organization_id, v_uid, v_inv.role)
  on conflict (organization_id, user_id) do update set role = excluded.role;

  update public.user_invitations
  set status = 'accepted', accepted_at = now(), accepted_by = v_uid, updated_at = now()
  where id = v_inv.id;

  return query
    select o.id, o.name, v_inv.role
    from public.organizations o where o.id = v_inv.organization_id;
end;
$fn_accept_inv$;

grant execute on function public.accept_invitation(text) to authenticated;
