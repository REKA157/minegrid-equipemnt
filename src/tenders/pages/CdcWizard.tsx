/**
 * Assistant « Créer un cahier des charges » — 7 étapes courtes couvrant
 * les 16 rubriques demandées (type de projet, secteur, contexte, objectifs,
 * périmètre, contraintes, livrables, planning, qualité, réception,
 * pénalités, sécurité, environnement, annexes, budget). À la fin, le
 * document est généré (mock IA) et ouvert dans l'éditeur.
 */

import React, { useState } from 'react';
import { useNavigate } from '../../router';
import { useTendersStore } from '../store/tendersStore';
import { generateDocument, isAiConnected } from '../ai/aiService';
import { Wizard } from '../components/Wizard';
import { Field, GuideBanner, PageHeader, Select, TextArea, TextInput } from '../components/ui';
import type { CahierDesChargesInput, GeneratedDocument, Sector } from '../types';
import { EMPTY_CDC_INPUT, SECTOR_LABELS, nowIso, uid } from '../types';
import { toast } from '../../utils/toast';

export default function CdcWizard() {
  const navigate = useNavigate();
  const addDocument = useTendersStore((s) => s.addDocument);
  const settings = useTendersStore((s) => s.settings);
  const company = useTendersStore((s) => s.company);
  const [cdc, setCdc] = useState<CahierDesChargesInput>({ ...EMPTY_CDC_INPUT });
  const [generating, setGenerating] = useState(false);

  const patch = (p: Partial<CahierDesChargesInput>) => setCdc((c) => ({ ...c, ...p }));

  const finish = async () => {
    setGenerating(true);
    try {
      const sections = await generateDocument({ kind: 'cahier_des_charges', cdc, company });
      const doc: GeneratedDocument = {
        id: uid('doc'),
        type: 'cahier_des_charges',
        title: `Cahier des charges — ${cdc.projectName || 'Nouveau projet'}`,
        sections,
        status: 'brouillon',
        createdAt: nowIso(),
        updatedAt: nowIso(),
        simulated: !isAiConnected(),
        history: [
          {
            id: uid('h'),
            date: nowIso(),
            author: settings.currentUserName,
            action: `Génération par l'assistant${isAiConnected() ? '' : ' (mode simulation)'}`,
          },
        ],
      };
      addDocument(doc);
      toast.success('Cahier des charges généré. Relisez chaque section avant export.');
      navigate(`appels-offres/document/${doc.id}`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        overline="Appels d'offres › Cahiers des charges"
        title="Assistant cahier des charges"
        description="Répondez aux questions étape par étape — les champs vides recevront une clause standard que vous pourrez adapter."
      />
      <GuideBanner>
        Conseil : soyez concret dans vos réponses (chiffres, surfaces, effectifs, délais). Plus
        vos réponses sont précises, plus le document généré est exploitable directement.
      </GuideBanner>

      <Wizard
        onFinish={finish}
        busy={generating}
        finishLabel="Générer le cahier des charges"
        steps={[
          {
            id: 'projet',
            title: 'Le projet',
            hint: 'De quel projet s\'agit-il ?',
            validate: () => (!cdc.projectName.trim() ? 'Donnez un nom au projet.' : null),
            content: (
              <div className="space-y-4">
                <Field label="Nom du projet" required>
                  <TextInput
                    value={cdc.projectName}
                    onChange={(e) => patch({ projectName: e.target.value })}
                    placeholder="Ex. : Maintenance multi-technique du siège social"
                  />
                </Field>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Type de projet" help="Travaux neufs, réhabilitation, prestation récurrente, projet ponctuel…">
                    <TextInput
                      value={cdc.projectType}
                      onChange={(e) => patch({ projectType: e.target.value })}
                      placeholder="Ex. : marché de services récurrent"
                    />
                  </Field>
                  <Field label="Secteur">
                    <Select value={cdc.sector} onChange={(e) => patch({ sector: e.target.value as Sector })}>
                      {Object.entries(SECTOR_LABELS).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </Select>
                  </Field>
                </div>
              </div>
            ),
          },
          {
            id: 'besoin',
            title: 'Contexte et objectifs',
            hint: 'Pourquoi lancez-vous cette consultation ? Qu\'attendez-vous du prestataire ?',
            validate: () =>
              !cdc.context.trim() && !cdc.objectives.trim()
                ? 'Décrivez au moins le contexte ou les objectifs.'
                : null,
            content: (
              <div className="space-y-4">
                <Field
                  label="Contexte du besoin"
                  help="La situation actuelle : pourquoi ce besoin existe (fin de contrat, nouveau site, obligation réglementaire…)."
                >
                  <TextArea
                    value={cdc.context}
                    onChange={(e) => patch({ context: e.target.value })}
                    placeholder="Ex. : notre contrat de maintenance arrive à échéance ; le bâtiment de 6 500 m² accueille 320 collaborateurs…"
                    rows={5}
                  />
                </Field>
                <Field label="Objectifs" help="Ce que le projet doit atteindre, si possible mesurable.">
                  <TextArea
                    value={cdc.objectives}
                    onChange={(e) => patch({ objectives: e.target.value })}
                    placeholder="Ex. : garantir une disponibilité ≥ 98 % des équipements critiques, maîtriser le budget…"
                    rows={4}
                  />
                </Field>
              </div>
            ),
          },
          {
            id: 'perimetre',
            title: 'Périmètre et livrables',
            hint: 'Ce qui est inclus, ce qui ne l\'est pas, et ce que le prestataire doit livrer.',
            validate: () => (!cdc.scope.trim() ? 'Décrivez le périmètre des prestations.' : null),
            content: (
              <div className="space-y-4">
                <Field label="Périmètre des prestations" required>
                  <TextArea
                    value={cdc.scope}
                    onChange={(e) => patch({ scope: e.target.value })}
                    placeholder="Ex. : maintenance préventive et corrective des lots CVC, électricité, plomberie ; astreinte 24/7…"
                    rows={5}
                  />
                </Field>
                <Field label="Livrables attendus" help="Documents, rapports, ouvrages, logiciels… avec leur fréquence.">
                  <TextArea
                    value={cdc.deliverables}
                    onChange={(e) => patch({ deliverables: e.target.value })}
                    placeholder="Ex. : rapport mensuel d'activité, GMAO à jour, plan de renouvellement annuel…"
                    rows={4}
                  />
                </Field>
              </div>
            ),
          },
          {
            id: 'contraintes',
            title: 'Contraintes',
            hint: 'Techniques et réglementaires — ce que le prestataire devra respecter.',
            content: (
              <div className="space-y-4">
                <Field label="Contraintes techniques">
                  <TextArea
                    value={cdc.technicalConstraints}
                    onChange={(e) => patch({ technicalConstraints: e.target.value })}
                    placeholder="Ex. : intervention en site occupé, compatibilité avec la GTB existante, marques imposées…"
                  />
                </Field>
                <Field label="Contraintes réglementaires et normatives">
                  <TextArea
                    value={cdc.regulatoryConstraints}
                    onChange={(e) => patch({ regulatoryConstraints: e.target.value })}
                    placeholder="Ex. : habilitations électriques, normes NM/DTU, réglementation ERP, RGPD…"
                  />
                </Field>
              </div>
            ),
          },
          {
            id: 'planning',
            title: 'Planning et qualité',
            content: (
              <div className="space-y-4">
                <Field label="Planning souhaité" help="Durée, date de démarrage, phases ou jalons imposés.">
                  <TextArea
                    value={cdc.planning}
                    onChange={(e) => patch({ planning: e.target.value })}
                    placeholder="Ex. : marché de 12 mois reconductible 2 fois, démarrage au 1er septembre, tuilage de 2 semaines…"
                  />
                </Field>
                <Field label="Critères de qualité / niveaux de service">
                  <TextArea
                    value={cdc.qualityCriteria}
                    onChange={(e) => patch({ qualityCriteria: e.target.value })}
                    placeholder="Ex. : GTI 4 h sur équipements critiques, taux de préventif ≥ 95 %, indicateurs mensuels…"
                  />
                </Field>
                <Field label="Modalités de réception" help="Comment vous vérifierez et accepterez les prestations.">
                  <TextArea
                    value={cdc.receptionTerms}
                    onChange={(e) => patch({ receptionTerms: e.target.value })}
                    placeholder="Laissez vide pour la clause standard (réception contradictoire, réserves sous 30 jours)."
                    rows={3}
                  />
                </Field>
              </div>
            ),
          },
          {
            id: 'exigences',
            title: 'Pénalités, sécurité, environnement',
            content: (
              <div className="space-y-4">
                <Field label="Pénalités" help="Laissez vide pour la clause standard (1/1000 par jour, plafond 10 %).">
                  <TextArea
                    value={cdc.penalties}
                    onChange={(e) => patch({ penalties: e.target.value })}
                    placeholder="Ex. : 500 MAD par heure de dépassement du GTI sur équipement critique…"
                    rows={3}
                  />
                </Field>
                <Field label="Exigences de sécurité">
                  <TextArea
                    value={cdc.safetyRequirements}
                    onChange={(e) => patch({ safetyRequirements: e.target.value })}
                    placeholder="Ex. : plan de prévention, EPI, permis de feu pour travaux par points chauds…"
                    rows={3}
                  />
                </Field>
                <Field label="Exigences environnementales">
                  <TextArea
                    value={cdc.environmentalRequirements}
                    onChange={(e) => patch({ environmentalRequirements: e.target.value })}
                    placeholder="Ex. : tri des déchets, produits éco-labellisés, bilan carbone des interventions…"
                    rows={3}
                  />
                </Field>
              </div>
            ),
          },
          {
            id: 'final',
            title: 'Budget et annexes',
            hint: 'Dernière étape avant la génération du document.',
            content: (
              <div className="space-y-4">
                <Field label="Budget estimatif (optionnel)" help="Indicatif — n'apparaît que si renseigné.">
                  <TextInput
                    value={cdc.estimatedBudget}
                    onChange={(e) => patch({ estimatedBudget: e.target.value })}
                    placeholder="Ex. : 1 200 000 MAD HT / an"
                  />
                </Field>
                <Field label="Annexes prévues" help="Plans, inventaires, schémas, historiques… que vous joindrez.">
                  <TextArea
                    value={cdc.annexes}
                    onChange={(e) => patch({ annexes: e.target.value })}
                    placeholder="Ex. : plan des locaux, inventaire des équipements, historique des pannes 2024-2025…"
                    rows={3}
                  />
                </Field>
                <GuideBanner>
                  En cliquant sur « Générer », l'application assemble un cahier des charges
                  structuré ({isAiConnected() ? 'via votre API IA' : 'mode simulation — les champs vides reçoivent des clauses standard'}).
                  Vous pourrez modifier chaque section puis l'exporter en Word ou PDF.
                </GuideBanner>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
