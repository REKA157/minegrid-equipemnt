import React, { useState } from 'react';
import FinancingSimulator from '../components/FinancingSimulator';
import { Info, Upload, FileText, User, Banknote, FileCheck2, FileSignature, FileSpreadsheet, FileInput, ShieldCheck, ClipboardEdit, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { submitContactMessage } from '../utils/api/contact';
import { toast } from '../utils/toast';

const requiredDocs = [
  { key: 'kbis', label: "Extrait Kbis ou registre de commerce", icon: <FileText className="h-5 w-5 text-primary-600" /> },
  { key: 'statuts', label: "Statuts de la société", icon: <FileSignature className="h-5 w-5 text-primary-600" /> },
  { key: 'cni', label: "Carte d'identité du gérant", icon: <User className="h-5 w-5 text-primary-600" /> },
  { key: 'rib', label: "RIB professionnel", icon: <Banknote className="h-5 w-5 text-primary-600" /> },
  { key: 'bilan', label: "Dernier bilan ou synthèse activité", icon: <FileSpreadsheet className="h-5 w-5 text-primary-600" /> },
  { key: 'devis', label: "Devis ou facture pro forma de l'engin", icon: <FileCheck2 className="h-5 w-5 text-primary-600" /> },
  { key: 'fiche', label: "Fiche technique du matériel", icon: <FileInput className="h-5 w-5 text-primary-600" /> },
];

export default function FinancingRequest() {
  const [uploadedDocs, setUploadedDocs] = useState<{ [key: string]: File | null }>({});
  const [apport, setApport] = useState('');
  const [note, setNote] = useState('');
  const [machinePrice, setMachinePrice] = useState(50000);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user } = useAuth();

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto py-12 px-4">
        <div className="bg-white rounded-xl shadow p-8 text-center">
          <h2 className="text-2xl font-semibold text-gray-900 mb-3">Connexion requise</h2>
          <p className="text-gray-600 mb-6">
            Connectez-vous pour soumettre une demande de financement.
          </p>
          <a
            href="#connexion"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700"
          >
            Aller à la connexion
          </a>
        </div>
      </div>
    );
  }

  const handleFileChange = (key: string, file: File | null) => {
    setUploadedDocs((prev) => ({ ...prev, [key]: file }));
  };

  const handleRemoveFile = (key: string) => {
    setUploadedDocs((prev) => ({ ...prev, [key]: null }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const uploadedList = Object.entries(uploadedDocs)
        .filter(([, file]) => Boolean(file))
        .map(([key, file]) => `- ${key}: ${file?.name}`)
        .join('\n');

      const userEmail = user.email || '';
      const displayName =
        (user.user_metadata?.full_name as string | undefined) ||
        [user.user_metadata?.first_name, user.user_metadata?.last_name].filter(Boolean).join(' ') ||
        'Utilisateur Minegrid';
      const company =
        (user.user_metadata?.company as string | undefined) ||
        (user.user_metadata?.company_name as string | undefined) ||
        '';

      await submitContactMessage({
        name: displayName,
        email: userEmail,
        company: company || null,
        subject: 'Pré-demande de financement (sans engagement)',
        service: 'financing',
        message: [
          `Prix machine estimé: ${machinePrice} EUR`,
          `Apport disponible: ${apport || 'non renseigné'} EUR`,
          '',
          'Note:',
          note || 'Aucune note',
          '',
          'Pièces indiquées par le demandeur (noms seulement, fichiers non transmis à ce stade):',
          uploadedList || 'Aucune pièce indiquée',
        ].join('\n'),
      });

      setSuccess(true);
      toast('Pré-demande de financement transmise (sans engagement).');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue';
      toast(`Envoi impossible pour le moment: ${message}`);
      setSuccess(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">
      <h1 className="text-3xl font-bold mb-4 text-gray-900">Pré-demande de financement</h1>
      <div className="mb-8 p-4 bg-blue-50 rounded-lg border border-blue-200 flex items-start">
        <Info className="h-5 w-5 text-blue-600 mr-3 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-blue-800">
          Cette étape n'engage pas encore un financement. Elle transmet votre intérêt à notre équipe.
          Vos pièces justificatives vous seront demandées après étude par un partenaire financier.
        </p>
      </div>
      {/* Simulateur */}
      <div className="mb-10">
        <FinancingSimulator machinePrice={machinePrice} />
      </div>
      {/* Formulaire de pré-demande */}
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl p-8 space-y-8">
        <h2 className="text-xl font-semibold mb-4 flex items-center text-gray-800">
          <ShieldCheck className="h-6 w-6 text-green-600 mr-2" />
          Pré-demande — Dossier simplifié
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Société</label>
            <input
              type="text"
              value={(user.user_metadata?.company as string | undefined) || (user.user_metadata?.company_name as string | undefined) || ''}
              disabled
              className="w-full rounded-md border border-gray-300 px-3 py-2 bg-gray-50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" value={user.email || ''} disabled className="w-full rounded-md border border-gray-300 px-3 py-2 bg-gray-50" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Gérant</label>
            <input
              type="text"
              value={
                (user.user_metadata?.full_name as string | undefined) ||
                [user.user_metadata?.first_name, user.user_metadata?.last_name].filter(Boolean).join(' ')
              }
              disabled
              className="w-full rounded-md border border-gray-300 px-3 py-2 bg-gray-50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Apport disponible (€)</label>
            <input type="number" value={apport} onChange={e => setApport(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Note explicative (utilité, chantiers visés...)</label>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} className="w-full rounded-md border border-gray-300 px-3 py-2" placeholder="Ex : Achat pour chantier X, client Y..." />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 mb-2 flex items-center">
            <ClipboardEdit className="h-5 w-5 text-primary-600 mr-2" />
            Pièces qui vous seront demandées (à titre indicatif)
          </h3>
          <p className="text-xs text-gray-500 mb-2">
            À ce stade, vous n'avez pas besoin de les téléverser : ces pièces vous seront demandées après étude de
            votre pré-demande par un partenaire financier.
          </p>
          <ul className="space-y-3">
            {requiredDocs.map(doc => (
              <li key={doc.key} className="flex items-center gap-3 bg-primary-50 rounded-lg px-3 py-2">
                {doc.icon}
                <span className="flex-1 text-gray-700">{doc.label}</span>
                {uploadedDocs[doc.key] ? (
                  <span className="flex items-center gap-2">
                    <span className="text-green-700 text-xs font-medium">{uploadedDocs[doc.key]?.name}</span>
                    <button type="button" onClick={() => handleRemoveFile(doc.key)} className="text-red-500 hover:text-red-700"><X className="h-4 w-4" /></button>
                  </span>
                ) : (
                  <label className="inline-block cursor-pointer bg-primary-100 hover:bg-primary-200 text-primary-700 px-3 py-1 rounded-md border border-primary-200 text-xs font-medium transition-colors">
                    <Upload className="h-4 w-4 inline mr-1" />
                    Télécharger
                    <input type="file" className="hidden" onChange={e => handleFileChange(doc.key, e.target.files?.[0] || null)} />
                  </label>
                )}
              </li>
            ))}
          </ul>
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-primary-600 text-white py-3 rounded-xl font-semibold text-lg hover:bg-primary-700 shadow-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Envoi en cours...' : 'Envoyer ma pré-demande'}
        </button>
        {success && (
          <div className="mt-4 p-3 bg-green-50 text-green-800 rounded-lg border border-green-200">
            Votre pré-demande a bien été transmise à notre équipe. Elle n'engage pas encore de financement :
            un conseiller vous recontactera pour étudier votre dossier et vous indiquer les pièces à fournir.
          </div>
        )}
        <div className="mt-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200 flex items-start">
          <Info className="h-5 w-5 text-yellow-600 mr-3 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-yellow-800">
            <p className="font-medium">Pré-demande sans engagement</p>
            <p className="text-xs mt-1">
              Cette pré-demande n'engage ni MineGrid ni vous. Aucun financement n'est encore accordé ni en cours.
              Les pièces justificatives seront demandées lors de l'étude par un partenaire financier.
            </p>
          </div>
        </div>
      </form>
    </div>
  );
} 