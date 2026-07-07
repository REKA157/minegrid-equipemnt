-- =====================================================================
-- CONTRE-CAS de robustesse P7 (à charger après rls_prereq + la migration).
-- 'postgres' (superuser) = service_role ; SET ROLE authenticated = client.
-- Échec d'une assertion => ON_ERROR_STOP fait sortir en code != 0.
-- =====================================================================
-- Données de base (service_role).
insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111');
insert into public.trust_profiles (id, user_id, created_at, updated_at, trust_score, trust_tier)
values ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111',
        now() - interval '200 days', now() - interval '200 days', 0, 'unverified');

-- ---------- CONTRE-CAS 1 : un client authenticated ne peut PAS approuver ----------
set role authenticated;
set test.uid = '11111111-1111-1111-1111-111111111111';

-- 1a : insérer directement 'approved' -> doit être bloqué par le WITH CHECK.
do $$ declare ok boolean := false; begin
  begin
    insert into public.verifications (trust_profile_id, kind, status)
    values ('22222222-2222-2222-2222-222222222222','identity','approved');
  exception when others then ok := true; end;
  if not ok then raise exception '1a ECHEC: authenticated a insere une verif approved'; end if;
  raise notice 'OK 1a: insertion "approved" bloquee par RLS (with check status=pending)';
end $$;

-- 1b : insérer 'pending' (autorisé) puis tenter UPDATE->approved (aucune policy update).
insert into public.verifications (trust_profile_id, kind, status)
values ('22222222-2222-2222-2222-222222222222','identity','pending');
update public.verifications set status='approved'
 where trust_profile_id='22222222-2222-2222-2222-222222222222' and kind='identity';
do $$ declare s text; begin
  select status into s from public.verifications
   where trust_profile_id='22222222-2222-2222-2222-222222222222' and kind='identity';
  if s <> 'pending' then raise exception '1b ECHEC: authenticated a pu passer a approved (status=%)', s; end if;
  raise notice 'OK 1b: UPDATE->approved par authenticated sans effet (reste pending)';
end $$;
reset role;

-- ---------- CONTRE-CAS 2 : une verif pending ne change JAMAIS le score ----------
do $$ declare sc int; begin
  select trust_score into sc from public.trust_profiles where id='22222222-2222-2222-2222-222222222222';
  if sc <> 0 then raise exception '2 ECHEC: une verif pending a change le score (%)', sc; end if;
  raise notice 'OK 2: verif pending -> score inchange (0)';
end $$;

-- ---------- CONTRE-CAS 3 : une verif approved AUGMENTE le score ----------
update public.verifications set status='approved'
 where trust_profile_id='22222222-2222-2222-2222-222222222222' and kind='identity';  -- fires trigger
insert into public.verifications (trust_profile_id, kind, status)
values ('22222222-2222-2222-2222-222222222222','company_registration','approved');    -- fires trigger
do $$ declare sc int; t text; begin
  select trust_score, trust_tier into sc,t from public.trust_profiles where id='22222222-2222-2222-2222-222222222222';
  if sc <= 0 then raise exception '3 ECHEC: approbation n augmente pas le score (%)', sc; end if;
  raise notice 'OK 3: approbation -> score=% tier=% (attendu 35/basic)', sc, t;
end $$;

-- ---------- CONTRE-CAS 4 : approved -> rejected fait REDESCENDRE le score ----------
update public.verifications set status='rejected'
 where trust_profile_id='22222222-2222-2222-2222-222222222222' and kind='identity';   -- fires trigger
do $$ declare sc int; t text; v boolean; begin
  select trust_score, trust_tier, verified_at is not null into sc,t,v
    from public.trust_profiles where id='22222222-2222-2222-2222-222222222222';
  if sc >= 35 then raise exception '4 ECHEC: le rejet ne fait pas redescendre (%)', sc; end if;
  if v then raise exception '4 ECHEC: verified_at devrait etre nul sans identite approuvee'; end if;
  raise notice 'OK 4: approved->rejected -> score redescend a % tier=% verified=% (attendu 20/basic/f)', sc,t,v;
end $$;

-- ---------- CONTRE-CAS 5 : DELETE ----------
-- 5a : le client authenticated ne peut PAS supprimer (aucune policy delete).
set role authenticated;
set test.uid = '11111111-1111-1111-1111-111111111111';
delete from public.verifications
 where trust_profile_id='22222222-2222-2222-2222-222222222222' and kind='company_registration';
do $$ declare n int; begin
  select count(*) into n from public.verifications
   where trust_profile_id='22222222-2222-2222-2222-222222222222' and kind='company_registration';
  if n <> 1 then raise exception '5a ECHEC: authenticated a pu supprimer une verif (n=%)', n; end if;
  raise notice 'OK 5a: DELETE client bloque par RLS (la verif survit)';
end $$;
reset role;

-- 5b : LIMITE CONNUE ET DOCUMENTEE — le trigger ne couvre pas DELETE.
--      Un DELETE service_role d une verif approved NE recalcule PAS (score stale).
delete from public.verifications
 where trust_profile_id='22222222-2222-2222-2222-222222222222' and kind='company_registration';
do $$ declare sc int; begin
  select trust_score into sc from public.trust_profiles where id='22222222-2222-2222-2222-222222222222';
  if sc <> 20 then
    raise exception '5b INATTENDU: score=% (le comportement DELETE a change, doc a mettre a jour)', sc;
  end if;
  raise notice 'INFO 5b (LIMITE DOCUMENTEE): apres DELETE service_role, score reste % (NON recalcule ; correct=5). Le trigger ne gere QUE INSERT/UPDATE OF status.', sc;
end $$;

-- ---------- CONTRE-CAS 6 : recompute sur profil inexistant ----------
do $$ begin
  perform public.recompute_trust_profile('99999999-9999-9999-9999-999999999999');
  raise notice 'OK 6: recompute(profil inexistant) -> aucun echec (return silencieux)';
exception when others then
  raise exception '6 ECHEC: recompute a leve une exception sur profil inexistant: %', sqlerrm;
end $$;

-- ---------- CONTRE-CAS 7 : search_path verrouille sur les fonctions SECURITY DEFINER ----------
do $$ declare c1 text[]; c2 text[]; begin
  select proconfig into c1 from pg_proc where proname='recompute_trust_profile';
  select proconfig into c2 from pg_proc where proname='trg_verification_recompute';
  if c1 is null or not (c1 @> array['search_path=public']) then raise exception '7 ECHEC: recompute_trust_profile search_path=%', c1; end if;
  if c2 is null or not (c2 @> array['search_path=public']) then raise exception '7 ECHEC: trg_verification_recompute search_path=%', c2; end if;
  raise notice 'OK 7: search_path=public verrouille sur les 2 fonctions SECURITY DEFINER';
end $$;

do $$ begin raise notice '===== TOUS LES CONTRE-CAS PASSES ====='; end $$;
