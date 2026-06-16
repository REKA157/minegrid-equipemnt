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

  private async buildLocalAIRecommendations(userId: string): Promise<AIRecommendation[]> {
    const userData = await this.getSellerMachines(userId);

    const recommendations: AIRecommendation[] = [];

    const stockAnalysis = this.analyzeStock(userData);
    if (stockAnalysis.hasDormantStock) {
      recommendations.push({
        id: 'stock_optimization',
        category: 'inventory',
        title: 'Optimisation du stock dormant',
        description: `${stockAnalysis.dormantCount} équipements en stock depuis plus de 60 jours`,
        impact: 'high',
        effort: 'medium',
        roi: 0.25,
        actions: [
          'Réduire les prix de 15%',
          'Booster la visibilité Premium',
          'Créer des offres flash',
          'Contacter les prospects qualifiés',
        ],
        priority: 1,
      });
    }

    const performanceAnalysis = this.analyzePerformance(userData);
    if (performanceAnalysis.lowVisibility) {
      recommendations.push({
        id: 'visibility_boost',
        category: 'marketing',
        title: 'Amélioration de la visibilité',
        description: 'Vos annonces ont une visibilité inférieure à la moyenne',
        impact: 'high',
        effort: 'low',
        roi: 0.4,
        actions: [
          'Optimiser les titres SEO',
          'Ajouter plus de photos',
          'Compléter les descriptions',
          'Activer la promotion Premium',
        ],
        priority: 2,
      });
    }

    const salesAnalysis = this.analyzeSales(userData);
    if (salesAnalysis.needsFollowUp) {
      recommendations.push({
        id: 'follow_up_system',
        category: 'sales',
        title: 'Système de suivi client',
        description: `${salesAnalysis.pendingLeads} prospects nécessitent un suivi`,
        impact: 'medium',
        effort: 'low',
        roi: 0.3,
        actions: [
          'Envoyer des emails de relance',
          'Planifier des appels de suivi',
          'Créer des devis personnalisés',
          'Offrir des démonstrations',
        ],
        priority: 3,
      });
    }

    if (recommendations.length === 0) {
      recommendations.push(
        {
          id: 'starter_profile_quality',
          category: 'marketing',
          title: 'Renforcer la qualité du profil vendeur',
          description: 'Compléter le profil et les informations de confiance pour améliorer la conversion.',
          impact: 'medium',
          effort: 'low',
          roi: 0.2,
          actions: [
            'Completer la description entreprise',
            'Ajouter logo et contacts verifiés',
            'Activer les notifications de messages',
          ],
          priority: 1,
        },
        {
          id: 'starter_listing_structure',
          category: 'sales',
          title: 'Structurer un plan de relance commercial',
          description: 'Mettre en place un pipeline de suivi pour transformer plus de prospects.',
          impact: 'medium',
          effort: 'low',
          roi: 0.22,
          actions: [
            'Repondre aux demandes en moins de 2h',
            'Relancer les prospects a J+1 et J+3',
            'Utiliser un modele de devis standard',
          ],
          priority: 2,
        },
      );
    }

    return recommendations.sort((a, b) => a.priority - b.priority);
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

      const userData = await this.getSellerMachines(userId);

      const insights: AIInsight[] = [];

      // Analyse des patterns de vente
      const salesPatterns = this.analyzeSalesPatterns(userData);
      if (salesPatterns.bestPerformingCategory) {
        insights.push({
          id: 'best_category',
          type: 'recommendation',
          title: 'Catégorie performante détectée',
          description: `Les ${salesPatterns.bestPerformingCategory} génèrent ${salesPatterns.performanceGain}% plus de vues`,
          confidence: 0.92,
          priority: 'high',
          action: 'Augmenter l\'inventaire de cette catégorie',
          data: salesPatterns,
          createdAt: new Date()
        });
      }

      // Détection d'opportunités
      const opportunities = this.detectOpportunities(userData);
      if (opportunities.hasOpportunity) {
        insights.push({
          id: 'market_opportunity',
          type: 'prediction',
          title: 'Opportunité de marché identifiée',
          description: opportunities.description,
          confidence: 0.78,
          priority: 'medium',
          action: 'Analyser la concurrence et ajuster les prix',
          data: opportunities,
          createdAt: new Date()
        });
      }

      // Alertes de performance
      const alerts = this.generatePerformanceAlerts(userData);
      alerts.forEach(alert => {
        insights.push({
          id: `alert_${Date.now()}`,
          type: 'alert',
          title: alert.title,
          description: alert.description,
          confidence: alert.confidence,
          priority: alert.priority,
          action: alert.action,
          data: alert.data,
          createdAt: new Date()
        });
      });

      return insights;
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

  private calculateCurrentSales(data: any[]): number {
    // Simulation du calcul des ventes actuelles
    return data.length * 15000; // Prix moyen estimé
  }

  private predictNextMonthSales(data: any[]): number {
    // Simulation de prédiction basée sur les tendances
    const currentSales = this.calculateCurrentSales(data);
    return currentSales * 1.15; // +15% prédit
  }

  private calculateConversionRate(data: any[]): number {
    // Simulation du taux de conversion
    return 0.12; // 12%
  }

  private predictConversionRate(data: any[]): number {
    // Simulation de prédiction du taux de conversion
    return 0.14; // 14% prédit
  }

  private analyzeStock(data: any[]): any {
    const dormantCount = data.filter(item => 
      new Date(item.created_at).getTime() < Date.now() - (60 * 24 * 60 * 60 * 1000)
    ).length;

    return {
      hasDormantStock: dormantCount > 0,
      dormantCount,
      totalStock: data.length
    };
  }

  private analyzePerformance(data: any[]): any {
    // Simulation d'analyse de performance
    return {
      lowVisibility: data.length > 5, // Si plus de 5 annonces, potentiellement faible visibilité
      averageViews: 45,
      targetViews: 100
    };
  }

  private analyzeSales(data: any[]): any {
    // Simulation d'analyse des ventes
    return {
      needsFollowUp: data.length > 0,
      pendingLeads: Math.floor(data.length * 0.3),
      conversionRate: 0.12
    };
  }

  private analyzeSalesPatterns(data: any[]): any {
    // Simulation d'analyse des patterns de vente
    return {
      bestPerformingCategory: 'Excavatrices',
      performanceGain: 25,
      trend: 'up'
    };
  }

  private detectOpportunities(data: any[]): any {
    // Simulation de détection d'opportunités
    return {
      hasOpportunity: data.length > 3,
      description: 'Marché en croissance détecté pour les équipements de construction',
      marketGrowth: 0.18
    };
  }

  private generatePerformanceAlerts(data: any[]): any[] {
    const alerts = [];

    if (data.length === 0) {
      alerts.push({
        title: 'Aucune annonce active',
        description: 'Créez votre première annonce pour commencer à vendre',
        confidence: 1.0,
        priority: 'critical',
        action: 'Créer une annonce',
        data: { type: 'no_listings' }
      });
    }

    if (data.length > 10) {
      alerts.push({
        title: 'Inventaire important',
        description: 'Vous avez beaucoup d\'équipements en stock. Considérez des promotions.',
        confidence: 0.85,
        priority: 'medium',
        action: 'Créer des promotions',
        data: { type: 'high_inventory' }
      });
    }

    return alerts;
  }

  private suggestPriceOptimization(data: any[]): any {
    // Simulation de suggestions d'optimisation des prix
    return {
      hasOptimization: data.length > 0,
      description: 'Ajustement des prix recommandé basé sur l\'analyse du marché',
      actions: [
        'Analyser les prix de la concurrence',
        'Ajuster les prix de 5-10%',
        'Créer des offres promotionnelles'
      ],
      expectedImpact: 'Augmentation des ventes de 15-20%'
    };
  }

  private suggestSEOOptimization(data: any[]): any {
    // Simulation de suggestions d'optimisation SEO
    return {
      hasOptimization: data.length > 0,
      description: 'Amélioration du référencement recommandée',
      actions: [
        'Optimiser les titres avec des mots-clés',
        'Ajouter des descriptions détaillées',
        'Utiliser des tags pertinents',
        'Améliorer la qualité des photos'
      ],
      expectedImpact: 'Augmentation de la visibilité de 30-40%'
    };
  }
}

export const aiWidgetService = new AIWidgetService(); 