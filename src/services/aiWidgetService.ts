import { supabaseClient } from '../utils/supabaseClient';
import { MACHINE_LIST_COLUMNS, SELLER_MACHINES_MAX_ROWS } from '../constants/machineQueryFields';

export interface AIInsight {
  id: string;
  type: 'recommendation' | 'alert' | 'prediction' | 'optimization';
  title: string;
  description: string;
  confidence: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  action?: string;
  data?: any;
  createdAt: Date;
}

export interface AIPrediction {
  metric: string;
  currentValue: number;
  predictedValue: number;
  confidence: number;
  timeframe: '7d' | '30d' | '90d';
  trend: 'up' | 'down' | 'stable';
  factors: string[];
}

/** Réponse JSON de GET /ai/widgets/benchmark */
export interface AISalesBenchmark {
  sector: string;
  average: number;
  top25: number;
  yourPerformance: number;
  currency?: string;
  note?: string;
}

export interface AIRecommendation {
  id: string;
  category: 'sales' | 'inventory' | 'performance' | 'marketing';
  title: string;
  description: string;
  impact: 'low' | 'medium' | 'high';
  effort: 'low' | 'medium' | 'high';
  roi?: number;
  actions: string[];
  priority: number;
}

/** Cache court côté client pour réduire les appels dupliqués (plusieurs widgets au montage). */
const MONITOR_GET_CACHE_MS = 30_000;
const MONITOR_GET_CACHE_MAX_KEYS = 200;
const _monitorGetCache = new Map<string, { at: number; value: unknown }>();

function monitorCacheKey(userId: string, path: string) {
  return `${userId}|${path}`;
}

function monitorCacheGet<T>(key: string): T | undefined {
  const hit = _monitorGetCache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > MONITOR_GET_CACHE_MS) {
    _monitorGetCache.delete(key);
    return undefined;
  }
  return hit.value as T;
}

function monitorCacheSet(key: string, value: unknown) {
  if (_monitorGetCache.size >= MONITOR_GET_CACHE_MAX_KEYS) {
    const first = _monitorGetCache.keys().next().value;
    if (first !== undefined) _monitorGetCache.delete(first);
  }
  _monitorGetCache.set(key, { at: Date.now(), value });
}

class AIWidgetService {
  private sessionId: string;
  private monitorBaseUrl: string;

  constructor() {
    this.sessionId = `ai_session_${Date.now()}`;
    this.monitorBaseUrl = (import.meta as any).env?.VITE_MONITOR_API_URL || 'http://localhost:8000';
  }

  private async callAiEndpoint(path: string): Promise<any[] | null> {
    try {
      const { data } = await supabaseClient.auth.getSession();
      const token = data.session?.access_token;
      const uid = data.session?.user?.id;
      if (!token || !uid) return null;

      const ck = monitorCacheKey(uid, path);
      const cached = monitorCacheGet<any[] | null>(ck);
      if (cached !== undefined) return cached;

      const res = await fetch(`${this.monitorBaseUrl}${path}`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        // 401/403 = pas d'acces live payant, on laisse le fallback local.
        return null;
      }

      const payload = await res.json();
      const out = Array.isArray(payload) ? payload : null;
      monitorCacheSet(ck, out);
      return out;
    } catch {
      return null;
    }
  }

  /** Appels monitor renvoyant un objet JSON (pas un tableau). */
  private async callAiJsonEndpoint(path: string): Promise<Record<string, unknown> | null> {
    try {
      const { data } = await supabaseClient.auth.getSession();
      const token = data.session?.access_token;
      const uid = data.session?.user?.id;
      if (!token || !uid) return null;

      const ck = monitorCacheKey(uid, path);
      const cached = monitorCacheGet<Record<string, unknown> | null>(ck);
      if (cached !== undefined) return cached;

      const res = await fetch(`${this.monitorBaseUrl}${path}`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) return null;

      const payload = await res.json();
      const out =
        payload && typeof payload === 'object' && !Array.isArray(payload)
          ? (payload as Record<string, unknown>)
          : null;
      monitorCacheSet(ck, out);
      return out;
    } catch {
      return null;
    }
  }

