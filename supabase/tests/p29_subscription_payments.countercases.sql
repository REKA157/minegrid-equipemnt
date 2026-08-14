-- =====================================================================
-- CONTRE-CAS p29 — registre des paiements d'abonnement.
-- a1 = administrateur ; c1/c2 = clients payants ; i1 = intrus.
-- =====================================================================

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@minegrid.ma'),
  ('00000000-0000-0000-0000-0000000000c1', 'client1@societe.ma'),
  ('00000000-0000-0000-0000-0000000000c2', 'client2@societe.ma'),
  ('00000000-0000-0000-0000-0000000000f1', 'intrus@ailleurs.ma');

insert into public.platform_admins (user_id, role, note)
values ('00000000-0000-0000-0000-0000000000a1', 'owner', 'Administrateur de test');

-- Le serveur (webhook) ecrit : 20 USD = 2000 centimes.
insert into public.subscription_payments
  (user_id, paddle_transaction_id, paddle_subscription_id, event_type, plan, amount_cents, occurred_at)
values
  ('00000000-0000-0000-0000-0000000000c1', 'txn_001', 'sub_1', 'transaction.completed', 'pro',        2000, now() - interval '2 days'),
  ('00000000-0000-0000-0000-0000000000c2', 'txn_002', 'sub_2', 'transaction.completed', 'enterprise', 20000, now() - interval '5 days'),
  -- Mois precedent : ne doit PAS entrer dans l encaisse du mois en cours.
  ('00000000-0000-0000-0000-0000000000c1', 'txn_000', 'sub_1', 'transaction.completed', 'pro',        2000, date_trunc('month', now()) - interval '3 days');

-- ============ CC1 : le registre resiste a TOUT, meme en superuser ============
do $$ begin
  begin
    update public.subscription_payments set amount_cents = 1 where true;
    raise exception '1 ECHEC: un montant a pu etre MODIFIE (en superuser)';
  exception when sqlstate '42501' then null;
  end;
  begin
    delete from public.subscription_payments where true;
    raise exception '1 ECHEC: une ligne a pu etre EFFACEE (en superuser)';
  exception when sqlstate '42501' then null;
  end;
  begin
    truncate public.subscription_payments;
    raise exception '1 ECHEC: le registre a pu etre VIDE (en superuser)';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'OK 1: le registre resiste a UPDATE, DELETE et TRUNCATE, meme en superuser';
end $$;

-- ---------- CC2 : une relivraison de webhook ne double pas l encaissement ----------
do $$ declare n_avant integer; n_apres integer; begin
  n_avant := (select count(*) from public.subscription_payments);
  begin
    -- Paddle reemet volontiers le meme evenement.
    insert into public.subscription_payments (user_id, paddle_transaction_id, event_type, amount_cents)
    values ('00000000-0000-0000-0000-0000000000c1', 'txn_001', 'transaction.completed', 2000);
    raise exception '2 ECHEC: la meme transaction a ete enregistree DEUX FOIS';
  exception when unique_violation then null;
  end;
  n_apres := (select count(*) from public.subscription_payments);
  if n_apres <> n_avant then raise exception '2 ECHEC: le registre a bouge (% -> %)', n_avant, n_apres; end if;
  raise notice 'OK 2: une relivraison du meme paiement ne cree pas de doublon';
end $$;

-- ---------- CC3 : un client ordinaire ne voit RIEN ----------
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000f1';
do $$ begin
  begin
    perform 1 from public.subscription_payments;
    raise exception '3 ECHEC: un client a pu LIRE le registre en direct';
  exception when insufficient_privilege or sqlstate '42501' then null;
  end;
  begin
    perform public.admin_list_payments(10);
    raise exception '3 ECHEC: un client a pu lister les paiements';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.admin_payment_stats();
    raise exception '3 ECHEC: un client a pu lire le chiffre d affaires';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'OK 3: ni lecture directe, ni liste, ni chiffre d affaires pour un client';
end $$;

-- ---------- CC4 : l administrateur lit le registre, en CENTIMES ----------
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ declare r record; begin
  select * into r from public.admin_list_payments(10) where reference = 'txn_002';
  if r.amount_cents <> 20000 then
    raise exception '4 ECHEC: montant % au lieu de 20000 centimes (200 USD)', r.amount_cents;
  end if;
  if r.email <> 'client2@societe.ma' then
    raise exception '4 ECHEC: mauvais compte (%)', r.email;
  end if;
  raise notice 'OK 4: le registre se lit, en centimes, avec le compte concerne';
end $$;

-- ---------- CC5 : l encaisse du MOIS ne melange pas les mois ----------
do $$ declare s record; begin
  select * into s from public.admin_payment_stats();
  -- Mois en cours : txn_001 (2000) + txn_002 (20000) = 22000 centimes = 220 USD.
  if s.encaisse_mois_cents <> 22000 then
    raise exception '5 ECHEC: encaisse du mois = % au lieu de 22000 centimes', s.encaisse_mois_cents;
  end if;
  if s.paiements_mois <> 2 then
    raise exception '5 ECHEC: % paiements ce mois au lieu de 2', s.paiements_mois;
  end if;
  -- Total, tous mois confondus : 24000 centimes = 240 USD.
  if s.encaisse_total_cents <> 24000 then
    raise exception '5 ECHEC: total = % au lieu de 24000 centimes', s.encaisse_total_cents;
  end if;
  raise notice 'OK 5: l encaisse du mois exclut le mois precedent (220 USD ce mois, 240 au total)';
end $$;

-- ---------- CC6 : plusieurs devises -> l ecran doit pouvoir se taire ----------
reset role;
insert into public.subscription_payments (user_id, paddle_transaction_id, event_type, amount_cents, currency)
values ('00000000-0000-0000-0000-0000000000c1', 'txn_eur', 'transaction.completed', 1800, 'EUR');
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ declare s record; begin
  select * into s from public.admin_payment_stats();
  if position(',' in s.devises) = 0 then
    raise exception '6 ECHEC: plusieurs devises presentes mais une seule annoncee (%)', s.devises;
  end if;
  raise notice 'OK 6: les devises multiples sont signalees — additionner dollars et euros serait faux';
end $$;

-- ---------- CC7 : le piege des centimes est documente DANS la base ----------
reset role;
do $$ declare c text; begin
  c := col_description('public.pro_clients'::regclass,
        (select attnum from pg_attribute
         where attrelid = 'public.pro_clients'::regclass and attname = 'payment_amount'));
  if c is null or position('CENTIMES' in upper(c)) = 0 then
    raise exception '7 ECHEC: rien n avertit du piege sur pro_clients.payment_amount';
  end if;
  raise notice 'OK 7: le piege des centimes est ecrit dans le schema, pas seulement dans un fichier';
end $$;

do $$ begin raise notice 'TOUS LES CONTRE-CAS PASSES'; end $$;
