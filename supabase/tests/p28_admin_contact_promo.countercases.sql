-- =====================================================================
-- CONTRE-CAS p28 — boîte de réception Contact et codes promo.
-- a1 = administrateur ; c1 = client ordinaire (intrus).
-- =====================================================================

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@minegrid.ma'),
  ('00000000-0000-0000-0000-0000000000c1', 'client@societe.ma'),
  ('00000000-0000-0000-0000-0000000000c2', 'beneficiaire@societe.ma');

insert into public.contact_messages (name, email, company, subject, message, status) values
  ('Prospect Un',   'p1@exemple.ma', 'Societe A', 'Demande de devis', 'Bonjour, je souhaite un devis pour une pelle.', 'new'),
  ('Prospect Deux', 'p2@exemple.ma', 'Societe B', 'Question technique', 'Quelle est la capacite de ce concasseur ?', 'new'),
  ('Prospect Trois','p3@exemple.ma', null,        'Partenariat',       'Nous souhaitons devenir partenaire logistique.', 'read');

insert into public.platform_admins (user_id, role, note)
values ('00000000-0000-0000-0000-0000000000a1', 'owner', 'Administrateur de test');

-- ============ CC1 : les droits d'ecriture/lecture publics sont retires ============
reset role;
do $$ declare n integer; begin
  n := (select count(*) from information_schema.role_table_grants
        where table_schema = 'public' and table_name = 'contact_messages'
          and grantee in ('anon', 'authenticated')
          and privilege_type in ('SELECT', 'UPDATE', 'DELETE'));
  if n <> 0 then
    raise exception '1 ECHEC: il reste % droit(s) de lecture/modification publics sur contact_messages', n;
  end if;
  -- L'insertion publique DOIT rester : c'est le formulaire du site.
  n := (select count(*) from information_schema.role_table_grants
        where table_schema = 'public' and table_name = 'contact_messages'
          and grantee = 'anon' and privilege_type = 'INSERT');
  if n <> 1 then
    raise exception '1 ECHEC: le formulaire public ne peut plus deposer de message';
  end if;
  raise notice 'OK 1: lecture/modification retirees au public, insertion du formulaire conservee';
end $$;

-- ---------- CC2 : un client ordinaire n'accede a rien ----------
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000c1';
do $$ begin
  begin
    perform 1 from public.contact_messages;
    raise exception '2 ECHEC: un client a pu LIRE la table des messages';
  exception when insufficient_privilege or sqlstate '42501' then null;
  end;
  begin
    perform public.admin_list_contact_messages(null, 10);
    raise exception '2 ECHEC: un client a pu lister les messages via la fonction';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.admin_list_promo_codes();
    raise exception '2 ECHEC: un client a pu lister les codes promo';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.admin_create_promo_code('PIRATE', 'enterprise', 30, 1, null, 'cadeau');
    raise exception '2 ECHEC: un client a pu CREER un code promo';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'OK 2: ni lecture directe, ni fonctions, ni creation de code pour un client';
end $$;

-- ---------- CC3 : l'administrateur lit la boite et le compteur de non-lus ----------
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ declare n integer; begin
  n := (select count(*) from public.admin_list_contact_messages(null, 50));
  if n <> 3 then raise exception '3 ECHEC: % messages au lieu de 3', n; end if;
  n := public.admin_contact_unread_count();
  if n <> 2 then raise exception '3 ECHEC: % non-lus annonces au lieu de 2', n; end if;
  n := (select count(*) from public.admin_list_contact_messages('new', 50));
  if n <> 2 then raise exception '3 ECHEC: filtre « new » -> % au lieu de 2', n; end if;
  raise notice 'OK 3: la boite se lit, le compteur de non-lus est juste, le filtre fonctionne';
end $$;

-- ---------- CC4 : classer un message, et la trace qui va avec ----------
do $$ declare v_id uuid; s text; begin
  v_id := (select id from public.admin_list_contact_messages('new', 1));
  perform public.admin_set_contact_status(v_id, 'replied');
  -- Relecture par la fonction (la table reste inaccessible en direct).
  s := (select status from public.admin_list_contact_messages('tous', 50) where id = v_id);
  if s <> 'replied' then raise exception '4 ECHEC: statut % apres classement', s; end if;
  if public.admin_contact_unread_count() <> 1 then
    raise exception '4 ECHEC: le compteur de non-lus n a pas suivi';
  end if;
end $$;
reset role;
do $$ begin
  if not exists (select 1 from public.platform_admin_audit where action = 'contact.statut') then
    raise exception '4 ECHEC: le classement d un message n a pas ete journalise';
  end if;
  raise notice 'OK 4: classer un message met le compteur a jour et laisse une trace';
