-- =====================================================================
-- MINEGRID NEXTGEN — 0001 — TRUST LAYER + INSPECTION
-- =====================================================================
-- Socle de l'actif n°1 : la CONFIANCE. Tables vérifiables, RLS stricte.
-- Convention : écritures « sensibles » (approbation de vérification,
-- certification d'inspection, score de confiance) réservées au service_role
-- (back-office / Edge Functions). Le client ne peut que LIRE et SOUMETTRE
-- des demandes (status 'pending'). Idempotent.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- TRUST PROFILES — un profil de confiance par compte (vendeur/acheteur/entreprise)
-- ---------------------------------------------------------------------
create table if not exists public.trust_profiles (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  entity_type     text not null default 'seller' check (entity_type in ('seller','buyer','company','inspector')),
  legal_name      text,
  country         text,
  -- Score 0-100 calculé côté serveur (jamais écrit par le client).
  trust_score     int  not null default 0 check (trust_score between 0 and 100),
  trust_tier      text not null default 'unverified'
                  check (trust_tier in ('unverified','basic','verified','trusted','elite')),
  verified_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, entity_type)
);
create index if not exists idx_trust_profiles_user on public.trust_profiles(user_id);

-- VERIFICATIONS — pièces vérifiables (identité, RC/ICE, fiscal, bancaire, doc machine)
create table if not exists public.verifications (
  id                uuid primary key default gen_random_uuid(),
  trust_profile_id  uuid not null references public.trust_profiles(id) on delete cascade,
  kind              text not null check (kind in
                    ('identity','company_registration','tax_id','bank_account','address','machine_document')),
  status            text not null default 'pending' check (status in ('pending','approved','rejected')),
  evidence_url      text,            -- objet privé (Storage), URL signée côté serveur
  reviewer_id       uuid references auth.users(id),
  review_notes      text,
  reviewed_at       timestamptz,
  created_at        timestamptz not null default now()
);
create index if not exists idx_verifications_profile on public.verifications(trust_profile_id);
create index if not exists idx_verifications_status on public.verifications(status) where status = 'pending';

-- MACHINE HISTORY — historique vérifiable d'une machine (actif data + confiance)
create table if not exists public.machine_history (
  id           uuid primary key default gen_random_uuid(),
  machine_id   uuid not null,
  event_type   text not null check (event_type in
               ('listed','price_change','inspected','sold','owner_change','maintenance','dispute')),
  details      jsonb not null default '{}'::jsonb,
  recorded_by  uuid references auth.users(id),
  source       text not null default 'platform',  -- platform | inspector | scraper | partner
  created_at   timestamptz not null default now()
);
create index if not exists idx_machine_history_machine on public.machine_history(machine_id, created_at desc);

-- ---------------------------------------------------------------------
-- INSPECTION — MineGrid Inspection (le produit qui crée la confiance, cf. IronClad)
-- ---------------------------------------------------------------------
create table if not exists public.inspectors (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users(id) on delete set null,
  full_name      text not null,
  zone           text,                        -- ex : 'Dakar', 'Abidjan', 'Casablanca'
  certifications jsonb not null default '[]'::jsonb,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);

