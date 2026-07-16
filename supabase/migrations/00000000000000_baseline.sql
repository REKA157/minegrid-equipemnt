


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."_escrow_status_to_payment"("p_status" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case p_status
    when 'created'           then 'awaiting_partner'  -- escrow ouvert, AUCUN argent
    when 'funded'            then 'held'               -- fonds séquestrés chez le PSP
    when 'inspection_passed' then 'held'
    when 'delivered'         then 'held'
    when 'released'          then 'released'           -- terminal : payé au vendeur
    when 'refunded'          then 'refunded'           -- terminal : remboursé
    when 'disputed'          then 'disputed'
    when 'cancelled'         then 'cancelled'
    else 'pending'
  end;
$$;


ALTER FUNCTION "public"."_escrow_status_to_payment"("p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_escrow_to_price_observation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."_escrow_to_price_observation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_tc_can_invite"("p_case_id" "uuid", "p_uid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.transaction_cases c
    where c.id = p_case_id
      and (c.seller_user_id = p_uid or c.buyer_user_id = p_uid)
  )
  or exists (
    select 1 from public.transaction_participants tp
    where tp.case_id = p_case_id
      and tp.user_id = p_uid
      and tp.role = 'admin_delegate'
      and tp.revoked_at is null
  );
$$;


ALTER FUNCTION "public"."_tc_can_invite"("p_case_id" "uuid", "p_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_tc_is_party"("p_case_id" "uuid", "p_uid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.transaction_cases c
    where c.id = p_case_id
      and (
        c.seller_user_id = p_uid
        or c.buyer_user_id = p_uid
        or exists (
          select 1 from public.transaction_participants tp
          where tp.case_id = p_case_id and tp.user_id = p_uid and tp.revoked_at is null
        )
      )
  );
$$;


ALTER FUNCTION "public"."_tc_is_party"("p_case_id" "uuid", "p_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_tc_participant_of_role"("p_case_id" "uuid", "p_role" "text") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select tp.user_id
  from public.transaction_participants tp
  where tp.case_id = p_case_id and tp.role = p_role and tp.revoked_at is null
  order by tp.invited_at asc
  limit 1;
$$;


ALTER FUNCTION "public"."_tc_participant_of_role"("p_case_id" "uuid", "p_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_tc_sync_payment_from_escrow"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_payment_status text;
  v_existing_id uuid;
  v_existing_status text;
begin
  -- Escrow non rattaché à un dossier -> rien à miroiter.
  if new.transaction_case_id is null then
    return new;
  end if;

  v_payment_status := public._escrow_status_to_payment(new.status);

  -- Ligne escrow OUVERTE du dossier (créée par create_payment_step) ou déjà liée.
  select id, status into v_existing_id, v_existing_status
  from public.payment_records
  where transaction_case_id = new.transaction_case_id
    and payment_type = 'escrow'
    and (escrow_transaction_id = new.id
         or status not in ('released', 'refunded', 'cancelled'))
  order by (escrow_transaction_id = new.id) desc, created_at desc
  limit 1;

  if v_existing_id is not null then
    -- Idempotence : déjà à l'état cible ET déjà liée -> aucun bruit.
    if v_existing_status is distinct from v_payment_status
       or not exists (
         select 1 from public.payment_records
         where id = v_existing_id and escrow_transaction_id = new.id
       ) then
      update public.payment_records
         set status = v_payment_status, escrow_transaction_id = new.id
       where id = v_existing_id;

      insert into public.transaction_events (case_id, actor_user_id, event_type, payload)
      values (new.transaction_case_id, null, 'escrow.synced',
        jsonb_build_object('escrow_id', new.id, 'escrow_status', new.status,
                           'payment_status', v_payment_status, 'payment_record_id', v_existing_id));
    end if;
  else
    -- Aucune ligne dossier : on crée le miroir (montant/devise = ceux de l'escrow réel).
    insert into public.payment_records
      (transaction_case_id, payer_id, payee_id, amount, currency, payment_type, status, escrow_transaction_id)
    values
      (new.transaction_case_id, new.buyer_id, new.seller_id, new.amount,
       coalesce(new.currency, 'MAD'), 'escrow', v_payment_status, new.id)
    returning id into v_existing_id;

    insert into public.transaction_events (case_id, actor_user_id, event_type, payload)
    values (new.transaction_case_id, null, 'escrow.synced',
      jsonb_build_object('escrow_id', new.id, 'escrow_status', new.status,
                         'payment_status', v_payment_status, 'payment_record_id', v_existing_id, 'created', true));
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."_tc_sync_payment_from_escrow"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_invitation"("p_token" "text") RETURNS TABLE("organization_id" "uuid", "organization_name" "text", "role" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
#variable_conflict use_column
declare
  v_uid       uuid := auth.uid();
  v_email     text;
  v_inv       public.user_invitations%rowtype;
begin
  if v_uid is null then
    raise exception 'Connexion requise pour accepter l''invitation.' using errcode = '28000';
  end if;

  select lower(au.email) into v_email from auth.users au where au.id = v_uid;

  select * into v_inv
  from public.user_invitations ui
  where ui.token = p_token
  limit 1;

  if v_inv.id is null then
    raise exception 'Invitation introuvable.' using errcode = 'P0002';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'Cette invitation a déjà été utilisée ou annulée.' using errcode = '22023';
  end if;
  if v_inv.expires_at is not null and v_inv.expires_at < now() then
    update public.user_invitations set status = 'expired', updated_at = now() where id = v_inv.id;
    raise exception 'Cette invitation a expiré.' using errcode = '22023';
  end if;
  if v_email is null or lower(v_inv.email) <> v_email then
    raise exception 'Cette invitation ne correspond pas à l''email de votre compte.' using errcode = '42501';
  end if;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_inv.organization_id, v_uid, v_inv.role)
  on conflict (organization_id, user_id) do update set role = excluded.role;

  update public.user_invitations
  set status = 'accepted', accepted_at = now(), accepted_by = v_uid, updated_at = now()
  where id = v_inv.id;

  return query
    select o.id, o.name, v_inv.role
    from public.organizations o where o.id = v_inv.organization_id;
end;
$$;


ALTER FUNCTION "public"."accept_invitation"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."advance_transaction_case_step"("p_case_id" "uuid", "p_step" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_new_status text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not public._tc_is_party(p_case_id, v_uid) then raise exception 'forbidden'; end if;

  if p_step = 'inspection' then
    v_id := public.create_inspection_step(p_case_id);
  elsif p_step = 'payment' then
    v_id := public.create_payment_step(p_case_id);
    v_new_status := 'payment';
  elsif p_step = 'financing' then
    v_id := public.create_financing_step(p_case_id, null);
  elsif p_step = 'transport' then
    v_id := public.create_transport_step(p_case_id, null, null);
    v_new_status := 'logistics';
  elsif p_step = 'customs' then
    v_id := public.create_customs_step(p_case_id, null, null);
    v_new_status := 'customs';
  else
    raise exception 'unknown step: %', p_step;
  end if;

  -- Avance le statut du dossier seulement pour les étapes qui mappent un statut.
  if v_new_status is not null then
    update public.transaction_cases
       set status = v_new_status, updated_at = now()
     where id = p_case_id and status <> v_new_status;
  end if;

  return v_id;
end;
$$;


ALTER FUNCTION "public"."advance_transaction_case_step"("p_case_id" "uuid", "p_step" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_transaction_partner"("p_case_id" "uuid", "p_role" "text", "p_partner_email" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_partner uuid;
  v_email text := lower(trim(coalesce(p_partner_email, '')));
  v_id uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  -- Rôle partenaire autorisé via cette RPC (liste blanche).
  if p_role not in ('mechanic', 'broker', 'carrier', 'forwarder', 'logistician', 'investor') then
    raise exception 'invalid partner role: %', p_role;
  end if;

  if not exists (select 1 from public.transaction_cases where id = p_case_id) then
    raise exception 'case not found';
  end if;

  if not public._tc_can_invite(p_case_id, v_uid) then
    raise exception 'forbidden';
  end if;

  if v_email = '' then raise exception 'partner email required'; end if;

  -- Résolution du partenaire : utilisateur RÉEL uniquement (anti-façade).
  select id into v_partner from auth.users where lower(email) = v_email limit 1;
  if v_partner is null then raise exception 'partner_not_found'; end if;

  -- Idempotence : (case_id, user_id, role) est unique. On réactive si révoqué.
  insert into public.transaction_participants (case_id, user_id, role, invited_by, invited_at, revoked_at)
  values (p_case_id, v_partner, p_role, v_uid, now(), null)
  on conflict (case_id, user_id, role)
  do update set revoked_at = null, invited_by = excluded.invited_by, invited_at = now()
  returning id into v_id;

  insert into public.transaction_events (case_id, actor_user_id, event_type, payload)
  values (p_case_id, v_uid, 'participant.assigned',
    jsonb_build_object('participant_id', v_id, 'role', p_role, 'partner_email', v_email));

  return v_id;
end;
$$;


ALTER FUNCTION "public"."assign_transaction_partner"("p_case_id" "uuid", "p_role" "text", "p_partner_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_document_insert_fn"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.audit_logs (actor_id, organization_id, transaction_case_id, action, entity_type, entity_id, metadata)
  SELECT
    NEW.uploaded_by,
    c.organization_id,
    NEW.transaction_case_id,
    'transaction_document.uploaded',
    'transaction_document',
    NEW.id,
    jsonb_build_object('case_id', NEW.transaction_case_id, 'document_type', NEW.document_type)
  FROM public.transaction_cases c
  WHERE c.id = NEW.transaction_case_id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."audit_document_insert_fn"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bump_ai_usage"("p_org" "uuid", "p_daily_limit" integer) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_count int;
begin
  if p_org is null then
    return false;
  end if;

  insert into public.ai_usage_daily (organization_id, usage_date, request_count)
  values (p_org, current_date, 1)
  on conflict (organization_id, usage_date)
  do update set request_count = public.ai_usage_daily.request_count + 1
  returning request_count into v_count;

  return v_count <= greatest(1, p_daily_limit);
end;
$$;


ALTER FUNCTION "public"."bump_ai_usage"("p_org" "uuid", "p_daily_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bump_tenders_usage"("p_user" "uuid", "p_daily_limit" integer) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_count int;
begin
  if p_user is null then
    return false;
  end if;

  insert into public.tenders_ai_usage_daily (user_id, usage_date, request_count)
  values (p_user, current_date, 1)
  on conflict (user_id, usage_date)
  do update set request_count = public.tenders_ai_usage_daily.request_count + 1
  returning request_count into v_count;

  return v_count <= greatest(1, p_daily_limit);
end;
$$;


ALTER FUNCTION "public"."bump_tenders_usage"("p_user" "uuid", "p_daily_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_lead"("p_lead_id" "uuid", "p_uid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.leads l
    where l.id = p_lead_id
      and (
        l.seller_id = p_uid                                   -- legacy / non encore rattaché
        or (l.organization_id is not null
            and public.user_in_org(l.organization_id, p_uid)) -- membre de la société
      )
  );
$$;


ALTER FUNCTION "public"."can_access_lead"("p_lead_id" "uuid", "p_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_transaction_case"("p_case_id" "uuid", "p_uid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.transaction_cases c
    where c.id = p_case_id
      and (c.seller_user_id = p_uid or c.buyer_user_id = p_uid)
  )
  or exists (
    select 1 from public.transaction_participants p
    where p.case_id = p_case_id
      and p.user_id = p_uid
      and p.revoked_at is null
  );
$$;


ALTER FUNCTION "public"."can_access_transaction_case"("p_case_id" "uuid", "p_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_finance_actor"("p_case_id" "uuid", "p_uid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

  select public.can_access_transaction_case(p_case_id, p_uid)

    and (

      exists (

        select 1 from public.transaction_participants p

        where p.case_id = p_case_id and p.user_id = p_uid and p.role = 'broker' and p.revoked_at is null

      )

      or exists (

        select 1 from public.financing_requests f

        where f.transaction_case_id = p_case_id and f.broker_id = p_uid

      )

    );

$$;


ALTER FUNCTION "public"."can_finance_actor"("p_case_id" "uuid", "p_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_assigned_inspection"("p_inspection" "uuid", "p_uid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

  select exists (

    select 1 from public.inspection_requests r

    where r.id = p_inspection

      and (

        r.assigned_to = p_uid

        or public.can_access_transaction_case(r.transaction_case_id, p_uid)

      )

  );

$$;


ALTER FUNCTION "public"."can_view_assigned_inspection"("p_inspection" "uuid", "p_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_invitation"("p_invitation_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  if v_uid is null then
    raise exception 'Connexion requise.' using errcode = '28000';
  end if;

  select organization_id into v_org
  from public.user_invitations where id = p_invitation_id;

  if v_org is null then
    raise exception 'Invitation introuvable.' using errcode = 'P0002';
  end if;
  if not public.user_in_org_admin(v_org, v_uid) then
    raise exception 'Vous ne pouvez pas annuler cette invitation.' using errcode = '42501';
  end if;

  update public.user_invitations
  set status = 'cancelled', updated_at = now()
  where id = p_invitation_id and status = 'pending';

  return true;
end;
$$;


ALTER FUNCTION "public"."cancel_invitation"("p_invitation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clear_org_ai_key"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  if v_uid is null then
    raise exception 'Connexion requise.' using errcode = '28000';
  end if;
  select m.organization_id into v_org
  from public.organization_members m
  where m.user_id = v_uid and m.role in ('owner', 'admin')
  order by (m.role = 'owner') desc
  limit 1;
  if v_org is null then
    raise exception 'Seul un administrateur peut déconnecter l''IA.' using errcode = '42501';
  end if;

  delete from public.organization_ai_credentials where organization_id = v_org;
  return true;
end;
$$;


ALTER FUNCTION "public"."clear_org_ai_key"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."contact_messages_antispam_fn"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_email text := lower(trim(coalesce(new.email, '')));
  v_burst int;
  v_hour  int;
begin
  if v_email = '' then
    return new;
  end if;

  v_burst := (
    select count(*) from public.contact_messages c
    where lower(trim(c.email)) = v_email
      and c.created_at > now() - interval '2 minutes'
  );
  if v_burst >= 3 then
    raise exception 'Trop de messages envoyes en peu de temps. Merci de patienter quelques minutes.';
  end if;

  v_hour := (
    select count(*) from public.contact_messages c
    where lower(trim(c.email)) = v_email
      and c.created_at > now() - interval '1 hour'
  );
  if v_hour >= 10 then
    raise exception 'Limite horaire de messages atteinte pour cette adresse e-mail. Merci de reessayer plus tard.';
  end if;

  return new;
end
$$;


ALTER FUNCTION "public"."contact_messages_antispam_fn"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."courtier_compute_credit_commission"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.commission_amount IS NULL OR NEW.commission_amount = 0 THEN
    IF NEW.requested_amount IS NOT NULL AND NEW.commission_rate IS NOT NULL THEN
      NEW.commission_amount = ROUND(NEW.requested_amount * NEW.commission_rate / 100, 2);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."courtier_compute_credit_commission"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."courtier_compute_policy_commission"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.commission_amount IS NULL OR NEW.commission_amount = 0 THEN
    IF NEW.annual_premium IS NOT NULL AND NEW.commission_rate IS NOT NULL THEN
      NEW.commission_amount = ROUND(NEW.annual_premium * NEW.commission_rate / 100, 2);
    END IF;
  END IF;
  -- Auto end_date à start_date + 1 an si non renseignée
  IF NEW.end_date IS NULL AND NEW.start_date IS NOT NULL THEN
    NEW.end_date = NEW.start_date + INTERVAL '1 year';
  END IF;
  -- Auto policy_number si vide
  IF NEW.policy_number IS NULL OR NEW.policy_number = '' THEN
    NEW.policy_number = 'POL-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || SUBSTR(NEW.id::TEXT, 1, 6);
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."courtier_compute_policy_commission"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."courtier_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."courtier_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_customs_step"("p_case_id" "uuid", "p_origin" "text" DEFAULT NULL::"text", "p_destination" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_case public.transaction_cases%rowtype;
  v_existing uuid;
  v_forwarder uuid;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_case from public.transaction_cases where id = p_case_id;
  if not found then raise exception 'case not found'; end if;
  if not public._tc_is_party(p_case_id, v_uid) then raise exception 'forbidden'; end if;

  select id into v_existing from public.customs_cases
   where transaction_case_id = p_case_id and customs_status not in ('cleared', 'closed')
   order by updated_at desc limit 1;
  if v_existing is not null then return v_existing; end if;

  v_forwarder := public._tc_participant_of_role(p_case_id, 'forwarder');

  insert into public.customs_cases (transaction_case_id, forwarder_id, origin_country, destination_country, customs_status, missing_documents)
  values (p_case_id, v_forwarder, p_origin, p_destination, 'a_traiter', '[]'::jsonb)
  returning id into v_id;

  insert into public.transaction_events (case_id, actor_user_id, event_type, payload)
  values (p_case_id, v_uid, 'customs.opened',
    jsonb_build_object('customs_case_id', v_id, 'forwarder_assigned', v_forwarder is not null));

  return v_id;
end;
$$;


ALTER FUNCTION "public"."create_customs_step"("p_case_id" "uuid", "p_origin" "text", "p_destination" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_financing_step"("p_case_id" "uuid", "p_amount" numeric DEFAULT NULL::numeric) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_case public.transaction_cases%rowtype;
  v_existing uuid;
  v_broker uuid;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_case from public.transaction_cases where id = p_case_id;
  if not found then raise exception 'case not found'; end if;
  if not public._tc_is_party(p_case_id, v_uid) then raise exception 'forbidden'; end if;

  select id into v_existing from public.financing_requests
   where transaction_case_id = p_case_id and status not in ('approved', 'funded', 'rejected', 'cancelled')
   order by updated_at desc limit 1;
  if v_existing is not null then return v_existing; end if;

  v_broker := public._tc_participant_of_role(p_case_id, 'broker');

  insert into public.financing_requests (transaction_case_id, buyer_id, broker_id, requested_amount, currency, status, documents_status, scoring_status)
  values (p_case_id, v_case.buyer_user_id, v_broker,
    coalesce(p_amount, v_case.total_amount), coalesce(v_case.currency, 'MAD'),
    'a_examiner', 'pending', 'pending')
  returning id into v_id;

  insert into public.transaction_events (case_id, actor_user_id, event_type, payload)
  values (p_case_id, v_uid, 'financing.requested',
    jsonb_build_object('financing_request_id', v_id, 'broker_assigned', v_broker is not null));

  return v_id;
end;
$$;


ALTER FUNCTION "public"."create_financing_step"("p_case_id" "uuid", "p_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_inspection_step"("p_case_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_case public.transaction_cases%rowtype;
  v_existing uuid;
  v_mechanic uuid;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_case from public.transaction_cases where id = p_case_id;
  if not found then raise exception 'case not found'; end if;
  if not public._tc_is_party(p_case_id, v_uid) then raise exception 'forbidden'; end if;

  -- Idempotence : inspection ouverte déjà présente -> on la renvoie.
  select id into v_existing from public.inspection_requests
   where transaction_case_id = p_case_id and status not in ('completed', 'cancelled', 'done')
   order by created_at desc limit 1;
  if v_existing is not null then return v_existing; end if;

  v_mechanic := public._tc_participant_of_role(p_case_id, 'mechanic');

  insert into public.inspection_requests (transaction_case_id, machine_id, requested_by, assigned_to, status)
  values (
    p_case_id, v_case.machine_id, v_uid, v_mechanic,
    case when v_mechanic is null then 'a_assigner' else 'assigned' end
  )
  returning id into v_id;

  insert into public.transaction_events (case_id, actor_user_id, event_type, payload)
  values (p_case_id, v_uid, 'inspection.requested',
    jsonb_build_object('inspection_request_id', v_id, 'assigned', v_mechanic is not null));

  return v_id;
end;
$$;


ALTER FUNCTION "public"."create_inspection_step"("p_case_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_invitation"("p_email" "text", "p_name" "text", "p_role" "text") RETURNS TABLE("id" "uuid", "organization_id" "uuid", "token" "text", "email" "text", "role" "text", "expires_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
#variable_conflict use_column
declare
  v_uid   uuid := auth.uid();
  v_org   uuid;
  v_token text;
  v_email text := lower(trim(p_email));
  v_role  text := lower(trim(p_role));
  v_id    uuid;
  v_exp   timestamptz := now() + interval '14 days';
begin
  if v_uid is null then
    raise exception 'Connexion requise pour inviter.' using errcode = '28000';
  end if;
  if v_email is null or v_email = '' then
    raise exception 'Email invité manquant.' using errcode = '22023';
  end if;
  if v_role not in ('admin', 'manager', 'viewer') then
    raise exception 'Rôle invalide (admin, manager ou viewer).' using errcode = '22023';
  end if;

  select m.organization_id into v_org
  from public.organization_members m
  where m.user_id = v_uid
    and m.role in ('owner', 'admin', 'manager')
  order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end
  limit 1;

  if v_org is null then
    raise exception 'Vous devez être administrateur d''une société pour inviter.' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.organization_members om
    join auth.users au on au.id = om.user_id
    where om.organization_id = v_org and lower(au.email) = v_email
  ) then
    raise exception 'Cette personne fait déjà partie de votre société.' using errcode = '23505';
  end if;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  select ui.id into v_id
  from public.user_invitations ui
  where ui.organization_id = v_org and lower(ui.email) = v_email and ui.status = 'pending'
  limit 1;

  if v_id is null then
    insert into public.user_invitations
      (organization_id, email, name, role, token, invited_by, status, expires_at)
    values
      (v_org, v_email, p_name, v_role, v_token, v_uid, 'pending', v_exp)
    returning user_invitations.id into v_id;
  else
    update public.user_invitations ui
    set token = v_token, role = v_role, name = coalesce(p_name, ui.name),
        invited_by = v_uid, expires_at = v_exp, updated_at = now()
    where ui.id = v_id;
  end if;

  return query
    select ui.id, ui.organization_id, ui.token, ui.email, ui.role, ui.expires_at
    from public.user_invitations ui where ui.id = v_id;
end;
$$;


ALTER FUNCTION "public"."create_invitation"("p_email" "text", "p_name" "text", "p_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_payment_step"("p_case_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_case public.transaction_cases%rowtype;
  v_existing uuid;
  v_amount numeric;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_case from public.transaction_cases where id = p_case_id;
  if not found then raise exception 'case not found'; end if;
  if not public._tc_is_party(p_case_id, v_uid) then raise exception 'forbidden'; end if;

  select id into v_existing from public.payment_records
   where transaction_case_id = p_case_id and payment_type = 'escrow'
     and status not in ('released', 'refunded', 'cancelled')
   order by created_at desc limit 1;
  if v_existing is not null then return v_existing; end if;

  -- Montant = total du dossier s'il est renseigné, sinon 0 (à confirmer ; jamais inventé).
  v_amount := coalesce(v_case.total_amount, 0);

  insert into public.payment_records (transaction_case_id, payer_id, payee_id, amount, currency, payment_type, status)
  values (p_case_id, v_case.buyer_user_id, v_case.seller_user_id, v_amount,
    coalesce(v_case.currency, 'MAD'), 'escrow', 'awaiting_partner')
  returning id into v_id;

  insert into public.transaction_events (case_id, actor_user_id, event_type, payload)
  values (p_case_id, v_uid, 'escrow.awaiting_partner',
    jsonb_build_object('payment_record_id', v_id, 'amount', v_amount, 'note', 'escrow en attente de partenaire — aucun paiement reel'));

  return v_id;
end;
$$;


ALTER FUNCTION "public"."create_payment_step"("p_case_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_transport_step"("p_case_id" "uuid", "p_pickup" "text" DEFAULT NULL::"text", "p_delivery" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_case public.transaction_cases%rowtype;
  v_existing uuid;
  v_carrier uuid;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_case from public.transaction_cases where id = p_case_id;
  if not found then raise exception 'case not found'; end if;
  if not public._tc_is_party(p_case_id, v_uid) then raise exception 'forbidden'; end if;

  select id into v_existing from public.transport_requests
   where transaction_case_id = p_case_id and status not in ('delivered', 'cancelled')
   order by updated_at desc limit 1;
  if v_existing is not null then return v_existing; end if;

  v_carrier := public._tc_participant_of_role(p_case_id, 'carrier');

  insert into public.transport_requests (transaction_case_id, transporter_id, pickup_location, delivery_location, status)
  values (p_case_id, v_carrier, p_pickup, p_delivery, 'a_planifier')
  returning id into v_id;

  insert into public.transaction_events (case_id, actor_user_id, event_type, payload)
  values (p_case_id, v_uid, 'transport.requested',
    jsonb_build_object('transport_request_id', v_id, 'carrier_assigned', v_carrier is not null));

  return v_id;
end;
$$;


ALTER FUNCTION "public"."create_transport_step"("p_case_id" "uuid", "p_pickup" "text", "p_delivery" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_my_account"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_uid     uuid := auth.uid();
  r         record;
  v_n       int;
  v_deleted int := 0;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Non authentifié');
  end if;

  for r in
    select * from (values
      ('machines', 'sellerid'), ('machines', 'seller_id'),
      ('leads', 'seller_id'), ('leads', 'assigned_to_user_id'),
      ('messages', 'sellerid'), ('messages', 'seller_id'),
      ('documents', 'user_id'),
      ('planning_events', 'user_id'),
      ('devis', 'user_id'),
      ('vitrines', 'user_id'),
      ('pro_clients', 'user_id'),
      ('promo_redemptions', 'user_id'),
      ('member_sessions', 'user_id'),
      ('organization_member_scopes', 'user_id'),
      ('organization_members', 'user_id'),
      ('enterprise_dashboard_configs', 'user_id'),
      ('quote_requests', 'buyer_user_id'), ('quote_requests', 'seller_id')
    ) as t(tbl, col)
  loop
    if to_regclass('public.' || r.tbl) is not null
       and exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = r.tbl and column_name = r.col
       ) then
      execute format('delete from public.%I where %I = $1', r.tbl, r.col) using v_uid;
      get diagnostics v_n = row_count;
      v_deleted := v_deleted + v_n;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'rows_deleted', v_deleted);
end;
$_$;


ALTER FUNCTION "public"."delete_my_account"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."documents_force_owner_fn"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is not null then
    new.user_id := auth.uid();
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."documents_force_owner_fn"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_transaction_case_for_quote_request"("p_quote_request_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  qr record;
  new_case uuid;
  resolved_seller uuid;
  v_amount numeric;
  v_currency text := 'MAD';
begin
  if auth.uid() is null then
    raise exception 'ensure_transaction_case_for_quote_request: authentification requise';
  end if;

  select * into qr from public.quote_requests where id = p_quote_request_id;
  if not found then
    raise exception 'ensure_transaction_case_for_quote_request: quote_request introuvable';
  end if;

  resolved_seller := qr.seller_id;
  if resolved_seller is null
     and qr.machine_id is not null
     and exists (select 1 from information_schema.tables
                 where table_schema='public' and table_name='machines') then
    select coalesce(m.seller_id, m.sellerid, m.user_id, m.owner_id)
      into resolved_seller
    from public.machines m where m.id = qr.machine_id limit 1;
  end if;

  if auth.uid() is distinct from qr.buyer_user_id
     and auth.uid() is distinct from resolved_seller then
    raise exception 'ensure_transaction_case_for_quote_request: accès refusé';
  end if;

  if qr.transaction_case_id is not null then return qr.transaction_case_id; end if;
  if resolved_seller is null or qr.buyer_user_id is null then return null; end if;
  if qr.buyer_user_id = resolved_seller then return null; end if;

  update public.quote_requests q0
  set seller_id = resolved_seller, updated_at = now()
  where q0.id = qr.id and q0.seller_id is distinct from resolved_seller;

  -- Montant du dossier : offre de l'acheteur (budget_max sinon budget_min), repli prix annonce (TEXT).
  v_amount := coalesce(qr.budget_max, qr.budget_min);
  if v_amount is null and qr.machine_id is not null then
    select nullif(regexp_replace(replace(m.price::text, ',', '.'), '[^0-9.]', '', 'g'), '')::numeric
      into v_amount
    from public.machines m where m.id = qr.machine_id limit 1;
  end if;
  if coalesce(v_amount, 0) <= 0 then v_amount := null; end if;

  insert into public.transaction_cases (
    kind, status, machine_id, seller_user_id, buyer_user_id,
    primary_quote_request_id, title, created_by, total_amount, currency
  )
  values (
    'sale', 'draft', qr.machine_id, resolved_seller, qr.buyer_user_id,
    qr.id, 'Demande depuis annonce', qr.buyer_user_id, v_amount, v_currency
  )
  returning id into new_case;

  insert into public.transaction_participants (case_id, user_id, role, invited_by, invited_at)
  values
    (new_case, qr.buyer_user_id, 'buyer', qr.buyer_user_id, now()),
    (new_case, resolved_seller, 'seller', qr.buyer_user_id, now())
  on conflict (case_id, user_id, role) do nothing;

  update public.quote_requests q
  set transaction_case_id = new_case,
      seller_id = coalesce(q.seller_id, resolved_seller),
      updated_at = now()
  where q.id = qr.id and q.transaction_case_id is null;

  return new_case;
end;
$$;


ALTER FUNCTION "public"."ensure_transaction_case_for_quote_request"("p_quote_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."exchange_rates"() RETURNS TABLE("currency" "text", "rate" numeric, "last_updated" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."exchange_rates"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_effective_subscription"() RETURNS TABLE("is_active" boolean, "type" "text", "status" "text", "ends_at" timestamp with time zone, "source" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with cand as (
    select pc.subscription_type as type, pc.subscription_status as status,
           pc.subscription_end as ends_at, 'self'::text as source
    from public.pro_clients pc
    where pc.user_id = auth.uid()
    union all
    select pc.subscription_type, pc.subscription_status, pc.subscription_end, 'org'::text
    from public.organization_members my
    join public.organization_members owner
      on owner.organization_id = my.organization_id and owner.role = 'owner'
    join public.pro_clients pc on pc.user_id = owner.user_id
    where my.user_id = auth.uid()
  ),
  scored as (
    select
      c.type, c.status, c.ends_at, c.source,
      (c.status = 'active' and (c.ends_at is null or c.ends_at > now())) as is_active,
      case c.type
        when 'enterprise' then 4 when 'premium' then 3 when 'pro' then 2 when 'basic' then 1 else 0
      end as rnk
    from cand c
  )
  select coalesce(s.is_active, false), s.type, s.status, s.ends_at, s.source
  from (select 1) one
  left join lateral (
    select * from scored where is_active order by rnk desc, ends_at desc nulls last limit 1
  ) s on true;
$$;


ALTER FUNCTION "public"."get_effective_subscription"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_member_sessions"("p_user_id" "uuid", "p_limit" integer DEFAULT 50) RETURNS TABLE("id" "uuid", "user_id" "uuid", "login_at" timestamp with time zone, "logout_at" timestamp with time zone, "user_agent" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select s.id, s.user_id, s.login_at, s.logout_at, s.user_agent
  from public.member_sessions s
  where s.user_id = p_user_id
    and (
      s.user_id = auth.uid()
      or public.user_in_org_admin(s.organization_id, auth.uid())
    )
  order by s.login_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;


ALTER FUNCTION "public"."get_member_sessions"("p_user_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_member_scope"() RETURNS TABLE("commercial" boolean, "tenders" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    coalesce(s.commercial, true) as commercial,
    coalesce(s.tenders, true)    as tenders
  from public.organization_members me
  left join public.organization_member_scopes s
    on s.organization_id = me.organization_id
   and s.user_id = me.user_id
  where me.user_id = auth.uid()
  order by me.created_at
  limit 1;
$$;


ALTER FUNCTION "public"."get_my_member_scope"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_org_ai_status"() RETURNS TABLE("configured" boolean, "provider" "text", "model" "text", "key_last4" "text", "base_url" "text", "updated_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    true,
    c.provider,
    c.model,
    -- On n'expose QUE les 4 derniers caractères de la clé.
    right(c.api_key, 4),
    c.base_url,
    c.updated_at
  from public.organization_ai_credentials c
  join public.organization_members me
    on me.organization_id = c.organization_id
   and me.user_id = auth.uid()
  limit 1;
$$;


ALTER FUNCTION "public"."get_org_ai_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_org_members"() RETURNS TABLE("user_id" "uuid", "organization_id" "uuid", "role" "text", "member_since" timestamp with time zone, "first_name" "text", "last_name" "text", "email" "text", "phone" "text", "last_sign_in_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    m.user_id,
    m.organization_id,
    m.role,
    m.created_at as member_since,
    coalesce(
      au.raw_user_meta_data ->> 'firstName',
      au.raw_user_meta_data ->> 'first_name',
      au.raw_user_meta_data ->> 'full_name',
      au.raw_user_meta_data ->> 'name'
    ) as first_name,
    coalesce(
      au.raw_user_meta_data ->> 'lastName',
      au.raw_user_meta_data ->> 'last_name'
    ) as last_name,
    au.email,
    coalesce(
      au.raw_user_meta_data ->> 'phone',
      au.raw_user_meta_data ->> 'telephone'
    ) as phone,
    au.last_sign_in_at
  from public.organization_members m
  join public.organization_members me
    on me.organization_id = m.organization_id
   and me.user_id = auth.uid()
  join auth.users au on au.id = m.user_id
  order by
    case m.role
      when 'owner' then 0 when 'admin' then 1 when 'manager' then 2 else 3
    end,
    m.created_at;
$$;


ALTER FUNCTION "public"."get_org_members"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_org_session_stats"() RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(count(distinct s.user_id), 0)::int
  from public.member_sessions s
  join public.organization_members me
    on me.organization_id = s.organization_id
   and me.user_id = auth.uid()
   and me.role in ('owner', 'admin')
  where s.login_at::date = current_date;
$$;


ALTER FUNCTION "public"."get_org_session_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."investisseur_compute_opportunity_metrics"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_total_invest DECIMAL;
  v_monthly_net DECIMAL;
  v_total_revenue DECIMAL;
  v_total_costs DECIMAL;
  v_total_gain DECIMAL;
BEGIN
  v_total_invest := COALESCE(NEW.asking_price, 0) + COALESCE(NEW.estimated_acquisition_costs, 0);
  v_monthly_net := COALESCE(NEW.expected_monthly_revenue, 0) - COALESCE(NEW.expected_monthly_costs, 0);

  -- Payback : nb mois pour récupérer l'investissement (sans valeur résiduelle)
  IF v_monthly_net > 0 AND v_total_invest > 0 THEN
    NEW.payback_months := CEIL(v_total_invest / v_monthly_net)::INTEGER;
  END IF;

  -- ROI total sur la durée de détention : ((revenus + revente) - investissement) / investissement
  IF v_total_invest > 0 AND NEW.expected_holding_years IS NOT NULL THEN
    v_total_revenue := v_monthly_net * NEW.expected_holding_years * 12;
    v_total_costs := v_total_invest;
    v_total_gain := v_total_revenue + COALESCE(NEW.expected_resale_value, 0) - v_total_costs;
    -- ROI annualisé approximé
    NEW.expected_roi_percent := ROUND(((v_total_gain / v_total_costs) / NEW.expected_holding_years * 100)::numeric, 2);
  END IF;

  -- Auto-référence si vide
  IF NEW.reference IS NULL OR NEW.reference = '' THEN
    NEW.reference := 'OP-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || SUBSTR(NEW.id::TEXT, 1, 6);
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."investisseur_compute_opportunity_metrics"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."investisseur_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."investisseur_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_org_staff_for_case"("p_case_id" "uuid", "p_uid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

  select exists (

    select 1

    from public.transaction_cases c

    join public.organization_members m

      on m.organization_id = c.organization_id

    where c.id = p_case_id

      and c.organization_id is not null

      and m.user_id = p_uid

      and m.role in ('owner', 'admin', 'manager')

  );

$$;


ALTER FUNCTION "public"."is_org_staff_for_case"("p_case_id" "uuid", "p_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."leads_guard_fn"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.organization_id := (
        select m.organization_id
        from public.organization_members m
        where m.user_id = auth.uid()
        order by (m.role = 'owner') desc, m.created_at asc
        limit 1
      );
      if new.assigned_to_user_id is null then
        new.assigned_to_user_id := auth.uid();
      end if;
    elsif tg_op = 'UPDATE' then
      new.organization_id := old.organization_id;  -- pas de déplacement inter-société
      new.seller_id := old.seller_id;              -- propriété d'origine préservée
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."leads_guard_fn"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."link_case_to_escrow"("p_case_id" "uuid", "p_escrow_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_escrow public.escrow_transactions%rowtype;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not public._tc_is_party(p_case_id, v_uid) then raise exception 'forbidden'; end if;

  select * into v_escrow from public.escrow_transactions where id = p_escrow_id;
  if not found then raise exception 'escrow_not_found'; end if;

  -- L'appelant doit aussi être partie de l'escrow (acheteur ou vendeur).
  if v_escrow.buyer_id <> v_uid and v_escrow.seller_id <> v_uid then
    raise exception 'forbidden';
  end if;

  -- Idempotent : déjà lié au même dossier -> on ressort.
  if v_escrow.transaction_case_id is not distinct from p_case_id then
    return p_escrow_id;
  end if;
  if v_escrow.transaction_case_id is not null then
    raise exception 'escrow_already_linked';
  end if;

  update public.escrow_transactions
     set transaction_case_id = p_case_id, updated_at = now()
   where id = p_escrow_id;  -- déclenche trg_escrow_sync_payment

  insert into public.transaction_events (case_id, actor_user_id, event_type, payload)
  values (p_case_id, v_uid, 'escrow.linked',
    jsonb_build_object('escrow_id', p_escrow_id, 'escrow_status', v_escrow.status));

  return p_escrow_id;
end;
$$;


ALTER FUNCTION "public"."link_case_to_escrow"("p_case_id" "uuid", "p_escrow_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."logisticien_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."logisticien_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."machine_category_counts"() RETURNS TABLE("category" "text", "category_name" "text", "n" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    m.category::text                              as category,
    (m.specifications ->> 'category_name')::text  as category_name,
    count(*)::bigint                              as n
  from public.machines m
  group by m.category, (m.specifications ->> 'category_name');
$$;


ALTER FUNCTION "public"."machine_category_counts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."machine_engagement_counts"("p_machine_ids" "uuid"[]) RETURNS TABLE("machine_id" "uuid", "views" bigint, "contacts" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_views_src text :=
    case when to_regclass('public.machine_views') is not null
      then '(select count(*) from public.machine_views mv where mv.machine_id = ids.mid)'
      else '0' end;
  v_offers_src text :=
    case when to_regclass('public.offers') is not null
      then '(select count(*) from public.offers ofr where ofr.machine_id = ids.mid and ofr.seller_id = auth.uid())'
      else '0' end;
  v_msg_src text :=
    case when to_regclass('public.messages') is not null
      then '(select count(*) from public.messages m where m.machine_id = ids.mid and (m.receiver_id = auth.uid() or m.seller_id = auth.uid()))'
      else '0' end;
begin
  return query execute
       'select ids.mid as machine_id, '
    || 'coalesce(' || v_views_src  || ', 0)::bigint as views, '
    || '(coalesce(' || v_offers_src || ', 0) + coalesce(' || v_msg_src || ', 0))::bigint as contacts '
    || 'from (select unnest($1) as mid) ids'
  using p_machine_ids;
exception
  when undefined_column or undefined_table then
    -- Dégradation gracieuse si une colonne/table attendue diffère selon l'install :
    -- on renvoie une ligne par machine (0 engagement) plutôt que d'échouer.
    return query select ids.mid, 0::bigint, 0::bigint
                 from (select unnest(p_machine_ids) as mid) ids;
end
$_$;


ALTER FUNCTION "public"."machine_engagement_counts"("p_machine_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mecanicien_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."mecanicien_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."open_case_escrow"("p_case_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_case public.transaction_cases%rowtype;
  v_existing uuid;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_case from public.transaction_cases where id = p_case_id;
  if not found then raise exception 'case not found'; end if;

  if v_case.seller_user_id <> v_uid and v_case.buyer_user_id is distinct from v_uid then
    raise exception 'forbidden';
  end if;

  if v_case.buyer_user_id is null then raise exception 'buyer_required'; end if;

  -- Filet : si le dossier n'a pas de montant, le renseigner depuis le prix de l'annonce.
  if coalesce(v_case.total_amount, 0) <= 0 and v_case.machine_id is not null then
    update public.transaction_cases
       set total_amount = (
             select nullif(regexp_replace(replace(m.price::text, ',', '.'), '[^0-9.]', '', 'g'), '')::numeric
             from public.machines m where m.id = v_case.machine_id limit 1),
           currency = coalesce(v_case.currency, 'MAD')
     where id = p_case_id and (total_amount is null or total_amount <= 0);
    select * into v_case from public.transaction_cases where id = p_case_id;
  end if;

  if coalesce(v_case.total_amount, 0) <= 0 then raise exception 'amount_required'; end if;

  select id into v_existing from public.escrow_transactions
   where transaction_case_id = p_case_id
     and status not in ('released', 'refunded', 'cancelled')
   order by created_at desc limit 1;
  if v_existing is not null then return v_existing; end if;

  if v_case.machine_id is null then raise exception 'machine_required'; end if;

  insert into public.escrow_transactions
    (machine_id, buyer_id, seller_id, amount, currency, status, transaction_case_id)
  values
    (v_case.machine_id, v_case.buyer_user_id, v_case.seller_user_id,
     v_case.total_amount, coalesce(v_case.currency, 'MAD'), 'created', p_case_id)
  returning id into v_id;

  insert into public.escrow_events (escrow_id, event_type, actor_id, payload)
  values (v_id, 'opened', v_uid, jsonb_build_object('transaction_case_id', p_case_id, 'note', 'escrow ouvert, non finance'));

  return v_id;
end;
$$;


ALTER FUNCTION "public"."open_case_escrow"("p_case_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."quote_requests_after_insert_sync_lead"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.seller_id is null then
    return new;
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'leads') then
    return new;
  end if;
  if exists (select 1 from public.leads l where l.quote_request_id = new.id) then
    return new;
  end if;

  insert into public.leads (
    seller_id, title, stage, priority, value, probability,
    next_action, assigned_to, last_contact, notes,
    contact_name, contact_phone, contact_email,
    source, source_id, machine_id, quote_request_id, buyer_user_id, transaction_case_id
  ) values (
    new.seller_id,
    left('Demande : ' || coalesce(new.machine_name, 'Machine'), 300),
    'Prospection',
    'high',
    coalesce(new.budget_max, new.budget_min, 0),
    30,
    'Repondre a la demande (inbox devis)',
    'Vendeur',
    now(),
    nullif(trim(coalesce(new.message, '')), ''),
    new.buyer_name,
    new.buyer_phone,
    new.buyer_email,
    'quote_request',
    new.id::text,
    new.machine_id,
    new.id,
    new.buyer_user_id,
    new.transaction_case_id
  );
  return new;
exception
  when others then
    raise warning 'quote_requests_sync_lead: %', sqlerrm;
    return new;
end;
$$;


ALTER FUNCTION "public"."quote_requests_after_insert_sync_lead"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."quote_requests_after_update_sync_lead_case"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.transaction_case_id is distinct from old.transaction_case_id
     and new.transaction_case_id is not null
     and exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'leads') then
    update public.leads
    set transaction_case_id = new.transaction_case_id, updated_at = now()
    where quote_request_id = new.id;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."quote_requests_after_update_sync_lead_case"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."quote_requests_antispam_fn"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_email text := lower(trim(coalesce(new.buyer_email, '')));
  v_burst int;
  v_hour  int;
begin
  if v_email = '' then
    return new;  -- pas d'e-mail : laissé aux autres contraintes
  end if;

  v_burst := (
    select count(*) from public.quote_requests q
    where lower(trim(q.buyer_email)) = v_email
      and q.created_at > now() - interval '2 minutes'
  );
  if v_burst >= 3 then
    raise exception 'Trop de demandes envoyees en peu de temps. Merci de patienter quelques minutes avant de renvoyer une demande.';
  end if;

  v_hour := (
    select count(*) from public.quote_requests q
    where lower(trim(q.buyer_email)) = v_email
      and q.created_at > now() - interval '1 hour'
  );
  if v_hour >= 15 then
    raise exception 'Limite horaire de demandes atteinte pour cette adresse e-mail. Merci de reessayer plus tard.';
  end if;

  return new;
end
$$;


ALTER FUNCTION "public"."quote_requests_antispam_fn"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_session_login"("p_user_agent" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'Non authentifié';
  end if;

  -- Org du membre (multi-org : propriétaire d'abord, puis la plus ancienne).
  v_org := (
    select organization_id
    from public.organization_members
    where user_id = v_uid
    order by (role = 'owner') desc, created_at
    limit 1
  );

  if v_org is null then
    return null; -- pas d'organisation -> pas de suivi de session
  end if;

  -- Anti-doublon : réutilise une session très récente (multi-onglets / re-fire
  -- de SIGNED_IN) au lieu d'en créer une seconde.
  v_id := (
    select id
    from public.member_sessions
    where user_id = v_uid
      and login_at > now() - interval '2 minutes'
    order by login_at desc
    limit 1
  );

  if v_id is not null then
    return v_id;
  end if;

  -- Création. « RETURNING id INTO » (plpgsql) n'est PAS ambigu avec le
  -- « SELECT ... INTO » qui crée une table — c'est ce dernier, seul, qui trompait
  -- l'éditeur Supabase, et on l'a supprimé partout au profit d'affectations (:=).
  insert into public.member_sessions (organization_id, user_id, login_at, user_agent)
  values (v_org, v_uid, now(), left(p_user_agent, 400))
  returning id into v_id;

  return v_id;
end;
$$;


ALTER FUNCTION "public"."record_session_login"("p_user_agent" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_session_logout"("p_session_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Non authentifié';
  end if;

  update public.member_sessions
     set logout_at = now()
   where id = p_session_id
     and user_id = v_uid       -- on ne ferme QUE sa propre session
     and logout_at is null;    -- idempotent : ne réécrit pas une session déjà fermée
end;
$$;


ALTER FUNCTION "public"."record_session_logout"("p_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."redeem_promo_code"("p_code" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid  uuid := auth.uid();
  v_id   uuid;
  v_days int;
  v_type text;
  v_end  date;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Non authentifié');
  end if;

  -- IMPORTANT : aucun « SELECT ... INTO » — l'éditeur SQL Supabase le confond avec un
  -- SELECT INTO <table> (« relation v_promo does not exist »). On n'utilise que des
  -- affectations par sous-requête scalaire (:=) et RETURNING ... INTO.
  -- 1) Résoudre le code (actif + non expiré).
  v_id := (
    select id from public.promo_codes
    where lower(code) = lower(btrim(p_code))
      and active = true
      and (expires_at is null or expires_at > now())
    limit 1
  );
  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'Code promo invalide ou expiré');
  end if;

  -- 2) Réserver la rédemption D'ABORD : la contrainte unique (promo_code_id,user_id)
  --    garantit « un usage par compte » SANS toucher au compteur en cas de refus.
  begin
    insert into public.promo_redemptions (promo_code_id, user_id) values (v_id, v_uid);
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'Code déjà utilisé sur ce compte');
  end;

  -- 3) Consommer 1 usage de façon ATOMIQUE (échoue si quota atteint) + lire durée/type.
  update public.promo_codes
     set uses_count = uses_count + 1
   where id = v_id and uses_count < max_uses
   returning duration_days, subscription_type into v_days, v_type;
  if not found then
    -- quota épuisé (ou course perdue) : annuler la rédemption réservée, ne rien consommer.
    delete from public.promo_redemptions where promo_code_id = v_id and user_id = v_uid;
    return jsonb_build_object('ok', false, 'error', 'Code promo épuisé');
  end if;

  -- 4) Activer l'abonnement (SECURITY DEFINER : écrit pro_clients malgré le verrou p14).
  v_end := (now() + make_interval(days => v_days))::date;
  insert into public.pro_clients (user_id, subscription_type, subscription_status,
                                  subscription_start, subscription_end, payment_method, updated_at)
  values (v_uid, v_type, 'active', now()::date, v_end, 'promo_code', now())
  on conflict (user_id) do update
    set subscription_type   = excluded.subscription_type,
        subscription_status = 'active',
        subscription_start  = excluded.subscription_start,
        subscription_end    = excluded.subscription_end,
        payment_method      = 'promo_code',
        updated_at          = now();

  return jsonb_build_object('ok', true, 'subscription_type', v_type, 'subscription_end', v_end);
end;
$$;


ALTER FUNCTION "public"."redeem_promo_code"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_org_member"("p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_org  uuid;
  v_role text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'Non authentifié');
  end if;

  -- Pas de « SELECT ... INTO » (incompatible éditeur Supabase) : affectations scalaires.
  v_org := (
    select organization_id from public.organization_members
    where user_id = p_user_id order by created_at limit 1
  );
  v_role := (
    select role from public.organization_members
    where user_id = p_user_id order by created_at limit 1
  );

  if v_org is null then
    return jsonb_build_object('ok', false, 'error', 'Membre introuvable');
  end if;
  if not public.user_in_org_admin(v_org, auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'Réservé aux administrateurs de la société');
  end if;
  if v_role = 'owner' then
    return jsonb_build_object('ok', false, 'error', 'Le propriétaire ne peut pas être retiré');
  end if;

  delete from public.organization_members where organization_id = v_org and user_id = p_user_id;
  return jsonb_build_object('ok', true);
end;
$$;


ALTER FUNCTION "public"."remove_org_member"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."revoke_transaction_partner"("p_case_id" "uuid", "p_participant_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_role text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not public._tc_can_invite(p_case_id, v_uid) then raise exception 'forbidden'; end if;

  update public.transaction_participants
     set revoked_at = now()
   where id = p_participant_id
     and case_id = p_case_id
     and role in ('mechanic', 'broker', 'carrier', 'forwarder', 'logistician', 'investor')
     and revoked_at is null
  returning id, role into v_id, v_role;

  if v_id is null then return null; end if;

  insert into public.transaction_events (case_id, actor_user_id, event_type, payload)
  values (p_case_id, v_uid, 'participant.revoked',
    jsonb_build_object('participant_id', v_id, 'role', v_role));

  return v_id;
end;
$$;


ALTER FUNCTION "public"."revoke_transaction_partner"("p_case_id" "uuid", "p_participant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_member_scope"("p_user_id" "uuid", "p_commercial" boolean, "p_tenders" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_org  uuid;
  v_role text;
begin
  -- Organisation de la CIBLE (le membre à régler).
  select organization_id, role
    into v_org, v_role
  from public.organization_members
  where user_id = p_user_id
  order by created_at
  limit 1;

  if v_org is null then
    raise exception 'Membre introuvable dans une organisation';
  end if;

  -- Seul un admin/owner de CETTE société peut régler l'affectation.
  if not public.user_in_org_admin(v_org, auth.uid()) then
    raise exception 'Réservé aux administrateurs de la société';
  end if;

  -- Le propriétaire garde toujours accès aux deux (jamais de verrouillage).
  if v_role = 'owner' then
    p_commercial := true;
    p_tenders := true;
  end if;

  -- Au moins une affectation.
  if not coalesce(p_commercial, false) and not coalesce(p_tenders, false) then
    raise exception 'Au moins une affectation (commercial ou appels d''offres) est requise';
  end if;

  insert into public.organization_member_scopes
    (organization_id, user_id, commercial, tenders, updated_at, updated_by)
  values
    (v_org, p_user_id, p_commercial, p_tenders, now(), auth.uid())
  on conflict (organization_id, user_id) do update
    set commercial = excluded.commercial,
        tenders    = excluded.tenders,
        updated_at = now(),
        updated_by = auth.uid();
end;
$$;


ALTER FUNCTION "public"."set_member_scope"("p_user_id" "uuid", "p_commercial" boolean, "p_tenders" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_org_ai_key"("p_provider" "text", "p_api_key" "text", "p_model" "text" DEFAULT NULL::"text", "p_base_url" "text" DEFAULT NULL::"text") RETURNS TABLE("organization_id" "uuid", "provider" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_provider text := lower(trim(p_provider));
begin
  if v_uid is null then
    raise exception 'Connexion requise.' using errcode = '28000';
  end if;
  if v_provider not in ('openai', 'anthropic', 'xai', 'custom') then
    raise exception 'Fournisseur non supporté.' using errcode = '22023';
  end if;
  if p_api_key is null or length(trim(p_api_key)) < 8 then
    raise exception 'Clé API invalide.' using errcode = '22023';
  end if;

  -- Société où l'appelant est owner/admin (priorité owner).
  select m.organization_id into v_org
  from public.organization_members m
  where m.user_id = v_uid and m.role in ('owner', 'admin')
  order by (m.role = 'owner') desc
  limit 1;

  if v_org is null then
    raise exception 'Seul un administrateur de la société peut connecter l''IA.' using errcode = '42501';
  end if;

  insert into public.organization_ai_credentials
    (organization_id, provider, api_key, model, base_url, configured_by, updated_at)
  values
    (v_org, v_provider, trim(p_api_key), nullif(trim(p_model), ''), nullif(trim(p_base_url), ''), v_uid, now())
  on conflict (organization_id) do update
    set provider = excluded.provider,
        api_key = excluded.api_key,
        model = excluded.model,
        base_url = excluded.base_url,
        configured_by = excluded.configured_by,
        updated_at = now();

  return query select v_org, v_provider;
end;
$$;


ALTER FUNCTION "public"."set_org_ai_key"("p_provider" "text", "p_api_key" "text", "p_model" "text", "p_base_url" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_org_member_role"("p_user_id" "uuid", "p_role" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_org  uuid;
  v_role text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'Non authentifié');
  end if;
  if p_role not in ('admin', 'manager', 'viewer') then
    return jsonb_build_object('ok', false, 'error', 'Rôle invalide');
  end if;

  -- Pas de « SELECT ... INTO » (incompatible éditeur Supabase) : affectations scalaires.
  v_org := (
    select organization_id from public.organization_members
    where user_id = p_user_id order by created_at limit 1
  );
  v_role := (
    select role from public.organization_members
    where user_id = p_user_id order by created_at limit 1
  );

  if v_org is null then
    return jsonb_build_object('ok', false, 'error', 'Membre introuvable');
  end if;
  if not public.user_in_org_admin(v_org, auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'Réservé aux administrateurs de la société');
  end if;
  if v_role = 'owner' then
    return jsonb_build_object('ok', false, 'error', 'Le rôle du propriétaire ne peut pas être changé');
  end if;

  update public.organization_members set role = p_role
  where organization_id = v_org and user_id = p_user_id;
  return jsonb_build_object('ok', true, 'role', p_role);
end;
$$;


ALTER FUNCTION "public"."set_org_member_role"("p_user_id" "uuid", "p_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_intervention_scheduled_date"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.scheduled_date = NEW.intervention_date;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_intervention_scheduled_date"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transaction_cases_after_insert_audit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'transaction_events') then
    return new;
  end if;
  insert into public.transaction_events (case_id, actor_user_id, event_type, payload)
  values (
    new.id,
    coalesce(new.created_by, new.buyer_user_id, new.seller_user_id),
    'case.created',
    jsonb_build_object('kind', new.kind, 'status', new.status, 'machine_id', new.machine_id)
  );
  return new;
exception
  when others then
    raise warning 'transaction_cases_audit: %', sqlerrm;
    return new;
end;
$$;


ALTER FUNCTION "public"."transaction_cases_after_insert_audit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transaction_cases_after_insert_link_quote_request"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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

  /* seller_id absent sur quote : lier si meme machine que le dossier (vendeur
     alors defini uniquement depuis machines cote insert — evite rollback trigger). */
  update public.quote_requests qr
  set
    transaction_case_id = new.id,
    seller_id = coalesce(qr.seller_id, new.seller_user_id),
    updated_at = now()
  where qr.id = new.primary_quote_request_id
    and qr.transaction_case_id is null
    and (
      qr.seller_id is not distinct from new.seller_user_id
      or (
        qr.seller_id is null
        and qr.machine_id is not distinct from new.machine_id
      )
    )
    and (
      new.buyer_user_id is null
      or qr.buyer_user_id is null
      or qr.buyer_user_id is not distinct from new.buyer_user_id
    );

  get diagnostics n = row_count;
  if n = 0 then
    raise exception
      'transaction_cases_link_quote_request: impossible de lier quote_request % au dossier % (introuvable, vendeur incoherent, acheteur incoherent, ou deja liee)',
      new.primary_quote_request_id,
      new.id;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."transaction_cases_after_insert_link_quote_request"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transaction_cases_after_insert_seed_participants"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

begin

  insert into public.transaction_participants (case_id, user_id, role, invited_at, accepted_at)

  select new.id, new.seller_user_id, 'seller', now(), now()

  where not exists (

    select 1 from public.transaction_participants p

    where p.case_id = new.id and p.user_id = new.seller_user_id and p.role = 'seller'

  );

  if new.buyer_user_id is not null then

    insert into public.transaction_participants (case_id, user_id, role, invited_at, accepted_at)

    select new.id, new.buyer_user_id, 'buyer', now(), now()

    where not exists (

      select 1 from public.transaction_participants p

      where p.case_id = new.id and p.user_id = new.buyer_user_id and p.role = 'buyer'

    );

  end if;

  return new;

end;

$$;


ALTER FUNCTION "public"."transaction_cases_after_insert_seed_participants"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transaction_cases_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."transaction_cases_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transitaire_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."transitaire_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transporteur_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."transporteur_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_in_org"("p_organization_id" "uuid", "p_uid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = p_uid
  );
$$;


ALTER FUNCTION "public"."user_in_org"("p_organization_id" "uuid", "p_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_in_org_admin"("p_organization_id" "uuid", "p_uid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = p_uid
      and m.role in ('owner', 'admin', 'manager')
  );
$$;


ALTER FUNCTION "public"."user_in_org_admin"("p_organization_id" "uuid", "p_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."vitrines_force_owner_fn"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is not null then
    new.user_id := auth.uid();
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."vitrines_force_owner_fn"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."ai_usage_daily" (
    "organization_id" "uuid" NOT NULL,
    "usage_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "request_count" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."ai_usage_daily" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_id" "uuid",
    "organization_id" "uuid",
    "action" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "transaction_case_id" "uuid"
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bank_offers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "bank_name" "text" DEFAULT ''::"text" NOT NULL,
    "annual_rate" numeric(5,2) DEFAULT 0,
    "max_duration_months" integer DEFAULT 84,
    "file_fees" numeric(12,2) DEFAULT 0,
    "min_amount" numeric(14,2),
    "max_amount" numeric(14,2),
    "active" boolean DEFAULT true,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."bank_offers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."broker_cases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "transaction_case_id" "uuid" NOT NULL,
    "broker_id" "uuid" NOT NULL,
    "consent_granted" boolean DEFAULT false NOT NULL,
    "consent_granted_at" timestamp with time zone,
    "case_status" "text" DEFAULT 'open'::"text",
    "commission_rate" numeric,
    "commission_amount" numeric,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."broker_cases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."broker_clients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" DEFAULT ''::"text" NOT NULL,
    "company_name" "text",
    "type" "text" DEFAULT 'Entreprise'::"text",
    "email" "text",
    "phone" "text",
    "address" "text",
    "city" "text",
    "country" "text" DEFAULT 'Maroc'::"text",
    "sector" "text",
    "rc_number" "text",
    "ice_number" "text",
    "status" "text" DEFAULT 'Prospect'::"text",
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "transaction_case_id" "uuid",
    CONSTRAINT "broker_clients_status_check" CHECK (("status" = ANY (ARRAY['Prospect'::"text", 'Actif'::"text", 'Inactif'::"text", 'Bloqué'::"text"]))),
    CONSTRAINT "broker_clients_type_check" CHECK (("type" = ANY (ARRAY['Particulier'::"text", 'Entreprise'::"text", 'TPE'::"text", 'PME'::"text", 'Grand Compte'::"text"])))
);


ALTER TABLE "public"."broker_clients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."commission_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "transaction_case_id" "uuid" NOT NULL,
    "beneficiary_id" "uuid",
    "role" "text",
    "commission_type" "text",
    "amount" numeric,
    "currency" "text" DEFAULT 'MAD'::"text",
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."commission_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contact_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "company" "text",
    "subject" "text" NOT NULL,
    "message" "text" NOT NULL,
    "service" "text",
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "ip_address" "inet",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "contact_messages_email_format_check" CHECK (("email" ~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$'::"text")),
    CONSTRAINT "contact_messages_message_len_check" CHECK ((("char_length"(TRIM(BOTH FROM "message")) >= 10) AND ("char_length"(TRIM(BOTH FROM "message")) <= 5000))),
    CONSTRAINT "contact_messages_name_len_check" CHECK ((("char_length"(TRIM(BOTH FROM "name")) >= 2) AND ("char_length"(TRIM(BOTH FROM "name")) <= 120))),
    CONSTRAINT "contact_messages_status_check" CHECK (("status" = ANY (ARRAY['new'::"text", 'read'::"text", 'replied'::"text", 'archived'::"text"]))),
    CONSTRAINT "contact_messages_subject_len_check" CHECK ((("char_length"(TRIM(BOTH FROM "subject")) >= 3) AND ("char_length"(TRIM(BOTH FROM "subject")) <= 180)))
);


ALTER TABLE "public"."contact_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."credit_applications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reference" "text",
    "client_id" "uuid",
    "client_name_snapshot" "text",
    "equipment_label" "text" DEFAULT ''::"text" NOT NULL,
    "equipment_value" numeric(14,2),
    "requested_amount" numeric(14,2),
    "down_payment" numeric(14,2) DEFAULT 0,
    "duration_months" integer DEFAULT 60,
    "interest_rate" numeric(5,2),
    "monthly_payment" numeric(12,2),
    "bank_name" "text",
    "application_date" "date" DEFAULT CURRENT_DATE,
    "expected_decision_date" "date",
    "decision_date" "date",
    "disbursement_date" "date",
    "status" "text" DEFAULT 'En cours'::"text",
    "commission_rate" numeric(5,2) DEFAULT 1.50,
    "commission_amount" numeric(12,2),
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "transaction_case_id" "uuid",
    CONSTRAINT "credit_applications_status_check" CHECK (("status" = ANY (ARRAY['Brouillon'::"text", 'En cours'::"text", 'Approuvé'::"text", 'Refusé'::"text", 'Décaissé'::"text", 'Annulé'::"text"])))
);


ALTER TABLE "public"."credit_applications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customs_cases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "transaction_case_id" "uuid" NOT NULL,
    "forwarder_id" "uuid",
    "origin_country" "text",
    "destination_country" "text",
    "customs_status" "text" DEFAULT 'opened'::"text",
    "required_documents" "jsonb" DEFAULT '[]'::"jsonb",
    "missing_documents" "jsonb" DEFAULT '[]'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."customs_cases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customs_declarations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reference" "text",
    "status" "text" DEFAULT 'En préparation'::"text",
    "clearance_type" "text" DEFAULT 'Import'::"text",
    "customs_office" "text",
    "client_name" "text",
    "cargo_summary" "text",
    "declared_value_mad" numeric(14,2),
    "submitted_at" timestamp with time zone,
    "expected_clearance_date" "date",
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "transaction_case_id" "uuid",
    CONSTRAINT "customs_declarations_clearance_type_check" CHECK (("clearance_type" = ANY (ARRAY['Import'::"text", 'Export'::"text", 'Transit'::"text"]))),
    CONSTRAINT "customs_declarations_status_check" CHECK (("status" = ANY (ARRAY['En préparation'::"text", 'Soumise'::"text", 'En contrôle douanier'::"text", 'Liquidée'::"text", 'Bloquée'::"text", 'Annulée'::"text"])))
);


ALTER TABLE "public"."customs_declarations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deliveries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "equipment_id" "uuid",
    "equipment_label" "text",
    "driver_id" "uuid",
    "vehicle_id" "uuid",
    "route_id" "uuid",
    "origin_address" "text",
    "origin_lat" numeric(10,6),
    "origin_lng" numeric(10,6),
    "destination_address" "text",
    "destination_lat" numeric(10,6),
    "destination_lng" numeric(10,6),
    "pickup_date" timestamp with time zone DEFAULT "now"(),
    "expected_delivery_date" timestamp with time zone,
    "actual_delivery_date" timestamp with time zone,
    "distance_km" numeric(10,2),
    "transport_cost" numeric(12,2),
    "status" "text" DEFAULT 'Planifiée'::"text",
    "priority" "text" DEFAULT 'Moyenne'::"text",
    "client_name" "text",
    "client_phone" "text",
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "transaction_case_id" "uuid",
    "distance_loaded_km" numeric(10,2),
    "distance_empty_km" numeric(10,2),
    "cost_per_km" numeric(10,2),
    CONSTRAINT "deliveries_priority_check" CHECK (("priority" = ANY (ARRAY['Basse'::"text", 'Moyenne'::"text", 'Haute'::"text", 'Urgente'::"text"]))),
    CONSTRAINT "deliveries_status_check" CHECK (("status" = ANY (ARRAY['Planifiée'::"text", 'En cours'::"text", 'Livrée'::"text", 'Retardée'::"text", 'Annulée'::"text"])))
);


ALTER TABLE "public"."deliveries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."devis" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "devisNumber" "text",
    "date" "text",
    "clientName" "text",
    "clientCompany" "text",
    "clientEmail" "text",
    "clientPhone" "text",
    "clientAddress" "text",
    "items" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "subtotal" numeric,
    "taxRate" numeric,
    "taxAmount" numeric,
    "total" numeric,
    "notes" "text",
    "validUntil" "text",
    "status" "text" DEFAULT 'draft'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."devis" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "name" "text",
    "type" "text",
    "category" "text",
    "file_url" "text",
    "file_size" bigint,
    "uploaded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "uploaded_by" "text",
    "description" "text",
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "status" "text" DEFAULT 'active'::"text"
);


ALTER TABLE "public"."documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."drivers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" DEFAULT ''::"text" NOT NULL,
    "phone" "text",
    "email" "text",
    "license_number" "text",
    "license_expiry" "date",
    "availability_status" "text" DEFAULT 'Disponible'::"text",
    "current_lat" numeric(10,6),
    "current_lng" numeric(10,6),
    "last_location_update" timestamp with time zone,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "drivers_availability_status_check" CHECK (("availability_status" = ANY (ARRAY['Disponible'::"text", 'En mission'::"text", 'En congé'::"text", 'Indisponible'::"text"])))
);


ALTER TABLE "public"."drivers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."enterprise_dashboard_configs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."enterprise_dashboard_configs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."escrow_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "escrow_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "actor_id" "uuid",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."escrow_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."escrow_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "machine_id" "uuid" NOT NULL,
    "buyer_id" "uuid" NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "amount" numeric(14,2) NOT NULL,
    "currency" "text" DEFAULT 'EUR'::"text" NOT NULL,
    "status" "text" DEFAULT 'created'::"text" NOT NULL,
    "inspection_report_id" "uuid",
    "provider" "text",
    "provider_ref" "text",
    "release_conditions" "jsonb" DEFAULT '{"delivery": true, "inspection": true}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "transaction_case_id" "uuid",
    CONSTRAINT "escrow_transactions_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "escrow_transactions_status_check" CHECK (("status" = ANY (ARRAY['created'::"text", 'funded'::"text", 'inspection_passed'::"text", 'delivered'::"text", 'released'::"text", 'refunded'::"text", 'disputed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."escrow_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."financing_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "transaction_case_id" "uuid" NOT NULL,
    "buyer_id" "uuid",
    "broker_id" "uuid",
    "requested_amount" numeric,
    "currency" "text" DEFAULT 'MAD'::"text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "documents_status" "text",
    "scoring_status" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."financing_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."freight_containers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "container_number" "text" DEFAULT ''::"text" NOT NULL,
    "status" "text" DEFAULT 'En mer'::"text",
    "lat" numeric(10,6),
    "lng" numeric(10,6),
    "vessel_name" "text",
    "voyage_ref" "text",
    "last_port" "text",
    "next_port" "text",
    "eta" timestamp with time zone,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "transaction_case_id" "uuid",
    "arrival_date" "date",
    "free_days" integer DEFAULT 7,
    "demurrage_rate_per_day" numeric(12,2) DEFAULT 0,
    "returned_date" "date",
    CONSTRAINT "freight_containers_status_check" CHECK (("status" = ANY (ARRAY['En mer'::"text", 'Transbordement'::"text", 'À quai'::"text", 'Douane'::"text", 'Livré'::"text", 'Retard'::"text"])))
);


ALTER TABLE "public"."freight_containers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."freight_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "doc_type" "text" DEFAULT 'Autre'::"text",
    "status" "text" DEFAULT 'En attente'::"text",
    "priority" "text" DEFAULT 'Normal'::"text",
    "due_date" "date",
    "linked_container_number" "text",
    "linked_declaration_ref" "text",
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "freight_documents_doc_type_check" CHECK (("doc_type" = ANY (ARRAY['Connaissement'::"text", 'Facture'::"text", 'Liste colisage'::"text", 'Certificat origine'::"text", 'Autre'::"text"]))),
    CONSTRAINT "freight_documents_priority_check" CHECK (("priority" = ANY (ARRAY['Normal'::"text", 'Urgent'::"text"]))),
    CONSTRAINT "freight_documents_status_check" CHECK (("status" = ANY (ARRAY['Brouillon'::"text", 'En attente'::"text", 'Validé'::"text", 'Rejeté'::"text", 'Expiré'::"text"])))
);


ALTER TABLE "public"."freight_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."freight_monthly_volumes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "period_month" "date" NOT NULL,
    "direction" "text" NOT NULL,
    "teu_count" numeric(12,2) DEFAULT 0,
    "value_mad" numeric(14,2) DEFAULT 0,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "freight_monthly_volumes_direction_check" CHECK (("direction" = ANY (ARRAY['Import'::"text", 'Export'::"text"])))
);


ALTER TABLE "public"."freight_monthly_volumes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inspection_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "inspection_request_id" "uuid" NOT NULL,
    "transaction_case_id" "uuid" NOT NULL,
    "mechanic_id" "uuid",
    "condition_score" integer,
    "summary" "text",
    "photos" "jsonb" DEFAULT '[]'::"jsonb",
    "recommendations" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."inspection_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inspection_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "transaction_case_id" "uuid" NOT NULL,
    "machine_id" "uuid",
    "requested_by" "uuid",
    "assigned_to" "uuid",
    "status" "text" DEFAULT 'requested'::"text" NOT NULL,
    "scheduled_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."inspection_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."insurance_policies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "policy_number" "text",
    "client_id" "uuid",
    "client_name_snapshot" "text",
    "equipment_label" "text",
    "insurer_name" "text" DEFAULT ''::"text" NOT NULL,
    "policy_type" "text" DEFAULT 'Tous risques'::"text",
    "insured_value" numeric(14,2),
    "annual_premium" numeric(12,2),
    "payment_frequency" "text" DEFAULT 'Annuel'::"text",
    "start_date" "date" DEFAULT CURRENT_DATE,
    "end_date" "date",
    "status" "text" DEFAULT 'Active'::"text",
    "commission_rate" numeric(5,2) DEFAULT 12.00,
    "commission_amount" numeric(12,2),
    "deductible" numeric(12,2),
    "claim_count" integer DEFAULT 0,
    "auto_renewal" boolean DEFAULT true,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "transaction_case_id" "uuid",
    CONSTRAINT "insurance_policies_payment_frequency_check" CHECK (("payment_frequency" = ANY (ARRAY['Mensuel'::"text", 'Trimestriel'::"text", 'Semestriel'::"text", 'Annuel'::"text"]))),
    CONSTRAINT "insurance_policies_policy_type_check" CHECK (("policy_type" = ANY (ARRAY['Responsabilité Civile'::"text", 'Tous risques'::"text", 'Bris de machine'::"text", 'Multirisques chantier'::"text", 'Transport marchandises'::"text", 'Flotte automobile'::"text", 'Multirisques professionnelle'::"text"]))),
    CONSTRAINT "insurance_policies_status_check" CHECK (("status" = ANY (ARRAY['Devis'::"text", 'En cours'::"text", 'Active'::"text", 'Expirée'::"text", 'Résiliée'::"text", 'Suspendue'::"text"])))
);


ALTER TABLE "public"."insurance_policies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."interventions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "equipment_id" "uuid",
    "type" "text" DEFAULT 'Maintenance préventive'::"text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'En attente'::"text" NOT NULL,
    "scheduled_date" timestamp with time zone,
    "completed_date" timestamp with time zone,
    "technician_name" "text",
    "cost" numeric(10,2),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "name" "text",
    "equipment_name" "text",
    "technician_id" "uuid",
    "intervention_date" timestamp with time zone,
    "priority" "text" DEFAULT 'Moyenne'::"text",
    "estimated_duration" integer,
    "actual_duration" integer,
    "notes" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "transaction_case_id" "uuid"
);


ALTER TABLE "public"."interventions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "part_name" "text",
    "part_number" "text",
    "category" "text",
    "current_stock" integer DEFAULT 0,
    "minimum_stock" integer DEFAULT 0,
    "maximum_stock" integer,
    "unit_price" numeric(10,2) DEFAULT 0,
    "supplier" "text",
    "supplier_email" "text",
    "location" "text",
    "last_restock_date" timestamp with time zone,
    "next_restock_date" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid"
);


ALTER TABLE "public"."inventory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."investment_opportunities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reference" "text",
    "equipment_label" "text" DEFAULT ''::"text" NOT NULL,
    "category" "text",
    "brand" "text",
    "model" "text",
    "year" integer,
    "source" "text" DEFAULT 'Marché secondaire'::"text",
    "source_url" "text",
    "asking_price" numeric(14,2),
    "estimated_market_value" numeric(14,2),
    "estimated_acquisition_costs" numeric(12,2) DEFAULT 0,
    "expected_monthly_revenue" numeric(12,2),
    "expected_monthly_costs" numeric(12,2) DEFAULT 0,
    "expected_holding_years" numeric(4,1) DEFAULT 5,
    "expected_resale_value" numeric(14,2),
    "expected_roi_percent" numeric(6,2),
    "payback_months" integer,
    "risk_score" integer DEFAULT 5,
    "risk_factors" "text",
    "recommendation" "text" DEFAULT 'À étudier'::"text",
    "status" "text" DEFAULT 'Active'::"text",
    "contact_name" "text",
    "contact_phone" "text",
    "expiry_date" "date",
    "converted_investment_id" "uuid",
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "investment_opportunities_recommendation_check" CHECK (("recommendation" = ANY (ARRAY['Acheter'::"text", 'Étudier'::"text", 'Suivre'::"text", 'Passer'::"text", 'À étudier'::"text"]))),
    CONSTRAINT "investment_opportunities_risk_score_check" CHECK ((("risk_score" >= 1) AND ("risk_score" <= 10))),
    CONSTRAINT "investment_opportunities_source_check" CHECK (("source" = ANY (ARRAY['Annonce Minegrid'::"text", 'Marché secondaire'::"text", 'Vente directe'::"text", 'Encan / Enchères'::"text", 'Concessionnaire'::"text", 'Reprise client'::"text", 'Autre'::"text"]))),
    CONSTRAINT "investment_opportunities_status_check" CHECK (("status" = ANY (ARRAY['Active'::"text", 'En négociation'::"text", 'Achetée'::"text", 'Refusée'::"text", 'Expirée'::"text", 'Convertie'::"text"])))
);


ALTER TABLE "public"."investment_opportunities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."investments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reference" "text",
    "equipment_label" "text" DEFAULT ''::"text" NOT NULL,
    "category" "text",
    "brand" "text",
    "model" "text",
    "year" integer,
    "serial_number" "text",
    "acquisition_date" "date" DEFAULT CURRENT_DATE,
    "acquisition_price" numeric(14,2),
    "financing_type" "text" DEFAULT 'Cash'::"text",
    "monthly_financing_cost" numeric(12,2) DEFAULT 0,
    "current_market_value" numeric(14,2),
    "expected_lifespan_years" integer DEFAULT 8,
    "residual_value" numeric(14,2),
    "current_revenue_monthly" numeric(12,2) DEFAULT 0,
    "total_revenue_to_date" numeric(14,2) DEFAULT 0,
    "maintenance_cost_to_date" numeric(12,2) DEFAULT 0,
    "location_count" integer DEFAULT 0,
    "status" "text" DEFAULT 'Détenu'::"text",
    "exit_strategy" "text" DEFAULT 'Conserver'::"text",
    "target_exit_date" "date",
    "target_exit_price" numeric(14,2),
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "target_monthly_revenue" numeric(12,2),
    "expected_yield_percent" numeric(6,2),
    CONSTRAINT "investments_category_check" CHECK (("category" = ANY (ARRAY['Pelle hydraulique'::"text", 'Bulldozer'::"text", 'Chargeuse'::"text", 'Camion-benne'::"text", 'Concasseur'::"text", 'Foreuse'::"text", 'Tombereau'::"text", 'Niveleuse'::"text", 'Compacteur'::"text", 'Grue'::"text", 'Convoyeur'::"text", 'Autre engin'::"text"]))),
    CONSTRAINT "investments_exit_strategy_check" CHECK (("exit_strategy" = ANY (ARRAY['Conserver'::"text", 'Revendre court terme'::"text", 'Revendre moyen terme'::"text", 'Démanteler / Pièces'::"text"]))),
    CONSTRAINT "investments_financing_type_check" CHECK (("financing_type" = ANY (ARRAY['Cash'::"text", 'Crédit'::"text", 'Crédit-bail'::"text", 'LOA'::"text", 'Mixte'::"text"]))),
    CONSTRAINT "investments_status_check" CHECK (("status" = ANY (ARRAY['Détenu'::"text", 'En location'::"text", 'En maintenance'::"text", 'En cession'::"text", 'Cédé'::"text", 'Hors service'::"text"])))
);


ALTER TABLE "public"."investments" OWNER TO "postgres";


COMMENT ON COLUMN "public"."investments"."target_monthly_revenue" IS 'Revenu/loyer mensuel ATTENDU (budget) pour cet actif, en MAD.';



COMMENT ON COLUMN "public"."investments"."expected_yield_percent" IS 'Rendement annuel cible en % du prix d''acquisition (fallback si target_monthly_revenue vide).';



CREATE TABLE IF NOT EXISTS "public"."leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "stage" "text" DEFAULT 'Prospection'::"text" NOT NULL,
    "priority" "text" DEFAULT 'medium'::"text" NOT NULL,
    "value" numeric DEFAULT 0 NOT NULL,
    "probability" integer DEFAULT 10 NOT NULL,
    "next_action" "text",
    "assigned_to" "text",
    "last_contact" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes" "text",
    "contact_name" "text",
    "contact_company" "text",
    "contact_phone" "text",
    "contact_email" "text",
    "source" "text" DEFAULT 'manual'::"text",
    "source_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "transaction_case_id" "uuid",
    "machine_id" "uuid",
    "quote_request_id" "uuid",
    "buyer_user_id" "uuid",
    "contact_role" "text",
    "organization_id" "uuid",
    "assigned_to_user_id" "uuid"
);


ALTER TABLE "public"."leads" OWNER TO "postgres";


COMMENT ON COLUMN "public"."leads"."contact_role" IS 'Rôle du contact pour les leads issus du Global Monitor (AO) : winner (lauréat) | buyer (maître d''ouvrage). NULL sinon.';



CREATE TABLE IF NOT EXISTS "public"."logistics_route_tracking" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "route_ref" "text",
    "vehicle_label" "text",
    "status" "text" DEFAULT 'Planifié'::"text",
    "origin_lat" numeric(10,6),
    "origin_lng" numeric(10,6),
    "dest_lat" numeric(10,6),
    "dest_lng" numeric(10,6),
    "current_lat" numeric(10,6),
    "current_lng" numeric(10,6),
    "origin_label" "text",
    "dest_label" "text",
    "cargo_summary" "text",
    "eta" timestamp with time zone,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "transaction_case_id" "uuid",
    "distance_km" numeric(10,1) DEFAULT 0,
    "transport_cost_mad" numeric(12,2) DEFAULT 0,
    "warehousing_cost_mad" numeric(12,2) DEFAULT 0,
    "invoiced_amount_mad" numeric(12,2) DEFAULT 0,
    CONSTRAINT "logistics_route_tracking_status_check" CHECK (("status" = ANY (ARRAY['Planifié'::"text", 'En route'::"text", 'Livré'::"text", 'Retard'::"text", 'Annulé'::"text"])))
);


ALTER TABLE "public"."logistics_route_tracking" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."logistics_scm_kpis_monthly" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "period_month" "date" NOT NULL,
    "on_time_pct" numeric(5,2),
    "fill_rate_pct" numeric(5,2),
    "avg_lead_time_days" numeric(5,2),
    "incidents" integer DEFAULT 0,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."logistics_scm_kpis_monthly" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."logistics_stock_alerts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sku_label" "text" DEFAULT ''::"text" NOT NULL,
    "warehouse_name" "text",
    "alert_type" "text" DEFAULT 'Seuil bas'::"text" NOT NULL,
    "current_qty" numeric(12,2),
    "target_qty" numeric(12,2),
    "priority" "text" DEFAULT 'Normal'::"text",
    "status" "text" DEFAULT 'Ouvert'::"text",
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "logistics_stock_alerts_alert_type_check" CHECK (("alert_type" = ANY (ARRAY['Rupture'::"text", 'Excédent'::"text", 'Seuil bas'::"text"]))),
    CONSTRAINT "logistics_stock_alerts_priority_check" CHECK (("priority" = ANY (ARRAY['Normal'::"text", 'Urgent'::"text"]))),
    CONSTRAINT "logistics_stock_alerts_status_check" CHECK (("status" = ANY (ARRAY['Ouvert'::"text", 'En traitement'::"text", 'Clôturé'::"text"])))
);


ALTER TABLE "public"."logistics_stock_alerts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."logistics_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "transaction_case_id" "uuid" NOT NULL,
    "logistician_id" "uuid",
    "task_type" "text" NOT NULL,
    "location" "text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "scheduled_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."logistics_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."logistics_warehouses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" DEFAULT ''::"text" NOT NULL,
    "city" "text",
    "zone" "text",
    "capacity_pallets" integer DEFAULT 0 NOT NULL,
    "used_pallets" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'Opérationnel'::"text",
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "logistics_warehouses_capacity_pallets_check" CHECK (("capacity_pallets" >= 0)),
    CONSTRAINT "logistics_warehouses_status_check" CHECK (("status" = ANY (ARRAY['Opérationnel'::"text", 'Surchargé'::"text", 'Maintenance'::"text", 'Fermé'::"text"]))),
    CONSTRAINT "logistics_warehouses_used_pallets_check" CHECK (("used_pallets" >= 0))
);


ALTER TABLE "public"."logistics_warehouses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."machine_views" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "machine_id" "uuid" NOT NULL,
    "viewer_id" "uuid",
    "ip_address" "text",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."machine_views" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."machines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "brand" "text",
    "model" "text",
    "category" "text",
    "year" integer,
    "price" "text",
    "condition" "text" DEFAULT 'used'::"text",
    "description" "text",
    "specifications" "jsonb" DEFAULT '{}'::"jsonb",
    "images" "text"[] DEFAULT '{}'::"text"[],
    "photos" "text"[] DEFAULT '{}'::"text"[],
    "sellerid" "uuid",
    "seller_id" "uuid",
    "user_id" "uuid",
    "owner_id" "uuid",
    "status" "text" DEFAULT 'available'::"text",
    "boosted" boolean DEFAULT false,
    "boosted_at" timestamp with time zone,
    "source" "text",
    "source_url" "text",
    "source_id" "text",
    "country" "text",
    "region" "text",
    "latitude" double precision,
    "longitude" double precision,
    "address" "text",
    "city" "text",
    "postal_code" "text",
    "total_hours" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "machines_status_check" CHECK (("status" = ANY (ARRAY['available'::"text", 'sold'::"text", 'reserved'::"text"])))
);


ALTER TABLE "public"."machines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."member_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "login_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "logout_at" timestamp with time zone,
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."member_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_ai_credentials" (
    "organization_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "api_key" "text" NOT NULL,
    "model" "text",
    "base_url" "text",
    "configured_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "organization_ai_credentials_provider_check" CHECK (("provider" = ANY (ARRAY['openai'::"text", 'anthropic'::"text", 'xai'::"text", 'custom'::"text"])))
);


ALTER TABLE "public"."organization_ai_credentials" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_member_scopes" (
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "commercial" boolean DEFAULT true NOT NULL,
    "tenders" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid"
);


ALTER TABLE "public"."organization_member_scopes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "organization_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text", 'member'::"text", 'viewer'::"text"])))
);


ALTER TABLE "public"."organization_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "transaction_case_id" "uuid" NOT NULL,
    "payer_id" "uuid",
    "payee_id" "uuid",
    "amount" numeric NOT NULL,
    "currency" "text" DEFAULT 'MAD'::"text",
    "payment_type" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "escrow_transaction_id" "uuid"
);


ALTER TABLE "public"."payment_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."planning_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "title" "text",
    "description" "text",
    "startDate" "text",
    "endDate" "text",
    "type" "text",
    "status" "text",
    "priority" "text",
    "clientName" "text",
    "clientPhone" "text",
    "clientEmail" "text",
    "location" "text",
    "assignedTo" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."planning_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."price_observations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "machine_type" "text",
    "brand" "text",
    "model" "text",
    "year" integer,
    "hours_meter" integer,
    "country" "text",
    "condition" "text",
    "price_amount" numeric(14,2) NOT NULL,
    "price_currency" "text" DEFAULT 'EUR'::"text" NOT NULL,
    "source" "text" NOT NULL,
    "observed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "escrow_transaction_id" "uuid",
    CONSTRAINT "price_observations_condition_check" CHECK (("condition" = ANY (ARRAY['new'::"text", 'used'::"text", 'refurbished'::"text"]))),
    CONSTRAINT "price_observations_price_amount_check" CHECK (("price_amount" >= (0)::numeric)),
    CONSTRAINT "price_observations_year_check" CHECK ((("year" >= 1950) AND ("year" <= 2100)))
);


ALTER TABLE "public"."price_observations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pro_clients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "company_name" "text" DEFAULT 'Minegrid Client'::"text" NOT NULL,
    "subscription_type" "text" NOT NULL,
    "subscription_status" "text" NOT NULL,
    "subscription_start" timestamp with time zone DEFAULT "now"() NOT NULL,
    "subscription_end" timestamp with time zone,
    "max_users" integer DEFAULT 1 NOT NULL,
    "promo_code_used" "text",
    "payment_method" "text",
    "payment_amount" numeric(12,2),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pro_clients_subscription_status_check" CHECK (("subscription_status" = ANY (ARRAY['active'::"text", 'trialing'::"text", 'paid'::"text", 'inactive'::"text", 'suspended'::"text"]))),
    CONSTRAINT "pro_clients_subscription_type_check" CHECK (("subscription_type" = ANY (ARRAY['premium'::"text", 'pro'::"text", 'enterprise'::"text", 'entreprise'::"text"])))
);


ALTER TABLE "public"."pro_clients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."processed_stripe_events" (
    "event_id" "text" NOT NULL,
    "event_type" "text",
    "processed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."processed_stripe_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."promo_codes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "subscription_type" "text" DEFAULT 'enterprise'::"text" NOT NULL,
    "duration_days" integer DEFAULT 30 NOT NULL,
    "max_uses" integer DEFAULT 1 NOT NULL,
    "uses_count" integer DEFAULT 0 NOT NULL,
    "expires_at" timestamp with time zone,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."promo_codes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."promo_redemptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "promo_code_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "redeemed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."promo_redemptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quote_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "machine_id" "uuid" NOT NULL,
    "machine_name" "text" NOT NULL,
    "brand" "text",
    "seller_id" "uuid",
    "buyer_name" "text" NOT NULL,
    "buyer_email" "text" NOT NULL,
    "buyer_phone" "text",
    "country" "text",
    "budget_min" numeric,
    "budget_max" numeric,
    "need_by_date" "date",
    "message" "text",
    "source" "text" DEFAULT 'machine_detail'::"text",
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "buyer_user_id" "uuid",
    "transaction_case_id" "uuid",
    CONSTRAINT "quote_requests_status_check" CHECK (("status" = ANY (ARRAY['new'::"text", 'contacted'::"text", 'qualified'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."quote_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rental_invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rental_id" "uuid",
    "equipment_id" "uuid",
    "client_name" "text",
    "invoice_number" "text",
    "amount_due" numeric(12,2) DEFAULT 0 NOT NULL,
    "amount_paid" numeric(12,2) DEFAULT 0 NOT NULL,
    "due_date" "date",
    "status" "text" DEFAULT 'Émise'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "source" "text"
);


ALTER TABLE "public"."rental_invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rentals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "equipment_id" "uuid",
    "client_id" "uuid",
    "start_date" timestamp with time zone NOT NULL,
    "end_date" timestamp with time zone NOT NULL,
    "total_price" numeric(12,2) DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'Confirmée'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "transaction_case_id" "uuid"
);


ALTER TABLE "public"."rentals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."repairs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "equipment_id" "uuid",
    "equipment_name" "text",
    "technician_id" "uuid",
    "technician_name" "text",
    "status" "text" DEFAULT 'En attente'::"text",
    "problem_description" "text",
    "solution_description" "text",
    "estimated_cost" numeric(10,2),
    "actual_cost" numeric(10,2),
    "estimated_duration" integer,
    "actual_duration" integer,
    "start_date" timestamp with time zone,
    "completion_date" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "transaction_case_id" "uuid"
);


ALTER TABLE "public"."repairs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "inventory_id" "uuid",
    "quantity" integer,
    "unit_price" numeric(10,2),
    "total_price" numeric(10,2),
    "supplier" "text",
    "order_date" timestamp with time zone DEFAULT "now"(),
    "expected_delivery_date" timestamp with time zone,
    "actual_delivery_date" timestamp with time zone,
    "status" "text" DEFAULT 'En attente'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid"
);


ALTER TABLE "public"."stock_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text",
    "description" "text",
    "technician_id" "uuid",
    "intervention_id" "uuid",
    "repair_id" "uuid",
    "status" "text" DEFAULT 'À faire'::"text",
    "priority" "text" DEFAULT 'Moyenne'::"text",
    "estimated_hours" integer DEFAULT 0,
    "actual_hours" integer,
    "start_date" timestamp with time zone,
    "due_date" timestamp with time zone,
    "completed_date" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid"
);


ALTER TABLE "public"."tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."technicians" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "name" "text",
    "specialization" "text",
    "phone" "text",
    "email" "text",
    "max_workload_hours" integer DEFAULT 40,
    "current_workload_hours" integer DEFAULT 0,
    "efficiency_rating" numeric(3,2) DEFAULT 1.00,
    "availability_status" "text" DEFAULT 'Disponible'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid"
);


ALTER TABLE "public"."technicians" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenders_ai_usage_daily" (
    "user_id" "uuid" NOT NULL,
    "usage_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "request_count" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."tenders_ai_usage_daily" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transaction_cases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "kind" "text" DEFAULT 'sale'::"text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "machine_id" "uuid",
    "seller_user_id" "uuid" NOT NULL,
    "buyer_user_id" "uuid",
    "primary_quote_request_id" "uuid",
    "primary_lead_id" "uuid",
    "title" "text",
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "closed_at" timestamp with time zone,
    "organization_id" "uuid",
    "stage" "text" DEFAULT 'discovery'::"text",
    "priority" "text" DEFAULT 'medium'::"text",
    "total_amount" numeric,
    "currency" "text" DEFAULT 'MAD'::"text",
    CONSTRAINT "transaction_cases_kind_check" CHECK (("kind" = ANY (ARRAY['sale'::"text", 'rental'::"text", 'financing'::"text", 'other'::"text"]))),
    CONSTRAINT "transaction_cases_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'qualified'::"text", 'negotiation'::"text", 'contract'::"text", 'payment'::"text", 'logistics'::"text", 'customs'::"text", 'delivery'::"text", 'closed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."transaction_cases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transaction_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "transaction_case_id" "uuid" NOT NULL,
    "uploaded_by" "uuid",
    "document_type" "text" DEFAULT 'other'::"text" NOT NULL,
    "title" "text",
    "file_path" "text" NOT NULL,
    "storage_bucket" "text" DEFAULT 'transaction-documents'::"text" NOT NULL,
    "visibility_scope" "text" DEFAULT 'participants'::"text" NOT NULL,
    "allowed_roles" "text"[] DEFAULT ARRAY['seller'::"text", 'buyer'::"text"],
    "requires_consent" boolean DEFAULT false NOT NULL,
    "consent_status" "text" DEFAULT 'pending'::"text",
    "organization_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "transaction_documents_consent_status_check" CHECK (("consent_status" = ANY (ARRAY['pending'::"text", 'granted'::"text", 'denied'::"text", 'revoked'::"text"]))),
    CONSTRAINT "transaction_documents_visibility_scope_check" CHECK (("visibility_scope" = ANY (ARRAY['seller_buyer'::"text", 'participants'::"text", 'broker_only'::"text", 'forwarder_only'::"text", 'internal'::"text"])))
);


ALTER TABLE "public"."transaction_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transaction_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "case_id" "uuid" NOT NULL,
    "actor_user_id" "uuid",
    "event_type" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "description" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."transaction_events" OWNER TO "postgres";


COMMENT ON COLUMN "public"."transaction_events"."payload" IS 'Donnees brutes legacy ; preferer metadata lorsque pertinent.';



CREATE TABLE IF NOT EXISTS "public"."transaction_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "transaction_case_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "message" "text" NOT NULL,
    "visibility_scope" "text" DEFAULT 'participants'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "transaction_messages_visibility_scope_check" CHECK (("visibility_scope" = ANY (ARRAY['participants'::"text", 'seller_buyer'::"text", 'internal'::"text"])))
);


ALTER TABLE "public"."transaction_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transaction_participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "case_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "invited_by" "uuid",
    "invited_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "accepted_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "scope" "jsonb" DEFAULT '{}'::"jsonb",
    "organization_id" "uuid",
    "permissions" "jsonb" DEFAULT '{}'::"jsonb",
    "status" "text" DEFAULT 'active'::"text",
    "participant_status" "text" DEFAULT 'active'::"text",
    CONSTRAINT "transaction_participants_role_check" CHECK (("role" = ANY (ARRAY['seller'::"text", 'buyer'::"text", 'broker'::"text", 'mechanic'::"text", 'carrier'::"text", 'forwarder'::"text", 'logistician'::"text", 'investor'::"text", 'admin_delegate'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."transaction_participants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transaction_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "transaction_case_id" "uuid" NOT NULL,
    "assigned_to" "uuid",
    "role" "text",
    "title" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "due_date" timestamp with time zone,
    "priority" "text" DEFAULT 'medium'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."transaction_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transport_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "transaction_case_id" "uuid" NOT NULL,
    "transporter_id" "uuid",
    "pickup_location" "text",
    "delivery_location" "text",
    "machine_weight" numeric,
    "machine_dimensions" "text",
    "status" "text" DEFAULT 'requested'::"text" NOT NULL,
    "eta" timestamp with time zone,
    "proof_of_delivery_path" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."transport_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transport_routes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" DEFAULT ''::"text" NOT NULL,
    "origin_city" "text",
    "origin_lat" numeric(10,6),
    "origin_lng" numeric(10,6),
    "destination_city" "text",
    "destination_lat" numeric(10,6),
    "destination_lng" numeric(10,6),
    "distance_km" numeric(10,2),
    "average_duration_hours" numeric(6,2),
    "base_cost" numeric(12,2),
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."transport_routes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "email" "text" NOT NULL,
    "name" "text",
    "role" "text" DEFAULT 'viewer'::"text" NOT NULL,
    "token" "text",
    "invited_by" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "expires_at" timestamp with time zone,
    "accepted_at" timestamp with time zone,
    "accepted_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_invitations_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'manager'::"text", 'viewer'::"text"]))),
    CONSTRAINT "user_invitations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'cancelled'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."user_invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plate_number" "text" DEFAULT ''::"text" NOT NULL,
    "type" "text" DEFAULT 'Camion-plateau'::"text",
    "brand" "text",
    "model" "text",
    "capacity_tons" numeric(10,2),
    "status" "text" DEFAULT 'Disponible'::"text",
    "current_driver_id" "uuid",
    "current_lat" numeric(10,6),
    "current_lng" numeric(10,6),
    "last_location_update" timestamp with time zone,
    "fuel_level" integer,
    "next_maintenance_date" "date",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "vehicles_fuel_level_check" CHECK ((("fuel_level" >= 0) AND ("fuel_level" <= 100))),
    CONSTRAINT "vehicles_status_check" CHECK (("status" = ANY (ARRAY['Disponible'::"text", 'En mission'::"text", 'Maintenance'::"text", 'Hors service'::"text"]))),
    CONSTRAINT "vehicles_type_check" CHECK (("type" = ANY (ARRAY['Camion-plateau'::"text", 'Porte-engins'::"text", 'Semi-remorque'::"text", 'Utilitaire'::"text", 'Convoi exceptionnel'::"text"])))
);


ALTER TABLE "public"."vehicles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vitrines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "company_name" "text",
    "logo_url" "text",
    "description" "text",
    "services" "text"[] DEFAULT '{}'::"text"[],
    "address" "text",
    "phone" "text",
    "email" "text",
    "website" "text",
    "working_hours" "text",
    "specializations" "text"[] DEFAULT '{}'::"text"[],
    "certifications" "text"[] DEFAULT '{}'::"text"[],
    "business_type" "text" DEFAULT 'both'::"text",
    "founding_year" integer,
    "intervention_zone" "text",
    "equipment_count" integer DEFAULT 0,
    "projects_delivered" integer DEFAULT 0,
    "whatsapp" "text",
    "emergency_phone" "text",
    "delivery_radius" integer,
    "min_rental_duration" integer,
    "deposit_required" boolean DEFAULT false,
    "fuel_included" boolean DEFAULT false,
    "driver_included" boolean DEFAULT false,
    "maintenance_included" boolean DEFAULT false,
    "warranty_months" integer,
    "delivery_time_weeks" integer,
    "transport_included" boolean DEFAULT false,
    "installation_included" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."vitrines" OWNER TO "postgres";


ALTER TABLE ONLY "public"."ai_usage_daily"
    ADD CONSTRAINT "ai_usage_daily_pkey" PRIMARY KEY ("organization_id", "usage_date");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bank_offers"
    ADD CONSTRAINT "bank_offers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."broker_cases"
    ADD CONSTRAINT "broker_cases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."broker_cases"
    ADD CONSTRAINT "broker_cases_transaction_case_id_broker_id_key" UNIQUE ("transaction_case_id", "broker_id");



ALTER TABLE ONLY "public"."broker_clients"
    ADD CONSTRAINT "broker_clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."commission_records"
    ADD CONSTRAINT "commission_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_messages"
    ADD CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."credit_applications"
    ADD CONSTRAINT "credit_applications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customs_cases"
    ADD CONSTRAINT "customs_cases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customs_declarations"
    ADD CONSTRAINT "customs_declarations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deliveries"
    ADD CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."devis"
    ADD CONSTRAINT "devis_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."drivers"
    ADD CONSTRAINT "drivers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."enterprise_dashboard_configs"
    ADD CONSTRAINT "enterprise_dashboard_configs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."enterprise_dashboard_configs"
    ADD CONSTRAINT "enterprise_dashboard_configs_user_role" UNIQUE ("user_id", "role");



ALTER TABLE ONLY "public"."escrow_events"
    ADD CONSTRAINT "escrow_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."escrow_transactions"
    ADD CONSTRAINT "escrow_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."financing_requests"
    ADD CONSTRAINT "financing_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."freight_containers"
    ADD CONSTRAINT "freight_containers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."freight_documents"
    ADD CONSTRAINT "freight_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."freight_monthly_volumes"
    ADD CONSTRAINT "freight_monthly_volumes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inspection_reports"
    ADD CONSTRAINT "inspection_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inspection_requests"
    ADD CONSTRAINT "inspection_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."insurance_policies"
    ADD CONSTRAINT "insurance_policies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."interventions"
    ADD CONSTRAINT "interventions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."investment_opportunities"
    ADD CONSTRAINT "investment_opportunities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."investments"
    ADD CONSTRAINT "investments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."logistics_route_tracking"
    ADD CONSTRAINT "logistics_route_tracking_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."logistics_scm_kpis_monthly"
    ADD CONSTRAINT "logistics_scm_kpis_monthly_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."logistics_stock_alerts"
    ADD CONSTRAINT "logistics_stock_alerts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."logistics_tasks"
    ADD CONSTRAINT "logistics_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."logistics_warehouses"
    ADD CONSTRAINT "logistics_warehouses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."machine_views"
    ADD CONSTRAINT "machine_views_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."machines"
    ADD CONSTRAINT "machines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."member_sessions"
    ADD CONSTRAINT "member_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_ai_credentials"
    ADD CONSTRAINT "organization_ai_credentials_pkey" PRIMARY KEY ("organization_id");



ALTER TABLE ONLY "public"."organization_member_scopes"
    ADD CONSTRAINT "organization_member_scopes_pkey" PRIMARY KEY ("organization_id", "user_id");



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_organization_id_user_id_key" UNIQUE ("organization_id", "user_id");



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_records"
    ADD CONSTRAINT "payment_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."planning_events"
    ADD CONSTRAINT "planning_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."price_observations"
    ADD CONSTRAINT "price_observations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pro_clients"
    ADD CONSTRAINT "pro_clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."processed_stripe_events"
    ADD CONSTRAINT "processed_stripe_events_pkey" PRIMARY KEY ("event_id");



ALTER TABLE ONLY "public"."promo_codes"
    ADD CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."promo_redemptions"
    ADD CONSTRAINT "promo_redemptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."promo_redemptions"
    ADD CONSTRAINT "promo_redemptions_promo_code_id_user_id_key" UNIQUE ("promo_code_id", "user_id");



ALTER TABLE ONLY "public"."quote_requests"
    ADD CONSTRAINT "quote_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rental_invoices"
    ADD CONSTRAINT "rental_invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rentals"
    ADD CONSTRAINT "rentals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."repairs"
    ADD CONSTRAINT "repairs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_orders"
    ADD CONSTRAINT "stock_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."technicians"
    ADD CONSTRAINT "technicians_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenders_ai_usage_daily"
    ADD CONSTRAINT "tenders_ai_usage_daily_pkey" PRIMARY KEY ("user_id", "usage_date");



ALTER TABLE ONLY "public"."transaction_cases"
    ADD CONSTRAINT "transaction_cases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transaction_documents"
    ADD CONSTRAINT "transaction_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transaction_events"
    ADD CONSTRAINT "transaction_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transaction_messages"
    ADD CONSTRAINT "transaction_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transaction_participants"
    ADD CONSTRAINT "transaction_participants_case_id_user_id_role_key" UNIQUE ("case_id", "user_id", "role");



ALTER TABLE ONLY "public"."transaction_participants"
    ADD CONSTRAINT "transaction_participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transaction_tasks"
    ADD CONSTRAINT "transaction_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transport_requests"
    ADD CONSTRAINT "transport_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transport_routes"
    ADD CONSTRAINT "transport_routes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_invitations"
    ADD CONSTRAINT "user_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vitrines"
    ADD CONSTRAINT "vitrines_pkey" PRIMARY KEY ("id");



CREATE INDEX "audit_logs_actor_idx" ON "public"."audit_logs" USING "btree" ("actor_id", "created_at" DESC);



CREATE INDEX "audit_logs_entity_idx" ON "public"."audit_logs" USING "btree" ("entity_type", "entity_id", "created_at" DESC);



CREATE INDEX "audit_logs_org_idx" ON "public"."audit_logs" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "audit_logs_transaction_case_idx" ON "public"."audit_logs" USING "btree" ("transaction_case_id", "created_at" DESC) WHERE ("transaction_case_id" IS NOT NULL);



CREATE INDEX "broker_cases_broker_idx" ON "public"."broker_cases" USING "btree" ("broker_id");



CREATE INDEX "commission_records_case_idx" ON "public"."commission_records" USING "btree" ("transaction_case_id");



CREATE INDEX "contact_messages_created_at_idx" ON "public"."contact_messages" USING "btree" ("created_at" DESC);



CREATE INDEX "contact_messages_status_idx" ON "public"."contact_messages" USING "btree" ("status");



CREATE INDEX "credit_applications_transaction_case_idx" ON "public"."credit_applications" USING "btree" ("transaction_case_id") WHERE ("transaction_case_id" IS NOT NULL);



CREATE INDEX "customs_case_tx_idx" ON "public"."customs_cases" USING "btree" ("transaction_case_id");



CREATE UNIQUE INDEX "customs_cases_open_uniq" ON "public"."customs_cases" USING "btree" ("transaction_case_id") WHERE ("customs_status" <> ALL (ARRAY['cleared'::"text", 'closed'::"text"]));



CREATE INDEX "deliveries_transaction_case_idx" ON "public"."deliveries" USING "btree" ("transaction_case_id") WHERE ("transaction_case_id" IS NOT NULL);



CREATE INDEX "devis_user_id_idx" ON "public"."devis" USING "btree" ("user_id");



CREATE INDEX "documents_user_id_idx" ON "public"."documents" USING "btree" ("user_id");



CREATE INDEX "enterprise_dashboard_configs_user_id_idx" ON "public"."enterprise_dashboard_configs" USING "btree" ("user_id");



CREATE INDEX "escrow_transactions_case_idx" ON "public"."escrow_transactions" USING "btree" ("transaction_case_id") WHERE ("transaction_case_id" IS NOT NULL);



CREATE INDEX "financing_case_idx" ON "public"."financing_requests" USING "btree" ("transaction_case_id");



CREATE INDEX "financing_requests_broker_idx" ON "public"."financing_requests" USING "btree" ("broker_id") WHERE ("broker_id" IS NOT NULL);



CREATE INDEX "financing_requests_case_idx" ON "public"."financing_requests" USING "btree" ("transaction_case_id");



CREATE UNIQUE INDEX "financing_requests_open_uniq" ON "public"."financing_requests" USING "btree" ("transaction_case_id") WHERE ("status" <> ALL (ARRAY['approved'::"text", 'funded'::"text", 'rejected'::"text", 'cancelled'::"text"]));



CREATE UNIQUE INDEX "freight_monthly_user_period_dir" ON "public"."freight_monthly_volumes" USING "btree" ("created_by", "period_month", "direction");



CREATE INDEX "idx_bank_offers_active" ON "public"."bank_offers" USING "btree" ("active");



CREATE INDEX "idx_bank_offers_created_by" ON "public"."bank_offers" USING "btree" ("created_by");



CREATE INDEX "idx_bank_offers_rate" ON "public"."bank_offers" USING "btree" ("annual_rate");



CREATE INDEX "idx_broker_clients_created_by" ON "public"."broker_clients" USING "btree" ("created_by");



CREATE INDEX "idx_broker_clients_name" ON "public"."broker_clients" USING "btree" ("name");



CREATE INDEX "idx_broker_clients_status" ON "public"."broker_clients" USING "btree" ("status");



CREATE INDEX "idx_broker_clients_type" ON "public"."broker_clients" USING "btree" ("type");



CREATE INDEX "idx_credit_apps_application_date" ON "public"."credit_applications" USING "btree" ("application_date");



CREATE INDEX "idx_credit_apps_client" ON "public"."credit_applications" USING "btree" ("client_id");



CREATE INDEX "idx_credit_apps_created_by" ON "public"."credit_applications" USING "btree" ("created_by");



CREATE INDEX "idx_credit_apps_expected_decision" ON "public"."credit_applications" USING "btree" ("expected_decision_date");



CREATE INDEX "idx_credit_apps_status" ON "public"."credit_applications" USING "btree" ("status");



CREATE INDEX "idx_customs_created_by" ON "public"."customs_declarations" USING "btree" ("created_by");



CREATE INDEX "idx_customs_status" ON "public"."customs_declarations" USING "btree" ("status");



CREATE INDEX "idx_deliveries_created_by" ON "public"."deliveries" USING "btree" ("created_by");



CREATE INDEX "idx_deliveries_driver" ON "public"."deliveries" USING "btree" ("driver_id");



CREATE INDEX "idx_deliveries_empty_km" ON "public"."deliveries" USING "btree" ("distance_empty_km");



CREATE INDEX "idx_deliveries_expected_delivery" ON "public"."deliveries" USING "btree" ("expected_delivery_date");



CREATE INDEX "idx_deliveries_pickup_date" ON "public"."deliveries" USING "btree" ("pickup_date");



CREATE INDEX "idx_deliveries_status" ON "public"."deliveries" USING "btree" ("status");



CREATE INDEX "idx_deliveries_vehicle" ON "public"."deliveries" USING "btree" ("vehicle_id");



CREATE INDEX "idx_drivers_availability" ON "public"."drivers" USING "btree" ("availability_status");



CREATE INDEX "idx_drivers_created_by" ON "public"."drivers" USING "btree" ("created_by");



CREATE INDEX "idx_drivers_license_expiry" ON "public"."drivers" USING "btree" ("license_expiry");



CREATE INDEX "idx_escrow_buyer" ON "public"."escrow_transactions" USING "btree" ("buyer_id");



CREATE INDEX "idx_escrow_events_escrow" ON "public"."escrow_events" USING "btree" ("escrow_id", "created_at");



CREATE INDEX "idx_escrow_seller" ON "public"."escrow_transactions" USING "btree" ("seller_id");



CREATE INDEX "idx_escrow_status" ON "public"."escrow_transactions" USING "btree" ("status");



CREATE INDEX "idx_fc_created_by" ON "public"."freight_containers" USING "btree" ("created_by");



CREATE INDEX "idx_fc_status" ON "public"."freight_containers" USING "btree" ("status");



CREATE INDEX "idx_fd_created_by" ON "public"."freight_documents" USING "btree" ("created_by");



CREATE INDEX "idx_fd_status" ON "public"."freight_documents" USING "btree" ("status");



CREATE INDEX "idx_fmv_created_by" ON "public"."freight_monthly_volumes" USING "btree" ("created_by");



CREATE INDEX "idx_interventions_created_by" ON "public"."interventions" USING "btree" ("created_by");



CREATE INDEX "idx_interventions_date" ON "public"."interventions" USING "btree" ("intervention_date");



CREATE INDEX "idx_interventions_equipment" ON "public"."interventions" USING "btree" ("equipment_id");



CREATE INDEX "idx_interventions_priority" ON "public"."interventions" USING "btree" ("priority");



CREATE INDEX "idx_interventions_status" ON "public"."interventions" USING "btree" ("status");



CREATE INDEX "idx_interventions_technician" ON "public"."interventions" USING "btree" ("technician_id");



CREATE INDEX "idx_inventory_category" ON "public"."inventory" USING "btree" ("category");



CREATE INDEX "idx_inventory_created_by" ON "public"."inventory" USING "btree" ("created_by");



CREATE INDEX "idx_inventory_supplier" ON "public"."inventory" USING "btree" ("supplier");



CREATE INDEX "idx_investments_acquisition_date" ON "public"."investments" USING "btree" ("acquisition_date");



CREATE INDEX "idx_investments_category" ON "public"."investments" USING "btree" ("category");



CREATE INDEX "idx_investments_created_by" ON "public"."investments" USING "btree" ("created_by");



CREATE INDEX "idx_investments_status" ON "public"."investments" USING "btree" ("status");



CREATE INDEX "idx_leads_contact_role" ON "public"."leads" USING "btree" ("contact_role") WHERE ("contact_role" IS NOT NULL);



CREATE INDEX "idx_leads_created_at" ON "public"."leads" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_lrt_created_by" ON "public"."logistics_route_tracking" USING "btree" ("created_by");



CREATE INDEX "idx_lrt_status" ON "public"."logistics_route_tracking" USING "btree" ("status");



CREATE INDEX "idx_lsa_created_by" ON "public"."logistics_stock_alerts" USING "btree" ("created_by");



CREATE INDEX "idx_lsa_status" ON "public"."logistics_stock_alerts" USING "btree" ("status");



CREATE INDEX "idx_lskm_created_by" ON "public"."logistics_scm_kpis_monthly" USING "btree" ("created_by");



CREATE INDEX "idx_lw_created_by" ON "public"."logistics_warehouses" USING "btree" ("created_by");



CREATE INDEX "idx_machines_category" ON "public"."machines" USING "btree" ("category");



CREATE INDEX "idx_machines_created_at" ON "public"."machines" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_machines_seller_id" ON "public"."machines" USING "btree" ("seller_id");



CREATE INDEX "idx_machines_sellerid" ON "public"."machines" USING "btree" ("sellerid");



CREATE INDEX "idx_opportunities_created_by" ON "public"."investment_opportunities" USING "btree" ("created_by");



CREATE INDEX "idx_opportunities_expiry" ON "public"."investment_opportunities" USING "btree" ("expiry_date");



CREATE INDEX "idx_opportunities_recommendation" ON "public"."investment_opportunities" USING "btree" ("recommendation");



CREATE INDEX "idx_opportunities_roi" ON "public"."investment_opportunities" USING "btree" ("expected_roi_percent" DESC);



CREATE INDEX "idx_opportunities_status" ON "public"."investment_opportunities" USING "btree" ("status");



CREATE INDEX "idx_policies_client" ON "public"."insurance_policies" USING "btree" ("client_id");



CREATE INDEX "idx_policies_created_by" ON "public"."insurance_policies" USING "btree" ("created_by");



CREATE INDEX "idx_policies_end_date" ON "public"."insurance_policies" USING "btree" ("end_date");



CREATE INDEX "idx_policies_insurer" ON "public"."insurance_policies" USING "btree" ("insurer_name");



CREATE INDEX "idx_policies_status" ON "public"."insurance_policies" USING "btree" ("status");



CREATE INDEX "idx_pro_clients_user_created_desc" ON "public"."pro_clients" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_pro_clients_user_id" ON "public"."pro_clients" USING "btree" ("user_id");



CREATE INDEX "idx_rental_invoices_created_by" ON "public"."rental_invoices" USING "btree" ("created_by");



CREATE INDEX "idx_rental_invoices_due_date" ON "public"."rental_invoices" USING "btree" ("due_date");



CREATE INDEX "idx_rental_invoices_equipment" ON "public"."rental_invoices" USING "btree" ("equipment_id");



CREATE INDEX "idx_rental_invoices_status" ON "public"."rental_invoices" USING "btree" ("status");



CREATE INDEX "idx_rentals_client" ON "public"."rentals" USING "btree" ("client_id");



CREATE INDEX "idx_rentals_created_by" ON "public"."rentals" USING "btree" ("created_by");



CREATE INDEX "idx_rentals_equipment" ON "public"."rentals" USING "btree" ("equipment_id");



CREATE INDEX "idx_rentals_start_date" ON "public"."rentals" USING "btree" ("start_date");



CREATE INDEX "idx_rentals_status" ON "public"."rentals" USING "btree" ("status");



CREATE INDEX "idx_repairs_created_by" ON "public"."repairs" USING "btree" ("created_by");



CREATE INDEX "idx_repairs_equipment" ON "public"."repairs" USING "btree" ("equipment_id");



CREATE INDEX "idx_repairs_status" ON "public"."repairs" USING "btree" ("status");



CREATE INDEX "idx_repairs_technician" ON "public"."repairs" USING "btree" ("technician_id");



CREATE INDEX "idx_stock_orders_created_by" ON "public"."stock_orders" USING "btree" ("created_by");



CREATE INDEX "idx_stock_orders_inventory" ON "public"."stock_orders" USING "btree" ("inventory_id");



CREATE INDEX "idx_stock_orders_status" ON "public"."stock_orders" USING "btree" ("status");



CREATE INDEX "idx_tasks_created_by" ON "public"."tasks" USING "btree" ("created_by");



CREATE INDEX "idx_tasks_due_date" ON "public"."tasks" USING "btree" ("due_date");



CREATE INDEX "idx_tasks_status" ON "public"."tasks" USING "btree" ("status");



CREATE INDEX "idx_tasks_technician" ON "public"."tasks" USING "btree" ("technician_id");



CREATE INDEX "idx_technicians_availability" ON "public"."technicians" USING "btree" ("availability_status");



CREATE INDEX "idx_technicians_created_by" ON "public"."technicians" USING "btree" ("created_by");



CREATE INDEX "idx_technicians_name" ON "public"."technicians" USING "btree" ("name");



CREATE INDEX "idx_transport_routes_created_by" ON "public"."transport_routes" USING "btree" ("created_by");



CREATE INDEX "idx_vehicles_created_by" ON "public"."vehicles" USING "btree" ("created_by");



CREATE INDEX "idx_vehicles_status" ON "public"."vehicles" USING "btree" ("status");



CREATE INDEX "idx_vehicles_type" ON "public"."vehicles" USING "btree" ("type");



CREATE INDEX "inspection_rep_case_idx" ON "public"."inspection_reports" USING "btree" ("transaction_case_id");



CREATE INDEX "inspection_reports_case_idx" ON "public"."inspection_reports" USING "btree" ("transaction_case_id");



CREATE INDEX "inspection_req_assignee_idx" ON "public"."inspection_requests" USING "btree" ("assigned_to");



CREATE INDEX "inspection_req_case_idx" ON "public"."inspection_requests" USING "btree" ("transaction_case_id");



CREATE INDEX "inspection_requests_assignee_idx" ON "public"."inspection_requests" USING "btree" ("assigned_to") WHERE ("assigned_to" IS NOT NULL);



CREATE UNIQUE INDEX "inspection_requests_open_uniq" ON "public"."inspection_requests" USING "btree" ("transaction_case_id") WHERE ("status" <> ALL (ARRAY['completed'::"text", 'cancelled'::"text", 'done'::"text"]));



CREATE INDEX "ix_machines_category" ON "public"."machines" USING "btree" ("category");



CREATE INDEX "ix_machines_country" ON "public"."machines" USING "btree" ("country");



CREATE INDEX "ix_machines_lat_lng" ON "public"."machines" USING "btree" ("latitude", "longitude");



CREATE INDEX "ix_machines_sellerid" ON "public"."machines" USING "btree" ("sellerid");



CREATE UNIQUE INDEX "ix_machines_source_source_id" ON "public"."machines" USING "btree" ("source", "source_id") WHERE (("source" IS NOT NULL) AND ("source_id" IS NOT NULL));



CREATE INDEX "leads_assigned_user_idx" ON "public"."leads" USING "btree" ("assigned_to_user_id") WHERE ("assigned_to_user_id" IS NOT NULL);



CREATE INDEX "leads_buyer_user_idx" ON "public"."leads" USING "btree" ("buyer_user_id") WHERE ("buyer_user_id" IS NOT NULL);



CREATE INDEX "leads_machine_id_idx" ON "public"."leads" USING "btree" ("machine_id") WHERE ("machine_id" IS NOT NULL);



CREATE INDEX "leads_org_idx" ON "public"."leads" USING "btree" ("organization_id") WHERE ("organization_id" IS NOT NULL);



CREATE INDEX "leads_quote_request_idx" ON "public"."leads" USING "btree" ("quote_request_id") WHERE ("quote_request_id" IS NOT NULL);



CREATE INDEX "leads_seller_created_idx" ON "public"."leads" USING "btree" ("seller_id", "created_at" DESC);



CREATE INDEX "leads_source_idx" ON "public"."leads" USING "btree" ("source", "source_id");



CREATE INDEX "leads_transaction_case_idx" ON "public"."leads" USING "btree" ("transaction_case_id") WHERE ("transaction_case_id" IS NOT NULL);



CREATE INDEX "logistics_task_case_idx" ON "public"."logistics_tasks" USING "btree" ("transaction_case_id");



CREATE UNIQUE INDEX "lskm_user_month" ON "public"."logistics_scm_kpis_monthly" USING "btree" ("created_by", "period_month");



CREATE INDEX "machine_views_created_at_idx" ON "public"."machine_views" USING "btree" ("created_at" DESC);



CREATE INDEX "machine_views_machine_id_idx" ON "public"."machine_views" USING "btree" ("machine_id");



CREATE INDEX "member_sessions_org_login_idx" ON "public"."member_sessions" USING "btree" ("organization_id", "login_at" DESC);



CREATE INDEX "member_sessions_user_login_idx" ON "public"."member_sessions" USING "btree" ("user_id", "login_at" DESC);



CREATE INDEX "organization_members_org_idx" ON "public"."organization_members" USING "btree" ("organization_id");



CREATE INDEX "organization_members_user_idx" ON "public"."organization_members" USING "btree" ("user_id");



CREATE INDEX "payment_records_case_idx" ON "public"."payment_records" USING "btree" ("transaction_case_id");



CREATE INDEX "payment_records_escrow_link_idx" ON "public"."payment_records" USING "btree" ("escrow_transaction_id") WHERE ("escrow_transaction_id" IS NOT NULL);



CREATE UNIQUE INDEX "payment_records_escrow_uniq" ON "public"."payment_records" USING "btree" ("transaction_case_id", "payment_type") WHERE ("status" <> ALL (ARRAY['released'::"text", 'refunded'::"text", 'cancelled'::"text"]));



CREATE INDEX "planning_events_user_id_idx" ON "public"."planning_events" USING "btree" ("user_id");



CREATE UNIQUE INDEX "price_observations_escrow_uniq" ON "public"."price_observations" USING "btree" ("escrow_transaction_id") WHERE ("escrow_transaction_id" IS NOT NULL);



CREATE UNIQUE INDEX "promo_codes_code_key" ON "public"."promo_codes" USING "btree" ("lower"("code"));



CREATE INDEX "quote_requests_buyer_user_idx" ON "public"."quote_requests" USING "btree" ("buyer_user_id") WHERE ("buyer_user_id" IS NOT NULL);



CREATE INDEX "quote_requests_created_at_idx" ON "public"."quote_requests" USING "btree" ("created_at" DESC);



CREATE INDEX "quote_requests_seller_idx" ON "public"."quote_requests" USING "btree" ("seller_id");



CREATE INDEX "quote_requests_status_idx" ON "public"."quote_requests" USING "btree" ("status");



CREATE INDEX "transaction_cases_buyer_idx" ON "public"."transaction_cases" USING "btree" ("buyer_user_id") WHERE ("buyer_user_id" IS NOT NULL);



CREATE INDEX "transaction_cases_machine_idx" ON "public"."transaction_cases" USING "btree" ("machine_id") WHERE ("machine_id" IS NOT NULL);



CREATE INDEX "transaction_cases_org_idx" ON "public"."transaction_cases" USING "btree" ("organization_id") WHERE ("organization_id" IS NOT NULL);



CREATE INDEX "transaction_cases_organization_idx" ON "public"."transaction_cases" USING "btree" ("organization_id") WHERE ("organization_id" IS NOT NULL);



CREATE INDEX "transaction_cases_quote_idx" ON "public"."transaction_cases" USING "btree" ("primary_quote_request_id") WHERE ("primary_quote_request_id" IS NOT NULL);



CREATE INDEX "transaction_cases_seller_idx" ON "public"."transaction_cases" USING "btree" ("seller_user_id", "created_at" DESC);



CREATE INDEX "transaction_documents_case_idx" ON "public"."transaction_documents" USING "btree" ("transaction_case_id");



CREATE INDEX "transaction_events_case_idx" ON "public"."transaction_events" USING "btree" ("case_id", "created_at" DESC);



CREATE INDEX "transaction_messages_case_idx" ON "public"."transaction_messages" USING "btree" ("transaction_case_id");



CREATE INDEX "transaction_participants_case_idx" ON "public"."transaction_participants" USING "btree" ("case_id");



CREATE INDEX "transaction_participants_user_idx" ON "public"."transaction_participants" USING "btree" ("user_id") WHERE ("revoked_at" IS NULL);



CREATE INDEX "transaction_tasks_case_idx" ON "public"."transaction_tasks" USING "btree" ("transaction_case_id");



CREATE INDEX "transport_req_carrier_idx" ON "public"."transport_requests" USING "btree" ("transporter_id");



CREATE INDEX "transport_req_case_idx" ON "public"."transport_requests" USING "btree" ("transaction_case_id");



CREATE UNIQUE INDEX "transport_requests_open_uniq" ON "public"."transport_requests" USING "btree" ("transaction_case_id") WHERE ("status" <> ALL (ARRAY['delivered'::"text", 'cancelled'::"text"]));



CREATE INDEX "transport_requests_transporter_idx" ON "public"."transport_requests" USING "btree" ("transporter_id") WHERE ("transporter_id" IS NOT NULL);



CREATE INDEX "tx_docs_case_idx" ON "public"."transaction_documents" USING "btree" ("transaction_case_id");



CREATE INDEX "tx_messages_case_idx" ON "public"."transaction_messages" USING "btree" ("transaction_case_id", "created_at" DESC);



CREATE INDEX "tx_tasks_assignee_idx" ON "public"."transaction_tasks" USING "btree" ("assigned_to");



CREATE INDEX "tx_tasks_case_idx" ON "public"."transaction_tasks" USING "btree" ("transaction_case_id");



CREATE INDEX "user_invitations_org_idx" ON "public"."user_invitations" USING "btree" ("organization_id") WHERE ("organization_id" IS NOT NULL);



CREATE UNIQUE INDEX "user_invitations_token_uidx" ON "public"."user_invitations" USING "btree" ("token") WHERE ("token" IS NOT NULL);



CREATE UNIQUE INDEX "vitrines_user_id_key" ON "public"."vitrines" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "contact_messages_antispam" BEFORE INSERT ON "public"."contact_messages" FOR EACH ROW EXECUTE FUNCTION "public"."contact_messages_antispam_fn"();



CREATE OR REPLACE TRIGGER "quote_requests_antispam" BEFORE INSERT ON "public"."quote_requests" FOR EACH ROW EXECUTE FUNCTION "public"."quote_requests_antispam_fn"();



CREATE OR REPLACE TRIGGER "trg_audit_transaction_documents_ins" AFTER INSERT ON "public"."transaction_documents" FOR EACH ROW EXECUTE FUNCTION "public"."audit_document_insert_fn"();



CREATE OR REPLACE TRIGGER "trg_bank_offers_updated_at" BEFORE UPDATE ON "public"."bank_offers" FOR EACH ROW EXECUTE FUNCTION "public"."courtier_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_broker_clients_updated_at" BEFORE UPDATE ON "public"."broker_clients" FOR EACH ROW EXECUTE FUNCTION "public"."courtier_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_credit_apps_commission" BEFORE INSERT OR UPDATE ON "public"."credit_applications" FOR EACH ROW EXECUTE FUNCTION "public"."courtier_compute_credit_commission"();



CREATE OR REPLACE TRIGGER "trg_credit_apps_updated_at" BEFORE UPDATE ON "public"."credit_applications" FOR EACH ROW EXECUTE FUNCTION "public"."courtier_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_customs_updated_at" BEFORE UPDATE ON "public"."customs_declarations" FOR EACH ROW EXECUTE FUNCTION "public"."transitaire_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_deliveries_updated_at" BEFORE UPDATE ON "public"."deliveries" FOR EACH ROW EXECUTE FUNCTION "public"."transporteur_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_documents_force_owner" BEFORE INSERT ON "public"."documents" FOR EACH ROW EXECUTE FUNCTION "public"."documents_force_owner_fn"();



CREATE OR REPLACE TRIGGER "trg_drivers_updated_at" BEFORE UPDATE ON "public"."drivers" FOR EACH ROW EXECUTE FUNCTION "public"."transporteur_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_escrow_sync_payment" AFTER INSERT OR UPDATE OF "status", "transaction_case_id" ON "public"."escrow_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."_tc_sync_payment_from_escrow"();



CREATE OR REPLACE TRIGGER "trg_escrow_to_price_observation" AFTER UPDATE OF "status" ON "public"."escrow_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."_escrow_to_price_observation"();



CREATE OR REPLACE TRIGGER "trg_fc_updated_at" BEFORE UPDATE ON "public"."freight_containers" FOR EACH ROW EXECUTE FUNCTION "public"."transitaire_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_fd_updated_at" BEFORE UPDATE ON "public"."freight_documents" FOR EACH ROW EXECUTE FUNCTION "public"."transitaire_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_interventions_sync" BEFORE INSERT OR UPDATE ON "public"."interventions" FOR EACH ROW EXECUTE FUNCTION "public"."sync_intervention_scheduled_date"();



CREATE OR REPLACE TRIGGER "trg_inventory_updated_at" BEFORE UPDATE ON "public"."inventory" FOR EACH ROW EXECUTE FUNCTION "public"."mecanicien_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_investments_updated_at" BEFORE UPDATE ON "public"."investments" FOR EACH ROW EXECUTE FUNCTION "public"."investisseur_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_leads_guard_ins" BEFORE INSERT ON "public"."leads" FOR EACH ROW EXECUTE FUNCTION "public"."leads_guard_fn"();



CREATE OR REPLACE TRIGGER "trg_leads_guard_upd" BEFORE UPDATE ON "public"."leads" FOR EACH ROW EXECUTE FUNCTION "public"."leads_guard_fn"();



CREATE OR REPLACE TRIGGER "trg_lrt_updated_at" BEFORE UPDATE ON "public"."logistics_route_tracking" FOR EACH ROW EXECUTE FUNCTION "public"."logisticien_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_lsa_updated_at" BEFORE UPDATE ON "public"."logistics_stock_alerts" FOR EACH ROW EXECUTE FUNCTION "public"."logisticien_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_lw_updated_at" BEFORE UPDATE ON "public"."logistics_warehouses" FOR EACH ROW EXECUTE FUNCTION "public"."logisticien_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_machines_updated_at" BEFORE UPDATE ON "public"."machines" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_opportunities_compute" BEFORE INSERT OR UPDATE ON "public"."investment_opportunities" FOR EACH ROW EXECUTE FUNCTION "public"."investisseur_compute_opportunity_metrics"();



CREATE OR REPLACE TRIGGER "trg_opportunities_updated_at" BEFORE UPDATE ON "public"."investment_opportunities" FOR EACH ROW EXECUTE FUNCTION "public"."investisseur_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_policies_compute" BEFORE INSERT OR UPDATE ON "public"."insurance_policies" FOR EACH ROW EXECUTE FUNCTION "public"."courtier_compute_policy_commission"();



CREATE OR REPLACE TRIGGER "trg_policies_updated_at" BEFORE UPDATE ON "public"."insurance_policies" FOR EACH ROW EXECUTE FUNCTION "public"."courtier_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_pro_clients_updated_at" BEFORE UPDATE ON "public"."pro_clients" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_quote_requests_sync_lead" AFTER INSERT ON "public"."quote_requests" FOR EACH ROW EXECUTE FUNCTION "public"."quote_requests_after_insert_sync_lead"();



CREATE OR REPLACE TRIGGER "trg_quote_requests_update_lead_case" AFTER UPDATE OF "transaction_case_id" ON "public"."quote_requests" FOR EACH ROW EXECUTE FUNCTION "public"."quote_requests_after_update_sync_lead_case"();



CREATE OR REPLACE TRIGGER "trg_repairs_updated_at" BEFORE UPDATE ON "public"."repairs" FOR EACH ROW EXECUTE FUNCTION "public"."mecanicien_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_stock_orders_updated_at" BEFORE UPDATE ON "public"."stock_orders" FOR EACH ROW EXECUTE FUNCTION "public"."mecanicien_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_tasks_updated_at" BEFORE UPDATE ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."mecanicien_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_technicians_updated_at" BEFORE UPDATE ON "public"."technicians" FOR EACH ROW EXECUTE FUNCTION "public"."mecanicien_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_transaction_cases_audit" AFTER INSERT ON "public"."transaction_cases" FOR EACH ROW EXECUTE FUNCTION "public"."transaction_cases_after_insert_audit"();



CREATE OR REPLACE TRIGGER "trg_transaction_cases_link_quote_request" AFTER INSERT ON "public"."transaction_cases" FOR EACH ROW EXECUTE FUNCTION "public"."transaction_cases_after_insert_link_quote_request"();



CREATE OR REPLACE TRIGGER "trg_transaction_cases_updated_at" BEFORE UPDATE ON "public"."transaction_cases" FOR EACH ROW EXECUTE FUNCTION "public"."transaction_cases_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_transport_routes_updated_at" BEFORE UPDATE ON "public"."transport_routes" FOR EACH ROW EXECUTE FUNCTION "public"."transporteur_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_tx_cases_seed_participants" AFTER INSERT ON "public"."transaction_cases" FOR EACH ROW EXECUTE FUNCTION "public"."transaction_cases_after_insert_seed_participants"();



CREATE OR REPLACE TRIGGER "trg_vehicles_updated_at" BEFORE UPDATE ON "public"."vehicles" FOR EACH ROW EXECUTE FUNCTION "public"."transporteur_set_updated_at"();



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_transaction_case_id_fkey" FOREIGN KEY ("transaction_case_id") REFERENCES "public"."transaction_cases"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."broker_cases"
    ADD CONSTRAINT "broker_cases_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."broker_cases"
    ADD CONSTRAINT "broker_cases_transaction_case_id_fkey" FOREIGN KEY ("transaction_case_id") REFERENCES "public"."transaction_cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."broker_clients"
    ADD CONSTRAINT "broker_clients_transaction_case_id_fkey" FOREIGN KEY ("transaction_case_id") REFERENCES "public"."transaction_cases"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."commission_records"
    ADD CONSTRAINT "commission_records_beneficiary_id_fkey" FOREIGN KEY ("beneficiary_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."commission_records"
    ADD CONSTRAINT "commission_records_transaction_case_id_fkey" FOREIGN KEY ("transaction_case_id") REFERENCES "public"."transaction_cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."credit_applications"
    ADD CONSTRAINT "credit_applications_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."broker_clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."credit_applications"
    ADD CONSTRAINT "credit_applications_transaction_case_id_fkey" FOREIGN KEY ("transaction_case_id") REFERENCES "public"."transaction_cases"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."customs_cases"
    ADD CONSTRAINT "customs_cases_forwarder_id_fkey" FOREIGN KEY ("forwarder_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."customs_cases"
    ADD CONSTRAINT "customs_cases_transaction_case_id_fkey" FOREIGN KEY ("transaction_case_id") REFERENCES "public"."transaction_cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customs_declarations"
    ADD CONSTRAINT "customs_declarations_transaction_case_id_fkey" FOREIGN KEY ("transaction_case_id") REFERENCES "public"."transaction_cases"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."deliveries"
    ADD CONSTRAINT "deliveries_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."deliveries"
    ADD CONSTRAINT "deliveries_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "public"."transport_routes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."deliveries"
    ADD CONSTRAINT "deliveries_transaction_case_id_fkey" FOREIGN KEY ("transaction_case_id") REFERENCES "public"."transaction_cases"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."deliveries"
    ADD CONSTRAINT "deliveries_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."enterprise_dashboard_configs"
    ADD CONSTRAINT "enterprise_dashboard_configs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."escrow_events"
    ADD CONSTRAINT "escrow_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."escrow_events"
    ADD CONSTRAINT "escrow_events_escrow_id_fkey" FOREIGN KEY ("escrow_id") REFERENCES "public"."escrow_transactions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."escrow_transactions"
    ADD CONSTRAINT "escrow_transactions_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."escrow_transactions"
    ADD CONSTRAINT "escrow_transactions_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."escrow_transactions"
    ADD CONSTRAINT "escrow_transactions_transaction_case_id_fkey" FOREIGN KEY ("transaction_case_id") REFERENCES "public"."transaction_cases"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."financing_requests"
    ADD CONSTRAINT "financing_requests_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."financing_requests"
    ADD CONSTRAINT "financing_requests_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."financing_requests"
    ADD CONSTRAINT "financing_requests_transaction_case_id_fkey" FOREIGN KEY ("transaction_case_id") REFERENCES "public"."transaction_cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."freight_containers"
    ADD CONSTRAINT "freight_containers_transaction_case_id_fkey" FOREIGN KEY ("transaction_case_id") REFERENCES "public"."transaction_cases"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inspection_reports"
    ADD CONSTRAINT "inspection_reports_inspection_request_id_fkey" FOREIGN KEY ("inspection_request_id") REFERENCES "public"."inspection_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inspection_reports"
    ADD CONSTRAINT "inspection_reports_mechanic_id_fkey" FOREIGN KEY ("mechanic_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inspection_reports"
    ADD CONSTRAINT "inspection_reports_transaction_case_id_fkey" FOREIGN KEY ("transaction_case_id") REFERENCES "public"."transaction_cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inspection_requests"
    ADD CONSTRAINT "inspection_requests_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inspection_requests"
    ADD CONSTRAINT "inspection_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inspection_requests"
    ADD CONSTRAINT "inspection_requests_transaction_case_id_fkey" FOREIGN KEY ("transaction_case_id") REFERENCES "public"."transaction_cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."insurance_policies"
    ADD CONSTRAINT "insurance_policies_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."broker_clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."insurance_policies"
    ADD CONSTRAINT "insurance_policies_transaction_case_id_fkey" FOREIGN KEY ("transaction_case_id") REFERENCES "public"."transaction_cases"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."interventions"
    ADD CONSTRAINT "interventions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."interventions"
    ADD CONSTRAINT "interventions_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "public"."machines"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."interventions"
    ADD CONSTRAINT "interventions_transaction_case_id_fkey" FOREIGN KEY ("transaction_case_id") REFERENCES "public"."transaction_cases"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."investment_opportunities"
    ADD CONSTRAINT "investment_opportunities_converted_investment_id_fkey" FOREIGN KEY ("converted_investment_id") REFERENCES "public"."investments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_buyer_user_id_fkey" FOREIGN KEY ("buyer_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_transaction_case_fk" FOREIGN KEY ("transaction_case_id") REFERENCES "public"."transaction_cases"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."logistics_route_tracking"
    ADD CONSTRAINT "logistics_route_tracking_transaction_case_id_fkey" FOREIGN KEY ("transaction_case_id") REFERENCES "public"."transaction_cases"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."logistics_tasks"
    ADD CONSTRAINT "logistics_tasks_logistician_id_fkey" FOREIGN KEY ("logistician_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."logistics_tasks"
    ADD CONSTRAINT "logistics_tasks_transaction_case_id_fkey" FOREIGN KEY ("transaction_case_id") REFERENCES "public"."transaction_cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."member_sessions"
    ADD CONSTRAINT "member_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."member_sessions"
    ADD CONSTRAINT "member_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_ai_credentials"
    ADD CONSTRAINT "organization_ai_credentials_configured_by_fkey" FOREIGN KEY ("configured_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."organization_ai_credentials"
    ADD CONSTRAINT "organization_ai_credentials_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_member_scopes"
    ADD CONSTRAINT "organization_member_scopes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_member_scopes"
    ADD CONSTRAINT "organization_member_scopes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_records"
    ADD CONSTRAINT "payment_records_escrow_transaction_id_fkey" FOREIGN KEY ("escrow_transaction_id") REFERENCES "public"."escrow_transactions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_records"
    ADD CONSTRAINT "payment_records_payee_id_fkey" FOREIGN KEY ("payee_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_records"
    ADD CONSTRAINT "payment_records_payer_id_fkey" FOREIGN KEY ("payer_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_records"
    ADD CONSTRAINT "payment_records_transaction_case_id_fkey" FOREIGN KEY ("transaction_case_id") REFERENCES "public"."transaction_cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."price_observations"
    ADD CONSTRAINT "price_observations_escrow_transaction_id_fkey" FOREIGN KEY ("escrow_transaction_id") REFERENCES "public"."escrow_transactions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pro_clients"
    ADD CONSTRAINT "pro_clients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."promo_redemptions"
    ADD CONSTRAINT "promo_redemptions_promo_code_id_fkey" FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_codes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quote_requests"
    ADD CONSTRAINT "quote_requests_buyer_user_id_fkey" FOREIGN KEY ("buyer_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."quote_requests"
    ADD CONSTRAINT "quote_requests_transaction_case_fk" FOREIGN KEY ("transaction_case_id") REFERENCES "public"."transaction_cases"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rental_invoices"
    ADD CONSTRAINT "rental_invoices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."rental_invoices"
    ADD CONSTRAINT "rental_invoices_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "public"."machines"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rental_invoices"
    ADD CONSTRAINT "rental_invoices_rental_id_fkey" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rentals"
    ADD CONSTRAINT "rentals_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."rentals"
    ADD CONSTRAINT "rentals_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "public"."machines"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rentals"
    ADD CONSTRAINT "rentals_transaction_case_id_fkey" FOREIGN KEY ("transaction_case_id") REFERENCES "public"."transaction_cases"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."repairs"
    ADD CONSTRAINT "repairs_transaction_case_id_fkey" FOREIGN KEY ("transaction_case_id") REFERENCES "public"."transaction_cases"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transaction_cases"
    ADD CONSTRAINT "transaction_cases_buyer_user_id_fkey" FOREIGN KEY ("buyer_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transaction_cases"
    ADD CONSTRAINT "transaction_cases_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transaction_cases"
    ADD CONSTRAINT "transaction_cases_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transaction_cases"
    ADD CONSTRAINT "transaction_cases_seller_user_id_fkey" FOREIGN KEY ("seller_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transaction_documents"
    ADD CONSTRAINT "transaction_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transaction_documents"
    ADD CONSTRAINT "transaction_documents_transaction_case_id_fkey" FOREIGN KEY ("transaction_case_id") REFERENCES "public"."transaction_cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transaction_documents"
    ADD CONSTRAINT "transaction_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transaction_events"
    ADD CONSTRAINT "transaction_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transaction_events"
    ADD CONSTRAINT "transaction_events_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."transaction_cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transaction_messages"
    ADD CONSTRAINT "transaction_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transaction_messages"
    ADD CONSTRAINT "transaction_messages_transaction_case_id_fkey" FOREIGN KEY ("transaction_case_id") REFERENCES "public"."transaction_cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transaction_participants"
    ADD CONSTRAINT "transaction_participants_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."transaction_cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transaction_participants"
    ADD CONSTRAINT "transaction_participants_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transaction_participants"
    ADD CONSTRAINT "transaction_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transaction_tasks"
    ADD CONSTRAINT "transaction_tasks_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transaction_tasks"
    ADD CONSTRAINT "transaction_tasks_transaction_case_id_fkey" FOREIGN KEY ("transaction_case_id") REFERENCES "public"."transaction_cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transport_requests"
    ADD CONSTRAINT "transport_requests_transaction_case_id_fkey" FOREIGN KEY ("transaction_case_id") REFERENCES "public"."transaction_cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transport_requests"
    ADD CONSTRAINT "transport_requests_transporter_id_fkey" FOREIGN KEY ("transporter_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_invitations"
    ADD CONSTRAINT "user_invitations_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_invitations"
    ADD CONSTRAINT "user_invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_invitations"
    ADD CONSTRAINT "user_invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_current_driver_id_fkey" FOREIGN KEY ("current_driver_id") REFERENCES "public"."drivers"("id") ON DELETE SET NULL;



ALTER TABLE "public"."ai_usage_daily" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "anon can insert contact messages" ON "public"."contact_messages" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "anon can insert machine views" ON "public"."machine_views" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "audit_insert" ON "public"."audit_logs" FOR INSERT TO "authenticated" WITH CHECK (("actor_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_logs_insert_own" ON "public"."audit_logs" FOR INSERT TO "authenticated" WITH CHECK (("actor_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "audit_logs_select_org" ON "public"."audit_logs" FOR SELECT TO "authenticated" USING ((("actor_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("organization_id" IS NOT NULL) AND "public"."user_in_org_admin"("organization_id", ( SELECT "auth"."uid"() AS "uid"))) OR (("transaction_case_id" IS NOT NULL) AND "public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "audit_sel_own" ON "public"."audit_logs" FOR SELECT TO "authenticated" USING ((("actor_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("organization_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."organization_members" "m"
  WHERE (("m"."organization_id" = "audit_logs"."organization_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))))));



ALTER TABLE "public"."bank_offers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bank_offers_delete_own" ON "public"."bank_offers" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "bank_offers_insert_own" ON "public"."bank_offers" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "bank_offers_select_own" ON "public"."bank_offers" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "bank_offers_update_own" ON "public"."bank_offers" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



ALTER TABLE "public"."broker_cases" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "broker_cases_select" ON "public"."broker_cases" FOR SELECT TO "authenticated" USING ((("broker_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "broker_cases_update" ON "public"."broker_cases" FOR UPDATE TO "authenticated" USING ((("broker_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "broker_cases_update_own" ON "public"."broker_cases" FOR UPDATE TO "authenticated" USING ((("broker_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."transaction_cases" "tc"
  WHERE (("tc"."id" = "broker_cases"."transaction_case_id") AND ("tc"."organization_id" IS NOT NULL) AND "public"."user_in_org_admin"("tc"."organization_id", ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."transaction_cases" "tc"
  WHERE (("tc"."id" = "broker_cases"."transaction_case_id") AND ("tc"."seller_user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "broker_cases_write" ON "public"."broker_cases" FOR INSERT TO "authenticated" WITH CHECK (("broker_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."broker_clients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "broker_clients_delete_own" ON "public"."broker_clients" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "broker_clients_insert_own" ON "public"."broker_clients" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "broker_clients_select_own" ON "public"."broker_clients" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "broker_clients_update_own" ON "public"."broker_clients" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



ALTER TABLE "public"."commission_records" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "commission_records_access" ON "public"."commission_records" FOR SELECT TO "authenticated" USING ((("beneficiary_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "commissions_ins" ON "public"."commission_records" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "commissions_sel" ON "public"."commission_records" FOR SELECT TO "authenticated" USING ((("beneficiary_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."contact_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."credit_applications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "credit_apps_delete_own" ON "public"."credit_applications" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "credit_apps_insert_own" ON "public"."credit_applications" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "credit_apps_select_own" ON "public"."credit_applications" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "credit_apps_update_own" ON "public"."credit_applications" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



ALTER TABLE "public"."customs_cases" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customs_cases_access" ON "public"."customs_cases" FOR SELECT TO "authenticated" USING ((("forwarder_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "customs_cases_update" ON "public"."customs_cases" FOR UPDATE TO "authenticated" USING ((("forwarder_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "customs_cases_write" ON "public"."customs_cases" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."customs_declarations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customs_delete_own" ON "public"."customs_declarations" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "customs_insert_own" ON "public"."customs_declarations" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "customs_mut" ON "public"."customs_cases" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "customs_sel" ON "public"."customs_cases" FOR SELECT TO "authenticated" USING ("public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "customs_select_own" ON "public"."customs_declarations" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "customs_upd" ON "public"."customs_cases" FOR UPDATE TO "authenticated" USING ((("forwarder_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."transaction_cases" "c"
  WHERE (("c"."id" = "customs_cases"."transaction_case_id") AND ("c"."seller_user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."transaction_participants" "p"
  WHERE (("p"."case_id" = "customs_cases"."transaction_case_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = 'forwarder'::"text") AND ("p"."revoked_at" IS NULL))))));



CREATE POLICY "customs_update_own" ON "public"."customs_declarations" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



ALTER TABLE "public"."deliveries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "deliveries_delete_own" ON "public"."deliveries" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "deliveries_insert_own" ON "public"."deliveries" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "deliveries_select_own" ON "public"."deliveries" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "deliveries_update_own" ON "public"."deliveries" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



ALTER TABLE "public"."devis" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "devis_delete_own" ON "public"."devis" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "devis_insert_own" ON "public"."devis" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "devis_select_own" ON "public"."devis" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "devis_update_own" ON "public"."devis" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "documents_delete_own" ON "public"."documents" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "documents_insert_own" ON "public"."documents" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "documents_select_own" ON "public"."documents" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "documents_update_own" ON "public"."documents" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."drivers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "drivers_delete_own" ON "public"."drivers" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "drivers_insert_own" ON "public"."drivers" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "drivers_select_own" ON "public"."drivers" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "drivers_update_own" ON "public"."drivers" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "edc_del" ON "public"."enterprise_dashboard_configs" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "edc_ins" ON "public"."enterprise_dashboard_configs" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "edc_sel" ON "public"."enterprise_dashboard_configs" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "edc_upd" ON "public"."enterprise_dashboard_configs" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."enterprise_dashboard_configs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "enterprise_dashboard_configs_delete_own" ON "public"."enterprise_dashboard_configs" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "enterprise_dashboard_configs_insert_own" ON "public"."enterprise_dashboard_configs" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "enterprise_dashboard_configs_select_own" ON "public"."enterprise_dashboard_configs" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "enterprise_dashboard_configs_update_own" ON "public"."enterprise_dashboard_configs" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."escrow_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "escrow_events_select_party" ON "public"."escrow_events" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."escrow_transactions" "e"
  WHERE (("e"."id" = "escrow_events"."escrow_id") AND (("e"."buyer_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("e"."seller_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "escrow_select_party" ON "public"."escrow_transactions" FOR SELECT TO "authenticated" USING ((("buyer_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("seller_id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."escrow_transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fc_delete_own" ON "public"."freight_containers" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "fc_insert_own" ON "public"."freight_containers" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "fc_select_own" ON "public"."freight_containers" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "fc_update_own" ON "public"."freight_containers" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "fd_delete_own" ON "public"."freight_documents" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "fd_insert_own" ON "public"."freight_documents" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "fd_select_own" ON "public"."freight_documents" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "fd_update_own" ON "public"."freight_documents" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



ALTER TABLE "public"."financing_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "financing_requests_access" ON "public"."financing_requests" FOR SELECT TO "authenticated" USING ("public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "financing_requests_update" ON "public"."financing_requests" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."transaction_participants" "p"
  WHERE (("p"."case_id" = "financing_requests"."transaction_case_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."revoked_at" IS NULL) AND ("p"."role" = ANY (ARRAY['broker'::"text", 'seller'::"text", 'buyer'::"text", 'admin_delegate'::"text"]))))));



CREATE POLICY "financing_requests_write" ON "public"."financing_requests" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "financing_select" ON "public"."financing_requests" FOR SELECT TO "authenticated" USING ("public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "financing_update" ON "public"."financing_requests" FOR UPDATE TO "authenticated" USING ("public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "financing_write" ON "public"."financing_requests" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "fmv_delete_own" ON "public"."freight_monthly_volumes" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "fmv_insert_own" ON "public"."freight_monthly_volumes" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "fmv_select_own" ON "public"."freight_monthly_volumes" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "fmv_update_own" ON "public"."freight_monthly_volumes" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



ALTER TABLE "public"."freight_containers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."freight_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."freight_monthly_volumes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inspection_rep_select" ON "public"."inspection_reports" FOR SELECT TO "authenticated" USING ("public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."inspection_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inspection_reports_access" ON "public"."inspection_reports" FOR SELECT TO "authenticated" USING ((("mechanic_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "inspection_req_select" ON "public"."inspection_requests" FOR SELECT TO "authenticated" USING ("public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "inspection_req_update" ON "public"."inspection_requests" FOR UPDATE TO "authenticated" USING (("public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid")) AND (("assigned_to" = ( SELECT "auth"."uid"() AS "uid")) OR ("requested_by" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."transaction_cases" "c"
  WHERE (("c"."id" = "inspection_requests"."transaction_case_id") AND ("c"."seller_user_id" = ( SELECT "auth"."uid"() AS "uid"))))))));



CREATE POLICY "inspection_req_write" ON "public"."inspection_requests" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."inspection_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inspection_requests_access" ON "public"."inspection_requests" FOR SELECT TO "authenticated" USING ((("assigned_to" = ( SELECT "auth"."uid"() AS "uid")) OR ("requested_by" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "inspection_requests_update" ON "public"."inspection_requests" FOR UPDATE TO "authenticated" USING ((("assigned_to" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "inspection_requests_write" ON "public"."inspection_requests" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."insurance_policies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."interventions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "interventions_delete_own" ON "public"."interventions" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "interventions_insert_own" ON "public"."interventions" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "interventions_select_auth" ON "public"."interventions" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "interventions_select_own" ON "public"."interventions" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "interventions_update_own" ON "public"."interventions" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



ALTER TABLE "public"."inventory" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inventory_delete_own" ON "public"."inventory" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "inventory_insert_own" ON "public"."inventory" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "inventory_select_own" ON "public"."inventory" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "inventory_update_own" ON "public"."inventory" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



ALTER TABLE "public"."investment_opportunities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."investments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "investments_delete_own" ON "public"."investments" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "investments_insert_own" ON "public"."investments" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "investments_select_own" ON "public"."investments" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "investments_update_own" ON "public"."investments" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



ALTER TABLE "public"."leads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "leads_delete_own" ON "public"."leads" FOR DELETE TO "authenticated" USING ((("seller_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("organization_id" IS NOT NULL) AND "public"."user_in_org_admin"("organization_id", ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "leads_insert_own" ON "public"."leads" FOR INSERT TO "authenticated" WITH CHECK (("seller_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "leads_select_team" ON "public"."leads" FOR SELECT TO "authenticated" USING (("public"."can_access_lead"("id", ( SELECT "auth"."uid"() AS "uid")) OR (("buyer_user_id" IS NOT NULL) AND ("buyer_user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "leads_update_team" ON "public"."leads" FOR UPDATE TO "authenticated" USING ((("seller_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("assigned_to_user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("organization_id" IS NOT NULL) AND "public"."user_in_org_admin"("organization_id", ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK ((("seller_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("assigned_to_user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("organization_id" IS NOT NULL) AND "public"."user_in_org_admin"("organization_id", ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "logistics_mut" ON "public"."logistics_tasks" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."logistics_route_tracking" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."logistics_scm_kpis_monthly" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "logistics_sel" ON "public"."logistics_tasks" FOR SELECT TO "authenticated" USING ("public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."logistics_stock_alerts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."logistics_tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "logistics_tasks_access" ON "public"."logistics_tasks" FOR SELECT TO "authenticated" USING ((("logistician_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "logistics_tasks_update" ON "public"."logistics_tasks" FOR UPDATE TO "authenticated" USING ((("logistician_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "logistics_tasks_write" ON "public"."logistics_tasks" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "logistics_upd" ON "public"."logistics_tasks" FOR UPDATE TO "authenticated" USING ((("logistician_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."logistics_warehouses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lrt_delete_own" ON "public"."logistics_route_tracking" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "lrt_insert_own" ON "public"."logistics_route_tracking" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "lrt_select_own" ON "public"."logistics_route_tracking" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "lrt_update_own" ON "public"."logistics_route_tracking" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "lsa_delete_own" ON "public"."logistics_stock_alerts" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "lsa_insert_own" ON "public"."logistics_stock_alerts" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "lsa_select_own" ON "public"."logistics_stock_alerts" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "lsa_update_own" ON "public"."logistics_stock_alerts" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "lskm_delete_own" ON "public"."logistics_scm_kpis_monthly" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "lskm_insert_own" ON "public"."logistics_scm_kpis_monthly" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "lskm_select_own" ON "public"."logistics_scm_kpis_monthly" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "lskm_update_own" ON "public"."logistics_scm_kpis_monthly" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "lw_delete_own" ON "public"."logistics_warehouses" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "lw_insert_own" ON "public"."logistics_warehouses" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "lw_select_own" ON "public"."logistics_warehouses" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "lw_update_own" ON "public"."logistics_warehouses" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



ALTER TABLE "public"."machine_views" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."machines" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "machines_delete_own" ON "public"."machines" FOR DELETE USING (("sellerid" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "machines_insert_own" ON "public"."machines" FOR INSERT WITH CHECK (("sellerid" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "machines_select_own" ON "public"."machines" FOR SELECT USING (("sellerid" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "machines_select_public" ON "public"."machines" FOR SELECT USING (true);



CREATE POLICY "machines_update_own" ON "public"."machines" FOR UPDATE USING (("sellerid" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("sellerid" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."member_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "member_sessions_select" ON "public"."member_sessions" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."user_in_org_admin"("organization_id", ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "opportunities_delete_own" ON "public"."investment_opportunities" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "opportunities_insert_own" ON "public"."investment_opportunities" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "opportunities_select_own" ON "public"."investment_opportunities" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "opportunities_update_own" ON "public"."investment_opportunities" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "org_member_scopes_select" ON "public"."organization_member_scopes" FOR SELECT TO "authenticated" USING ("public"."user_in_org"("organization_id", ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."organization_ai_credentials" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_member_scopes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "organization_members_insert_admin" ON "public"."organization_members" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "organization_members_select_self" ON "public"."organization_members" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "organizations_select_member" ON "public"."organizations" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "m"
  WHERE (("m"."organization_id" = "organizations"."id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "organizations_select_members" ON "public"."organizations" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "m"
  WHERE (("m"."organization_id" = "organizations"."id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."payment_records" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payment_records_access" ON "public"."payment_records" FOR SELECT TO "authenticated" USING ((("payer_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("payee_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "payments_ins" ON "public"."payment_records" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "payments_sel" ON "public"."payment_records" FOR SELECT TO "authenticated" USING (("public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid")) AND (("payer_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("payee_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."transaction_cases" "c"
  WHERE (("c"."id" = "payment_records"."transaction_case_id") AND (("c"."seller_user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("c"."buyer_user_id" = ( SELECT "auth"."uid"() AS "uid")))))))));



ALTER TABLE "public"."planning_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "planning_events_delete_own" ON "public"."planning_events" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "planning_events_insert_own" ON "public"."planning_events" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "planning_events_select_own" ON "public"."planning_events" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "planning_events_update_own" ON "public"."planning_events" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "policies_delete_own" ON "public"."insurance_policies" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "policies_insert_own" ON "public"."insurance_policies" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "policies_select_own" ON "public"."insurance_policies" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "policies_update_own" ON "public"."insurance_policies" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



ALTER TABLE "public"."price_observations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pro_clients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pro_clients_delete_own" ON "public"."pro_clients" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "pro_clients_select_own" ON "public"."pro_clients" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."processed_stripe_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."promo_codes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."promo_redemptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."quote_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "quote_requests_insert_anon" ON "public"."quote_requests" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "quote_requests_insert_authenticated" ON "public"."quote_requests" FOR INSERT TO "authenticated" WITH CHECK ((("buyer_user_id" IS NOT NULL) AND ("buyer_user_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "quote_requests_select_party" ON "public"."quote_requests" FOR SELECT TO "authenticated" USING (((("seller_id" IS NOT NULL) AND ("seller_id" = ( SELECT "auth"."uid"() AS "uid"))) OR (("buyer_user_id" IS NOT NULL) AND ("buyer_user_id" = ( SELECT "auth"."uid"() AS "uid"))) OR (("buyer_email" IS NOT NULL) AND ("lower"(TRIM(BOTH FROM "buyer_email")) = "lower"(TRIM(BOTH FROM COALESCE(("auth"."jwt"() ->> 'email'::"text"), ''::"text")))) AND ("length"(TRIM(BOTH FROM COALESCE(("auth"."jwt"() ->> 'email'::"text"), ''::"text"))) > 0))));



CREATE POLICY "quote_requests_update_party" ON "public"."quote_requests" FOR UPDATE TO "authenticated" USING (((("seller_id" IS NOT NULL) AND ("seller_id" = ( SELECT "auth"."uid"() AS "uid"))) OR (("buyer_user_id" IS NOT NULL) AND ("buyer_user_id" = ( SELECT "auth"."uid"() AS "uid"))) OR (("buyer_email" IS NOT NULL) AND ("lower"(TRIM(BOTH FROM "buyer_email")) = "lower"(TRIM(BOTH FROM COALESCE(("auth"."jwt"() ->> 'email'::"text"), ''::"text"))))))) WITH CHECK (((("seller_id" IS NOT NULL) AND ("seller_id" = ( SELECT "auth"."uid"() AS "uid"))) OR (("buyer_user_id" IS NOT NULL) AND ("buyer_user_id" = ( SELECT "auth"."uid"() AS "uid"))) OR (("buyer_email" IS NOT NULL) AND ("lower"(TRIM(BOTH FROM "buyer_email")) = "lower"(TRIM(BOTH FROM COALESCE(("auth"."jwt"() ->> 'email'::"text"), ''::"text")))))));



ALTER TABLE "public"."rental_invoices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rental_invoices_delete_own" ON "public"."rental_invoices" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "rental_invoices_insert_own" ON "public"."rental_invoices" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "rental_invoices_select_auth" ON "public"."rental_invoices" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "rental_invoices_update_own" ON "public"."rental_invoices" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



ALTER TABLE "public"."rentals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rentals_delete_own" ON "public"."rentals" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "rentals_insert_own" ON "public"."rentals" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "rentals_select_auth" ON "public"."rentals" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "rentals_update_own" ON "public"."rentals" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



ALTER TABLE "public"."repairs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "repairs_delete_own" ON "public"."repairs" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "repairs_insert_own" ON "public"."repairs" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "repairs_select_own" ON "public"."repairs" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "repairs_update_own" ON "public"."repairs" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



ALTER TABLE "public"."stock_orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stock_orders_insert_own" ON "public"."stock_orders" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "stock_orders_select_own" ON "public"."stock_orders" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "stock_orders_update_own" ON "public"."stock_orders" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tasks_delete_own" ON "public"."tasks" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "tasks_insert_own" ON "public"."tasks" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "tasks_select_own" ON "public"."tasks" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "tasks_update_own" ON "public"."tasks" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



ALTER TABLE "public"."technicians" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "technicians_delete_own" ON "public"."technicians" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "technicians_insert_own" ON "public"."technicians" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "technicians_select_own" ON "public"."technicians" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "created_by") OR (( SELECT "auth"."uid"() AS "uid") = "user_id")));



CREATE POLICY "technicians_update_own" ON "public"."technicians" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



ALTER TABLE "public"."tenders_ai_usage_daily" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transaction_cases" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "transaction_cases_delete" ON "public"."transaction_cases" FOR DELETE TO "authenticated" USING (("seller_user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "transaction_cases_insert" ON "public"."transaction_cases" FOR INSERT TO "authenticated" WITH CHECK ((("seller_user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("buyer_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("seller_user_id" IS NOT NULL) AND ("seller_user_id" <> ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "transaction_cases_select" ON "public"."transaction_cases" FOR SELECT TO "authenticated" USING ("public"."can_access_transaction_case"("id", ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "transaction_cases_update" ON "public"."transaction_cases" FOR UPDATE TO "authenticated" USING ((("seller_user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("buyer_user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("organization_id" IS NOT NULL) AND "public"."user_in_org_admin"("organization_id", ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK ((("seller_user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("buyer_user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("organization_id" IS NOT NULL) AND "public"."user_in_org_admin"("organization_id", ( SELECT "auth"."uid"() AS "uid")))));



ALTER TABLE "public"."transaction_documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "transaction_documents_delete" ON "public"."transaction_documents" FOR DELETE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."transaction_cases" "c"
  WHERE (("c"."id" = "transaction_documents"."transaction_case_id") AND ("c"."seller_user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."transaction_participants" "p"
  WHERE (("p"."case_id" = "transaction_documents"."transaction_case_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."revoked_at" IS NULL) AND ("p"."role" = 'admin_delegate'::"text"))))));



CREATE POLICY "transaction_documents_insert" ON "public"."transaction_documents" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "transaction_documents_select" ON "public"."transaction_documents" FOR SELECT TO "authenticated" USING (("public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid")) AND ((NOT "requires_consent") OR ("consent_status" = 'granted'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."transaction_participants" "p"
  WHERE (("p"."case_id" = "transaction_documents"."transaction_case_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."revoked_at" IS NULL) AND ("p"."role" = ANY (ARRAY['seller'::"text", 'buyer'::"text", 'admin_delegate'::"text"]))))))));



CREATE POLICY "transaction_documents_update" ON "public"."transaction_documents" FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."transaction_cases" "c"
  WHERE (("c"."id" = "transaction_documents"."transaction_case_id") AND ("c"."seller_user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."transaction_participants" "p"
  WHERE (("p"."case_id" = "transaction_documents"."transaction_case_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."revoked_at" IS NULL) AND ((("p"."role" = 'buyer'::"text") AND ("transaction_documents"."uploaded_by" = ( SELECT "auth"."uid"() AS "uid"))) OR ("p"."role" = ANY (ARRAY['broker'::"text", 'admin_delegate'::"text"])))))))) WITH CHECK ("public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."transaction_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "transaction_events_insert" ON "public"."transaction_events" FOR INSERT TO "authenticated" WITH CHECK (("public"."can_access_transaction_case"("case_id", ( SELECT "auth"."uid"() AS "uid")) AND (("actor_user_id" IS NULL) OR ("actor_user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "transaction_events_select" ON "public"."transaction_events" FOR SELECT TO "authenticated" USING ("public"."can_access_transaction_case"("case_id", ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."transaction_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "transaction_messages_access" ON "public"."transaction_messages" TO "authenticated" USING ((("sender_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid")))) WITH CHECK ((("sender_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."transaction_participants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "transaction_participants_insert" ON "public"."transaction_participants" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."transaction_cases" "c"
  WHERE (("c"."id" = "transaction_participants"."case_id") AND ("c"."seller_user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."transaction_cases" "c"
  WHERE (("c"."id" = "transaction_participants"."case_id") AND ("c"."buyer_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("transaction_participants"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("transaction_participants"."role" = 'buyer'::"text")))) OR (EXISTS ( SELECT 1
   FROM "public"."transaction_cases" "c"
  WHERE (("c"."id" = "transaction_participants"."case_id") AND ("c"."buyer_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("transaction_participants"."user_id" = "c"."seller_user_id") AND ("transaction_participants"."role" = 'seller'::"text")))) OR (EXISTS ( SELECT 1
   FROM "public"."transaction_participants" "p"
  WHERE (("p"."case_id" = "p"."case_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."revoked_at" IS NULL) AND ("p"."role" = ANY (ARRAY['broker'::"text", 'admin_delegate'::"text"])))))));



CREATE POLICY "transaction_participants_select" ON "public"."transaction_participants" FOR SELECT TO "authenticated" USING ("public"."can_access_transaction_case"("case_id", ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "transaction_participants_update" ON "public"."transaction_participants" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."transaction_cases" "c"
  WHERE (("c"."id" = "transaction_participants"."case_id") AND ("c"."seller_user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."transaction_tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "transaction_tasks_access" ON "public"."transaction_tasks" TO "authenticated" USING ("public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK ("public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "transport_req_select" ON "public"."transport_requests" FOR SELECT TO "authenticated" USING ("public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "transport_req_update_carrier" ON "public"."transport_requests" FOR UPDATE TO "authenticated" USING (("public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid")) AND (("transporter_id" IS NULL) OR ("transporter_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "transport_req_write" ON "public"."transport_requests" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."transport_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "transport_requests_access" ON "public"."transport_requests" FOR SELECT TO "authenticated" USING ((("transporter_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "transport_requests_update" ON "public"."transport_requests" FOR UPDATE TO "authenticated" USING ((("transporter_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "transport_requests_write" ON "public"."transport_requests" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."transport_routes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "transport_routes_delete_own" ON "public"."transport_routes" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "transport_routes_insert_own" ON "public"."transport_routes" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "transport_routes_select_own" ON "public"."transport_routes" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "transport_routes_update_own" ON "public"."transport_routes" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "tx_documents_modify" ON "public"."transaction_documents" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "tx_documents_select" ON "public"."transaction_documents" FOR SELECT TO "authenticated" USING (("public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid")) AND (("visibility_scope" <> 'broker_only'::"text") OR ((EXISTS ( SELECT 1
   FROM "public"."transaction_participants" "p"
  WHERE (("p"."case_id" = "transaction_documents"."transaction_case_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = 'broker'::"text") AND ("p"."revoked_at" IS NULL)))) AND (("requires_consent" = false) OR ("consent_status" = 'granted'::"text")))) AND (("visibility_scope" <> 'forwarder_only'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."transaction_participants" "p"
  WHERE (("p"."case_id" = "transaction_documents"."transaction_case_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = 'forwarder'::"text") AND ("p"."revoked_at" IS NULL)))))));



CREATE POLICY "tx_documents_update" ON "public"."transaction_documents" FOR UPDATE TO "authenticated" USING ("public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "tx_messages_insert" ON "public"."transaction_messages" FOR INSERT TO "authenticated" WITH CHECK (("public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid")) AND ("sender_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "tx_messages_select" ON "public"."transaction_messages" FOR SELECT TO "authenticated" USING ("public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "tx_tasks_select" ON "public"."transaction_tasks" FOR SELECT TO "authenticated" USING ("public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "tx_tasks_update" ON "public"."transaction_tasks" FOR UPDATE TO "authenticated" USING ("public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "tx_tasks_write" ON "public"."transaction_tasks" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_access_transaction_case"("transaction_case_id", ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."user_invitations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_invitations_select_admin" ON "public"."user_invitations" FOR SELECT USING ("public"."user_in_org_admin"("organization_id", ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."vehicles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vehicles_delete_own" ON "public"."vehicles" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "vehicles_insert_own" ON "public"."vehicles" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "vehicles_select_own" ON "public"."vehicles" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "vehicles_update_own" ON "public"."vehicles" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



ALTER TABLE "public"."vitrines" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."_escrow_status_to_payment"("p_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_escrow_status_to_payment"("p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_escrow_status_to_payment"("p_status" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_escrow_to_price_observation"() TO "anon";
GRANT ALL ON FUNCTION "public"."_escrow_to_price_observation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_escrow_to_price_observation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_tc_can_invite"("p_case_id" "uuid", "p_uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."_tc_can_invite"("p_case_id" "uuid", "p_uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_tc_can_invite"("p_case_id" "uuid", "p_uid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."_tc_is_party"("p_case_id" "uuid", "p_uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."_tc_is_party"("p_case_id" "uuid", "p_uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_tc_is_party"("p_case_id" "uuid", "p_uid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."_tc_participant_of_role"("p_case_id" "uuid", "p_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_tc_participant_of_role"("p_case_id" "uuid", "p_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_tc_participant_of_role"("p_case_id" "uuid", "p_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_tc_sync_payment_from_escrow"() TO "anon";
GRANT ALL ON FUNCTION "public"."_tc_sync_payment_from_escrow"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_tc_sync_payment_from_escrow"() TO "service_role";



GRANT ALL ON FUNCTION "public"."accept_invitation"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_invitation"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_invitation"("p_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."advance_transaction_case_step"("p_case_id" "uuid", "p_step" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."advance_transaction_case_step"("p_case_id" "uuid", "p_step" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."advance_transaction_case_step"("p_case_id" "uuid", "p_step" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."assign_transaction_partner"("p_case_id" "uuid", "p_role" "text", "p_partner_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."assign_transaction_partner"("p_case_id" "uuid", "p_role" "text", "p_partner_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_transaction_partner"("p_case_id" "uuid", "p_role" "text", "p_partner_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_document_insert_fn"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_document_insert_fn"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_document_insert_fn"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."bump_ai_usage"("p_org" "uuid", "p_daily_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bump_ai_usage"("p_org" "uuid", "p_daily_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."bump_ai_usage"("p_org" "uuid", "p_daily_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."bump_ai_usage"("p_org" "uuid", "p_daily_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."bump_tenders_usage"("p_user" "uuid", "p_daily_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bump_tenders_usage"("p_user" "uuid", "p_daily_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."bump_tenders_usage"("p_user" "uuid", "p_daily_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."bump_tenders_usage"("p_user" "uuid", "p_daily_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."can_access_lead"("p_lead_id" "uuid", "p_uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_access_lead"("p_lead_id" "uuid", "p_uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_lead"("p_lead_id" "uuid", "p_uid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_access_transaction_case"("p_case_id" "uuid", "p_uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_access_transaction_case"("p_case_id" "uuid", "p_uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_transaction_case"("p_case_id" "uuid", "p_uid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_finance_actor"("p_case_id" "uuid", "p_uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_finance_actor"("p_case_id" "uuid", "p_uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_finance_actor"("p_case_id" "uuid", "p_uid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_view_assigned_inspection"("p_inspection" "uuid", "p_uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_view_assigned_inspection"("p_inspection" "uuid", "p_uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_assigned_inspection"("p_inspection" "uuid", "p_uid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."cancel_invitation"("p_invitation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_invitation"("p_invitation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_invitation"("p_invitation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."clear_org_ai_key"() TO "anon";
GRANT ALL ON FUNCTION "public"."clear_org_ai_key"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."clear_org_ai_key"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."contact_messages_antispam_fn"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."contact_messages_antispam_fn"() TO "anon";
GRANT ALL ON FUNCTION "public"."contact_messages_antispam_fn"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."contact_messages_antispam_fn"() TO "service_role";



GRANT ALL ON FUNCTION "public"."courtier_compute_credit_commission"() TO "anon";
GRANT ALL ON FUNCTION "public"."courtier_compute_credit_commission"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."courtier_compute_credit_commission"() TO "service_role";



GRANT ALL ON FUNCTION "public"."courtier_compute_policy_commission"() TO "anon";
GRANT ALL ON FUNCTION "public"."courtier_compute_policy_commission"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."courtier_compute_policy_commission"() TO "service_role";



GRANT ALL ON FUNCTION "public"."courtier_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."courtier_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."courtier_set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_customs_step"("p_case_id" "uuid", "p_origin" "text", "p_destination" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_customs_step"("p_case_id" "uuid", "p_origin" "text", "p_destination" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_customs_step"("p_case_id" "uuid", "p_origin" "text", "p_destination" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_financing_step"("p_case_id" "uuid", "p_amount" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."create_financing_step"("p_case_id" "uuid", "p_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_financing_step"("p_case_id" "uuid", "p_amount" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."create_inspection_step"("p_case_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_inspection_step"("p_case_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_inspection_step"("p_case_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_invitation"("p_email" "text", "p_name" "text", "p_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_invitation"("p_email" "text", "p_name" "text", "p_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_invitation"("p_email" "text", "p_name" "text", "p_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_payment_step"("p_case_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_payment_step"("p_case_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_payment_step"("p_case_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_transport_step"("p_case_id" "uuid", "p_pickup" "text", "p_delivery" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_transport_step"("p_case_id" "uuid", "p_pickup" "text", "p_delivery" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_transport_step"("p_case_id" "uuid", "p_pickup" "text", "p_delivery" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_my_account"() TO "anon";
GRANT ALL ON FUNCTION "public"."delete_my_account"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_my_account"() TO "service_role";



GRANT ALL ON FUNCTION "public"."documents_force_owner_fn"() TO "anon";
GRANT ALL ON FUNCTION "public"."documents_force_owner_fn"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."documents_force_owner_fn"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_transaction_case_for_quote_request"("p_quote_request_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_transaction_case_for_quote_request"("p_quote_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_transaction_case_for_quote_request"("p_quote_request_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."exchange_rates"() TO "anon";
GRANT ALL ON FUNCTION "public"."exchange_rates"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."exchange_rates"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_effective_subscription"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_effective_subscription"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_effective_subscription"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_member_sessions"("p_user_id" "uuid", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_member_sessions"("p_user_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_member_sessions"("p_user_id" "uuid", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_member_scope"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_member_scope"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_member_scope"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_org_ai_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_org_ai_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_org_ai_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_org_members"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_org_members"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_org_members"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_org_session_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_org_session_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_org_session_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."investisseur_compute_opportunity_metrics"() TO "anon";
GRANT ALL ON FUNCTION "public"."investisseur_compute_opportunity_metrics"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."investisseur_compute_opportunity_metrics"() TO "service_role";



GRANT ALL ON FUNCTION "public"."investisseur_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."investisseur_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."investisseur_set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_org_staff_for_case"("p_case_id" "uuid", "p_uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_org_staff_for_case"("p_case_id" "uuid", "p_uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_staff_for_case"("p_case_id" "uuid", "p_uid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."leads_guard_fn"() TO "anon";
GRANT ALL ON FUNCTION "public"."leads_guard_fn"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."leads_guard_fn"() TO "service_role";



GRANT ALL ON FUNCTION "public"."link_case_to_escrow"("p_case_id" "uuid", "p_escrow_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."link_case_to_escrow"("p_case_id" "uuid", "p_escrow_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."link_case_to_escrow"("p_case_id" "uuid", "p_escrow_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."logisticien_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."logisticien_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."logisticien_set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."machine_category_counts"() TO "anon";
GRANT ALL ON FUNCTION "public"."machine_category_counts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."machine_category_counts"() TO "service_role";



GRANT ALL ON FUNCTION "public"."machine_engagement_counts"("p_machine_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."machine_engagement_counts"("p_machine_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."machine_engagement_counts"("p_machine_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."mecanicien_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."mecanicien_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."mecanicien_set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."open_case_escrow"("p_case_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."open_case_escrow"("p_case_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."open_case_escrow"("p_case_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."quote_requests_after_insert_sync_lead"() TO "anon";
GRANT ALL ON FUNCTION "public"."quote_requests_after_insert_sync_lead"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."quote_requests_after_insert_sync_lead"() TO "service_role";



GRANT ALL ON FUNCTION "public"."quote_requests_after_update_sync_lead_case"() TO "anon";
GRANT ALL ON FUNCTION "public"."quote_requests_after_update_sync_lead_case"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."quote_requests_after_update_sync_lead_case"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."quote_requests_antispam_fn"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."quote_requests_antispam_fn"() TO "anon";
GRANT ALL ON FUNCTION "public"."quote_requests_antispam_fn"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."quote_requests_antispam_fn"() TO "service_role";



GRANT ALL ON FUNCTION "public"."record_session_login"("p_user_agent" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."record_session_login"("p_user_agent" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_session_login"("p_user_agent" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."record_session_logout"("p_session_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."record_session_logout"("p_session_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_session_logout"("p_session_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."redeem_promo_code"("p_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."redeem_promo_code"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."redeem_promo_code"("p_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."remove_org_member"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."remove_org_member"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."remove_org_member"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_org_member"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."revoke_transaction_partner"("p_case_id" "uuid", "p_participant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."revoke_transaction_partner"("p_case_id" "uuid", "p_participant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."revoke_transaction_partner"("p_case_id" "uuid", "p_participant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_member_scope"("p_user_id" "uuid", "p_commercial" boolean, "p_tenders" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."set_member_scope"("p_user_id" "uuid", "p_commercial" boolean, "p_tenders" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_member_scope"("p_user_id" "uuid", "p_commercial" boolean, "p_tenders" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_org_ai_key"("p_provider" "text", "p_api_key" "text", "p_model" "text", "p_base_url" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_org_ai_key"("p_provider" "text", "p_api_key" "text", "p_model" "text", "p_base_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_org_ai_key"("p_provider" "text", "p_api_key" "text", "p_model" "text", "p_base_url" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_org_member_role"("p_user_id" "uuid", "p_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_org_member_role"("p_user_id" "uuid", "p_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_org_member_role"("p_user_id" "uuid", "p_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_org_member_role"("p_user_id" "uuid", "p_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_intervention_scheduled_date"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_intervention_scheduled_date"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_intervention_scheduled_date"() TO "service_role";



GRANT ALL ON FUNCTION "public"."transaction_cases_after_insert_audit"() TO "anon";
GRANT ALL ON FUNCTION "public"."transaction_cases_after_insert_audit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."transaction_cases_after_insert_audit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."transaction_cases_after_insert_link_quote_request"() TO "anon";
GRANT ALL ON FUNCTION "public"."transaction_cases_after_insert_link_quote_request"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."transaction_cases_after_insert_link_quote_request"() TO "service_role";



GRANT ALL ON FUNCTION "public"."transaction_cases_after_insert_seed_participants"() TO "anon";
GRANT ALL ON FUNCTION "public"."transaction_cases_after_insert_seed_participants"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."transaction_cases_after_insert_seed_participants"() TO "service_role";



GRANT ALL ON FUNCTION "public"."transaction_cases_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."transaction_cases_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."transaction_cases_set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."transitaire_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."transitaire_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."transitaire_set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."transporteur_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."transporteur_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."transporteur_set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."user_in_org"("p_organization_id" "uuid", "p_uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_in_org"("p_organization_id" "uuid", "p_uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_in_org"("p_organization_id" "uuid", "p_uid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_in_org_admin"("p_organization_id" "uuid", "p_uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_in_org_admin"("p_organization_id" "uuid", "p_uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_in_org_admin"("p_organization_id" "uuid", "p_uid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."vitrines_force_owner_fn"() TO "anon";
GRANT ALL ON FUNCTION "public"."vitrines_force_owner_fn"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."vitrines_force_owner_fn"() TO "service_role";


















GRANT ALL ON TABLE "public"."ai_usage_daily" TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."bank_offers" TO "anon";
GRANT ALL ON TABLE "public"."bank_offers" TO "authenticated";
GRANT ALL ON TABLE "public"."bank_offers" TO "service_role";



GRANT ALL ON TABLE "public"."broker_cases" TO "anon";
GRANT ALL ON TABLE "public"."broker_cases" TO "authenticated";
GRANT ALL ON TABLE "public"."broker_cases" TO "service_role";



GRANT ALL ON TABLE "public"."broker_clients" TO "anon";
GRANT ALL ON TABLE "public"."broker_clients" TO "authenticated";
GRANT ALL ON TABLE "public"."broker_clients" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."commission_records" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."commission_records" TO "authenticated";
GRANT ALL ON TABLE "public"."commission_records" TO "service_role";



GRANT ALL ON TABLE "public"."contact_messages" TO "service_role";
GRANT INSERT ON TABLE "public"."contact_messages" TO "anon";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."contact_messages" TO "authenticated";



GRANT ALL ON TABLE "public"."credit_applications" TO "anon";
GRANT ALL ON TABLE "public"."credit_applications" TO "authenticated";
GRANT ALL ON TABLE "public"."credit_applications" TO "service_role";



GRANT ALL ON TABLE "public"."customs_cases" TO "anon";
GRANT ALL ON TABLE "public"."customs_cases" TO "authenticated";
GRANT ALL ON TABLE "public"."customs_cases" TO "service_role";



GRANT ALL ON TABLE "public"."customs_declarations" TO "anon";
GRANT ALL ON TABLE "public"."customs_declarations" TO "authenticated";
GRANT ALL ON TABLE "public"."customs_declarations" TO "service_role";



GRANT ALL ON TABLE "public"."deliveries" TO "anon";
GRANT ALL ON TABLE "public"."deliveries" TO "authenticated";
GRANT ALL ON TABLE "public"."deliveries" TO "service_role";



GRANT ALL ON TABLE "public"."devis" TO "authenticated";
GRANT ALL ON TABLE "public"."devis" TO "service_role";



GRANT ALL ON TABLE "public"."documents" TO "anon";
GRANT ALL ON TABLE "public"."documents" TO "authenticated";
GRANT ALL ON TABLE "public"."documents" TO "service_role";



GRANT ALL ON TABLE "public"."drivers" TO "anon";
GRANT ALL ON TABLE "public"."drivers" TO "authenticated";
GRANT ALL ON TABLE "public"."drivers" TO "service_role";



GRANT ALL ON TABLE "public"."enterprise_dashboard_configs" TO "authenticated";
GRANT ALL ON TABLE "public"."enterprise_dashboard_configs" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."escrow_events" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."escrow_events" TO "authenticated";
GRANT ALL ON TABLE "public"."escrow_events" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."escrow_transactions" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."escrow_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."escrow_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."financing_requests" TO "anon";
GRANT ALL ON TABLE "public"."financing_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."financing_requests" TO "service_role";



GRANT ALL ON TABLE "public"."freight_containers" TO "anon";
GRANT ALL ON TABLE "public"."freight_containers" TO "authenticated";
GRANT ALL ON TABLE "public"."freight_containers" TO "service_role";



GRANT ALL ON TABLE "public"."freight_documents" TO "anon";
GRANT ALL ON TABLE "public"."freight_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."freight_documents" TO "service_role";



GRANT ALL ON TABLE "public"."freight_monthly_volumes" TO "anon";
GRANT ALL ON TABLE "public"."freight_monthly_volumes" TO "authenticated";
GRANT ALL ON TABLE "public"."freight_monthly_volumes" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."inspection_reports" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."inspection_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."inspection_reports" TO "service_role";



GRANT ALL ON TABLE "public"."inspection_requests" TO "anon";
GRANT ALL ON TABLE "public"."inspection_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."inspection_requests" TO "service_role";



GRANT ALL ON TABLE "public"."insurance_policies" TO "anon";
GRANT ALL ON TABLE "public"."insurance_policies" TO "authenticated";
GRANT ALL ON TABLE "public"."insurance_policies" TO "service_role";



GRANT ALL ON TABLE "public"."interventions" TO "anon";
GRANT ALL ON TABLE "public"."interventions" TO "authenticated";
GRANT ALL ON TABLE "public"."interventions" TO "service_role";



GRANT ALL ON TABLE "public"."inventory" TO "anon";
GRANT ALL ON TABLE "public"."inventory" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory" TO "service_role";



GRANT ALL ON TABLE "public"."investment_opportunities" TO "anon";
GRANT ALL ON TABLE "public"."investment_opportunities" TO "authenticated";
GRANT ALL ON TABLE "public"."investment_opportunities" TO "service_role";



GRANT ALL ON TABLE "public"."investments" TO "anon";
GRANT ALL ON TABLE "public"."investments" TO "authenticated";
GRANT ALL ON TABLE "public"."investments" TO "service_role";



GRANT ALL ON TABLE "public"."leads" TO "anon";
GRANT ALL ON TABLE "public"."leads" TO "authenticated";
GRANT ALL ON TABLE "public"."leads" TO "service_role";



GRANT ALL ON TABLE "public"."logistics_route_tracking" TO "anon";
GRANT ALL ON TABLE "public"."logistics_route_tracking" TO "authenticated";
GRANT ALL ON TABLE "public"."logistics_route_tracking" TO "service_role";



GRANT ALL ON TABLE "public"."logistics_scm_kpis_monthly" TO "anon";
GRANT ALL ON TABLE "public"."logistics_scm_kpis_monthly" TO "authenticated";
GRANT ALL ON TABLE "public"."logistics_scm_kpis_monthly" TO "service_role";



GRANT ALL ON TABLE "public"."logistics_stock_alerts" TO "anon";
GRANT ALL ON TABLE "public"."logistics_stock_alerts" TO "authenticated";
GRANT ALL ON TABLE "public"."logistics_stock_alerts" TO "service_role";



GRANT ALL ON TABLE "public"."logistics_tasks" TO "anon";
GRANT ALL ON TABLE "public"."logistics_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."logistics_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."logistics_warehouses" TO "anon";
GRANT ALL ON TABLE "public"."logistics_warehouses" TO "authenticated";
GRANT ALL ON TABLE "public"."logistics_warehouses" TO "service_role";



GRANT ALL ON TABLE "public"."machine_views" TO "service_role";
GRANT INSERT ON TABLE "public"."machine_views" TO "anon";
GRANT SELECT,INSERT ON TABLE "public"."machine_views" TO "authenticated";



GRANT ALL ON TABLE "public"."machines" TO "anon";
GRANT ALL ON TABLE "public"."machines" TO "authenticated";
GRANT ALL ON TABLE "public"."machines" TO "service_role";



GRANT ALL ON TABLE "public"."member_sessions" TO "service_role";
GRANT SELECT ON TABLE "public"."member_sessions" TO "authenticated";



GRANT ALL ON TABLE "public"."organization_ai_credentials" TO "service_role";



GRANT ALL ON TABLE "public"."organization_member_scopes" TO "service_role";
GRANT SELECT ON TABLE "public"."organization_member_scopes" TO "authenticated";



GRANT ALL ON TABLE "public"."organization_members" TO "anon";
GRANT ALL ON TABLE "public"."organization_members" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_members" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."payment_records" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."payment_records" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_records" TO "service_role";



GRANT ALL ON TABLE "public"."planning_events" TO "authenticated";
GRANT ALL ON TABLE "public"."planning_events" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."price_observations" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."price_observations" TO "authenticated";
GRANT ALL ON TABLE "public"."price_observations" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."pro_clients" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."pro_clients" TO "authenticated";
GRANT ALL ON TABLE "public"."pro_clients" TO "service_role";



GRANT ALL ON TABLE "public"."processed_stripe_events" TO "service_role";



GRANT ALL ON TABLE "public"."promo_codes" TO "service_role";



GRANT ALL ON TABLE "public"."promo_redemptions" TO "service_role";



GRANT ALL ON TABLE "public"."quote_requests" TO "anon";
GRANT ALL ON TABLE "public"."quote_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."quote_requests" TO "service_role";



GRANT ALL ON TABLE "public"."rental_invoices" TO "anon";
GRANT ALL ON TABLE "public"."rental_invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."rental_invoices" TO "service_role";



GRANT ALL ON TABLE "public"."rentals" TO "anon";
GRANT ALL ON TABLE "public"."rentals" TO "authenticated";
GRANT ALL ON TABLE "public"."rentals" TO "service_role";



GRANT ALL ON TABLE "public"."repairs" TO "anon";
GRANT ALL ON TABLE "public"."repairs" TO "authenticated";
GRANT ALL ON TABLE "public"."repairs" TO "service_role";



GRANT ALL ON TABLE "public"."stock_orders" TO "anon";
GRANT ALL ON TABLE "public"."stock_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_orders" TO "service_role";



GRANT ALL ON TABLE "public"."tasks" TO "anon";
GRANT ALL ON TABLE "public"."tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."tasks" TO "service_role";



GRANT ALL ON TABLE "public"."technicians" TO "anon";
GRANT ALL ON TABLE "public"."technicians" TO "authenticated";
GRANT ALL ON TABLE "public"."technicians" TO "service_role";



GRANT ALL ON TABLE "public"."tenders_ai_usage_daily" TO "service_role";



GRANT ALL ON TABLE "public"."transaction_cases" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE ON TABLE "public"."transaction_cases" TO "authenticated";
GRANT ALL ON TABLE "public"."transaction_cases" TO "service_role";



GRANT UPDATE("title") ON TABLE "public"."transaction_cases" TO "authenticated";



GRANT UPDATE("notes") ON TABLE "public"."transaction_cases" TO "authenticated";



GRANT UPDATE("priority") ON TABLE "public"."transaction_cases" TO "authenticated";



GRANT ALL ON TABLE "public"."transaction_documents" TO "anon";
GRANT ALL ON TABLE "public"."transaction_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."transaction_documents" TO "service_role";



GRANT ALL ON TABLE "public"."transaction_events" TO "anon";
GRANT ALL ON TABLE "public"."transaction_events" TO "authenticated";
GRANT ALL ON TABLE "public"."transaction_events" TO "service_role";



GRANT ALL ON TABLE "public"."transaction_messages" TO "anon";
GRANT ALL ON TABLE "public"."transaction_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."transaction_messages" TO "service_role";



GRANT ALL ON TABLE "public"."transaction_participants" TO "anon";
GRANT ALL ON TABLE "public"."transaction_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."transaction_participants" TO "service_role";



GRANT ALL ON TABLE "public"."transaction_tasks" TO "anon";
GRANT ALL ON TABLE "public"."transaction_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."transaction_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."transport_requests" TO "anon";
GRANT ALL ON TABLE "public"."transport_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."transport_requests" TO "service_role";



GRANT ALL ON TABLE "public"."transport_routes" TO "anon";
GRANT ALL ON TABLE "public"."transport_routes" TO "authenticated";
GRANT ALL ON TABLE "public"."transport_routes" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."user_invitations" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."user_invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."user_invitations" TO "service_role";



GRANT ALL ON TABLE "public"."vehicles" TO "anon";
GRANT ALL ON TABLE "public"."vehicles" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicles" TO "service_role";



GRANT ALL ON TABLE "public"."vitrines" TO "anon";
GRANT ALL ON TABLE "public"."vitrines" TO "authenticated";
GRANT ALL ON TABLE "public"."vitrines" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































