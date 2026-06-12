-- =====================================================================
-- Correctif RLS : acheteur créateur du dossier peut insérer les lignes
-- participant « buyer » (lui-même) et « seller » (titulaire annonce).
--
-- À exécuter si vous aviez déployé uniquement transaction_platform_core.sql
-- sans transaction_platform_extended.sql (sinon vous avez déjà cette logique).
-- Idempotent : remplace la policy transaction_participants_insert.
-- =====================================================================

drop policy if exists transaction_participants_insert on public.transaction_participants;

create policy transaction_participants_insert on public.transaction_participants
  for insert to authenticated
  with check (
    exists (
      select 1 from public.transaction_cases c
      where c.id = case_id
        and c.seller_user_id = auth.uid()
    )
    or exists (
      select 1 from public.transaction_cases c
      where c.id = case_id
        and c.buyer_user_id = auth.uid()
        and user_id = auth.uid()
        and role = 'buyer'
    )
    or exists (
      select 1 from public.transaction_cases c
      where c.id = case_id
        and c.buyer_user_id = auth.uid()
        and user_id = c.seller_user_id
        and role = 'seller'
    )
    or exists (
      select 1 from public.transaction_participants p
      where p.case_id = transaction_participants.case_id
        and p.user_id = auth.uid()
        and p.revoked_at is null
        and p.role in ('broker', 'admin_delegate')
    )
  );
