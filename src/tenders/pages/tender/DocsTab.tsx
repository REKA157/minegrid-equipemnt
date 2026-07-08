/**
 * Onglet Documents du dossier :
 * 1. Check-list des pièces exigées (disponible / générée / manquante) ;
 * 2. Générateurs de pièces en un clic (réponse administrative, planning,
 *    note méthodo, analyse de risques, BPU, DPGF, synthèses…) ;
 * 3. Documents générés du dossier (ouvre l'éditeur) ;
 * 4. Export du dossier final en ZIP organisé (admin / technique / financier).
 */

import React, { useState } from 'react';
import {
  Archive,
  CheckCircle2,
  Circle,
  FilePlus2,
  FileText,
  PackageCheck,
} from 'lucide-react';
import { useNavigate } from '../../../router';
import { useTendersStore, useTenderDocuments } from '../../store/tendersStore';
import { TENDER_DOC_GENERATORS, CONSULTATION_DOC_GENERATORS } from '../../lib/docTemplates';
import { attachDocToPieces } from '../../lib/pieces';
import { exportTenderZip } from '../../lib/exportDoc';
import {
  Card,
  DocStatusBadge,
  GuideBanner,
  PrimaryButton,
  SecondaryButton,
  SectionCard,
  WarningBanner,
} from '../../components/ui';
import type { GeneratedDocument, Tender } from '../../types';
import { DOCUMENT_TYPE_LABELS, can, formatDate } from '../../types';
import { toast } from '../../../utils/toast';

