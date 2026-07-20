import React, { useState, useEffect } from 'react';
import { Plus, Package, Settings, Bell, User, LogOut, ChevronRight, Shield, Wallet, RefreshCw, Eye, MessageSquare, DollarSign, X, CreditCard, Gift, Save } from 'lucide-react';
import PaddleCheckoutButton from '../components/PaddleCheckoutButton';
import { PAID_PLANS, PLAN_RANK, getPaidPlan, normalizePlanId, planDisplayName, planPriceUsd } from '../config/plans';
import { getMySubscription } from '../utils/api/subscription';
import { MyTrustInline } from '../nextgen/integration/inline';
import { getSellerMachines, logoutUser, getDashboardStats, getWeeklyActivityData, getOffers, getNotifications } from '../utils/api';
import { supabaseClient as supabase } from '../utils/supabaseClient';
import { logger } from '../utils/logger';
import { toast } from '../utils/toast';
import { useAuth } from '../hooks/useAuth';
import {
    getAccountItem,
    setAccountItem,
    removeAccountItem,
    SUBSCRIPTION_KEYS,
    isWatchedAccountKey,
} from '../utils/accountLocalStorage';
// Codes promo : plus AUCUN code dans le bundle. La validation + l'activation se font
// côté serveur via la RPC redeem_promo_code (migration p15). Voir activateSubscriptionWithPromo.
// Fonction utilitaire pour vérifier si une configuration valide existe (clés par compte)
const hasValidConfiguration = (userId) => {
    if (!userId) {
        return false;
    }
    // Vérifier d'abord si la configuration a été explicitement validée
    const isConfigured = getAccountItem(userId, 'enterpriseDashboardConfigured');
    if (isConfigured !== 'true') {
        logger.info('🔍 Configuration non validée explicitement');
        return false;
    }
    
    const vendeurConfig = getAccountItem(userId, 'enterpriseDashboardConfig_vendeur');
    const generalConfig = getAccountItem(userId, 'enterpriseDashboardConfig');
    
    // Vérifier d'abord la configuration vendeur
    if (vendeurConfig && vendeurConfig !== 'null' && vendeurConfig !== 'undefined' && vendeurConfig !== '' && vendeurConfig !== '{}') {
        try {
            const config = JSON.parse(vendeurConfig);
            if (config && 
                config.widgets && 
                Array.isArray(config.widgets) && 
                config.widgets.length > 0 &&
                config.widgets.every(widget => widget && typeof widget === 'object' && widget.type && widget.title)) {
                logger.info('✅ Configuration vendeur valide détectée');
                return true;
            }
        } catch (e) {
            logger.info('❌ Erreur parsing vendeurConfig:', e);
        }
    }
    
    // Vérifier la configuration générale
    if (generalConfig && generalConfig !== 'null' && generalConfig !== 'undefined' && generalConfig !== '' && generalConfig !== '{}') {
        try {
            const config = JSON.parse(generalConfig);
            if (config && 
                config.dashboardConfig && 
                config.dashboardConfig.widgets && 
                Array.isArray(config.dashboardConfig.widgets) && 
                config.dashboardConfig.widgets.length > 0 &&
                config.dashboardConfig.widgets.every(widget => widget && typeof widget === 'object' && widget.type && widget.title)) {
                logger.info('✅ Configuration générale valide détectée');
                return true;
            }
        } catch (e) {
            logger.info('❌ Erreur parsing generalConfig:', e);
        }
    }
    
    logger.info('❌ Aucune configuration valide détectée');
    return false;
};

