-- =====================================================================
-- DATA FLYWHEEL PRIX — chaque vente réelle alimente price_observations
-- =====================================================================
-- Quand un escrow réel est LIBÉRÉ (escrow_transactions.status = 'released' =
-- vente conclue, fonds versés au vendeur), on enregistre une observation de prix
-- 'sale' — le signal de prix le plus fort possible (vs les annonces 'listing').
-- Cela enrichit l'estimation (estimatePrice) et la détection fraude au fil des ventes.
--
-- ANTI-FAÇADE : on n'observe QUE des ventes réelles (released), prix = montant réel
-- de l'escrow. Aucune donnée inventée. price_observations reste deny-par-défaut
-- (service_role only) ; l'insertion passe par un trigger SECURITY DEFINER serveur.
--
-- Idempotent : colonne de traçabilité escrow_transaction_id + garde NOT EXISTS.
-- Pré-requis : sql/nextgen/0002 (escrow) + 0003 (price_observations) + machines.
-- =====================================================================

-- Traçabilité + idempotence : une observation 'sale' par escrow libéré.
alter table public.price_observations
  add column if not exists escrow_transaction_id uuid
  references public.escrow_transactions (id) on delete set null;

create unique index if not exists price_observations_escrow_uniq
  on public.price_observations (escrow_transaction_id)
  where escrow_transaction_id is not null;

create or replace function public._escrow_to_price_observation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_brand text;
  v_model text;
  v_year  int;
begin
  -- Seulement à l'entrée dans l'état 'released' (vente conclue).
  if new.status <> 'released' or old.status is not distinct from new.status then
    return new;
  end if;
  if new.machine_id is null then return new; end if;

  -- Déjà observée pour cet escrow -> idempotent.
  if exists (select 1 from public.price_observations where escrow_transaction_id = new.id) then
    return new;
  end if;

  -- Attributs machine (best-effort ; colonnes réelles brand/model/year).
  select m.brand, m.model, m.year into v_brand, v_model, v_year
  from public.machines m where m.id = new.machine_id;

  insert into public.price_observations
    (brand, model, year, price_amount, price_currency, source, observed_at, escrow_transaction_id)
  values
    (v_brand, v_model, v_year, new.amount, coalesce(new.currency, 'EUR'), 'sale', now(), new.id);

  return new;
end;
$$;

drop trigger if exists trg_escrow_to_price_observation on public.escrow_transactions;
create trigger trg_escrow_to_price_observation
  after update of status on public.escrow_transactions
  for each row execute function public._escrow_to_price_observation();

-- Vérification :
-- select source, count(*) from public.price_observations group by source;
