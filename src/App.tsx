import React, { Suspense, lazy, useEffect } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { useRouteParams } from './router';
import ErrorBoundary from './components/ErrorBoundary';
import { NotificationContainer } from './components/NotificationToast';
import Header from './components/Header';
import Footer from './components/Footer';
import CategoryList from './components/CategoryList';
import FeaturedMachines from './components/FeaturedMachines';
import Machines from './pages/Machines';
import MachineDetail from './pages/MachineDetail';
import Services from './pages/Services';
import Contact from './pages/Contact';
import Register from './pages/Register';
import Login from './pages/Login';
import Blog from './pages/Blog';
import Dashboard from './pages/Dashboard.jsx';
import { useExchangeRates } from './hooks/useExchangeRates';
import { useMemberScope } from './hooks/useMemberScope';
import { isInvitedMember } from './utils/api/memberScope';
import SectorMachines from './pages/SectorMachines';
import SellerMachines from './pages/SellerMachines';
import Hero from './components/Hero';
import HomeTrustSection from './components/HomeTrustSection';
import ForgotPassword from './pages/ForgotPassword';
import UpdatePassword from './pages/UpdatePassword';
import ChatWidget from './components/ChatWidget';
import FinancingRequest from './pages/FinancingRequest';
import ProtectedRoute from './components/ProtectedRoute';
import RequireSubscription from './components/RequireSubscription';
import type { SubscriptionType } from './utils/api/subscription';
import { ADMIN_SOURCES_ENABLED } from './services/monitorApi';

const PageLoader = () => (
  <div className="flex flex-col items-center justify-center min-h-[45vh] gap-3 text-gray-600">
    <div className="animate-spin rounded-full h-10 w-10 border-2 border-orange-500 border-t-transparent" />
    <span className="text-sm">Chargement du module…</span>
  </div>
);

/**
 * Garde une route payante : session requise (ProtectedRoute) ET abonnement actif
 * du bon niveau, vérifié CÔTÉ SERVEUR (RequireSubscription → pro_clients via RLS).
 * Remplace l'ancien gating localStorage falsifiable (findings #5 / routes payantes
 * sans vérification d'abonnement).
 */
const paidRoute = (level: SubscriptionType, element: React.ReactNode): React.ReactNode => (
  <ProtectedRoute>
    <RequireSubscription level={level}>{element}</RequireSubscription>
  </ProtectedRoute>
);

