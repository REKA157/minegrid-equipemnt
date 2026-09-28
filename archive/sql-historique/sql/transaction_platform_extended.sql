/*
  Plateforme transactionnelle etendue — EXECUTER APRES transaction_platform_core.sql
  Ajoute : organisations, colonnes dossier, tables metiers liees au dossier, RLS, audit documents.
*/

-- =====================================================================
-- 1. Organisations (multi-site MVP)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organization_members (
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'viewer'
    CHECK (role IN ('owner', 'admin', 'manager', 'viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS organization_members_user_idx
  ON public.organization_members (user_id);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organizations_select_member ON public.organizations;
CREATE POLICY organizations_select_member ON public.organizations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.organization_id = organizations.id AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS organization_members_select_self ON public.organization_members;
CREATE POLICY organization_members_select_self ON public.organization_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT ON public.organizations TO authenticated;
GRANT SELECT ON public.organization_members TO authenticated;

-- =====================================================================
-- 2. Enrichissement transaction_cases / participants / events
-- =====================================================================
ALTER TABLE public.transaction_cases
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL;
ALTER TABLE public.transaction_cases
  ADD COLUMN IF NOT EXISTS stage text;
ALTER TABLE public.transaction_cases
  ADD COLUMN IF NOT EXISTS priority text DEFAULT 'medium';
ALTER TABLE public.transaction_cases
  ADD COLUMN IF NOT EXISTS total_amount numeric(18,2);
ALTER TABLE public.transaction_cases
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'MAD';

CREATE INDEX IF NOT EXISTS transaction_cases_org_idx
  ON public.transaction_cases (organization_id)
  WHERE organization_id IS NOT NULL;

ALTER TABLE public.transaction_participants
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL;
ALTER TABLE public.transaction_participants
  ADD COLUMN IF NOT EXISTS permissions jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.transaction_participants
  ADD COLUMN IF NOT EXISTS participant_status text DEFAULT 'active';

ALTER TABLE public.transaction_events
  ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.transaction_events
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.transaction_events.payload IS 'Donnees brutes legacy ; preferer metadata lorsque pertinent.';

CREATE OR REPLACE FUNCTION public.user_in_org_admin(p_organization_id uuid, p_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = p_organization_id
      AND m.user_id = p_uid
      AND m.role IN ('owner', 'admin', 'manager')
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_in_org_admin(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_access_transaction_case(p_case_id uuid, p_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.transaction_cases c
    WHERE c.id = p_case_id
      AND (c.seller_user_id = p_uid OR c.buyer_user_id = p_uid)
  )
  OR EXISTS (
    SELECT 1 FROM public.transaction_participants p
    WHERE p.case_id = p_case_id AND p.user_id = p_uid AND p.revoked_at IS NULL
  )
  OR EXISTS (
    SELECT 1 FROM public.transaction_cases c
    WHERE c.id = p_case_id
      AND c.organization_id IS NOT NULL
      AND public.user_in_org_admin(c.organization_id, p_uid)
  );
$$;

-- Politiques participant : acheteur createur peut s'auto-inscrire, vendeur peut inviter des tiers

DROP POLICY IF EXISTS transaction_participants_insert ON public.transaction_participants;
CREATE POLICY transaction_participants_insert ON public.transaction_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.transaction_cases c
      WHERE c.id = case_id AND c.seller_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.transaction_cases c
      WHERE c.id = case_id AND c.buyer_user_id = auth.uid()
        AND user_id = auth.uid() AND role = 'buyer'
    )
    OR EXISTS (
      SELECT 1 FROM public.transaction_cases c
      WHERE c.id = case_id AND c.buyer_user_id = auth.uid()
        AND user_id = c.seller_user_id AND role = 'seller'
    )
    OR EXISTS (
      SELECT 1 FROM public.transaction_participants p
      WHERE p.case_id = transaction_participants.case_id
        AND p.user_id = auth.uid() AND p.revoked_at IS NULL
        AND p.role IN ('broker', 'admin_delegate')
    )
  );

-- =====================================================================
-- 3. Audit & tables metiers
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  organization_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  transaction_case_id uuid REFERENCES public.transaction_cases (id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS transaction_case_id uuid REFERENCES public.transaction_cases (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS audit_logs_transaction_case_idx
  ON public.audit_logs (transaction_case_id, created_at DESC)
  WHERE transaction_case_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON public.audit_logs (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON public.audit_logs (actor_id);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_logs_select_org ON public.audit_logs;
CREATE POLICY audit_logs_select_org ON public.audit_logs
  FOR SELECT TO authenticated
  USING (
    actor_id = auth.uid()
    OR (
      organization_id IS NOT NULL
      AND public.user_in_org_admin(organization_id, auth.uid())
    )
    OR (
      transaction_case_id IS NOT NULL
      AND public.can_access_transaction_case(transaction_case_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS audit_logs_insert_own ON public.audit_logs;
CREATE POLICY audit_logs_insert_own ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (actor_id IS NULL OR actor_id = auth.uid());

GRANT SELECT, INSERT ON public.audit_logs TO authenticated;

CREATE TABLE IF NOT EXISTS public.transaction_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_case_id uuid NOT NULL REFERENCES public.transaction_cases (id) ON DELETE CASCADE,
  uploaded_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  document_type text NOT NULL DEFAULT 'OTHER',
  title text,
  file_path text NOT NULL DEFAULT '',
  storage_bucket text DEFAULT 'transaction-documents',
  visibility_scope text DEFAULT 'participant',
  allowed_roles text[] DEFAULT '{}',
  requires_consent boolean NOT NULL DEFAULT false,
  consent_status text DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transaction_documents_case_idx ON public.transaction_documents (transaction_case_id);

CREATE OR REPLACE FUNCTION public.audit_document_insert_fn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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

DROP TRIGGER IF EXISTS trg_audit_transaction_documents_ins ON public.transaction_documents;
CREATE TRIGGER trg_audit_transaction_documents_ins
  AFTER INSERT ON public.transaction_documents
  FOR EACH ROW EXECUTE FUNCTION public.audit_document_insert_fn();

ALTER TABLE public.transaction_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS transaction_documents_select ON public.transaction_documents;
CREATE POLICY transaction_documents_select ON public.transaction_documents
  FOR SELECT TO authenticated
  USING (
    public.can_access_transaction_case(transaction_case_id, auth.uid())
    AND (
      NOT requires_consent
      OR consent_status = 'granted'
      OR EXISTS (
        SELECT 1 FROM public.transaction_participants p
        WHERE p.case_id = transaction_documents.transaction_case_id
          AND p.user_id = auth.uid()
          AND p.revoked_at IS NULL
          AND p.role IN ('seller', 'buyer', 'admin_delegate')
      )
    )
  );

DROP POLICY IF EXISTS transaction_documents_insert ON public.transaction_documents;
DROP POLICY IF EXISTS transaction_documents_update ON public.transaction_documents;
DROP POLICY IF EXISTS transaction_documents_delete ON public.transaction_documents;
CREATE POLICY transaction_documents_insert ON public.transaction_documents
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_transaction_case(transaction_case_id, auth.uid()));
CREATE POLICY transaction_documents_update ON public.transaction_documents
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.transaction_cases c
      WHERE c.id = transaction_documents.transaction_case_id AND c.seller_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.transaction_participants p
      WHERE p.case_id = transaction_documents.transaction_case_id
        AND p.user_id = auth.uid() AND p.revoked_at IS NULL
        AND (
          (p.role = 'buyer' AND transaction_documents.uploaded_by = auth.uid())
          OR p.role IN ('broker', 'admin_delegate')
        )
    )
  )
  WITH CHECK (public.can_access_transaction_case(transaction_case_id, auth.uid()));
CREATE POLICY transaction_documents_delete ON public.transaction_documents
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.transaction_cases c
      WHERE c.id = transaction_documents.transaction_case_id AND c.seller_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.transaction_participants p
      WHERE p.case_id = transaction_documents.transaction_case_id AND p.user_id = auth.uid()
        AND p.revoked_at IS NULL AND p.role = 'admin_delegate'
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transaction_documents TO authenticated;

CREATE TABLE IF NOT EXISTS public.transaction_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_case_id uuid NOT NULL REFERENCES public.transaction_cases (id) ON DELETE CASCADE,
  assigned_to uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  role text,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'open',
  due_date timestamptz,
  priority text DEFAULT 'medium',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transaction_tasks_case_idx ON public.transaction_tasks (transaction_case_id);

ALTER TABLE public.transaction_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS transaction_tasks_access ON public.transaction_tasks;
CREATE POLICY transaction_tasks_access ON public.transaction_tasks
  FOR ALL TO authenticated
  USING (public.can_access_transaction_case(transaction_case_id, auth.uid()))
  WITH CHECK (public.can_access_transaction_case(transaction_case_id, auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transaction_tasks TO authenticated;

CREATE TABLE IF NOT EXISTS public.transaction_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_case_id uuid NOT NULL REFERENCES public.transaction_cases (id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  message text NOT NULL,
  visibility_scope text DEFAULT 'participants',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transaction_messages_case_idx ON public.transaction_messages (transaction_case_id);

ALTER TABLE public.transaction_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS transaction_messages_access ON public.transaction_messages;
CREATE POLICY transaction_messages_access ON public.transaction_messages
  FOR ALL TO authenticated
  USING (
    sender_id = auth.uid()
    OR public.can_access_transaction_case(transaction_case_id, auth.uid())
  )
  WITH CHECK (
    sender_id = auth.uid()
    AND public.can_access_transaction_case(transaction_case_id, auth.uid())
  );
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transaction_messages TO authenticated;

CREATE TABLE IF NOT EXISTS public.financing_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_case_id uuid NOT NULL REFERENCES public.transaction_cases (id) ON DELETE CASCADE,
  buyer_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  broker_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  requested_amount numeric(18,2),
  currency text DEFAULT 'MAD',
  status text NOT NULL DEFAULT 'draft',
  documents_status text,
  scoring_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS financing_requests_case_idx ON public.financing_requests (transaction_case_id);
CREATE INDEX IF NOT EXISTS financing_requests_broker_idx ON public.financing_requests (broker_id) WHERE broker_id IS NOT NULL;

ALTER TABLE public.financing_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS financing_requests_access ON public.financing_requests;
CREATE POLICY financing_requests_access ON public.financing_requests
  FOR SELECT TO authenticated
  USING (public.can_access_transaction_case(transaction_case_id, auth.uid()));
DROP POLICY IF EXISTS financing_requests_write ON public.financing_requests;
CREATE POLICY financing_requests_write ON public.financing_requests
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_transaction_case(transaction_case_id, auth.uid()));
DROP POLICY IF EXISTS financing_requests_update ON public.financing_requests;
CREATE POLICY financing_requests_update ON public.financing_requests
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.transaction_participants p
      WHERE p.case_id = transaction_case_id AND p.user_id = auth.uid()
        AND p.revoked_at IS NULL AND (p.role IN ('broker', 'seller', 'buyer', 'admin_delegate'))
    )
  );
GRANT SELECT, INSERT, UPDATE ON public.financing_requests TO authenticated;

CREATE TABLE IF NOT EXISTS public.broker_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_case_id uuid NOT NULL REFERENCES public.transaction_cases (id) ON DELETE CASCADE,
  broker_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  case_status text NOT NULL DEFAULT 'open',
  commission_rate numeric(8,4),
  commission_amount numeric(18,2),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (transaction_case_id, broker_id)
);

CREATE INDEX IF NOT EXISTS broker_cases_broker_idx ON public.broker_cases (broker_id);

ALTER TABLE public.broker_cases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS broker_cases_select ON public.broker_cases;
CREATE POLICY broker_cases_select ON public.broker_cases
  FOR SELECT TO authenticated
  USING (
    broker_id = auth.uid()
    OR public.can_access_transaction_case(transaction_case_id, auth.uid())
  );
DROP POLICY IF EXISTS broker_cases_write ON public.broker_cases;
CREATE POLICY broker_cases_write ON public.broker_cases
  FOR INSERT TO authenticated
  WITH CHECK (broker_id = auth.uid());
DROP POLICY IF EXISTS broker_cases_update_own ON public.broker_cases;
CREATE POLICY broker_cases_update_own ON public.broker_cases
  FOR UPDATE TO authenticated
  USING (
    broker_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.transaction_cases tc
      WHERE tc.id = transaction_case_id
        AND tc.organization_id IS NOT NULL
        AND public.user_in_org_admin(tc.organization_id, auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.transaction_cases tc
      WHERE tc.id = transaction_case_id AND tc.seller_user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.broker_cases TO authenticated;

CREATE TABLE IF NOT EXISTS public.inspection_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_case_id uuid NOT NULL REFERENCES public.transaction_cases (id) ON DELETE CASCADE,
  machine_id uuid,
  requested_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'requested',
  scheduled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inspection_requests_assignee_idx ON public.inspection_requests (assigned_to) WHERE assigned_to IS NOT NULL;

ALTER TABLE public.inspection_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inspection_requests_access ON public.inspection_requests;
CREATE POLICY inspection_requests_access ON public.inspection_requests
  FOR SELECT TO authenticated
  USING (
    assigned_to = auth.uid()
    OR requested_by = auth.uid()
    OR public.can_access_transaction_case(transaction_case_id, auth.uid())
  );
DROP POLICY IF EXISTS inspection_requests_write ON public.inspection_requests;
CREATE POLICY inspection_requests_write ON public.inspection_requests
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_transaction_case(transaction_case_id, auth.uid()));
DROP POLICY IF EXISTS inspection_requests_update ON public.inspection_requests;
CREATE POLICY inspection_requests_update ON public.inspection_requests
  FOR UPDATE TO authenticated
  USING (
    assigned_to = auth.uid()
    OR public.can_access_transaction_case(transaction_case_id, auth.uid())
  );
GRANT SELECT, INSERT, UPDATE ON public.inspection_requests TO authenticated;

CREATE TABLE IF NOT EXISTS public.inspection_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_request_id uuid NOT NULL REFERENCES public.inspection_requests (id) ON DELETE CASCADE,
  transaction_case_id uuid NOT NULL REFERENCES public.transaction_cases (id) ON DELETE CASCADE,
  mechanic_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  condition_score integer,
  summary text,
  photos jsonb DEFAULT '[]'::jsonb,
  recommendations text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inspection_reports_case_idx ON public.inspection_reports (transaction_case_id);

ALTER TABLE public.inspection_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inspection_reports_access ON public.inspection_reports;
CREATE POLICY inspection_reports_access ON public.inspection_reports
  FOR SELECT TO authenticated
  USING (
    mechanic_id = auth.uid()
    OR public.can_access_transaction_case(transaction_case_id, auth.uid())
  );
DROP POLICY IF EXISTS inspection_reports_write ON public.inspection_reports;
CREATE POLICY inspection_reports_write ON public.inspection_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    mechanic_id = auth.uid()
    OR public.can_access_transaction_case(transaction_case_id, auth.uid())
  );
DROP POLICY IF EXISTS inspection_reports_update ON public.inspection_reports;
CREATE POLICY inspection_reports_update ON public.inspection_reports
  FOR UPDATE TO authenticated
  USING (mechanic_id = auth.uid() OR public.can_access_transaction_case(transaction_case_id, auth.uid()));

GRANT SELECT, INSERT, UPDATE ON public.inspection_reports TO authenticated;

CREATE TABLE IF NOT EXISTS public.transport_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_case_id uuid NOT NULL REFERENCES public.transaction_cases (id) ON DELETE CASCADE,
  transporter_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  pickup_location text,
  delivery_location text,
  machine_weight numeric(12,2),
  machine_dimensions text,
  status text NOT NULL DEFAULT 'requested',
  eta timestamptz,
  proof_of_delivery_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transport_requests_transporter_idx ON public.transport_requests (transporter_id) WHERE transporter_id IS NOT NULL;

ALTER TABLE public.transport_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS transport_requests_access ON public.transport_requests;
CREATE POLICY transport_requests_access ON public.transport_requests
  FOR SELECT TO authenticated
  USING (
    transporter_id = auth.uid()
    OR public.can_access_transaction_case(transaction_case_id, auth.uid())
  );
DROP POLICY IF EXISTS transport_requests_write ON public.transport_requests;
CREATE POLICY transport_requests_write ON public.transport_requests
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_transaction_case(transaction_case_id, auth.uid()));
DROP POLICY IF EXISTS transport_requests_update ON public.transport_requests;
CREATE POLICY transport_requests_update ON public.transport_requests
  FOR UPDATE TO authenticated
  USING (transporter_id = auth.uid() OR public.can_access_transaction_case(transaction_case_id, auth.uid()));

GRANT SELECT, INSERT, UPDATE ON public.transport_requests TO authenticated;

CREATE TABLE IF NOT EXISTS public.customs_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_case_id uuid NOT NULL REFERENCES public.transaction_cases (id) ON DELETE CASCADE,
  forwarder_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  origin_country text,
  destination_country text,
  customs_status text NOT NULL DEFAULT 'opened',
  required_documents jsonb DEFAULT '[]'::jsonb,
  missing_documents jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.customs_cases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customs_cases_access ON public.customs_cases;
CREATE POLICY customs_cases_access ON public.customs_cases
  FOR SELECT TO authenticated
  USING (
    forwarder_id = auth.uid()
    OR public.can_access_transaction_case(transaction_case_id, auth.uid())
  );
DROP POLICY IF EXISTS customs_cases_write ON public.customs_cases;
CREATE POLICY customs_cases_write ON public.customs_cases
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_transaction_case(transaction_case_id, auth.uid()));
DROP POLICY IF EXISTS customs_cases_update ON public.customs_cases;
CREATE POLICY customs_cases_update ON public.customs_cases
  FOR UPDATE TO authenticated
  USING (forwarder_id = auth.uid() OR public.can_access_transaction_case(transaction_case_id, auth.uid()));

GRANT SELECT, INSERT, UPDATE ON public.customs_cases TO authenticated;

CREATE TABLE IF NOT EXISTS public.logistics_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_case_id uuid NOT NULL REFERENCES public.transaction_cases (id) ON DELETE CASCADE,
  logistician_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  task_type text NOT NULL DEFAULT 'storage',
  location text,
  status text NOT NULL DEFAULT 'open',
  scheduled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.logistics_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS logistics_tasks_access ON public.logistics_tasks;
CREATE POLICY logistics_tasks_access ON public.logistics_tasks
  FOR SELECT TO authenticated
  USING (
    logistician_id = auth.uid()
    OR public.can_access_transaction_case(transaction_case_id, auth.uid())
  );
DROP POLICY IF EXISTS logistics_tasks_write ON public.logistics_tasks;
CREATE POLICY logistics_tasks_write ON public.logistics_tasks
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_transaction_case(transaction_case_id, auth.uid()));
DROP POLICY IF EXISTS logistics_tasks_update ON public.logistics_tasks;
CREATE POLICY logistics_tasks_update ON public.logistics_tasks
  FOR UPDATE TO authenticated
  USING (logistician_id = auth.uid() OR public.can_access_transaction_case(transaction_case_id, auth.uid()));

GRANT SELECT, INSERT, UPDATE ON public.logistics_tasks TO authenticated;

CREATE TABLE IF NOT EXISTS public.payment_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_case_id uuid NOT NULL REFERENCES public.transaction_cases (id) ON DELETE CASCADE,
  payer_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  payee_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  amount numeric(18,2) NOT NULL DEFAULT 0,
  currency text DEFAULT 'MAD',
  payment_type text NOT NULL DEFAULT 'transfer',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_records_access ON public.payment_records;
CREATE POLICY payment_records_access ON public.payment_records
  FOR SELECT TO authenticated
  USING (
    payer_id = auth.uid() OR payee_id = auth.uid()
    OR public.can_access_transaction_case(transaction_case_id, auth.uid())
  );
DROP POLICY IF EXISTS payment_records_write ON public.payment_records;
CREATE POLICY payment_records_write ON public.payment_records
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_transaction_case(transaction_case_id, auth.uid()));
DROP POLICY IF EXISTS payment_records_update ON public.payment_records;
CREATE POLICY payment_records_update ON public.payment_records
  FOR UPDATE TO authenticated
  USING (public.can_access_transaction_case(transaction_case_id, auth.uid()));

GRANT SELECT, INSERT, UPDATE ON public.payment_records TO authenticated;

CREATE TABLE IF NOT EXISTS public.commission_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_case_id uuid NOT NULL REFERENCES public.transaction_cases (id) ON DELETE CASCADE,
  beneficiary_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  role text NOT NULL DEFAULT 'broker',
  commission_type text DEFAULT 'broker',
  amount numeric(18,2),
  currency text DEFAULT 'MAD',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.commission_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS commission_records_access ON public.commission_records;
CREATE POLICY commission_records_access ON public.commission_records
  FOR SELECT TO authenticated
  USING (
    beneficiary_id = auth.uid()
    OR public.can_access_transaction_case(transaction_case_id, auth.uid())
  );
DROP POLICY IF EXISTS commission_records_write ON public.commission_records;
CREATE POLICY commission_records_write ON public.commission_records
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_transaction_case(transaction_case_id, auth.uid()));
DROP POLICY IF EXISTS commission_records_update ON public.commission_records;
CREATE POLICY commission_records_update ON public.commission_records
  FOR UPDATE TO authenticated
  USING (beneficiary_id = auth.uid() OR public.can_access_transaction_case(transaction_case_id, auth.uid()));

GRANT SELECT, INSERT, UPDATE ON public.commission_records TO authenticated;
