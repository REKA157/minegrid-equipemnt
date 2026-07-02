import { Building2, Truck, Target, Package, FolderOpen, Wallet } from 'lucide-react';

// Widgets pour le métier Logisticien / Supply Chain
export const LogisticienWidgets = {
  metier: 'Logisticien / Supply Chain',
  description: 'Optimisation de la chaîne logistique',
  widgets: [
    {
      id: 'transaction-cases',
      type: 'list',
      title: 'Dossiers transaction',
      description: 'Coordination stockage / livraison sur les dossiers engins',
      icon: FolderOpen,
      dataSource: 'transaction_cases',
      features: {
        periodSelector: false,
        export: false,
        analytics: false,
        alerts: true
      }
    },
    {
      id: 'warehouse-occupancy',
      type: 'metric',
      title: 'Taux d\'occupation',
      description: 'Occupation des entrepôts',
      icon: Building2,
      dataSource: 'warehouse',
      features: {
        periodSelector: true,
        export: true,
        analytics: true,
        alerts: true
      }
    },
    {
      id: 'route-optimization',
      type: 'map',
      title: 'Optimisation routes',
      description: 'Routes optimisées',
      icon: Truck,
      dataSource: 'routes',
      features: {
        periodSelector: true,
        export: true,
        analytics: true,
        alerts: false
      }
    },
    {
      id: 'supply-chain-kpis',
      type: 'chart',
      title: 'KPIs Supply Chain',
      description: 'Indicateurs de performance',
      icon: Target,
      dataSource: 'kpis',
      features: {
        periodSelector: true,
        export: true,
        analytics: true,
        alerts: true
      }
    },
    {
      id: 'inventory-alerts',
      type: 'list',
      title: 'Alertes stock',
      description: 'Produits en rupture ou excédent',
      icon: Package,
      dataSource: 'inventory_alerts',
      features: {
        periodSelector: false,
        export: true,
        analytics: false,
        alerts: true
      }
    },
    {
      id: 'logistics-profitability',
      type: 'list',
      title: 'Coût & rentabilité des opérations',
      description: 'Coût (transport + entreposage) vs revenu facturé : marge par livraison, alerte marge négative',
      icon: Wallet,
      dataSource: 'routes',
      features: {
        periodSelector: false,
        export: true,
        analytics: true,
        alerts: true
      }
    }
  ]
};

export default LogisticienWidgets; 