export default function Dashboard({ section = 'overview' }) {
    const { user } = useAuth();
    const accountId = user?.id ?? null;

    const [machines, setMachines] = useState([]);
    const [loading, setLoading] = useState(true);
    const [userName, setUserName] = useState('');
    const [activeSection, setActiveSection] = useState(section);
    const [stats, setStats] = useState(null);
    const [weeklyData, setWeeklyData] = useState([]);
    const [messages, setMessages] = useState([]);
    const [offers, setOffers] = useState([]);
    const [activeSettingsTab, setActiveSettingsTab] = useState('profil');
    const [selectedMessageForReply, setSelectedMessageForReply] = useState(null);
    const [replyText, setReplyText] = useState('');
    const [isSendingReply, setIsSendingReply] = useState(false);
    const [showPaymentPage, setShowPaymentPage] = useState(false);
    const [selectedPlanForPayment, setSelectedPlanForPayment] = useState(null);
    const [paymentMethod, setPaymentMethod] = useState('card');
    const [promoCode, setPromoCode] = useState('');
    const [hasEnterpriseSubscription, setHasEnterpriseSubscription] = useState(false);
    const [hasActiveSubscription, setHasActiveSubscription] = useState(false);
    
    // Normalise la valeur d'abonnement pour l'UI : 'enterprise' (anglais, stocke
    // historiquement en localStorage) <=> 'entreprise' (francais, utilise dans
    // les conditions d'affichage). Sans cette normalisation, le bouton
    // "Acceder a mon service" n'apparait pas pour les comptes Enterprise.
    const normalizeSubscriptionType = (value) => {
        if (value === 'enterprise') return 'entreprise';
        return value;
    };

    const [subscriptionType, setSubscriptionType] = useState('aucun');
    // Date de fin réelle de l'abonnement (subscription_end serveur) — remplace
    // les dates codées en dur (« 15 juillet 2024 ») affichées auparavant.
    const [subscriptionEndsAt, setSubscriptionEndsAt] = useState(null);
    const formatDateFr = (iso) => {
        if (!iso) return null;
        const d = new Date(iso);
        return Number.isNaN(d.getTime())
            ? null
            : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    };

    // VRAIES notifications (table `notifications`) — remplace la notification de
    // démonstration codée en dur (« Pelle hydraulique CAT 320D il y a 2 heures »).
    const [userNotifications, setUserNotifications] = useState([]);

    const [, setIsFirstTimeEnterpriseDashboard] = useState(true);

    const [navigation, setNavigation] = useState([
        { name: 'Vue d\'ensemble', href: '#dashboard/overview', icon: Eye },
        { name: 'Mes annonces', href: '#dashboard/annonces', icon: Package },
        { name: 'Services', href: '#dashboard/services', icon: Shield },
        { name: 'Mon abonnement', href: '#dashboard/abonnement', icon: Wallet },
        { name: 'Notifications', href: '#dashboard/notifications', icon: Bell },
        { name: 'Paramètres', href: '#dashboard/settings', icon: Settings }
    ]);

    const weekDays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

    useEffect(() => {
        const syncFromStorage = () => {
            if (!accountId) {
                setHasActiveSubscription(false);
                setSubscriptionType('aucun');
                setHasEnterpriseSubscription(false);
                setIsFirstTimeEnterpriseDashboard(true);
                return;
            }
            const subscriptionCancelled = getAccountItem(accountId, 'subscriptionCancelled');
            if (subscriptionCancelled === 'true') {
                setHasActiveSubscription(false);
                setSubscriptionType('aucun');
                setHasEnterpriseSubscription(false);
                return;
            }

            const tempHasActive = getAccountItem(accountId, 'tempHasActiveSubscription');
            const tempSubscription = getAccountItem(accountId, 'tempSubscription');
            const userSubscription = getAccountItem(accountId, 'userSubscription');
            const selectedSub = getAccountItem(accountId, 'selectedSubscription');

            let active = false;
            if (tempHasActive === 'true' && tempSubscription) active = true;
            else if (userSubscription) active = true;
            else if (selectedSub && selectedSub !== 'gratuit') active = true;
            else if (hasValidConfiguration(accountId)) active = true;
            setHasActiveSubscription(active);

            let sub = 'aucun';
            if (tempSubscription) sub = normalizeSubscriptionType(tempSubscription);
            else if (userSubscription) sub = normalizeSubscriptionType(userSubscription);
            else if (selectedSub && ['premium', 'pro', 'enterprise', 'gratuit'].includes(selectedSub)) {
                sub = normalizeSubscriptionType(selectedSub);
            } else if (
                getAccountItem(accountId, 'enterpriseService') === 'true' &&
                hasValidConfiguration(accountId)
            ) {
                sub = 'entreprise';
            }
            setSubscriptionType(sub);

            const userServices = getAccountItem(accountId, 'userServices');
            const enterpriseService = getAccountItem(accountId, 'enterpriseService') === 'true';
            const hasEnt =
                (userServices?.includes('enterprise') ||
                    userSubscription === 'enterprise' ||
                    userSubscription === 'entreprise' ||
                    enterpriseService) &&
                subscriptionCancelled !== 'true';
            setHasEnterpriseSubscription(!!hasEnt);

            setIsFirstTimeEnterpriseDashboard(!getAccountItem(accountId, 'enterpriseDashboardConfigured'));
        };
        syncFromStorage();

        // VÉRITÉ SERVEUR : l'abonnement réel vit dans pro_clients (activé par le
        // webhook de paiement Paddle ou la RPC code promo). La mémoire locale
        // ci-dessus n'est qu'un cache hérité — le serveur a TOUJOURS le dernier
        // mot (paiement fait sur un autre appareil, activation webhook,
        // résiliation…). Sans cette synchro, un abonné payé via Paddle voyait
        // encore « Gratuit » sur cette page.
        let cancelledSync = false;
        const syncFromServer = async () => {
            try {
                const sub = await getMySubscription();
                if (cancelledSync) return;
                if (sub.isActive && sub.type) {
                    setHasActiveSubscription(true);
                    setSubscriptionType(normalizeSubscriptionType(sub.type));
                    setHasEnterpriseSubscription(sub.type === 'enterprise');
                    setSubscriptionEndsAt(sub.endsAt ?? null);
                } else {
                    // Pas d'abonnement actif côté serveur : on ne laisse pas un
                    // vieux drapeau localStorage prétendre le contraire.
                    setHasActiveSubscription(false);
                    setSubscriptionType('aucun');
                    setHasEnterpriseSubscription(false);
                    setSubscriptionEndsAt(null);
                }
            } catch {
                // Serveur injoignable : on conserve l'état local (meilleur effort).
            }
        };
        void syncFromServer();
        const handleSubscriptionRefresh = () => void syncFromServer();
        window.addEventListener('subscriptionRefreshRequested', handleSubscriptionRefresh);

        // Vraies notifications du compte (échec silencieux -> liste vide honnête).
        getNotifications()
            .then((rows) => { if (!cancelledSync) setUserNotifications(rows || []); })
            .catch(() => { if (!cancelledSync) setUserNotifications([]); });

        return () => {
            cancelledSync = true;
            window.removeEventListener('subscriptionRefreshRequested', handleSubscriptionRefresh);
        };
    }, [accountId]);

    useEffect(() => {
        loadDashboardData();
        loadUserData();
        loadMachines(); // sans ça, `loading` reste true (seul loadMachines remet setLoading(false)) → "Mes annonces" bloqué sur "Chargement…"
        window.addEventListener('hashchange', handleHashChange);
        handleHashChange(); // Appel initial
        
        // Écouter l'événement d'activation de l'abonnement entreprise
        const handleEnterpriseActivation = (event) => {
            logger.info('🎉 Événement d\'activation entreprise reçu:', event.detail);
            setHasEnterpriseSubscription(true);
            // Forcer le rafraîchissement de l'interface
            setTimeout(() => {
                refreshEnterpriseSubscription();
            }, 100);
        };
        
        // Écouter l'événement d'annulation d'abonnement
        const handleSubscriptionCancellation = (event) => {
            logger.info('🚫 Événement d\'annulation d\'abonnement reçu:', event.detail);
            setHasEnterpriseSubscription(false);
            setHasActiveSubscription(false);
            setSubscriptionType('aucun');
        };
        
        window.addEventListener('enterpriseSubscriptionActivated', handleEnterpriseActivation);
        window.addEventListener('subscriptionCancelled', handleSubscriptionCancellation);
        
        return () => {
            window.removeEventListener('hashchange', handleHashChange);
            window.removeEventListener('enterpriseSubscriptionActivated', handleEnterpriseActivation);
            window.removeEventListener('subscriptionCancelled', handleSubscriptionCancellation);
        };
    }, []);

    useEffect(() => {
        // Mettre à jour le nom de la navigation selon le type d'abonnement
        setNavigation(prev => prev.map(item => {
            if (item.name === 'Vue d\'ensemble' || item.name === 'Tableau de bord' || item.name === 'Mon espace') {
                return {
                    ...item,
                    name: (!hasActiveSubscription || subscriptionType === 'gratuit') ? 'Vue d\'ensemble' : 'Mon espace'
                };
            }
            return item;
        }));
    }, [hasActiveSubscription, subscriptionType]);

    // Effet pour rafraîchir l'état de l'abonnement entreprise quand on va sur la section services
    useEffect(() => {
        if (activeSection === 'services') {
            refreshEnterpriseSubscription();
        }
    }, [activeSection]);

    // Effet pour surveiller automatiquement les changements d'abonnement
    useEffect(() => {
        const checkSubscriptionStatus = () => {
            const userServices = getAccountItem(accountId, 'userServices');
            const userSubscription = getAccountItem(accountId, 'userSubscription');
            const enterpriseService = getAccountItem(accountId, 'enterpriseService');
            const subscriptionCancelled = getAccountItem(accountId, 'subscriptionCancelled');
            
            // Logique de détection améliorée
            const hasEnterprise = (userServices?.includes('enterprise') || 
                                userSubscription === 'enterprise' || userSubscription === 'entreprise' ||
                                enterpriseService === 'true') && 
                                subscriptionCancelled !== 'true';
            
            if (hasEnterprise !== hasEnterpriseSubscription) {
                logger.info('🔄 Changement d\'état d\'abonnement détecté:', hasEnterprise ? 'Actif' : 'Inactif');
                setHasEnterpriseSubscription(hasEnterprise);
            }
        };

        // Vérifier immédiatement
        checkSubscriptionStatus();

        // Surveiller les changements de localStorage
        const handleStorageChange = (e) => {
            if (isWatchedAccountKey(accountId, e.key, SUBSCRIPTION_KEYS)) {
                logger.info('📊 Changement localStorage détecté:', e.key, e.newValue);
                setTimeout(checkSubscriptionStatus, 100);
            }
        };

        window.addEventListener('storage', handleStorageChange);
        
        // Vérifier périodiquement (toutes les 2 secondes)
        const interval = setInterval(checkSubscriptionStatus, 2000);
        
        return () => {
            window.removeEventListener('storage', handleStorageChange);
            clearInterval(interval);
        };
    }, [hasEnterpriseSubscription, accountId]);

    // Logique automatique d'activation/désactivation des services entreprise
    // La surveillance se fait automatiquement via le useEffect ci-dessus

    const loadMachines = async () => {
        try {
            setLoading(true);
            const machinesData = await getSellerMachines();
            setMachines(machinesData || []);
        } catch (error) {
            logger.error('Erreur lors du chargement des machines:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadDashboardData = async () => {
        try {
            // Charger les données de base
            const [statsData, weeklyData, offersData] = await Promise.all([
                getDashboardStats(),
                getWeeklyActivityData(),
                getOffers()
            ]);
            setStats(statsData);
            setWeeklyData(weeklyData || []);
            setOffers(offersData || []);

            // Charger les messages depuis Supabase
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data: messagesData, error } = await supabase
                    .from('messages')
                    .select(`
                        *,
                        machine:machines(name, brand, model, images)
                    `)
                    .eq('recipient_email', user.email)
                    .order('created_at', { ascending: false });

                if (error) {
                    if (error.code !== 'PGRST205') {
                        logger.error('Erreur lors du chargement des messages:', error);
                    }
                    setMessages([]);
                } else {
                    setMessages(messagesData || []);
                    logger.info('📧 Messages chargés:', messagesData?.length || 0);
                }
            }
        } catch (error) {
            logger.error('Erreur lors du chargement des données du dashboard:', error);
        }
    };

    const loadUserData = async () => {
        try {
            const userData = getAccountItem(accountId, 'userData');
            if (userData) {
                const user = JSON.parse(userData);
                setUserName(user.name || user.email || 'Utilisateur');
            }
            
            // Vérifier l'abonnement entreprise
            const checkEnterpriseSubscription = () => {
                const userServices = getAccountItem(accountId, 'userServices');
                const userSubscription = getAccountItem(accountId, 'userSubscription');
                const enterpriseService = getAccountItem(accountId, 'enterpriseService');
                const subscriptionCancelled = getAccountItem(accountId, 'subscriptionCancelled');
                
                const hasEnterprise = (userServices?.includes('enterprise') || 
                                    userSubscription === 'enterprise' || userSubscription === 'entreprise' ||
                                    enterpriseService === 'true') && 
                                    subscriptionCancelled !== 'true';
                
                setHasEnterpriseSubscription(hasEnterprise);

            };
            
            checkEnterpriseSubscription();
        } catch (error) {
            logger.error('Erreur lors du chargement des données utilisateur:', error);
        }
    };

    // Fonction pour rafraîchir l'état de l'abonnement entreprise
    const refreshEnterpriseSubscription = () => {
        try {
            const userServices = getAccountItem(accountId, 'userServices');
            const userSubscription = getAccountItem(accountId, 'userSubscription');
            const enterpriseService = getAccountItem(accountId, 'enterpriseService');
            const subscriptionCancelled = getAccountItem(accountId, 'subscriptionCancelled');
            
            // Logique de détection améliorée
            const hasEnterprise = (userServices?.includes('enterprise') || 
                                userSubscription === 'enterprise' || userSubscription === 'entreprise' ||
                                enterpriseService === 'true') && 
                                subscriptionCancelled !== 'true';
            
            logger.info('🔄 Rafraîchissement abonnement entreprise:', hasEnterprise ? 'Actif' : 'Inactif');
            logger.info('📊 Détails:', {
                userServices,
                userSubscription,
                enterpriseService,
                subscriptionCancelled,
                hasEnterprise
            });
            
            setHasEnterpriseSubscription(hasEnterprise);
        } catch (error) {
            logger.error('Erreur lors du rafraîchissement:', error);
            setHasEnterpriseSubscription(false);
        }
    };

    const handleHashChange = () => {
        const hash = window.location.hash;
        const urlParams = new URLSearchParams(window.location.search);
        
        // Gérer les paramètres d'URL pour les réponses
        const replyMessageId = urlParams.get('reply');
        const tabParam = urlParams.get('tab');
        
        if (replyMessageId) {
            // Si on a un ID de message à répondre, charger le message et ouvrir le modal
            loadMessageForReply(replyMessageId);
        }
        
        if (tabParam === 'messages') {
            setActiveSection('messages');
        } else if (hash.includes('dashboard/')) {
            const section = hash.split('/')[1];
            setActiveSection(section);
            
            // Rafraîchir l'état de l'abonnement entreprise quand on va sur la section services
            if (section === 'services') {
                refreshEnterpriseSubscription();
            }
        }
    };

    const loadMessageForReply = async (messageId) => {
        try {
            const { data: message, error } = await supabase
                .from('messages')
                .select(`
                    *,
                    machine:machines(name, brand, model, images)
                `)
                .eq('id', messageId)
                .single();

            if (error) {
                logger.error('Erreur chargement message pour réponse:', error);
                return;
            }

            if (message) {
                setSelectedMessageForReply(message);
                setActiveSection('messages');
                // Nettoyer l'URL
                const newUrl = window.location.pathname + '#dashboard/messages';
                window.history.replaceState({}, '', newUrl);
            }
        } catch (error) {
            logger.error('Erreur lors du chargement du message:', error);
        }
    };

    const handleLogout = async () => {
        try {
            await logoutUser();
            window.location.href = '/';
        } catch (error) {
            logger.error('Erreur lors de la déconnexion:', error);
            window.location.href = '/';
        }
    };

    // RÉSILIATION RÉELLE : on demande au SERVEUR d'annuler l'abonnement Paddle
    // (Edge Function paddle-cancel → API Paddle, prise d'effet en fin de période).
    // L'ancienne version ne faisait qu'effacer des drapeaux localStorage : le
    // client croyait avoir résilié alors que Paddle continuait de facturer.
    const [cancelInProgress, setCancelInProgress] = useState(false);
    const handleCancelSubscription = async () => {
        if (cancelInProgress) return;
        if (!confirm("Résilier votre abonnement ? Votre accès restera actif jusqu'à la fin de la période déjà payée, puis ne sera pas renouvelé.")) {
            return;
        }
        setCancelInProgress(true);
        try {
            const { data, error } = await supabase.functions.invoke('paddle-cancel');
            if (!error && data?.ok) {
                window.dispatchEvent(new Event('subscriptionRefreshRequested'));
                toast("✅ Résiliation enregistrée : plus aucun prélèvement. Votre accès reste actif jusqu'à la fin de la période payée.");
                return;
            }
            if (data?.reason === 'no_paddle_subscription') {
                toast("Votre accès actuel ne provient pas d'un prélèvement par carte (code promo…) : il expirera simplement à sa date de fin, sans reconduction.");
                return;
            }
            logger.error('paddle-cancel:', error || data);
            toast("La résiliation en ligne est momentanément indisponible. Contactez le support — aucune reconduction ne sera faite sans votre accord.");
        } catch (e) {
            logger.error('paddle-cancel:', e);
            toast('La résiliation en ligne est momentanément indisponible. Contactez le support.');
        } finally {
            setCancelInProgress(false);
        }
    };

    const handleActivateSubscription = (type) => {
        // Afficher la page de paiement
        logger.info(`💰 Abonnement ${type} sélectionné - affichage page de paiement`);
        
        setSelectedPlanForPayment(type);
        setShowPaymentPage(true);
        setPaymentMethod('card');
        setPromoCode('');
    };

    const formatNumber = (num) => {
        return num ? num.toLocaleString() : '0';
    };

    const getBarWidth = (value, maxValue) => {
        if (!maxValue || maxValue === 0) return 0;
        return Math.min((value / maxValue) * 100, 100);
    };

    const markMessageAsRead = async (messageId) => {
        try {
            const { error } = await supabase
                .from('messages')
                .update({ status: 'read' })
                .eq('id', messageId);

            if (error) {
                logger.error('Erreur lors du marquage comme lu:', error);
                return;
            }

            // Mettre à jour l'état local
            setMessages(prev => 
                prev.map(msg => 
                    msg.id === messageId ? { ...msg, status: 'read' } : msg
                )
            );

            logger.info('✅ Message marqué comme lu');
        } catch (error) {
            logger.error('Erreur lors du marquage comme lu:', error);
        }
    };

    const handleReplyToMessage = (message) => {
        setSelectedMessageForReply(message);
        setReplyText('');
    };

    const handleSendReply = async () => {
        if (!replyText.trim() || !selectedMessageForReply) return;

        setIsSendingReply(true);
        try {
            // Obtenir l'utilisateur actuel
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) {
                throw new Error('Utilisateur non connecté');
            }

            // 1. Sauvegarder la réponse dans la base de données
            const { data: replyData, error: replyError } = await supabase
                .from('messages')
                .insert({
                    sender_email: user.email, // L'utilisateur actuel
                    sender_name: user.user_metadata?.full_name || 'Utilisateur',
                    recipient_email: selectedMessageForReply.sender_email, // L'expéditeur original
                    subject: `Réponse - ${selectedMessageForReply.subject || 'Demande d\'information'}`,
                    message: replyText,
                    parent_message_id: selectedMessageForReply.id,
                    status: 'new'
                })
                .select()
                .single();

            if (replyError) throw replyError;

            // 2. Envoyer l'email de réponse via la fonction Edge
            const { error: emailError } = await supabase.functions.invoke('send-contact-email', {
                body: {
                    to: selectedMessageForReply.sender_email,
                    from: 'contact@minegrid-equipment.com',
                    subject: `Réponse - ${selectedMessageForReply.subject || 'Demande d\'information'}`,
                    html: `
                        <h2>Réponse à votre demande</h2>
                        <p><strong>Message original :</strong></p>
                        <p>${selectedMessageForReply.message}</p>
                        <hr>
                        <p><strong>Notre réponse :</strong></p>
                        <p>${replyText.replace(/\n/g, '<br>')}</p>
                        <hr>
                        <p>Cordialement,<br>L'équipe Minegrid Équipement</p>
                    `,
                    verifiedReplyToOriginalMessageId: selectedMessageForReply.id,
                    messageId: replyData.id
                }
            });

            // 3. Créer une notification interne
            const { error: notificationError } = await supabase
                .from('notifications')
                .insert({
                    user_email: selectedMessageForReply.sender_email,
                    title: 'Nouvelle réponse reçue',
                    message: `Vous avez reçu une réponse à votre message "${selectedMessageForReply.subject || 'Demande d\'information'}"`,
                    type: 'message_reply',
                    data: {
                        original_message_id: selectedMessageForReply.id,
                        reply_message_id: replyData.id,
                        sender_email: user.email,
                        sender_name: user.user_metadata?.full_name || 'Utilisateur'
                    },
                    read: false
                });

            // 4. Mettre à jour le statut du message original
            const { error: updateError } = await supabase
                .from('messages')
                .update({ status: 'replied' })
                .eq('id', selectedMessageForReply.id);

            // 5. Mettre à jour le statut de la réponse
            if (replyData.id) {
                await supabase
                    .from('messages')
                    .update({
                        status: emailError ? 'failed' : 'sent',
                        sent_at: emailError ? null : new Date().toISOString(),
                        error_message: emailError ? emailError.message : null
                    })
                    .eq('id', replyData.id);
            }

            if (replyError) throw replyError;
            if (emailError) logger.error('Erreur email:', emailError);
            if (notificationError) logger.error('Erreur notification:', notificationError);
            if (updateError) logger.error('Erreur mise à jour:', updateError);

            // Succès
            setReplyText('');
            setSelectedMessageForReply(null);
            loadDashboardData(); // Recharger les données
            
            // Afficher notification de succès
            if (emailError) {
                toast('Réponse sauvegardée mais erreur d\'envoi email. Le destinataire recevra une notification interne.');
            } else {
                toast('Réponse envoyée avec succès !');
            }

        } catch (error) {
            logger.error('Erreur lors de l\'envoi de la réponse:', error);
            toast('Erreur lors de l\'envoi de la réponse');
        } finally {
            setIsSendingReply(false);
        }
    };

    const weeklyViewValues = (Array.isArray(weeklyData) ? weeklyData : []).map((entry) => {
        if (typeof entry === 'number') {
            return Number.isFinite(entry) ? entry : 0;
        }
        if (entry && typeof entry === 'object') {
            const views = Number(entry.views ?? 0);
            return Number.isFinite(views) ? views : 0;
        }
        return 0;
    });
    const maxWeeklyViews = Math.max(1, ...weeklyViewValues);

    // Fonctions pour la page de paiement
    const handlePaymentMethodChange = (method) => {
        setPaymentMethod(method);
    };

    const handlePromoCodeValidation = async () => {
        const code = (promoCode || '').trim();
        if (!code) {
            toast('Entrez un code promo.');
            return;
        }
        await activateSubscriptionWithPromo(code);
    };

    // Validation + activation 100% CÔTÉ SERVEUR via la RPC SECURITY DEFINER
    // redeem_promo_code (migration p15). Le code n'est jamais dans le bundle
    // (table promo_codes non lisible par le client), l'activation ne peut pas être
    // falsifiée (pro_clients est verrouillée côté client par p14), et le code est
    // limité (usages / durée / 1 par compte). Le serveur décide du plan accordé.
    const activateSubscriptionWithPromo = async (code) => {
        try {
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) {
                throw new Error('Utilisateur non connecté');
            }

            const { data, error } = await supabase.rpc('redeem_promo_code', { p_code: code });
            if (error) {
                logger.error('redeem_promo_code:', error);
                toast('Impossible de valider le code pour le moment. Réessayez.');
                return;
            }
            if (!data?.ok) {
                toast(`❌ ${data?.error || 'Code promo invalide'}`);
                return;
            }

            const plan = data.subscription_type;
            // Invalide le cache useSubscription : sinon les gardes de route
            // servent l'état pré-activation pendant jusqu'à 60 s.
            window.dispatchEvent(new Event('subscriptionRefreshRequested'));
            setHasActiveSubscription(true);
            setSubscriptionType(normalizeSubscriptionType(plan));
            setAccountItem(accountId, 'userSubscription', plan);
            setAccountItem(accountId, 'tempHasActiveSubscription', 'true');
            setAccountItem(accountId, 'tempSubscription', plan);
            removeAccountItem(accountId, 'subscriptionCancelled');

            if (plan === 'enterprise') {
                setHasEnterpriseSubscription(true);
                setAccountItem(accountId, 'userSubscription', 'enterprise');
                setAccountItem(accountId, 'enterpriseService', 'true');
                setAccountItem(accountId, 'userServices', 'enterprise');
                setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('enterpriseSubscriptionActivated', {
                        detail: { planType: 'enterprise', source: 'promo' }
                    }));
                }, 100);
            }

            setShowPaymentPage(false);
            toast(`✅ Abonnement ${planDisplayName(plan)} activé grâce au code promo !`);

            if (plan === 'enterprise') {
                window.location.hash = '#dashboard-entreprise';
            } else {
                setActiveSection('overview');
            }
        } catch (error) {
            logger.error('Erreur activation abonnement promo:', error);
            toast('Erreur lors de l\'activation de l\'abonnement');
        }
    };

    const handlePaidCheckoutSuccess = () => {
        setHasActiveSubscription(true);
        setSubscriptionType(normalizeSubscriptionType(selectedPlanForPayment));
        
        // Mettre à jour l'état de l'abonnement entreprise
        if (selectedPlanForPayment === 'enterprise') {
            setHasEnterpriseSubscription(true);
            // Sauvegarder (par compte)
            setAccountItem(accountId, 'userSubscription', 'enterprise');
            setAccountItem(accountId, 'enterpriseService', 'true');
            setAccountItem(accountId, 'userServices', 'enterprise');
            removeAccountItem(accountId, 'subscriptionCancelled');
            logger.info('✅ Abonnement entreprise activé');
            
            // Déclencher l'événement d'activation
            setTimeout(() => {
                window.dispatchEvent(new CustomEvent('enterpriseSubscriptionActivated', {
                    detail: { planType: 'enterprise' }
                }));
                logger.info('🎉 Événement enterpriseSubscriptionActivated déclenché après paiement');
            }, 100);
        }
        
        setShowPaymentPage(false);
        setActiveSection('overview');
        toast('✅ Paiement réussi ! Votre abonnement est maintenant actif.');
    };

    const handlePaidCheckoutError = (error) => {
        logger.error('Erreur paiement:', error);
        toast(`Erreur lors du paiement: ${error}`);
    };

    // Grille tarifaire : SOURCE UNIQUE src/config/plans.ts (codes internes —
    // attention, le code 'pro' s'affiche « Premium » et 'premium' s'affiche « Pro »).
    const getPlanPrice = (planType) => planPriceUsd(planType);

    // Rang du plan effectif (normalise la variante historique 'entreprise') —
    // sert au déverrouillage par palier de la section « Services ».
    const effectivePlanRank = PLAN_RANK[normalizePlanId(subscriptionType) ?? 'basic'] ?? 0;

    // Fonction pour sauvegarder la configuration du tableau de bord
    const handleSaveDashboard = () => {
        // Sauvegarder la configuration actuelle
        const dashboardConfig = {
            hasActiveSubscription,
            subscriptionType,
            lastSaved: new Date().toISOString(),
            version: '1.0'
        };
        
        setAccountItem(accountId, 'dashboardConfig', JSON.stringify(dashboardConfig));
        setAccountItem(accountId, 'dashboardConfigured', 'true');
        
        logger.info('✅ Configuration du tableau de bord sauvegardée');
        toast('✅ Configuration du tableau de bord sauvegardée avec succès !');
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="mb-6 flex items-center gap-2 text-sm text-gray-600">
                  <span>Votre niveau de confiance :</span>
                  <MyTrustInline />
                </div>
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold bg-gradient-to-r from-orange-600 to-orange-800 bg-clip-text text-transparent">
                            {(!hasActiveSubscription || subscriptionType === 'gratuit') ? 'Vue d\'ensemble' : 'Mon espace'}
                        </h1>
                        <p className="text-gray-600 mt-2 text-lg">
                            Bienvenue{userName ? `, ${userName}` : ''}
                        </p>
                        <nav className="flex mt-3" aria-label="Breadcrumb">
                            <ol className="flex items-center space-x-2">
                                <li>
                                    <a href="#" className="text-orange-600 hover:text-orange-700 font-medium">
                                        Accueil
                                    </a>
                                </li>
                                <ChevronRight className="h-4 w-4 text-orange-400" />
                                <li>
                                    <span className="text-gray-700 font-medium">
                                        {(!hasActiveSubscription || subscriptionType === 'gratuit') ? 'Vue d\'ensemble' : 'Mon espace'}
                                    </span>
                                </li>
                            </ol>
                        </nav>
                    </div>
                    <div className="flex items-center space-x-3">
                        {hasActiveSubscription && subscriptionType !== 'gratuit' && (
                            <button
                                onClick={handleSaveDashboard}
                                className="inline-flex items-center px-4 py-2 border border-orange-300 rounded-lg text-sm font-medium text-orange-700 bg-orange-50 hover:bg-orange-100 transition-all duration-200"
                            >
                                <Save className="h-4 w-4 mr-2" />
                                Sauvegarder
                            </button>
                        )}
                        <a
                            href="#vendre"
                            className="inline-flex items-center px-6 py-3 border border-transparent rounded-lg shadow-lg text-sm font-medium text-white bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 transform hover:scale-105 transition-all duration-200"
                        >
                            <Plus className="h-5 w-5 mr-2" />
                            Nouvelle annonce
                        </a>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    {/* Sidebar */}
                    <div className="lg:col-span-1">
                        <div className="bg-white rounded-xl shadow-lg p-6 space-y-6 border border-orange-100">
                            <div className="flex items-center space-x-4">
                                <div className="h-14 w-14 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shadow-lg">
                                    <User className="h-7 w-7 text-white" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900">Vendeur connecté</h3>
                                    <p className="text-sm text-orange-600 font-medium">Profil professionnel</p>
                                </div>
                            </div>

                            <nav className="space-y-2">
                                {navigation.map((item) => {
                                    const Icon = item.icon;
                                    return (
                                        <a
                                            key={item.name}
                                            href={item.href}
                                            className={`flex items-center px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                                                (activeSection === 'overview' && (item.name === 'Vue d\'ensemble' || item.name === 'Tableau de bord' || item.name === 'Mon espace')) || 
                                                (activeSection === item.name.toLowerCase().replace(' ', '').replace('\'', ''))
                                                    ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-md'
                                                    : 'text-gray-700 hover:bg-gradient-to-r hover:from-orange-50 hover:to-orange-100 hover:text-orange-700'
                                            }`}
                                        >
                                            <Icon className="h-5 w-5 mr-3" />
                                            {item.name === 'Tableau de bord' ? 'Mon espace' : item.name}
                                        </a>
                                    );
                                })}
                                <button
                                    onClick={handleLogout}
                                    className="flex items-center w-full px-4 py-3 rounded-lg text-sm font-medium text-red-600 hover:bg-gradient-to-r hover:from-red-50 hover:to-red-100 transition-all duration-200"
                                >
                                    <LogOut className="h-5 w-5 mr-3" />
                                    Déconnexion
                                </button>
                            </nav>
                        </div>
                    </div>

                    {/* Main Content */}
                    <div className="lg:col-span-3 space-y-6">
                        {/* Vue d'ensemble */}
                        {activeSection === 'overview' && (
                            <div className="space-y-6">
                                {/* Statistiques */}
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                    <div className="bg-white rounded-xl shadow-lg p-6 border border-orange-100 hover:shadow-xl transition-shadow">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-sm font-medium text-gray-600">Total des annonces</p>
                                                <p className="text-2xl font-bold text-gray-900">{machines.length}</p>
                                                {/* (ancien « +12% ce mois » supprimé : pourcentage codé en dur, faux) */}
                                            </div>
                                            <div className="h-12 w-12 bg-gradient-to-br from-orange-400 to-orange-600 rounded-lg flex items-center justify-center">
                                                <Package className="h-6 w-6 text-white" />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-white rounded-xl shadow-lg p-6 border border-orange-100 hover:shadow-xl transition-shadow">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-sm font-medium text-gray-600">Vues totales</p>
                                                <p className="text-2xl font-bold text-gray-900">
                                                    {stats ? formatNumber(stats.totalViews) : '0'}
                                                </p>
                                                <p className={`text-xs mt-1 ${stats?.weeklyGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                    {stats?.weeklyGrowth >= 0 ? '+' : ''}{stats?.weeklyGrowth || 0}% cette semaine
                                                </p>
                                            </div>
                                            <div className="h-12 w-12 bg-gradient-to-br from-orange-400 to-orange-600 rounded-lg flex items-center justify-center">
                                                <Eye className="h-6 w-6 text-white" />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-white rounded-xl shadow-lg p-6 border border-orange-100 hover:shadow-xl transition-shadow cursor-pointer" onClick={() => setActiveSection('messages')}>
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-sm font-medium text-gray-600">Messages reçus</p>
                                                <p className="text-2xl font-bold text-gray-900">
                                                    {messages.length}
                                                </p>
                                                <p className="text-xs text-orange-600 mt-1">
                                                    {messages.filter(m => m.status === 'new').length} nouveau{messages.filter(m => m.status === 'new').length > 1 ? 'x' : ''}
                                                </p>
                                            </div>
                                            <div className="h-12 w-12 bg-gradient-to-br from-orange-400 to-orange-600 rounded-lg flex items-center justify-center">
                                                <MessageSquare className="h-6 w-6 text-white" />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-white rounded-xl shadow-lg p-6 border border-orange-100 hover:shadow-xl transition-shadow">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-sm font-medium text-gray-600">Offres reçues</p>
                                                <p className="text-2xl font-bold text-gray-900">
                                                    {stats ? formatNumber(stats.totalOffers) : '0'}
                                                </p>
                                                <p className="text-xs text-green-600 mt-1">
                                                    {offers.filter(o => o.status === 'pending').length} en attente
                                                </p>
                                            </div>
                                            <div className="h-12 w-12 bg-gradient-to-br from-orange-400 to-orange-600 rounded-lg flex items-center justify-center">
                                                <DollarSign className="h-6 w-6 text-white" />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {(!hasActiveSubscription || subscriptionType === 'gratuit') ? (
                                    // Vue simplifiée pour les abonnements gratuits
                                    <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-6 border border-orange-200">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-lg font-semibold text-gray-900">Votre abonnement</h3>
                                            <span className="px-3 py-1 bg-gray-500 text-white text-xs font-medium rounded-full">
                                                Gratuit
                                            </span>
                                        </div>
                                        <div className="space-y-3">
                                            <div className="flex items-center text-sm">
                                                <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                                                <span className="text-gray-700">Jusqu'à 3 images par annonce</span>
                                            </div>
                                            <div className="flex items-center text-sm">
                                                <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                                                <span className="text-gray-700">Support par email</span>
                                            </div>
                                            <div className="flex items-center text-sm">
                                                <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                                                <span className="text-gray-700">Statistiques de base</span>
                                            </div>
                                        </div>
                                        <div className="mt-4 pt-4 border-t border-orange-200">
                                            <button
                                                onClick={() => setActiveSection('abonnement')}
                                                className="w-full px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-all duration-200 font-medium"
                                            >
                                                Passer à un abonnement payant
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    // Vue complète pour les abonnements payants
                                    <>
                                        {/* Abonnement dynamique selon le type */}
                                        <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-6 border border-orange-200">
                                            <div className="flex items-center justify-between mb-4">
                                                <h3 className="text-lg font-semibold text-gray-900">Votre abonnement</h3>
                                                <span className="px-3 py-1 bg-orange-500 text-white text-xs font-medium rounded-full">
                                                    {planDisplayName(subscriptionType)}
                                                </span>
                                            </div>
                                            {/* Fonctionnalités du plan : SOURCE UNIQUE src/config/plans.ts
                                                (getPaidPlan normalise aussi la variante 'entreprise'). */}
                                            <div className="space-y-3">
                                                {(getPaidPlan(subscriptionType)?.features ?? []).map((feature) => (
                                                    <div key={feature} className="flex items-center text-sm">
                                                        <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                                                        <span className="text-gray-700">{feature}</span>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="mt-4 pt-4 border-t border-orange-200">
                                                <p className="text-xs text-gray-600 mb-3">
                                                    {formatDateFr(subscriptionEndsAt)
                                                        ? `Renouvellement automatique le ${formatDateFr(subscriptionEndsAt)}`
                                                        : 'Abonnement actif'}
                                                </p>
                                                {(subscriptionType === 'premium' || subscriptionType === 'pro' || subscriptionType === 'entreprise') && (
                                                    <button
                                                        onClick={() => {
                                                            // Logique de redirection selon le type d'abonnement
                                                            switch (subscriptionType) {
                                                                case 'premium':
                                                                    // Palier interne 'premium' = plan vendu « Pro » (50 $)
                                                                    logger.info('🚀 Redirection vers l\'espace du plan Pro');
                                                                    window.location.href = '/#premium-dashboard';
                                                                    break;
                                                                case 'pro':
                                                                    logger.info('🚀 Redirection vers tableau de bord pro');
                                                                    window.location.href = '/#pro';
                                                                    break;
                                                                case 'entreprise':
                                                                    {
                                                                    const isConfigured = getAccountItem(accountId, 'enterpriseDashboardConfigured');
                                                                    const activeMetier = getAccountItem(accountId, 'lastActiveMetier') || 'vendeur';
                                                                    const metierConfig = getAccountItem(accountId, `enterpriseDashboardConfig_${activeMetier}`);
                                                                    const generalConfig = getAccountItem(accountId, 'enterpriseDashboardConfig');
                                                                    
                                                                    logger.info('🔍 Debug configuration entreprise:', {
                                                                        isConfigured,
                                                                        activeMetier,
                                                                        metierConfig: !!metierConfig,
                                                                        generalConfig: !!generalConfig
                                                                    });
                                                                    
                                                                    if (isConfigured === 'true' && (metierConfig || generalConfig)) {
                                                                        logger.info('✅ Tableau de bord configuré - redirection vers affichage');
                                                                        window.location.href = '/#dashboard-entreprise-display';
                                                                    } else {
                                                                        logger.info('🚀 Tableau de bord non configuré - redirection vers configuration');
                                                                        window.location.href = '/#dashboard-entreprise';
                                                                    }
                                                                    }
                                                                    break;
                                                                default:
                                                                    // Par défaut, rediriger vers la configuration
                                                                    logger.info('🚀 Aucun abonnement détecté - redirection vers configuration');
                                                                    window.location.href = '/#dashboard-entreprise';
                                                                    break;
                                                            }
                                                        }}
                                                        className="w-full px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-all duration-200 font-medium flex items-center justify-center"
                                                    >
                                                        <Shield className="h-4 w-4 mr-2" />
                                                        Accéder à mon service
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Activité récente et Annonces récentes */}
                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                            {/* Activité récente */}
                                            <div className="bg-white rounded-xl shadow-lg p-6 border border-orange-100">
                                                <h3 className="text-lg font-semibold text-gray-900 mb-4">Activité récente</h3>
                                                <div className="space-y-4">
                                                    <div className="flex items-center justify-between text-sm">
                                                        <span className="text-gray-600">Vues cette semaine</span>
                                                        <span className="font-medium text-gray-900">
                                                            {weeklyViewValues.reduce((sum, views) => sum + views, 0)}
                                                        </span>
                                                    </div>
                                                    <div className="space-y-2">
                                                        {weekDays.map((day, index) => {
                                                            const dayViews = weeklyViewValues[index] || 0;
                                                            return (
                                                                <div key={day} className="flex items-center space-x-3">
                                                                    <span className="text-xs text-gray-500 w-8">{day}</span>
                                                                    <div className="flex-1 bg-gray-200 rounded-full h-2">
                                                                        <div
                                                                            className="bg-gradient-to-r from-orange-400 to-orange-600 h-2 rounded-full transition-all duration-300"
                                                                            style={{ width: `${getBarWidth(dayViews, maxWeeklyViews)}%` }}
                                                                        ></div>
                                                                    </div>
                                                                    <span className="text-xs text-gray-600 w-8 text-right">{dayViews}</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Annonces récentes */}
                                            <div className="bg-white rounded-xl shadow-lg p-6 border border-orange-100">
                                                <h3 className="text-lg font-semibold text-gray-900 mb-4">Annonces récentes</h3>
                                                <div className="space-y-3">
                                                    {machines.slice(0, 3).map((machine) => (
                                                        <div key={machine.id} className="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-50 transition-colors">
                                                            <div className="h-8 w-8 bg-gradient-to-br from-orange-400 to-orange-600 rounded-lg flex items-center justify-center">
                                                                <Package className="h-4 w-4 text-white" />
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-sm font-medium text-gray-900 truncate">{machine.title}</p>
                                                                <p className="text-xs text-gray-500">{machine.category}</p>
                                                            </div>
                                                            <span className="text-xs text-gray-400">{machine.created_at}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Support */}
                                        <div className="bg-white rounded-xl shadow-lg p-6 border border-orange-100">
                                            <h3 className="text-lg font-semibold text-gray-900 mb-4">Support</h3>
                                            <a
                                                href="#contact"
                                                className="flex items-center justify-center p-4 rounded-lg border border-orange-200 hover:bg-orange-50 transition-colors"
                                            >
                                                <MessageSquare className="h-6 w-6 text-orange-600 mr-3" />
                                                <span className="text-sm font-medium text-gray-700">Contacter le support</span>
                                            </a>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {/* Page d'abonnement */}
                        {activeSection === 'abonnement' && (
                            <div className="bg-white p-8 rounded-xl shadow-lg border border-orange-100">
                                <h2 className="text-2xl font-semibold mb-6 bg-gradient-to-r from-orange-600 to-orange-800 bg-clip-text text-transparent">
                                    Mon abonnement
                                </h2>
                                
                                {hasActiveSubscription ? (
                                    <>
                                        <div className="mb-6 p-6 bg-gradient-to-r from-orange-50 to-orange-100 rounded-xl border border-orange-200">
                                            <p className="mb-4 text-lg">
                                                Vous êtes actuellement sur l'offre{' '}
                                                <span className="text-orange-700 font-bold">{planDisplayName(subscriptionType)}</span>.
                                            </p>
                                            {/* Fonctionnalités : SOURCE UNIQUE src/config/plans.ts. */}
                                            <ul className="list-disc pl-6 text-gray-700 space-y-2">
                                                {(getPaidPlan(subscriptionType)?.features ?? []).map((feature) => (
                                                    <li key={feature}>{feature}</li>
                                                ))}
                                            </ul>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                                                <h4 className="font-semibold text-green-800 mb-2">Statut de l'abonnement</h4>
                                                <p className="text-sm text-green-700">
                                                    {formatDateFr(subscriptionEndsAt)
                                                        ? `Actif jusqu'au ${formatDateFr(subscriptionEndsAt)}`
                                                        : 'Actif'}
                                                </p>
                                            </div>
                                            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                                <h4 className="font-semibold text-blue-800 mb-2">Prochain paiement</h4>
                                                <p className="text-sm text-blue-700">
                                                    {formatDateFr(subscriptionEndsAt) ? `${formatDateFr(subscriptionEndsAt)} — ` : ''}
                                                    {`${planPriceUsd(subscriptionType)} USD/mois (plan ${planDisplayName(subscriptionType)})`}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex flex-col sm:flex-row gap-4">
                                            <button
                                                onClick={() => void handleCancelSubscription()}
                                                disabled={cancelInProgress}
                                                className="px-6 py-3 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-all duration-200 transform hover:scale-105 shadow-lg font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                                            >
                                                {cancelInProgress ? 'Résiliation en cours…' : 'Résilier mon abonnement'}
                                            </button>
                                            <button
                                                onClick={() => window.location.hash = '#contact'}
                                                className="px-6 py-3 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-all duration-200 transform hover:scale-105 shadow-lg font-medium"
                                            >
                                                Contacter le support
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    // Affichage des offres d'abonnement — grille SOURCE UNIQUE
                                    // src/config/plans.ts (les `internalId` sont les codes base de
                                    // données : 'pro' s'affiche « Premium », 'premium' « Pro »).
                                    <div className="space-y-6">
                                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                            {PAID_PLANS.map((plan) => (
                                                <div key={plan.internalId} className="bg-white rounded-xl shadow-lg p-6 border border-orange-200 relative flex flex-col">
                                                    {plan.popular && (
                                                        <div className="absolute -top-2 left-1/2 transform -translate-x-1/2">
                                                            <span className="px-3 py-1 bg-orange-500 text-white text-xs font-medium rounded-full">
                                                                Populaire
                                                            </span>
                                                        </div>
                                                    )}
                                                    <div className="text-center pt-4 flex flex-col flex-1">
                                                        <h3 className="text-xl font-semibold text-gray-900 mb-1">{plan.displayName}</h3>
                                                        <p className="text-sm text-gray-500 mb-2">{plan.tagline}</p>
                                                        <div className="text-3xl font-bold text-orange-600 mb-4">{plan.priceUsd} USD<span className="text-lg text-gray-500">/mois</span></div>
                                                        <ul className="text-sm text-gray-600 space-y-2 mb-6 text-left flex-1">
                                                            {plan.features.map((feature) => (
                                                                <li key={feature}>• {feature}</li>
                                                            ))}
                                                            <li>• {plan.maxUsers > 1 ? `${plan.maxUsers} utilisateurs` : '1 utilisateur'}</li>
                                                        </ul>
                                                        <div className="space-y-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleActivateSubscription(plan.internalId)}
                                                                className="w-full px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-all duration-200 font-medium"
                                                            >
                                                                Choisir {plan.displayName}
                                                            </button>
                                                            {plan.internalId === 'enterprise' && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => (window.location.hash = '#contact')}
                                                                    className="w-full px-4 py-2 bg-white text-orange-600 border border-orange-300 rounded-lg hover:bg-orange-50 transition-all duration-200 font-medium text-sm"
                                                                >
                                                                    Contacter un conseiller (sur mesure)
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Autres sections */}
                        {activeSection === 'annonces' && (
                            <div className="bg-white rounded-xl shadow-lg p-6 border border-orange-100">
                                <div className="flex items-center justify-between mb-6">
                                    <h3 className="text-xl font-semibold bg-gradient-to-r from-orange-600 to-orange-800 bg-clip-text text-transparent">
                                        Mes Annonces
                                    </h3>
                                    <div className="flex items-center space-x-3">
                                        <button
                                            onClick={loadMachines}
                                            disabled={loading}
                                            className="p-2 text-gray-500 hover:text-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                            title="Rafraîchir les annonces"
                                        >
                                            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                                        </button>
                                        <a
                                            href="#vendre"
                                            className="text-orange-600 hover:text-orange-700 text-sm font-medium hover:underline"
                                        >
                                            Nouvelle annonce
                                        </a>
                                    </div>
                                </div>

                                {loading ? (
                                    <div className="text-center py-8">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600 mx-auto"></div>
                                        <p className="text-sm text-gray-500 mt-2">Chargement...</p>
                                    </div>
                                ) : machines.length > 0 ? (
                                    <div className="space-y-4">
                                        {machines.slice(0, 5).map((machine) => (
                                            <div key={machine.id} className="flex items-center space-x-3 p-3 rounded-lg hover:bg-orange-50 transition-colors">
                                                <div className="h-10 w-10 bg-gradient-to-br from-orange-400 to-orange-600 rounded-lg flex items-center justify-center">
                                                    <Package className="h-5 w-5 text-white" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-gray-900 truncate">{machine.name}</p>
                                                    <p className="text-xs text-gray-500">{machine.brand}</p>
                                                    <p className="text-xs text-orange-600 font-medium">{machine.price} €</p>
                                                </div>
                                                <a
                                                    href={`#machines/${machine.id}`}
                                                    className="text-xs text-orange-600 hover:text-orange-700 font-medium hover:underline"
                                                >
                                                    Voir
                                                </a>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-8">
                                        <div className="h-12 w-12 bg-gray-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                                            <Package className="h-6 w-6 text-gray-400" />
                                        </div>
                                        <p className="text-sm text-gray-500 mb-3">Aucune annonce publiée</p>
                                        <a
                                            href="#vendre"
                                            className="inline-flex items-center px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors"
                                        >
                                            <Plus className="h-4 w-4 mr-2" />
                                            Publier une annonce
                                        </a>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeSection === 'services' && (
                            <div className="bg-white rounded-xl shadow-lg p-6 border border-orange-100">
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-xl font-semibold text-gray-900 bg-gradient-to-r from-orange-600 to-orange-800 bg-clip-text text-transparent">
                                        Services inclus dans les plans
                                    </h3>
                                </div>
                                {/* Généré depuis la SOURCE UNIQUE src/config/plans.ts : chaque colonne
                                    liste les fonctionnalités réellement vendues. Déverrouillage par rang
                                    (un plan supérieur inclut les colonnes des plans inférieurs) —
                                    l'ancienne version listait des services de l'ANCIENNE grille
                                    (images par annonce, visibilité…) qui ne correspondaient plus à l'offre. */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                    {PAID_PLANS.map((plan) => {
                                        const unlocked = hasActiveSubscription && effectivePlanRank >= PLAN_RANK[plan.internalId];
                                        return (
                                            <div key={plan.internalId} className="space-y-4">
                                                <h4 className="font-semibold text-gray-900 border-b border-orange-200 pb-3 text-lg">
                                                    Services {plan.displayName}
                                                    <span className="block text-xs font-normal text-gray-500 mt-1">{plan.tagline} · {plan.priceUsd} USD/mois</span>
                                                </h4>
                                                <div className="space-y-4">
                                                    {plan.features.filter((f) => !f.startsWith('Tout le plan')).map((feature) => (
                                                        <div key={feature} className="flex items-center p-4 bg-gradient-to-r from-orange-50 via-orange-100 to-orange-200 rounded-xl border border-orange-300 shadow-sm">
                                                            <div className="w-4 h-4 bg-gradient-to-r from-orange-200 to-orange-400 rounded-full mr-4 shadow-sm"></div>
                                                            <div className="flex-1">
                                                                <h5 className="font-semibold text-orange-900">{feature}</h5>
                                                            </div>
                                                            <span className={`text-xs px-3 py-1 rounded-full ${
                                                                unlocked ? 'bg-orange-500 text-white' : 'bg-gray-500 text-white'
                                                            }`}>
                                                                {unlocked ? 'Actif' : 'Verrouillé'}
                                                            </span>
                                                        </div>
                                                    ))}
                                                    {!unlocked && (
                                                        <a href="#tarifs" className="block text-center text-sm text-orange-700 font-medium hover:underline">
                                                            Débloquer avec le plan {plan.displayName} →
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {activeSection === 'messages' && (
                            <div className="bg-white rounded-xl shadow-lg p-6 border border-orange-100">
                                <div className="flex items-center justify-between mb-6">
                                    <h3 className="text-xl font-semibold bg-gradient-to-r from-orange-600 to-orange-800 bg-clip-text text-transparent">
                                        Messages reçus
                                    </h3>
                                    <div className="flex items-center space-x-4">
                                        <span className="text-sm text-gray-500">
                                            {messages.length} message{messages.length > 1 ? 's' : ''}
                                        </span>
                                        <button 
                                            onClick={loadDashboardData}
                                            className="text-sm text-orange-600 hover:text-orange-800 flex items-center space-x-1"
                                        >
                                            <RefreshCw className="w-4 h-4" />
                                            <span>Actualiser</span>
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    {messages.length > 0 ? (
                                        messages.map((message, index) => (
                                            <div key={message.id || index} className={`flex items-start p-5 rounded-xl border-l-4 shadow-sm hover:shadow-md transition-shadow ${
                                                message.status === 'new' 
                                                    ? 'bg-gradient-to-r from-blue-50 via-orange-100 to-orange-200 border-orange-300' 
                                                    : 'bg-gradient-to-r from-gray-50 via-orange-50 to-orange-100 border-gray-300'
                                            }`}>
                                                <div className="flex-shrink-0">
                                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shadow-md ${
                                                        message.status === 'new' 
                                                            ? 'bg-gradient-to-br from-blue-100 via-orange-200 to-orange-400' 
                                                            : 'bg-gradient-to-br from-gray-100 via-orange-100 to-orange-300'
                                                    }`}>
                                                        <span className="text-orange-700 text-sm font-medium">💬</span>
                                                    </div>
                                                </div>
                                                <div className="ml-4 flex-1">
                                                    <div className="flex items-center justify-between">
                                                        <div>
                                                            <h4 className="text-sm font-semibold text-orange-900">
                                                                {message.sender_name || 'Prospect'}
                                                            </h4>
                                                            <p className="text-xs text-gray-500">
                                                                {message.sender_email}
                                                            </p>
                                                        </div>
                                                        <div className="flex items-center space-x-2">
                                                            {message.status === 'new' && (
                                                                <span className="text-xs bg-orange-500 text-white px-2 py-1 rounded-full">
                                                                    Nouveau
                                                                </span>
                                                            )}
                                                            <span className="text-xs text-orange-600 bg-white px-2 py-1 rounded-full">
                                                                {new Date(message.created_at).toLocaleDateString('fr-FR')}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    
                                                    {message.subject && (
                                                        <p className="text-sm font-medium text-gray-800 mt-2">
                                                            {message.subject}
                                                        </p>
                                                    )}
                                                    
                                                    <p className="text-sm text-orange-700 mt-2">
                                                        {message.message?.length > 150 
                                                            ? `${message.message.substring(0, 150)}...` 
                                                            : message.message
                                                        }
                                                    </p>
                                                    
                                                    {message.machine && (
                                                        <div className="mt-2 p-2 bg-orange-50 rounded-lg">
                                                            <p className="text-xs text-orange-600">
                                                                <strong>Équipement :</strong> {message.machine.name || `${message.machine.brand} ${message.machine.model}`}
                                                            </p>
                                                        </div>
                                                    )}
                                                    
                                                    <div className="flex items-center mt-3 space-x-2">
                                                        <button 
                                                            onClick={() => window.open(`/machine/${message.machine_id}`, '_blank')}
                                                            className="text-xs bg-blue-500 text-white px-3 py-1 rounded-full hover:bg-blue-600 transition-colors"
                                                        >
                                                            Voir l'équipement
                                                        </button>
                                                        <button 
                                                            onClick={() => handleReplyToMessage(message)}
                                                            className="text-xs bg-green-500 text-white px-3 py-1 rounded-full hover:bg-green-600 transition-colors"
                                                        >
                                                            Répondre
                                                        </button>
                                                        {message.status === 'new' && (
                                                            <button 
                                                                onClick={() => markMessageAsRead(message.id)}
                                                                className="text-xs bg-gray-500 text-white px-3 py-1 rounded-full hover:bg-gray-600 transition-colors"
                                                            >
                                                                Marquer comme lu
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center py-8">
                                            <div className="text-gray-400 text-6xl mb-4">💬</div>
                                            <h3 className="text-lg font-medium text-gray-900 mb-2">Aucun message</h3>
                                            <p className="text-gray-500">Vous n'avez pas encore reçu de messages.</p>
                                            <p className="text-sm text-gray-400 mt-2">
                                                Les messages apparaîtront ici quand des utilisateurs vous contacteront via vos annonces.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {activeSection === 'notifications' && (
                            <div className="bg-white rounded-xl shadow-lg p-6 border border-orange-100">
                                <div className="flex items-center justify-between mb-6">
                                    <h3 className="text-xl font-semibold bg-gradient-to-r from-orange-600 to-orange-800 bg-clip-text text-transparent">
                                        Notifications
                                    </h3>
                                </div>
                                {/* VRAIES notifications du compte — l'ancienne carte de démonstration
                                    (« Pelle hydraulique CAT 320D il y a 2 heures ») était codée en dur. */}
                                {userNotifications.length === 0 ? (
                                    <div className="text-center py-10 text-gray-500">
                                        <Bell className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                                        <p className="font-medium text-gray-700">Aucune notification pour le moment</p>
                                        <p className="text-sm mt-1">Vous serez averti ici des vues, messages et offres sur vos annonces.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {userNotifications.map((n) => (
                                            <div key={n.id} className="flex items-start p-5 bg-gradient-to-r from-blue-50 via-orange-100 to-orange-200 rounded-xl border-l-4 border-orange-300 shadow-sm">
                                                <div className="flex-shrink-0">
                                                    <div className="w-10 h-10 bg-gradient-to-br from-blue-100 via-orange-200 to-orange-400 rounded-full flex items-center justify-center shadow-md">
                                                        <Bell className="h-4 w-4 text-orange-700" />
                                                    </div>
                                                </div>
                                                <div className="ml-4 flex-1">
                                                    <div className="flex items-center justify-between">
                                                        <h4 className="text-sm font-semibold text-orange-900">{n.title || 'Notification'}</h4>
                                                        {n.created_at && (
                                                            <span className="text-xs text-orange-600 bg-white px-2 py-1 rounded-full">
                                                                {new Date(n.created_at).toLocaleString('fr-FR')}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-sm text-orange-700 mt-2">{n.message || n.content || ''}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {activeSection === 'settings' && (
                            <div className="space-y-6">
                                <div className="bg-white rounded-xl shadow-lg p-6 border border-orange-100">
                                    <div className="flex items-center justify-between mb-6">
                                        <div>
                                            <h2 className="text-2xl font-bold text-gray-900">Paramètres</h2>
                                            <p className="text-gray-600 mt-1">Gérez vos préférences et votre compte</p>
                                        </div>
                                    </div>
                                    <div className="border-b border-gray-200">
                                        <nav className="-mb-px flex space-x-8">
                                            {['profil', 'notifications', 'securite', 'preferences'].map((tab) => (
                                                <button
                                                    key={tab}
                                                    onClick={() => setActiveSettingsTab(tab)}
                                                    className={`py-2 px-1 border-b-2 font-medium text-sm ${
                                                        activeSettingsTab === tab
                                                            ? 'border-orange-500 text-orange-600'
                                                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                                    }`}
                                                >
                                                    {tab === 'profil' && 'Profil'}
                                                    {tab === 'notifications' && 'Notifications'}
                                                    {tab === 'securite' && 'Sécurité'}
                                                    {tab === 'preferences' && 'Préférences'}
                                                </button>
                                            ))}
                                        </nav>
                                    </div>
                                </div>

                                <div className="bg-white rounded-xl shadow-lg p-6 border border-orange-100">
                                    {activeSettingsTab === 'profil' && (
                                        <div className="space-y-6">
                                            <h3 className="text-lg font-semibold text-gray-900 mb-4">Informations personnelles</h3>
                                            {/* Lecture seule : ces champs affichent les VRAIES infos du compte
                                                (métadonnées Supabase). Les rendre modifiables sans sauvegarde
                                                réelle serait trompeur — l'édition viendra avec son enregistrement. */}
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">Prénom</label>
                                                    <input
                                                        type="text"
                                                        readOnly
                                                        value={user?.user_metadata?.first_name || user?.user_metadata?.firstName || '—'}
                                                        className="w-full px-3 py-2 border border-gray-200 bg-gray-50 text-gray-700 rounded-lg"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">Nom</label>
                                                    <input
                                                        type="text"
                                                        readOnly
                                                        value={user?.user_metadata?.last_name || user?.user_metadata?.lastName || '—'}
                                                        className="w-full px-3 py-2 border border-gray-200 bg-gray-50 text-gray-700 rounded-lg"
                                                    />
                                                </div>
                                                <div className="md:col-span-2">
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">Email du compte</label>
                                                    <input
                                                        type="text"
                                                        readOnly
                                                        value={user?.email || '—'}
                                                        className="w-full px-3 py-2 border border-gray-200 bg-gray-50 text-gray-700 rounded-lg"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Modal de réponse */}
            {selectedMessageForReply && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold text-gray-900">
                                    Répondre à {selectedMessageForReply.sender_name}
                                </h3>
                                <button
                                    onClick={() => setSelectedMessageForReply(null)}
                                    className="text-gray-400 hover:text-gray-600"
                                >
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            {/* Message original */}
                            <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                                <h4 className="font-medium text-gray-900 mb-2">Message original :</h4>
                                <p className="text-sm text-gray-700">{selectedMessageForReply.message}</p>
                                <p className="text-xs text-gray-500 mt-2">
                                    De : {selectedMessageForReply.sender_email} - {new Date(selectedMessageForReply.created_at).toLocaleDateString('fr-FR')}
                                </p>
                            </div>

                            {/* Formulaire de réponse */}
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Votre réponse :
                                </label>
                                <textarea
                                    value={replyText}
                                    onChange={(e) => setReplyText(e.target.value)}
                                    placeholder="Tapez votre réponse ici..."
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 resize-none"
                                    rows={6}
                                />
                            </div>

                            {/* Boutons d'action */}
                            <div className="flex justify-end space-x-3">
                                <button
                                    onClick={() => setSelectedMessageForReply(null)}
                                    className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                                    disabled={isSendingReply}
                                >
                                    Annuler
                                </button>
                                <button
                                    onClick={handleSendReply}
                                    disabled={!replyText.trim() || isSendingReply}
                                    className={`px-4 py-2 rounded-lg transition-colors ${
                                        !replyText.trim() || isSendingReply
                                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                            : 'bg-green-500 text-white hover:bg-green-600'
                                    }`}
                                >
                                    {isSendingReply ? (
                                        <div className="flex items-center space-x-2">
                                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                            <span>Envoi...</span>
                                        </div>
                                    ) : (
                                        'Envoyer la réponse'
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Page de paiement */}
            {showPaymentPage && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-2xl font-bold text-gray-900">Finaliser votre abonnement</h2>
                                <button
                                    onClick={() => setShowPaymentPage(false)}
                                    className="text-gray-400 hover:text-gray-600"
                                >
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            <div className="mb-6">
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                    {planDisplayName(selectedPlanForPayment)} - {getPlanPrice(selectedPlanForPayment)} USD/mois
                                </h3>
                            </div>

                            {/* Méthodes de paiement */}
                            <div className="mb-6">
                                <h4 className="text-lg font-medium text-gray-900 mb-4">Choisissez votre méthode de paiement</h4>
                                <div className="space-y-3">
                                    <label className="flex items-center p-4 border rounded-lg cursor-pointer hover:bg-gray-50">
                                        <input
                                            type="radio"
                                            name="paymentMethod"
                                            value="card"
                                            checked={paymentMethod === 'card'}
                                            onChange={() => handlePaymentMethodChange('card')}
                                            className="mr-3"
                                        />
                                        <CreditCard className="h-5 w-5 text-orange-600 mr-3" />
                                        <div>
                                            <div className="font-medium">Carte bancaire</div>
                                            <div className="text-sm text-gray-500">Paiement sécurisé</div>
                                        </div>
                                    </label>
                                    <label className="flex items-center p-4 border rounded-lg cursor-pointer hover:bg-gray-50">
                                        <input
                                            type="radio"
                                            name="paymentMethod"
                                            value="promo"
                                            checked={paymentMethod === 'promo'}
                                            onChange={() => handlePaymentMethodChange('promo')}
                                            className="mr-3"
                                        />
                                        <Gift className="h-5 w-5 text-orange-600 mr-3" />
                                        <div>
                                            <div className="font-medium">Code promo</div>
                                        </div>
                                    </label>
                                </div>
                            </div>

                            {/* Paiement par carte : checkout hébergé Paddle (aucune saisie de carte sur notre site) */}
                            {paymentMethod === 'card' && (
                                <div className="mb-6">
                                    <PaddleCheckoutButton
                                        planId={selectedPlanForPayment}
                                        onSuccess={handlePaidCheckoutSuccess}
                                        onError={handlePaidCheckoutError}
                                    />
                                </div>
                            )}

                            {/* Formulaire code promo */}
                            {paymentMethod === 'promo' && (
                                <div className="mb-6">
                                    <h4 className="text-lg font-medium text-gray-900 mb-4">Code promo</h4>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            placeholder="Entrez votre code promo"
                                            value={promoCode}
                                            onChange={(e) => setPromoCode(e.target.value)}
                                            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                        />
                                        <button
                                            onClick={handlePromoCodeValidation}
                                            className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
                                        >
                                            Valider
                                        </button>
                                    </div>
                                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mt-4">
                                        <div className="flex items-center text-orange-800">
                                            <Gift className="h-5 w-5 mr-2" />
                                            <span className="font-medium">Offre spéciale</span>
                                        </div>
                                        <p className="text-sm text-orange-700 mt-1">
                                            Utilisez votre code promo temporaire pour un accès de 30 jours
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Résumé de commande */}
                            <div className="bg-gray-50 rounded-lg p-4 mb-6">
                                <h4 className="text-lg font-medium text-gray-900 mb-3">Résumé de commande</h4>
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-600">
                                        {planDisplayName(selectedPlanForPayment)} - Abonnement mensuel
                                    </span>
                                    <span className="font-semibold text-lg">
                                        {paymentMethod === 'promo' ? '0 USD' : `${getPlanPrice(selectedPlanForPayment)} USD`}
                                    </span>
                                </div>
                            </div>

                            {/* Le bouton de paiement carte est géré par PaddleCheckoutButton ci-dessus */}

                            <p className="text-xs text-gray-500 text-center mt-4">
                                Vos informations de paiement sont sécurisées et cryptées.
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
