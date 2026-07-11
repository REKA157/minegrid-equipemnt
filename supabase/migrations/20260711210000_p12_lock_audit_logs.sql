-- =====================================================================
-- P12 — audit_logs : forcer l'auto-attribution (fin de la pollution actor_id NULL)
-- =====================================================================
-- FAILLE (audit Fable 5, F-006) : la policy INSERT audit_logs_insert_own accepte
-- `actor_id IS NULL OR actor_id = auth.uid()` -> un utilisateur authentifié peut
-- insérer des entrées d'audit ANONYMES (actor_id NULL) et polluer/brouiller le
-- journal. Le front ne fait que LIRE audit_logs (auditLogService.listByCase =
-- .select) -> forcer l'auto-attribution ne casse rien.
--
-- CORRECTIF : le client ne peut insérer une entrée qu'à SON nom (actor_id=auth.uid()).
-- Le serveur (service_role / triggers) reste libre d'écrire des évènements système
-- avec actor_id NULL (RLS non appliquée au service_role).
--
-- Gardée (to_regclass) + délimiteur nommé pour le bundle/éditeur Supabase. Idempotent.
-- =====================================================================

do $p12$
begin
  if to_regclass('public.audit_logs') is null then
    raise notice 'audit_logs absente : p12 ignorée'; return;
  end if;

  alter table public.audit_logs enable row level security;

  drop policy if exists audit_logs_insert_own on public.audit_logs;
  create policy audit_logs_insert_own on public.audit_logs
    for insert to authenticated
    with check (actor_id = auth.uid());   -- plus de actor_id NULL côté client
end;
$p12$;
