import React, { useEffect, useState } from 'react';
import {
  Calendar, MapPin, Star, PenTool as Tool, Scale, ChevronRight,
  ChevronLeft, Phone, Mail, Download, Heart, Share2, Globe
} from 'lucide-react';
import type { Machine, MachineWithPremium } from '../types';
import { isSeller, isOwner } from '../utils/auth';
import supabase from '../utils/supabaseClient';
import MachineTrustPanel from '../nextgen/integration/MachineTrustPanel';
import TransactionOptionsPanel from '../nextgen/integration/TransactionOptionsPanel';
import { MACHINE_LIST_COLUMNS } from '../constants/machineQueryFields';
import { recordMachineView } from '../utils/api';
import {
  buildSrcSet,
  getOptimizedImageUrl,
  handleImageErrorFallback,
} from '../utils/imageOptimization';
import LogisticsSimulator from '../components/LogisticsSimulator';
import TransportCard from '../components/TransportCard';
import PremiumBadge from '../components/PremiumBadge';
import PremiumServices from '../components/PremiumServices';
import FinancingSimulator from '../components/FinancingSimulator';
import Price from '../components/Price';
import { useCurrencyStore } from '../stores/currencyStore';
import { toast } from '../utils/toast';
import { submitQuoteRequest, parseSellerUuid } from '../utils/api/quoteRequests';
import { trackEvent } from '../utils/analytics';
import { logger } from '../utils/logger';
interface MachineDetailProps {
  machineId: string;
}

interface ContactFormData {
  name: string;
  email: string;
  phone: string;
  country: string;
  needByDate?: string;
  message: string;
  offerAmount?: number;
}

interface MachineLegacyFields {
  sellerid?: string | null;
  seller_id?: string | null;
  user_id?: string | null;
  owner_id?: string | null;
  photos?: string[] | null;
}

interface DimensionsLike {
  length?: string | number;
  width?: string | number;
  height?: string | number;
}

function getLegacySellerId(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const v = value as MachineLegacyFields;
  return v.sellerid || v.seller_id || v.user_id || v.owner_id || '';
}

const PLACEHOLDER_SELLER_IDS = new Set([
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000001',
]);

function isPlaceholderSellerUuid(id: string): boolean {
  return PLACEHOLDER_SELLER_IDS.has(id.trim().toLowerCase());
}

/** Priorité alignée avec send-contact-email */
function resolveSellerUuidFromMachineRecord(row: Record<string, unknown>): string | null {
  const keys = ['seller_id', 'sellerid', 'user_id', 'owner_id'] as const;
  for (const k of keys) {
    const raw = row[k];
    if (typeof raw !== 'string') continue;
    const uuid = parseSellerUuid(raw);
    if (uuid && !isPlaceholderSellerUuid(uuid)) return uuid;
  }
  return null;
}

function getLegacyPhotos(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  const v = value as MachineLegacyFields;
  return Array.isArray(v.photos) ? v.photos : [];
}

function getDimensionsVolume(dimensions: unknown): number | undefined {
  if (!dimensions || typeof dimensions !== 'object') return undefined;
  const { length, width, height } = dimensions as DimensionsLike;
  const l = parseFloat(String(length ?? '0'));
  const w = parseFloat(String(width ?? '0'));
  const h = parseFloat(String(height ?? '0'));
  if (!Number.isFinite(l) || !Number.isFinite(w) || !Number.isFinite(h)) return undefined;
  const volume = l * w * h;
  return volume > 0 ? volume : undefined;
}



