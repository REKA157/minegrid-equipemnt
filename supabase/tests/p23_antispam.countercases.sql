-- =====================================================================
-- Contre-cas P23 (après création des triggers). Inserts joués EN TANT QU'anon.
-- =====================================================================

-- (1) Rafale devis : 3 inserts OK pour un e-mail neuf, le 4e est bloqué
set role anon;
insert into public.quote_requests(buyer_email) values ('burst@b.com');
insert into public.quote_requests(buyer_email) values ('burst@b.com');
insert into public.quote_requests(buyer_email) values ('burst@b.com');
do $$
begin
  begin
    insert into public.quote_requests(buyer_email) values ('burst@b.com');
    raise exception '(1) ECHEC: le 4e insert rafale aurait du etre bloque';
  exception when others then
    if sqlerrm not like '%peu de temps%' then raise exception '(1) mauvaise erreur: %', sqlerrm; end if;
    raise notice '(1) OK rafale devis bloquee au 4e';
  end;
end $$;
reset role;

-- (2) Indépendance : un AUTRE e-mail passe malgré le flood de burst@b.com
set role anon;
insert into public.quote_requests(buyer_email) values ('autre@x.com');
reset role;
do $$
declare n int;
begin
  n := (select count(*) from public.quote_requests where buyer_email = 'autre@x.com');
  if n <> 1 then raise exception '(2) ECHEC: autre e-mail devrait passer, obtenu %', n; end if;
  raise notice '(2) OK e-mails independants';
end $$;

-- (3) Fenêtre horaire : flood@a.com a 15 lignes récentes (hors rafale) -> bloqué
set role anon;
do $$
begin
  begin
    insert into public.quote_requests(buyer_email) values ('flood@a.com');
    raise exception '(3) ECHEC: insert horaire aurait du etre bloque';
  exception when others then
    if sqlerrm not like '%Limite horaire%' then raise exception '(3) mauvaise erreur: %', sqlerrm; end if;
    raise notice '(3) OK limite horaire devis';
  end;
end $$;
reset role;

-- (3 bis) ok@c.com n'a que 2 lignes -> passe
set role anon;
insert into public.quote_requests(buyer_email) values ('ok@c.com');
reset role;

-- (4) Rafale contact : 3 OK, 4e bloqué
set role anon;
insert into public.contact_messages(email) values ('spam@d.com');
insert into public.contact_messages(email) values ('spam@d.com');
insert into public.contact_messages(email) values ('spam@d.com');
do $$
begin
  begin
    insert into public.contact_messages(email) values ('spam@d.com');
    raise exception '(4) ECHEC: le 4e contact rafale aurait du etre bloque';
  exception when others then
    if sqlerrm not like '%peu de temps%' then raise exception '(4) mauvaise erreur: %', sqlerrm; end if;
    raise notice '(4) OK rafale contact bloquee au 4e';
  end;
end $$;
reset role;

-- (5) Le compteur voit bien les lignes malgré l'absence de policy SELECT pour anon
--     (si la fonction n'était pas SECURITY DEFINER, le throttle serait inopérant).
do $$
declare n int;
begin
  n := (select count(*) from public.quote_requests where buyer_email = 'burst@b.com');
  if n <> 3 then raise exception '(5) ECHEC: 3 lignes burst attendues (4e bloque), obtenu %', n; end if;
  raise notice '(5) OK SECURITY DEFINER compte hors RLS';
end $$;
