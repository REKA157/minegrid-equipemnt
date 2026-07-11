# COVERAGE_MATRIX — Cartographie des modules (Phase 0, initial)

> Statut initial = photographie de départ, **non prouvé**. La preuve viendra aux phases 2–4.
> « RLS local » = un harnais de preuve Docker existe dans `supabase/tests/`.

## Chaîne métier cible
`annonce → demande de devis → lead → dossier → participants → inspection → financement → transport → douane → escrow → clôture`

## Modules

| Module | UI (route/page) | Logique | Tables principales | Autorité d'écriture | RLS | Tests | Statut initial |
|---|---|---|---|---|---|---|---|
| Annonces | `#publication`,`#vendre`,`#machines` | PublicationRapide, Machines | `machines`, `machine_views`, `machine_history` | trigger `machines_force_owner` | migration p3 (owner) | — | NON VÉRIFIÉ |
| Demande de devis | `#devis` | DevisGenerator | `devis`, `quote_requests` | client (`user_id=auth.uid`) | teamI (local) + sql/ | vitest quoteCorrelation | NON VÉRIFIÉ |
| Leads / pipeline | `#leads`,`#opportunites-vente` | realPipelineService | `leads` | trigger `leads_guard` | teamA (local) | teamA countercases | NON VÉRIFIÉ |
| Dossier transaction | `#dossiers`,`#dossier` | transaction_platform | `transaction_cases`, `transaction_tasks`, `transaction_events` | RPC `can_access_transaction_case` | migrations p2/p3 + sql/ | — | NON VÉRIFIÉ |
| Participants | dossier | — | `transaction_participants`, `transaction_documents`, `transaction_messages` | sql/ participant_* | sql/ | — | NON VÉRIFIÉ |
| Inspection | dashboards métier | nextgen/inspection | `inspection_requests/reports/media`, `inspectors` | sql/nextgen | sql/ | vitest inspectionGrade | NON VÉRIFIÉ |
| Financement | `#financement` | FinancingRequest, nextgen/finance | `finance_applications`, `financing_requests`, `finance_partners` | sql/nextgen | sql/ | vitest monthlyPayment/scoreApplication | NON VÉRIFIÉ |
| Transport / logistique | `#transporteur`,`#logisticien` | nextgen/logistics | `transport_requests`, `logistics_quotes/tasks` | sql/deploy_* | sql/ | vitest quoteEstimate | NON VÉRIFIÉ |
| Douane | `#transitaire` | métier transitaire | `customs_cases` | sql/deploy_transitaire | sql/ | — | NON VÉRIFIÉ |
| Escrow / paiement | escrow flow + Stripe | escrowStateMachine, edge functions | `escrow_transactions/events`, `payment_records`, `commission_records` | edge (create-payment, stripe-webhook, escrow-webhook) + `p3_lock_payment_records` | migration p3 + sql/ | vitest escrowStateMachine | NON VÉRIFIÉ |
| Trust Score | badges, dashboards | computeTrustScore | `trust_profiles`, `verifications` | trigger `verifications_recompute` (recompute serveur) | migration p7 (local) | p7 countercases + vitest computeTrustScore | NON VÉRIFIÉ |
| Global Monitor | `#global-monitor`,`#admin-sources` | monitorApi → FastAPI | `market_projects/alerts`, `price_observations`, `ai_predictions` | service externe (X-Admin-Token) | externe | vitest monitorCorrelation | NON VÉRIFIÉ |
| Dashboards métiers | `#dashboard-*-display`,`#pro`,`#premium-dashboard` | cockpit builders | `enterprise_dashboard_configs` | client (user_id) | teamJ (local) | 9 vitest cockpit builders | NON VÉRIFIÉ |
| Notifications | header/toasts | — | `platform_events`, `audit_logs` | ? | ? | — | NON VÉRIFIÉ |
| Documents | `#documents` | DocumentsEspace | `documents` (+ bucket Storage `documents`) | trigger `documents_force_owner` | teamG (local) | — | NON VÉRIFIÉ |
| Vitrine | `#vitrine` | VitrinePersonnalisee | `vitrines` | trigger `vitrines_force_owner` | teamG (local) | — | NON VÉRIFIÉ |
| Planning | `#planning` | PlanningPro | `planning_events` | client (user_id) | teamI (local) | — | NON VÉRIFIÉ |
| Organisation / équipe | `#multi-user-management` | MultiUserManagement | `organizations`, `organization_members`, `organization_member_scopes` | RPC (owner/admin) | teamA/B/F (local) | teamB/F countercases | NON VÉRIFIÉ |
| Invitations | `#accepter-invitation` | AcceptInvitation | `user_invitations` | RPC create/accept/cancel | teamC (local) | teamC countercases | NON VÉRIFIÉ |
| Abonnements | RequireSubscription | subscription.ts | `pro_clients` (sql/) | RPC `get_effective_subscription` | teamD (local) | teamD countercases + RequireSubscription.test | NON VÉRIFIÉ |
| Assistant IA (BYO key) | `#assistant-ia` | AiSettings | `organization_ai_credentials` | RPC set/get/clear | teamE (local) | teamE countercases | NON VÉRIFIÉ |
| Sessions | `#multi-user-management` | sessions.ts | `member_sessions` | RPC login/logout | teamH (local) | teamH countercases | NON VÉRIFIÉ |
| Broker / commissions | `#courtier` | métier courtier | `broker_cases`, `commission_records` | sql/deploy_courtier | sql/ | vitest buildCourtierCockpit | NON VÉRIFIÉ |
| Contact | `#contact` | send-contact-email | `contact_messages` | edge function | sql/ | — | NON VÉRIFIÉ |

## Tables recensées (~48)
ai_predictions, audit_logs, broker_cases, commission_records, contact_messages, customs_cases, devis,
documents, enterprise_dashboard_configs, escrow_events, escrow_transactions, finance_applications,
finance_partners, financing_requests, inspection_media, inspection_reports, inspection_requests, inspectors,
leads, logistics_quotes, logistics_tasks, machine_history, machine_views, market_alerts, market_projects,
member_sessions, organization_ai_credentials, organization_member_scopes, organization_members, organizations,
payment_records, planning_events, platform_events, price_observations, quote_requests, tender_workspaces,
transaction_cases, transaction_documents, transaction_events, transaction_messages, transaction_participants,
transaction_tasks, transport_requests, trust_profiles, user_invitations, verifications, vitrines
(+ `machines`, `pro_clients` créées hors du motif `create table public.X` détecté).

## Edge Functions (14)
ai-proxy, create-payment, escrow-webhook, exchange-rates, recompute-trust-score, send-contact-email,
send-email, stripe-webhook, tenders-ai.

## Triggers (migrations)
trg_machines_force_owner, trg_documents_force_owner, trg_vitrines_force_owner,
trg_leads_guard_ins, trg_leads_guard_upd, trg_verifications_recompute.
