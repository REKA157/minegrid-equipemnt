-- =====================================================================
-- Preuve locale teamE — CONTRE-CAS (échoue = raise exception, exit ≠ 0).
-- Ordre d'exécution attendu : prereq → backfill ×2 (idempotence) → teamE → ce fichier.
-- =====================================================================

-- Idempotence du rattachement : 2 pro_clients → EXACTEMENT 2 sociétés,
-- même après un double passage du backfill.
do $t1$
declare n int;
begin
  n := (select count(*) from public.organizations);
  if n <> 2 then raise exception 'T1 idempotence backfill : attendu 2 orgs, obtenu %', n; end if;
  n := (select count(*) from public.organization_members where role = 'owner');
  if n <> 2 then raise exception 'T1 owners : attendu 2, obtenu %', n; end if;
end $t1$;

-- Un salarié « viewer » dans la société A.
insert into public.organization_members (organization_id, user_id, role)
select m.organization_id, '00000000-0000-0000-0000-00000000000c', 'viewer'
from public.organization_members m
where m.user_id = '00000000-0000-0000-0000-00000000000a' and m.role = 'owner';

-- ---------------------------------------------------------------- ownerA
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-00000000000a', false);

do $t2$
begin
  if public.get_my_tender_workspace() is distinct from '{}'::jsonb then
    raise exception 'T2 : espace vierge attendu pour A';
  end if;
end $t2$;

do $t3$
declare v_org uuid;
begin
  v_org := public.save_my_tender_workspace('{"tenders":[{"id":"t1","title":"AO réel"}]}'::jsonb);
  if v_org is null then raise exception 'T3 : le propriétaire A aurait dû pouvoir écrire'; end if;
end $t3$;

do $t4$
begin
  if (public.get_my_tender_workspace()->'tenders'->0->>'id') is distinct from 't1' then
    raise exception 'T4 : A ne relit pas son AO t1';
  end if;
end $t4$;

-- Écriture DIRECTE interdite (défense en profondeur, l''écriture passe par la RPC).
do $t5$
begin
  begin
    insert into public.tender_workspaces (organization_id, data)
    select organization_id, '{}'::jsonb from public.organization_members limit 1;
    raise exception 'T5 : INSERT direct aurait dû être refusé (privilège révoqué)';
  exception when insufficient_privilege then null;
  end;
end $t5$;

-- ---------------------------------------------------------------- ownerB
select set_config('test.uid', '00000000-0000-0000-0000-00000000000b', false);

-- ANTI-FUITE : B ne voit PAS la ligne de la société A via RLS.
do $t6$
declare n int;
begin
  n := (select count(*) from public.tender_workspaces);
  if n <> 0 then raise exception 'T6 FUITE : B voit % ligne(s) de workspace d''autrui', n; end if;
end $t6$;

do $t7$
begin
  if public.get_my_tender_workspace() is distinct from '{}'::jsonb then
    raise exception 'T7 : B doit voir un espace vierge (pas celui de A)';
  end if;
end $t7$;

-- ---------------------------------------------------------------- viewerA
select set_config('test.uid', '00000000-0000-0000-0000-00000000000c', false);

do $t8$
begin
  if (public.get_my_tender_workspace()->'tenders'->0->>'id') is distinct from 't1' then
    raise exception 'T8 : le viewer de A doit LIRE l''espace de sa société';
  end if;
end $t8$;

do $t9$
declare v_org uuid;
begin
  v_org := public.save_my_tender_workspace('{"tenders":[]}'::jsonb);
  if v_org is not null then raise exception 'T9 : un viewer ne doit PAS pouvoir écraser l''espace'; end if;
end $t9$;

do $t10$
begin
  if (public.get_my_tender_workspace()->'tenders'->0->>'id') is distinct from 't1' then
    raise exception 'T10 : les données de A ont été altérées par le viewer';
  end if;
end $t10$;

reset role;
select 'TEAM-E : 10/10 CONTRE-CAS PASSÉS' as verdict;
