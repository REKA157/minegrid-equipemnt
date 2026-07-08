/**
 * Création d'une opportunité (dossier de réponse) — assistant en 4 étapes
 * courtes : identification, marché, critères de notation, pièces demandées.
 * À la fin, le dossier est créé en statut « En analyse » et l'utilisateur
 * est guidé vers l'analyse du DCE.
 */

import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useNavigate } from '../../router';
import { useTendersStore } from '../store/tendersStore';
import { Wizard } from '../components/Wizard';
import {
  Field,
  GuideBanner,
  PageHeader,
  SecondaryButton,
  Select,
  TextArea,
  TextInput,
} from '../components/ui';
import { DEFAULT_GONOGO_CRITERIA } from '../lib/scoring';
import type { AwardCriterion, RequiredDocument, Sector, MarketType, Tender } from '../types';
import { MARKET_TYPE_LABELS, SECTOR_LABELS, nowIso, uid } from '../types';
import { toast } from '../../utils/toast';

export default function TenderNew() {
  const navigate = useNavigate();
  const addTender = useTendersStore((s) => s.addTender);
  const userName = useTendersStore((s) => s.settings.currentUserName);

  const [title, setTitle] = useState('');
  const [reference, setReference] = useState('');
  const [buyer, setBuyer] = useState('');
  const [sector, setSector] = useState<Sector>('btp');
  const [marketType, setMarketType] = useState<MarketType>('travaux');
  const [deadline, setDeadline] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('MAD');
  const [description, setDescription] = useState('');
  const [criteria, setCriteria] = useState<AwardCriterion[]>([
    { id: uid('c'), label: 'Prix', weight: 50 },
    { id: uid('c'), label: 'Valeur technique', weight: 40 },
    { id: uid('c'), label: 'Délai', weight: 10 },
  ]);
  const [docs, setDocs] = useState<RequiredDocument[]>([
    { id: uid('rd'), label: 'Dossier administratif', category: 'administratif', available: false },
    { id: uid('rd'), label: 'Mémoire technique', category: 'technique', available: false },
    { id: uid('rd'), label: 'Offre financière (bordereau des prix)', category: 'financier', available: false },
  ]);

  const totalWeight = criteria.reduce((sum, c) => sum + (Number.isFinite(c.weight) ? c.weight : 0), 0);

  const create = () => {
    const tender: Tender = {
      id: uid('ao'),
      reference: reference.trim() || `AO-${new Date().getFullYear()}`,
      title: title.trim(),
      buyer: buyer.trim(),
      sector,
      marketType,
      status: 'en_analyse',
      deadline: new Date(deadline).toISOString(),
      estimatedAmount: amount ? Number(amount.replace(/[^\d.]/g, '')) : undefined,
      currency,
      description: description.trim(),
      awardCriteria: criteria.filter((c) => c.label.trim()),
      requiredDocuments: docs.filter((d) => d.label.trim()),
      requirements: [],
      dceAnalysis: undefined,
      goNoGo: { criteria: DEFAULT_GONOGO_CRITERIA.map((c) => ({ ...c })) },
      tasks: [],
      history: [
        { id: uid('h'), date: nowIso(), author: userName, action: 'Création de l\'opportunité' },
      ],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    addTender(tender);
    toast.success('Dossier créé. Prochaine étape : analyser le DCE.');
    navigate(`appels-offres/ao/${tender.id}/dce`);
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        overline="Appels d'offres › Nouveau dossier"
        title="Créer un dossier de réponse"
        description="4 étapes rapides. Vous pourrez tout modifier ensuite depuis le dossier."
      />
      <Wizard
        onFinish={create}
        finishLabel="Créer le dossier"
        steps={[
          {
            id: 'identite',
            title: 'Identification',
            hint: 'Qui lance la consultation et de quoi s\'agit-il ?',
            validate: () => {
              if (!title.trim()) return 'Le titre de l\'appel d\'offres est obligatoire.';
              if (!buyer.trim()) return 'Indiquez l\'acheteur / maître d\'ouvrage.';
              return null;
            },
            content: (
              <div className="space-y-4">
                <Field label="Titre de l'appel d'offres" required>
                  <TextInput
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ex. : Travaux d'aménagement de la voirie du parc industriel…"
                  />
                </Field>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Référence" help="La référence officielle de la consultation (n° d'AO).">
                    <TextInput
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                      placeholder="Ex. : AO n° 17/2026/DT"
                    />
                  </Field>
                  <Field label="Acheteur / maître d'ouvrage" required>
                    <TextInput
                      value={buyer}
                      onChange={(e) => setBuyer(e.target.value)}
                      placeholder="Ex. : Commune de Bouskoura"
                    />
                  </Field>
                </div>
                <Field label="Description courte" help="2 à 3 phrases : l'objet du marché et les points marquants.">
                  <TextArea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Objet du marché, contraintes marquantes (visite obligatoire, caution…)"
                  />
                </Field>
              </div>
            ),
          },
          {
            id: 'marche',
            title: 'Marché et échéance',
            hint: 'Ces informations pilotent les alertes du tableau de bord.',
            validate: () => {
              if (!deadline) return 'La date limite de remise est obligatoire — elle pilote toutes les alertes.';
              return null;
            },
            content: (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Secteur">
                  <Select value={sector} onChange={(e) => setSector(e.target.value as Sector)}>
                    {Object.entries(SECTOR_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Type de marché">
                  <Select value={marketType} onChange={(e) => setMarketType(e.target.value as MarketType)}>
                    {Object.entries(MARKET_TYPE_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Date limite de remise des offres" required>
                  <TextInput
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                  />
                </Field>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <Field label="Montant estimé" help="Le budget estimé par l'acheteur, s'il est connu.">
                      <TextInput
                        inputMode="numeric"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="Ex. : 24500000"
                      />
                    </Field>
                  </div>
                  <Field label="Devise">
                    <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                      <option>MAD</option>
                      <option>EUR</option>
                      <option>USD</option>
                      <option>XOF</option>
                    </Select>
                  </Field>
                </div>
              </div>
            ),
          },
          {
            id: 'criteres',
            title: 'Critères de notation',
            hint: 'Comment l\'acheteur jugera les offres (pondérations du règlement de consultation).',
            validate: () => {
              if (criteria.some((c) => !c.label.trim())) return 'Chaque critère doit avoir un libellé (ou supprimez la ligne vide).';
              if (totalWeight !== 100) return `La somme des pondérations doit faire 100 % (actuellement ${totalWeight} %).`;
              return null;
            },
            content: (
              <div className="space-y-3">
                {criteria.map((c, i) => (
                  <div key={c.id} className="flex items-center gap-2">
                    <TextInput
                      value={c.label}
                      onChange={(e) =>
                        setCriteria(criteria.map((x) => (x.id === c.id ? { ...x, label: e.target.value } : x)))
                      }
                      placeholder={`Critère ${i + 1}`}
                    />
                    <div className="flex w-28 shrink-0 items-center gap-1">
                      <TextInput
                        type="number"
                        min={0}
                        max={100}
                        value={c.weight}
                        onChange={(e) =>
                          setCriteria(
                            criteria.map((x) =>
                              x.id === c.id ? { ...x, weight: Number(e.target.value) } : x,
                            ),
                          )
                        }
                      />
                      <span className="text-sm text-gray-500">%</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCriteria(criteria.filter((x) => x.id !== c.id))}
                      className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-500"
                      aria-label="Supprimer le critère"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <div className="flex items-center justify-between">
                  <SecondaryButton
                    onClick={() => setCriteria([...criteria, { id: uid('c'), label: '', weight: 0 }])}
                  >
                    <Plus className="h-4 w-4" /> Ajouter un critère
                  </SecondaryButton>
                  <span
                    className={`text-sm font-semibold ${totalWeight === 100 ? 'text-green-600' : 'text-red-600'}`}
                  >
                    Total : {totalWeight} %
                  </span>
                </div>
              </div>
            ),
          },
          {
            id: 'pieces',
            title: 'Pièces demandées',
            hint: 'Les pièces exigées dans le règlement de consultation. Cochez celles que vous avez déjà.',
            validate: () => null,
            content: (
              <div className="space-y-3">
                {docs.map((d) => (
                  <div key={d.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={d.available}
                      onChange={(e) =>
                        setDocs(docs.map((x) => (x.id === d.id ? { ...x, available: e.target.checked } : x)))
                      }
                      className="h-4 w-4 shrink-0 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      title="Pièce déjà disponible"
                    />
                    <TextInput
                      value={d.label}
                      onChange={(e) =>
                        setDocs(docs.map((x) => (x.id === d.id ? { ...x, label: e.target.value } : x)))
                      }
                      placeholder="Nom de la pièce"
                    />
                    <Select
                      value={d.category}
                      onChange={(e) =>
                        setDocs(
                          docs.map((x) =>
                            x.id === d.id
                              ? { ...x, category: e.target.value as RequiredDocument['category'] }
                              : x,
                          ),
                        )
                      }
                      className="w-44 shrink-0"
                    >
                      <option value="administratif">Administratif</option>
                      <option value="technique">Technique</option>
                      <option value="financier">Financier</option>
                    </Select>
                    <button
                      type="button"
                      onClick={() => setDocs(docs.filter((x) => x.id !== d.id))}
                      className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-500"
                      aria-label="Supprimer la pièce"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <SecondaryButton
                  onClick={() =>
                    setDocs([
                      ...docs,
                      { id: uid('rd'), label: '', category: 'administratif', available: false },
                    ])
                  }
                >
                  <Plus className="h-4 w-4" /> Ajouter une pièce
                </SecondaryButton>
                <GuideBanner>
                  Après création, l'analyse du DCE pourra compléter automatiquement cette liste —
                  vous n'avez pas besoin d'être exhaustif maintenant.
                </GuideBanner>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