export default function DocsTab({ tender }: { tender: Tender }) {
  const navigate = useNavigate();
  const addDocument = useTendersStore((s) => s.addDocument);
  const updateTender = useTendersStore((s) => s.updateTender);
  const setTenderStatus = useTendersStore((s) => s.setTenderStatus);
  const company = useTendersStore((s) => s.company);
  const settings = useTendersStore((s) => s.settings);
  const docs = useTenderDocuments(tender.id);
  const [busy, setBusy] = useState<string | null>(null);
  const [zipping, setZipping] = useState(false);

  const editable = can(settings.currentUserRole, 'edit');

  const missing = tender.requiredDocuments.filter((d) => !d.available && !d.generatedDocId);
  const allValidated = docs.length > 0 && docs.every((d) => d.status === 'valide');

  const generate = (type: string) => {
    const gen = [...TENDER_DOC_GENERATORS, ...CONSULTATION_DOC_GENERATORS].find((g) => g.type === type);
    if (!gen) return;
    setBusy(type);
    // setTimeout : laisse l'UI afficher l'état avant le travail synchrone.
    setTimeout(() => {
      try {
        const doc = gen.build(tender, company, settings.currentUserName);
        addDocument(doc);

        // Rattache la pièce exigée correspondante si trouvable.
        const attached = attachDocToPieces(tender, doc.type, doc.id);
        if (attached) {
          updateTender(
            tender.id,
            { requiredDocuments: attached.requiredDocuments },
            `Pièce « ${attached.attachedLabel} » couverte par ${doc.title}`,
          );
        }
        toast.success(`${gen.label} généré — ouvrez-le pour le personnaliser.`);
        navigate(`appels-offres/document/${doc.id}`);
      } finally {
        setBusy(null);
      }
    }, 50);
  };

  const toggleAvailable = (id: string) => {
    updateTender(tender.id, {
      requiredDocuments: tender.requiredDocuments.map((rd) =>
        rd.id === id ? { ...rd, available: !rd.available } : rd,
      ),
    });
  };

  const downloadZip = async () => {
    if (docs.length === 0) {
      toast.error('Aucun document généré : générez au moins une pièce avant l\'export.');
      return;
    }
    setZipping(true);
    try {
      await exportTenderZip(tender, docs, company);
      toast.success('Dossier final ZIP téléchargé (admin / technique / financier).');
    } finally {
      setZipping(false);
    }
  };

  const markReady = () => {
    setTenderStatus(tender.id, 'pret_a_deposer');
    toast.success('Dossier marqué « Prêt à déposer ».');
  };

  return (
    <div className="space-y-6">
      {missing.length > 0 ? (
        <WarningBanner>
          <strong>{missing.length} pièce(s) manquante(s)</strong> :{' '}
          {missing.map((m) => m.label).join(' · ')}. Générez-les ci-dessous ou cochez-les si
          vous les avez déjà en externe.
        </WarningBanner>
      ) : (
        tender.requiredDocuments.length > 0 && (
          <GuideBanner>
            ✓ Toutes les pièces exigées sont couvertes.{' '}
            {allValidated
              ? 'Tous les documents sont validés : exportez le dossier final.'
              : 'Faites valider les documents puis exportez le dossier final.'}
          </GuideBanner>
        )
      )}

      {/* Check-list des pièces exigées */}
      <SectionCard
        title="Pièces exigées par la consultation"
        hint="Cochez les pièces que vous détenez déjà (attestations, cautions…). Les pièces produites dans l'application se rattachent automatiquement."
      >
        {tender.requiredDocuments.length === 0 ? (
          <p className="text-sm text-gray-500">
            Aucune pièce listée. Ajoutez-les depuis l'analyse DCE (bouton « Reprendre dans le
            dossier ») ou en modifiant le dossier.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {tender.requiredDocuments.map((rd) => {
              const linkedDoc = docs.find((d) => d.id === rd.generatedDocId);
              const covered = rd.available || Boolean(linkedDoc);
              return (
                <li key={rd.id} className="flex items-center gap-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => editable && toggleAvailable(rd.id)}
                    disabled={!editable}
                    className="shrink-0"
                    title={rd.available ? 'Marquer comme manquante' : 'Marquer comme disponible'}
                  >
                    {covered ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <Circle className="h-5 w-5 text-gray-300" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <span className={`text-sm ${covered ? 'text-gray-900' : 'font-medium text-amber-800'}`}>
                      {rd.label}
                    </span>
                    <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500">
                      {rd.category}
                    </span>
                    {rd.note && <div className="truncate text-xs text-gray-400">{rd.note}</div>}
                  </div>
                  {linkedDoc && (
                    <a
                      href={`#appels-offres/document/${linkedDoc.id}`}
                      className="shrink-0 text-xs font-semibold text-primary-700 hover:underline"
                    >
                      Ouvrir la pièce →
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      {/* Générateurs */}
      {editable && (
        <SectionCard
          title="Générer une pièce"
          hint="Chaque pièce est pré-remplie avec les données du dossier et de la Base entreprise, puis modifiable avant export."
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TENDER_DOC_GENERATORS.map((g) => {
              const already = docs.some((d) => d.type === g.type);
              return (
                <button
                  key={g.type}
                  type="button"
                  onClick={() => generate(g.type)}
                  disabled={busy !== null}
                  className={`rounded-xl border p-3.5 text-left transition-colors ${
                    already
                      ? 'border-gray-200 bg-gray-50 hover:bg-gray-100'
                      : 'border-primary-200 bg-primary-50/40 hover:bg-primary-50'
                  } disabled:opacity-50`}
                >
                  <div className="flex items-center gap-2">
                    <FilePlus2 className={`h-4 w-4 shrink-0 ${already ? 'text-gray-400' : 'text-primary-600'}`} />
                    <span className="text-sm font-semibold text-gray-900">
                      {busy === g.type ? 'Génération…' : g.label}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-gray-500">{g.description}</p>
                  {already && (
                    <p className="mt-1 text-[11px] text-amber-600">
                      Déjà généré — cliquer créera une nouvelle version.
                    </p>
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Le mémoire technique se génère depuis l'onglet{' '}
            <a href={`#appels-offres/ao/${tender.id}/memoire`} className="font-semibold text-primary-700 underline">
              Mémoire technique
            </a>.
          </p>
        </SectionCard>
      )}

      {/* Documents générés */}
      <SectionCard title={`Documents du dossier (${docs.length})`}>
        {docs.length === 0 ? (
          <p className="text-sm text-gray-500">
            Aucun document généré pour l'instant. Commencez par le mémoire technique ou la
            réponse administrative.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {docs.map((d: GeneratedDocument) => (
              <li key={d.id}>
                <a
                  href={`#appels-offres/document/${d.id}`}
                  className="flex items-center gap-3 rounded-lg px-2 py-2.5 -mx-2 hover:bg-gray-50"
                >
                  <FileText className="h-5 w-5 shrink-0 text-gray-400" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-gray-900">{d.title}</div>
                    <div className="text-xs text-gray-400">
                      {DOCUMENT_TYPE_LABELS[d.type]} · modifié le {formatDate(d.updatedAt)}
                    </div>
                  </div>
                  <DocStatusBadge status={d.status} />
                </a>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* Export final */}
      <Card className="border-primary-200 bg-primary-50/30 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
              <Archive className="h-5 w-5 text-primary-600" /> Dossier final
            </h2>
            <p className="mt-1 max-w-xl text-sm text-gray-600">
              Exporte un ZIP organisé (1_Dossier_administratif / 2_Offre_technique /
              3_Offre_financière) avec tous les documents en Word + Excel et un récapitulatif
              des pièces.
            </p>
          </div>
          <div className="flex gap-2">
            {editable && tender.status !== 'pret_a_deposer' && missing.length === 0 && docs.length > 0 && (
              <SecondaryButton onClick={markReady}>
                <PackageCheck className="h-4 w-4" /> Marquer prêt à déposer
              </SecondaryButton>
            )}
            <PrimaryButton onClick={downloadZip} disabled={zipping || docs.length === 0}>
              <Archive className="h-4 w-4" />
              {zipping ? 'Préparation du ZIP…' : 'Exporter le dossier (ZIP)'}
            </PrimaryButton>
          </div>
        </div>
      </Card>
    </div>
  );
}
