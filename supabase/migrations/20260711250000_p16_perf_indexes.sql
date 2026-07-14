-- =====================================================================
-- P16 — Index de performance sur les requêtes les plus fréquentes (audit Fable 5)
-- =====================================================================
-- FAIT : aucun index versionné sur machines/leads/messages ; or l'app trie/filtre
-- constamment sur created_at (accueil, catalogue, pipeline), sellerid/seller_id
-- (vitrine, « mes annonces »), category (secteurs), et messages.seller_id/receiver_id.
-- Sans index -> seq scans sur les tables les plus chaudes = lenteur à la montée en charge.
--
-- Création GARDÉE (bloc unique $idx$, délimiteur nommé pour compat éditeur Supabase) :
-- chaque index n'est créé que si la table ET la colonne existent -> aucun échec si un
-- schéma diffère. Idempotent (create index if not exists).
--
-- NB : sur une TRÈS grosse table, préférer `CREATE INDEX CONCURRENTLY` (hors
-- transaction, pas de verrou) exécuté à la main. Ici, volumes actuels modestes :
-- la création est quasi instantanée.
-- =====================================================================

do $idx$
declare
  r record;
begin
  for r in
    select * from (values
      ('machines', 'created_at', 'idx_machines_created_at', ' desc'),
      ('machines', 'sellerid',   'idx_machines_sellerid',   ''),
      ('machines', 'seller_id',  'idx_machines_seller_id',  ''),
      ('machines', 'category',   'idx_machines_category',   ''),
      ('leads',    'created_at',  'idx_leads_created_at',    ' desc'),
      ('messages', 'seller_id',   'idx_messages_seller_id',  ''),
      ('messages', 'receiver_id', 'idx_messages_receiver_id',''),
      ('messages', 'sellerid',    'idx_messages_sellerid',   '')
    ) as t(tbl, col, idxname, opt)
  loop
    if to_regclass('public.' || r.tbl) is not null
       and exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = r.tbl and column_name = r.col
       ) then
      execute format('create index if not exists %I on public.%I (%I%s)',
                     r.idxname, r.tbl, r.col, r.opt);
    end if;
  end loop;
end;
$idx$;
