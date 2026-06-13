// MineGrid Intelligence — matching d'un projet marché contre une alerte utilisateur.
// Pure et testable. Utilisé côté serveur (cron evaluate-alerts) pour notifier
// (email/WhatsApp) quand un nouveau projet correspond à une veille abonnée.

export interface AlertQuery {
  country?: string;
  sector?: string;
  equipmentTypes?: string[];
  minBudget?: number;
}

export interface ProjectLite {
  country?: string | null;
  sector?: string | null;
  budget?: number | null;
  title?: string | null;
  description?: string | null;
}

export interface MatchResult {
  matches: boolean;
  reasons: string[];
}

export function matchesAlert(project: ProjectLite, query: AlertQuery): MatchResult {
  const reasons: string[] = [];

  if (query.country && norm(project.country) !== norm(query.country)) {
    return { matches: false, reasons: ['pays différent'] };
  }
  if (query.country) reasons.push(`pays ${query.country}`);

  if (query.sector && norm(project.sector) !== norm(query.sector)) {
    return { matches: false, reasons: ['secteur différent'] };
  }
  if (query.sector) reasons.push(`secteur ${query.sector}`);

  if (typeof query.minBudget === 'number') {
    if (typeof project.budget !== 'number' || project.budget < query.minBudget) {
      return { matches: false, reasons: ['budget insuffisant'] };
    }
    reasons.push(`budget ≥ ${query.minBudget}`);
  }

  if (query.equipmentTypes && query.equipmentTypes.length > 0) {
    const haystack = `${project.title ?? ''} ${project.description ?? ''}`.toLowerCase();
    const hit = query.equipmentTypes.find((t) => haystack.includes(t.toLowerCase()));
    if (!hit) {
      return { matches: false, reasons: ['aucun équipement ciblé mentionné'] };
    }
    reasons.push(`mentionne « ${hit} »`);
  }

  return { matches: true, reasons };
}

function norm(s?: string | null): string {
  return (s ?? '').trim().toLowerCase();
}
