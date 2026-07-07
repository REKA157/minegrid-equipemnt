-- SCÉNARIO DE PREUVE : le verbe « recalculer » s'exécute-t-il réellement ?
\set U '11111111-1111-1111-1111-111111111111'
\set P '22222222-2222-2222-2222-222222222222'

insert into auth.users (id) values (:'U');

-- Profil créé il y a 200 jours, score 0 / unverified (état AVANT).
insert into public.trust_profiles (id, user_id, created_at, updated_at, trust_score, trust_tier)
values (:'P', :'U', now() - interval '200 days', now() - interval '200 days', 0, 'unverified');

\echo '--- AVANT (aucune vérification approuvée) ---'
select trust_score, trust_tier, verified_at is not null as verified from public.trust_profiles where id = :'P';

-- Le service_role approuve 2 pièces (chaque INSERT = 1 transaction -> le trigger tourne).
insert into public.verifications (trust_profile_id, kind, status) values (:'P', 'identity', 'approved');
insert into public.verifications (trust_profile_id, kind, status) values (:'P', 'company_registration', 'approved');

\echo '--- APRÈS APPROBATION (le trigger a-t-il recalculé ?) ---'
select trust_score, trust_tier, verified_at is not null as verified,
       (updated_at > created_at) as recalcule_par_trigger
from public.trust_profiles where id = :'P';

-- Contrôle anti-façade : une pièce 'pending' ne doit RIEN changer.
insert into public.verifications (trust_profile_id, kind, status) values (:'P', 'tax_id', 'pending');
\echo '--- Après une pièce PENDING (doit rester identique) ---'
select trust_score, trust_tier from public.trust_profiles where id = :'P';

-- ASSERTIONS (échec = exit != 0 grâce à ON_ERROR_STOP).
do $$
declare v record;
begin
  select trust_score, trust_tier, verified_at is not null as verified, (updated_at > created_at) as recompute
    into v from public.trust_profiles where id = '22222222-2222-2222-2222-222222222222';

  if v.trust_score <> 35 then
    raise exception 'ECHEC: score attendu 35 (identité 15 + RC 15 + ancienneté 5), obtenu %', v.trust_score;
  end if;
  if v.trust_tier <> 'basic' then
    raise exception 'ECHEC: tier attendu basic, obtenu %', v.trust_tier;
  end if;
  if not v.verified then
    raise exception 'ECHEC: verified_at nul malgre identite approuvee';
  end if;
  if not v.recompute then
    raise exception 'ECHEC: updated_at non posterieur -> le trigger ne s est pas declenche';
  end if;

  raise notice '======================================================';
  raise notice 'OK — verbe RECALCULER prouve : score 0 -> 35, tier unverified -> basic,';
  raise notice 'verified_at pose, updated_at > created_at (trigger declenche par approbation).';
  raise notice 'Une piece PENDING n a rien change (pas de facade).';
  raise notice '======================================================';
end $$;
