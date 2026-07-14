import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  User, 
  CreditCard, 
  Bell, 
  Shield, 
  Database, 
  Download, 
  Save,
  Edit,
  Check,
  X,
  AlertTriangle,
  Info,
  Lock,
  Globe,
  Mail,
  Phone,
  MapPin,
  Building
} from 'lucide-react';
import { usePermissions } from '../utils/permissions';
import { getProClientProfile, upsertProClientProfile } from '../utils/proApi';
import supabase from '../utils/supabaseClient';
import { toast } from '../utils/toast';

interface ConfigurationProProps {
  onClose?: () => void;
}

export default function ConfigurationPro({ onClose }: ConfigurationProProps) {
  const [activeTab, setActiveTab] = useState('profile');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});
  const [notifications, setNotifications] = useState({
    email: true,
    push: true,
    maintenance: true,
    orders: true,
    security: true
  });
  const [security, setSecurity] = useState({
    twoFactor: false,
    sessionTimeout: 30,
    passwordExpiry: 90,
    loginAttempts: 5
  });

  const { permissions } = usePermissions();

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      setLoading(true);
      const profileData = await getProClientProfile();
      setProfile(profileData);
      setFormData({
        company_name: profileData?.company_name || '',
        siret: profileData?.siret || '',
        address: profileData?.address || '',
        phone: profileData?.phone || '',
        contact_person: profileData?.contact_person || '',
        email: profileData?.email || ''
      });
    } catch (error) {
      console.error('Erreur lors du chargement du profil:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    try {
      setSaving(true);
      await upsertProClientProfile(formData);
      await loadProfile();
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleNotificationChange = (key: string, value: boolean) => {
    setNotifications(prev => ({ ...prev, [key]: value }));
  };

  const handleSecurityChange = (key: string, value: any) => {
    setSecurity(prev => ({ ...prev, [key]: value }));
  };

  const tabs = [
    { id: 'profile', label: 'Profil', icon: User },
    { id: 'subscription', label: 'Abonnement', icon: CreditCard },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security', label: 'Sécurité', icon: Shield },
    { id: 'data', label: 'Données', icon: Database }
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Chargement de la configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center">
              <Settings className="h-8 w-8 text-orange-600 mr-3" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Configuration</h1>
                <p className="text-sm text-gray-600">Paramètres de l'espace Pro</p>
              </div>
            </div>
            {onClose && (
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex space-x-8">
          {/* Sidebar */}
          <div className="w-64 flex-shrink-0">
            <nav className="space-y-1">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md ${
                      activeTab === tab.id
                        ? 'bg-orange-100 text-orange-700 border-r-2 border-orange-500'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="h-5 w-5 mr-3" />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Main Content */}
          <div className="flex-1">
            {activeTab === 'profile' && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-6">Informations du profil</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Nom de l'entreprise *
                    </label>
                    <input
                      type="text"
                      value={formData.company_name}
                      onChange={(e) => handleInputChange('company_name', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      placeholder="Nom de votre entreprise"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      SIRET
                    </label>
                    <input
                      type="text"
                      value={formData.siret}
                      onChange={(e) => handleInputChange('siret', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      placeholder="Numéro SIRET"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Personne de contact
                    </label>
                    <input
                      type="text"
                      value={formData.contact_person}
                      onChange={(e) => handleInputChange('contact_person', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      placeholder="Nom du contact principal"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Téléphone
                    </label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => handleInputChange('phone', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      placeholder="Numéro de téléphone"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Adresse
                    </label>
                    <textarea
                      value={formData.address}
                      onChange={(e) => handleInputChange('address', e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      placeholder="Adresse complète"
                    />
                  </div>
                </div>

                <div className="flex justify-end mt-6">
                  <button
                    onClick={handleSaveProfile}
                    disabled={saving}
                    className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 flex items-center"
                  >
                    {saving ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Sauvegarde...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Sauvegarder
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'subscription' && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-6">Abonnement</h2>
                
                {profile && (
                  <div className="space-y-6">
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                      <div className="flex items-center">
                        <CreditCard className="h-6 w-6 text-orange-600 mr-3" />
                        <div>
                          <h3 className="font-medium text-orange-900">
                            Abonnement {profile.subscription_type?.toUpperCase()}
                          </h3>
                          <p className="text-sm text-orange-700">
                            Statut : {profile.subscription_status === 'active' ? 'Actif' : 'Inactif'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h4 className="font-medium text-gray-900 mb-3">Détails de l'abonnement</h4>
                        <dl className="space-y-2">
                          <div className="flex justify-between">
                            <dt className="text-sm text-gray-600">Type :</dt>
                            <dd className="text-sm font-medium">{profile.subscription_type}</dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-sm text-gray-600">Utilisateurs max :</dt>
                            <dd className="text-sm font-medium">{profile.max_users}</dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-sm text-gray-600">Début :</dt>
                            <dd className="text-sm font-medium">
                              {new Date(profile.subscription_start).toLocaleDateString()}
                            </dd>
                          </div>
                          {profile.subscription_end && (
                            <div className="flex justify-between">
                              <dt className="text-sm text-gray-600">Fin :</dt>
                              <dd className="text-sm font-medium">
                                {new Date(profile.subscription_end).toLocaleDateString()}
                              </dd>
                            </div>
                          )}
                        </dl>
                      </div>

                      <div>
                        <h4 className="font-medium text-gray-900 mb-3">Actions</h4>
                        <div className="space-y-3">
                          <button className="w-full px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors">
                            Modifier l'abonnement
                          </button>
                          <button className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
                            Télécharger la facture
                          </button>
                          <button className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
                            Historique des paiements
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'notifications' && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-6">Préférences de notifications</h2>
                
                <div className="space-y-6">
                  <div>
                    <h3 className="font-medium text-gray-900 mb-4">Canal de notification</h3>
                    <div className="space-y-3">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={notifications.email}
                          onChange={(e) => handleNotificationChange('email', e.target.checked)}
                          className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
                        />
                        <span className="ml-3 text-sm text-gray-700">Notifications par email</span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={notifications.push}
                          onChange={(e) => handleNotificationChange('push', e.target.checked)}
                          className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
                        />
                        <span className="ml-3 text-sm text-gray-700">Notifications push</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-medium text-gray-900 mb-4">Types de notifications</h3>
                    <div className="space-y-3">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={notifications.maintenance}
                          onChange={(e) => handleNotificationChange('maintenance', e.target.checked)}
                          className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
                        />
                        <span className="ml-3 text-sm text-gray-700">Maintenance et interventions</span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={notifications.orders}
                          onChange={(e) => handleNotificationChange('orders', e.target.checked)}
                          className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
                        />
                        <span className="ml-3 text-sm text-gray-700">Commandes et offres</span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={notifications.security}
                          onChange={(e) => handleNotificationChange('security', e.target.checked)}
                          className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
                        />
                        <span className="ml-3 text-sm text-gray-700">Alertes de sécurité</span>
                      </label>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors">
                      Sauvegarder les préférences
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'security' && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-6">Paramètres de sécurité</h2>
                
                <div className="space-y-6">
                  <div>
                    <h3 className="font-medium text-gray-900 mb-4">Authentification</h3>
                    <div className="space-y-3">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={security.twoFactor}
                          onChange={(e) => handleSecurityChange('twoFactor', e.target.checked)}
                          className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
                        />
                        <span className="ml-3 text-sm text-gray-700">Authentification à deux facteurs</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-medium text-gray-900 mb-4">Sessions</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Timeout de session (minutes)
                        </label>
                        <select
                          value={security.sessionTimeout}
                          onChange={(e) => handleSecurityChange('sessionTimeout', parseInt(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                        >
                          <option value={15}>15 minutes</option>
                          <option value={30}>30 minutes</option>
                          <option value={60}>1 heure</option>
                          <option value={120}>2 heures</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Expiration du mot de passe (jours)
                        </label>
                        <select
                          value={security.passwordExpiry}
                          onChange={(e) => handleSecurityChange('passwordExpiry', parseInt(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                        >
                          <option value={30}>30 jours</option>
                          <option value={60}>60 jours</option>
                          <option value={90}>90 jours</option>
                          <option value={180}>180 jours</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Tentatives de connexion max
                        </label>
                        <select
                          value={security.loginAttempts}
                          onChange={(e) => handleSecurityChange('loginAttempts', parseInt(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                        >
                          <option value={3}>3 tentatives</option>
                          <option value={5}>5 tentatives</option>
                          <option value={10}>10 tentatives</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors">
                      Sauvegarder les paramètres
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'data' && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-6">Gestion des données</h2>
                
                <div className="space-y-6">
                  <div>
                    <h3 className="font-medium text-gray-900 mb-4">Export de données</h3>
                    <div className="space-y-3">
                      <button className="w-full px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center justify-center">
                        <Download className="h-4 w-4 mr-2" />
                        Exporter toutes les données
                      </button>
                      <button className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
                        Exporter les équipements
                      </button>
                      <button className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
                        Exporter les commandes
                      </button>
                      <button className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
                        Exporter la maintenance
                      </button>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-medium text-gray-900 mb-4">Suppression de données</h3>
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <div className="flex items-center">
                        <AlertTriangle className="h-5 w-5 text-red-600 mr-3" />
                        <div>
                          <h4 className="font-medium text-red-900">Zone dangereuse</h4>
                          <p className="text-sm text-red-700 mt-1">
                            Ces actions sont irréversibles. Assurez-vous d'avoir sauvegardé vos données.
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 space-y-2">
                        <button
                          onClick={async () => {
                            if (!window.confirm('Supprimer DÉFINITIVEMENT votre compte et toutes vos données ? Cette action est irréversible.')) return;
                            if (!window.confirm('Dernière confirmation : la suppression ne peut pas être annulée. Continuer ?')) return;
                            const { data, error } = await supabase.functions.invoke('delete-account');
                            if (error || (data && data.ok === false)) {
                              toast('La suppression du compte a échoué. Réessayez ou contactez le support.');
                              return;
                            }
                            await supabase.auth.signOut();
                            window.location.href = '/';
                          }}
                          className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                        >
                          Supprimer le compte
                        </button>
                        <button
                          onClick={async () => {
                            if (!window.confirm('Effacer TOUTES vos données (annonces, devis, documents, planning…) en gardant votre compte ? Irréversible.')) return;
                            const { data, error } = await supabase.rpc('delete_my_account');
                            if (error || (data && data.ok === false)) {
                              toast('La suppression des données a échoué.');
                              return;
                            }
                            toast('Vos données ont été supprimées.');
                            window.location.reload();
                          }}
                          className="w-full px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 transition-colors"
                        >
                          Supprimer toutes les données
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 