export default function MachineDetail({ machineId }: MachineDetailProps) {
  const isMissingTableError = (value: unknown): boolean => {
    if (!value || typeof value !== 'object') return false;
    const code = (value as { code?: string }).code;
    const causeCode = (value as { cause?: { code?: string } }).cause?.code;
    return code === 'PGRST205' || causeCode === 'PGRST205';
  };

  const [machineData, setMachineData] = useState<MachineWithPremium | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showContactForm, setShowContactForm] = useState(false);
  // Services souhaités exprimés dans le tunnel de devis (intérêt informatif, pas une transaction).
  const [desiredServices, setDesiredServices] = useState<string[]>([]);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // États pour le formulaire de contact
  const [contactForm, setContactForm] = useState<ContactFormData>({
    name: '',
    email: '',
    phone: '',
    country: '',
    needByDate: '',
    message: '',
    offerAmount: undefined
  });



  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [successMessage, setSuccessMessage] = useState('Votre demande a bien été envoyée.');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  

  
  // 🔄 Récupération de la devise sélectionnée pour forcer le re-render
  const { currentCurrency } = useCurrencyStore();

  useEffect(() => {
    const id = machineId;
    
    if (id) {
      // D'abord, essayer de charger la machine sans la relation seller
      supabase
      .from('machines')
      .select(MACHINE_LIST_COLUMNS)
      .eq('id', id)
      .single()
      .abortSignal(new AbortController().signal)  // Force refresh
      .then(async ({ data, error }) => {
        if (error) {
          console.error('Erreur chargement machine :', error);
          setError('Erreur lors du chargement de la machine. Veuillez réessayer.');
          setLoading(false);
          return;
        }

        let merged: Record<string, unknown> = { ...data };
        const idsPick = await supabase
          .from('machines')
          .select('seller_id,sellerid,user_id,owner_id')
          .eq('id', id)
          .maybeSingle();
        if (!idsPick.error && idsPick.data && typeof idsPick.data === 'object') {
          merged = { ...merged, ...(idsPick.data as Record<string, unknown>) };
        }

        const sellerUid = resolveSellerUuidFromMachineRecord(merged);

        const geoLine =
          [merged.city, merged.region, merged.country]
            .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
            .join(', ') || 'Localisation inconnue';

        const finishSellerAndImages = (machinePayload: MachineWithPremium) => {
          const urls: string[] = [];
          const imgCandidates: string[] = [];
          const md = machinePayload as unknown as MachineLegacyFields & { images?: string[] };
          if (Array.isArray(md.images)) imgCandidates.push(...md.images);
          imgCandidates.push(...getLegacyPhotos(machinePayload));
          imgCandidates.forEach((img: string) => {
            const raw = String(img || '').trim();
            if (!raw) return;
            if (raw.startsWith('http://') || raw.startsWith('https://')) {
              urls.push(raw);
              return;
            }
            const { data: publicUrl } = supabase.storage.from('machine-image').getPublicUrl(raw);
            if (publicUrl?.publicUrl) urls.push(publicUrl.publicUrl);
          });

          const scoreImageUrl = (rawUrl: string): number => {
            const url = String(rawUrl || '').toLowerCase();
            if (!url) return -999;
            let score = 0;
            if (url.includes('original') || url.includes('large') || url.includes('xl')) score += 8;
            if (url.includes('w=2000') || url.includes('w=1600') || url.includes('w=1200')) score += 6;
            else if (url.includes('w=1000') || url.includes('w=900') || url.includes('w=800')) score += 4;
            if (url.includes('thumb') || url.includes('thumbnail') || url.includes('small') || url.includes('icon')) score -= 8;
            if (url.includes('placeholder') || url.includes('default')) score -= 12;
            return score;
          };

          const sortedUrls = [...new Set(urls)].sort((a, b) => scoreImageUrl(b) - scoreImageUrl(a));
          setImageUrls(sortedUrls);
          recordMachineView(id).catch(() => undefined);
        };

        if (sellerUid) {
          supabase
            .from('users')
            .select('id, name, email, location, phone, company_name, description')
            .eq('id', sellerUid)
            .single()
            .then(({ data: sellerData, error: sellerError }) => {
              const basePayload = merged as unknown as MachineWithPremium;
              if (!sellerError && sellerData) {
                const payload: MachineWithPremium = {
                  ...basePayload,
                  seller: {
                    ...sellerData,
                    location:
                      sellerData.location ||
                      geoLine,
                  },
                };
                setMachineData(payload);
                finishSellerAndImages(payload);
              } else {
                if (!isMissingTableError(sellerError)) {
                  console.error('Erreur chargement vendeur:', sellerError);
                }
                const stubPayload: MachineWithPremium = {
                  ...basePayload,
                  seller: {
                    id: sellerUid,
                    name: '',
                    rating: 0,
                    location: geoLine,
                  },
                };
                setMachineData(stubPayload);
                finishSellerAndImages(stubPayload);
              }
              setLoading(false);
            });
        } else {
          const stubPayload: MachineWithPremium = {
            ...(merged as unknown as MachineWithPremium),
            seller: {
              id: getLegacySellerId(merged),
              name: '',
              rating: 0,
              location: geoLine,
            },
          };
          setMachineData(stubPayload);
          finishSellerAndImages(stubPayload);
          setLoading(false);
        }
      });
    } else {
      setLoading(false);
      setError('ID de machine manquant');
    }
  }, [machineId]);

  useEffect(() => {
    if (!machineId) return;
    const stored = window.localStorage.getItem('favorite_machine_ids');
    if (!stored) {
      setIsFavorite(false);
      return;
    }
    try {
      const ids = JSON.parse(stored);
      setIsFavorite(Array.isArray(ids) && ids.includes(machineId));
    } catch {
      setIsFavorite(false);
    }
  }, [machineId]);

  useEffect(() => {
    const hash = window.location.hash || '';
    const query = hash.includes('?') ? hash.split('?')[1] : '';
    const params = new URLSearchParams(query);
    if (params.get('contact') === '1' || params.get('quote') === '1') {
      setShowContactForm(true);
    }
  }, [machineId]);

  if (loading) {
    return (
      <div className="text-center py-24 text-gray-500 text-lg font-semibold">
        Chargement de la machine...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-24 text-red-500 text-lg font-semibold">
        <p className="mb-4">{error}</p>
        <button 
          onClick={() => window.location.reload()} 
          className="bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700"
        >
          Réessayer
        </button>
      </div>
    );
  }

  if (!machineData) {
    return (
      <div className="text-center py-24 text-gray-500 text-lg font-semibold">
        Machine non trouvée
      </div>
    );
  }

  // Vérifier si l'utilisateur peut éditer cette machine
  const canEdit = isSeller() && machineData.seller && isOwner(machineData.seller.id);
  
  const handleDelete = async () => {
    const confirmDelete = window.confirm("Êtes-vous sûr de vouloir supprimer cette annonce ?");
  
    if (confirmDelete) {
      const { error } = await supabase
        .from('machines')
        .delete()
        .eq('id', machineData.id);
  
      if (error) {
        toast("Erreur lors de la suppression.");
        console.error(error);
      } else {
        toast("Annonce supprimée.");
        window.location.hash = '#dashboard/annonces';
      }
    }
  };
  
  const nextImage = () => {
    setCurrentImageIndex((prev) =>
      prev === imageUrls.length - 1 ? 0 : prev + 1
    );
  };

  const prevImage = () => {
    setCurrentImageIndex((prev) =>
      prev === 0 ? imageUrls.length - 1 : prev - 1
    );
  };

  const downloadTechSheet = async () => {
    const model = machineData?.model || machineData?.name || "fiche-technique";
    const scrapePdfUrl = import.meta.env.VITE_N8N_SCRAPE_PDF_URL || '';

    try {
      const response = await fetch(
        `${scrapePdfUrl}?model=${encodeURIComponent(model)}`
      );

      if (!response.ok) {
        toast("❌ Erreur lors du téléchargement");
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `${model}_techsheet.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Erreur téléchargement fiche :", error);
      toast("❌ Une erreur est survenue.");
    }
  };

  const toggleFavorite = () => {
    if (!machineId) return;
    const stored = window.localStorage.getItem('favorite_machine_ids');
    let ids: string[] = [];
    try {
      ids = stored ? JSON.parse(stored) : [];
      if (!Array.isArray(ids)) ids = [];
    } catch {
      ids = [];
    }

    const nextIds = isFavorite ? ids.filter((id) => id !== machineId) : [...new Set([...ids, machineId])];
    window.localStorage.setItem('favorite_machine_ids', JSON.stringify(nextIds));
    setIsFavorite(!isFavorite);
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}${window.location.pathname}#machines/${machineId}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: machineData?.name || 'Annonce machine',
          text: machineData?.model || '',
          url: shareUrl,
        });
        setShareFeedback('Lien partagé');
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setShareFeedback('Lien copié');
      } else {
        window.prompt('Copiez ce lien :', shareUrl);
        setShareFeedback('Lien prêt à copier');
      }
    } catch {
      setShareFeedback('Partage annulé');
    } finally {
      window.setTimeout(() => setShareFeedback(null), 2000);
    }
  };

  // Fonction pour gérer les changements dans le formulaire de contact
  const handleContactFormChange = (field: keyof ContactFormData, value: string | number | undefined) => {
    setContactForm(prev => ({
      ...prev,
      [field]: value
    }));
  };



  // Fonction pour envoyer l'email de contact
  const handleSendContactEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation du formulaire
    if (!contactForm.name.trim() || !contactForm.email.trim() || !contactForm.message.trim()) {
      setEmailError('Veuillez remplir tous les champs obligatoires.');
      return;
    }

    if (!contactForm.email.includes('@')) {
      setEmailError('Veuillez entrer une adresse email valide.');
      return;
    }

    setSendingEmail(true);
    setEmailError(null);
    setSuccessMessage('Votre demande a bien été envoyée.');

    try {
      const sellerIdRaw = machineData?.seller?.id || getLegacySellerId(machineData) || null;
      const sellerId = typeof sellerIdRaw === 'string' ? parseSellerUuid(sellerIdRaw) : null;

      // Joindre les services souhaités à la demande (intérêt informatif, jamais une transaction).
      const messageWithServices = desiredServices.length
        ? `${contactForm.message}\n\nServices souhaités (en attente d'intégration partenaire) : ${desiredServices.join(', ')}`
        : contactForm.message;

      let quoteSubmit: Awaited<ReturnType<typeof submitQuoteRequest>> | null = null;
      try {
        quoteSubmit = await submitQuoteRequest({
          machine_id: machineId,
          machine_name: machineData?.name || 'Machine',
          brand: machineData?.brand || null,
          seller_id: sellerId,
          buyer_name: contactForm.name,
          buyer_email: contactForm.email,
          buyer_phone: contactForm.phone || null,
          country: contactForm.country || null,
          budget_max: contactForm.offerAmount || null,
          need_by_date: contactForm.needByDate || null,
          message: messageWithServices,
          source: 'machine_detail_contact_form',
        });
        trackEvent('lead_submit', {
          source: 'machine_detail_contact_form',
          has_budget: Boolean(contactForm.offerAmount),
        });
      } catch (quoteErr) {
        logger.warn('[MachineDetail] quote request échouée', quoteErr);
        if (isMissingTableError(quoteErr)) {
          setEmailError('Le service devis n\'est pas encore activé. Contactez l\'administrateur.');
        } else {
          setEmailError('Votre demande n\'a pas pu être enregistrée. Veuillez réessayer.');
        }
        return;
      }

      const sellerNotifyEmail =
        typeof machineData?.seller?.email === 'string' ? machineData.seller.email.trim() : '';
      logger.info('[MachineDetail] envoi notification vendeur', {
        machineId,
        sellerUuidForQuote: sellerId,
        sellerEmailFromUsersTable: sellerNotifyEmail ? '[présent]' : '[absent]',
      });

      // Envoi email best-effort: la demande reste valide meme si l'email echoue.
      const inboxFallback =
        (import.meta.env.VITE_CONTACT_RECEIVER_EMAIL as string | undefined)?.trim() ||
        'contact@minegrid-equipment.com';
      const { data: emailData, error: emailError } = await supabase.functions.invoke('send-contact-email', {
        body: {
          // Doit être identique à CONTACT_RECEIVER_EMAIL (Supabase) si le routage automatique échoue
          to: inboxFallback,
          from: contactForm.email,
          subject: `Demande d'information - ${machineData?.name}`,
          html: `
            <h2>Nouvelle demande d'information</h2>
            <p><strong>Machine :</strong> ${machineData?.name}</p>
            <p><strong>Nom :</strong> ${contactForm.name}</p>
            <p><strong>Email :</strong> ${contactForm.email}</p>
            <p><strong>Téléphone :</strong> ${contactForm.phone || 'Non renseigné'}</p>
            <p><strong>Message :</strong></p>
            <p>${messageWithServices.replace(/\n/g, '<br>')}</p>
          `,
          machineId,
        },
      });

      const emailRoute =
        emailData &&
        typeof emailData === 'object' &&
        'routing' in emailData &&
        typeof (emailData as { routing?: unknown }).routing === 'string'
          ? (emailData as { routing: string }).routing
          : '';

      const emailDeliveredHint =
        emailRoute === 'machine_owner'
          ? ' Notification envoyée au vendeur / loueur (email du compte Auth). Si cet email est différent de la boîte CONTACT du site, une copie est aussi envoyée à cette boîte pour traçabilité.'
          : emailRoute === 'fallback_inbox'
            ? ' L’email n’a été envoyé qu’à la boîte générique : le vendeur n’a pas pu être identifié (annonce sans vendeur valide, ou clé service absente sur la fonction).'
            : '';

      const dossierHint = (() => {
        if (!quoteSubmit) return '';
        if (quoteSubmit.transactionCaseId) {
          if (quoteSubmit.participantsLinked === false) {
            return ` Dossier ouvert : #dossier/${quoteSubmit.transactionCaseId}. Les lignes « participants » n’ont pas pu être enregistrées (policy RLS) — déployez sql/patch_transaction_participants_insert_buyer.sql ou sql/transaction_platform_extended.sql puis réessayez une nouvelle demande si besoin.`;
          }
          return ` Dossier ouvert : #dossier/${quoteSubmit.transactionCaseId}.`;
        }
        if (!quoteSubmit.buyerLoggedIn) {
          return ' Connectez-vous avec le même compte pour qu’un dossier transaction soit créé automatiquement.';
        }
        if (!quoteSubmit.sellerResolved) {
          return ' Le vendeur n’a pas été identifié sur l’annonce : aucun dossier automatique.';
        }
        if (quoteSubmit.buyerLoggedIn && quoteSubmit.sellerResolved && !quoteSubmit.linkAttempted) {
          return ' Vous êtes le vendeur de cette annonce : aucun dossier automatique pour une demande sur votre propre machine.';
        }
        if (quoteSubmit.linkAttempted && !quoteSubmit.transactionCaseId) {
          return ' La demande est bien enregistrée ; la liaison dossier a échoué (vérifiez tables transaction + RLS sur quote_requests).';
        }
        return '';
      })();

      if (emailError) {
        logger.warn('[MachineDetail] devis enregistré, email non envoyé', emailError);
        setSuccessMessage(
          `Demande enregistrée. Notification email temporairement indisponible.${dossierHint}`,
        );
      } else {
        logger.info('[MachineDetail] email acheteur → vendeur / boîte', { routing: emailRoute, ok: Boolean(emailData) });
        setSuccessMessage(`Demande enregistrée et envoyée.${emailDeliveredHint}${dossierHint}`);
      }

      // Succès
      setEmailSent(true);
      setContactForm({
        name: '',
        email: '',
        phone: '',
        country: '',
        needByDate: '',
        message: '',
        offerAmount: undefined
      });

      // Fermer le formulaire après 3 secondes
      setTimeout(() => {
        setShowContactForm(false);
        setEmailSent(false);
      }, 3000);

    } catch (error) {
      logger.error('[MachineDetail] erreur envoi contact', error);
      setEmailError('Une erreur est survenue lors de l\'envoi. Veuillez réessayer.');
    } finally {
      setSendingEmail(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Fil d'Ariane */}
      <div className="flex items-center text-sm text-gray-500 mb-8">
        <a href="#" className="hover:text-primary-600">Accueil</a>
        <ChevronRight className="h-4 w-4 mx-2" />
        <a href="#machines" className="hover:text-primary-600">Machines</a>
        <ChevronRight className="h-4 w-4 mx-2" />
        <a href={`#machines?categorie=${machineData.category.toLowerCase()}`} className="hover:text-primary-600">
          {machineData.category}
        </a>
        <ChevronRight className="h-4 w-4 mx-2" />
        <span className="text-gray-900">{machineData.name}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Galerie */}
        <div className="lg:col-span-2">
          <div className="relative bg-gray-100 rounded-lg overflow-hidden">
            {(() => {
              const originalMain =
                imageUrls[currentImageIndex] || '/public/image/Lentretien-de-premier-niveau-du-bouteur.jpg';
              const optimizedMain = getOptimizedImageUrl(originalMain, {
                width: 1600,
                quality: 85,
                resize: 'cover',
              });
              return (
                <img
                  src={optimizedMain}
                  srcSet={buildSrcSet(originalMain, 1200, 85) || undefined}
                  sizes="(max-width: 1024px) 100vw, 66vw"
                  alt={machineData.name}
                  decoding="async"
                  className="w-full h-[500px] object-cover"
                  onError={(e) => {
                    // 1er essai : URL originale sans transformation Supabase.
                    if (e.currentTarget.dataset.fallbackApplied !== '1') {
                      handleImageErrorFallback(e, originalMain);
                      return;
                    }
                    // 2e essai : placeholder local.
                    e.currentTarget.src = '/public/image/Lentretien-de-premier-niveau-du-bouteur.jpg';
                  }}
                />
              );
            })()}
            {imageUrls.length > 1 && (
              <>
                <button onClick={prevImage} className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/80 p-2 rounded-full hover:bg-white">
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button onClick={nextImage} className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/80 p-2 rounded-full hover:bg-white">
                  <ChevronRight className="h-6 w-6" />
                </button>
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex space-x-2">
                  {imageUrls.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentImageIndex(index)}
                      className={`w-2 h-2 rounded-full ${index === currentImageIndex ? 'bg-white' : 'bg-white/50'}`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="grid grid-cols-4 gap-4 mt-4">
            {imageUrls.map((image, index) => {
              const thumb = getOptimizedImageUrl(image, { width: 300, quality: 75, resize: 'cover' });
              return (
                <button
                  key={index}
                  onClick={() => setCurrentImageIndex(index)}
                  className={`relative rounded-lg overflow-hidden ${index === currentImageIndex ? 'ring-2 ring-primary-500 shadow-lg' : ''}`}
                >
                  <img
                    src={thumb}
                    srcSet={buildSrcSet(image, 300, 75) || undefined}
                    alt={`Vue ${index + 1}`}
                    loading="lazy"
                    decoding="async"
                    onError={(e) => handleImageErrorFallback(e, image)}
                    className="w-full h-24 object-cover"
                  />
                </button>
              );
            })}
          </div>
          <div className="bg-white rounded-lg shadow-md p-6 mt-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Description</h2>
            <div className="prose prose-lg max-w-none">
              {(machineData.description || '').split('\n').map((p, i) => (
                <p key={i} className="mb-4">{p}</p>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6 mt-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Spécifications techniques</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Dimensions et poids</h3>
                <ul className="space-y-2">
                  <li className="flex justify-between">
                    <span className="text-gray-600">Dimensions</span>
                    <span className="font-medium">
                      {typeof machineData.specifications.dimensions === 'string'
                        ? machineData.specifications.dimensions
                        : 'Format incorrect'}
                    </span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-gray-600">Poids en ordre de marche</span>
                    <span className="font-medium">{machineData.specifications.workingWeight ? machineData.specifications.workingWeight.toLocaleString() : '0'} kg</span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-gray-600">Capacité opérationnelle</span>
                    <span className="font-medium">{machineData.specifications.operatingCapacity ? machineData.specifications.operatingCapacity.toLocaleString() : '0'} kg</span>
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Motorisation</h3>
                <ul className="space-y-2">
                  <li className="flex justify-between">
                    <span className="text-gray-600">Puissance</span>
                    <span className="font-medium">
                      {machineData.specifications.power?.value && machineData.specifications.power?.unit 
                        ? `${machineData.specifications.power.value} ${machineData.specifications.power.unit}`
                        : 'Non spécifié'
                      }
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Simulateur de transport International déplacé ici */}
          <div className="mt-8">
            <LogisticsSimulator 
              key={`logistics-${currentCurrency}`}
              machineWeight={machineData.specifications.weight ? machineData.specifications.weight / 1000 : undefined}
              machineVolume={getDimensionsVolume(machineData.specifications.dimensions)}
              machineValue={machineData.price || undefined}
              isPremium={!!machineData.premium}
            />
          </div>
        </div>

        {/* Infos machine */}
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{machineData.name}</h1>
                <p className="text-lg text-gray-600">{machineData.brand} {machineData.model}</p>
                {machineData.type && (
                  <p className="text-sm text-gray-500">Catégorie technique : {machineData.type}</p>
                )}
                {machineData.category && (
                  <p className="text-sm text-gray-500">Secteur : {machineData.category}</p>
                )}
                
                {/* Badges Premium */}
                {machineData.premium && (
                  <div className="mt-2">
                    <PremiumBadge premium={machineData.premium} />
                  </div>
                )}
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={toggleFavorite}
                  className={`p-2 transition-colors ${isFavorite ? 'text-red-500' : 'text-gray-500 hover:text-orange-600'}`}
                  title={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                  aria-label={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                >
                  <Heart className="h-6 w-6" />
                </button>
                <button
                  onClick={handleShare}
                  className="p-2 text-gray-500 hover:text-orange-600 transition-colors"
                  title="Partager l'annonce"
                  aria-label="Partager l'annonce"
                >
                  <Share2 className="h-6 w-6" />
                </button>
              </div>
            </div>
            {shareFeedback && (
              <p className="mb-3 text-sm text-green-600">{shareFeedback}</p>
            )}

            <div className="text-3xl font-bold text-orange-600 mb-6">
              {machineData.price ? (
                <Price amount={machineData.price} showOriginal className="text-3xl font-bold text-orange-600" />
              ) : (
                '0 €'
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="flex items-center text-gray-600"><Calendar className="h-5 w-5 mr-2" /><span>{machineData.year}</span></div>
              <div className="flex items-center text-gray-600"><MapPin className="h-5 w-5 mr-2" /><span>{machineData.seller?.location}</span></div>
              <div className="flex items-center text-gray-600">
                <Tool className="h-5 w-5 mr-2" />
                <span>
                  {machineData.specifications.power?.value && machineData.specifications.power?.unit 
                    ? `${machineData.specifications.power.value} ${machineData.specifications.power.unit}`
                    : 'Non spécifié'
                  }
                </span>
              </div>
              <div className="flex items-center text-gray-600"><Scale className="h-5 w-5 mr-2" /><span>{machineData.specifications.weight ? machineData.specifications.weight.toLocaleString() : '0'} kg</span></div>
            </div>

            <MachineTrustPanel
              machineId={machineId}
              sellerId={machineData.seller?.id ? String(machineData.seller.id) : null}
              price={machineData.price ? Number(machineData.price) : null}
              year={machineData.year}
              brand={(machineData as { brand?: string }).brand ?? null}
              model={(machineData as { model?: string }).model ?? null}
              category={(machineData as { category?: string }).category ?? null}
              country={machineData.seller?.location ?? null}
              hasImages={Array.isArray((machineData as { images?: unknown[] }).images) && ((machineData as { images?: unknown[] }).images?.length ?? 0) > 0}
            />

            <div className="space-y-4">
              <button onClick={() => setShowContactForm(!showContactForm)} className="w-full bg-orange-600 text-white px-6 py-3 rounded-md hover:bg-orange-700 transition-colors flex items-center justify-center">
                <Mail className="h-5 w-5 mr-2" />
                Contacter le vendeur
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowContactForm(true);
                  trackEvent('quote_cta_click', { origin: 'machine_detail' });
                }}
                className="w-full border border-orange-300 text-orange-700 px-6 py-3 rounded-md hover:bg-orange-50 transition-colors flex items-center justify-center"
              >
                Demander un devis
              </button>
              <button className="w-full border border-gray-300 text-gray-700 px-6 py-3 rounded-md hover:bg-gray-50 flex items-center justify-center" onClick={downloadTechSheet}>
                <Download className="h-5 w-5 mr-2" />
                Télécharger la fiche technique
              </button>
              {machineData.seller?.id ? (
                <button 
                  onClick={() => window.location.hash = `#vitrine/${machineData.seller.id}`}
                  className="w-full border border-blue-300 text-blue-700 px-6 py-3 rounded-md hover:bg-blue-50 flex items-center justify-center"
                >
                  <Globe className="h-5 w-5 mr-2" />
                  Voir vitrine du professionnel
                </button>
              ) : (
                <button 
                  onClick={() => {
                    toast('Informations du vendeur non disponibles pour cette annonce.');
                  }}
                  className="w-full border border-gray-300 text-gray-500 px-6 py-3 rounded-md hover:bg-gray-50 flex items-center justify-center cursor-not-allowed"
                  disabled
                >
                  <Globe className="h-5 w-5 mr-2" />
                  Vitrine non disponible
                </button>
              )}
              {canEdit && (
                <div className="pt-4 border-t space-y-2">
                  <button className="w-full text-sm text-blue-600 hover:underline" onClick={() => toast("Formulaire d'édition à venir")}>
                    ✏️ Modifier cette annonce
                  </button>
                  <button className="w-full text-sm text-blue-600 hover:underline" onClick={() => imageUrls.forEach((img) => window.open(img, '_blank'))}>
                    📥 Télécharger les images
                  </button>
                  <button
                    className="w-full text-sm text-red-600 hover:underline"
                    onClick={handleDelete}
                  >
                    🗑 Supprimer cette annonce
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Formulaire de contact dynamique, apparition fluide */}
          {showContactForm && (
            <div className="bg-white rounded-lg shadow-md p-6 transition-all duration-300 ease-in-out">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Contacter le vendeur</h2>

              {canEdit ? (
                <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
                  <p className="font-medium text-amber-900">À propos des notifications (vous êtes le vendeur de cette annonce)</p>
                  {machineData.seller?.email ? (
                    <p className="mt-1">
                      L’email affiché pour vous dans le profil public{' '}
                      <code className="text-xs bg-white/70 px-1 rounded border border-amber-200/80">users</code> est :{' '}
                      <strong className="break-all">{machineData.seller.email}</strong>
                      <span className="block text-xs text-amber-900/85 mt-1.5">
                        L’Edge Function envoie en priorité l’email du compte Auth pour l’UUID vendeur (
                        {String(machineData.seller.id).slice(0, 8)}…), qui peut différer si la table{' '}
                        <code className="text-xs">users</code> n’est pas à jour.
                      </span>
                    </p>
                  ) : (
                    <p className="mt-1 text-amber-900/90">
                      Aucun email n’a été trouvé dans la table <code className="text-xs bg-white/70 px-1 rounded">users</code> pour
                      le vendeur de cette annonce. Vérifiez en base les colonnes{' '}
                      <code className="text-xs">seller_id</code>, <code className="text-xs">sellerid</code>,{' '}
                      <code className="text-xs">user_id</code>, <code className="text-xs">owner_id</code> et la ligne correspondante dans{' '}
                      <code className="text-xs">users</code> / <code className="text-xs">auth.users</code>.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-gray-500 mb-4">
                  Votre demande sera transmise au propriétaire de l’annonce sur l’adresse email liée à son compte (non affichée sur cette page).
                </p>
              )}
              
              {emailSent ? (
                <div className="text-center py-8">
                  <div className="text-green-600 text-6xl mb-4">✓</div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Demande envoyée !</h3>
                  <p className="text-gray-600">{successMessage}</p>
                </div>
              ) : (
                <form onSubmit={handleSendContactEmail} className="space-y-4">
                  {emailError && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
                      {emailError}
                    </div>
                  )}
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nom complet <span className="text-red-500">*</span>
                    </label>
                    <input 
                      type="text" 
                      value={contactForm.name}
                      onChange={(e) => handleContactFormChange('name', e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-orange-500 focus:border-orange-500" 
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email <span className="text-red-500">*</span>
                    </label>
                    <input 
                      type="email" 
                      value={contactForm.email}
                      onChange={(e) => handleContactFormChange('email', e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-orange-500 focus:border-orange-500" 
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Téléphone
                    </label>
                    <input 
                      type="tel" 
                      value={contactForm.phone}
                      onChange={(e) => handleContactFormChange('phone', e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-orange-500 focus:border-orange-500" 
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Pays
                    </label>
                    <input
                      type="text"
                      value={contactForm.country || ''}
                      onChange={(e) => handleContactFormChange('country', e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-orange-500 focus:border-orange-500"
                      placeholder="Ex: Maroc, Côte d'Ivoire..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Besoin avant (date souhaitée)
                    </label>
                    <input
                      type="date"
                      value={contactForm.needByDate || ''}
                      onChange={(e) => handleContactFormChange('needByDate', e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-orange-500 focus:border-orange-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Montant de votre offre (MAD) <span className="text-gray-400">(optionnel)</span>
                    </label>
                    <input 
                      type="number" 
                      min="1"
                      step="1000"
                      value={contactForm.offerAmount || ''}
                      onChange={(e) => handleContactFormChange('offerAmount', parseFloat(e.target.value) || undefined)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-orange-500 focus:border-orange-500" 
                      placeholder="Ex: 140000 (si vous voulez faire une offre)"
                    />
                    {contactForm.offerAmount && (
                      <p className="text-sm text-gray-600 mt-1">
                        Prix de vente : {machineData?.price?.toLocaleString()} MAD | 
                        Votre offre : {contactForm.offerAmount.toLocaleString()} MAD
                      </p>
                    )}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Message <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      rows={4}
                      value={contactForm.message}
                      onChange={(e) => handleContactFormChange('message', e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-orange-500 focus:border-orange-500"
                      placeholder={`Bonjour,\nJe suis intéressé par votre ${machineData?.name}.\nPouvez-vous me donner plus d'informations ?\nMerci.`}
                      required
                    />
                  </div>

                  <TransactionOptionsPanel value={desiredServices} onChange={setDesiredServices} />

                  <div className="flex space-x-3">
                    <button 
                      type="submit" 
                      disabled={sendingEmail}
                      className="flex-1 bg-orange-600 text-white px-6 py-3 rounded-md hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                    >
                      {sendingEmail ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Envoi...
                        </>
                      ) : (
                        'Envoyer le message'
                      )}
                    </button>
                    
                    <button 
                      type="button"
                      onClick={() => setShowContactForm(false)}
                      className="px-6 py-3 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
                    >
                      Annuler
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}



          {/* Services Premium (si propriétaire) */}
          {canEdit && (
            <PremiumServices
              machineId={machineData.id}
              machineName={machineData.name}
              currentPrice={machineData.price || 0}
              isOwner={true}
            />
          )}

          {/* Carte de transport rapide */}
          <TransportCard 
            machineWeight={machineData.specifications.weight ? machineData.specifications.weight / 1000 : undefined}
            machineVolume={getDimensionsVolume(machineData.specifications.dimensions)}
          />

          {/* Simulateur de financement */}
          <FinancingSimulator 
            machinePrice={machineData.price || 0}
          />
        </div>
      </div>
    </div>
  );
}
