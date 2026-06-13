import type { CockpitSummaryData, CockpitSignal } from './buildVendeurCockpit';
import type {
  getPortfolioValue,
  getInvestmentOpportunities,
  getOpportunitiesScore,
  getRiskAssessment,
} from '../../../utils/enterpriseApi/investisseur';

/**
 * Cockpit INVESTISSEUR — « Que dois-je faire aujourd'hui ? » en moins de 5 s.
 *
 * 100 % données RÉELLES, ENTIÈREMENT intra-module (portefeuille + pipeline) :
 * tables `investments` et `investment_opportunities` (RLS created_by=auth.uid(),
 * déployées via sql/deploy_investisseur.sql). Toutes les entrées proviennent de
 * src/utils/enterpriseApi/investisseur.ts. Fonction PURE et testable (`now`
 * injectable) : aucun appel réseau/supabase, aucune lecture globale ; elle ne fait
 * que transformer `input` en cartes. Aucune valeur inventée : chaque carte n'est
 * poussée que si sa condition réelle est vraie (états vides honnêtes, anti-façade).
 *
 * CARTES ÉCARTÉES (availableToday=false, non implémentées ici) — cf. spec NOTES :
 *  - Dossier transaction où role=investor + étape de financement : aucun lien
 *    investment/opportunity -> transaction_case, aucun seed investisseur participant,
 *    financing_requests keyé buyer/broker jamais investor. Cross-module non activable.
 *  - Inspection avant achat d'une opportunité : aucune jointure opportunity<->inspection,
 *    affectation/rapport server-gated non déployés.
 *  - Trust : trust_profiles non peuplé, filtre entity_type='seller' uniquement.
 *  - Messages liés au dossier : dépendent du point dossier ci-dessus.
 *  - conversionRate (getOpportunitiesScore) : informatif, pas d'action -> non carte.
 */

type PortfolioValue = Awaited<ReturnType<typeof getPortfolioValue>>;
type InvestmentOpportunities = Awaited<ReturnType<typeof getInvestmentOpportunities>>;
type OpportunitiesScore = Awaited<ReturnType<typeof getOpportunitiesScore>>;
type RiskAssessment = Awaited<ReturnType<typeof getRiskAssessment>>;

export interface InvestisseurCockpitInput {
  /** getPortfolioValue() — valeur de marché, plus-values, cash-flow, actifs détenus. */
  portfolio: PortfolioValue;
  /** getInvestmentOpportunities() — pipeline actif trié par ROI attendu. */
  opportunities: InvestmentOpportunities;
  /** getOpportunitiesScore() — compteurs du pipeline (expiring, reco, risque…). */
  oppScore: OpportunitiesScore;
  /** getRiskAssessment() — concentration, vétusté, dépendance financement… */
  risk: RiskAssessment;
}

const DAY_MS = 86_400_000;
const EXIT_WINDOW_DAYS = 60;

function daysUntil(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return (t - now) / DAY_MS;
}

/**
 * Construit le cockpit INVESTISSEUR à partir des 4 entrées de service.
 * @param input  agrégats réels (portfolio, opportunities, oppScore, risk)
 * @param now    horloge injectable (tests)
 */
