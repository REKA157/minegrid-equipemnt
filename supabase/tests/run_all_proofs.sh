#!/usr/bin/env bash
# Rejoue TOUS les harnais RLS/RPC (prereq + migration + countercases) sur une base
# jetable. Utilisé en CI (job rls-proofs) ET en local. Échec = exit != 0.
#
# Chaque ligne du manifeste : <test_base>|<migration1>[,<migration2>...]
# La base est réinitialisée (drop schema public/auth) entre chaque harnais.
set -uo pipefail

PSQL=${PSQL:-"psql -v ON_ERROR_STOP=1 -U postgres -d test"}
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MIG="$ROOT/supabase/migrations"
TST="$ROOT/supabase/tests"

# test_base | migration(s) (dans l'ordre)
MANIFEST=$(cat <<'EOF'
p3_restrict_cases|20260702090400_p3_restrict_transaction_cases_update.sql
p8_commission_lock|20260711170000_p8_lock_commission_records.sql
p9_finance_scoring|20260711180000_p9_lock_finance_scoring.sql
p10_inspection_reports_lock|20260711190000_p10_lock_inspection_reports.sql
p11_payment_relock|20260711200000_p11_relock_payment_records_prod.sql
p12_audit_logs|20260711210000_p12_lock_audit_logs.sql
p14_pro_clients|20260711230000_p14_lock_pro_clients.sql
p15_promo_codes|20260711240000_p15_promo_codes.sql
teamF_scopes|20260710120000_teamF_member_scopes.sql
teamG_vitrines|20260711120000_teamG_vitrines_rls.sql
teamG_documents|20260711130000_teamG_documents_rls.sql
teamH_sessions|20260711140000_teamH_member_sessions.sql
teamI_planning_devis|20260711150000_teamI_planning_devis_rls.sql
p22_initplan|20260714120000_p22_optimize_rls_initplan.sql,20260714120000_p22_optimize_rls_initplan.sql
p23_antispam|20260714130000_p23_antispam_public_inserts.sql
p24_tenders_quota|20260714140000_p24_tenders_ai_quota.sql
p21_engagement|20260711300000_p21_machine_engagement_counts.sql
p21_engagement_missing|20260711300000_p21_machine_engagement_counts.sql
p19_org_admin|20260711280000_p19_org_member_admin.sql
p25_org_membership|20260708140000_teamC_invitations.sql,20260812120000_p25_org_membership_hardening.sql
EOF
)

# </dev/null : évite que `docker exec -i` (dans $PSQL) ne consomme le stdin du while-read.
reset_db() { $PSQL -c "drop schema if exists public cascade; create schema public; drop schema if exists auth cascade;" </dev/null >/dev/null 2>&1; }

fail=0
while IFS='|' read -r base migs; do
  [ -z "$base" ] && continue
  reset_db
  files=("$TST/$base.prereq.sql")
  IFS=',' read -ra arr <<< "$migs"
  for m in "${arr[@]}"; do files+=("$MIG/$m"); done
  files+=("$TST/$base.countercases.sql")
  if cat "${files[@]}" | $PSQL >/dev/null 2>/tmp/proof_err; then
    echo "PASS  $base"
  else
    echo "FAIL  $base"; sed 's/^/      /' /tmp/proof_err | tail -3; fail=1
  fi
done <<< "$MANIFEST"

if [ "$fail" -ne 0 ]; then echo "== DES HARNAIS ONT ÉCHOUÉ =="; exit 1; fi
echo "== TOUS LES HARNAIS PASSENT =="
