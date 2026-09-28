-- =====================================================================
-- Réattribuer les annonces (machines) sans vendeur Auth valide vers un
-- compte existant (email présent dans auth.users).
--
-- Cas couverts : seller_id / sellerid / user_id / owner_id NULL ou égaux
-- aux UUID placeholders 00000000-0000-0000-0000-000000000000 / ...000001
--
-- À personnaliser avant exécution (déjà renseigné pour le compte riqa890@gmail.com) :
--   1) Vérifiez que cet email existe dans auth.users.
--   2) Facultatif : décommentez AND m.id IN (...) pour ne traiter que certaines annonces.
--
-- Ordre conseillé : SELECT de prévisualisation, puis bloc DO $$ ... $$.
-- =====================================================================

-- --- Prévisualisation : combien de lignes seront touchées ?
select count(*) as annonces_a_reattribuer
from public.machines m
where coalesce(m.seller_id, m.sellerid, m.user_id, m.owner_id) is null
   or coalesce(m.seller_id, m.sellerid, m.user_id, m.owner_id) in (
        '00000000-0000-0000-0000-000000000000'::uuid,
        '00000000-0000-0000-0000-000000000001'::uuid
      );

-- --- Vérifier que l’email existe bien dans Auth
-- Remplacez l’email puis exécutez :
/*
select id, email, created_at
from auth.users
where lower(trim(email)) = lower(trim('riqa890@gmail.com'));
*/

do $$
declare
  v_target_email text := 'riqa890@gmail.com';
  v_uid uuid;
  v_updated int;
begin
  select u.id into v_uid
  from auth.users u
  where lower(trim(u.email)) = lower(trim(v_target_email));

  if v_uid is null then
    raise exception 'Aucun utilisateur dans auth.users pour l''email : %', v_target_email;
  end if;

  raise notice 'Réattribution vers auth.users.id = % (email %)', v_uid, v_target_email;

  update public.machines m
  set
    seller_id = v_uid,
    sellerid = v_uid,
    user_id = case
      when m.user_id is null
        or m.user_id = '00000000-0000-0000-0000-000000000000'::uuid
        or m.user_id = '00000000-0000-0000-0000-000000000001'::uuid
      then v_uid
      else m.user_id
    end,
    owner_id = case
      when m.owner_id is null
        or m.owner_id = '00000000-0000-0000-0000-000000000000'::uuid
        or m.owner_id = '00000000-0000-0000-0000-000000000001'::uuid
      then v_uid
      else m.owner_id
    end,
    updated_at = now()
  where coalesce(m.seller_id, m.sellerid, m.user_id, m.owner_id) is null
     or coalesce(m.seller_id, m.sellerid, m.user_id, m.owner_id) in (
          '00000000-0000-0000-0000-000000000000'::uuid,
          '00000000-0000-0000-0000-000000000001'::uuid
        );
    -- Filtre optionnel par IDs d’annonces :
    -- and m.id in ('uuid1'::uuid, 'uuid2'::uuid);

  get diagnostics v_updated = row_count;
  raise notice 'Lignes machines mises à jour : %', v_updated;
end $$;

-- --- Contrôle après coup : titulaire + email Auth
/*
select
  m.id,
  m.name,
  coalesce(m.seller_id, m.sellerid, m.user_id, m.owner_id) as titulaire_user_id,
  u.email as titulaire_email_auth
from public.machines m
left join auth.users u on u.id = coalesce(m.seller_id, m.sellerid, m.user_id, m.owner_id)
order by m.created_at desc
limit 50;
*/