const SellEquipment = lazy(() => import('./pages/SellEquipment'));
const ProSubscription = lazy(() => import('./pages/ProSubscription'));
const ProDashboard = lazy(() => import('./pages/ProDashboard'));
const EnterpriseService = lazy(() => import('./pages/EnterpriseService'));
const DashboardConfigurator = lazy(() => import('./pages/DashboardConfigurator'));
const VitrinePersonnalisee = lazy(() => import('./pages/VitrinePersonnalisee'));
const PublicationRapide = lazy(() => import('./pages/PublicationRapide'));
const DevisGenerator = lazy(() => import('./pages/DevisGenerator'));
const DocumentsEspace = lazy(() => import('./pages/DocumentsEspace'));
const MessagesBoite = lazy(() => import('./pages/MessagesBoite'));
const PlanningPro = lazy(() => import('./pages/PlanningPro'));
const EnterpriseDashboardVendeurDisplay = lazy(
  () => import('./pages/EnterpriseDashboardVendeurDisplay')
);
const EnterpriseDashboardLoueurDisplay = lazy(
  () => import('./pages/EnterpriseDashboardLoueurDisplay')
);
const EnterpriseDashboardMecanicienDisplay = lazy(
  () => import('./pages/EnterpriseDashboardMecanicienDisplay')
);
const EnterpriseDashboardTransporteurDisplay = lazy(
  () => import('./pages/EnterpriseDashboardTransporteurDisplay')
);
const EnterpriseDashboardTransitaireDisplay = lazy(
  () => import('./pages/EnterpriseDashboardTransitaireDisplay')
);
const EnterpriseDashboardLogisticienDisplay = lazy(
  () => import('./pages/EnterpriseDashboardLogisticienDisplay')
);
const EnterpriseDashboardInvestisseurDisplay = lazy(
  () => import('./pages/EnterpriseDashboardInvestisseurDisplay')
);
const EnterpriseDashboardCourtierDisplay = lazy(
  () => import('./pages/EnterpriseDashboardCourtierDisplay')
);
const PremiumDashboard = lazy(() => import('./pages/PremiumDashboard'));
const ApiDocs = lazy(() => import('./pages/ApiDocs'));
const PrioritySupport = lazy(() => import('./pages/PrioritySupport'));
const MultiUserManagement = lazy(() => import('./pages/MultiUserManagement'));
const AcceptInvitation = lazy(() => import('./pages/AcceptInvitation'));
const AiSettings = lazy(() => import('./pages/AiSettings'));
const GlobalMonitor = lazy(() => import('./pages/GlobalMonitor'));
const SalesOpportunities = lazy(() => import('./pages/SalesOpportunities'));
const SourcesAdmin = lazy(() => import('./pages/SourcesAdmin'));
const DemoEntrepriseAccess = lazy(() => import('./pages/DemoEntrepriseAccess'));
const LegalStaticPage = lazy(() => import('./pages/LegalStaticPage'));
const LeadsInbox = lazy(() => import('./pages/LeadsInbox'));
const TransactionCasePage = lazy(() => import('./pages/TransactionCasePage'));
const MyTransactionCasesPage = lazy(() => import('./pages/MyTransactionCasesPage'));
// Espace NextGen conservé comme DÉMO/ADMIN interne (pas l'expérience principale) :
// les briques (Trust/Inspection/Escrow/Finance/Logistics/Data/IA) sont intégrées
// directement dans les parcours réels (fiche machine, recherche, etc.).
const NextGenRouter = lazy(() => import('./pages/nextgen/NextGenRouter'));
const NextGenInternalGate = lazy(() => import('./nextgen/integration/InternalGate'));
// Module Appels d'offres : cahiers des charges, analyse DCE, go/no-go,
// mémoire technique, exports (fonctionne en local, IA mockée par défaut).
const TendersApp = lazy(() => import('./tenders'));

/**
 * Routes considérées comme "application" : elles ont leur propre shell/navigation
 * interne (tabs, sidebar…) et ne doivent PAS afficher le footer public global.
 * Toutes les autres routes (accueil, machines, services, contact, inscription,
 * connexion, blog, vendre, secteur, entreprise, financement…) affichent le footer.
 */
const APP_ONLY_ROUTES = new Set<string>([
  'dashboard',
  'pro',
  'dashboard-entreprise',
  'dashboard-entreprise-display',
  'dashboard-loueur-display',
  'dashboard-mecanicien-display',
  'dashboard-transporteur-display',
  'dashboard-transitaire-display',
  'dashboard-logisticien-display',
  'dashboard-investisseur-display',
  'dashboard-courtier-display',
  'premium-dashboard',
  'dashboard-configurator',
  'dashboard-vendeur-legacy',
  'dashboard-vendeur-restored',
  'vitrine',
  'publication',
  'devis',
  'documents',
  'messages',
  'planning',
  'assistant-ia',
  'api-docs',
  'priority-support',
  'multi-user-management',
  'global-monitor',
  'opportunites-vente',
  'admin-sources',
  'leads',
  'dossiers',
  'dossier',
  'test-widget',
  'update-password',
  'demo-entreprise',
  'appels-offres',
  'accepter-invitation',
]);

