// Module de simulateur logistique Afrique + Europe
// Coûts de transport port → port + douane + inland
// Tarifs basés sur Nile Cargo Carrier et données du marché

export interface TransportCost {
  cost: number; // Coût en euros
  days: number; // Délai en jours
  details: {
    shipping: number; // Transport maritime
    customs: number; // Douane
    inland: number; // Transport terrestre
  };
}

export interface TransportRoute {
  [destination: string]: TransportCost;
}

export interface TransportTable {
  [origin: string]: TransportRoute;
}

// Frais portuaires et assurance (en USD)
const portFees = 200; // Frais portuaires pour break-bulk (moins cher que conteneur)
const insuranceRate = 0.01; // 1% de la valeur CIF
const defaultMachineValue = 20000; // Valeur par défaut réduite

// Tarifs terrestres réduits
const inlandRates = {
  'Europe': { 'light': 1.5, 'medium': 2.0, 'heavy': 2.5, 'extra': 3.0, 'exceptional': 4.0 },
  'Maroc': { 'light': 1.0, 'medium': 1.5, 'heavy': 2.0, 'extra': 2.5, 'exceptional': 3.0 },
  'Afrique de l\'Ouest': { 'light': 1.2, 'medium': 1.8, 'heavy': 2.2, 'extra': 2.8, 'exceptional': 3.5 }
};

// Distances terrestres moyennes (km) depuis les ports vers les destinations
const inlandDistances: { [key: string]: number } = {
  'Abidjan': 50,      // Port → ville
  'Dakar': 30,        // Port → ville
  'Cotonou': 40,      // Port → ville
  'Lagos': 60,        // Port → ville
  'Accra': 45,        // Port → ville
  'Douala': 35,       // Port → ville
  'Bamako': 1200,     // Port Dakar → Bamako
  'Ouagadougou': 1100 // Port Abidjan → Ouagadougou
};

// Fonction pour déterminer la catégorie de poids
function getWeightCategory(poids: number): string {
  if (poids < 6) return 'light';
  if (poids < 25) return 'medium';
  if (poids < 35) return 'heavy';
  if (poids < 50) return 'extra';
  return 'exceptional';
}

// Fonction pour déterminer la région de transport terrestre
function getInlandRegion(origin: string): string {
  if (['Marseille', 'Rotterdam', 'Anvers', 'Hambourg'].includes(origin)) return 'Europe';
  if (['Casablanca', 'Tanger', 'Agadir'].includes(origin)) return 'Maroc';
  return 'Afrique';
}

