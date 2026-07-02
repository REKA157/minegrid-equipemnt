import { usePermissions } from '../../../utils/permissions';
import {
  AlertTriangle,
  Plus,
  User,
  X,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import {
  UserInvitation,
  cancelUserInvitation,
  getUserInvitations,
  inviteClientUser,
} from '../../../utils/proApi';

export function UsersTab() {
  // Vérifier les permissions
  const { permissions } = usePermissions();

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteFormData, setInviteFormData] = useState({ email: '', role: '' });
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [invitations, setInvitations] = useState<UserInvitation[]>([]);
  const [loadingInvitations, setLoadingInvitations] = useState(true);

  // Charger les invitations au montage du composant (uniquement pour les admins)
  useEffect(() => {
    if (permissions?.isAdmin) {
      loadInvitations();
    }
  }, [permissions?.isAdmin]);

  // Si l'utilisateur n'est pas admin, afficher un message d'accès refusé
  if (!permissions?.isAdmin) {
    return (
      <div className="space-y-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-center">
            <AlertTriangle className="h-6 w-6 text-red-600 mr-3" />
            <div>
              <h3 className="text-lg font-medium text-red-900">Accès refusé</h3>
              <p className="text-red-700 mt-1">
                Vous n'avez pas les permissions nécessaires pour accéder à cette section.
                Seuls les administrateurs peuvent gérer les utilisateurs.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const loadInvitations = async () => {
    try {
      setLoadingInvitations(true);
      const invitationsData = await getUserInvitations();
      setInvitations(invitationsData);
    } catch (error) {
      console.error('Erreur lors du chargement des invitations:', error);
    } finally {
      setLoadingInvitations(false);
    }
  };

  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteLoading(true);
    setInviteError('');

    try {
      const success = await inviteClientUser(inviteFormData.email, inviteFormData.role);
      if (success) {
        setInviteSuccess(true);
        setInviteFormData({ email: '', role: '' });
        // Recharger les invitations après une nouvelle invitation
        await loadInvitations();
        setTimeout(() => {
          setShowInviteModal(false);
          setInviteSuccess(false);
        }, 2000);
      } else {
        setInviteError('Erreur lors de l\'invitation. Veuillez réessayer.');
      }
    } catch (error) {
      setInviteError('Erreur lors de l\'invitation. Veuillez réessayer.');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleCancelInvitation = async (invitationId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir annuler cette invitation ?')) return;

    try {
      const success = await cancelUserInvitation(invitationId);
      if (success) {
        await loadInvitations(); // Recharger la liste
      }
    } catch (error) {
      console.error('Erreur lors de l\'annulation:', error);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setInviteFormData(prev => ({ ...prev, [field]: value }));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'accepted': return 'bg-green-100 text-green-800 border-green-200';
      case 'expired': return 'bg-red-100 text-red-800 border-red-200';
      case 'cancelled': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return 'En attente';
      case 'accepted': return 'Acceptée';
      case 'expired': return 'Expirée';
      case 'cancelled': return 'Annulée';
      default: return status;
    }
  };

  const getRoleText = (role: string) => {
    switch (role) {
      case 'admin': return 'Administrateur';
      case 'manager': return 'Manager';
      case 'technician': return 'Technicien';
      case 'viewer': return 'Lecteur';
      default: return role;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-900">Utilisateurs</h2>
        <button 
          onClick={() => setShowInviteModal(true)}
          className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition-colors flex items-center"
        >
          <Plus className="h-4 w-4 mr-2" />
          Inviter un utilisateur
        </button>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <div className="mb-6">
          <h3 className="text-lg font-medium text-gray-900 mb-2">Gestion des utilisateurs</h3>
          <p className="text-gray-600">Invitez des utilisateurs à accéder à l'espace Pro avec différents niveaux de permissions.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <div className="flex items-center mb-2">
              <User className="h-5 w-5 text-orange-600 mr-2" />
              <h4 className="font-medium text-orange-900">Administrateur</h4>
            </div>
            <p className="text-sm text-orange-700 mb-2">Accès complet à toutes les fonctionnalités</p>
            <ul className="text-xs text-orange-600 space-y-1">
              <li>• Gestion complète des utilisateurs</li>
              <li>• Accès à tous les modules</li>
              <li>• Configuration du compte</li>
              <li>• Rapports et analytics</li>
            </ul>
          </div>

          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <div className="flex items-center mb-2">
              <User className="h-5 w-5 text-orange-600 mr-2" />
              <h4 className="font-medium text-orange-900">Manager</h4>
            </div>
            <p className="text-sm text-orange-700 mb-2">Gestion opérationnelle</p>
            <ul className="text-xs text-orange-600 space-y-1">
              <li>• Gestion des équipements</li>
              <li>• Suivi des commandes</li>
              <li>• Planification maintenance</li>
              <li>• Gestion des documents</li>
            </ul>
          </div>

          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <div className="flex items-center mb-2">
              <User className="h-5 w-5 text-orange-600 mr-2" />
              <h4 className="font-medium text-orange-900">Technicien</h4>
            </div>
            <p className="text-sm text-orange-700 mb-2">Interventions techniques</p>
            <ul className="text-xs text-orange-600 space-y-1">
              <li>• Interventions de maintenance</li>
              <li>• Diagnostic équipements</li>
              <li>• Rapports techniques</li>
              <li>• Consultation documents</li>
            </ul>
          </div>

          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <div className="flex items-center mb-2">
              <User className="h-5 w-5 text-orange-600 mr-2" />
              <h4 className="font-medium text-orange-900">Lecteur</h4>
            </div>
            <p className="text-sm text-orange-700 mb-2">Consultation uniquement</p>
            <ul className="text-xs text-orange-600 space-y-1">
              <li>• Consultation équipements</li>
              <li>• Lecture des documents</li>
              <li>• Suivi des commandes</li>
              <li>• Pas de modifications</li>
            </ul>
          </div>
        </div>

        {/* Liste des invitations */}
        <div className="mt-8">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Invitations envoyées</h3>
          
          {loadingInvitations ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
              <span className="ml-2 text-gray-600">Chargement des invitations...</span>
            </div>
          ) : invitations.length === 0 ? (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
              <User className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600">Aucune invitation envoyée</p>
              <p className="text-sm text-gray-500 mt-1">Les invitations que vous envoyez apparaîtront ici</p>
            </div>
          ) : (
            <div className="space-y-3">
              {invitations.map((invitation) => (
                <div key={invitation.id} className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{invitation.email}</p>
                          <p className="text-sm text-gray-600">
                            Rôle: {getRoleText(invitation.role)} • 
                            Invitée le {new Date(invitation.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(invitation.status)}`}>
                            {getStatusText(invitation.status)}
                          </span>
                          {invitation.status === 'pending' && (
                            <button
                              onClick={() => handleCancelInvitation(invitation.id)}
                              className="text-red-600 hover:text-red-800 text-sm font-medium"
                            >
                              Annuler
                            </button>
                          )}
                        </div>
                      </div>
                      {invitation.status === 'pending' && (
                        <p className="text-xs text-gray-500 mt-1">
                          Expire le {new Date(invitation.expires_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal d'invitation */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-semibold text-gray-900">Inviter un utilisateur</h2>
              <button
                onClick={() => setShowInviteModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleInviteUser} className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={inviteFormData.email}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    placeholder="utilisateur@entreprise.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rôle *
                  </label>
                  <select
                    required
                    value={inviteFormData.role}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    onChange={(e) => handleInputChange('role', e.target.value)}
                  >
                    <option value="">Sélectionner un rôle</option>
                    <option value="admin">Administrateur</option>
                    <option value="manager">Manager</option>
                    <option value="technician">Technicien</option>
                    <option value="viewer">Lecteur</option>
                  </select>
                </div>

                {inviteError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-sm text-red-600">{inviteError}</p>
                  </div>
                )}

                {inviteSuccess && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <p className="text-sm text-green-600">Utilisateur invité avec succès !</p>
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={inviteLoading}
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 flex items-center"
                >
                  {inviteLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Invitation...
                    </>
                  ) : (
                    'Inviter'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