// Espaces soumis à l'AFFECTATION du membre (cf. useMemberScope).
// COMMUNES (non listées ici, donc jamais bloquées) : messages, planning,
// documents, global-monitor, assistant-ia, multi-user-management, support…
const COMMERCIAL_SCOPE_PAGES = new Set([
  // Espace Pro / vendeur de base
  'dashboard', 'pro', 'premium-dashboard', 'vendre',
  // Dashboards entreprise
  'dashboard-entreprise', 'dashboard-entreprise-display', 'dashboard-loueur-display',
  'dashboard-mecanicien-display', 'dashboard-transporteur-display', 'dashboard-transitaire-display',
  'dashboard-logisticien-display', 'dashboard-investisseur-display', 'dashboard-courtier-display',
  'dashboard-configurator',
  // Outils commerciaux / transactionnels
  'publication', 'devis', 'financement', 'opportunites-vente', 'leads', 'dossiers', 'dossier', 'vitrine',
]);
const TENDERS_SCOPE_PAGES = new Set(['appels-offres']);
// Pages réservées au PROPRIÉTAIRE du compte (pas aux membres invités) :
// espaces vendeur personnels + gestion d'équipe + publication/mise en vente
// d'annonces (le contenu/les annonces de la société sont gérés par le titulaire).
const OWNER_ONLY_PAGES = new Set([
  'dashboard', 'pro', 'premium-dashboard', 'vendre', 'publication', 'multi-user-management',
]);

/** Redirige en douceur vers l'espace autorisé quand l'affectation ne couvre pas la page. */
const ScopeRedirect: React.FC<{ to: string; message: string }> = ({ to, message }) => {
  useEffect(() => {
    window.location.hash = `#${to}`;
  }, [to]);
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 text-center">
      <p className="text-sm text-gray-600">{message}</p>
    </div>
  );
};

