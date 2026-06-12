-- =====================================================================
-- Fail-safe : lie quote_requests.transaction_case_id quand un dossier est
-- cree avec primary_quote_request_id (meme si l UPDATE navigateur echoue).
-- Executer dans SQL Editor Supabase (postgres). Idempotent.
-- =====================================================================

create or replace function public.transaction_cases_after_insert_link_quote_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if new.primary_quote_request_id is null then
    return new;
  end if;
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'quote_requests'
  ) then
    return new;
  end if;

  /*
    Lier la ligne quote pointee par primary_quote_request_id si :
    - vendeur aligne OU meme machine_id que le dossier (corrige seller_id stale sur quote).
    Pas de contrainte acheteur : la ligne quote est par definition celle du dossier (meme id).
  */
  update public.quote_requests qr
  set
    transaction_case_id = new.id,
    seller_id = coalesce(qr.seller_id, new.seller_user_id),
    updated_at = now()
  where qr.id = new.primary_quote_request_id
    and qr.transaction_case_id is null
    and (
      qr.seller_id is not distinct from new.seller_user_id
      or qr.machine_id is not distinct from new.machine_id
    );

  get diagnostics n = row_count;
  if n = 0 then
    raise exception
      'transaction_cases_link_quote_request: impossible de lier quote_request % au dossier % (introuvable, vendeur/machine incoherent avec la quote, ou deja liee)',
      new.primary_quote_request_id,
      new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_transaction_cases_link_quote_request on public.transaction_cases;
create trigger trg_transaction_cases_link_quote_request
  after insert on public.transaction_cases
  for each row execute function public.transaction_cases_after_insert_link_quote_request();