end $$;

-- ---------- CC5 : statut hors bornes refuse proprement ----------
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ declare v_id uuid; begin
  v_id := (select id from public.admin_list_contact_messages('tous', 1));
  begin
    perform public.admin_set_contact_status(v_id, 'spam');
    raise exception '5 ECHEC: statut hors contrainte accepte (aurait casse a l ecriture)';
  exception when sqlstate '22023' then
    raise notice 'OK 5: statut invalide refuse avec un message clair, pas une erreur Postgres';
  end;
end $$;

-- ---------- CC6 : creer un code promo, avec ses garde-fous ----------
do $$ declare v_id uuid; begin
  v_id := public.admin_create_promo_code('BIENVENUE2026', 'enterprise', 30, 5, null, 'Campagne de lancement');
  if v_id is null then raise exception '6 ECHEC: aucun code cree'; end if;

  -- Deux campagnes ne doivent pas se melanger sous le meme code.
  begin
    perform public.admin_create_promo_code('bienvenue2026', 'pro', 10, 1, null, 'doublon');
    raise exception '6 ECHEC: un code en double a ete accepte';
  exception when sqlstate '23505' then null;
  end;

  begin
    perform public.admin_create_promo_code('ABC', 'enterprise', 30, 1, null, 'trop court');
    raise exception '6 ECHEC: code de 3 caracteres accepte';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.admin_create_promo_code('SANSMOTIF', 'enterprise', 30, 1, null, '  ');
    raise exception '6 ECHEC: code cree sans motif';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.admin_create_promo_code('TROPLONG', 'enterprise', 9999, 1, null, 'x');
    raise exception '6 ECHEC: duree de 9999 jours acceptee';
  exception when sqlstate '22023' then null;
  end;
  raise notice 'OK 6: code cree ; doublon, code trop court, motif vide et duree aberrante refuses';
end $$;

-- ---------- CC7 : « utilisable » croise les TROIS conditions ----------
reset role;
insert into public.promo_codes (code, subscription_type, duration_days, max_uses, uses_count, active)
values ('EPUISE', 'pro', 30, 2, 2, true);          -- actif mais quota atteint
insert into public.promo_codes (code, subscription_type, duration_days, max_uses, expires_at, active)
values ('PERIME', 'pro', 30, 5, now() - interval '1 day', true);  -- actif mais perime
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ declare u boolean; begin
  u := (select utilisable from public.admin_list_promo_codes() where code = 'EPUISE');
  if u then raise exception '7 ECHEC: un code EPUISE est annonce utilisable'; end if;
  u := (select utilisable from public.admin_list_promo_codes() where code = 'PERIME');
  if u then raise exception '7 ECHEC: un code PERIME est annonce utilisable'; end if;
  u := (select utilisable from public.admin_list_promo_codes() where code = 'BIENVENUE2026');
  if not u then raise exception '7 ECHEC: un code valide est annonce inutilisable'; end if;
  raise notice 'OK 7: « utilisable » croise actif, echeance ET quota (le seul drapeau actif mentirait)';
end $$;

-- ---------- CC8 : desactiver un code, et voir qui l'a utilise ----------
do $$ declare v_id uuid; u boolean; n integer; begin
  v_id := (select id from public.admin_list_promo_codes() where code = 'BIENVENUE2026');
  perform public.admin_set_promo_active(v_id, false, 'Fin de campagne');
  u := (select utilisable from public.admin_list_promo_codes() where code = 'BIENVENUE2026');
  if u then raise exception '8 ECHEC: le code reste utilisable apres desactivation'; end if;

  n := (select count(*) from public.admin_promo_redemptions(v_id));
  if n <> 0 then raise exception '8 ECHEC: % utilisation(s) sur un code neuf', n; end if;
  raise notice 'OK 8: desactivation effective, et la liste des beneficiaires est consultable';
end $$;

-- ---------- CC9 : le formulaire PUBLIC dépose toujours ses messages ----------
-- Le point qu'il ne fallait surtout pas casser en resserrant les droits.
set role anon;
set test.uid = '';
do $$ begin
  insert into public.contact_messages (name, email, subject, message)
  values ('Visiteur Anonyme', 'visiteur@exemple.ma', 'Demande', 'Bonjour, je cherche une chargeuse.');
  raise notice 'OK 9: un visiteur non connecte peut toujours ecrire depuis le formulaire';
exception when others then
  raise exception '9 ECHEC: le formulaire public ne fonctionne plus (%)', sqlerrm;
end $$;

reset role;
do $$ begin raise notice 'TOUS LES CONTRE-CAS PASSES'; end $$;
