-- ============================================================================
-- P7c - Separation effective des roles
-- Ferme MG-H04 (auto-elevation admin AO) et MG-H06 (policies permissives)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- MG-H06 : policies permissives annulant la separation des metiers
--
-- AVANT : chaque policy UPDATE metier s'ecrivait
--           (role_specifique = uid) OR can_access_transaction_case(case, uid)
--         La seconde branche est vraie pour TOUTE partie prenante. Le controle
--         de role qui la precede n'avait donc aucun effet : l'audit a montre un
--         investisseur modifiant douane, transport, inspection et financement.
--         En RLS, plusieurs policies PERMISSIVE se combinent par OR : ajouter une
--         policy large ne restreint pas, elle ouvre.
-- APRES : une policy par action, avec le role metier exige POSITIVEMENT.
--         Les principals gardent la main sur leur dossier mais n'heritent pas
--         de l'execution des metiers partenaires.
-- ---------------------------------------------------------------------------

-- CHOIX TECHNIQUE DETERMINANT : policies RESTRICTIVE, pas PERMISSIVE.
-- En PostgreSQL, les policies PERMISSIVE se combinent par OR : ajouter une
-- policy stricte a cote d'une policy large n'a AUCUN effet restrictif. C'est
-- exactement le mecanisme de MG-H06. Les policies RESTRICTIVE se combinent par
-- AND : elles s'appliquent EN PLUS de toutes les autres, y compris celles
-- heritees de migrations anterieures ou ajoutees plus tard.
-- On neutralise donc le risque structurellement, sans avoir a inventorier
-- exhaustivement les policies permissives existantes.

-- --- DOUANE : seul le transitaire assigne ou un principal ------------------
drop policy if exists "customs_cases_update" on public.customs_cases;
drop policy if exists "customs_rest_update_role" on public.customs_cases;
create policy "customs_rest_update_role"
  on public.customs_cases as restrictive for update to authenticated
  using (
    forwarder_id = (select auth.uid())
    or public._tc_is_principal(transaction_case_id, (select auth.uid()))
  );

-- --- FINANCEMENT : seul un financeur accepte ou un principal ---------------
drop policy if exists "financing_update" on public.financing_requests;
drop policy if exists "financing_rest_update_role" on public.financing_requests;
create policy "financing_rest_update_role"
  on public.financing_requests as restrictive for update to authenticated
  using (
    public._tc_has_role(transaction_case_id, (select auth.uid()), 'investor')
    or public._tc_has_role(transaction_case_id, (select auth.uid()), 'financier')
    or public._tc_is_principal(transaction_case_id, (select auth.uid()))
  );

-- --- INSPECTION : seul le mecanicien assigne (principals exclus) -----------
-- Plus strict a dessein : sinon MG-H07 se rouvre par UPDATE direct en
-- contournant la RPC durcie en P7b.
drop policy if exists "inspection_requests_update" on public.inspection_requests;
drop policy if exists "inspection_rest_update_mechanic" on public.inspection_requests;
create policy "inspection_rest_update_mechanic"
  on public.inspection_requests as restrictive for update to authenticated
  using (assigned_to = (select auth.uid()));

-- --- TRANSPORT : seul le transporteur assigne ou un principal --------------
-- La policy permissive transport_req_update_carrier autorisait toute partie
-- prenante des que transporter_id etait NULL : la restrictive la neutralise.
drop policy if exists "transport_requests_update" on public.transport_requests;
drop policy if exists "transport_rest_update_role" on public.transport_requests;
create policy "transport_rest_update_role"
  on public.transport_requests as restrictive for update to authenticated
  using (
    transporter_id = (select auth.uid())
    or public._tc_is_principal(transaction_case_id, (select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- MG-H04 : auto-elevation manager -> admin dans l'espace AO
--
-- AVANT : save_my_tender_workspace acceptait un JSON arbitraire et l'ecrivait
--         tel quel. Un manager y placait {roleAssignments:[{memberId:self,
--         role:'admin'}]} ; le frontend hydratait ensuite ce role depuis le JSON.
--         Le role d'un membre devenait donc une donnee ECRITE PAR LUI-MEME.
-- APRES : les champs de role sont retires du payload cote serveur. La source
--         d'autorite reste organization_members. Une RPC dediee expose le role
--         reel au frontend, qui ne doit plus lire roleAssignments.
-- ---------------------------------------------------------------------------

create or replace function public.save_my_tender_workspace(p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn_save_tw$
declare
  v_org uuid;
  v_clean jsonb;
begin
  v_org := (
    select om.organization_id
    from public.organization_members om
    where om.user_id = auth.uid()
      and om.role in ('owner', 'admin', 'manager')
    order by (om.role = 'owner') desc, om.created_at asc
    limit 1
  );

  if v_org is null then
    return null;
  end if;

  -- Assainissement : aucune cle liee aux roles/permissions ne peut transiter
  -- par ce JSON, quel que soit le role de l'appelant. Les roles ne sont pas
  -- une donnee de document ; ils vivent dans organization_members.
  v_clean := coalesce(p_data, '{}'::jsonb)
             - 'roleAssignments'
             - 'role_assignments'
             - 'permissions'
             - 'members'
             - 'memberRoles';

  insert into public.tender_workspaces (organization_id, data, updated_at, updated_by)
  values (v_org, v_clean, now(), auth.uid())
  on conflict (organization_id)
  do update set data = excluded.data, updated_at = now(), updated_by = auth.uid();

  return v_org;
end;
$fn_save_tw$;

-- Source d'autorite du role, pour que le frontend cesse de lire le JSON.
create or replace function public.get_my_org_role()
returns table(organization_id uuid, role text)
language sql stable security definer set search_path = public
as $$
  select om.organization_id, om.role
  from public.organization_members om
  where om.user_id = auth.uid();
$$;

grant execute on function public.get_my_org_role() to authenticated;

comment on function public.save_my_tender_workspace(jsonb) is
  'Espace AO. Les cles de role/permission sont retirees du payload : la source d''autorite est organization_members (MG-H04).';
comment on function public.get_my_org_role() is
  'Role organisationnel faisant foi. Le frontend doit l''utiliser au lieu de workspace.roleAssignments (MG-H04).';