  private async getSellerMachines(userId: string): Promise<any[]> {
    const columnsToTry = ['sellerid', 'sellerId', 'seller_id', 'owner_id'];

    let lastError: any = null;

    for (const column of columnsToTry) {
      const { data, error } = await supabaseClient
        .from('machines')
        .select(MACHINE_LIST_COLUMNS)
        .eq(column, userId)
        .limit(SELLER_MACHINES_MAX_ROWS);

      // Si l'erreur vient d'une colonne inexistante, on tente la suivante.
      if (error) {
        lastError = error;
        // On continue toujours : dans ce projet la casse du champ (sellerid vs sellerId)
        // a déjà été changée plusieurs fois.
        continue;
      }

      // Colonne trouvée (pas d'erreur) : même si data est vide, c'est un résultat valide.
      return data || [];
    }

    // Toutes les colonnes ont échoué : on remonte une erreur pour être visible dans la console.
    if (lastError) throw lastError;
    return [];
  }

  private async buildLocalSalesPredictions(_userId: string): Promise<AIPrediction[]> {
    // Anti-façade : aucune prédiction fabriquée (confiance/tendance/facteurs inventés).
    // Quand le service IA (monitor) est indisponible, on ne fabrique RIEN -> le widget
    // affiche son état honnête « aucune donnée de prévision ».
    return [];
  }

  // 🧠 ANALYSE PRÉDICTIVE DES VENTES
  async getSalesPredictions(userId: string): Promise<AIPrediction[]> {
    try {
      const remote = await this.callAiEndpoint('/ai/widgets/predictions');
      if (remote) return remote as AIPrediction[];
      return await this.buildLocalSalesPredictions(userId);
    } catch (error) {
      console.error('Erreur prédictions ventes:', error);
      return [];
    }
  }

  async getSalesPredictionsWithSource(userId: string): Promise<{
    items: AIPrediction[];
    source: 'monitor' | 'local';
  }> {
    try {
      const remote = await this.callAiEndpoint('/ai/widgets/predictions');
      if (remote != null) {
        return { items: remote as AIPrediction[], source: 'monitor' };
      }
      return {
        items: await this.buildLocalSalesPredictions(userId),
        source: 'local',
      };
    } catch (error) {
      console.error('Erreur prédictions ventes (avec source):', error);
      return { items: [], source: 'local' };
    }
  }

  async getSalesBenchmarkWithSource(userId: string): Promise<{
    data: AISalesBenchmark | null;
    source: 'monitor' | 'local';
  }> {
    try {
      const remote = await this.callAiJsonEndpoint('/ai/widgets/benchmark');
      if (
        remote &&
        typeof remote.yourPerformance === 'number' &&
        typeof remote.average === 'number' &&
        typeof remote.top25 === 'number'
      ) {
        return {
          data: {
            sector: String(remote.sector ?? 'Équipements BTP'),
            average: Number(remote.average),
            top25: Number(remote.top25),
            yourPerformance: Number(remote.yourPerformance),
            currency: remote.currency != null ? String(remote.currency) : 'MAD',
            note: remote.note != null ? String(remote.note) : undefined,
          },
          source: 'monitor',
        };
      }
      return {
        // Anti-façade : pas de benchmark secteur fabriqué hors monitor (moyenne/top25 inventés).
        data: null,
        source: 'local',
      };
    } catch (error) {
      console.error('Erreur benchmark ventes:', error);
      return {
        // Anti-façade : pas de benchmark secteur fabriqué hors monitor (moyenne/top25 inventés).
        data: null,
        source: 'local',
      };
    }
  }

  private async buildLocalAIRecommendations(_userId: string): Promise<AIRecommendation[]> {
    // Anti-façade : hors service monitor, on NE fabrique AUCUNE recommandation.
    // L'ancienne version inventait des chiffres (prospects « en attente » = 30 % du stock,
    // « vues moyennes » = 45, impacts « 15-20 % »…) et poussait 2 recommandations
    // génériques inconditionnelles. On renvoie [] -> les widgets affichent leur état vide
    // honnête (« Aucune optimisation / recommandation suggérée »).
    return [];
  }