// Tarifs de transport maritime en USD/m³ (basés sur Nile Cargo Carrier)
// Ces tarifs sont pour du break-bulk/Ro-Ro, pas des conteneurs standards
const maritimeRates: { [origin: string]: { [destination: string]: { base: number, volume: number } } } = {
  'Casablanca': {
    'Abidjan': { base: 60, volume: 45 }, // $60/m³ pour 1m³, $45/m³ pour ≥3m³
    'Dakar': { base: 55, volume: 40 },
    'Cotonou': { base: 65, volume: 50 },
    'Lagos': { base: 70, volume: 55 },
    'Accra': { base: 75, volume: 60 },
    'Douala': { base: 72, volume: 57 },
    'Bamako': { base: 55, volume: 40 },
    'Ouagadougou': { base: 60, volume: 45 }
  },
  'Tanger': {
    'Abidjan': { base: 55, volume: 40 },
    'Dakar': { base: 50, volume: 35 },
    'Cotonou': { base: 60, volume: 45 },
    'Lagos': { base: 65, volume: 50 },
    'Accra': { base: 70, volume: 55 },
    'Douala': { base: 67, volume: 52 },
    'Bamako': { base: 50, volume: 35 },
    'Ouagadougou': { base: 55, volume: 40 }
  },
  'Agadir': {
    'Abidjan': { base: 65, volume: 50 },
    'Dakar': { base: 60, volume: 45 },
    'Cotonou': { base: 70, volume: 55 },
    'Lagos': { base: 75, volume: 60 },
    'Accra': { base: 80, volume: 65 },
    'Douala': { base: 77, volume: 62 },
    'Bamako': { base: 60, volume: 45 },
    'Ouagadougou': { base: 65, volume: 50 }
  },
  'Marseille': {
    'Abidjan': { base: 90, volume: 70 },
    'Dakar': { base: 75, volume: 60 },
    'Cotonou': { base: 95, volume: 75 },
    'Lagos': { base: 85, volume: 65 },
    'Accra': { base: 110, volume: 90 },
    'Douala': { base: 80, volume: 60 },
    'Bamako': { base: 75, volume: 60 },
    'Ouagadougou': { base: 85, volume: 70 }
  },
  'Rotterdam': {
    'Abidjan': { base: 100, volume: 80 },
    'Dakar': { base: 85, volume: 70 },
    'Cotonou': { base: 105, volume: 85 },
    'Lagos': { base: 95, volume: 75 },
    'Accra': { base: 120, volume: 100 },
    'Douala': { base: 90, volume: 70 },
    'Bamako': { base: 85, volume: 70 },
    'Ouagadougou': { base: 95, volume: 80 }
  },
  'Anvers': {
    'Abidjan': { base: 110, volume: 90 }, // Plus cher que Rotterdam (+10%)
    'Dakar': { base: 95, volume: 80 },
    'Cotonou': { base: 115, volume: 95 },
    'Lagos': { base: 105, volume: 85 },
    'Accra': { base: 130, volume: 110 },
    'Douala': { base: 100, volume: 80 },
    'Bamako': { base: 95, volume: 80 },
    'Ouagadougou': { base: 105, volume: 90 }
  },
  'Hambourg': {
    'Abidjan': { base: 120, volume: 100 }, // Plus cher que Rotterdam (+20%)
    'Dakar': { base: 105, volume: 90 },
    'Cotonou': { base: 125, volume: 105 },
    'Lagos': { base: 115, volume: 95 },
    'Accra': { base: 140, volume: 120 },
    'Douala': { base: 110, volume: 90 },
    'Bamako': { base: 105, volume: 90 },
    'Ouagadougou': { base: 115, volume: 100 }
  }
};

