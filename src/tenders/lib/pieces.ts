/**
 * Rattachement automatique d'un document généré à la pièce exigée qu'il
 * couvre (check-list de l'onglet Documents). Partagé entre DocsTab,
 * MemoTab et RequirementsTab pour que « Mémoire technique », « Réponse
 * point par point », etc. couvrent bien leur pièce dès la génération.
 */

import type { DocumentType, RequiredDocument, Tender } from '../types';

/** Mots-clés (minuscule) reliant un type de document aux libellés de pièces. */
const PIECE_KEYWORDS: Partial<Record<DocumentType, string[]>> = {
  memoire_technique: ['mémoire', 'memoire'],
  planning: ['planning'],
  bpu: ['bordereau', 'bpu', 'prix'],
  dpgf: ['dpgf', 'décomposition', 'decomposition'],
  reponse_administrative: ['administratif', 'administrative', 'déclaration', 'declaration'],
  note_methodologique: ['méthodolog', 'methodolog', 'note'],
  analyse_risques: ['risque'],
  reponse_point_par_point: ['réponse point', 'reponse point', 'point par point'],
  grille_conformite: ['conformité', 'conformite'],
};

/** Pièce exigée non encore couverte que ce type de document peut couvrir. */
export function findPieceToAttach(
  tender: Tender,
  docType: DocumentType,
): RequiredDocument | undefined {
  const keywords = PIECE_KEYWORDS[docType] ?? [];
  return tender.requiredDocuments.find(
    (rd) => !rd.generatedDocId && keywords.some((k) => rd.label.toLowerCase().includes(k)),
  );
}

/**
 * Retourne la liste requiredDocuments avec la pièce couverte rattachée au
 * document, ou null si aucune pièce ne correspond (rien à mettre à jour).
 */
export function attachDocToPieces(
  tender: Tender,
  docType: DocumentType,
  docId: string,
): { requiredDocuments: RequiredDocument[]; attachedLabel: string } | null {
  const target = findPieceToAttach(tender, docType);
  if (!target) return null;
  return {
    attachedLabel: target.label,
    requiredDocuments: tender.requiredDocuments.map((rd) =>
      rd.id === target.id ? { ...rd, generatedDocId: docId } : rd,
    ),
  };
}
