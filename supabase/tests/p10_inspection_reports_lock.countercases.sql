-- =====================================================================
-- CONTRE-CAS : inspection_reports verrouillée (P10). Après prereq + migration.
-- AVANT : A (vendeur, partie du dossier) pouvait écrire le rapport. APRÈS : lecture
-- seule côté client ; écriture = serveur uniquement.
-- A=..a1 (vendeur/partie), M=..000d (mécanicien), X=..f1 (tiers), rapport R=..000e.
-- =====================================================================

-- CONTRE-CAS 1 (LA FRAUDE) : A (vendeur) ne peut PLUS insérer un rapport favorable.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  begin
    insert into public.inspection_reports (transaction_case_id, mechanic_id, condition_score, summary)
    values ('0c000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000a1', 100, 'Parfait (forgé)');
    raise exception 'CC1 ECHEC: le vendeur a pu inserer un rapport (write non revoque)';
  exception when insufficient_privilege then
    raise notice 'OK CC1: le vendeur ne peut plus inserer de rapport';
  when others then
    if sqlerrm like '%ECHEC%' then raise; end if;
    raise notice 'OK CC1: insertion de rapport refusee (%)', sqlerrm;
  end;
end $$;
reset role;

-- CONTRE-CAS 2 (LA FRAUDE) : A ne peut PLUS gonfler le score d'un rapport existant.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ declare n int; begin
  begin
    update public.inspection_reports set condition_score = 100, summary = 'Parfait (forgé)'
      where id = '0e000000-0000-0000-0000-00000000000e';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'CC2 FUITE: le vendeur a modifie % rapport(s)', n; end if;
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK CC2: le vendeur ne peut plus modifier un rapport';
end $$;
reset role;
do $$ declare v int; begin
  select condition_score into v from public.inspection_reports where id = '0e000000-0000-0000-0000-00000000000e';
  if v <> 60 then raise exception 'CC2 FUITE: le score du rapport a ete altere (v=%)', v; end if;
end $$;

-- CONTRE-CAS 3 : même le mécanicien ne peut plus écrire via le client (écriture serveur only).
set role authenticated;
set test.uid = '00000000-0000-0000-0000-00000000000d';
do $$ declare n int; begin
  begin
    update public.inspection_reports set condition_score = 90 where id = '0e000000-0000-0000-0000-00000000000e';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'CC3 FUITE: le mecanicien a modifie % rapport(s) via client', n; end if;
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK CC3: ecriture rapport 100%% serveur (client bloque, meme mecanicien)';
end $$;
reset role;

-- POSITIF 4 : la LECTURE reste possible pour une partie du dossier.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ declare n int; begin
  select count(*) into n from public.inspection_reports where id = '0e000000-0000-0000-0000-00000000000e';
  if n <> 1 then raise exception 'CC4 ECHEC: une partie du dossier devrait lire le rapport (n=%)', n; end if;
  raise notice 'OK CC4: une partie du dossier lit le rapport';
end $$;
reset role;

-- CONTRE-CAS 5 : anon n'a AUCUN privilège d'écriture.
do $$ begin
  if has_table_privilege('anon', 'public.inspection_reports', 'INSERT')
     or has_table_privilege('authenticated', 'public.inspection_reports', 'INSERT')
     or has_table_privilege('authenticated', 'public.inspection_reports', 'UPDATE') then
    raise exception 'CC5 FUITE: un privilege d''ecriture subsiste sur inspection_reports';
  end if;
  raise notice 'OK CC5: aucun privilege d''ecriture client sur inspection_reports';
end $$;

do $$ begin raise notice '===== TOUS LES CONTRE-CAS PASSES ====='; end $$;
