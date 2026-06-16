/**
 * Anti-façade : plus AUCUNE donnée d'équipement fabriquée. La vraie disponibilité du parc
 * provient de getEquipmentAvailability() (machines × rentals × interventions), chargée en
 * asynchrone par le renderer. Ce repli synchrone renvoie [] -> le widget affiche son état
 * vide honnête (« Aucun équipement ») si aucune donnée réelle n'est fournie.
 */
export const getEquipmentAvailabilityData = (_widgetId: string): unknown[] => {
  return [];
};
