import React, { useEffect, useState } from 'react';
import { 
  Shield, Video, FileText, BarChart3, Bell, HeadphonesIcon, 
  TrendingUp, Users, DollarSign, Calendar, Target, Star,
  CheckCircle, AlertTriangle, Clock, Activity, Zap
} from 'lucide-react';
import { 
  getPremiumService, 
  getDashboardStats, 
  getMessages, 
  getOffers, 
  getUserProfile,
  getNotifications,
  getServiceHistory,
  getSellerMachines
} from '../utils/api';
import supabase from '../utils/supabaseClient';

interface PremiumStats {
  totalViews: number;
  totalMessages: number;
  totalOffers: number;
  weeklyViews: number;
  monthlyViews: number;
  weeklyGrowth: number;
  monthlyGrowth: number;
}

interface PremiumService {
  id: string;
  user_id: string;
  service_type: 'basic' | 'premium' | 'enterprise';
  status: 'active' | 'expired' | 'cancelled';
  start_date: string;
  end_date: string;
  features: string[];
  price: number;
  created_at: string;
}

interface UserProfile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  company: string;
  website: string;
  address: string;
  profile_picture?: string;
  created_at: string;
  updated_at: string;
}

const PremiumDashboard: React.FC = () => {
  const [premiumService, setPremiumService] = useState<PremiumService | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<PremiumStats | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [offers, setOffers] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [serviceHistory, setServiceHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Charger toutes les données réelles de l'utilisateur
  const loadUserData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('🔄 Chargement des données Premium utilisateur...');
      
      // Récupérer toutes les données en parallèle
      const [
        premiumData,
        profileData,
        statsData,
        messagesData,
        offersData,
        notificationsData,
        machinesData,
        historyData
      ] = await Promise.all([
        getPremiumService(),
        getUserProfile(),
        getDashboardStats(),
        getMessages(),
        getOffers(),
        getNotifications(),
        getSellerMachines(),
        getServiceHistory()
      ]);

      console.log('✅ Données Premium chargées:', {
        premium: premiumData,
        profile: profileData,
        stats: statsData,
        messages: messagesData?.length,
        offers: offersData?.length,
        notifications: notificationsData?.length,
        machines: machinesData?.length,
        history: historyData?.length
      });

      setPremiumService(premiumData);
      setUserProfile(profileData);
      setStats(statsData);
      setMessages(messagesData || []);
      setOffers(offersData || []);
      setNotifications(notificationsData || []);
      setMachines(machinesData || []);
      setServiceHistory(historyData || []);

    } catch (err: any) {
      console.error('❌ Erreur lors du chargement des données Premium:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUserData();
  }, []);

  // Calculer les métriques Premium
  const calculatePremiumMetrics = () => {
    if (!stats || !machines || !messages || !offers) return null;

    const totalMachines = machines.length;
    const activeMachines = machines.filter(m => m.status === 'active').length;
    const unreadMessages = messages.filter(m => !m.is_read).length;
    const pendingOffers = offers.filter(o => o.status === 'pending').length;
    const conversionRate = stats.totalViews > 0 ? (stats.totalMessages / stats.totalViews * 100) : 0;

    return {
      totalMachines,
      activeMachines,
      unreadMessages,
      pendingOffers,
      conversionRate: Number(conversionRate.toFixed(1)),
      weeklyGrowth: stats.weeklyGrowth,
      monthlyGrowth: stats.monthlyGrowth
    };
  };

  const metrics = calculatePremiumMetrics();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Chargement de votre tableau de bord Premium...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Erreur de chargement</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button 
            onClick={loadUserData}
            className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700"
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header Premium */}
      <div className="bg-gradient-to-r from-orange-600 to-orange-700 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Tableau de Bord Premium</h1>
              <p className="text-orange-100 mt-2">
                Bienvenue {userProfile?.first_name} {userProfile?.last_name}
              </p>
            </div>
            <div className="text-right">
              <div className="flex items-center space-x-2">
                <Shield className="h-6 w-6" />
                <span className="font-semibold">
                  {premiumService?.service_type === 'enterprise' ? 'Enterprise' : 
                   premiumService?.service_type === 'premium' ? 'Premium' : 'Basic'}
                </span>
              </div>
              <p className="text-sm text-orange-100">
                Actif jusqu'au {premiumService?.end_date ? new Date(premiumService.end_date).toLocaleDateString() : 'N/A'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Métriques principales */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Activity className="h-6 w-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Vues totales</p>
                <p className="text-2xl font-bold text-gray-900">{stats?.totalViews || 0}</p>
              </div>
            </div>
            <div className="mt-4 flex items-center">
              <TrendingUp className="h-4 w-4 text-green-500" />
              <span className="text-sm text-green-600 ml-1">+{stats?.weeklyGrowth || 0}% cette semaine</span>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <Users className="h-6 w-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Messages</p>
                <p className="text-2xl font-bold text-gray-900">{stats?.totalMessages || 0}</p>
              </div>
            </div>
            <div className="mt-4">
              <span className="text-sm text-gray-500">
                {messages.filter(m => !m.is_read).length} non lus
              </span>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-2 bg-purple-100 rounded-lg">
                <DollarSign className="h-6 w-6 text-purple-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Offres reçues</p>
                <p className="text-2xl font-bold text-gray-900">{stats?.totalOffers || 0}</p>
              </div>
            </div>
            <div className="mt-4">
              <span className="text-sm text-gray-500">
                {offers.filter(o => o.status === 'pending').length} en attente
              </span>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Target className="h-6 w-6 text-orange-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Taux de conversion</p>
                <p className="text-2xl font-bold text-gray-900">{metrics?.conversionRate || 0}%</p>
              </div>
            </div>
            <div className="mt-4">
              <span className="text-sm text-gray-500">
                {stats?.totalViews > 0 ? `${stats.totalMessages} messages / ${stats.totalViews} vues` : 'Aucune donnée'}
              </span>
            </div>
          </div>
        </div>

        {/* Contenu principal */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Colonne gauche - Activité récente */}
          <div className="lg:col-span-2 space-y-6">
            {/* Messages récents */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Messages récents</h2>
              </div>
              <div className="p-6">
                {messages.length > 0 ? (
                  <div className="space-y-4">
                    {messages.slice(0, 5).map((message, index) => (
                      <div key={index} className="flex items-start space-x-3">
                        <div className={`w-2 h-2 rounded-full mt-2 ${message.is_read ? 'bg-gray-300' : 'bg-blue-500'}`}></div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">
                            {message.sender_name || 'Prospect'}
                          </p>
                          <p className="text-sm text-gray-600 truncate">
                            {message.content}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            {new Date(message.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-4">Aucun message récent</p>
                )}
              </div>
            </div>

            {/* Offres en cours */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Offres en cours</h2>
              </div>
              <div className="p-6">
                {offers.length > 0 ? (
                  <div className="space-y-4">
                    {offers.slice(0, 5).map((offer, index) => (
                      <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium text-gray-900">
                            {offer.buyer_name || 'Acheteur'}
                          </p>
                          <p className="text-sm text-gray-600">
                            {offer.machine_name || 'Équipement'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-gray-900">
                            {offer.amount?.toLocaleString()} MAD
                          </p>
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            offer.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                            offer.status === 'accepted' ? 'bg-green-100 text-green-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {offer.status === 'pending' ? 'En attente' :
                             offer.status === 'accepted' ? 'Acceptée' : 'Refusée'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-4">Aucune offre en cours</p>
                )}
              </div>
            </div>

            {/* Équipements actifs */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Vos équipements</h2>
              </div>
              <div className="p-6">
                {machines.length > 0 ? (
                  <div className="space-y-4">
                    {machines.slice(0, 5).map((machine, index) => (
                      <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium text-gray-900">{machine.name}</p>
                          <p className="text-sm text-gray-600">{machine.brand} {machine.model}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-gray-900">
                            {machine.price?.toLocaleString()} MAD
                          </p>
                          <span className="text-xs text-gray-500">
                            {machine.status || 'Actif'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-4">Aucun équipement publié</p>
                )}
              </div>
            </div>
          </div>

          {/* Colonne droite - Services et notifications */}
          <div className="space-y-6">
            {/* Statut du service Premium */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Votre service Premium</h2>
              </div>
              <div className="p-6">
                {premiumService ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Type de service</span>
                      <span className="font-medium text-gray-900 capitalize">
                        {premiumService.service_type}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Statut</span>
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        premiumService.status === 'active' ? 'bg-green-100 text-green-800' :
                        premiumService.status === 'expired' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {premiumService.status === 'active' ? 'Actif' :
                         premiumService.status === 'expired' ? 'Expiré' : 'Annulé'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Prix</span>
                      <span className="font-medium text-gray-900">
                        {premiumService.price} MAD/mois
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Expire le</span>
                      <span className="font-medium text-gray-900">
                        {new Date(premiumService.end_date).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <Shield className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-500">Aucun service Premium actif</p>
                    <button className="mt-2 text-orange-600 hover:text-orange-700 text-sm">
                      Souscrire à Premium
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Fonctionnalités Premium */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Fonctionnalités Premium</h2>
              </div>
              <div className="p-6">
                <div className="space-y-3">
                  {premiumService?.features?.map((feature, index) => (
                    <div key={index} className="flex items-center">
                      <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                      <span className="text-sm text-gray-700">{feature}</span>
                    </div>
                  )) || (
                    <div className="space-y-3">
                      <div className="flex items-center">
                        <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                        <span className="text-sm text-gray-700">Annonces prioritaires</span>
                      </div>
                      <div className="flex items-center">
                        <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                        <span className="text-sm text-gray-700">Statistiques avancées</span>
                      </div>
                      <div className="flex items-center">
                        <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                        <span className="text-sm text-gray-700">Support prioritaire</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Notifications récentes */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Notifications</h2>
              </div>
              <div className="p-6">
                {notifications.length > 0 ? (
                  <div className="space-y-3">
                    {notifications.slice(0, 5).map((notification, index) => (
                      <div key={index} className="flex items-start space-x-3">
                        <div className={`w-2 h-2 rounded-full mt-2 ${notification.is_read ? 'bg-gray-300' : 'bg-blue-500'}`}></div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">{notification.title}</p>
                          <p className="text-xs text-gray-600">{notification.content}</p>
                          <p className="text-xs text-gray-400 mt-1">
                            {new Date(notification.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-4">Aucune notification récente</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Actions rapides */}
        <div className="mt-8 bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Actions rapides</h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <button onClick={() => { window.location.hash = '#publication'; }} className="flex items-center justify-center p-4 bg-orange-50 rounded-lg hover:bg-orange-100 transition-colors">
                <FileText className="h-6 w-6 text-orange-600 mr-2" />
                <span className="text-sm font-medium text-orange-900">Nouvelle annonce</span>
              </button>
              <button onClick={() => { window.location.hash = '#pro'; }} className="flex items-center justify-center p-4 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors">
                <BarChart3 className="h-6 w-6 text-blue-600 mr-2" />
                <span className="text-sm font-medium text-blue-900">Voir les statistiques</span>
              </button>
              <button onClick={() => { window.location.hash = '#messages'; }} className="flex items-center justify-center p-4 bg-green-50 rounded-lg hover:bg-green-100 transition-colors">
                <Users className="h-6 w-6 text-green-600 mr-2" />
                <span className="text-sm font-medium text-green-900">Gérer les messages</span>
              </button>
              <button onClick={() => { window.location.hash = '#priority-support'; }} className="flex items-center justify-center p-4 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors">
                <HeadphonesIcon className="h-6 w-6 text-purple-600 mr-2" />
                <span className="text-sm font-medium text-purple-900">Support</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PremiumDashboard; 