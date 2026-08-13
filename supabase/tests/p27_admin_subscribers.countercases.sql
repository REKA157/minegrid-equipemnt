-- =====================================================================
-- CONTRE-CAS p27 — écran « Abonnés » et gestes de dépannage.
-- a1 = administrateur ; c1 = client actif Enterprise facturé par Paddle ;
-- c2 = client dont l'abonnement est EXPIRÉ mais toujours marqué 'active' ;
-- c3 = client ordinaire (non administrateur), sert d'intrus.
-- =====================================================================

insert into auth.users (id, email, last_sign_in_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@minegrid.ma',  now()),
  ('00000000-0000-0000-0000-0000000000c1', 'client1@societe.ma', now() - interval '2 days'),
  ('00000000-0000-0000-0000-0000000000c2', 'client2@societe.ma', now() - interval '90 days'),
  ('00000000-0000-0000-0000-0000000000c3', 'client3@societe.ma', now());

insert into public.pro_clients
  (user_id, company_name, subscription_type, subscription_status, subscription_end, max_users, payment_method, paddle_subscription_id)
values
  ('00000000-0000-0000-0000-0000000000c1', 'Societe Un',   'enterprise', 'active', now() + interval '20 days', 5, 'paddle', 'sub_123'),
  -- Le piege : statut 'active' alors que l'echeance est passee depuis 10 jours.
  ('00000000-0000-0000-0000-0000000000c2', 'Societe Deux', 'pro',        'active', now() - interval '10 days', 1, null, null),
  ('00000000-0000-0000-0000-0000000000c3', 'Societe Trois','premium',    'active', now() + interval '3 days',  1, 'paddle', 'sub_789');

insert into public.machines (sellerid) values
  ('00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000c1');

-- Premier administrateur (auth.uid() NULL = editeur SQL).
insert into public.platform_admins (user_id, role, note)
values ('00000000-0000-0000-0000-0000000000a1', 'owner', 'Administrateur de test');

-- ============ CC1 : un client ordinaire n'accede a RIEN ============
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000c3';
do $$ begin
  begin
    perform public.admin_list_subscribers(null, null, 10);
    raise exception '1 ECHEC: un client a pu lister les abonnes';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.admin_subscriber_stats();
    raise exception '1 ECHEC: un client a pu lire les compteurs';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.admin_extend_subscription('00000000-0000-0000-0000-0000000000c1', 30, 'cadeau');
    raise exception '1 ECHEC: un client a pu prolonger un abonnement';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.admin_recent_actions(10);
    raise exception '1 ECHEC: un client a pu lire le journal';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'OK 1: un client ordinaire n''accede ni aux abonnes, ni aux compteurs, ni aux gestes, ni au journal';
end $$;

-- ---------- CC2 : l'abonnement EXPIRE n'est pas compte comme actif ----------
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ declare r record; begin
  select * into r from public.admin_list_subscribers(null, null, 50)
  where user_id = '00000000-0000-0000-0000-0000000000c2';
  if r.reellement_actif then
    raise exception '2 ECHEC: un abonnement expire est presente comme actif (statut brut = %)', r.subscription_status;
  end if;
  if r.subscription_status <> 'active' then
    raise exception '2 ECHEC: le statut BRUT devrait rester active (c est justement le piege)';
  end if;
  raise notice 'OK 2: statut brut « active » mais reellement_actif = faux — le piege des expires est desamorce';
end $$;

-- ---------- CC3 : les compteurs comptent les VRAIS actifs ----------
do $$ declare s record; begin
  select * into s from public.admin_subscriber_stats();
  -- c1 (20 j) et c3 (3 j) sont actifs ; c2 est expire.
  if s.actifs <> 2 then
    raise exception '3 ECHEC: % actifs annonces au lieu de 2 (l expire est compte)', s.actifs;
  end if;
  if s.expirent_7j <> 1 then
    raise exception '3 ECHEC: % abonnement(s) expirant sous 7 jours au lieu de 1', s.expirent_7j;
  end if;
  raise notice 'OK 3: les compteurs croisent statut ET date d echeance';
end $$;

-- ---------- CC4 : la recherche et les filtres ----------
do $$ declare n integer; begin
  n := (select count(*) from public.admin_list_subscribers('societe deux', null, 50));
  if n <> 1 then raise exception '4 ECHEC: recherche par societe -> % resultats au lieu de 1', n; end if;
  n := (select count(*) from public.admin_list_subscribers('client1@', null, 50));
  if n <> 1 then raise exception '4 ECHEC: recherche par email -> % resultats au lieu de 1', n; end if;
  n := (select count(*) from public.admin_list_subscribers(null, 'inactifs', 50));
  if n <> 1 then raise exception '4 ECHEC: filtre inactifs -> % resultats au lieu de 1', n; end if;
  raise notice 'OK 4: recherche par email/societe et filtre des inactifs';
end $$;

-- ---------- CC5 : prolonger un abonnement DEJA EXPIRE part d'aujourd'hui ----------
do $$ declare v jsonb; v_fin timestamptz; begin
  v := public.admin_extend_subscription('00000000-0000-0000-0000-0000000000c2', 30, 'Geste commercial');
  v_fin := (v->>'nouvelle_echeance')::timestamptz;
  if v_fin < now() then
    raise exception '5 ECHEC: l echeance reste dans le passe (%) — prolonger depuis l ancienne date', v_fin;
  end if;
  if v_fin > now() + interval '31 days' then
    raise exception '5 ECHEC: echeance trop lointaine (%)', v_fin;
  end if;
  if (v->>'facture_par_paddle')::boolean then
    raise exception '5 ECHEC: c2 n est pas facture par Paddle';
  end if;
  raise notice 'OK 5: prolonger un abonnement expire repart d aujourd hui, pas de l ancienne echeance';
end $$;

-- ---------- CC6 : l'avertissement Paddle remonte bien ----------
do $$ declare v jsonb; begin
  v := public.admin_extend_subscription('00000000-0000-0000-0000-0000000000c1', 10, 'Compensation incident');
  if not (v->>'facture_par_paddle')::boolean then
    raise exception '6 ECHEC: aucun avertissement alors que le compte est facture par Paddle';
  end if;
  raise notice 'OK 6: un compte facture par Paddle est signale (le prolongement sera ecrase au renouvellement)';
end $$;

-- ---------- CC7 : changer de palier ajuste les SIEGES ----------
-- Le geste se fait en tant qu'administrateur connecte ; la lecture de la table
-- se fait en superuser, car `authenticated` n'a aucun droit dessus ici — c'est
-- exactement ce que CC1 exige.
do $$ declare v jsonb; begin
  v := public.admin_change_plan('00000000-0000-0000-0000-0000000000c1', 'premium', 'Retrogradation demandee');
  if (v->>'sieges')::int <> 1 then
    raise exception '7 ECHEC: sieges non ajustes (%) — un retrograde garderait 5 utilisateurs', v->>'sieges';
  end if;
end $$;
reset role;
do $$ declare m integer; begin
  m := (select max_users from public.pro_clients where user_id = '00000000-0000-0000-0000-0000000000c1');
  if m <> 1 then raise exception '7 ECHEC: max_users vaut % en base', m; end if;
  raise notice 'OK 7: le changement de palier ajuste les sieges (sinon le controle p25 laisserait passer)';
end $$;
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';

-- ---------- CC8 : bornes refusees proprement ----------
do $$ begin
  begin
    perform public.admin_extend_subscription('00000000-0000-0000-0000-0000000000c1', 0, 'x');
    raise exception '8 ECHEC: 0 jour accepte';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.admin_extend_subscription('00000000-0000-0000-0000-0000000000c1', 9999, 'x');
    raise exception '8 ECHEC: 9999 jours acceptes';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.admin_change_plan('00000000-0000-0000-0000-0000000000c1', 'gratuit', 'x');
    raise exception '8 ECHEC: palier inexistant accepte';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.admin_set_subscription_status('00000000-0000-0000-0000-0000000000c1', 'cancelled', 'x');
    raise exception '8 ECHEC: statut hors contrainte accepte (aurait casse a l ecriture)';
  exception when sqlstate '22023' then null;
  end;
  raise notice 'OK 8: durees, paliers et statuts hors bornes refuses avec un message clair';
end $$;

-- ---------- CC9 : suspendre puis reactiver ----------
do $$ begin
  perform public.admin_set_subscription_status('00000000-0000-0000-0000-0000000000c1', 'suspended', 'Impaye');
end $$;
reset role;
do $$ declare s text; begin
  s := (select subscription_status from public.pro_clients where user_id = '00000000-0000-0000-0000-0000000000c1');
  if s <> 'suspended' then raise exception '9 ECHEC: statut % apres suspension', s; end if;
end $$;
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  perform public.admin_set_subscription_status('00000000-0000-0000-0000-0000000000c1', 'active', 'Regularise');
end $$;
reset role;
do $$ declare s text; begin
  s := (select subscription_status from public.pro_clients where user_id = '00000000-0000-0000-0000-0000000000c1');
  if s <> 'active' then raise exception '9 ECHEC: statut % apres reactivation', s; end if;
  raise notice 'OK 9: suspension puis reactivation';
end $$;
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';

-- ---------- CC10 : un motif vide est refuse sur TOUS les gestes ----------
do $$ begin
  begin
    perform public.admin_extend_subscription('00000000-0000-0000-0000-0000000000c1', 5, '   ');
    raise exception '10 ECHEC: prolongation sans motif';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.admin_change_plan('00000000-0000-0000-0000-0000000000c1', 'pro', '');
    raise exception '10 ECHEC: changement de palier sans motif';
  exception when sqlstate '22023' then null;
  end;
  raise notice 'OK 10: aucun geste sans motif ecrit';
end $$;

-- ---------- CC11 : la CONSULTATION d'une fiche est journalisee ----------
do $$ declare v jsonb; begin
  v := public.admin_subscriber_detail('00000000-0000-0000-0000-0000000000c1', 'Verification demande support');
  if (v->>'email') <> 'client1@societe.ma' then
    raise exception '11 ECHEC: mauvaise fiche renvoyee (%)', v->>'email';
  end if;
  if (v->>'annonces_publiees')::int <> 2 then
    raise exception '11 ECHEC: % annonces au lieu de 2', v->>'annonces_publiees';
  end if;
end $$;
reset role;
do $$ begin
  if not exists (
    select 1 from public.platform_admin_audit
    where action = 'client.consultation' and target_id = '00000000-0000-0000-0000-0000000000c1'
  ) then
    raise exception '11 ECHEC: la consultation d une fiche n a pas ete journalisee';
  end if;
  raise notice 'OK 11: consulter une fiche laisse une trace, au meme titre que la modifier';
end $$;

-- ---------- CC12 : la fiche ne divulgue AUCUNE donnee metier sensible ----------
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ declare v jsonb; k text; begin
  v := public.admin_subscriber_detail('00000000-0000-0000-0000-0000000000c1', 'Controle RGPD');
  foreach k in array array['messages','documents','devis','financement','api_key','password','tenders']
  loop
    if v ? k then
      raise exception '12 ECHEC: la fiche expose « % » — hors du perimetre annonce', k;
    end if;
  end loop;
  raise notice 'OK 12: la fiche s en tient aux colonnes annoncees (ni messages, ni documents, ni devis, ni cles)';
end $$;

-- ---------- CC13 : chaque geste a laisse EXACTEMENT une ligne de journal ----------
reset role;
do $$ declare n integer; begin
  n := (select count(*) from public.platform_admin_audit
        where action in ('abonnement.prolongation','abonnement.changement_palier',
                         'abonnement.suspension','abonnement.reactivation'));
  -- CC5 + CC6 (2 prolongations) + CC7 (1 palier) + CC9 (suspension + reactivation) = 5
  if n <> 5 then
    raise exception '13 ECHEC: % lignes de journal pour 5 gestes reussis', n;
  end if;
  raise notice 'OK 13: un geste = une ligne de journal, ni plus ni moins';
end $$;

do $$ begin raise notice 'TOUS LES CONTRE-CAS PASSES'; end $$;
