// Barrel : re-export de tous les sous-modules enterpriseApi pour preserver la
// compatibilite ascendante. Pour les nouveaux imports, preferez cibler
// directement ./enterpriseApi/<domain>.

export * from './enterpriseApi/types';
export * from './enterpriseApi/interventions';
export * from './enterpriseApi/repairs';
export * from './enterpriseApi/inventory';
export * from './enterpriseApi/technicians';
export * from './enterpriseApi/equipment';
export * from './enterpriseApi/rentals';
export * from './enterpriseApi/stats';
