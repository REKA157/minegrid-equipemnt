-- =====================================================================
-- CONTRE-CAS : finance_applications, scoring verrouillé (P9). Après prereq+migration.
-- AVANT : A pouvait écrire score/partner_id. APRÈS : seulement les colonnes client.
-- A=..a1 (demandeur), B=..b1 (tiers), dossier FA=..fa (submitted), partenaire P=..f1.
-- =====================================================================

-- POSITIF 1 : A modifie une colonne CLIENT (amount) de son dossier -> OK.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ declare v numeric; begin
  update public.finance_applications set amount = 6000 where id = '0fa00000-0000-0000-0000-0000000000fa';
  select amount into v from public.finance_applications where id = '0fa00000-0000-0000-0000-0000000000fa';
  if v <> 6000 then raise exception 'CC1 ECHEC: A ne peut pas modifier amount (v=%)', v; end if;
  raise notice 'OK CC1: A modifie une colonne client (amount)';
end $$;
reset role;

-- CONTRE-CAS 2 (LE P1) : A ne peut PLUS s'auto-attribuer un score.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  begin
    update public.finance_applications set score = 100 where id = '0fa00000-0000-0000-0000-0000000000fa';
    raise exception 'CC2 ECHEC: A a pu ecrire score (auto-scoring non bloque)';
  exception when insufficient_privilege then
    raise notice 'OK CC2: A ne peut plus ecrire score (privilege colonne retire)';
  when others then
    if sqlerrm like '%ECHEC%' then raise; end if;
    raise notice 'OK CC2: ecriture score refusee (%)', sqlerrm;
  end;
end $$;
reset role;
do $$ declare v int; begin
  select score into v from public.finance_applications where id = '0fa00000-0000-0000-0000-0000000000fa';
  if v is not null then raise exception 'CC2 FUITE: score a ete altere (v=%)', v; end if;
end $$;

-- CONTRE-CAS 3 : A ne peut PLUS choisir son partner_id.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  begin
    update public.finance_applications set partner_id = '0f000000-0000-0000-0000-0000000000f1'
      where id = '0fa00000-0000-0000-0000-0000000000fa';
    raise exception 'CC3 ECHEC: A a pu choisir partner_id';
  exception when insufficient_privilege then
    raise notice 'OK CC3: A ne peut plus choisir partner_id';
  when others then
    if sqlerrm like '%ECHEC%' then raise; end if;
    raise notice 'OK CC3: ecriture partner_id refusee (%)', sqlerrm;
  end;
end $$;
reset role;

-- CONTRE-CAS 4 : une écriture MIXTE (amount + score) échoue en bloc (atomique) et
-- ne modifie donc PAS amount.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  begin
    update public.finance_applications set amount = 9999, score = 50
      where id = '0fa00000-0000-0000-0000-0000000000fa';
    raise exception 'CC4 ECHEC: update mixte avec score accepte';
  exception when insufficient_privilege then
    raise notice 'OK CC4: update mixte (amount+score) rejete en bloc';
  when others then
    if sqlerrm like '%ECHEC%' then raise; end if;
    raise notice 'OK CC4: update mixte refuse (%)', sqlerrm;
  end;
end $$;
reset role;
do $$ declare v numeric; begin
  select amount into v from public.finance_applications where id = '0fa00000-0000-0000-0000-0000000000fa';
  if v <> 6000 then raise exception 'CC4 FUITE: amount modifie par un update rejete (v=%)', v; end if;
end $$;

-- POSITIF 5 : A garde le droit de faire évoluer le status client (submitted -> draft).
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ declare v text; begin
  update public.finance_applications set status = 'draft' where id = '0fa00000-0000-0000-0000-0000000000fa';
  select status into v from public.finance_applications where id = '0fa00000-0000-0000-0000-0000000000fa';
  if v <> 'draft' then raise exception 'CC5 ECHEC: A ne peut pas changer le status client (v=%)', v; end if;
  raise notice 'OK CC5: A change le status client (submitted->draft)';
end $$;
reset role;

-- CONTRE-CAS 6 : B (tiers) ne peut pas toucher le dossier de A (RLS ligne).
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000b1';
do $$ declare n int; begin
  update public.finance_applications set amount = 1 where id = '0fa00000-0000-0000-0000-0000000000fa';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CC6 FUITE: B a modifie % dossier(s) de A', n; end if;
  raise notice 'OK CC6: B ne peut pas modifier le dossier de A (RLS)';
end $$;
reset role;

do $$ begin raise notice '===== TOUS LES CONTRE-CAS PASSES ====='; end $$;
