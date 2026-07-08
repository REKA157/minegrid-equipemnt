import React, { useState, useEffect } from 'react';
import { 
  Users, 
  UserPlus, 
  UserMinus, 
  Shield, 
  Settings, 
  Eye, 
  Edit, 
  Trash2,
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  Lock,
  Unlock,
  Mail,
  Phone,
  Calendar,
  BarChart3,
  Activity,
  Key,
  Crown,
  AlertTriangle,
  X,
  Send,
  Clock,
  Copy,
  Check,
  Link2
} from 'lucide-react';
import { 
  createUserAccount, 
  inviteUser, 
  getUserInvitations, 
  cancelInvitation,
  type UserInvitation 
} from '../utils/userManagement';
import { setupUserInvitationsTable } from '../utils/setupUserInvitations';
import { getOrgMembers, type OrgMember, type OrgRole } from '../utils/api/organization';
import { toast } from '../utils/toast';
interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: OrgRole;
  status: 'active' | 'inactive' | 'pending';
  lastLogin: string;
  permissions: string[];
  avatar?: string;
}

// Rôle -> permissions (indicatif, pour l'affichage). Les permissions réelles
// sont posées par la RLS côté base ; ici on résume ce que chaque rôle peut faire.
const PERMISSIONS_BY_ROLE: Record<OrgRole, string[]> = {
  owner: ['all'],
  admin: ['all'],
  manager: ['dashboard', 'machines', 'orders', 'analytics'],
  viewer: ['dashboard'],
};

// Convertit un membre d'organisation (get_org_members) vers la forme UI.
function orgMemberToTeamMember(m: OrgMember): TeamMember {
  const fullName = [m.first_name, m.last_name].filter(Boolean).join(' ').trim();
  const name = fullName || m.email || 'Membre';
  const initials =
    (fullName
      ? fullName.split(/\s+/).map((p) => p[0]).slice(0, 2).join('')
      : (m.email ?? 'M').slice(0, 2)
    ).toUpperCase();
  const lastLogin = m.last_sign_in_at
    ? new Date(m.last_sign_in_at).toLocaleString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : 'Jamais connecté';
  return {
    id: m.user_id,
    name,
    email: m.email ?? '',
    role: m.role,
    // Un membre présent dans organization_members a accepté : il est actif.
    // (Les invitations « en attente » vivent dans user_invitations — Phase 4.)
    status: 'active',
    lastLogin,
    permissions: PERMISSIONS_BY_ROLE[m.role] ?? ['dashboard'],
    avatar: initials,
  };
}

