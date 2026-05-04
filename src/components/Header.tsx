import React, { useState, useEffect, useRef, useDeferredValue } from 'react';
import { useMachineSearchSuggest } from '../hooks/queries/useMachineSearchSuggest';
import { useAuth } from '../hooks/useAuth';
import { trackEvent } from '../utils/analytics';
import {
  Search,
  Menu,
  Home,
  User,
  ChevronDown,
  LogIn,
  Wallet,
  GraduationCap,
  PenTool as Tool,
  Wrench,
  X,
  LogOut,
  Settings,
  Building2,
  Globe,
  ShoppingCart,
  Heart,
  Bell,
  Sun,
  Moon
} from 'lucide-react';

import supabaseClient from '../utils/supabaseClient';
import CurrencySelector from './CurrencySelector';
import { categories, iconMap } from '../data/categories';

const servicesMenu = [
  { label: 'Financement', section: 'financement', icon: Wallet },
  { label: 'Maintenance', section: 'maintenance', icon: Tool },
  { label: 'Formation', section: 'formation', icon: GraduationCap },
  { label: 'Support Technique', section: 'support', icon: Wrench },
];

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMachinesMenuOpen, setIsMachinesMenuOpen] = useState(false);
  const [isServicesMenuOpen, setIsServicesMenuOpen] = useState(false);
  const [hoveredCategoryId, setHoveredCategoryId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  /** Accordéon menu mobile : Machines / Services */
  const [mobileOpenSection, setMobileOpenSection] = useState<null | 'machines' | 'services'>(null);
  const [mobileCategoryId, setMobileCategoryId] = useState<string | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const deferredSearch = useDeferredValue(searchTerm.trim());
  const { data: searchSuggestions = [], isFetching: searchSuggestLoading } =
    useMachineSearchSuggest(deferredSearch);

  const showSearchDropdown =
    searchFocused &&
    deferredSearch.length >= 2 &&
    !window.location.hash.startsWith('#machines');
  const machinesTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const servicesTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { user } = useAuth();
  const [showMyDashboardTab, setShowMyDashboardTab] = useState(false);

  useEffect(() => {
    const computeDashboardEligibility = () => {
      const userServices = (localStorage.getItem('userServices') || '').toLowerCase();
      const userSubscription = (localStorage.getItem('userSubscription') || '').toLowerCase();
      const hasEnterprisePlan =
        userServices.includes('enterprise') ||
        userSubscription === 'enterprise' ||
        localStorage.getItem('enterpriseService') === 'true';

      const configuredFlag = localStorage.getItem('enterpriseDashboardConfigured') === 'true';
      const hasLegacyConfig = Boolean(localStorage.getItem('enterpriseDashboardConfig'));
      const hasRoleConfig = Object.keys(localStorage).some((key) => key.startsWith('enterpriseDashboardConfig_'));
      const hasDashboardConfig = configuredFlag || hasLegacyConfig || hasRoleConfig;

      // UX: afficher l'entree des qu'un compte entreprise est actif.
      // Si la config n'existe pas encore, la page cible gerera la suite (setup/display).
      setShowMyDashboardTab(hasEnterprisePlan || hasDashboardConfig);
    };

    computeDashboardEligibility();
    window.addEventListener('storage', computeDashboardEligibility);
    window.addEventListener('focus', computeDashboardEligibility);
    window.addEventListener('enterpriseSubscriptionActivated', computeDashboardEligibility as EventListener);
    window.addEventListener('subscriptionCancelled', computeDashboardEligibility as EventListener);

    return () => {
      window.removeEventListener('storage', computeDashboardEligibility);
      window.removeEventListener('focus', computeDashboardEligibility);
      window.removeEventListener('enterpriseSubscriptionActivated', computeDashboardEligibility as EventListener);
      window.removeEventListener('subscriptionCancelled', computeDashboardEligibility as EventListener);
    };
  }, []);

  const handleMachinesMenuEnter = () => {
    if (machinesTimeoutRef.current) {
      clearTimeout(machinesTimeoutRef.current);
      machinesTimeoutRef.current = null;
    }
    setIsMachinesMenuOpen(true);
  };

  const handleMachinesMenuLeave = () => {
    machinesTimeoutRef.current = setTimeout(() => {
      setIsMachinesMenuOpen(false);
      setHoveredCategoryId(null);
    }, 300);
  };

  const handleServicesMenuEnter = () => {
    if (servicesTimeoutRef.current) {
      clearTimeout(servicesTimeoutRef.current);
      servicesTimeoutRef.current = null;
    }
    setIsServicesMenuOpen(true);
  };

  const handleServicesMenuLeave = () => {
    servicesTimeoutRef.current = setTimeout(() => {
      setIsServicesMenuOpen(false);
    }, 300);
  };

  useEffect(() => {
    return () => {
      if (machinesTimeoutRef.current) clearTimeout(machinesTimeoutRef.current);
      if (servicesTimeoutRef.current) clearTimeout(servicesTimeoutRef.current);
      if (searchBlurTimer.current) clearTimeout(searchBlurTimer.current);
    };
  }, []);

  const closeMobileMenu = () => {
    setIsMenuOpen(false);
    setMobileOpenSection(null);
    setMobileCategoryId(null);
  };

  const toggleMobileSection = (section: 'machines' | 'services') => {
    setMobileOpenSection((prev) => (prev === section ? null : section));
    setMobileCategoryId(null);
  };

  return (
    <header className="bg-white shadow-md relative z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <button
              className="p-2 rounded-md text-gray-400 lg:hidden"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              <Menu className="h-6 w-6" />
            </button>
            <a href="#" className="flex-shrink-0 flex items-center space-x-2">
              <img src="/logo Minegrid equipement trans.png" alt="Logo Minegrid" className="h-12 w-auto" />
            </a>
          </div>

          {!window.location.hash.startsWith('#machines') && (
            <div className="flex-1 max-w-2xl mx-4 hidden lg:block">
              <div className="relative z-[60]">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onFocus={() => {
                    if (searchBlurTimer.current) clearTimeout(searchBlurTimer.current);
                    setSearchFocused(true);
                  }}
                  onBlur={() => {
                    searchBlurTimer.current = setTimeout(() => setSearchFocused(false), 180);
                  }}
                  placeholder="Rechercher des machines..."
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && searchTerm.trim()) {
                      trackEvent('header_search_submit', { query_len: searchTerm.trim().length });
                      window.location.hash = `#machines?search=${encodeURIComponent(searchTerm.trim())}`;
                      setSearchFocused(false);
                    }
                  }}
                  autoComplete="off"
                  aria-expanded={showSearchDropdown}
                  aria-controls="header-machine-suggest"
                />
                <Search className="absolute right-3 top-2.5 h-5 w-5 text-gray-400 pointer-events-none" />
                {showSearchDropdown && (
                  <ul
                    id="header-machine-suggest"
                    role="listbox"
                    className="absolute left-0 right-0 top-full mt-1 max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
                  >
                    {searchSuggestLoading && (
                      <li className="px-3 py-2 text-xs text-gray-500">Recherche…</li>
                    )}
                    {!searchSuggestLoading &&
                      searchSuggestions.length === 0 &&
                      deferredSearch.length >= 2 && (
                        <li className="px-3 py-2 text-xs text-gray-500">Aucune suggestion</li>
                      )}
                    {searchSuggestions.map((row) => (
                      <li key={row.id} role="option">
                        <button
                          type="button"
                          className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-orange-50"
                          onMouseDown={(ev) => {
                            ev.preventDefault();
                            trackEvent('header_search_suggestion_click', {
                              machine_id: row.id,
                              query_len: deferredSearch.length,
                            });
                            window.location.hash = `#machines/${row.id}`;
                            setSearchTerm('');
                            setSearchFocused(false);
                          }}
                        >
                          <span className="font-medium text-gray-900">{row.name}</span>
                          {row.brand && (
                            <span className="text-xs text-gray-500">{row.brand}</span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          <nav className="hidden md:flex items-center space-x-6">
            <div className="relative group">
              <button
                className="flex items-center text-gray-700 hover:text-orange-600"
                onMouseEnter={handleMachinesMenuEnter}
                onMouseLeave={handleMachinesMenuLeave}
              >
                Machines
                <ChevronDown className="ml-1 h-4 w-4" />
              </button>

              {isMachinesMenuOpen && (
                <div
                  className="absolute left-0 mt-2 bg-white rounded-lg shadow-lg flex z-50"
                  onMouseEnter={handleMachinesMenuEnter}
                  onMouseLeave={handleMachinesMenuLeave}
                >
                  <div className="w-56 py-2">
                    {categories.map((cat) => {
                      const Icon = iconMap[cat.icon as keyof typeof iconMap] || (() => null);
                      return (
                        <div
                          key={cat.id}
                          onMouseEnter={() => setHoveredCategoryId(cat.id)}
                          className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600 cursor-pointer transition"
                        >
                          <Icon className="h-4 w-4 mr-2 text-gray-400" />
                          {cat.name}
                        </div>
                      );
                    })}
                  </div>
                  {hoveredCategoryId && (
                    <div className="w-64 py-2 border-l bg-white">
                      {categories
                        .filter((c) => c.id === hoveredCategoryId)
                        .map((cat) =>
                          cat.subcategories?.map((sub) => (
                            <a
                              key={sub.id}
                              href={`#machines?machine=${encodeURIComponent(cat.name)}&type=${encodeURIComponent(sub.id)}`}
                              className="block px-4 py-2 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition"
                            >
                              {sub.name}
                            </a>
                          ))
                        )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="relative group">
              <button
                className="flex items-center text-gray-700 hover:text-orange-600"
                onMouseEnter={handleServicesMenuEnter}
                onMouseLeave={handleServicesMenuLeave}
              >
                Services
                <ChevronDown className="ml-1 h-4 w-4" />
              </button>

              {isServicesMenuOpen && (
                <div
                  className="absolute left-0 mt-2 w-56 bg-white rounded-lg shadow-lg py-2"
                  onMouseEnter={handleServicesMenuEnter}
                  onMouseLeave={handleServicesMenuLeave}
                >
                  {servicesMenu.map((item) => {
                    const Icon = item.icon;
                    return (
                      <a
                      key={item.section}
                      href={`#services/${item.section}`}
                      className="flex items-center px-4 py-2 text-sm text-gray-700 transition-all duration-150 hover:text-primary-600 hover:translate-x-1 hover:bg-primary-50"
                    >
                      <Icon className="h-4 w-4 mr-2 text-gray-400 transition-transform group-hover:scale-110" />
                      {item.label}
                    </a>
                    );
                  })}
                </div>
              )}
            </div>

            <a
              href="#pro"
              className="text-gray-700 hover:text-primary-600 font-semibold"
            >
              Espace Pro
            </a>

            <a
              href="#global-monitor"
              className="flex items-center gap-1.5 text-gray-700 hover:text-primary-600 font-semibold"
            >
              <Globe className="h-4 w-4" />
              Global Monitor
            </a>

            <a href="#blog" className="text-gray-700 hover:text-primary-600">Blog</a>
            <a href="#contact" className="text-gray-700 hover:text-primary-600">Contact</a>
          </nav>

          <div className="flex items-center">
            <div className="block">
              <CurrencySelector />
            </div>
            <a href="#" className="p-2 rounded-full hover:bg-primary-50" title="Accueil">
              <Home className="h-6 w-6 text-primary-600" />
            </a>

            <div className="relative group">
              <button className="p-2 rounded-full hover:bg-primary-50">
                <User className="h-6 w-6 text-primary-600" />
              </button>

              <div className="absolute right-0 w-48 py-2 mt-2 bg-white rounded-md shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-50">
                {user ? (
                  <>
                    <div className="px-4 py-2 text-sm text-gray-500">Bonjour, {user.user_metadata?.full_name || user.email}</div>
                    <a
                      href="#dashboard"
                      className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-primary-50 hover:text-primary-600"
                    >
                      <User className="h-4 w-4 mr-2" />
                      Mon espace
                    </a>
                    {showMyDashboardTab && (
                      <a
                        href="#dashboard-entreprise-display"
                        className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-primary-50 hover:text-primary-600"
                      >
                        <Building2 className="h-4 w-4 mr-2" />
                        Mon dashboard
                      </a>
                    )}
                    <a
                      href="#global-monitor"
                      className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-primary-50 hover:text-primary-600"
                    >
                      <Globe className="h-4 w-4 mr-2" />
                      Global Monitor
                    </a>
                    <a
                      href="#leads"
                      className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-primary-50 hover:text-primary-600"
                    >
                      <Bell className="h-4 w-4 mr-2" />
                      Leads
                    </a>
                    <button
                      onClick={async () => {
                        await supabaseClient.auth.signOut();
                        window.location.hash = '#';
                      }}
                      className="flex w-full text-left items-center px-4 py-2 text-sm text-gray-700 hover:bg-primary-50 hover:text-primary-600"
                    >
                      <LogOut className="h-4 w-4 mr-2" />
                      Déconnexion
                    </button>
                  </>
                ) : (
                  <>
                    <a
                      href="#connexion"
                      className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-primary-50 hover:text-primary-600"
                    >
                      <LogIn className="h-4 w-4 mr-2" />
                      Connexion
                    </a>
                    <a
                      href="#inscription"
                      className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-primary-50 hover:text-primary-600"
                    >
                      <User className="h-4 w-4 mr-2" />
                      Inscription
                    </a>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {isMenuOpen && (
        <div className="lg:hidden absolute top-16 left-0 w-full bg-white shadow-md z-40 max-h-[calc(100vh-4rem)] overflow-y-auto">
          <nav className="flex flex-col px-4 py-3 space-y-1 text-sm">
            <button
              type="button"
              onClick={() => toggleMobileSection('machines')}
              className="flex w-full items-center justify-between py-2 text-left font-medium text-gray-800 border-b border-gray-100"
            >
              Machines
              <ChevronDown
                className={`h-4 w-4 shrink-0 transition-transform ${mobileOpenSection === 'machines' ? 'rotate-180' : ''}`}
              />
            </button>
            {mobileOpenSection === 'machines' && (
              <div className="pl-2 pb-2 space-y-1 border-b border-gray-100">
                <a
                  href="#machines"
                  onClick={closeMobileMenu}
                  className="block py-1.5 text-orange-600 font-medium"
                >
                  Toutes les machines
                </a>
                {categories.map((cat) => (
                  <div key={cat.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setMobileCategoryId((id) => (id === cat.id ? null : cat.id))
                      }
                      className="flex w-full items-center justify-between py-1.5 text-left text-gray-700"
                    >
                      <span>{cat.name}</span>
                      <ChevronDown
                        className={`h-3.5 w-3.5 shrink-0 transition-transform ${mobileCategoryId === cat.id ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {mobileCategoryId === cat.id && cat.subcategories && (
                      <div className="ml-2 border-l border-orange-200 pl-2 space-y-0.5 pb-1">
                        {cat.subcategories.map((sub) => (
                          <a
                            key={sub.id}
                            href={`#machines?machine=${encodeURIComponent(cat.name)}&type=${encodeURIComponent(sub.id)}`}
                            onClick={closeMobileMenu}
                            className="block py-1 text-gray-600 hover:text-orange-600"
                          >
                            {sub.name}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => toggleMobileSection('services')}
              className="flex w-full items-center justify-between py-2 text-left font-medium text-gray-800 border-b border-gray-100"
            >
              Services
              <ChevronDown
                className={`h-4 w-4 shrink-0 transition-transform ${mobileOpenSection === 'services' ? 'rotate-180' : ''}`}
              />
            </button>
            {mobileOpenSection === 'services' && (
              <div className="pl-2 pb-2 space-y-1 border-b border-gray-100">
                <a href="#services" onClick={closeMobileMenu} className="block py-1.5 text-orange-600 font-medium">
                  Vue d&apos;ensemble services
                </a>
                {servicesMenu.map((item) => (
                  <a
                    key={item.section}
                    href={`#services/${item.section}`}
                    onClick={closeMobileMenu}
                    className="block py-1.5 text-gray-700 hover:text-orange-600"
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            )}

            <a href="#pro" onClick={closeMobileMenu} className="py-2 text-gray-800 font-semibold border-b border-gray-100">
              Espace Pro
            </a>
            <a
              href="#global-monitor"
              onClick={closeMobileMenu}
              className="py-2 text-gray-800 font-semibold flex items-center gap-2 border-b border-gray-100"
            >
              <Globe className="h-4 w-4" />
              Global Monitor
            </a>
            <a href="#blog" onClick={closeMobileMenu} className="py-2 text-gray-700 hover:text-primary-600 border-b border-gray-100">
              Blog
            </a>
            <a href="#contact" onClick={closeMobileMenu} className="py-2 text-gray-700 hover:text-primary-600 border-b border-gray-100">
              Contact
            </a>
            {user ? (
              <>
                <a href="#dashboard" onClick={closeMobileMenu} className="py-2 text-gray-700 hover:text-primary-600">
                  Mon espace
                </a>
                <a href="#leads" onClick={closeMobileMenu} className="py-2 text-gray-700 hover:text-primary-600">
                  Leads
                </a>
                <button
                  type="button"
                  onClick={async () => {
                    await supabaseClient.auth.signOut();
                    closeMobileMenu();
                    window.location.hash = '#';
                  }}
                  className="text-left py-2 text-gray-700 hover:text-primary-600"
                >
                  Déconnexion
                </button>
              </>
            ) : (
              <>
                <a href="#connexion" onClick={closeMobileMenu} className="py-2 text-gray-700 hover:text-primary-600">
                  Connexion
                </a>
                <a href="#inscription" onClick={closeMobileMenu} className="py-2 text-gray-700 hover:text-primary-600">
                  Inscription
                </a>
              </>
            )}
          </nav>
        </div>
      )}
    </header>
  );
};

export default Header;
