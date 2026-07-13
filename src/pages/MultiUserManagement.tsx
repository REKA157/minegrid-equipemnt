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
  inviteUser,
  getUserInvitations,
  cancelInvitation,
  type UserInvitation,
} from '../utils/userManagement';
import { setupUserInvitationsTable } from '../utils/setupUserInvitations';
import { getOrgMembers, type OrgMember, type OrgRole } from '../utils/api/organization';
import { useSubscription } from '../hooks/useSubscription';
import { hasEnterprise } from '../utils/api/subscription';
import { toast } from '../utils/toast';
import { useTendersStore } from '../tenders/store/tendersStore';
import { ROLE_LABELS as TENDER_ROLE_LABELS, defaultTenderRole, type UserRole as TenderRole } from '../tenders/types';
import {
  addPendingTenderRole, getPendingTenderRole, removePendingTenderRole,
  addPendingMemberScope, getPendingMemberScope, removePendingMemberScope,
} from '../utils/pendingTenderRoles';
import { setMemberScope, type MemberScope } from '../utils/api/memberScope';
import { getMemberSessions, getOrgSessionStats, type MemberSession } from '../utils/api/sessions';
import supabaseClient from '../utils/supabaseClient';
import InfoTooltip, { type WidgetExplanation } from '../components/common/InfoTooltip';

/** Rôles du module Appels d'offres proposés à l'affectation (ordre d'affichage). */
const TENDER_ROLES: TenderRole[] = ['admin', 'redacteur', 'validateur', 'lecteur'];

/** Aide « i » de la section « Membres de l'équipe » (survol = rôle + 1re action ; clic = mode d'emploi). */
const TEAM_HELP: WidgetExplanation = {
  summary:
    "La liste des personnes de votre société qui partagent votre espace (pipeline commercial et/ou module Appels d'offres). Ce sont de vrais comptes : la liste se remplit à mesure que vos invitations sont acceptées.",
  howItWorks: [
    "Chaque membre porte deux rôles complémentaires : le rôle « société » (Propriétaire, Administrateur, Gestionnaire, Lecteur) qui pilote ses droits d'accès, et le badge « AO : … » qui indique son rôle dans le module Appels d'offres.",
    "Le badge de statut (Actif / En attente / Inactif) montre où en est la personne.",
    "Le propriétaire est le titulaire de l'abonnement ; toute l'équipe en profite. Les compteurs du haut résument l'équipe (total, actifs, en attente, connectés aujourd'hui).",
  ],
  whatToDo: [
    "Pour ajouter un collègue, cliquez « Inviter un membre », choisissez son affectation (Commercial et/ou Appels d'offres) et ses rôles, puis partagez-lui le lien généré.",
    "Pour changer les rôles d'un membre (société et Appels d'offres), cliquez l'icône crayon ✏️ sur sa ligne.",
    "Le lien « Rôles Appels d'offres (vue détaillée) » (colonne de droite) ouvre la page dédiée avec la description de chaque rôle AO.",
    "Utilisez la recherche et le filtre par rôle pour retrouver vite une personne quand l'équipe s'agrandit.",
  ],
};
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

