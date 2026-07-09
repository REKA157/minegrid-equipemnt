-- =====================================================================
-- CONTRE-CAS : sécurité de la connexion IA (set/get/clear_org_ai_key).
-- 'postgres' sème ; SET ROLE authenticated + test.uid incarne un client.
--
-- org A : a1 owner / a2 admin / a3 viewer   ·   org B : b1 owner   ·   x = non-membre
-- =====================================================================

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000a3'),
  ('00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000ff');

insert into public.organizations (id, name) values
  ('0a000000-0000-0000-0000-000000000001', 'Société A'),
  ('0b000000-0000-0000-0000-000000000002', 'Société B');

insert into public.organization_members (organization_id, user_id, role) values
  ('0a000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'owner'),
  ('0a000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', 'admin'),
  ('0a000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a3', 'viewer'),
  ('0b000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1', 'owner');

-- NB : on NE redonne PAS de droits à `authenticated` sur la table : la migration
-- les a révoqués et la vraie base ne les remet pas -> la lecture directe de la
-- clé doit être refusée (cf. CC6). Toutes les opérations passent par les RPC.

-- ============ CC1 : un OWNER connecte une clé pour SA société ============
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ declare r record; begin
  select * into r from public.set_org_ai_key('openai', 'sk-secret-XYZ1234', 'gpt-4o', null);
  if r.organization_id <> '0a000000-0000-0000-0000-000000000001' then
    raise exception '1 ECHEC: mauvaise societe (%)', r.organization_id; end if;
  if r.provider <> 'openai' then raise exception '1 ECHEC: provider (%)', r.provider; end if;
  raise notice 'OK 1: un owner connecte une cle IA pour sa societe';
end $$;

-- ---------- POSITIF : le statut est MASQUÉ (4 derniers caractères, jamais la clé) ----------
do $$ declare r record; begin
  select * into r from public.get_org_ai_status();
  if not r.configured then raise exception '2 ECHEC: non configure apres set'; end if;
  if r.provider <> 'openai' then raise exception '2 ECHEC: provider status (%)', r.provider; end if;
  if r.key_last4 <> '1234' then raise exception '2 ECHEC: last4 attendu 1234 (%)', r.key_last4; end if;
  if r.key_last4 ~ 'sk-secret' then raise exception '2 FUITE: la cle complete est exposee'; end if;
  raise notice 'OK 2: statut masque (last4=1234), cle complete jamais exposee';
end $$;

-- ---------- CC2 : un ADMIN peut mettre à jour ----------
set test.uid = '00000000-0000-0000-0000-0000000000a2';
do $$ declare r record; begin
  select * into r from public.set_org_ai_key('anthropic', 'sk-ant-AAAA9999', 'claude-sonnet-5', null);
  if r.provider <> 'anthropic' then raise exception '3 ECHEC: admin ne peut pas mettre a jour'; end if;
  raise notice 'OK 3: un admin met a jour la connexion IA';
end $$;

-- ---------- CC3 : un VIEWER ne peut PAS connecter ----------
set test.uid = '00000000-0000-0000-0000-0000000000a3';
do $$ begin
  begin
    perform public.set_org_ai_key('openai', 'sk-hack-0000', null, null);
    raise exception '4 ECHEC: un viewer a pu connecter l IA';
  exception when sqlstate '42501' then
    raise notice 'OK 4: un viewer ne peut pas connecter l IA';
  end;
end $$;

-- ---------- POSITIF : un membre (viewer) voit le STATUT (masqué) ----------
do $$ declare r record; begin
  select * into r from public.get_org_ai_status();
  if not r.configured then raise exception '5 ECHEC: le membre ne voit pas le statut'; end if;
  if r.provider <> 'anthropic' then raise exception '5 ECHEC: statut incorrect (%)', r.provider; end if;
  raise notice 'OK 5: un membre voit le statut (masque) mais ne connecte pas';
end $$;
reset role;

-- ============ CC4 : la clé complète n'est JAMAIS lisible directement ============
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  begin
    perform api_key from public.organization_ai_credentials limit 1;
    raise exception '6 ECHEC: lecture directe de la table credentials autorisee';
  exception when insufficient_privilege then
    raise notice 'OK 6: lecture directe de la cle refusee (RLS + revoke)';
  end;
end $$;
reset role;

-- ============ CC5 : isolation inter-société ============
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000b1';   -- owner B (aucune cle)
do $$ declare n int; begin
  select count(*) into n from public.get_org_ai_status();
  if n <> 0 then raise exception '7 FUITE: la societe B voit une connexion IA (celle de A ?)'; end if;
  raise notice 'OK 7: la societe B ne voit pas la connexion de A';
end $$;
reset role;

-- ============ CC6 : un NON-MEMBRE ne voit rien et ne peut pas connecter ============
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000ff';
do $$ declare n int; begin
  select count(*) into n from public.get_org_ai_status();
  if n <> 0 then raise exception '8 ECHEC: un non-membre voit un statut'; end if;
  begin
    perform public.set_org_ai_key('openai', 'sk-nope-1234', null, null);
    raise exception '8 ECHEC: un non-membre a pu connecter l IA';
  exception when sqlstate '42501' then
    raise notice 'OK 8: un non-membre ne voit rien et ne peut pas connecter';
  end;
end $$;
reset role;

-- ============ CC7 : déconnexion réservée aux admins ============
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a3';   -- viewer
do $$ begin
  begin
    perform public.clear_org_ai_key();
    raise exception '9 ECHEC: un viewer a pu deconnecter l IA';
  exception when sqlstate '42501' then
    raise notice 'OK 9: un viewer ne peut pas deconnecter';
  end;
end $$;
set test.uid = '00000000-0000-0000-0000-0000000000a1';   -- owner
do $$ declare n int; begin
  perform public.clear_org_ai_key();
  select count(*) into n from public.get_org_ai_status();
  if n <> 0 then raise exception '9b ECHEC: la connexion existe encore apres deconnexion'; end if;
  raise notice 'OK 9b: un admin deconnecte l IA (statut vide ensuite)';
end $$;
reset role;

-- ============ CC8 : search_path verrouillé sur les 3 fonctions ============
do $$ begin
  perform 1 from pg_proc p
   where p.proname in ('set_org_ai_key', 'get_org_ai_status', 'clear_org_ai_key')
     and (p.proconfig is null or not (p.proconfig @> array['search_path=public']));
  if found then raise exception '10 ECHEC: une fonction IA sans search_path=public'; end if;
  raise notice 'OK 10: search_path=public verrouille sur les fonctions IA';
end $$;

do $$ begin raise notice '===== TOUS LES CONTRE-CAS PASSES ====='; end $$;
