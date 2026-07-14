-- =====================================================================
-- P22 — Optimisation de l'évaluation RLS (« auth_rls_initplan ») — perf
-- =====================================================================
-- PROBLÈME : dans une policy, un appel NU à auth.uid() est ré-évalué PAR LIGNE
-- (le planificateur le traite comme une fonction volatile par-ligne). Sur une
-- table qui renvoie beaucoup de lignes, c'est un coût inutile.
--
-- CORRECTIF : envelopper l'appel en sous-requête scalaire  (select auth.uid()).
-- Postgres l'évalue alors UNE SEULE FOIS par requête (InitPlan) et réutilise la
-- valeur. C'est la recommandation officielle Supabase (linter « auth_rls_initplan »).
--
-- POURQUOI C'EST SÛR : (select auth.uid()) renvoie EXACTEMENT la même valeur que
-- auth.uid() (fonction stable, un seul uid par requête). On ne réécrit QUE l'appel
-- de fonction, jamais le reste du prédicat : on repart de l'expression ACTUELLE de
-- chaque policy (pg_policies.qual / with_check) et on n'y substitue que le texte
-- « auth.uid() ». Aucune reformulation manuelle => aucun risque d'ouvrir un trou.
--
-- IDEMPOTENT : on ne traite que les policies dont l'expression contient auth.uid()
-- SANS déjà contenir « select auth.uid() ». Au 2e passage, tout est déjà enveloppé
-- => rien à faire. Nommé $mig$ (l'éditeur SQL Supabase tolère un délimiteur nommé).
-- =====================================================================

do $mig$
declare
  r record;
  new_qual  text;
  new_check text;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (
        (qual       is not null and qual       ~* 'auth\.uid\(\)' and qual       !~* 'select\s+auth\.uid\(\)')
        or
        (with_check is not null and with_check ~* 'auth\.uid\(\)' and with_check !~* 'select\s+auth\.uid\(\)')
      )
  loop
    new_qual := null;
    new_check := null;

    if r.qual is not null and r.qual ~* 'auth\.uid\(\)' and r.qual !~* 'select\s+auth\.uid\(\)' then
      new_qual := regexp_replace(r.qual, 'auth\.uid\(\)', '(select auth.uid())', 'g');
    end if;

    if r.with_check is not null and r.with_check ~* 'auth\.uid\(\)' and r.with_check !~* 'select\s+auth\.uid\(\)' then
      new_check := regexp_replace(r.with_check, 'auth\.uid\(\)', '(select auth.uid())', 'g');
    end if;

    if new_qual is not null and new_check is not null then
      execute format('alter policy %I on %I.%I using (%s) with check (%s)',
                     r.policyname, r.schemaname, r.tablename, new_qual, new_check);
    elsif new_qual is not null then
      execute format('alter policy %I on %I.%I using (%s)',
                     r.policyname, r.schemaname, r.tablename, new_qual);
    elsif new_check is not null then
      execute format('alter policy %I on %I.%I with check (%s)',
                     r.policyname, r.schemaname, r.tablename, new_check);
    end if;

    raise notice 'p22: policy % on %.% optimisee', r.policyname, r.schemaname, r.tablename;
  end loop;
end
$mig$;
