-- =====================================================================
-- Contre-cas P22 (exécutés APRÈS un double passage de la migration via le runner :
-- prouve à la fois la réécriture, l'accès préservé ET la robustesse au ré-apply).
-- =====================================================================

-- (a) t1_sel (nue) est maintenant enveloppée
do $a$
declare q text;
begin
  select qual into q from pg_policies where tablename = 't1' and policyname = 't1_sel';
  if q !~* 'select\s+auth\.uid\(\)' then
    raise exception '(a) ECHEC: t1_sel non reecrite -> %', q;
  end if;
  raise notice '(a) OK t1_sel = %', q;
end $a$;

-- (a bis) t1_ins (WITH CHECK nu) est enveloppée
do $a2$
declare c text;
begin
  select with_check into c from pg_policies where tablename = 't1' and policyname = 't1_ins';
  if c !~* 'select\s+auth\.uid\(\)' then
    raise exception '(a bis) ECHEC: t1_ins with_check non reecrit -> %', c;
  end if;
  raise notice '(a bis) OK t1_ins = %', c;
end $a2$;

-- (b) t2_sel (déjà optimisée) : intacte, jamais double-emballée même après 2 passages
do $b$
declare q text;
begin
  select qual into q from pg_policies where tablename = 't2' and policyname = 't2_sel';
  if q ~* 'select\s+auth\.uid\(\)\s*as\s+uid\s*\).*select\s+auth\.uid' then
    raise exception '(b) ECHEC: t2_sel double-emballee -> %', q;
  end if;
  if q !~* 'select\s+auth\.uid\(\)' then
    raise exception '(b) ECHEC: t2_sel a perdu son enveloppe -> %', q;
  end if;
  raise notice '(b) OK t2_sel intacte = %', q;
end $b$;

-- (c) t3_sel : l'argument passé au helper est enveloppé
do $c$
declare q text;
begin
  select qual into q from pg_policies where tablename = 't3' and policyname = 't3_sel';
  if q !~* 'select\s+auth\.uid\(\)' then
    raise exception '(c) ECHEC: t3_sel arg non enveloppe -> %', q;
  end if;
  raise notice '(c) OK t3_sel = %', q;
end $c$;

-- (d) COMPORTEMENT INCHANGÉ : mêmes lignes visibles, contre-cas toujours bloqué
do $d$
declare n int;
begin
  set local role authenticated;

  set local test.uid = '11111111-1111-1111-1111-111111111111';
  select count(*) into n from public.t1;
  if n <> 2 then raise exception '(d) t1 u_a attendu 2, obtenu %', n; end if;
  select count(*) into n from public.t2;
  if n <> 1 then raise exception '(d) t2 u_a attendu 1, obtenu %', n; end if;
  select count(*) into n from public.t3;
  if n <> 1 then raise exception '(d) t3 u_a attendu 1, obtenu %', n; end if;

  set local test.uid = '22222222-2222-2222-2222-222222222222';
  select count(*) into n from public.t1;
  if n <> 1 then raise exception '(d) CONTRE-CAS t1 u_b attendu 1, obtenu %', n; end if;
  select count(*) into n from public.t3;
  if n <> 0 then raise exception '(d) CONTRE-CAS t3 u_b attendu 0, obtenu %', n; end if;

  reset role;
  raise notice '(d) OK acces identique + contre-cas bloques';
end $d$;
