import { MACHINE_LIST_COLUMNS, SELLER_MACHINES_MAX_ROWS } from '../../constants/machineQueryFields';
import type { DashboardStats, SalesPerformanceData } from './types';
import supabase from '../supabaseClient';
import { getCurrentUser } from './auth';
import { RealPipelineService } from '../../services/realPipelineService';

function normLeadStage(s: string): string {
  return (s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function isLeadClosedStage(stage: string): boolean {
  const s = normLeadStage(stage);
  const closed = new Set(['conclu', 'perdu', 'gagne', 'gagnee', 'gagné', 'clos', 'closed', 'lost']);
  return closed.has(s);
}

function isLeadWonStage(stage: string): boolean {
  const s = normLeadStage(stage);
  return s === 'conclu' || s === 'gagne' || s === 'gagnee';
}

/** Même logique que le widget stock : auth.uid puis pro_clients.id */
async function fetchSellerMachinesRowsForPerformance(userId: string): Promise<Record<string, unknown>[]> {
  const columns = ['sellerid', 'seller_id', 'user_id', 'owner_id'] as const;
  for (const col of columns) {
    const { data, error } = await supabase
      .from('machines')
      .select(MACHINE_LIST_COLUMNS)
      .eq(col, userId)
      .limit(SELLER_MACHINES_MAX_ROWS);
    if (error) continue;
    if (data?.length) return data as Record<string, unknown>[];
  }
  const { data: proRow } = await supabase
    .from('pro_clients')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (proRow?.id) {
    const pid = String(proRow.id);
    for (const col of ['sellerid', 'seller_id'] as const) {
      const { data, error } = await supabase
        .from('machines')
        .select(MACHINE_LIST_COLUMNS)
        .eq(col, pid)
        .limit(SELLER_MACHINES_MAX_ROWS);
      if (!error && data?.length) return data as Record<string, unknown>[];
    }
  }
  return [];
}

// Helper interne : resout la liste des machine ids du vendeur quelle que soit
// la convention de nommage de la colonne fk (sellerid / seller_id / user_id /
// owner_id). Utilise par getDashboardStats, getWeeklyActivityData et
// getSalesPerformanceData.
async function getSellerMachineIds(userId: string): Promise<string[]> {
  const possibleColumns = ['sellerid', 'seller_id', 'user_id', 'owner_id'];
  let ids: string[] | null = null;

  for (const column of possibleColumns) {
    const { data, error } = await supabase
      .from('machines')
      .select('id')
      .eq(column, userId);
    if (error) continue;
    ids = (data || []).map((m: any) => m.id).filter(Boolean);
    break;
  }

  return ids || [];
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Utilisateur non connecté');

  // Récupérer les IDs des machines du vendeur (tolérant au nom de colonne)
  const machineIds = await getSellerMachineIds(user.id);

  if (machineIds.length === 0) {
    return {
      totalViews: 0,
      totalMessages: 0,
      totalOffers: 0,
      weeklyViews: 0,
      monthlyViews: 0,
      weeklyGrowth: 0,
      monthlyGrowth: 0
    };
  }

  // Calculer les dates
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  // Vues totales
  const { count: totalViews } = await supabase
    .from('machine_views')
    .select('id', { count: 'exact', head: true })
    .in('machine_id', machineIds);

  // Vues cette semaine
  const { count: weeklyViews } = await supabase
    .from('machine_views')
    .select('id', { count: 'exact', head: true })
    .in('machine_id', machineIds)
    .gte('created_at', weekAgo.toISOString());

  // Vues ce mois
  const { count: monthlyViews } = await supabase
    .from('machine_views')
    .select('id', { count: 'exact', head: true })
    .in('machine_id', machineIds)
    .gte('created_at', monthAgo.toISOString());

  // Vues semaine précédente (pour calculer la croissance)
  const { count: previousWeekViews } = await supabase
    .from('machine_views')
    .select('id', { count: 'exact', head: true })
    .in('machine_id', machineIds)
    .gte('created_at', twoWeeksAgo.toISOString())
    .lt('created_at', weekAgo.toISOString());

  // Vues mois précédent
  const { count: previousMonthViews } = await supabase
    .from('machine_views')
    .select('id', { count: 'exact', head: true })
    .in('machine_id', machineIds)
    .gte('created_at', twoMonthsAgo.toISOString())
    .lt('created_at', monthAgo.toISOString());

  // Messages reçus
  const { count: totalMessages } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .or(`receiver_id.eq.${user.id},seller_id.eq.${user.id}`);

  // Offres reçues
  const { count: totalOffers } = await supabase
    .from('offers')
    .select('id', { count: 'exact', head: true })
    .eq('seller_id', user.id);

  // Calculer les pourcentages de croissance
  const weeklyGrowth = previousWeekViews && previousWeekViews > 0 
    ? Math.round(((weeklyViews || 0) - previousWeekViews) / previousWeekViews * 100)
    : 0;

  const monthlyGrowth = previousMonthViews && previousMonthViews > 0
    ? Math.round(((monthlyViews || 0) - previousMonthViews) / previousMonthViews * 100)
    : 0;

  return {
    totalViews: totalViews || 0,
    totalMessages: totalMessages || 0,
    totalOffers: totalOffers || 0,
    weeklyViews: weeklyViews || 0,
    monthlyViews: monthlyViews || 0,
    weeklyGrowth,
    monthlyGrowth
  };
}

export async function getWeeklyActivityData() {
  const user = await getCurrentUser();
  if (!user) throw new Error('Utilisateur non connecté');

  const machineIds = await getSellerMachineIds(user.id);
  
  if (machineIds.length === 0) {
    return Array(7).fill(0);
  }

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const { data: views } = await supabase
    .from('machine_views')
    .select('created_at')
    .in('machine_id', machineIds)
    .gte('created_at', weekAgo.toISOString());

  // Grouper par jour
  const dailyViews = Array(7).fill(0);
  const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

  views?.forEach(view => {
    const date = new Date(view.created_at);
    const dayIndex = date.getDay();
    dailyViews[dayIndex]++;
  });

  return dailyViews;
}

// -------------------- DASHBOARD VENDEUR --------------------

export async function getSalesPerformanceData(): Promise<SalesPerformanceData> {
  try {
    const user = await getCurrentUser();

    const machines = await fetchSellerMachinesRowsForPerformance(user.id);
    const machineIds = machines.map((m) => m.id).filter(Boolean) as string[];

    let views: { created_at: string; machine_id?: string }[] = [];
    if (machineIds.length > 0) {
      const { data: v, error: viewsError } = await supabase
        .from('machine_views')
        .select('id, machine_id, created_at')
        .in('machine_id', machineIds)
        .limit(20000);
      const missingViews =
        viewsError &&
        (viewsError.code === 'PGRST205' ||
          viewsError.code === '42P01' ||
          String(viewsError.message || '')
            .toLowerCase()
            .includes('machine_views'));
      if (!viewsError && v) views = v;
      else if (viewsError && !missingViews) throw viewsError;
    }

    let messages: { response_time?: number; created_at?: string }[] = [];
    const msgTry = await supabase
      .from('messages')
      .select('id, receiver_id, response_time, created_at')
      .or(`receiver_id.eq.${user.id},seller_id.eq.${user.id}`)
      .limit(10000);
    if (msgTry.error) {
      const fb = await supabase
        .from('messages')
        .select('id, receiver_id, response_time, created_at')
        .eq('receiver_id', user.id)
        .limit(10000);
      if (fb.error) throw fb.error;
      messages = fb.data || [];
    } else {
      messages = msgTry.data || [];
    }

    const { data: offers, error: offersError } = await supabase
      .from('offers')
      .select('id, seller_id, created_at')
      .eq('seller_id', user.id)
      .limit(10000);

    if (offersError) throw offersError;

    const leads = await RealPipelineService.getLeads();
    const openLeads = leads.filter((l) => !isLeadClosedStage(l.stage || ''));
    const wonLeads = leads.filter((l) => isLeadWonStage(l.stage || ''));
    const monitorLinkedLeads = leads.filter((l) => l.source_id && String(l.source_id).trim()).length;

    const staleMs = 14 * 24 * 60 * 60 * 1000;
    const staleOpenLeads = openLeads.filter((l) => {
      const t = new Date(l.last_contact || l.updated_at || 0).getTime();
      return Date.now() - t > staleMs;
    }).length;

    const totalMachines = machines.length;
    const totalViews = views.length;
    const totalMessages = messages?.length || 0;
    const totalOffers = offers?.length || 0;

    const denom = Math.max(totalMachines, 1);
    const viewsScore = Math.min((totalViews / denom) * 12, 12);
    const messagesScore = Math.min((totalMessages / denom) * 18, 18);
    const offersScore = Math.min((totalOffers / denom) * 20, 20);
    const engagementScore = Math.round(viewsScore + messagesScore + offersScore);

    let pipelineScore = 0;
    if (leads.length === 0) {
      pipelineScore = 6;
    } else {
      pipelineScore += Math.min(18, openLeads.length * 3);
      pipelineScore += Math.min(8, wonLeads.length * 4);
      pipelineScore -= Math.min(10, staleOpenLeads * 2);
      pipelineScore = Math.max(0, Math.min(30, pipelineScore));
    }

    const stockCoverageScore = Math.min(20, totalMachines >= 10 ? 20 : totalMachines * 2);

    const performanceScore = Math.min(
      100,
      Math.round(engagementScore + pipelineScore + stockCoverageScore),
    );

    const responseTime =
      messages && messages.length > 0
        ? messages.reduce((acc, msg) => acc + (msg.response_time || 24), 0) / messages.length
        : 24;

    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    const currentMonthViews =
      views.filter((v) => {
        const viewDate = new Date(v.created_at);
        return viewDate.getMonth() === currentMonth && viewDate.getFullYear() === currentYear;
      }).length || 0;

    const lastMonthViews =
      views.filter((v) => {
        const viewDate = new Date(v.created_at);
        const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
        const lastYear = currentMonth === 0 ? currentYear - 1 : currentYear;
        return viewDate.getMonth() === lastMonth && viewDate.getFullYear() === lastYear;
      }).length || 0;

    const growth = lastMonthViews > 0 ? ((currentMonthViews - lastMonthViews) / lastMonthViews) * 100 : 0;

    const wonPipelineValue = wonLeads.reduce((s, l) => s + Number(l.value ?? 0), 0);
    const salesFromOffers = totalOffers * 50000;
    const salesDisplay = Math.max(wonPipelineValue, salesFromOffers);

    type Rec = { type: string; action: string; impact: string; priority: 'high' | 'medium' | 'low' };
    const recommendations: Rec[] = [];

    if (staleOpenLeads > 0) {
      recommendations.push({
        type: 'pipeline',
        action: `Relancer ${staleOpenLeads} opportunité(s) sans contact depuis 14 j. (pipeline)`,
        impact: 'Aligné avec le widget Actions / Kanban — évite la dégradation du score pipeline',
        priority: 'high',
      });
    }

    if (leads.length === 0 && (totalMessages > 0 || totalOffers > 0)) {
      recommendations.push({
        type: 'pipeline',
        action: 'Structurer le suivi dans le pipeline commercial',
        impact:
          'Transformez messages et offres en leads (Kanban) pour un score convergent catalogue + pipeline',
        priority: 'high',
      });
    }

    if (monitorLinkedLeads > 0) {
      recommendations.push({
        type: 'global_monitor',
        action: 'Finaliser stock × besoins Global Monitor',
        impact: `${monitorLinkedLeads} lead(s) lié(s) à un projet : rapprochez annonces et besoins matériel`,
        priority: 'medium',
      });
    }

    if (responseTime > 2) {
      recommendations.push({
        type: 'process',
        action: 'Optimiser le temps de réponse',
        impact: `Réduire le temps de réponse de ${responseTime.toFixed(1)}h à 2h`,
        priority: 'high',
      });
    }

    if (totalMachines < 5) {
      recommendations.push({
        type: 'catalog',
        action: 'Compléter le catalogue annonces',
        impact: `Passer de ${totalMachines} à au moins 5 annonces (widget stock & visibilité)`,
        priority: 'medium',
      });
    }

    if (totalMachines > 0 && totalViews < totalMachines * 10) {
      recommendations.push({
        type: 'marketing',
        action: 'Améliorer la visibilité des annonces',
        impact: 'Augmenter les vues par annonce (photos, prix, catégories)',
        priority: 'medium',
      });
    }

    let activityLevel = 'faible';
    if (totalViews > 50 && totalMessages > 10) activityLevel = 'élevé';
    else if (totalViews > 20 && totalMessages > 5) activityLevel = 'modéré';

    const prospectTrend: 'up' | 'down' | 'stable' =
      openLeads.length >= Math.max(1, Math.ceil(leads.length * 0.35)) ? 'up' : openLeads.length === 0 ? 'stable' : 'down';

    const trends = {
      sales: growth > 0 ? ('up' as const) : growth < 0 ? ('down' as const) : ('stable' as const),
      growth: growth > 0 ? ('up' as const) : growth < 0 ? ('down' as const) : ('stable' as const),
      prospects: prospectTrend,
      responseTime: responseTime < 24 ? ('down' as const) : ('up' as const),
    };

    const prospectsTarget = Math.max(8, Math.ceil(leads.length * 0.5) || 5);

    return {
      score: performanceScore,
      target: 85,
      rank: 1,
      totalVendors: 1,
      sales: salesDisplay,
      salesTarget: 3000000,
      growth,
      growthTarget: 15,
      prospects: leads.length,
      activeProspects: openLeads.length,
      responseTime,
      responseTarget: 2,
      activityLevel,
      activityRecommendation:
        recommendations.length > 0 ? recommendations[0].action : 'Continuer les bonnes pratiques',
      recommendations,
      trends,
      metrics: {
        sales: { value: salesDisplay, target: 3000000, trend: trends.sales },
        growth: { value: growth, target: 15, trend: trends.growth },
        prospects: { value: openLeads.length, target: prospectsTarget, trend: trends.prospects },
        responseTime: { value: responseTime, target: 2, trend: trends.responseTime },
      },
      convergent: {
        engagementScore: Math.min(50, engagementScore),
        pipelineScore,
        stockCoverageScore,
        pipelineOpen: openLeads.length,
        pipelineWon: wonLeads.length,
        pipelineTotal: leads.length,
        monitorLinkedLeads,
        staleOpenLeads,
      },
    };
  } catch (error) {
    console.error('Erreur lors du calcul des performances:', error);

    return {
      score: 45,
      target: 85,
      rank: 1,
      totalVendors: 1,
      sales: 0,
      salesTarget: 3000000,
      growth: 0,
      growthTarget: 15,
      prospects: 0,
      activeProspects: 0,
      responseTime: 2.5,
      responseTarget: 1.5,
      activityLevel: 'modéré',
      activityRecommendation: 'Vérifiez la connexion et les tables (messages, offres, leads)',
      recommendations: [
        {
          type: 'system',
          action: 'Synchroniser les données commerciales',
          impact: 'Réessayez après connexion ; le score convergent nécessite catalogue + pipeline',
          priority: 'high' as const,
        },
      ],
      trends: {
        sales: 'stable' as const,
        growth: 'stable' as const,
        prospects: 'stable' as const,
        responseTime: 'stable' as const,
      },
      metrics: {
        sales: { value: 0, target: 3000000, trend: 'stable' as const },
        growth: { value: 0, target: 15, trend: 'stable' as const },
        prospects: { value: 0, target: 8, trend: 'stable' as const },
        responseTime: { value: 2.5, target: 1.5, trend: 'stable' as const },
      },
    };
  }
}
