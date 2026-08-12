-- ============================================================================
-- P7f - Moindre privilege sur les grants PostgreSQL (MG-M02, MG-L01)
-- ============================================================================
-- CONSTATS REPRODUITS sur base vierge :
--   MG-M02 : `anon` peut executer bump_ai_usage et bump_tenders_usage. Un
--            visiteur non authentifie peut donc epuiser le quota IA d'une
--            organisation en boucle, sans compte et sans trace utilisateur.
--            (Des revocations existaient dans des migrations ulterieures mais
--            pas dans la baseline : toute base reconstruite repartait ouverte.)
--   MG-L01 : `anon` detient TRUNCATE sur 56 tables et `authenticated` sur 60,
--            plus DELETE/REFERENCES/TRIGGER sur 157 objets pour `anon`.
--            PostgREST n'expose pas TRUNCATE, donc l'exploitation directe est
--            improbable — mais ces privileges n'ont aucune raison d'exister, et
--            toute future voie d'acces SQL (extension, function SECURITY
--            INVOKER, outil d'admin) en heriterait.
--
-- PRINCIPE : un role ne detient que ce dont il a besoin. RLS protege les LIGNES ;
-- les grants protegent les OPERATIONS. Les deux sont necessaires : RLS ne
-- s'applique pas a TRUNCATE.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- MG-M02 : les compteurs de quota ne sont pas appelables anonymement.
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('bump_ai_usage','bump_tenders_usage')
  loop
    execute format('revoke all on function %s from anon', r.sig);
    raise notice 'revoke anon sur %', r.sig;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- MG-L01 : retrait de TRUNCATE / REFERENCES / TRIGGER a anon et authenticated.
-- Les operations CRUD legitimes (SELECT/INSERT/UPDATE/DELETE) sont conservees :
-- elles restent filtrees ligne a ligne par RLS. TRUNCATE, lui, contourne RLS
-- par conception — c'est precisement pourquoi il ne doit pas etre accorde.
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
  loop
    execute format('revoke truncate, references, trigger on public.%I from anon, authenticated',
                   r.relname);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- `anon` ne doit pas pouvoir SUPPRIMER de donnees, quelle que soit la table.
-- Aucun parcours public legitime ne repose sur un DELETE anonyme : les inserts
-- publics (contact, devis, vues) sont des ajouts, jamais des suppressions.
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
  loop
    execute format('revoke delete on public.%I from anon', r.relname);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Empreinte des privileges : permet a la CI de detecter une reouverture.
-- Une vue plutot qu'un test fige : elle reste juste quand le schema evolue.
-- ---------------------------------------------------------------------------
create or replace view public.v_privilege_audit as
  select grantee, privilege_type, count(*) as table_count
    from information_schema.role_table_grants
   where table_schema = 'public'
     and grantee in ('anon','authenticated')
   group by grantee, privilege_type;

revoke all on public.v_privilege_audit from anon, authenticated;

comment on view public.v_privilege_audit is
  'Empreinte des privileges anon/authenticated. Attendu : 0 TRUNCATE, 0 DELETE pour anon (MG-L01).';
