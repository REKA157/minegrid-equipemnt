-- Contre-cas P19 — comportement des RPC admin après réécriture (sans SELECT ... INTO).

-- (1) L'admin U2 change le rôle de U3 (viewer -> manager) => ok + appliqué
do $$ declare r jsonb; v text; begin
  set local role authenticated; set local test.uid = '22222222-2222-2222-2222-222222222222';
  r := public.set_org_member_role('33333333-3333-3333-3333-333333333333', 'manager');
  if (r->>'ok') <> 'true' then raise exception '(1) ECHEC: admin refuse (%)', r; end if;
  v := (select role from public.organization_members where user_id = '33333333-3333-3333-3333-333333333333');
  if v <> 'manager' then raise exception '(1) ECHEC: role non applique (%)', v; end if;
  raise notice '(1) OK admin change U3 -> manager';
end $$;

-- (2) Un non-admin (U3) ne peut pas retirer un autre membre => refusé
do $$ declare r jsonb; begin
  set local role authenticated; set local test.uid = '33333333-3333-3333-3333-333333333333';
  r := public.remove_org_member('22222222-2222-2222-2222-222222222222');
  if (r->>'ok') <> 'false' then raise exception '(2) ECHEC: non-admin a pu retirer'; end if;
  raise notice '(2) OK non-admin refuse';
end $$;

-- (3) Le PROPRIÉTAIRE est protégé : l'admin U2 ne peut pas le retirer
do $$ declare r jsonb; begin
  set local role authenticated; set local test.uid = '22222222-2222-2222-2222-222222222222';
  r := public.remove_org_member('11111111-1111-1111-1111-111111111111');
  if (r->>'ok') <> 'false' then raise exception '(3) ECHEC: owner retire'; end if;
  raise notice '(3) OK owner protege (retrait)';
end $$;

-- (4) Owner protégé au changement de rôle
do $$ declare r jsonb; begin
  set local role authenticated; set local test.uid = '22222222-2222-2222-2222-222222222222';
  r := public.set_org_member_role('11111111-1111-1111-1111-111111111111', 'viewer');
  if (r->>'ok') <> 'false' then raise exception '(4) ECHEC: role owner change'; end if;
  raise notice '(4) OK owner protege (role)';
end $$;

-- (5) Rôle invalide refusé
do $$ declare r jsonb; begin
  set local role authenticated; set local test.uid = '22222222-2222-2222-2222-222222222222';
  r := public.set_org_member_role('33333333-3333-3333-3333-333333333333', 'supergod');
  if (r->>'ok') <> 'false' then raise exception '(5) ECHEC: role invalide accepte'; end if;
  raise notice '(5) OK role invalide refuse';
end $$;

-- (6) L'admin retire effectivement un membre (U3) => ligne supprimée
do $$ declare r jsonb; n int; begin
  set local role authenticated; set local test.uid = '22222222-2222-2222-2222-222222222222';
  r := public.remove_org_member('33333333-3333-3333-3333-333333333333');
  if (r->>'ok') <> 'true' then raise exception '(6) ECHEC: retrait admin refuse (%)', r; end if;
  reset role;
  n := (select count(*) from public.organization_members where user_id = '33333333-3333-3333-3333-333333333333');
  if n <> 0 then raise exception '(6) ECHEC: membre non retire (%)', n; end if;
  raise notice '(6) OK admin retire U3 (acces coupe)';
end $$;
