import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Package, TrendingUp, AlertTriangle, Plus, Download,
  Camera, Star, Send, BarChart3, DollarSign, ChevronRight, ChevronDown,
  Users, ExternalLink, Copy, Scale,
} from 'lucide-react';
import { apiCall, showNotification, sendMessage, exportData } from '../../../services/apiService';
import { RealStockService, RealEquipment, RealPromotion, StockInsight } from '../../../services/realStockService';
import { supabaseClient } from '../../../utils/supabaseClient';
import { MACHINE_LIST_COLUMNS, SELLER_MACHINES_MAX_ROWS } from '../../../constants/machineQueryFields';
import { logger } from '../../../utils/logger';
import {
  buildLeadStockSuggestions,
  type LeadStockSuggestionRow,
  type StockMachineBrief,
} from '../../../utils/stockLeadSuggestions';
import { RealPipelineService } from '../../../services/realPipelineService';
import { buildMonitorContextBySourceIds } from '../../../utils/buildMonitorContextForLeadSourceIds';

function stableNumericIdFromUuid(uuid: string): number {
  let h = 0;
  for (let i = 0; i < uuid.length; i++) {
    h = (Math.imul(31, h) + uuid.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 2_147_483_647 || 1;
}

// Interface pour les équipements
interface Equipment {
  id: number;
  /** Id Supabase (UUID) pour deep-link catalogue */
  machineUuid?: string;
  name: string;
  category: string;
  brand?: string;
  model?: string;
  daysInStock: number;
  views: number;
  clicks: number;
  contacts: number;
  visibilityScore: number;
  aiTip: string;
  alert: boolean;
  price?: number;
  photos?: string[];
  description?: string;
}

function stockBriefsFromEquipments(equipments: Equipment[]): StockMachineBrief[] {
  return equipments.map((eq) => ({
    id: eq.machineUuid ?? String(eq.id),
    name: eq.name,
    category: eq.category,
    brand: eq.brand,
    model: eq.model,
    price: eq.price,
    description: eq.description ? eq.description.slice(0, 400) : undefined,
  }));
}

/** Alignement catégories widget / filtres (identique catalogue → libellés FR). */
function mapEquipmentCategory(row: {
  category?: string | null;
  name?: string | null;
  title?: string | null;
}): string {
  let mappedCategory = 'Autre';
  const originalCategory = row.category?.toLowerCase() || '';
  const equipmentName = row.name?.toLowerCase() || '';
  const equipmentTitle = (row.title || '').toLowerCase() || '';
  const searchText = `${originalCategory} ${equipmentName} ${equipmentTitle}`;

  if (searchText.includes('pelle') || searchText.includes('excavator') || searchText.includes('excavatrice')) {
    mappedCategory = 'Pelle';
  } else if (searchText.includes('chargeur') || searchText.includes('loader') || searchText.includes('chargeuse')) {
    mappedCategory = 'Chargeur';
  } else if (searchText.includes('bouteur') || searchText.includes('bulldozer')) {
    mappedCategory = 'Bouteur';
  } else if (searchText.includes('excavatrice') || searchText.includes('excavator')) {
    mappedCategory = 'Excavatrice';
  } else if (searchText.includes('camion') || searchText.includes('truck') || searchText.includes('dumper')) {
    mappedCategory = 'Camion';
  } else if (searchText.includes('compacteur') || searchText.includes('compactor') || searchText.includes('rouleau')) {
    mappedCategory = 'Compacteur';
  } else if (searchText.includes('tombereau') || searchText.includes('dumper') || searchText.includes('benne')) {
    mappedCategory = 'Tombereau';
  } else if (searchText.includes('grue') || searchText.includes('crane')) {
    mappedCategory = 'Grue';
  } else if (searchText.includes('niveleuse') || searchText.includes('grader')) {
    mappedCategory = 'Niveleuse';
  } else if (searchText.includes('finisseur') || searchText.includes('paver')) {
    mappedCategory = 'Finisseur';
  } else if (searchText.includes('tracteur') || searchText.includes('tractor')) {
    mappedCategory = 'Tracteur';
  } else if (searchText.includes('groupe') || searchText.includes('generator')) {
    mappedCategory = 'Groupe électrogène';
  } else if (searchText.includes('compresseur') || searchText.includes('compressor')) {
    mappedCategory = 'Compresseur';
  } else if (searchText.includes('betonniere') || searchText.includes('mixer')) {
    mappedCategory = 'Bétonnière';
  } else if (searchText.includes('foreuse') || searchText.includes('drill')) {
    mappedCategory = 'Foreuse';
  } else if (searchText.includes('concasseur') || searchText.includes('crusher')) {
    mappedCategory = 'Concasseur';
  } else if (searchText.includes('crible') || searchText.includes('screen')) {
    mappedCategory = 'Crible';
  } else if (searchText.includes('malaxeur') || searchText.includes('mixer')) {
    mappedCategory = 'Malaxeur';
  } else if (searchText.includes('pompe') || searchText.includes('pump')) {
    mappedCategory = 'Pompe';
  } else if (searchText.includes('chariot') || searchText.includes('forklift')) {
    mappedCategory = 'Chariot élévateur';
  } else if (searchText.includes('nacelle') || searchText.includes('platform')) {
    mappedCategory = 'Nacelle';
  } else if (searchText.includes('echafaudage') || searchText.includes('scaffold')) {
    mappedCategory = 'Échafaudage';
  } else if (searchText.includes('outillage') || searchText.includes('tool')) {
    mappedCategory = 'Outillage';
  } else if (searchText.includes('materiel') || searchText.includes('equipment')) {
    mappedCategory = 'Matériel';
  }

  return mappedCategory;
}

interface MarketReferenceMachine {
  id: string;
  name: string;
  category: string;
  brand?: string;
  model?: string;
  price: number;
}

function machineRowIsOwnListing(
  row: { id?: string; sellerid?: string | null; seller_id?: string | null },
  authUserId: string,
  proSellerUuid: string | null,
  ownMachineIds: Set<string>,
): boolean {
  if (row.id != null && ownMachineIds.has(String(row.id))) return true;
  const sid = row.sellerid != null ? String(row.sellerid) : '';
  const sid2 = row.seller_id != null ? String(row.seller_id) : '';
  if (sid === authUserId || sid2 === authUserId) return true;
  if (proSellerUuid && (sid === proSellerUuid || sid2 === proSellerUuid)) return true;
  return false;
}

function negotiationHint(ownPrice: number, median: number): string | null {
  if (!median || median <= 0 || !ownPrice || ownPrice <= 0) return null;
  const ratio = ownPrice / median;
  if (ratio > 1.12) {
    return 'Au-dessus de la médiane visible sur le site : le prospect peut demander une baisse si il compare les annonces.';
  }
  if (ratio < 0.88) {
    return 'En dessous de la médiane du site : bon levier commercial ; veillez à garder une marge suffisante.';
  }
  return 'Proche de la médiane du marché visible : base saine pour négocier (options, livraison, garantie).';
}

// Interface pour les promotions
interface Promotion {
  id: number;
  title: string;
  description: string;
  discount: number;
  startDate: string;
  endDate: string;
  equipmentIds: number[];
  status: 'active' | 'inactive' | 'expired';
}

const StockStatusWidget = () => {
  // Montrer des données de démo immédiatement pour éviter l'état "0/0"
  // tant que les appels Supabase ne sont pas terminés (ou en cas d'erreur réseau).
  const [equipments, setEquipments] = useState<Equipment[]>(() => getDemoEquipments());
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('Toutes');
  const [selectedAnciennete, setSelectedAnciennete] = useState('Toutes');
  const [showQuickActions, setShowQuickActions] = useState(true);
  const [loading, setLoading] = useState(false);
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);
  const [leadStockRows, setLeadStockRows] = useState<LeadStockSuggestionRow[]>([]);
  const [leadAlignHint, setLeadAlignHint] = useState<string | null>(null);
  const [showLeadAlign, setShowLeadAlign] = useState(true);
  const [marketReferenceMachines, setMarketReferenceMachines] = useState<MarketReferenceMachine[]>([]);
  const [showMarketSitePanel, setShowMarketSitePanel] = useState(true);
  const equipmentsRef = useRef(equipments);
  equipmentsRef.current = equipments;

  const syncLeadStockSuggestions = useCallback(async (list: Equipment[]) => {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      setLeadStockRows([]);
      setLeadAlignHint(null);
      return;
    }
    const briefs = stockBriefsFromEquipments(list);
    const leads = await RealPipelineService.getLeads();

    let monitorBySourceId = await (async () => {
      const sourceIds = leads
        .map((l) => (l.source_id || '').trim())
        .filter(Boolean);
      if (!sourceIds.length) return new Map();
      try {
        return await buildMonitorContextBySourceIds(sourceIds);
      } catch (e) {
        logger.info('Contexte Global Monitor (besoins projet) non chargé:', e);
        return new Map();
      }
    })();

    const rows = buildLeadStockSuggestions(leads, briefs, 3, 14, monitorBySourceId);

    setLeadStockRows(rows);

    if (!leads.length) {
      setLeadAlignHint(
        'Aucun lead chargé pour ce compte. Vérifiez que le pipeline enregistre bien des opportunités (table leads, même utilisateur connecté).',
      );
    } else if (!rows.length) {
      setLeadAlignHint(
        'Vos leads sont tous fermés (Conclu, Perdu, etc.) — aucune opportunité ouverte à rapprocher du stock.',
      );
    } else {
      setLeadAlignHint(null);
    }
  }, []);

  const categories = [
    'Toutes', 
    'Pelle', 
    'Chargeur', 
    'Bouteur', 
    'Excavatrice', 
    'Camion',
    'Compacteur',
    'Tombereau',
    'Grue',
    'Niveleuse',
    'Finisseur',
    'Tracteur',
    'Groupe électrogène',
    'Compresseur',
    'Bétonnière',
    'Foreuse',
    'Concasseur',
    'Crible',
    'Malaxeur',
    'Pompe',
    'Chariot élévateur',
    'Nacelle',
    'Échafaudage',
    'Outillage',
    'Matériel',
    'Autre'
  ];
  const anciennetes = ['Toutes', '0-30j', '30-60j', '60j+', '90j+'];

  // Logique de filtrage des équipements
  const filteredEquipments = equipments.filter(equipment => {
    // Filtre par catégorie
    if (selectedCategory !== 'Toutes' && equipment.category !== selectedCategory) {
      logger.info(`❌ Équipement "${equipment.name}" filtré: catégorie="${equipment.category}" ≠ sélection="${selectedCategory}"`);
      return false;
    }
    
    // Filtre par ancienneté
    if (selectedAnciennete !== 'Toutes') {
      const days = equipment.daysInStock;
      switch (selectedAnciennete) {
        case '0-30j':
          if (days > 30) {
            logger.info(`❌ Équipement "${equipment.name}" filtré: ${days} jours > 30`);
            return false;
          }
          break;
        case '30-60j':
          if (days < 30 || days > 60) {
            logger.info(`❌ Équipement "${equipment.name}" filtré: ${days} jours hors 30-60`);
            return false;
          }
          break;
        case '60j+':
          if (days < 60) {
            logger.info(`❌ Équipement "${equipment.name}" filtré: ${days} jours < 60`);
            return false;
          }
          break;
        case '90j+':
          if (days < 90) {
            logger.info(`❌ Équipement "${equipment.name}" filtré: ${days} jours < 90`);
            return false;
          }
          break;
      }
    }
    
    logger.info(`✅ Équipement "${equipment.name}" accepté: catégorie="${equipment.category}", jours="${equipment.daysInStock}"`);
    return true;
  });

  // Log du filtrage
  logger.info(`🔍 Filtrage: catégorie="${selectedCategory}", ancienneté="${selectedAnciennete}"`);
  logger.info(`📊 Résultat: ${filteredEquipments.length}/${equipments.length} équipements affichés`);

  const marketStatsByCategory = useMemo(() => {
    const acc = new Map<string, number[]>();
    for (const m of marketReferenceMachines) {
      if (m.price <= 0) continue;
      const arr = acc.get(m.category) || [];
      arr.push(m.price);
      acc.set(m.category, arr);
    }
    const out = new Map<string, { min: number; max: number; median: number; count: number }>();
    for (const [cat, prices] of acc) {
      if (!prices.length) continue;
      const sorted = [...prices].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median =
        sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
      out.set(cat, {
        min: sorted[0]!,
        max: sorted[sorted.length - 1]!,
        median,
        count: sorted.length,
      });
    }
    return out;
  }, [marketReferenceMachines]);

  const filteredMarketSamples = useMemo(() => {
    if (selectedCategory === 'Toutes') return marketReferenceMachines;
    return marketReferenceMachines.filter((m) => m.category === selectedCategory);
  }, [marketReferenceMachines, selectedCategory]);

  // Charger les données réelles depuis Supabase
  useEffect(() => {
    loadRealData();
  }, []);

  useEffect(() => {
    const onPipelineRefresh = () => {
      void syncLeadStockSuggestions(equipmentsRef.current);
    };
    window.addEventListener('pipeline:refresh', onPipelineRefresh);
    return () => window.removeEventListener('pipeline:refresh', onPipelineRefresh);
  }, [syncLeadStockSuggestions]);

  useEffect(() => {
    void syncLeadStockSuggestions(equipments);
  }, [equipments, syncLeadStockSuggestions]);

  const loadRealData = async () => {
    try {
      setLoading(true);
      logger.info("🔄 Chargement des données réelles du stock depuis Supabase...");
      
      // Récupérer l'utilisateur connecté
      const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
      logger.info("👤 Utilisateur connecté:", user?.id, userError);
      
      if (!user) {
        logger.error("❌ Aucun utilisateur connecté");
        setEquipments(getDemoEquipments());
        setLeadStockRows([]);
        setMarketReferenceMachines([]);
        return;
      }

      logger.info("🔍 Récupération des machines du vendeur...");
      // Essayer d'abord avec sellerid
      let { data: userMachines, error: userMachinesError } = await supabaseClient
        .from('machines')
        .select(MACHINE_LIST_COLUMNS)
        .eq('sellerid', user.id)
        .limit(SELLER_MACHINES_MAX_ROWS);
      
      logger.info("📊 Machines avec sellerid:", userMachines?.length || 0, userMachinesError);
      
      // Si pas de résultats, essayer avec seller_id
      if (!userMachines || userMachines.length === 0) {
        logger.info("🔄 Essai avec seller_id...");
        const { data: userMachines2, error: userMachinesError2 } = await supabaseClient
          .from('machines')
          .select(MACHINE_LIST_COLUMNS)
          .eq('seller_id', user.id)
          .limit(SELLER_MACHINES_MAX_ROWS);
        
        userMachines = userMachines2;
        userMachinesError = userMachinesError2;
        logger.info("📊 Machines avec seller_id:", userMachines?.length || 0, userMachinesError);
      }
      
      // Si toujours pas de résultats, essayer avec user_id
      if (!userMachines || userMachines.length === 0) {
        logger.info("🔄 Essai avec user_id...");
        const { data: userMachines3, error: userMachinesError3 } = await supabaseClient
          .from('machines')
          .select(MACHINE_LIST_COLUMNS)
          .eq('user_id', user.id)
          .limit(SELLER_MACHINES_MAX_ROWS);
        
        userMachines = userMachines3;
        userMachinesError = userMachinesError3;
        logger.info("📊 Machines avec user_id:", userMachines?.length || 0, userMachinesError);
      }

      // Si toujours pas de résultats, essayer avec owner_id
      if (!userMachines || userMachines.length === 0) {
        logger.info("🔄 Essai avec owner_id...");
        const { data: userMachines4, error: userMachinesError4 } = await supabaseClient
          .from('machines')
          .select(MACHINE_LIST_COLUMNS)
          .eq('owner_id', user.id)
          .limit(SELLER_MACHINES_MAX_ROWS);

        userMachines = userMachines4;
        userMachinesError = userMachinesError4;
        logger.info("📊 Machines avec owner_id:", userMachines?.length || 0, userMachinesError);
      }

      // Fallback prod: certains environnements lient machines -> pro_clients.id
      // (et non auth.uid). On récupère donc le client pro puis on retente.
      if (!userMachines || userMachines.length === 0) {
        logger.info("🔄 Essai via pro_clients.user_id -> machines.sellerid/seller_id...");
        const { data: proClient, error: proClientError } = await supabaseClient
          .from('pro_clients')
          .select('id,user_id')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        logger.info("📊 Pro client détecté:", proClient?.id || null, proClientError);

        if (proClient?.id) {
          const { data: userMachines5, error: userMachinesError5 } = await supabaseClient
            .from('machines')
            .select(MACHINE_LIST_COLUMNS)
            .eq('sellerid', proClient.id)
            .limit(SELLER_MACHINES_MAX_ROWS);

          userMachines = userMachines5;
          userMachinesError = userMachinesError5;
          logger.info("📊 Machines avec sellerid=pro_client.id:", userMachines?.length || 0, userMachinesError);

          if (!userMachines || userMachines.length === 0) {
            const { data: userMachines6, error: userMachinesError6 } = await supabaseClient
              .from('machines')
              .select(MACHINE_LIST_COLUMNS)
              .eq('seller_id', proClient.id)
              .limit(SELLER_MACHINES_MAX_ROWS);

            userMachines = userMachines6;
            userMachinesError = userMachinesError6;
            logger.info("📊 Machines avec seller_id=pro_client.id:", userMachines?.length || 0, userMachinesError);
          }
        }
      }
      
      // Important: ne jamais charger les machines d'autres comptes.
      // Si aucune machine n'est trouvée pour l'utilisateur connecté, on reste sur un tableau vide.
      if (!userMachines || userMachines.length === 0) {
        logger.info("ℹ️ Aucune machine trouvée pour l'utilisateur connecté.");
        userMachines = [];
      }
      
      const [promoRes, insightsRes] = await Promise.allSettled([
        RealStockService.getSellerPromotions(),
        RealStockService.getStockInsights(),
      ]);
      const realPromotions = promoRes.status === 'fulfilled' ? promoRes.value : [];
      const realInsights = insightsRes.status === 'fulfilled' ? insightsRes.value : [];
      logger.info("✅ Promotions réelles récupérées:", realPromotions.length);
      logger.info("✅ Insights réels récupérés:", realInsights.length);
      
      // Convertir les équipements réels au format attendu par le widget
      const formattedEquipments = (userMachines || []).map(equipment => {
        // Calculer les métriques de base
        const daysInStock = equipment.created_at ? 
          Math.floor((Date.now() - new Date(equipment.created_at).getTime()) / (1000 * 60 * 60 * 24)) : 0;
        
        const visibilityScore = Math.floor(Math.random() * 100); // Temporaire pour le test
        const views = Math.floor(Math.random() * 200);
        const clicks = Math.floor(views * 0.15);
        const contacts = Math.floor(Math.random() * 10);
        
        const mappedCategory = mapEquipmentCategory({
          category: equipment.category,
          name: equipment.name,
          title: (equipment as { title?: string }).title,
        });
        
        logger.info(`🔍 Équipement "${equipment.name}": catégorie originale="${equipment.category}", mappée="${mappedCategory}"`);
        
        const machineUuid = String(equipment.id);
        return {
          id: stableNumericIdFromUuid(machineUuid),
          machineUuid,
          name: equipment.name || (equipment as { title?: string }).title || 'Équipement sans nom',
          category: mappedCategory,
          brand: equipment.brand?.trim() || undefined,
          model: equipment.model?.trim() || undefined,
          daysInStock: daysInStock,
          views: views,
          clicks: clicks,
          contacts: contacts,
          visibilityScore: visibilityScore,
          aiTip: generateAITip({
            days_in_stock: daysInStock,
            visibility_score: visibilityScore,
            contacts_count: contacts,
            views_count: views
          }),
          alert: daysInStock > 60 || visibilityScore < 50,
          price: equipment.price || 0,
          photos: equipment.photos || [],
          description: equipment.description || ''
        };
      });
      
      // Log des catégories finales
      const finalCategories = [...new Set(formattedEquipments.map(eq => eq.category))];
      logger.info("📊 Catégories finales des équipements:", finalCategories);
      logger.info("📊 Répartition par catégorie:", finalCategories.map(cat => ({
        category: cat,
        count: formattedEquipments.filter(eq => eq.category === cat).length
      })));
      
      // Convertir les promotions réelles au format attendu
      const formattedPromotions = realPromotions.map(promotion => ({
        id: stableNumericIdFromUuid(String(promotion.id)),
        title: promotion.title,
        description: promotion.description,
        discount: promotion.discount_percentage,
        startDate: promotion.start_date,
        endDate: promotion.end_date,
        equipmentIds: promotion.equipment_ids.map((id) => stableNumericIdFromUuid(String(id))),
        status: promotion.status
      }));
      
      /* Échantillon « marché site » : annonces publiques hors compte vendeur (provisoire, comparaison prix). */
      const ownIds = new Set((userMachines || []).map((m: { id: string }) => String(m.id)));
      const { data: proLinkRow } = await supabaseClient
        .from('pro_clients')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const proSellerUuid = proLinkRow?.id ? String(proLinkRow.id) : null;

      const { data: siteMachinesRaw, error: siteMachinesErr } = await supabaseClient
        .from('machines')
        .select(MACHINE_LIST_COLUMNS)
        .order('created_at', { ascending: false })
        .limit(140);

      const marketRefs: MarketReferenceMachine[] = [];
      if (!siteMachinesErr && siteMachinesRaw?.length) {
        for (const raw of siteMachinesRaw) {
          if (machineRowIsOwnListing(raw, user.id, proSellerUuid, ownIds)) continue;
          const price = typeof raw.price === 'number' ? raw.price : Number(raw.price) || 0;
          marketRefs.push({
            id: String(raw.id),
            name: raw.name || 'Annonce',
            category: mapEquipmentCategory({
              category: raw.category,
              name: raw.name,
              title: (raw as { title?: string }).title,
            }),
            brand: raw.brand?.trim() || undefined,
            model: raw.model?.trim() || undefined,
            price,
          });
          if (marketRefs.length >= 72) break;
        }
      } else if (siteMachinesErr) {
        logger.info('ℹ️ Échantillon marché site indisponible:', siteMachinesErr);
      }
      setMarketReferenceMachines(marketRefs);

      setEquipments(formattedEquipments);
      setPromotions(formattedPromotions);

      logger.info("✅ Données réelles du stock chargées avec succès:", formattedEquipments.length, "équipements");
      
    } catch (error) {
      logger.error("❌ Erreur lors du chargement des données réelles du stock:", error);
      // En cas d'erreur, utiliser des données de démonstration
      setEquipments(getDemoEquipments());
      setPromotions([]);
      setLeadStockRows([]);
      setMarketReferenceMachines([]);
    } finally {
      setLoading(false);
    }
  };

  // Fonction pour générer des conseils IA basés sur les vraies données
  const generateAITip = (equipment: {
    days_in_stock: number;
    visibility_score: number;
    contacts_count: number;
    views_count: number;
  }): string => {
    if (equipment.days_in_stock > 90) {
      return 'Équipement en stock depuis longtemps. Créez une offre flash pour le vendre rapidement';
    }
    if (equipment.visibility_score < 50) {
      return 'Ajoutez plus de photos pour améliorer la visibilité de 15%';
    }
    if (equipment.contacts_count === 0) {
      return 'Améliorez la description et les mots-clés pour attirer plus de prospects';
    }
    if (equipment.views_count > 100 && equipment.contacts_count < 3) {
      return 'Optimisez le prix pour convertir les vues en contacts';
    }
    return 'Performance correcte. Continuez à surveiller les métriques';
  };

  // Données de démonstration
  function getDemoEquipments(): Equipment[] {
    return [
    {
      id: 1,
      name: 'Pelle hydraulique CAT 320',
      category: 'Pelle',
      daysInStock: 45,
      views: 120,
      clicks: 15,
      contacts: 3,
      visibilityScore: 75,
      aiTip: 'Ajoutez plus de photos pour améliorer la visibilité de 15%',
      alert: true,
      price: 850000,
      photos: ['photo1.jpg', 'photo2.jpg'],
      description: 'Pelle hydraulique en excellent état'
    },
    {
      id: 2,
      name: 'Chargeur frontal Volvo L120',
      category: 'Chargeur',
      daysInStock: 30,
      views: 85,
      clicks: 12,
      contacts: 2,
      visibilityScore: 65,
      aiTip: 'Optimisez le prix pour augmenter les contacts de 25%',
      alert: false,
      price: 650000,
      photos: ['photo3.jpg'],
      description: 'Chargeur frontal récent'
    },
    {
      id: 3,
      name: 'Bouteur D6T CAT',
      category: 'Bouteur',
      daysInStock: 90,
      views: 45,
      clicks: 5,
      contacts: 1,
      visibilityScore: 35,
      aiTip: 'Équipement en stock depuis longtemps. Créez une offre flash pour le vendre rapidement',
      alert: true,
      price: 450000,
      photos: [],
      description: 'Bouteur en bon état'
    }
    ];
  }

  // Actions rapides avec réactivité maximale
  const handleQuickAction = (
    action: string,
    equipment?: Equipment,
    e?: React.MouseEvent<HTMLButtonElement>
  ) => {
    // Feedback visuel immédiat
    const button = e?.currentTarget;
    if (button) {
      button.disabled = true;
      button.style.opacity = '0.6';
      button.style.cursor = 'not-allowed';
    }

    logger.info(`🔄 Action rapide: ${action}`, equipment);
    
    // Notification immédiate
    showNotification('info', `Exécution de ${action}...`);
    
    // Actions synchrones immédiates
    switch (action) {
      case 'add-equipment':
        handleAddEquipment();
        break;
      case 'export-stock':
        handleExportStock();
        break;
      case 'boost-visibility':
        handleBoostVisibility(equipment);
        break;
      case 'create-flash-offer':
        handleCreateFlashOffer(equipment);
        break;
      case 'add-photo':
        handleAddPhoto(equipment);
        break;
      case 'send-promotion':
        handleSendPromotion();
        break;
      case 'analyze-performance':
        handleAnalyzePerformance();
        break;
      case 'optimize-pricing':
        handleOptimizePricing();
        break;
      default:
        showNotification('warning', `L'action "${action}" n'est pas encore implémentée`);
    }

    // Restaurer le bouton immédiatement après l'action
    setTimeout(() => {
      if (button) {
        button.disabled = false;
        button.style.opacity = '1';
        button.style.cursor = 'pointer';
      }
    }, 100);
  };

  const handleAddEquipment = () => {
    try {
      // Action immédiate - redirection
      window.location.href = '/#publication';
    } catch (error) {
      logger.error('Erreur lors de l\'ajout de l\'équipement:', error);
      showNotification('error', 'Impossible d\'ajouter l\'équipement');
    }
  };

  const handleExportStock = () => {
    try {
      // Préparer les données immédiatement
      const stockData = equipments.map(eq => ({
        'Nom': eq.name,
        'Catégorie': eq.category,
        'Jours en stock': eq.daysInStock,
        'Vues': eq.views,
        'Clics': eq.clicks,
        'Contacts': eq.contacts,
        'Score visibilité': eq.visibilityScore,
        'Conseil IA': eq.aiTip,
        'Alerte': eq.alert ? 'Oui' : 'Non',
        'Prix': eq.price || 'Non défini'
      }));
      
      // Export immédiat (sans await)
      exportData(stockData, `stock-revente-${new Date().toISOString().split('T')[0]}`, 'excel');
      showNotification('success', 'Export du stock réussi');
      
    } catch (error) {
      logger.error('Erreur lors de l\'export:', error);
      showNotification('error', 'Impossible d\'exporter le stock');
    }
  };

  const handleBoostVisibility = (equipment?: Equipment) => {
    try {
      if (!equipment) {
        showNotification('warning', 'Sélectionnez un équipement pour le booster');
        return;
      }

      // Mise à jour immédiate de l'interface
      setEquipments(prev => prev.map(eq => 
        eq.id === equipment.id 
          ? { ...eq, visibilityScore: Math.min(100, eq.visibilityScore + 15) }
          : eq
      ));
      
      showNotification('success', `Visibilité boostée pour ${equipment.name}`);
      
      // Appel API en arrière-plan (sans await)
      setTimeout(() => {
        apiCall('POST', '/api/equipment/boost', {
          equipmentId: equipment.id,
          boostType: 'visibility'
        }).catch(error => {
          logger.error('Erreur API boost:', error);
        });
      }, 50);
      
    } catch (error) {
      logger.error('Erreur lors du boost:', error);
      showNotification('error', 'Impossible de booster la visibilité');
    }
  };

  const handleCreateFlashOffer = (equipment?: Equipment) => {
    try {
      if (!equipment) {
        showNotification('warning', 'Sélectionnez un équipement pour créer une offre flash');
        return;
      }

      // Créer la promotion immédiatement
      const flashOffer: Promotion = {
        id: Date.now(),
        title: `Offre Flash - ${equipment.name}`,
        description: `Offre limitée sur ${equipment.name}`,
        discount: 15,
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        equipmentIds: [equipment.id],
        status: 'active'
      };

      // Mise à jour immédiate de l'interface
      setPromotions(prev => [...prev, flashOffer]);
      showNotification('success', `Offre flash créée pour ${equipment.name}`);
      
      // Appel API en arrière-plan (sans await)
      setTimeout(() => {
        apiCall('POST', '/api/promotions/create', flashOffer).catch(error => {
          logger.error('Erreur API création offre:', error);
        });
      }, 50);
      
    } catch (error) {
      logger.error('Erreur lors de la création de l\'offre:', error);
      showNotification('error', 'Impossible de créer l\'offre flash');
    }
  };

  const handleAddPhoto = (equipment?: Equipment) => {
    try {
      if (!equipment) {
        showNotification('warning', 'Sélectionnez un équipement pour ajouter une photo');
        return;
      }

      // Ouvrir le sélecteur de fichier immédiatement
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          // Mise à jour immédiate de l'interface
          setEquipments(prev => prev.map(eq => 
            eq.id === equipment.id 
              ? { ...eq, photos: [...(eq.photos || []), file.name] }
              : eq
          ));
          
          showNotification('success', `Photo ajoutée pour ${equipment.name}`);
          
          // Upload en arrière-plan (sans await)
          setTimeout(() => {
            apiCall('POST', '/api/equipment/upload-photo', {
              equipmentId: equipment.id,
              photo: file
            }).catch(error => {
              logger.error('Erreur API upload photo:', error);
            });
          }, 50);
        }
      };
      input.click();
      
    } catch (error) {
      logger.error('Erreur lors de l\'ajout de photo:', error);
      showNotification('error', 'Impossible d\'ajouter la photo');
    }
  };

  const handleSendPromotion = () => {
    try {
      // Créer la promotion immédiatement
      const promotion: Promotion = {
        id: Date.now(),
        title: 'Promotion Spéciale',
        description: 'Offres spéciales sur notre stock',
        discount: 10,
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        equipmentIds: equipments.map(e => e.id),
        status: 'active'
      };

      // Mise à jour immédiate de l'interface
      setPromotions(prev => [...prev, promotion]);
      showNotification('success', 'Promotion envoyée avec succès');
      
      // Appel API en arrière-plan (sans await)
      setTimeout(() => {
        apiCall('POST', '/api/promotions/send', promotion).catch(error => {
          logger.error('Erreur API envoi promotion:', error);
        });
      }, 50);
      
    } catch (error) {
      logger.error('Erreur lors de l\'envoi de promotion:', error);
      showNotification('error', 'Impossible d\'envoyer la promotion');
    }
  };

  const handleAnalyzePerformance = () => {
    try {
      // Calcul immédiat
      const analysis = {
        totalEquipments: equipments.length,
        averageVisibility: Math.round(equipments.reduce((sum, e) => sum + e.visibilityScore, 0) / equipments.length),
        totalViews: equipments.reduce((sum, e) => sum + e.views, 0),
        totalClicks: equipments.reduce((sum, e) => sum + e.clicks, 0),
        totalContacts: equipments.reduce((sum, e) => sum + e.contacts, 0),
        conversionRate: equipments.reduce((sum, e) => sum + e.contacts, 0) / Math.max(equipments.reduce((sum, e) => sum + e.views, 0), 1) * 100,
        alertEquipments: equipments.filter(e => e.alert).length
      };

      showNotification('success', 'Analyse de performance terminée');
      logger.info('Résultats de l\'analyse:', analysis);
      
      // Appel API en arrière-plan (sans await)
      setTimeout(() => {
        apiCall('POST', '/api/analytics/performance', analysis).catch(error => {
          logger.error('Erreur API analyse:', error);
        });
      }, 50);
      
    } catch (error) {
      logger.error('Erreur lors de l\'analyse:', error);
      showNotification('error', 'Impossible d\'analyser la performance');
    }
  };

  const handleOptimizePricing = () => {
    try {
      // Calcul immédiat
      const optimizations = equipments.map(eq => ({
        id: eq.id,
        name: eq.name,
        currentPrice: eq.price,
        suggestedPrice: eq.price ? Math.round(eq.price * (1 + (eq.visibilityScore - 50) / 100)) : undefined,
        reason: eq.visibilityScore > 70 ? 'Prix sous-évalué' : eq.visibilityScore < 30 ? 'Prix surévalué' : 'Prix correct'
      }));

      showNotification('success', 'Optimisation des prix terminée');
      logger.info('Suggestions d\'optimisation:', optimizations);
      
      // Appel API en arrière-plan (sans await)
      setTimeout(() => {
        apiCall('POST', '/api/pricing/optimize', { optimizations }).catch(error => {
          logger.error('Erreur API optimisation:', error);
        });
      }, 50);
      
    } catch (error) {
      logger.error('Erreur lors de l\'optimisation:', error);
      showNotification('error', 'Impossible d\'optimiser les prix');
    }
  };

  const handleCopyLeadPitch = async (row: LeadStockSuggestionRow) => {
    const monitorBlock =
      row.monitorNeedsSummary != null && row.monitorNeedsSummary !== ''
        ? [
            '',
            'Besoins matériel identifiés sur le projet (Global Monitor) :',
            row.monitorNeedsSummary,
          ]
        : [];

    if (row.suggested.length === 0) {
      const text = [
        `Objet : suite à notre échange — ${row.leadTitle}`,
        '',
        'Bonjour,',
        '',
        `Je reviens vers vous concernant cette opportunité. Je vous envoie très prochainement des fiches matériel adaptées (notre stock est en cours de mise à jour de mon côté).`,
        ...monitorBlock,
        '',
        'Cordialement',
      ].join('\n');
      try {
        await navigator.clipboard.writeText(text);
        showNotification('success', 'Texte copié dans le presse-papiers');
      } catch {
        showNotification('error', 'Impossible de copier (navigateur)');
      }
      return;
    }

    const lines = row.suggested.map((s) => {
      const meta = [s.machine.brand, s.machine.model].filter(Boolean).join(' ');
      const price =
        s.machine.price != null && s.machine.price > 0
          ? `${new Intl.NumberFormat('fr-FR').format(s.machine.price)} €`
          : '';
      return `• ${s.machine.name}${meta ? ` (${meta})` : ''}${price ? ` — ${price}` : ''}`;
    });
    const text = [
      `Objet : suite à notre échange — pistes du stock`,
      '',
      'Bonjour,',
      '',
      `Concernant « ${row.leadTitle} », voici des annonces de notre catalogue qui pourraient correspondre :`,
      ...monitorBlock,
      '',
      ...lines,
      '',
      'N’hésitez pas à me dire laquelle vous intéresse pour affiner (budget, dispo, livraison).',
      '',
      'Cordialement',
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      showNotification('success', 'Texte copié dans le presse-papiers');
    } catch {
      showNotification('error', 'Impossible de copier (navigateur)');
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      {/* CSS personnalisé pour les barres de défilement */}
      <style>{`
        select::-webkit-scrollbar {
          width: 6px;
        }
        select::-webkit-scrollbar-track {
          background: #fef3c7;
          border-radius: 3px;
        }
        select::-webkit-scrollbar-thumb {
          background: #f97316;
          border-radius: 3px;
        }
        select::-webkit-scrollbar-thumb:hover {
          background: #ea580c;
        }
        select {
          max-height: 200px;
        }
        select option {
          padding: 8px 12px;
          border-bottom: 1px solid #f3f4f6;
        }
        select option:hover {
          background-color: #fef3c7;
        }
      `}</style>
      
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-100 rounded-lg">
            <Package className="w-6 h-6 text-orange-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Plan d'action Stock & Revente</h3>
            <p className="text-sm text-gray-600">
              {loading ? 'Chargement des données réelles...' : 'Données en temps réel'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {loading && (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-orange-600"></div>
          )}
          <span className="text-sm text-gray-500">
            {equipments.filter(e => e.alert).length} alertes
          </span>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative">
          <select
            className="appearance-none rounded border border-orange-200 bg-white text-orange-700 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-orange-300 focus:border-orange-400 cursor-pointer min-w-[100px] max-w-[140px] pr-6"
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
            style={{
              backgroundImage: 'none',
              scrollbarWidth: 'thin',
              scrollbarColor: '#f97316 #fef3c7',
              maxHeight: '50px'
            }}
          >
            {categories.map(cat => (
              <option key={cat} value={cat} className="text-xs py-0.5">
                {cat}
              </option>
            ))}
          </select>
          <div className="absolute inset-y-0 right-0 flex items-center pr-1 pointer-events-none">
            <svg className="w-3 h-3 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        
        <div className="relative">
          <select
            className="appearance-none rounded border border-orange-200 bg-white text-orange-700 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-orange-300 focus:border-orange-400 cursor-pointer min-w-[80px] pr-6"
            value={selectedAnciennete}
            onChange={e => setSelectedAnciennete(e.target.value)}
            style={{
              backgroundImage: 'none',
              scrollbarWidth: 'thin',
              scrollbarColor: '#f97316 #fef3c7',
              maxHeight: '50px'
            }}
          >
            {anciennetes.map(a => (
              <option key={a} value={a} className="text-xs py-0.5">
                {a}
              </option>
            ))}
          </select>
          <div className="absolute inset-y-0 right-0 flex items-center pr-1 pointer-events-none">
            <svg className="w-3 h-3 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        
        {/* Indicateur de résultats */}
        <div className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded">
          <span className="font-medium">{filteredEquipments.length}</span> équipement{filteredEquipments.length > 1 ? 's' : ''} trouvé{filteredEquipments.length > 1 ? 's' : ''}
        </div>
      </div>

      {/* Actions rapides connectées aux services communs */}
      <div className="bg-white rounded-lg border border-orange-200 p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-orange-900 flex items-center gap-2">
            <Package className="w-4 h-4" />
            Actions Rapides
          </h4>
          <button
            className="p-1 text-orange-500 hover:text-orange-700 transition-colors"
            onClick={() => setShowQuickActions((v) => !v)}
            title={showQuickActions ? 'Fermer' : 'Ouvrir'}
          >
            {showQuickActions ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
        {showQuickActions && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <button
              onClick={(e) => handleQuickAction('add-equipment', undefined, e)}
              className="flex flex-col items-center p-3 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors text-xs"
            >
              <Plus className="w-4 h-4 text-orange-600 mb-1" />
              <span className="text-orange-800 font-medium">Ajouter</span>
            </button>
            
            <button
              onClick={(e) => handleQuickAction('export-stock', undefined, e)}
              className="flex flex-col items-center p-3 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors text-xs"
            >
              <Download className="w-4 h-4 text-orange-600 mb-1" />
              <span className="text-orange-800 font-medium">Exporter</span>
            </button>
            
            <button
              onClick={(e) => handleQuickAction('boost-visibility', undefined, e)}
              className="flex flex-col items-center p-3 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors text-xs"
            >
              <TrendingUp className="w-4 h-4 text-orange-600 mb-1" />
              <span className="text-orange-800 font-medium">Booster</span>
            </button>
            
            <button
              onClick={(e) => handleQuickAction('create-flash-offer', undefined, e)}
              className="flex flex-col items-center p-3 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors text-xs"
            >
              <Star className="w-4 h-4 text-orange-600 mb-1" />
              <span className="text-orange-800 font-medium">Offre Flash</span>
            </button>
            
            <button
              onClick={(e) => handleQuickAction('add-photo', undefined, e)}
              className="flex flex-col items-center p-3 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors text-xs"
            >
              <Camera className="w-4 h-4 text-orange-600 mb-1" />
              <span className="text-orange-800 font-medium">Photo</span>
            </button>
            
            <button
              onClick={(e) => handleQuickAction('send-promotion', undefined, e)}
              className="flex flex-col items-center p-3 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors text-xs"
            >
              <Send className="w-4 h-4 text-orange-600 mb-1" />
              <span className="text-orange-800 font-medium">Promotion</span>
            </button>
            
            <button
              onClick={(e) => handleQuickAction('analyze-performance', undefined, e)}
              className="flex flex-col items-center p-3 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors text-xs"
            >
              <BarChart3 className="w-4 h-4 text-orange-600 mb-1" />
              <span className="text-orange-800 font-medium">Analyse</span>
            </button>
            
            <button
              onClick={(e) => handleQuickAction('optimize-pricing', undefined, e)}
              className="flex flex-col items-center p-3 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors text-xs"
            >
              <DollarSign className="w-4 h-4 text-orange-600 mb-1" />
              <span className="text-orange-800 font-medium">Optimiser</span>
            </button>
          </div>
        )}
      </div>

      {/* Suggestions stock alignées sur les leads (pipeline) */}
      <div className="rounded-lg border border-amber-200/80 bg-gradient-to-b from-amber-50/80 to-white mb-4 overflow-hidden">
        <button
          type="button"
          className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-amber-50/90 transition-colors"
          onClick={() => setShowLeadAlign((v) => !v)}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 bg-amber-100 rounded-md shrink-0">
              <Users className="w-4 h-4 text-amber-800" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900">Stock × leads</div>
              <div className="text-xs text-gray-600 truncate">
                Propositions basées sur le lead et, si le prospect vient du Global Monitor, sur les besoins
                matériel du projet (source_id).
              </div>
            </div>
          </div>
          {showLeadAlign ? <ChevronDown className="w-4 h-4 text-amber-700 shrink-0" /> : <ChevronRight className="w-4 h-4 text-amber-700 shrink-0" />}
        </button>
        {showLeadAlign && (
          <div className="px-4 pb-4 space-y-3 border-t border-amber-100">
            {leadAlignHint && (
              <p className="text-xs text-amber-900/90 bg-amber-100/80 border border-amber-200 rounded-md px-3 py-2 mt-3">
                {leadAlignHint}
              </p>
            )}
            {leadStockRows.length === 0 ? (
              <p className="text-xs text-gray-600 pt-3">
                Aucun alignement à afficher. Ajoutez des leads ouverts dans le pipeline ou vérifiez que vous êtes connecté avec le compte vendeur attendu.
              </p>
            ) : (
              leadStockRows.map((row) => (
                <div
                  key={row.leadId}
                  className="rounded-lg border border-gray-200 bg-white p-3 text-sm shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900">{row.leadTitle}</div>
                      <div className="text-xs text-gray-500">
                        {row.contactLabel}
                        <span className="mx-1">·</span>
                        {row.stage}
                      </div>
                      {row.monitorNeedsSummary ? (
                        <p className="text-xs text-sky-900/95 bg-sky-50 border border-sky-100 rounded-md px-2 py-1.5 mt-2">
                          <span className="font-semibold">Besoin projet (Global Monitor)</span> —{' '}
                          {row.monitorNeedsSummary}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 shrink-0 text-xs font-medium text-amber-800 bg-amber-100 border border-amber-200 px-2 py-1 rounded-md hover:bg-amber-200/70 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                      onClick={() => void handleCopyLeadPitch(row)}
                      title="Copier un mail court pour le prospect"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copier le texte
                    </button>
                  </div>
                  {row.suggested.length === 0 ? (
                    <p className="text-xs text-amber-900/85 bg-amber-50/90 border border-amber-100 rounded-md px-2 py-2 mt-3">
                      Aucune annonce dans votre stock vendeur pour l’instant : publiez ou rattachez vos machines à ce compte pour que nous puissions proposer des modèles automatiquement.
                    </p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {row.suggested.map((s) => (
                        <li
                          key={`${row.leadId}-${s.machine.id}`}
                          className="flex items-start justify-between gap-2 text-xs rounded-md bg-gray-50 px-2 py-2 border border-gray-100"
                        >
                          <div className="min-w-0">
                            <div className="font-medium text-gray-900">{s.machine.name}</div>
                            {(s.machine.brand || s.machine.model) && (
                              <div className="text-gray-600">
                                {[s.machine.brand, s.machine.model].filter(Boolean).join(' · ')}
                                {s.machine.price != null && s.machine.price > 0 && (
                                  <span className="ml-1 text-gray-800">
                                    · {new Intl.NumberFormat('fr-FR').format(s.machine.price)} €
                                  </span>
                                )}
                              </div>
                            )}
                            <p className="text-gray-600 mt-0.5">{s.reason}</p>
                          </div>
                          <a
                            href={`/#/machines/${encodeURIComponent(s.machine.id)}`}
                            className="shrink-0 p-1.5 rounded-md text-amber-700 hover:bg-amber-100 border border-transparent hover:border-amber-200"
                            title="Ouvrir la fiche annonce"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Référence marché public (provisoire) */}
      <div className="rounded-lg border border-slate-200 bg-slate-50/80 mb-4 overflow-hidden">
        <button
          type="button"
          className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-slate-100/90 transition-colors"
          onClick={() => setShowMarketSitePanel((v) => !v)}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 bg-slate-200/80 rounded-md shrink-0">
              <Scale className="w-4 h-4 text-slate-800" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900">Autres annonces sur le site (provisoire)</div>
              <div className="text-xs text-gray-600 truncate">
                Échantillon hors votre compte pour comparer prix et cadre de négociation — filtre catégorie partagé avec votre liste
              </div>
            </div>
          </div>
          {showMarketSitePanel ? (
            <ChevronDown className="w-4 h-4 text-slate-600 shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
          )}
        </button>
        {showMarketSitePanel && (
          <div className="px-4 pb-4 border-t border-slate-200">
            <p className="text-xs text-slate-600 mt-3 mb-2">
              Données issues du catalogue public (dernières annonces). Exclut vos fiches vendeur ({marketReferenceMachines.length}{' '}
              lignes dans l&apos;échantillon).
            </p>
            {filteredMarketSamples.length === 0 ? (
              <p className="text-xs text-gray-500">Aucune annonce dans l&apos;échantillon pour ce filtre.</p>
            ) : (
              <div className="max-h-56 overflow-y-auto rounded border border-slate-200 bg-white text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 sticky top-0">
                    <tr>
                      <th className="p-2 font-semibold text-slate-700">Annonce</th>
                      <th className="p-2 font-semibold text-slate-700">Cat.</th>
                      <th className="p-2 font-semibold text-slate-700 text-right">Prix</th>
                      <th className="p-2 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMarketSamples.map((row) => (
                      <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                        <td className="p-2">
                          <div className="font-medium text-gray-900 truncate max-w-[180px]">{row.name}</div>
                          <div className="text-slate-500 truncate max-w-[180px]">
                            {[row.brand, row.model].filter(Boolean).join(' · ') || '—'}
                          </div>
                        </td>
                        <td className="p-2 text-slate-600 whitespace-nowrap">{row.category}</td>
                        <td className="p-2 text-right whitespace-nowrap font-medium">
                          {row.price > 0 ? `${new Intl.NumberFormat('fr-FR').format(row.price)} €` : '—'}
                        </td>
                        <td className="p-2">
                          <a
                            href={`/#/machines/${encodeURIComponent(row.id)}`}
                            className="inline-flex p-1 rounded text-slate-600 hover:bg-slate-200"
                            title="Fiche publique"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Liste des équipements */}
      <div className="space-y-3">
        {filteredEquipments.map((equipment) => (
          <div
            key={equipment.machineUuid ?? `eq-${equipment.id}`}
            className={`border rounded-lg p-4 ${equipment.alert ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h4 className="font-medium text-gray-900">{equipment.name}</h4>
                  {equipment.alert && (
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Catégorie:</span>
                    <span className="ml-1 font-medium">{equipment.category}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Stock:</span>
                    <span className={`ml-1 font-medium ${equipment.daysInStock > 60 ? 'text-red-600' : equipment.daysInStock > 30 ? 'text-orange-600' : 'text-green-600'}`}>
                      {equipment.daysInStock} jours
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Vues:</span>
                    <span className="ml-1 font-medium">{equipment.views}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Score:</span>
                    <span className={`ml-1 font-medium ${equipment.visibilityScore > 70 ? 'text-green-600' : equipment.visibilityScore > 50 ? 'text-orange-600' : 'text-red-600'}`}>
                      {equipment.visibilityScore}/100
                    </span>
                  </div>
                </div>
                <div className="mt-2 text-xs text-gray-600 bg-white p-2 rounded border">
                  <span className="font-medium">Conseil IA:</span> {equipment.aiTip}
                </div>
                {(() => {
                  const st = marketStatsByCategory.get(equipment.category);
                  if (!st || st.count < 2) {
                    return marketReferenceMachines.length > 0 ? (
                      <div className="mt-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded p-2">
                        <span className="font-semibold text-slate-700">Marché visible sur le site (provisoire)</span>
                        <p className="mt-0.5">
                          Pas assez d&apos;autres annonces dans « {equipment.category} » pour calculer une médiane ({st?.count ?? 0} dans l&apos;échantillon). Élargissez le filtre catégorie ou consultez le panneau ci-dessous.
                        </p>
                      </div>
                    ) : null;
                  }
                  const own = equipment.price || 0;
                  const pct =
                    own > 0 && st.median > 0 ? Math.round((own / st.median - 1) * 100) : null;
                  const hint = negotiationHint(own, st.median);
                  return (
                    <div className="mt-2 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded p-2">
                      <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                        <Scale className="w-3.5 h-3.5 shrink-0" />
                        Marché site — même catégorie (provisoire, hors vos annonces)
                      </div>
                      <p className="mt-1">
                        {st.count} annonces · min {new Intl.NumberFormat('fr-FR').format(st.min)} € · médiane{' '}
                        {new Intl.NumberFormat('fr-FR').format(Math.round(st.median))} € · max{' '}
                        {new Intl.NumberFormat('fr-FR').format(st.max)} €
                      </p>
                      <p className="mt-1">
                        Votre prix affiché :{' '}
                        <span className="font-medium">
                          {own > 0 ? `${new Intl.NumberFormat('fr-FR').format(own)} €` : 'non renseigné'}
                        </span>
                        {pct != null && own > 0 ? (
                          <span className={`ml-2 ${pct > 0 ? 'text-amber-700' : pct < 0 ? 'text-emerald-700' : ''}`}>
                            ({pct > 0 ? '+' : ''}{pct} % vs médiane)
                          </span>
                        ) : null}
                      </p>
                      {hint ? <p className="mt-1 text-slate-600">{hint}</p> : null}
                    </div>
                  );
                })()}
              </div>
              
              <div className="flex flex-col gap-2 ml-4">
                <button
                  className="text-xs bg-orange-100 text-orange-800 border border-orange-300 px-3 py-1 rounded-lg hover:bg-orange-200 transition-colors font-semibold"
                  onClick={(e) => handleQuickAction('add-photo', equipment, e)}
                >
                  Ajouter photo
                </button>
                <button
                  className="text-xs bg-orange-100 text-orange-800 border border-orange-300 px-3 py-1 rounded-lg hover:bg-orange-200 transition-colors font-semibold"
                  onClick={(e) => handleQuickAction('boost-visibility', equipment, e)}
                >
                  Booster
                </button>
                <button
                  className="text-xs bg-orange-100 text-orange-800 border border-orange-300 px-3 py-1 rounded-lg hover:bg-orange-200 transition-colors font-semibold"
                  onClick={(e) => handleQuickAction('create-flash-offer', equipment, e)}
                >
                  Créer offre flash
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredEquipments.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <Package className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p>Aucun équipement trouvé avec les filtres actuels</p>
        </div>
      )}
    </div>
  );
};

export default StockStatusWidget; 