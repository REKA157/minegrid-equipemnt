-- ============================================================================
-- P7g - Concurrence sur l'espace de travail AO (MG-M07)
-- ============================================================================
-- CONSTAT
--   `save_my_tender_workspace` remplace l'INTEGRALITE du JSON de l'organisation
--   en last-write-wins. Deux membres qui editent en parallele : le second
--   ecrase silencieusement le travail du premier. Aucune detection, aucune
--   alerte, perte de donnees invisible.
--
-- CORRECTIF
--   Verrouillage optimiste par version. Le client transmet la version qu'il a
--   lue ; l'ecriture n'est appliquee que si elle n'a pas bouge. Sinon la RPC
--   signale le conflit et renvoie l'etat courant, a charge pour l'interface de
--   proposer une fusion ou un rechargement.
--
--   Choix d'une version entiere plutot qu'un timestamp : deux ecritures dans la
--   meme milliseconde produiraient le meme timestamp et le conflit passerait
--   inapercu.
--
--   La compatibilite ascendante est conservee : un appel SANS version se
--   comporte comme avant (ecrasement). C'est deliberé — le front sera migre
--   progressivement — mais la RPC renvoie desormais toujours la version
--   courante, ce qui permet au client de s'aligner des le premier appel.
-- ============================================================================

alter table public.tender_workspaces
  add column if not exists version bigint not null default 1;

create or replace function public.save_my_tender_workspace(
  p_data jsonb,
  p_expected_version bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn_save_tw$
declare
  v_org uuid;
  v_clean jsonb;
  v_current bigint;
  v_new_version bigint;
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
    return jsonb_build_object('ok', false, 'reason', 'no_writable_org');
  end if;

  -- MG-H04 : les cles de role/permission ne transitent jamais par ce JSON.
  v_clean := coalesce(p_data, '{}'::jsonb)
             - 'roleAssignments'
             - 'role_assignments'
             - 'permissions'
             - 'members'
             - 'memberRoles';

  -- Verrou pessimiste le temps de la comparaison de version : deux appels
  -- concurrents sont serialises, donc le second voit bien la version ecrite
  -- par le premier.
  select version into v_current
    from public.tender_workspaces
   where organization_id = v_org
   for update;

  if not found then
    insert into public.tender_workspaces
      (organization_id, data, updated_at, updated_by, version)
    values (v_org, v_clean, now(), auth.uid(), 1);
    return jsonb_build_object('ok', true, 'version', 1, 'organization_id', v_org);
  end if;

  -- MG-M07 : conflit detecte, rien n'est ecrase.
  if p_expected_version is not null and p_expected_version <> v_current then
    return jsonb_build_object(
      'ok', false,
      'reason', 'version_conflict',
      'current_version', v_current,
      'current_data', (select data from public.tender_workspaces
                        where organization_id = v_org)
    );
  end if;

  v_new_version := v_current + 1;

  update public.tender_workspaces
     set data = v_clean,
         updated_at = now(),
         updated_by = auth.uid(),
         version = v_new_version
   where organization_id = v_org
     and version = v_current;

  return jsonb_build_object('ok', true, 'version', v_new_version,
                            'organization_id', v_org);
end;
$fn_save_tw$;

grant execute on function public.save_my_tender_workspace(jsonb, bigint) to authenticated;

-- Lecture : le client doit connaitre la version pour pouvoir la renvoyer.
create or replace function public.get_my_tender_workspace()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
           'organization_id', tw.organization_id,
           'data', tw.data,
           'version', tw.version,
           'updated_at', tw.updated_at
         )
    from public.tender_workspaces tw
    join public.organization_members om
      on om.organization_id = tw.organization_id
   where om.user_id = auth.uid()
   limit 1;
$$;

grant execute on function public.get_my_tender_workspace() to authenticated;

comment on function public.save_my_tender_workspace(jsonb, bigint) is
  'Ecriture de l''espace AO. Verrou optimiste par version (MG-M07) ; cles de role retirees du payload (MG-H04).';

-- ---------------------------------------------------------------------------
-- SUPPRESSION DE L'ANCIENNE SURCHARGE — defaut trouve en revue adverse.
--
-- `create or replace function` avec un parametre supplementaire ne REMPLACE pas
-- l'ancienne fonction : il cree une SURCHARGE. `save_my_tender_workspace(jsonb)`
-- survivait donc, sans verrou de version, et PostgREST y resolvait tout appel
-- ne passant qu'un seul argument — c'est-a-dire l'appel du front actuel.
-- MG-M07 restait ainsi entierement contournable.
--
-- Une seule signature doit exister : sinon la garantie depend de la signature
-- que l'appelant choisit, ce qui n'est pas une garantie.
-- ---------------------------------------------------------------------------
drop function if exists public.save_my_tender_workspace(jsonb);