const MultiUserManagement: React.FC = () => {
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [hasEnterpriseService, setHasEnterpriseService] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // États pour la gestion des invitations
  const [invitations, setInvitations] = useState<UserInvitation[]>([]);
  const [loadingInvitations, setLoadingInvitations] = useState(false);
  const [inviteFormData, setInviteFormData] = useState({
    name: '',
    email: '',
    role: 'viewer' as 'admin' | 'manager' | 'viewer'
  });
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);

  // Membres réels de la société (chargés depuis get_org_members).
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);

  const roles = [
    { id: 'owner', name: 'Propriétaire', color: 'bg-orange-100 text-orange-800', icon: <Crown className="h-4 w-4" /> },
    { id: 'admin', name: 'Administrateur', color: 'bg-orange-50 text-orange-700', icon: <Shield className="h-4 w-4" /> },
    { id: 'manager', name: 'Gestionnaire', color: 'bg-orange-50 text-orange-600', icon: <Settings className="h-4 w-4" /> },
    { id: 'viewer', name: 'Lecteur', color: 'bg-gray-100 text-gray-800', icon: <Eye className="h-4 w-4" /> }
  ];

  // On n'invite jamais un « propriétaire » : c'est le titulaire de l'abonnement.
  const invitableRoles = roles.filter((r) => r.id !== 'owner');

  const permissions = [
    { id: 'dashboard', name: 'Tableau de bord', description: 'Accès au tableau de bord principal' },
    { id: 'machines', name: 'Gestion des machines', description: 'Créer, modifier et supprimer des machines' },
    { id: 'orders', name: 'Commandes', description: 'Gérer les commandes et devis' },
    { id: 'analytics', name: 'Analytics', description: 'Accès aux rapports et statistiques' },
    { id: 'users', name: 'Gestion utilisateurs', description: 'Gérer les membres de l\'équipe' },
    { id: 'settings', name: 'Paramètres', description: 'Modifier les paramètres de l\'entreprise' },
    { id: 'api', name: 'API', description: 'Accès aux clés API et intégrations' },
    { id: 'support', name: 'Support prioritaire', description: 'Accès au support technique' }
  ];

  // Vérifier si l'utilisateur a le service entreprise
  useEffect(() => {
    const checkEnterpriseService = () => {
      try {
        // Vérifier dans localStorage
        const userServices = localStorage.getItem('userServices');
        const userSubscription = localStorage.getItem('userSubscription');
        const enterpriseDashboardConfigured = localStorage.getItem('enterpriseDashboardConfigured');
        
        // Vérifier si l'utilisateur a le service entreprise ou une configuration dashboard
        const hasEnterprise = userServices?.includes('enterprise') || 
                             userSubscription === 'enterprise' ||
                             localStorage.getItem('enterpriseService') === 'true' ||
                             enterpriseDashboardConfigured === 'true';
        
        setHasEnterpriseService(!!hasEnterprise);
        setIsLoading(false);
        
        // Ne plus rediriger automatiquement - permettre l'accès
        console.log('✅ Accès à la gestion multi-utilisateur autorisé');
      } catch (error) {
        console.error('Erreur lors de la vérification du service:', error);
        setHasEnterpriseService(true); // Autoriser l'accès par défaut
        setIsLoading(false);
      }
    };

    checkEnterpriseService();
  }, []);

  // Charger les VRAIS membres de la société (RPC scopée get_org_members).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setMembersLoading(true);
      try {
        const members = await getOrgMembers();
        if (!cancelled) setTeamMembers(members.map(orgMemberToTeamMember));
      } finally {
        if (!cancelled) setMembersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const getRoleInfo = (roleId: string) => {
    return roles.find(role => role.id === roleId) || roles[3];
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-orange-100 text-orange-800';
      case 'inactive': return 'bg-gray-100 text-gray-800';
      case 'pending': return 'bg-orange-50 text-orange-700';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getInvitationStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'accepted': return 'bg-green-100 text-green-800 border-green-200';
      case 'expired': return 'bg-red-100 text-red-800 border-red-200';
      case 'cancelled': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getInvitationStatusText = (status: string) => {
    switch (status) {
      case 'pending': return 'En attente';
      case 'accepted': return 'Acceptée';
      case 'expired': return 'Expirée';
      case 'cancelled': return 'Annulée';
      default: return 'Inconnu';
    }
  };

  const filteredMembers = teamMembers.filter(member => {
    const matchesSearch = member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         member.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = filterRole === 'all' || member.role === filterRole;
    const matchesStatus = filterStatus === 'all' || member.status === filterStatus;
    return matchesSearch && matchesRole && matchesStatus;
  });

  // Charger les invitations
  const loadInvitations = async () => {
    setLoadingInvitations(true);
    try {
      const invitationsData = await getUserInvitations();
      setInvitations(invitationsData);
    } catch (error) {
      console.error('Erreur chargement invitations:', error);
    } finally {
      setLoadingInvitations(false);
    }
  };

  // Charger les invitations au montage du composant
  useEffect(() => {
    const initializeComponent = async () => {
      try {
        // Configurer la table si nécessaire
        await setupUserInvitationsTable();
        // Charger les invitations
        await loadInvitations();
      } catch (error) {
        console.error('Erreur initialisation:', error);
      }
    };

    initializeComponent();
  }, []);

  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteLoading(true);
    setInviteError('');
    setInviteSuccess(false);
    setInviteLink('');
    setLinkCopied(false);

    try {
      const result = await inviteUser(
        inviteFormData.email,
        inviteFormData.name,
        inviteFormData.role
      );

      if (result.success) {
        setInviteSuccess(true);
        // On affiche le LIEN à partager et on garde le modal ouvert
        // (l'admin doit copier le lien pour l'envoyer au collègue).
        setInviteLink(result.link || '');
        setInviteFormData({ name: '', email: '', role: 'viewer' });
        await loadInvitations(); // Recharger les invitations
      } else {
        setInviteError(result.error || 'Erreur lors de l\'invitation');
      }
    } catch (error) {
      setInviteError('Erreur inattendue lors de l\'invitation');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleCopyInviteLink = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // Presse-papiers indisponible : l'utilisateur peut copier manuellement.
      setLinkCopied(false);
    }
  };

  const closeInviteModal = () => {
    setShowInviteModal(false);
    setInviteSuccess(false);
    setInviteError('');
    setInviteLink('');
    setLinkCopied(false);
  };

  const handleCancelInvitation = async (invitationId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir annuler cette invitation ?')) return;

    try {
      const success = await cancelInvitation(invitationId);
      if (success) {
        await loadInvitations(); // Recharger la liste
      }
    } catch (error) {
      console.error('Erreur lors de l\'annulation:', error);
    }
  };

  const handleUpdateMember = (memberId: string, updates: Partial<TeamMember>) => {
    setTeamMembers(teamMembers.map(member => 
      member.id === memberId ? { ...member, ...updates } : member
    ));
    setShowEditModal(false);
    setSelectedMember(null);
  };

  const handleDeleteMember = (memberId: string) => {
    if (confirm('Êtes-vous sûr de vouloir supprimer cet utilisateur ?')) {
      setTeamMembers(teamMembers.filter(member => member.id !== memberId));
    }
  };



  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <a 
                href="#dashboard-entreprise-display"
                className="text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="h-5 w-5" />
              </a>
              <div className="h-6 w-px bg-gray-300"></div>
              <h1 className="text-2xl font-bold text-gray-900">
                Gestion Multi-Utilisateurs
              </h1>
            </div>
            <div className="flex items-center space-x-2">
              <Users className="h-5 w-5 text-orange-600" />
              <span className="text-sm text-gray-600">Service Entreprise</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bannière informative pour les utilisateurs sans service entreprise */}
      {!hasEnterpriseService && (
        <div className="bg-gradient-to-r from-orange-50 to-orange-100 border-l-4 border-orange-400 p-4 mb-6">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center">
              <AlertTriangle className="h-5 w-5 text-orange-600 mr-3" />
              <div className="flex-1">
                <h3 className="text-sm font-medium text-orange-800">
                  Mode Démonstration
                </h3>
                <p className="text-sm text-orange-700 mt-1">
                  Vous utilisez actuellement la version de démonstration de la gestion multi-utilisateurs. 
                  Pour activer toutes les fonctionnalités, passez au Service Entreprise.
                </p>
              </div>
              <a
                href="#dashboard/services"
                className="ml-4 bg-orange-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-orange-700 transition-colors"
              >
                Voir les services
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Contenu principal */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Statistiques */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center">
              <Users className="h-8 w-8 text-orange-600 mr-3" />
              <div>
                <p className="text-sm text-gray-600">Total membres</p>
                <p className="text-2xl font-bold text-gray-900">{teamMembers.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center">
              <CheckCircle className="h-8 w-8 text-orange-600 mr-3" />
              <div>
                <p className="text-sm text-gray-600">Actifs</p>
                <p className="text-2xl font-bold text-gray-900">
                  {teamMembers.filter(m => m.status === 'active').length}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center">
              <AlertCircle className="h-8 w-8 text-orange-500 mr-3" />
              <div>
                <p className="text-sm text-gray-600">En attente</p>
                <p className="text-2xl font-bold text-gray-900">
                  {teamMembers.filter(m => m.status === 'pending').length}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center">
              <Activity className="h-8 w-8 text-orange-600 mr-3" />
              <div>
                <p className="text-sm text-gray-600">Connectés aujourd'hui</p>
                <p className="text-2xl font-bold text-gray-900">3</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Liste des membres */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-lg shadow-md">
              {/* Header avec filtres */}
              <div className="p-6 border-b border-gray-200">
                                 <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
                   <h2 className="text-lg font-semibold text-gray-900">Membres de l'équipe</h2>
                   <div className="flex space-x-3">
                     <button
                       onClick={() => setShowInviteModal(true)}
                       className="inline-flex items-center px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                     >
                       <UserPlus className="h-4 w-4 mr-2" />
                       Inviter un membre
                     </button>
                     <button
                       onClick={async () => {
                         const result = await createUserAccount({
                           email: 'test-direct@example.com',
                           name: 'Test Direct',
                           role: 'viewer'
                         });
                         if (result.success) {
                           toast('✅ Utilisateur créé avec succès !');
                         } else {
                           toast(`❌ Erreur: ${result.error}`);
                         }
                       }}
                       className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                     >
                       <UserPlus className="h-4 w-4 mr-2" />
                       Test Création Directe
                     </button>
                   </div>
                 </div>
                
                {/* Filtres */}
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <input
                    type="text"
                    placeholder="Rechercher un membre..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                  <select
                    value={filterRole}
                    onChange={(e) => setFilterRole(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  >
                    <option value="all">Tous les rôles</option>
                    {roles.map(role => (
                      <option key={role.id} value={role.id}>{role.name}</option>
                    ))}
                  </select>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  >
                    <option value="all">Tous les statuts</option>
                    <option value="active">Actif</option>
                    <option value="inactive">Inactif</option>
                    <option value="pending">En attente</option>
                  </select>
                </div>
              </div>

              {/* Liste des membres */}
              <div className="divide-y divide-gray-200">
                {membersLoading && (
                  <div className="p-6 text-center text-sm text-gray-500">
                    Chargement des membres de votre société…
                  </div>
                )}
                {!membersLoading && filteredMembers.length === 0 && (
                  <div className="p-8 text-center">
                    <Users className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">
                      {teamMembers.length === 0
                        ? 'Vous êtes seul(e) dans votre société pour le moment. Invitez un collaborateur pour partager le pipeline.'
                        : 'Aucun membre ne correspond à ces filtres.'}
                    </p>
                  </div>
                )}
                {filteredMembers.map((member) => (
                  <div key={member.id} className="p-6 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="w-10 h-10 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center font-semibold">
                          {member.avatar}
                        </div>
                        <div>
                          <h3 className="text-lg font-medium text-gray-900">{member.name}</h3>
                          <p className="text-sm text-gray-600">{member.email}</p>
                          <div className="flex items-center space-x-2 mt-1">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getRoleInfo(member.role).color}`}>
                              {getRoleInfo(member.role).icon}
                              <span className="ml-1">{getRoleInfo(member.role).name}</span>
                            </span>
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(member.status)}`}>
                              {member.status === 'active' ? 'Actif' : member.status === 'pending' ? 'En attente' : 'Inactif'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => {
                            setSelectedMember(member);
                            setShowEditModal(true);
                          }}
                          className="p-2 text-gray-400 hover:text-orange-600 transition-colors"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteMember(member.id)}
                          className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 text-sm text-gray-600">
                      <span>Dernière connexion : {member.lastLogin}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

                     {/* Sidebar */}
           <div className="space-y-6">
             {/* Invitations envoyées */}
             <div className="bg-white rounded-lg shadow-md p-6">
               <h3 className="font-semibold text-gray-900 mb-4 flex items-center">
                 <Mail className="h-4 w-4 mr-2 text-orange-600" />
                 Invitations envoyées
               </h3>
               
               {loadingInvitations ? (
                 <div className="flex items-center justify-center py-4">
                   <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600"></div>
                   <span className="ml-2 text-sm text-gray-600">Chargement...</span>
                 </div>
               ) : invitations.length === 0 ? (
                 <div className="text-center py-4">
                   <Mail className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                   <p className="text-sm text-gray-500">Aucune invitation envoyée</p>
                 </div>
               ) : (
                 <div className="space-y-3">
                   {invitations.map((invitation) => (
                     <div key={invitation.id} className="border border-gray-200 rounded-lg p-3">
                       <div className="flex items-center justify-between mb-2">
                         <div>
                           <p className="text-sm font-medium text-gray-900">{invitation.name}</p>
                           <p className="text-xs text-gray-600">{invitation.email}</p>
                         </div>
                         <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getInvitationStatusColor(invitation.status)}`}>
                           {getInvitationStatusText(invitation.status)}
                         </span>
                       </div>
                       <div className="flex items-center justify-between">
                         <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getRoleInfo(invitation.role).color}`}>
                           {getRoleInfo(invitation.role).icon}
                           <span className="ml-1">{getRoleInfo(invitation.role).name}</span>
                         </span>
                         {invitation.status === 'pending' && (
                           <button
                             onClick={() => handleCancelInvitation(invitation.id)}
                             className="text-red-600 hover:text-red-800 text-xs"
                           >
                             Annuler
                           </button>
                         )}
                       </div>
                       <div className="mt-2 text-xs text-gray-500 flex items-center">
                         <Clock className="h-3 w-3 mr-1" />
                         Expire le {new Date(invitation.expires_at).toLocaleDateString('fr-FR')}
                       </div>
                     </div>
                   ))}
                 </div>
               )}
             </div>

             {/* Rôles et permissions */}
             <div className="bg-white rounded-lg shadow-md p-6">
               <h3 className="font-semibold text-gray-900 mb-4">Rôles et Permissions</h3>
               <div className="space-y-3">
                 {roles.map(role => (
                   <div key={role.id} className="border border-gray-200 rounded-lg p-3">
                     <div className="flex items-center justify-between mb-2">
                       <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${role.color}`}>
                         {role.icon}
                         <span className="ml-1">{role.name}</span>
                       </span>
                       <span className="text-xs text-gray-500">
                         {teamMembers.filter(m => m.role === role.id).length} membre(s)
                       </span>
                     </div>
                     <p className="text-xs text-gray-600">
                       {role.id === 'owner' && 'Titulaire de l’abonnement — accès complet et facturation'}
                       {role.id === 'admin' && 'Accès complet à toutes les fonctionnalités'}
                       {role.id === 'manager' && 'Gestion des équipes et projets'}
                       {role.id === 'viewer' && 'Consultation uniquement'}
                     </p>
                   </div>
                 ))}
               </div>
             </div>

            {/* Actions rapides */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Actions Rapides</h3>
              <div className="space-y-2">
                <button className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-700 rounded-lg transition-colors">
                  <Mail className="h-4 w-4 inline mr-2" />
                  Envoyer un message à l'équipe
                </button>
                <button className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-700 rounded-lg transition-colors">
                  <BarChart3 className="h-4 w-4 inline mr-2" />
                  Voir les statistiques d'usage
                </button>
                <button className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-700 rounded-lg transition-colors">
                  <Key className="h-4 w-4 inline mr-2" />
                  Gérer les clés API
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal d'invitation */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Inviter un nouveau membre</h3>
              <button
                onClick={closeInviteModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {inviteError && (
              <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded-lg">
                <p className="text-red-700 text-sm">{inviteError}</p>
              </div>
            )}

            {inviteSuccess && (
              <div className="mb-4 p-3 bg-green-50 border border-green-300 rounded-lg">
                <p className="text-green-700 text-sm font-medium flex items-center gap-1">
                  <Check className="h-4 w-4" /> Invitation créée !
                </p>
                {inviteLink ? (
                  <div className="mt-2">
                    <p className="text-xs text-gray-600 mb-1 flex items-center gap-1">
                      <Link2 className="h-3.5 w-3.5" />
                      Copiez ce lien et envoyez-le à votre collègue (WhatsApp, email…) :
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        readOnly
                        value={inviteLink}
                        onFocus={(e) => e.currentTarget.select()}
                        className="flex-1 min-w-0 px-2 py-1.5 text-xs border border-gray-300 rounded bg-white text-gray-700"
                      />
                      <button
                        type="button"
                        onClick={handleCopyInviteLink}
                        className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded bg-orange-600 text-white hover:bg-orange-700 transition-colors"
                      >
                        {linkCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        {linkCopied ? 'Copié' : 'Copier'}
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                      Votre collègue devra se connecter (ou créer un compte) avec cet email, puis ouvrir le lien pour rejoindre l'équipe. Lien valable 14 jours.
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 mt-1">Aucun lien généré.</p>
                )}
              </div>
            )}

            <form onSubmit={handleInviteUser}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom complet</label>
                  <input
                    type="text"
                    value={inviteFormData.name}
                    onChange={(e) => setInviteFormData(prev => ({ ...prev, name: e.target.value }))}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    placeholder="Prénom Nom"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={inviteFormData.email}
                    onChange={(e) => setInviteFormData(prev => ({ ...prev, email: e.target.value }))}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    placeholder="utilisateur@entreprise.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rôle</label>
                  <select
                    value={inviteFormData.role}
                    onChange={(e) => setInviteFormData(prev => ({ ...prev, role: e.target.value as any }))}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  >
                    {invitableRoles.map(role => (
                      <option key={role.id} value={role.id}>{role.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={closeInviteModal}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  disabled={inviteLoading}
                >
                  {inviteSuccess ? 'Fermer' : 'Annuler'}
                </button>
                <button
                  type="submit"
                  disabled={inviteLoading}
                  className="flex items-center px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:bg-gray-300"
                >
                  {inviteLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Invitation...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Inviter
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal d'édition */}
      {showEditModal && selectedMember && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Modifier le membre</h3>
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              handleUpdateMember(selectedMember.id, {
                role: formData.get('role') as any,
                status: formData.get('status') as any
              });
            }}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
                  <input
                    type="text"
                    value={selectedMember.name}
                    disabled
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={selectedMember.email}
                    disabled
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rôle</label>
                  <select
                    name="role"
                    defaultValue={selectedMember.role}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  >
                    {roles.map(role => (
                      <option key={role.id} value={role.id}>{role.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Statut</label>
                  <select
                    name="status"
                    defaultValue={selectedMember.status}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  >
                    <option value="active">Actif</option>
                    <option value="inactive">Inactif</option>
                    <option value="pending">En attente</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                >
                  Sauvegarder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MultiUserManagement; 