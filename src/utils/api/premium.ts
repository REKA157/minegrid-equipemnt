import { PREMIUM_SERVICE_COLUMNS } from '../../constants/apiQueryFields';
import type { PremiumService } from './types';
import supabase from '../supabaseClient';
import { getCurrentUser } from './auth';
import { createNotification } from './notifications';

// -------------------- SERVICES PREMIUM --------------------

export async function getPremiumService(): Promise<PremiumService | null> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Utilisateur non connecté');

  const { data, error } = await supabase
    .from('premium_services')
    .select(PREMIUM_SERVICE_COLUMNS)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single();

  if (error && error.code !== 'PGRST116') throw error;

  // Anti-façade : si aucun service premium réel, on renvoie null (PremiumDashboard
  // gère l'état "aucun abonnement actif"). On ne fabrique JAMAIS un service actif
  // fictif côté client (l'entitlement réel = pro_clients via subscription.ts).
  return data ?? null;
}

export async function requestPremiumService(serviceType: 'premium' | 'enterprise') {
  const user = await getCurrentUser();
  if (!user) throw new Error('Utilisateur non connecté');

  // SÉCURITÉ (anti-contournement paiement, finding #5 / backlog Q1) : on n'active
  // JAMAIS un service côté client. La demande est créée en 'pending' ; le passage
  // en 'active' est fait côté serveur APRÈS paiement (edge function stripe-webhook,
  // source de vérité pro_clients). Aucun appelant UI aujourd'hui.
  const serviceData = {
    user_id: user.id,
    service_type: serviceType,
    status: 'pending' as const,
    start_date: new Date().toISOString(),
    end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 jours
    features: serviceType === 'premium'
      ? ['Annonces prioritaires', 'Statistiques avancées', 'Support prioritaire']
      : ['Tout du Premium', 'API personnalisée', 'Gestionnaire dédié', 'Formation incluse'],
    price: serviceType === 'premium' ? 99 : 299
  };

  const { data, error } = await supabase
    .from('premium_services')
    .insert([serviceData]);

  if (error) throw error;

  // Notification : demande enregistrée (PAS "activé" — l'activation suit le paiement).
  await createNotification({
    type: 'premium',
    title: 'Demande de service premium enregistrée',
    content: `Votre demande de service ${serviceType} a été enregistrée. Elle sera activée après confirmation du paiement.`
  });

  return data;
}

export async function cancelPremiumService() {
  const user = await getCurrentUser();
  if (!user) throw new Error('Utilisateur non connecté');

  const { data, error } = await supabase
    .from('premium_services')
    .update({ 
      status: 'cancelled',
      end_date: new Date().toISOString()
    })
    .eq('user_id', user.id)
    .eq('status', 'active');

  if (error) throw error;

  // Créer une notification
  await createNotification({
    type: 'premium',
    title: 'Service Premium annulé',
    content: 'Votre service premium a été annulé. Il restera actif jusqu\'à la fin de la période payée.'
  });

  return data;
}