// Table des coûts de transport (port → port + douane + inland)
export const transportTable: TransportTable = {
  // 🇲🇦 PORTS MAROCAINS
  'Casablanca': {
    // 🌍 DESTINATIONS AFRICAINES
    'Abidjan': {
      cost: 1500,
      days: 15,
      details: { shipping: 900, customs: 0, inland: 600 }
    },
    'Dakar': {
      cost: 1300,
      days: 12,
      details: { shipping: 700, customs: 0, inland: 600 }
    },
    'Lagos': {
      cost: 1800,
      days: 20,
      details: { shipping: 1200, customs: 0, inland: 600 }
    },
    'Accra': {
      cost: 1600,
      days: 16,
      details: { shipping: 1000, customs: 0, inland: 600 }
    },
    'Douala': {
      cost: 2000,
      days: 19,
      details: { shipping: 1400, customs: 0, inland: 600 }
    },
    'Bamako': {
      cost: 2300,
      days: 14,
      details: { shipping: 700, customs: 0, inland: 1600 }
    },
    'Ouagadougou': {
      cost: 2500,
      days: 17,
      details: { shipping: 900, customs: 0, inland: 1600 }
    }
  },
  'Tanger': {
    // 🌍 DESTINATIONS AFRICAINES
    'Abidjan': {
      cost: 4720,
      days: 14,
      details: { shipping: 3100, customs: 1120, inland: 500 }
    },
    'Dakar': {
      cost: 4130,
      days: 11,
      details: { shipping: 2700, customs: 930, inland: 500 }
    },
    'Cotonou': {
      cost: 4990,
      days: 17,
      details: { shipping: 3400, customs: 1090, inland: 500 }
    },
    'Lagos': {
      cost: 5250,
      days: 19,
      details: { shipping: 3500, customs: 1250, inland: 500 }
    },
    'Accra': {
      cost: 4860,
      days: 15,
      details: { shipping: 3200, customs: 1160, inland: 500 }
    },
    'Douala': {
      cost: 5120,
      days: 18,
      details: { shipping: 3400, customs: 1220, inland: 500 }
    },
    'Bamako': {
      cost: 5690,
      days: 13,
      details: { shipping: 3100, customs: 1090, inland: 1500 }
    },
    'Ouagadougou': {
      cost: 5750,
      days: 16,
      details: { shipping: 3100, customs: 1150, inland: 1500 }
    }
  },
  'Agadir': {
    // 🌍 DESTINATIONS AFRICAINES
    'Abidjan': {
      cost: 4970,
      days: 16,
      details: { shipping: 3300, customs: 1170, inland: 500 }
    },
    'Dakar': {
      cost: 4380,
      days: 13,
      details: { shipping: 2900, customs: 980, inland: 500 }
    },
    'Cotonou': {
      cost: 5240,
      days: 19,
      details: { shipping: 3600, customs: 1140, inland: 500 }
    },
    'Lagos': {
      cost: 5500,
      days: 21,
      details: { shipping: 3700, customs: 1300, inland: 500 }
    },
    'Accra': {
      cost: 5110,
      days: 17,
      details: { shipping: 3400, customs: 1210, inland: 500 }
    },
    'Douala': {
      cost: 5370,
      days: 20,
      details: { shipping: 3600, customs: 1270, inland: 500 }
    },
    'Bamako': {
      cost: 5940,
      days: 15,
      details: { shipping: 3300, customs: 1140, inland: 1500 }
    },
    'Ouagadougou': {
      cost: 6000,
      days: 18,
      details: { shipping: 3300, customs: 1200, inland: 1500 }
    }
  },

  // 🇪🇺 PORTS EUROPÉENS
  'Marseille': {
    // 🌍 DESTINATIONS AFRICAINES
    'Abidjan': {
      cost: 5500,
      days: 18,
      details: { shipping: 3700, customs: 1300, inland: 500 }
    },
    'Dakar': {
      cost: 4900,
      days: 15,
      details: { shipping: 3300, customs: 1100, inland: 500 }
    },
    'Cotonou': {
      cost: 5750,
      days: 20,
      details: { shipping: 3900, customs: 1350, inland: 500 }
    },
    'Lagos': {
      cost: 6000,
      days: 22,
      details: { shipping: 4000, customs: 1500, inland: 500 }
    },
    'Accra': {
      cost: 5620,
      days: 19,
      details: { shipping: 3800, customs: 1320, inland: 500 }
    },
    'Douala': {
      cost: 5880,
      days: 21,
      details: { shipping: 3900, customs: 1480, inland: 500 }
    },
    'Bamako': {
      cost: 6450,
      days: 17,
      details: { shipping: 3600, customs: 1350, inland: 1500 }
    },
    'Ouagadougou': {
      cost: 6500,
      days: 20,
      details: { shipping: 3600, customs: 1400, inland: 1500 }
    }
  },
  'Rotterdam': {
    // 🌍 DESTINATIONS AFRICAINES
    'Abidjan': {
      cost: 5700,
      days: 20,
      details: { shipping: 3800, customs: 1400, inland: 500 }
    },
    'Dakar': {
      cost: 5100,
      days: 17,
      details: { shipping: 3400, customs: 1200, inland: 500 }
    },
    'Cotonou': {
      cost: 5950,
      days: 22,
      details: { shipping: 4000, customs: 1450, inland: 500 }
    },
    'Lagos': {
      cost: 6200,
      days: 24,
      details: { shipping: 4100, customs: 1600, inland: 500 }
    },
    'Accra': {
      cost: 5820,
      days: 21,
      details: { shipping: 3900, customs: 1420, inland: 500 }
    },
    'Douala': {
      cost: 6080,
      days: 23,
      details: { shipping: 4000, customs: 1580, inland: 500 }
    },
    'Bamako': {
      cost: 6650,
      days: 19,
      details: { shipping: 3700, customs: 1450, inland: 1500 }
    },
    'Ouagadougou': {
      cost: 6700,
      days: 22,
      details: { shipping: 3700, customs: 1500, inland: 1500 }
    }
  },
  'Hambourg': {
    // 🌍 DESTINATIONS AFRICAINES
    'Abidjan': {
      cost: 1400,
      days: 21,
      details: { shipping: 1000, customs: 230, inland: 170 }
    },
    'Dakar': {
      cost: 1300,
      days: 18,
      details: { shipping: 900, customs: 210, inland: 190 }
    },
    'Cotonou': {
      cost: 1450,
      days: 23,
      details: { shipping: 1050, customs: 250, inland: 150 }
    },
    'Lagos': {
      cost: 1500,
      days: 25,
      details: { shipping: 1100, customs: 260, inland: 140 }
    },
    'Accra': {
      cost: 1420,
      days: 22,
      details: { shipping: 1020, customs: 240, inland: 160 }
    },
    'Douala': {
      cost: 1480,
      days: 24,
      details: { shipping: 1070, customs: 250, inland: 160 }
    },
    'Bamako': {
      cost: 1350,
      days: 20,
      details: { shipping: 950, customs: 220, inland: 180 }
    },
    'Ouagadougou': {
      cost: 1400,
      days: 23,
      details: { shipping: 980, customs: 230, inland: 190 }
    }
  },
  'Anvers': {
    // 🌍 DESTINATIONS AFRICAINES
    'Abidjan': {
      cost: 5900,
      days: 21,
      details: { shipping: 4000, customs: 1400, inland: 500 }
    },
    'Dakar': {
      cost: 5300,
      days: 18,
      details: { shipping: 3600, customs: 1200, inland: 500 }
    },
    'Cotonou': {
      cost: 6150,
      days: 23,
      details: { shipping: 4200, customs: 1450, inland: 500 }
    },
    'Lagos': {
      cost: 6400,
      days: 25,
      details: { shipping: 4300, customs: 1600, inland: 500 }
    },
    'Accra': {
      cost: 6020,
      days: 22,
      details: { shipping: 4100, customs: 1420, inland: 500 }
    },
    'Douala': {
      cost: 6280,
      days: 24,
      details: { shipping: 4200, customs: 1580, inland: 500 }
    },
    'Bamako': {
      cost: 6850,
      days: 20,
      details: { shipping: 3900, customs: 1450, inland: 1500 }
    },
    'Ouagadougou': {
      cost: 6900,
      days: 23,
      details: { shipping: 3900, customs: 1500, inland: 1500 }
    }
  }
};

