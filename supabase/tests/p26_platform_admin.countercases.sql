-- =====================================================================
-- CONTRE-CAS p26 — fondation de la console d'administration.
-- 'postgres' (superuser, auth.uid() NULL) = l'éditeur SQL / la clé de service.
-- SET ROLE authenticated + test.uid = un compte connecté sur le site.
-- Échec d'assertion -> raise exception -> ON_ERROR_STOP sort != 0.
--
-- a1 = premier administrateur (owner)   a2 = second administrateur (owner)
-- s1 = administrateur « support »       c1 = client ordinaire
-- =====================================================================

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin1@minegrid.ma'),
  ('00000000-0000-0000-0000-0000000000a2', 'admin2@minegrid.ma'),
  ('00000000-0000-0000-0000-00000000005a', 'support@minegrid.ma'),
  ('00000000-0000-0000-0000-0000000000c1', 'client@societe.ma');

-- ============ CC1 : le PREMIER administrateur se crée à la main ============
-- (auth.uid() NULL = éditeur SQL : le déclencheur anti-auto-nomination laisse passer)
insert into public.platform_admins (user_id, role, note)
values ('00000000-0000-0000-0000-0000000000a1', 'owner', 'Premier administrateur');
do $$ begin
  if not exists (select 1 from public.platform_admins
                 where user_id = '00000000-0000-0000-0000-0000000000a1' and revoked_at is null) then
    raise exception '1 ECHEC: le premier administrateur n''a pas ete cree';
  end if;
  raise notice 'OK 1: le premier administrateur se cree a la main, et seulement ainsi';
end $$;

-- ---------- CC2 : un client ordinaire n'est pas administrateur ----------
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000c1';
do $$ begin
  if public.is_platform_admin() then
    raise exception '2 ECHEC: un client ordinaire est reconnu administrateur';
  end if;
  raise notice 'OK 2: un client ordinaire n''est pas administrateur';
end $$;

-- ---------- CC3 : un client ne peut NI LIRE ni ecrire la liste des administrateurs ----------
do $$ begin
  begin
    perform 1 from public.platform_admins;
    raise exception '3 ECHEC: un client a pu LIRE la liste des administrateurs';
  exception when insufficient_privilege or sqlstate '42501' then
    raise notice 'OK 3a: lecture de la liste des administrateurs refusee';
  end;
  begin
    insert into public.platform_admins (user_id, role)
    values ('00000000-0000-0000-0000-0000000000c1', 'owner');
    raise exception '3 ECHEC: un client a pu SE NOMMER administrateur';
  exception when insufficient_privilege or sqlstate '42501' then
    raise notice 'OK 3b: auto-nomination refusee';
  end;
end $$;

-- ---------- CC4 : la fonction de liste refuse un non-administrateur ----------
do $$ begin
  begin
    perform public.list_platform_admins();
    raise exception '4 ECHEC: un client a pu lister les administrateurs via la fonction';
  exception when sqlstate '42501' then
    raise notice 'OK 4: la fonction de liste refuse un non-administrateur';
  end;
end $$;

-- ---------- CC5 : un administrateur ne peut pas se nommer LUI-MEME ----------
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  begin
    perform public.grant_platform_admin('admin1@minegrid.ma', 'owner', 'je me promeus');
    raise exception '5 ECHEC: un administrateur a pu agir sur son propre acces';
  exception when sqlstate '42501' then
    raise notice 'OK 5: un administrateur ne peut pas modifier son propre acces';
  end;
end $$;

-- ---------- CC6 : un motif ecrit est OBLIGATOIRE ----------
do $$ begin
  begin
    perform public.grant_platform_admin('admin2@minegrid.ma', 'owner', '   ');
    raise exception '6 ECHEC: un geste d''administration est passe sans motif';
  exception when sqlstate '22023' then
    raise notice 'OK 6: un motif ecrit est obligatoire';
  end;
end $$;

-- ---------- CC7 : nomination legitime, et elle laisse une trace ----------
-- Le geste est fait en tant qu'administrateur connecte ; la VERIFICATION du
-- journal se fait ensuite en superuser, car `authenticated` n'a aucun droit sur
-- la table d'audit — c'est precisement ce que CC3 et CC9 exigent.
do $$ begin
  perform public.grant_platform_admin('admin2@minegrid.ma', 'owner', 'Renfort administration');
  perform public.grant_platform_admin('support@minegrid.ma', 'support', 'Support client');
end $$;
reset role;
do $$ declare v_lignes integer; begin
  v_lignes := (select count(*) from public.platform_admin_audit where action = 'admin.grant');
  if v_lignes <> 2 then
    raise exception '7 ECHEC: % ligne(s) de journal au lieu de 2', v_lignes;
  end if;
  if not exists (
    select 1 from public.platform_admin_audit
    where action = 'admin.grant' and reason = 'Renfort administration'
      and actor_id = '00000000-0000-0000-0000-0000000000a1'
  ) then
    raise exception '7 ECHEC: le journal ne porte pas l''auteur et le motif';
  end if;
  raise notice 'OK 7: chaque nomination produit exactement une ligne de journal, signee et motivee';