  // 🎯 RECOMMANDATIONS INTELLIGENTES
  async getAIRecommendations(userId: string): Promise<AIRecommendation[]> {
    try {
      const remote = await this.callAiEndpoint('/ai/widgets/recommendations');
      if (remote) return remote as AIRecommendation[];

      return await this.buildLocalAIRecommendations(userId);
    } catch (error) {
      console.error('Erreur recommandations IA:', error);
      return [];
    }
  }

  /** Même flux que getAIRecommendations, avec distinction monitor (LLM / règles serveur) vs analyse locale. */
  async getAIRecommendationsWithSource(userId: string): Promise<{
    items: AIRecommendation[];
    source: 'monitor' | 'local';
  }> {
    try {
      const remote = await this.callAiEndpoint('/ai/widgets/recommendations');
      if (remote != null) {
        return { items: remote as AIRecommendation[], source: 'monitor' };
      }
      return {
        items: await this.buildLocalAIRecommendations(userId),
        source: 'local',
      };
    } catch (error) {
      console.error('Erreur recommandations IA (avec source):', error);
      return { items: [], source: 'local' };
    }
  }

  // 🔍 INSIGHTS INTELLIGENTS
  async getAIInsights(userId: string): Promise<AIInsight[]> {
    try {
      const remote = await this.callAiEndpoint('/ai/widgets/insights');
      if (remote) return remote as AIInsight[];

      // Anti-façade : hors monitor IA, AUCUN insight fabriqué (catégorie/gain/confiance
      // inventés). Le chemin monitor ci-dessus reste actif pour la roadmap ; sinon [].
      return [];
    } catch (error) {
      console.error('Erreur insights IA:', error);
      return [];
    }
  }

  // 📊 OPTIMISATION AUTOMATIQUE
  async getOptimizationSuggestions(userId: string): Promise<any[]> {
    try {
      const remote = await this.callAiEndpoint('/ai/widgets/optimizations');
      if (remote) return remote;

      const userData = await this.getSellerMachines(userId);

      const suggestions = [];

      // Optimisation des prix
      const priceOptimization = this.suggestPriceOptimization(userData);
      if (priceOptimization.hasOptimization) {
        suggestions.push({
          type: 'price_optimization',
          title: 'Optimisation des prix suggérée',
          description: priceOptimization.description,
          actions: priceOptimization.actions,
          expectedImpact: priceOptimization.expectedImpact
        });
      }

      // Optimisation du SEO
      const seoOptimization = this.suggestSEOOptimization(userData);
      if (seoOptimization.hasOptimization) {
        suggestions.push({
          type: 'seo_optimization',
          title: 'Optimisation SEO recommandée',
          description: seoOptimization.description,
          actions: seoOptimization.actions,
          expectedImpact: seoOptimization.expectedImpact
        });
      }

      // Anti-façade : PAS de socle d'optimisations génériques aux impacts inventés pour
      // « remplir » le widget. Si aucune optimisation réelle (prix/SEO) n'est détectée sur
      // les annonces du vendeur, on renvoie [] -> le widget affiche son état vide honnête
      // (« Aucune optimisation suggérée »).
      return suggestions;
    } catch (error) {
      console.error('Erreur suggestions optimisation:', error);
      return [];
    }
  }

  // 🔧 MÉTHODES PRIVÉES D'ANALYSE
  //
  // Les anciens helpers de simulation (calculateCurrentSales ×15000,
  // predictNextMonthSales ×1.15, calculateConversionRate/predictConversionRate,
  // analyzeStock/analyzePerformance/analyzeSales avec averageViews=45 et
  // pendingLeads=0.3×) ont été SUPPRIMÉS : ils fabriquaient des chiffres.

  private suggestPriceOptimization(_data: any[]): any {
    // Anti-façade : aucune suggestion prix fabriquée (impact « 15-20 % » inventé).
    // Hors moteur monitor, on ne détecte pas d'optimisation réelle -> rien.
    return { hasOptimization: false };
  }

  private suggestSEOOptimization(_data: any[]): any {
    // Anti-façade : aucune suggestion SEO fabriquée (impact « 30-40 % » inventé).
    return { hasOptimization: false };
  }
}

export const aiWidgetService = new AIWidgetService(); 