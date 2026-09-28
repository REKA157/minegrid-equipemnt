-- ============================================================================
-- 8_lead_contact_role.sql
-- Ajoute une colonne OPTIONNELLE `contact_role` à la table `leads`, pour distinguer
-- les prospects issus d'un appel d'offres (Global Monitor) :
--   'winner' = LAURÉAT (a remporté le marché)  -> angle NÉGOCIATION
--   'buyer'  = MAÎTRE D'OUVRAGE / demandeur     -> angle SOUMISSION
--
-- 100% idempotent : ré-exécutable sans risque.
-- TANT QUE cette migration n'est PAS appliquée, l'application insère les leads SANS
-- cette colonne (l'app réessaie automatiquement) ; le rôle reste alors visible dans le
-- TITRE du prospect (« Prospect lauréat … » / « Prospect AO (maître d'ouvrage) … ») et
-- dans les notes. Une fois appliquée, le rôle devient un champ STRUCTURÉ et filtrable.
-- ============================================================================

alter table public.leads
  add column if not exists contact_role text;

comment on column public.leads.contact_role is
  'Rôle du contact pour les leads issus du Global Monitor (AO) : winner (lauréat) | buyer (maître d''ouvrage). NULL sinon.';

-- (Optionnel) index pour filtrer rapidement les prospects par rôle :
create index if not exists idx_leads_contact_role
  on public.leads (contact_role)
  where contact_role is not null;