export function buildInvestisseurCockpit(
  input: InvestisseurCockpitInput,
  now: number = Date.now(),
): CockpitSummaryData {
  const { portfolio, opportunities, oppScore, risk } = input;

  const priorities: CockpitSignal[] = [];
  const risks: CockpitSignal[] = [];
  const opps: CockpitSignal[] = [];

  // ===================== PRIORITÉS =====================

  // opp-expiring-7d — décision sous 7 jours (urgent)
  if (oppScore.expiringIn7d > 0) {
    priorities.push({
      id: 'opp-expiring-7d',
      label: `${oppScore.expiringIn7d} opportunité(s) à décider sous 7 jours`,
      detail: 'Ouvrir, décider Acheter/Passer (updateOpportunityStatus)',
      href: '#dashboard-entreprise',
      tone: 'urgent',
    });
  }

  // opp-recommend-buy — opportunités notées « Acheter » à engager
  if (oppScore.recommendBuy > 0) {
    priorities.push({
      id: 'opp-recommend-buy',
      label: `${oppScore.recommendBuy} opportunité(s) notée(s) « Acheter » à engager`,
      detail: 'Vérifier ROI/payback puis convertir (convertOpportunityToInvestment)',
      href: '#dashboard-entreprise',
      tone: 'good',
    });
  }

  // exit-window-due — actifs en cession dont la date cible approche (< 60 j)
  const exitDue = portfolio.investments.filter((i) => {
    const d = daysUntil(i.target_exit_date, now);
    return d !== null && d < EXIT_WINDOW_DAYS;
  });
  if (exitDue.length > 0) {
    priorities.push({
      id: 'exit-window-due',
      label: `${exitDue.length} actif(s) dont la date de cession approche`,
      detail: 'Déclencher la mise en vente ou ajuster target_exit_price',
      href: '#dashboard-entreprise',
      tone: 'warn',
    });
  }

  // low-occupancy-assets — actifs détenus sans revenu
  if (risk.lowOccupancyCount > 0) {
    priorities.push({
      id: 'low-occupancy-assets',
      label: `${risk.lowOccupancyCount} actif(s) détenu(s) sans revenu`,
      detail: 'Mettre en location (status « En location ») ou inscrire en cession',
      href: '#dashboard-entreprise',
      tone: 'warn',
    });
  }

  // ===================== RISQUES =====================

  const topConcentration = risk.concentrations[0];

  // concentration-sector — concentration sectorielle > 40 %
  if (topConcentration && topConcentration.percent > 40) {
    risks.push({
      id: 'concentration-sector',
      label: `Concentration ${topConcentration.category} à ${Math.round(topConcentration.percent)} %`,
      detail: 'Orienter le pipeline vers d\'autres catégories ou céder un actif du segment',
      href: '#dashboard-entreprise',
      tone: 'warn',
    });
  }

  // financing-dependency — dépendance au financement > 50 %
  if (risk.financingDependencyPercent > 50) {
    risks.push({
      id: 'financing-dependency',
      label: `Dépendance au financement à ${risk.financingDependencyPercent} %`,
      detail: 'Refinancer, accélérer la location ou céder l\'actif le plus déficitaire',
      href: '#dashboard-entreprise',
      tone: 'warn',
    });
  }

  // ageing-fleet — vieillissement du parc
  if (risk.ageRiskCount > 0) {
    risks.push({
      id: 'ageing-fleet',
      label: `${risk.ageRiskCount} actif(s) vieillissant(s) (> 8 ans)`,
      detail: 'Planifier la sortie (exit_strategy + target_exit_date)',
      href: '#dashboard-entreprise',
      tone: 'neutral',
    });
  }

  // high-risk-pipeline — opportunités à risque élevé dans le pipeline
  if (oppScore.highRisk > 0) {
    risks.push({
      id: 'high-risk-pipeline',
      label: `${oppScore.highRisk} opportunité(s) à risque élevé dans le pipeline`,
      detail: 'Lire risk_factors : passer/refuser ou exiger une inspection',
      href: '#dashboard-entreprise',
      tone: 'warn',
    });
  }

  // ===================== OPPORTUNITÉS =====================

  // best-roi-opportunity — meilleure opportunité par ROI (pipeline trié par ROI)
  if (opportunities.length > 0) {
    const best = opportunities[0];
    const roi = best.expected_roi_percent;
    const roiLabel = typeof roi === 'number' ? ` (ROI ${roi} %)` : '';
    opps.push({
      id: 'best-roi-opportunity',
      label: `Meilleure opportunité : ${best.equipment_label}${roiLabel}`,
      detail: `Comparer à la moyenne (${oppScore.avgRoi} %) et lancer la négociation`,
      href: '#dashboard-entreprise',
      tone: 'good',
    });
  }

  // diversifying-opportunity — opportunité qui réduit la concentration
  // (concentration > 40 % ET opportunités hors de cette catégorie)
  if (topConcentration && topConcentration.percent > 40) {
    const diversifying = opportunities.filter(
      (o) => (o.category || 'Autre') !== topConcentration.category,
    );
    if (diversifying.length > 0) {
      opps.push({
        id: 'diversifying-opportunity',
        label: `${diversifying.length} opportunité(s) hors ${topConcentration.category} pour diversifier`,
        detail: 'Engager la meilleure de ces opportunités pour réduire la concentration',
        href: '#dashboard-entreprise',
        tone: 'good',
      });
    }
  }

  // realized-vs-pipeline-redeploy — plus-value réalisée à redéployer
  // (realizedGain > 0 ET opportunités actives > 0)
  if (portfolio.realizedGain > 0 && oppScore.activeCount > 0) {
    opps.push({
      id: 'realized-vs-pipeline-redeploy',
      label: `${portfolio.realizedGain.toLocaleString('fr-FR')} MAD de plus-value réalisée à redéployer`,
      detail: `${oppScore.activeCount} opportunité(s) active(s) — engager un montant équivalent`,
      href: '#dashboard-entreprise',
      tone: 'good',
    });
  }

  // undervalued-opportunity — opportunité sous le marché (asking < estimated_market_value)
  const undervalued = opportunities.filter((o) => {
    const ask = o.asking_price;
    const mkt = o.estimated_market_value;
    return typeof ask === 'number' && typeof mkt === 'number' && ask < mkt;
  });
  if (undervalued.length > 0) {
    opps.push({
      id: 'undervalued-opportunity',
      label: `${undervalued.length} opportunité(s) sous le prix du marché`,
      detail: 'Vérifier risk_factors puis négocier/convertir pour capter la décote',
      href: '#dashboard-entreprise',
      tone: 'good',
    });
  }

  // ===================== HEADLINE =====================
  // Valeur de marché du portefeuille actif + plus-value latente.
  // Sous-titre = cash-flow mensuel net + plus-value latente %.
  const gainSign = portfolio.unrealizedGain >= 0 ? '+' : '';
  const netSign = portfolio.monthlyNet >= 0 ? '+' : '';

  return {
    revenueLabel: 'Valeur de marché du portefeuille',
    revenueValue: portfolio.totalMarketValue,
    revenueUnit: 'MAD',
    revenueAvailable: true,
    revenueHint:
      `Plus-value latente ${gainSign}${portfolio.unrealizedGain.toLocaleString('fr-FR')} MAD ` +
      `(${gainSign}${portfolio.unrealizedGainPercent} %) · ` +
      `cash-flow mensuel net ${netSign}${portfolio.monthlyNet.toLocaleString('fr-FR')} MAD`,
    priorities,
    risks,
    opportunities: opps,
  };
}