create table if not exists public.inspection_requests (
  id            uuid primary key default gen_random_uuid(),
  machine_id    uuid not null,
  requester_id  uuid not null references auth.users(id) on delete cascade,
  inspector_id  uuid references public.inspectors(id) on delete set null,
  status        text not null default 'requested'
                check (status in ('requested','assigned','in_progress','completed','cancelled')),
  location      text,
  scheduled_at  timestamptz,
  price_amount  numeric(12,2),               -- prix de la prestation d'inspection
  price_currency text not null default 'EUR',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_inspection_requests_requester on public.inspection_requests(requester_id);
create index if not exists idx_inspection_requests_machine on public.inspection_requests(machine_id);

create table if not exists public.inspection_reports (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null unique references public.inspection_requests(id) on delete cascade,
  inspector_id  uuid references public.inspectors(id) on delete set null,
  overall_grade text check (overall_grade in ('A','B','C','D','F')),
  hours_meter   int,
  findings      jsonb not null default '{}'::jsonb,    -- moteur, hydraulique, train, etc.
  pdf_url       text,
  certified     boolean not null default false,        -- certifié = écrit par service_role
  certified_at  timestamptz,
  created_at    timestamptz not null default now()
);

create table if not exists public.inspection_media (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null references public.inspection_reports(id) on delete cascade,
  url         text not null,
  kind        text not null default 'photo' check (kind in ('photo','video','oil_analysis','document')),
  sha256      text,                                    -- empreinte = preuve d'intégrité
  created_at  timestamptz not null default now()
);
create index if not exists idx_inspection_media_report on public.inspection_media(report_id);

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.trust_profiles      enable row level security;
alter table public.verifications        enable row level security;
alter table public.machine_history      enable row level security;
alter table public.inspectors           enable row level security;
alter table public.inspection_requests  enable row level security;
alter table public.inspection_reports   enable row level security;
alter table public.inspection_media     enable row level security;

-- trust_profiles : lecture publique du SCORE (badge de confiance public),
-- mais écriture interdite au client (service_role calcule le score).
drop policy if exists trust_profiles_select_public on public.trust_profiles;
create policy trust_profiles_select_public on public.trust_profiles
  for select to anon, authenticated using (true);
-- (aucune policy insert/update/delete -> réservé service_role)

-- verifications : le propriétaire voit les siennes et peut SOUMETTRE (status forcé 'pending').
drop policy if exists verifications_select_own on public.verifications;
create policy verifications_select_own on public.verifications
  for select to authenticated using (
    exists (select 1 from public.trust_profiles tp
            where tp.id = verifications.trust_profile_id and tp.user_id = auth.uid())
  );
drop policy if exists verifications_insert_own on public.verifications;
create policy verifications_insert_own on public.verifications
  for insert to authenticated with check (
    status = 'pending'
    and exists (select 1 from public.trust_profiles tp
                where tp.id = verifications.trust_profile_id and tp.user_id = auth.uid())
  );
-- approbation/rejet -> service_role uniquement (pas de policy update client).

-- machine_history : lecture publique (transparence), écriture service_role/inspecteur.
drop policy if exists machine_history_select_public on public.machine_history;
create policy machine_history_select_public on public.machine_history
  for select to anon, authenticated using (true);

-- inspectors : lecture publique (annuaire), écriture service_role.
drop policy if exists inspectors_select_public on public.inspectors;
create policy inspectors_select_public on public.inspectors
  for select to anon, authenticated using (true);

-- inspection_requests : le demandeur voit/crée les siennes.
drop policy if exists inspection_requests_select_own on public.inspection_requests;
create policy inspection_requests_select_own on public.inspection_requests
  for select to authenticated using (requester_id = auth.uid());
drop policy if exists inspection_requests_insert_own on public.inspection_requests;
create policy inspection_requests_insert_own on public.inspection_requests
  for insert to authenticated with check (requester_id = auth.uid() and status = 'requested');

-- inspection_reports : lecture si on est le demandeur de la requête liée OU si certifié (public).
drop policy if exists inspection_reports_select on public.inspection_reports;
create policy inspection_reports_select on public.inspection_reports
  for select to anon, authenticated using (
    certified = true
    or exists (select 1 from public.inspection_requests ir
               where ir.id = inspection_reports.request_id and ir.requester_id = auth.uid())
  );
-- écriture (rédaction + certification) -> service_role / app inspecteur authentifiée serveur.

-- inspection_media : visible si le rapport parent est visible.
drop policy if exists inspection_media_select on public.inspection_media;
create policy inspection_media_select on public.inspection_media
  for select to anon, authenticated using (
    exists (select 1 from public.inspection_reports r
            where r.id = inspection_media.report_id
              and (r.certified = true
                   or exists (select 1 from public.inspection_requests ir
                              where ir.id = r.request_id and ir.requester_id = auth.uid())))
  );

-- Verrou par défaut : retirer tout grant d'écriture direct aux rôles client
revoke insert, update, delete on public.trust_profiles   from anon, authenticated;
revoke update, delete         on public.verifications     from anon, authenticated;
revoke insert, update, delete on public.machine_history   from anon, authenticated;
revoke insert, update, delete on public.inspectors        from anon, authenticated;
revoke update, delete         on public.inspection_requests from anon, authenticated;
revoke insert, update, delete on public.inspection_reports from anon, authenticated;
revoke insert, update, delete on public.inspection_media   from anon, authenticated;
