// Script de test pour vérifier la réactivation après annulation
const testReactivation = {
    // Simuler une annulation
    simulateCancellation() {
        console.log('🚫 SIMULATION D\'ANNULATION');
        console.log('=' .repeat(40));
        
        // Nettoyer toutes les données
        localStorage.removeItem('userSubscription');
        localStorage.removeItem('enterpriseService');
        localStorage.removeItem('userServices');
        localStorage.setItem('subscriptionCancelled', 'true');
        
        console.log('✅ Annulation simulée');
        console.log('📊 État après annulation:', {
            userSubscription: localStorage.getItem('userSubscription'),
            enterpriseService: localStorage.getItem('enterpriseService'),
            userServices: localStorage.getItem('userServices'),
            subscriptionCancelled: localStorage.getItem('subscriptionCancelled')
        });
        
        // Déclencher l'événement d'annulation
        window.dispatchEvent(new CustomEvent('subscriptionCancelled', {
            detail: { cancelled: true }
        }));
        
        console.log('✅ Événement subscriptionCancelled déclenché');
    },
    
    // Simuler une nouvelle souscription
    simulateNewSubscription() {
        console.log('💰 SIMULATION D\'UNE NOUVELLE SOUSCRIPTION');
        console.log('=' .repeat(50));
        
        // Nettoyer l'annulation et activer
        localStorage.removeItem('subscriptionCancelled');
        localStorage.setItem('userSubscription', 'enterprise');
        localStorage.setItem('enterpriseService', 'true');
        localStorage.setItem('userServices', 'enterprise');
        
        console.log('✅ Nouvelle souscription simulée');
        console.log('📊 État après nouvelle souscription:', {
            userSubscription: localStorage.getItem('userSubscription'),
            enterpriseService: localStorage.getItem('enterpriseService'),
            userServices: localStorage.getItem('userServices'),
            subscriptionCancelled: localStorage.getItem('subscriptionCancelled')
        });
        
        // Déclencher l'événement d'activation
        setTimeout(() => {
            window.dispatchEvent(new CustomEvent('enterpriseSubscriptionActivated', {
                detail: { planType: 'enterprise' }
            }));
            console.log('✅ Événement enterpriseSubscriptionActivated déclenché');
        }, 100);
    },
    
    // Test complet : annulation puis réactivation
    runCompleteTest() {
        console.log('🧪 TEST COMPLET : ANNULATION PUIS RÉACTIVATION');
        console.log('=' .repeat(60));
        
        // État initial
        console.log('📋 ÉTAT INITIAL:');
        this.checkCurrentState();
        
        // Étape 1 : Annulation
        console.log('\n🔄 ÉTAPE 1 : ANNULATION');
        this.simulateCancellation();
        
        // Vérifier l'état après annulation
        setTimeout(() => {
            console.log('\n📋 ÉTAT APRÈS ANNULATION:');
            this.checkCurrentState();
            
            // Étape 2 : Nouvelle souscription
            console.log('\n🔄 ÉTAPE 2 : NOUVELLE SOUSCRIPTION');
            this.simulateNewSubscription();
            
            // Vérifier l'état final
            setTimeout(() => {
                console.log('\n📋 ÉTAT FINAL:');
                this.checkCurrentState();
            }, 2000);
        }, 2000);
    },
    
    // Vérifier l'état actuel
    checkCurrentState() {
        const userServices = localStorage.getItem('userServices');
        const userSubscription = localStorage.getItem('userSubscription');
        const enterpriseService = localStorage.getItem('enterpriseService');
        const subscriptionCancelled = localStorage.getItem('subscriptionCancelled');
        
        const hasEnterprise = (userServices?.includes('enterprise') || 
                            userSubscription === 'enterprise' ||
                            enterpriseService === 'true') && 
                            subscriptionCancelled !== 'true';
        
        console.log('📊 localStorage actuel:', {
            userServices,
            userSubscription,
            enterpriseService,
            subscriptionCancelled,
            hasEnterprise
        });
        
        return hasEnterprise;
    }
};

// Exposer globalement
window.testReactivation = testReactivation;

console.log('🧪 Script de test de réactivation chargé');
console.log('💡 Utilisez: testReactivation.runCompleteTest()'); 