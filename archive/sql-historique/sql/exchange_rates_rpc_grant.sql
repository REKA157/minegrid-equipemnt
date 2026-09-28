-- =====================================================================
-- Fix RPC exchange_rates (absence fonction + grants)
-- - Cree public.exchange_rates() si absente
-- - Applique GRANT EXECUTE sur toutes les signatures public.exchange_rates(...)
-- =====================================================================

-- 1) Cree (ou met a jour) la signature standard sans argument.
create or replace function public.exchange_rates()
returns table (
  currency text,
  rate numeric,
  last_updated timestamptz
)
language sql
stable
security definer
set search_path = public
as $exchange_rates_fn$
  select *
  from (
    values
      ('EUR'::text, 1.0000::numeric, now()),
      ('USD'::text, 1.0850::numeric, now()),
      ('MAD'::text, 10.8500::numeric, now()),
      ('XOF'::text, 655.96::numeric, now()),
      ('XAF'::text, 655.96::numeric, now()),
      ('NGN'::text, 1590.35::numeric, now()),
      ('ZAR'::text, 20.65::numeric, now()),
      ('EGP'::text, 33.72::numeric, now()),
      ('KES'::text, 158.48::numeric, now()),
      ('GHS'::text, 13.89::numeric, now())
  ) as t(currency, rate, last_updated);
$exchange_rates_fn$;

-- 2) Accorde l'execution sur toutes les signatures exchange_rates du schema public.
do $$
declare
  fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'exchange_rates'
  loop
    execute format('grant execute on function %s to anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end
$$;