end $$;
set role authenticated;

-- ---------- CC8 : un administrateur « support » ne peut pas nommer ----------
set test.uid = '00000000-0000-0000-0000-00000000005a';
do $$ begin
  if not public.is_platform_admin() then
    raise exception '8 ECHEC: le support n''est pas reconnu administrateur';
  end if;
  begin
    perform public.grant_platform_admin('client@societe.ma', 'owner', 'tentative');
    raise exception '8 ECHEC: un administrateur support a pu nommer un administrateur';
  exception when sqlstate '42501' then
    raise notice 'OK 8: seul un administrateur principal peut nommer';
  end;
end $$;

-- ---------- CC9 : le journal est INFALSIFIABLE, meme en superuser ----------
reset role;
do $$ begin
  begin
    update public.platform_admin_audit set reason = 'efface' where true;
    raise exception '9 ECHEC: le journal a pu etre MODIFIE (en superuser)';
  exception when sqlstate '42501' then
    raise notice 'OK 9a: modification du journal refusee, meme en superuser';
  end;
  begin
    delete from public.platform_admin_audit where true;
    raise exception '9 ECHEC: le journal a pu etre EFFACE (en superuser)';
  exception when sqlstate '42501' then
    raise notice 'OK 9b: suppression du journal refusee, meme en superuser';
  end;
  begin
    truncate public.platform_admin_audit;
    raise exception '9 ECHEC: le journal a pu etre VIDE (truncate, en superuser)';
  exception when sqlstate '42501' then
    raise notice 'OK 9c: vidage du journal refuse, meme en superuser';
  end;
end $$;

-- ---------- CC10 : une revocation coupe l'acces IMMEDIATEMENT ----------
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  perform public.revoke_platform_admin('00000000-0000-0000-0000-00000000005a', 'Fin de mission');
end $$;
set test.uid = '00000000-0000-0000-0000-00000000005a';
do $$ begin
  if public.is_platform_admin() then
    raise exception '10 ECHEC: un administrateur revoque est toujours reconnu';
  end if;
  begin
    perform public.list_platform_admins();
    raise exception '10 ECHEC: un administrateur revoque peut encore lister';
  exception when sqlstate '42501' then
    raise notice 'OK 10: la revocation prend effet immediatement';
  end;
end $$;

-- ---------- CC11 : on ne peut pas retirer le DERNIER administrateur ----------
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  -- il reste a1 et a2 : retirer a2 doit passer
  perform public.revoke_platform_admin('00000000-0000-0000-0000-0000000000a2', 'Depart');
  raise notice 'OK 11a: l''avant-dernier administrateur peut etre retire';
end $$;
-- a1 est desormais le SEUL actif. On reactive a2 A LA MAIN pour pouvoir tenter
-- le retrait du dernier : `test.uid` vide = editeur SQL, seul cas ou une ligne
-- peut etre posee directement (cf. CC1).
reset role;
set test.uid = '';
insert into public.platform_admins (user_id, role, note)
values ('00000000-0000-0000-0000-0000000000a2', 'owner', 'reactive pour le test')
on conflict (user_id) do update set revoked_at = null, revoked_by = null, role = 'owner';
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a2';
do $$ begin
  -- a2 retire a1 : il resterait a2, donc c'est permis.
  perform public.revoke_platform_admin('00000000-0000-0000-0000-0000000000a1', 'Test dernier admin');
  -- a2 est maintenant seul. Personne d'autre ne peut le retirer, et lui-meme
  -- ne le peut pas (CC5). La plateforme ne peut donc pas se verrouiller dehors.
  begin
    perform public.revoke_platform_admin('00000000-0000-0000-0000-0000000000a2', 'auto-retrait');
    raise exception '11 ECHEC: le dernier administrateur a pu se retirer';
  exception when sqlstate '42501' then
    raise notice 'OK 11b: le dernier administrateur ne peut pas etre retire';
  end;
end $$;

-- ---------- CC12 : une table homonyme ne trompe pas le controle d'identite ----------
-- `search_path` est verrouille a `public` dans toutes les fonctions : une table
-- `platform_admins` posee dans un autre schema place devant ne doit rien changer.
reset role;
create schema if not exists piege;
create table if not exists piege.platform_admins (user_id uuid, role text, revoked_at timestamptz);
insert into piege.platform_admins values ('00000000-0000-0000-0000-0000000000c1', 'owner', null);
grant usage on schema piege to authenticated;
grant select on piege.platform_admins to authenticated;
set role authenticated;
set search_path = piege, public;
set test.uid = '00000000-0000-0000-0000-0000000000c1';
do $$ begin
  if public.is_platform_admin() then
    raise exception '12 ECHEC: une table homonyme a fait passer un client pour administrateur';
  end if;
  raise notice 'OK 12: une fausse table homonyme ne trompe pas le controle d''identite';
end $$;
set search_path = public;

reset role;
do $$ begin raise notice 'TOUS LES CONTRE-CAS PASSES'; end $$;