// Villes disponibles
export const availableOrigins = Object.keys(transportTable);
export const availableDestinations = Object.keys(transportTable['Casablanca']);

// Calcul des droits de douane selon les taux réels par pays
export function calculateCustomsDuties(country: string, cifValue: number): number {
  const baseValue = cifValue || 50000; // Valeur CIF (Prix + Fret + Assurance)
  
  switch (country) {
    // 🇨🇮 Côte d'Ivoire - WAEMU
    case 'Abidjan': {
      // Droits CET: 10% de la valeur CIF
      // Surtaxes: 2.5% de la valeur CIF (statistique 1% + solidarité 1% + CDEAO 0.5%)
      // TVA: 18% de la valeur CIF
      const droitsCET = baseValue * 0.10;
      const surtaxes = baseValue * 0.025;
      const tva = baseValue * 0.18;
      return Math.round(droitsCET + surtaxes + tva);
    }

    // 🇸🇳 Sénégal - WAEMU
    case 'Dakar': {
      // Même régime que Côte d'Ivoire
      const droitsCETSenegal = baseValue * 0.10;
      const surtaxesSenegal = baseValue * 0.025;
      const tvaSenegal = baseValue * 0.18;
      return Math.round(droitsCETSenegal + surtaxesSenegal + tvaSenegal);
    }

    // 🇧🇯 Bénin - WAEMU
    case 'Cotonou': {
      // Même régime que Côte d'Ivoire
      const droitsCETBenin = baseValue * 0.10;
      const surtaxesBenin = baseValue * 0.025;
      const tvaBenin = baseValue * 0.18;
      return Math.round(droitsCETBenin + surtaxesBenin + tvaBenin);
    }

    // 🇳🇬 Nigeria
    case 'Lagos': {
      // Droits de douane: 7.5% de la valeur CIF
      // TVA: 7.5% de la valeur CIF
      const droitsNigeria = baseValue * 0.075;
      const tvaNigeria = baseValue * 0.075;
      return Math.round(droitsNigeria + tvaNigeria);
    }

    // 🇬🇭 Ghana
    case 'Accra': {
      // Droits de douane: 10% de la valeur CIF
      // TVA: 12.5% de la valeur CIF
      const droitsGhana = baseValue * 0.10;
      const tvaGhana = baseValue * 0.125;
      return Math.round(droitsGhana + tvaGhana);
    }

    // 🇨🇲 Cameroun
    case 'Douala': {
      // Droits de douane: 10% de la valeur CIF
      // Surtaxe AIC: 0.2% de la valeur CIF
      // TVA: 19.25% de la valeur CIF
      const droitsCameroun = baseValue * 0.10;
      const surtaxeAIC = baseValue * 0.002;
      const tvaCameroun = baseValue * 0.1925;
      return Math.round(droitsCameroun + surtaxeAIC + tvaCameroun);
    }

    // 🇧🇫 Burkina Faso et 🇲🇱 Mali - WAEMU + AES
    case 'Ouagadougou':
    case 'Bamako': {
      // Droits CET: 10% de la valeur CIF
      // Surtaxes: 3% de la valeur CIF (statistique 1% + solidarité 1% + CDEAO 0.5% + AES 0.5%)
      // TVA: 18% de la valeur CIF
      const droitsAES = baseValue * 0.10;
      const surtaxesAES = baseValue * 0.03;
      const tvaAES = baseValue * 0.18;
      return Math.round(droitsAES + surtaxesAES + tvaAES);
    }

    default:
      // Tarif par défaut: 15% de la valeur CIF
      return Math.round(baseValue * 0.15);
  }
}