/** Format court « 09/07/2026 14:32 ». */
function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/** Durée lisible entre connexion et déconnexion (session fermée uniquement). */
function fmtDuration(login: string, logout: string): string {
  const ms = new Date(logout).getTime() - new Date(login).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "moins d'une minute";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Appareil/navigateur résumé depuis le user-agent (best-effort, lisible). */
function shortDevice(ua: string | null): string {
  if (!ua) return 'Appareil inconnu';
  let os = '';
  if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'Mac';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iOS/i.test(ua)) os = 'iOS';
  else if (/Linux/i.test(ua)) os = 'Linux';
  let br = '';
  if (/Edg\//i.test(ua)) br = 'Edge';
  else if (/OPR\/|Opera/i.test(ua)) br = 'Opera';
  else if (/Chrome\//i.test(ua)) br = 'Chrome';
  else if (/Firefox\//i.test(ua)) br = 'Firefox';
  else if (/Safari\//i.test(ua)) br = 'Safari';
  const label = [br, os].filter(Boolean).join(' · ');
  return label || 'Appareil inconnu';
}

const MultiUserManagement: React.FC = () => {
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  // Bandeau « démonstration » : basé sur l'abonnement SERVEUR (Phase 5). Un
  // propriétaire OU un membre invité d'une société entreprise le voit disparaître.
  const { subscription, isLoading: subLoading } = useSubscription();
  const hasEnterpriseService = hasEnterprise(subscription);
  const [isLoading, setIsLoading] = useState(true);
  
  // États pour la gestion des invitations
  const [invitations, setInvitations] = useState<UserInvitation[]>([]);
  const [loadingInvitations, setLoadingInvitations] = useState(false);
  const [inviteFormData, setInviteFormData] = useState({
    name: '',
    email: '',
    role: 'viewer' as 'admin' | 'manager' | 'viewer'
  });
  // Affectation du nouveau membre : Commercial (dashboard entreprise) et/ou
  // Appels d'offres. Le rôle AO est appliqué automatiquement dès qu'il rejoint.
  const [affectCommercial, setAffectCommercial] = useState(true);
  const [affectAO, setAffectAO] = useState(false);
  const [inviteAoRole, setInviteAoRole] = useState<TenderRole>('redacteur');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);

  // Membres réels de la société (chargés depuis get_org_members).
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);

  // Historique des sessions (connexion/déconnexion) par membre — chargé à la demande.
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);
  const [sessionsByMember, setSessionsByMember] = useState<Record<string, MemberSession[]>>({});
  const [sessionsLoading, setSessionsLoading] = useState<Record<string, boolean>>({});
  // Nombre de membres connectés aujourd'hui (carte statistique) — null tant que non chargé.
  const [connectedToday, setConnectedToday] = useState<number | null>(null);

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

  // (Legacy) l'ancien check localStorage a été remplacé par useSubscription() —
  // l'état enterprise vient désormais du serveur (Phase 5, avec héritage société).
  useEffect(() => {
    const checkEnterpriseService = () => {
      setIsLoading(false);
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
        const mapped = members.map(orgMemberToTeamMember);
        if (!cancelled) setTeamMembers(mapped);

        // Réconciliation des affectations posées à l'invitation (par e-mail),
        // dès que la personne apparaît dans l'équipe (elle a alors un user_id).
        for (const m of mapped) {
          if (!m.email) continue;
          // 1) Rôle Appels d'offres en attente -> vrai rôle AO.
          const pendingRole = getPendingTenderRole(m.email);
          if (pendingRole) {
            useTendersStore.getState().upsertRoleAssignment({
              memberId: m.id, name: m.name, email: m.email, role: pendingRole, fromOrg: true,
            });
            removePendingTenderRole(m.email);
          }
          // 2) Affectation (Commercial / Appels d'offres) en attente -> serveur.
          const pendingScope = getPendingMemberScope(m.email);
          if (pendingScope) {
            const res = await setMemberScope(m.id, pendingScope.commercial, pendingScope.tenders);
            // On ne retire qu'en cas de succès (retry plus tard si l'utilisateur
            // courant n'est pas admin, donc non autorisé à régler).
            if (res.success) removePendingMemberScope(m.email);
          }
        }

        // Charger les affectations de l'org (pour l'édition + l'affichage).
        try {
          const { data } = await supabaseClient
            .from('organization_member_scopes')
            .select('user_id, commercial, tenders');
          if (!cancelled && data) {
            const map: Record<string, MemberScope> = {};
            for (const row of data as Array<{ user_id: string; commercial: boolean; tenders: boolean }>) {
              map[row.user_id] = { commercial: row.commercial, tenders: row.tenders };
            }
            setMemberScopes(map);
          }
        } catch {
          /* RLS/table absente : on garde le défaut (accès à tout) */
        }
      } finally {
        if (!cancelled) setMembersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Statistique « connectés aujourd'hui » (serveur, réservé aux admins/owner).
  useEffect(() => {
    let cancelled = false;
    getOrgSessionStats().then((n) => {
      if (!cancelled) setConnectedToday(n);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Déplie/replie l'historique des sessions d'un membre (chargé à la première ouverture).
  const toggleMemberHistory = async (memberId: string) => {
    if (expandedMemberId === memberId) {
      setExpandedMemberId(null);
      return;
    }
    setExpandedMemberId(memberId);
    if (!sessionsByMember[memberId]) {
      setSessionsLoading((s) => ({ ...s, [memberId]: true }));
      try {
        const rows = await getMemberSessions(memberId, 50);
        setSessionsByMember((s) => ({ ...s, [memberId]: rows }));
      } finally {
        setSessionsLoading((s) => ({ ...s, [memberId]: false }));
      }
    }
  };

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
    if (!affectCommercial && !affectAO) {
      setInviteError('Choisissez au moins une affectation : Commercial et/ou Appels d’offres.');
      return;
    }
    setInviteLoading(true);
    setInviteError('');
    setInviteSuccess(false);
    setInviteLink('');
    setLinkCopied(false);

    try {
      // Rôle société : celui choisi si affecté au Commercial ; sinon « viewer »
      // (accès minimal — il faut être membre de la société pour utiliser le module AO).
      const orgRole = affectCommercial ? inviteFormData.role : 'viewer';
      const emailInvited = inviteFormData.email;
      const result = await inviteUser(emailInvited, inviteFormData.name, orgRole);

      if (result.success) {
        // Affectations mémorisées par e-mail, appliquées dès que la personne rejoint.
        addPendingMemberScope(emailInvited, affectCommercial, affectAO); // accès aux espaces
        if (affectAO) addPendingTenderRole(emailInvited, inviteAoRole);   // rôle dans le module AO
        setInviteSuccess(true);
        // On affiche le LIEN à partager et on garde le modal ouvert
        // (l'admin doit copier le lien pour l'envoyer au collègue).
        setInviteLink(result.link || '');
        setInviteFormData({ name: '', email: '', role: 'viewer' });
        setAffectCommercial(true);
        setAffectAO(false);
        setInviteAoRole('redacteur');
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

  // Rôles du module Appels d'offres (stockés dans le store tenders, partagés à
  // l'équipe en mode partagé). Réglés ICI, au même endroit que la gestion d'équipe.
  const tenderRoleAssignments = useTendersStore((s) => s.roleAssignments);
  const upsertTenderRole = useTendersStore((s) => s.upsertRoleAssignment);
  const aoRoleOf = (m: TeamMember): TenderRole =>
    tenderRoleAssignments.find((a) => a.memberId === m.id)?.role ?? defaultTenderRole(m.role);

  // Affectation (Commercial / Appels d'offres) par membre, chargée du serveur.
  // Défaut : accès aux deux (aucun blocage tant que rien n'est restreint).
  const [memberScopes, setMemberScopes] = useState<Record<string, MemberScope>>({});
  const scopeOf = (m: TeamMember): MemberScope =>
    memberScopes[m.id] ?? { commercial: true, tenders: true };

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

      {/* Bannière informative pour les utilisateurs sans service entreprise.
          Ne s'affiche qu'une fois l'abonnement CHARGÉ et confirmé insuffisant,
          pour éviter un flash « démonstration » au montage. */}
      {!subLoading && !hasEnterpriseService && (
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
                <p className="text-2xl font-bold text-gray-900">
                  {connectedToday ?? '—'}
                </p>
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
                   <div className="flex items-center gap-2">
                     <h2 className="text-lg font-semibold text-gray-900">Membres de l'équipe</h2>
                     <InfoTooltip
                       text="Les personnes de votre société qui partagent votre espace (Commercial et/ou Appels d'offres)."
                       title="Membres de l'équipe"
                       details={TEAM_HELP}
                     />
                   </div>
                   <div className="flex space-x-3">
                     <button
                       onClick={() => setShowInviteModal(true)}
                       className="inline-flex items-center px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                     >
                       <UserPlus className="h-4 w-4 mr-2" />
                       Inviter un membre
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
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getRoleInfo(member.role).color}`}>
                              {getRoleInfo(member.role).icon}
                              <span className="ml-1">{getRoleInfo(member.role).name}</span>
                            </span>
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(member.status)}`}>
                              {member.status === 'active' ? 'Actif' : member.status === 'pending' ? 'En attente' : 'Inactif'}
                            </span>
                            <span
                              className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-violet-50 text-violet-700"
                              title="Rôle dans le module Appels d’offres"
                            >
                              AO : {TENDER_ROLE_LABELS[aoRoleOf(member)]}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => toggleMemberHistory(member.id)}
                          className={`p-2 transition-colors ${
                            expandedMemberId === member.id
                              ? 'text-orange-600'
                              : 'text-gray-400 hover:text-orange-600'
                          }`}
                          title="Voir l'historique des connexions"
                          aria-label="Voir l'historique des connexions"
                        >
                          <Clock className="h-4 w-4" />
                        </button>
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
                    {expandedMemberId === member.id && (
                      <div className="mt-3 border-t border-gray-100 pt-3">
                        <div className="flex items-center gap-2 mb-2 text-sm font-medium text-gray-700">
                          <Clock className="h-4 w-4 text-orange-600" />
                          Historique des connexions
                        </div>
                        {sessionsLoading[member.id] ? (
                          <p className="text-sm text-gray-500">Chargement de l'historique…</p>
                        ) : (sessionsByMember[member.id]?.length ?? 0) === 0 ? (
                          <p className="text-sm text-gray-500">
                            Aucune session enregistrée pour le moment. L'historique se
                            remplit à partir des prochaines connexions.
                          </p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                              <thead>
                                <tr className="text-left text-xs uppercase text-gray-400">
                                  <th className="py-1 pr-4 font-medium">Connexion</th>
                                  <th className="py-1 pr-4 font-medium">Déconnexion</th>
                                  <th className="py-1 pr-4 font-medium">Durée</th>
                                  <th className="py-1 font-medium">Appareil</th>
                                </tr>
                              </thead>
                              <tbody className="text-gray-700">
                                {sessionsByMember[member.id]!.map((s) => (
                                  <tr key={s.id} className="border-t border-gray-50">
                                    <td className="py-1.5 pr-4 whitespace-nowrap">
                                      {fmtDateTime(s.login_at)}
                                    </td>
                                    <td className="py-1.5 pr-4 whitespace-nowrap">
                                      {s.logout_at ? (
                                        fmtDateTime(s.logout_at)
                                      ) : (
                                        <span className="text-gray-400">—</span>
                                      )}
                                    </td>
                                    <td className="py-1.5 pr-4 whitespace-nowrap">
                                      {s.logout_at ? (
                                        fmtDuration(s.login_at, s.logout_at)
                                      ) : (
                                        <span className="inline-flex items-center gap-1 text-green-600">
                                          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                          en cours
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-1.5 text-gray-500">
                                      {shortDevice(s.user_agent)}
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
                <a
                  href="#appels-offres/equipe-roles"
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-700 rounded-lg transition-colors flex items-center"
                >
                  <Shield className="h-4 w-4 mr-2" />
                  Rôles Appels d’offres (vue détaillée)
                </a>
                {/* Boutons décoratifs retirés (« Envoyer un message à l'équipe »,
                    « Voir les statistiques d'usage », « Gérer les clés API ») : ils
                    n'avaient aucun handler ni fonctionnalité derrière. À réintroduire
                    seulement quand la vraie action existera. */}
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
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-sm font-medium text-gray-700 mb-2">Affectation</p>

                  {/* Commercial */}
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={affectCommercial}
                      onChange={(e) => setAffectCommercial(e.target.checked)}
                      className="mt-1 h-4 w-4 accent-orange-600"
                    />
                    <span className="text-sm text-gray-700">
                      <span className="font-medium">Commercial</span> — dashboard entreprise, pipeline, annonces
                    </span>
                  </label>
                  {affectCommercial && (
                    <div className="ml-6 mt-2 mb-3">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Rôle société</label>
                      <select
                        value={inviteFormData.role}
                        onChange={(e) => setInviteFormData(prev => ({ ...prev, role: e.target.value as any }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                      >
                        {invitableRoles.map(role => (
                          <option key={role.id} value={role.id}>{role.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Appels d'offres */}
                  <label className="flex items-start gap-2 cursor-pointer mt-1">
                    <input
                      type="checkbox"
                      checked={affectAO}
                      onChange={(e) => setAffectAO(e.target.checked)}
                      className="mt-1 h-4 w-4 accent-orange-600"
                    />
                    <span className="text-sm text-gray-700">
                      <span className="font-medium">Appels d’offres</span> — réponses aux AO (module Appels d’offres)
                    </span>
                  </label>
                  {affectAO && (
                    <div className="ml-6 mt-2">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Rôle Appels d’offres</label>
                      <select
                        value={inviteAoRole}
                        onChange={(e) => setInviteAoRole(e.target.value as TenderRole)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                      >
                        {TENDER_ROLES.map((r) => (
                          <option key={r} value={r}>{TENDER_ROLE_LABELS[r]}</option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-gray-500">Appliqué automatiquement dès que la personne rejoint l’équipe.</p>
                    </div>
                  )}

                  {!affectCommercial && !affectAO && (
                    <p className="mt-2 text-xs text-red-600">Choisissez au moins une affectation.</p>
                  )}
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
              const memberId = selectedMember.id;
              const isOwner = selectedMember.role === 'owner';
              // Affectation (accès aux espaces). Le propriétaire garde toujours les deux.
              const commercial = isOwner ? true : formData.get('scopeCommercial') === 'on';
              const tenders = isOwner ? true : formData.get('scopeTenders') === 'on';
              if (!commercial && !tenders) {
                toast('Choisissez au moins une affectation (Commercial ou Appels d’offres).');
                return;
              }
              // Rôle AO (module) : persisté dans le store tenders AVANT handleUpdateMember.
              upsertTenderRole({
                memberId,
                name: selectedMember.name,
                email: selectedMember.email,
                role: formData.get('tenderRole') as TenderRole,
                fromOrg: true,
              });
              // Affectation -> serveur (redirige hors des espaces non couverts).
              void setMemberScope(memberId, commercial, tenders).then((res) => {
                if (res.success) {
                  setMemberScopes((prev) => ({ ...prev, [memberId]: { commercial, tenders } }));
                } else {
                  toast(`❌ ${res.error || 'Échec du réglage de l’affectation.'}`);
                }
              });
              handleUpdateMember(memberId, {
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
                  <p className="mt-1 text-xs text-gray-500">Rôle « société » — pilote les droits d’accès (base de données).</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rôle Appels d’offres (AO)</label>
                  <select
                    name="tenderRole"
                    defaultValue={aoRoleOf(selectedMember)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  >
                    {TENDER_ROLES.map((r) => (
                      <option key={r} value={r}>{TENDER_ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    Ce que ce salarié peut faire dans le module « Appels d’offres » (distinct du rôle société). Le salarié en hérite à sa connexion.
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Affectation (accès aux espaces)</label>
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        name="scopeCommercial"
                        defaultChecked={scopeOf(selectedMember).commercial}
                        disabled={selectedMember.role === 'owner'}
                        className="h-4 w-4 accent-orange-600"
                      />
                      Commercial (dashboard entreprise)
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        name="scopeTenders"
                        defaultChecked={scopeOf(selectedMember).tenders}
                        disabled={selectedMember.role === 'owner'}
                        className="h-4 w-4 accent-orange-600"
                      />
                      Appels d’offres
                    </label>
                  </div>
                  <p className="mt-1.5 text-xs text-gray-500">
                    {selectedMember.role === 'owner'
                      ? 'Le propriétaire a toujours accès aux deux.'
                      : 'Décoché = la personne est redirigée hors de cet espace.'}
                  </p>
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