function AppContent() {
  const { segments: pathParts, searchParams } = useRouteParams();

  useExchangeRates();
  const { scope, loading: scopeLoading } = useMemberScope();

  const currentRoute = pathParts[0] ?? '';
  const showFooter =
    !APP_ONLY_ROUTES.has(currentRoute) &&
    window.location.pathname !== '/update-password';

  const renderContent = () => {
    if (window.location.pathname === '/update-password') {
      return <UpdatePassword />;
    }

    // Garde d'AFFECTATION : un membre est redirigé hors des espaces auxquels il
    // n'est pas affecté (Commercial vs Appels d'offres). Défaut = accès à tout,
    // donc aucun impact tant que l'admin n'a rien restreint.
    {
      const p = pathParts[0] ?? '';
      const isScopeGated =
        COMMERCIAL_SCOPE_PAGES.has(p) || TENDERS_SCOPE_PAGES.has(p) || OWNER_ONLY_PAGES.has(p);

      // Tant que l'affectation charge, on NE REND PAS une page scope-gardée : on
      // affiche un loader au lieu de rendre l'espace réservé puis de rediriger
      // (sinon « flash » de contenu réservé au cold-load). Les pages publiques
      // ne sont pas concernées et restent instantanées.
      if (scopeLoading && isScopeGated) {
        return (
          <div className="min-h-[60vh] flex items-center justify-center text-gray-500">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-orange-500" />
          </div>
        );
      }

      if (!scopeLoading) {
        if (COMMERCIAL_SCOPE_PAGES.has(p) && !scope.commercial) {
          return (
            <ScopeRedirect
              to="appels-offres"
              message="Votre affectation ne couvre pas l'espace commercial — redirection vers les Appels d'offres…"
            />
          );
        }
        if (TENDERS_SCOPE_PAGES.has(p) && !scope.tenders) {
          return (
            <ScopeRedirect
              to="dashboard"
              message="Votre affectation ne couvre pas les Appels d'offres — redirection vers votre espace…"
            />
          );
        }
        // Pages du propriétaire (espace vendeur perso, gestion d'équipe) : un
        // membre invité y est redirigé vers son espace de travail.
        if (OWNER_ONLY_PAGES.has(p) && isInvitedMember(scope)) {
          return (
            <ScopeRedirect
              to={scope.commercial ? 'dashboard-entreprise-display' : 'appels-offres'}
              message="Cette page est réservée au propriétaire du compte — redirection vers votre espace…"
            />
          );
        }
      }
    }

    switch (pathParts[0]) {
      case 'machines':
        if (pathParts.length === 2) {
          return <MachineDetail machineId={pathParts[1]} />;
        }
        return <Machines category={searchParams.get('categorie')} />;

      case 'seller':
        if (pathParts.length === 2) {
          return <SellerMachines sellerId={pathParts[1]} />;
        }
        return <Machines category={searchParams.get('categorie')} />;

      case 'services':
        if (pathParts.length === 2) {
          return <Services service={pathParts[1]} />;
        }
        return <Services />;

      case 'contact':
        return <Contact />;

      case 'mentions-legales':
        return <LegalStaticPage slug="mentions" />;

      case 'politique-confidentialite':
        return <LegalStaticPage slug="privacy" />;

      case 'conditions-utilisation':
        return <LegalStaticPage slug="terms" />;

      case 'inscription': {
        const t = searchParams.get('type');
        const preType =
          t === 'seller' ? 'seller' : t === 'client' ? 'client' : undefined;
        return <Register initialType={preType} />;
      }

      case 'connexion':
        return <Login />;

      case 'mot-de-passe-oublie':
        return <ForgotPassword />;

      case 'update-password':
        return <UpdatePassword />;

      case 'blog':
        return <Blog postId={pathParts[1]} />;

      case 'vendre':
        return <SellEquipment />;

      case 'dashboard':
        return <Dashboard section={pathParts[1]} />;

      case 'financement':
        return <FinancingRequest />;

      case 'nextgen':
        return (
          <NextGenInternalGate>
            <NextGenRouter sub={pathParts[1]} />
          </NextGenInternalGate>
        );

      case 'secteur':
        return <SectorMachines />;

      case 'pro':
        return paidRoute('pro', <ProDashboard />);

      case 'entreprise':
        return <EnterpriseService />;

      // Page de tarifs publique (grille validée : Gratuit / Premium 20 $ /
      // Pro 50 $ / Enterprise 200 $ — paiement Paddle). Accessible sans compte.
      case 'tarifs':
      case 'abonnements':
        return <ProSubscription />;

      case 'dashboard-entreprise':
        return paidRoute('enterprise', <DashboardConfigurator />);

      case 'dashboard-entreprise-display': {
        const activeMetier = localStorage.getItem('lastActiveMetier') || 'vendeur';
        const display = (() => {
          switch (activeMetier) {
            case 'loueur': return <EnterpriseDashboardLoueurDisplay />;
            case 'mecanicien': return <EnterpriseDashboardMecanicienDisplay />;
            case 'transporteur': return <EnterpriseDashboardTransporteurDisplay />;
            case 'transitaire': return <EnterpriseDashboardTransitaireDisplay />;
            case 'logisticien': return <EnterpriseDashboardLogisticienDisplay />;
            case 'investisseur': return <EnterpriseDashboardInvestisseurDisplay />;
            case 'courtier': return <EnterpriseDashboardCourtierDisplay />;
            default: return <EnterpriseDashboardVendeurDisplay />;
          }
        })();
        return paidRoute('enterprise', display);
      }

      case 'dashboard-loueur-display':
        return paidRoute('enterprise', <EnterpriseDashboardLoueurDisplay />);

      case 'dashboard-mecanicien-display':
        return paidRoute('enterprise', <EnterpriseDashboardMecanicienDisplay />);

      case 'dashboard-transporteur-display':
        return paidRoute('enterprise', <EnterpriseDashboardTransporteurDisplay />);

      case 'dashboard-transitaire-display':
        return paidRoute('enterprise', <EnterpriseDashboardTransitaireDisplay />);

      case 'dashboard-logisticien-display':
        return paidRoute('enterprise', <EnterpriseDashboardLogisticienDisplay />);

      case 'dashboard-investisseur-display':
        return paidRoute('enterprise', <EnterpriseDashboardInvestisseurDisplay />);

      case 'dashboard-courtier-display':
        return paidRoute('enterprise', <EnterpriseDashboardCourtierDisplay />);

      case 'premium-dashboard':
        return paidRoute('premium', <PremiumDashboard />);

      case 'dashboard-configurator':
        return paidRoute('enterprise', <DashboardConfigurator />);

      case 'vitrine':
        return <VitrinePersonnalisee />;

      case 'publication':
        return <PublicationRapide />;

      case 'devis':
        return (
          <ProtectedRoute>
            <DevisGenerator />
          </ProtectedRoute>
        );

      case 'documents':
        return (
          <ProtectedRoute>
            <DocumentsEspace />
          </ProtectedRoute>
        );

      case 'messages':
        return (
          <ProtectedRoute>
            <MessagesBoite />
          </ProtectedRoute>
        );

      case 'planning':
        return (
          <ProtectedRoute>
            <PlanningPro />
          </ProtectedRoute>
        );

      case 'api-docs':
        return paidRoute('pro', <ApiDocs />);

      case 'priority-support':
        return paidRoute('premium', <PrioritySupport />);

      case 'multi-user-management':
        return paidRoute('enterprise', <MultiUserManagement />);

      // Panneau de connexion IA de la société (OpenAI / Claude / Grok / autre).
      // Palier interne 'premium' = plan affiché « Pro » (l'Assistant IA en fait partie).
      case 'assistant-ia':
        return paidRoute('premium', <AiSettings />);

      // Page publique d'acceptation d'invitation : l'invité n'est pas encore
      // connecté et n'a pas d'abonnement -> aucun garde. La page gère l'auth.
      case 'accepter-invitation':
        return <AcceptInvitation />;

      // Radar d'opportunités : réservé au plan affiché « Pro » (code interne
      // 'premium') et au-dessus — grille validée 2026-07 (src/config/plans.ts).
      case 'global-monitor':
        return paidRoute('premium', <GlobalMonitor />);

      case 'opportunites-vente':
        return paidRoute('premium', <SalesOpportunities />);

      // Outil INTERNE : disponible seulement dans un build interne (jeton admin
      // configuré). Dans le build public, la route est inaccessible.
      case 'admin-sources':
        if (!ADMIN_SOURCES_ENABLED) {
          return (
            <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3 p-8 text-center text-gray-500">
              <p>Cet outil est réservé à l'administration interne.</p>
              <a href="#" className="text-orange-600 hover:underline">Retour à l'accueil</a>
            </div>
          );
        }
        return (
          <ProtectedRoute>
            <SourcesAdmin />
          </ProtectedRoute>
        );

      case 'leads':
        return (
          <ProtectedRoute>
            <LeadsInbox />
          </ProtectedRoute>
        );

      case 'dossiers':
        return (
          <ProtectedRoute>
            <MyTransactionCasesPage />
          </ProtectedRoute>
        );

      case 'dossier':
        if (pathParts[1]) {
          return (
            <ProtectedRoute>
              <TransactionCasePage caseId={pathParts[1]} />
            </ProtectedRoute>
          );
        }
        return (
          <div className="max-w-lg mx-auto px-4 py-16 text-center text-gray-600 text-sm">
            Indiquez un identifiant de dossier dans l’URL (<span className="font-mono">#dossier/&lt;uuid&gt;</span>).
          </div>
        );

      // Appels d'offres (analyse DCE, go/no-go, mémoire IA) : plan affiché « Pro »
      // (code interne 'premium') et au-dessus. Les membres invités héritent de
      // l'abonnement du propriétaire (get_effective_subscription).
      case 'appels-offres':
        return paidRoute('premium', <TendersApp />);

      case 'demo-entreprise':
        return <DemoEntrepriseAccess />;

      default:
        return (
          <>
            <Hero />
            <HomeTrustSection />
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Parcourir par Secteur d'activité</h2>
              <CategoryList />
            </div>
            <FeaturedMachines />
          </>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />
      <main className="flex-1">
        <ErrorBoundary>
          <Suspense fallback={<PageLoader />}>{renderContent()}</Suspense>
        </ErrorBoundary>
      </main>
      {showFooter && <Footer />}
      <ChatWidget />
      <NotificationContainer />
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <ErrorBoundary>
        <AppContent />
      </ErrorBoundary>
    </AuthProvider>
  );
}

export default App;