// Mise à jour de la fonction estimerTransport
export function estimerTransport(
  depart: string, 
  arrivee: string, 
  poids?: number, 
  volume?: number,
  valeurMachine?: number
): TransportCost | null {
  const route = transportTable[depart]?.[arrivee];
  if (!route) return null;

  // Calculer les frais de douanes basés sur la valeur de la machine
  const customsDuties = calculateCustomsDuties(arrivee, valeurMachine || 50000);
  
  // Pour l'affichage du panneau : coût sans douanes (transport maritime + terrestre seulement)
  const displayCost = route.details.shipping + route.details.inland;

  return {
    cost: displayCost, // Coût affiché sans douanes
    days: route.days,
    details: {
      shipping: route.details.shipping,
      customs: customsDuties, // Gardé dans les détails pour information
      inland: route.details.inland
    }
  };
}

// Fonction pour obtenir toutes les destinations depuis un port
export function getDestinationsFromOrigin(origin: string): string[] {
  return transportTable[origin] ? Object.keys(transportTable[origin]) : [];
}

// Fonction pour obtenir toutes les origines vers une destination
export function getOriginsToDestination(destination: string): string[] {
  return availableOrigins.filter(origin => 
    transportTable[origin] && transportTable[origin][destination]
  );
}

// Fonction pour formater le coût en euros
export function formatCost(cost: number): string {
  return `${cost.toLocaleString('fr-FR')} €`;
}

// Fonction pour formater le délai
export function formatDelay(days: number): string {
  if (days === 1) return '1 jour';
  return `${days} jours`;
}

// Fonction pour obtenir le détail des coûts
export function getCostBreakdown(cost: TransportCost): string {
  return `Transport: ${formatCost(cost.details.shipping)} | Douane: ${formatCost(cost.details.customs)} | Terrestre: ${formatCost(cost.details.inland)}`;
}

// Fonction pour obtenir les destinations par continent
export function getDestinationsByContinent(): { [continent: string]: string[] } {
  return {
    'Afrique': ['Abidjan', 'Dakar', 'Cotonou', 'Lagos', 'Accra', 'Douala', 'Bamako', 'Ouagadougou']
  };
}

// Fonction pour obtenir les origines par continent
export function getOriginsByContinent(): { [continent: string]: string[] } {
  return {
    'Maroc': ['Casablanca', 'Tanger', 'Agadir'],
    'Europe': ['Marseille', 'Rotterdam', 'Hambourg', 'Anvers']
  };
} 