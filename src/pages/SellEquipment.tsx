import React, { useEffect, useState, ChangeEvent } from 'react';
import { Upload, Plus, X, Camera, Info, FileSpreadsheet } from 'lucide-react';
import { publishMachine, getCurrentUser } from '../utils/api';
import { brands } from '../data/brands';
import { categories } from '../data/categories';
import { fetchModelSpecs, fetchModelSpecsFull, toSellEquipmentForm, summarizeSpecs, missingForSell } from '../services/autoSpecsService';
import { logger } from '../utils/logger';
import { toast } from '../utils/toast';
import { generateListingCopy } from '../utils/api/aiListing';
// NOTE: 'exceljs' (~600 kB minifie) est importe dynamiquement dans
// handleExcelFileUpload ci-dessous. Cela evite d'alourdir le chunk de la
// page SellEquipment pour les utilisateurs qui ne font pas d'import Excel.

/**
 * Encode un ArrayBuffer en base64 par blocs de 32 ko.
 * FE-04 : l'ancienne forme `btoa(String.fromCharCode(...new Uint8Array(buf)))`
 * depassait la taille maximale de la pile d'appels des ~100-125 ko.
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const octets = new Uint8Array(buffer);
  const TAILLE_BLOC = 0x8000; // 32 ko
  let binaire = '';
  for (let i = 0; i < octets.length; i += TAILLE_BLOC) {
    binaire += String.fromCharCode(...octets.subarray(i, i + TAILLE_BLOC));
  }
  return btoa(binaire);
}

// FE-03 : bornes appliquees aux DEUX chemins d'ajout d'images.
const MAX_IMAGES = 8;
const MAX_IMAGE_MB = 10;
const MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024;

/**
 * A18-001 / A18-002 — import de parc.
 *
 * Le navigateur poste le classeur directement au service d'import. Deux
 * consequences que le code ne montre pas :
 *
 * 1. Aucun secret ne peut etre place ici. `import.meta.env.*` et les chaines
 *    litterales sont incrustes tels quels par Vite : tout en-tete d'authentification
 *    ecrit dans ce fichier est servi a chaque visiteur dans le bundle. L'en-tete
 *    `x-auth-token` qui s'y trouvait n'authentifiait donc personne ; il a ete
 *    retire. L'authentification de l'import doit se faire cote serveur.
 * 2. Sans URL configuree, `fetch('')` designe le document courant : le serveur
 *    de la SPA repond 200 + index.html et l'ecran annoncait un succes alors que
 *    rien n'etait parti. On coupe donc en amont plutot que d'appeler dans le vide.
 */
function urlImportParc(): string {
  return (import.meta.env.VITE_N8N_IMPORT_PARC_URL as string | undefined)?.trim() ?? '';
}

const equipmentNames = categories.flatMap(cat =>
  cat.subcategories?.map(sub => sub.name) || []
);

interface ImageFile extends File {
  preview?: string;
}

export default function SellEquipment() {
  const [images, setImages] = useState<ImageFile[]>([]);
  // FE-01 : verrou anti double-soumission de la publication.
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    brand: '',
    model: '',
    category: '',
    type: '',
    year: new Date().getFullYear(),
    price: '',
    condition: 'used',
    total_hours: '',
    description: '',
    specifications: {
      weight: '',
      dimensions: {
        length: '',
        width: '',
        height: ''
      },
      power: {
        value: '',
        unit: 'kW'
      },
      operatingCapacity: {
        value: '',
        unit: 'kg'
      },
      workingWeight: ''
    }
  });

  // ✨ Rédaction d'annonce par l'IA connectée (titre + description)
  const [aiWriting, setAiWriting] = useState(false);

  // 🔁 Import Excel vers n8n
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelData, setExcelData] = useState<any[]>([]);
  const [imagesExcelUpload, setImagesExcelUpload] = useState<ImageFile[]>([]);
  const [detectedImageLinks, setDetectedImageLinks] = useState<string[]>([]);
  const [showImportSection, setShowImportSection] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const importParcUrl = urlImportParc();
  const importParcDisponible = importParcUrl !== '';

  const handleExcelFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      toast('Veuillez sélectionner un fichier Excel (.xlsx, .xls) ou CSV');
      return;
    }

    setExcelFile(file);
    try {
      const buffer = await file.arrayBuffer();
      const { default: ExcelJS } = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const worksheet = workbook.worksheets[0];
      if (!worksheet) { toast('Aucune feuille trouvée'); return; }

      const headers: string[] = [];
      worksheet.getRow(1).eachCell((cell, colNum) => {
        headers[colNum - 1] = String(cell.value ?? `col_${colNum}`);
      });

      const jsonData: Record<string, any>[] = [];
      worksheet.eachRow((row, rowNum) => {
        if (rowNum === 1) return;
        const obj: Record<string, any> = {};
        row.eachCell((cell, colNum) => {
          const key = headers[colNum - 1] ?? `col_${colNum}`;
          obj[key] = cell.value;
        });
        if (Object.keys(obj).length) jsonData.push(obj);
      });

      setExcelData(jsonData);

      const imageLinks: string[] = [];
      if (jsonData.length > 0) {
        const firstRow = jsonData[0];
        const imageColumns = Object.keys(firstRow).filter(key =>
          key.toLowerCase().includes('image') ||
          key.toLowerCase().includes('photo') ||
          key.toLowerCase().includes('img') ||
          key.toLowerCase().includes('url')
        );

        jsonData.forEach((typedRow) => {
          imageColumns.forEach(col => {
            const value = typedRow[col];
            if (value && typeof value === 'string') {
              if (value.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i) ||
                  value.startsWith('http') ||
                  value.startsWith('https')) {
                imageLinks.push(value);
              }
            }
          });
        });
      }

      setDetectedImageLinks(imageLinks);

    } catch (error) {
      if (import.meta.env.DEV) logger.error('Erreur lecture Excel:', error);
      toast('Erreur lors de la lecture du fichier Excel');
    }
  };

  const handleExcelImagesUpload = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files) as File[];
    const newImages = files.map(file => Object.assign(file, {
      preview: URL.createObjectURL(file)
    })) as ImageFile[];
    setImagesExcelUpload(prev => [...prev, ...newImages]);
  };

  const removeExcelImage = (index: number) => {
    setImagesExcelUpload(prev => {
      const newImages = [...prev];
      URL.revokeObjectURL(newImages[index].preview || '');
      newImages.splice(index, 1);
      return newImages;
    });
  };

  const handleExcelSubmit = async () => {
    if (!excelFile) {
      toast("Veuillez sélectionner un fichier Excel");
      return;
    }

    if (!importParcDisponible) {
      toast.error(
        "L'import de parc est indisponible : aucun service d'import n'est configuré sur cette installation. Publiez vos machines une par une avec le formulaire ci-dessous."
      );
      return;
    }

    setIsImporting(true);
    try {
      const user = await getCurrentUser();

      if (!user) {
        toast("Vous devez être connecté pour importer des machines.");
        setIsImporting(false);
        return;
      }

      if (!user.id) {
        toast.error("Impossible de récupérer votre identifiant. Veuillez vous reconnecter.");
        setIsImporting(false);
        return;
      }

      const arrayBuffer = await excelFile.arrayBuffer();
      // FE-04 : `String.fromCharCode(...tableau)` etale tout le fichier dans la
      // pile d'appels et leve RangeError des ~100 ko, ce qui rendait l'import de
      // parc inutilisable pour tout fichier reel. Encodage par blocs.
      const base64 = arrayBufferToBase64(arrayBuffer);

      // A18-001 : `sellerId` est DECLARE par le navigateur, il n'est pas prouve.
      // Le service d'import doit deriver l'identite du vendeur d'un jeton verifie
      // cote serveur, pas de ce champ. Tant que l'import ne transite pas par une
      // fonction serveur, cette valeur reste une simple affirmation du client.
      const jsonData = {
        excelFile: {
          name: excelFile.name,
          type: excelFile.type,
          size: excelFile.size,
          data: base64
        },
        sellerId: user.id,
        imageLinks: detectedImageLinks.length > 0 ? detectedImageLinks : [],
        // Les images uploadées seront traitées séparément si nécessaire
        metadata: {
          sellerId: user.id,
          userId: user.id,
          userEmail: user.email,
          timestamp: new Date().toISOString(),
          totalMachines: excelData.length
        }
      };
      
      const response = await fetch(importParcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(jsonData),
      });

      const rawText = await response.text();

      if (!response.ok) {
        toast.error(
          `Le service d'import a refusé l'envoi (code HTTP ${response.status}). Aucune annonce n'a été créée.`
        );
        return;
      }

      // A18-002 : un 200 ne suffit pas. Une URL qui ne pointe pas sur le service
      // d'import (page d'accueil, portail d'authentification, proxy) repond elle
      // aussi 200, mais en HTML. Seul un accuse de reception JSON atteste que le
      // fichier a bien ete remis au service.
      if (!rawText.trim()) {
        toast.info(
          "Le service d'import a répondu sans accusé de réception : impossible de confirmer que le fichier a été pris en compte. Vérifiez votre tableau de bord."
        );
        return;
      }

      let accuse: Record<string, unknown>;
      try {
        accuse = JSON.parse(rawText) as Record<string, unknown>;
      } catch {
        toast.error(
          "La réponse reçue n'est pas un accusé de réception d'import : l'envoi n'a pas abouti. Aucune annonce n'a été créée."
        );
        return;
      }

      if (!accuse || typeof accuse !== 'object' || accuse.error || accuse.success === false) {
        toast.error("Le service d'import a refusé le fichier. Aucune annonce n'a été créée.");
        return;
      }

      // Le traitement du classeur est asynchrone et hors de portee de cette page :
      // on accuse la REMISE du fichier, jamais la creation des annonces.
      toast.success(
        `Fichier remis au service d'import (${excelData.length} machine${excelData.length > 1 ? 's' : ''}). Les annonces ne seront créées qu'une fois le traitement terminé côté serveur : vérifiez votre tableau de bord.`
      );
      setExcelData([]);
      setImagesExcelUpload([]);
      setExcelFile(null);
      setShowImportSection(false);
    } catch (error) {
      if (import.meta.env.DEV) logger.error("Erreur d'import de parc:", error);
      toast.error(
        "L'envoi du fichier a échoué : " +
          (error instanceof Error ? error.message : String(error)) +
          '. Aucune annonce n\'a été créée.'
      );
    } finally {
      setIsImporting(false);
    }
  };

  // FE-03 : le glisser-deposer filtrait le type et plafonnait a MAX_IMAGES,
  // mais le selecteur de fichiers n'imposait RIEN : on pouvait ajouter 50
  // fichiers ou un fichier de 300 Mo (onglet fige, uploads interminables).
  // Regle unique, partagee par les deux chemins d'ajout.
  const addImages = (files: File[]) => {
    const rejected: string[] = [];
    const accepted = files.filter(file => {
      if (!file.type.startsWith('image/')) {
        rejected.push(`${file.name} (type non image)`);
        return false;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        rejected.push(`${file.name} (superieur a ${MAX_IMAGE_MB} Mo)`);
        return false;
      }
      return true;
    });

    if (rejected.length) {
      toast(`Image(s) ignoree(s) : ${rejected.join(', ')}`);
    }

    const remainingSlots = MAX_IMAGES - images.length;
    if (remainingSlots <= 0) {
      toast(`Maximum ${MAX_IMAGES} images autorisees.`);
      return;
    }

    const filesToAdd = accepted.slice(0, remainingSlots);
    if (accepted.length > remainingSlots) {
      toast(`Seules ${remainingSlots} image(s) ont ete ajoutees. Maximum ${MAX_IMAGES} images autorisees.`);
    }
    if (!filesToAdd.length) return;

    setImages(prev => [...prev, ...filesToAdd.map(file => Object.assign(file, {
      preview: URL.createObjectURL(file),
    }))]);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    addImages(Array.from(e.target.files || []));
    // Permet de re-selectionner le meme fichier apres un rejet.
    e.target.value = '';
  };

  // 🔄 Fonctionnalité de glisser-déposer pour les images
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const dropZone = e.currentTarget as HTMLElement;
    dropZone.classList.add('border-blue-500', 'bg-blue-50');
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const dropZone = e.currentTarget as HTMLElement;
    dropZone.classList.add('border-blue-500', 'bg-blue-50');
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const dropZone = e.currentTarget as HTMLElement;
    dropZone.classList.remove('border-blue-500', 'bg-blue-50');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const dropZone = e.currentTarget as HTMLElement;
    dropZone.classList.remove('border-blue-500', 'bg-blue-50');
    
    addImages(Array.from(e.dataTransfer.files));
  };

  // 🔄 Fonctionnalité de glisser-déposer pour les images Excel
  const handleExcelDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const dropZone = e.currentTarget as HTMLElement;
    dropZone.classList.add('border-blue-500', 'bg-blue-50');
  };

  const handleExcelDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const dropZone = e.currentTarget as HTMLElement;
    dropZone.classList.add('border-blue-500', 'bg-blue-50');
  };

  const handleExcelDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const dropZone = e.currentTarget as HTMLElement;
    dropZone.classList.remove('border-blue-500', 'bg-blue-50');
  };

  const handleExcelDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const dropZone = e.currentTarget as HTMLElement;
    dropZone.classList.remove('border-blue-500', 'bg-blue-50');
    
    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    
    if (imageFiles.length > 0) {
      const remainingSlots = 10 - imagesExcelUpload.length;
      const filesToAdd = imageFiles.slice(0, remainingSlots);
      
      const newImages = filesToAdd.map(file => Object.assign(file, {
        preview: URL.createObjectURL(file)
      }));
      
      setImagesExcelUpload(prev => [...prev, ...newImages]);
      
      if (imageFiles.length > remainingSlots) {
        toast(`Seules ${remainingSlots} image(s) ont été ajoutées. Maximum 10 images autorisées.`);
      }
    }
  };

  const removeImage = (index: number) => {
    setImages(prev => {
      const newImages = [...prev];
      URL.revokeObjectURL(newImages[index].preview || '');
      newImages.splice(index, 1);
      return newImages;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // FE-01 : sans ce verrou, un double-clic (ou un reseau lent) relancait toute
    // la publication -> annonces ET images en double.
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const user = await getCurrentUser();
      if (!user) throw new Error('Vous devez etre connecte');

      // FE-02 : le televersement est fait UNE seule fois, dans publishMachine
      // (qui assainit les noms de fichiers). La boucle d'upload qui se trouvait
      // ici faisait doublon : chaque image partait deux fois et la premiere
      // copie devenait orpheline dans le storage.
      const payload = {
        ...formData,
        sellerId: user.id,
        condition: formData.condition as 'new' | 'used',
      };

      await publishMachine(payload as any, images);

      toast('Equipement publie avec succes !');
      window.location.hash = '#dashboard/annonces';
    } catch (err: any) {
      logger.error(err);
      toast('Erreur lors de la publication : ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Mettre en vente un équipement</h1>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Section Import Excel */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold flex items-center">
                <FileSpreadsheet className="h-6 w-6 mr-2 text-blue-600" />
                PUBLICATION AUTOMATISEE DE VOTRE PARC DE MACHINES
              </h2>
              <button
                type="button"
                onClick={() => setShowImportSection(!showImportSection)}
                className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors"
              >
                {showImportSection ? 'Masquer' : 'Afficher'} l'import Excel
              </button>
            </div>

            {showImportSection && (
              <div className="space-y-6">
                {!importParcDisponible && (
                  <div className="p-4 rounded-lg border border-amber-300 bg-amber-50 text-sm text-amber-900">
                    <p className="font-semibold">Import de parc indisponible</p>
                    <p className="mt-1">
                      Aucun service d'import n'est configuré sur cette installation : un fichier
                      chargé ici ne serait envoyé nulle part. Publiez vos machines une par une avec
                      le formulaire ci-dessous, ou contactez MineGrid pour faire activer l'import.
                    </p>
                  </div>
                )}

                {/* Upload fichier Excel */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Fichier Excel (.xlsx, .xls, .csv)
                  </label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleExcelFileUpload}
                      className="hidden"
                      id="excel-upload"
                    />
                    <label htmlFor="excel-upload" className="cursor-pointer">
                      <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                      <span className="text-sm text-gray-500">
                        {excelFile ? excelFile.name : 'Cliquez pour sélectionner un fichier Excel'}
                      </span>
                    </label>
                    {excelFile && excelData.length > 0 && (
                      <div className="mt-2 text-green-700 text-sm font-medium">
                        Fichier chargé avec succès<br />
                        {excelData.length} machine{excelData.length > 1 ? 's' : ''} détectée{excelData.length > 1 ? 's' : ''} dans le fichier
                      </div>
                    )}
                  </div>
                </div>

                {/* Upload images pour Excel */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Images pour l'import Excel
                  </label>
                  
                  {/* Liens d'images détectés dans le fichier Excel */}
                  {detectedImageLinks.length > 0 && (
                    <div className="mb-4 p-4 bg-blue-50 rounded-lg">
                      <h4 className="text-sm font-medium text-blue-800 mb-2">
                        🔗 Liens d'images détectés dans le fichier Excel ({detectedImageLinks.length})
                      </h4>
                      <div className="space-y-1">
                        {detectedImageLinks.slice(0, 5).map((link, index) => (
                          <div key={index} className="text-xs text-blue-600 truncate">
                            {link}
                          </div>
                        ))}
                        {detectedImageLinks.length > 5 && (
                          <div className="text-xs text-blue-500">
                            ... et {detectedImageLinks.length - 5} autre(s)
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {imagesExcelUpload.map((image, index) => (
                      <div key={index} className="relative aspect-square">
                        <img
                          src={image.preview}
                          alt={`Excel Image ${index + 1}`}
                          className="w-full h-full object-cover rounded-lg"
                        />
                        <button
                          type="button"
                          onClick={() => removeExcelImage(index)}
                          className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full hover:bg-red-600"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    {imagesExcelUpload.length < 10 && (
                      <label 
                        className="aspect-square border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 transition-all relative group"
                        onDragOver={handleExcelDragOver}
                        onDragEnter={handleExcelDragEnter}
                        onDragLeave={handleExcelDragLeave}
                        onDrop={handleExcelDrop}
                      >
                        <input
                          type="file"
                          multiple
                          accept="image/*"
                          onChange={handleExcelImagesUpload}
                          className="hidden"
                        />
                        <div className="absolute inset-0 bg-blue-50 opacity-0 group-hover:opacity-10 transition-opacity rounded-lg"></div>
                        <Camera className="h-8 w-8 text-gray-400 group-hover:text-blue-500 transition-colors" />
                        <span className="mt-2 text-sm text-gray-500 text-center px-4">
                          <span className="font-medium">Glissez-déposez vos images ici</span>
                          <br />
                          <span className="text-xs">ou cliquez pour sélectionner</span>
                        </span>
                        <span className="mt-1 text-xs text-gray-400">{10 - imagesExcelUpload.length} emplacements restants</span>
                      </label>
                    )}
                  </div>
                  
                  {/* Message d'information */}
                  <p className="mt-2 text-sm text-gray-500 flex items-center">
                    <Info className="h-4 w-4 mr-1" />
                    {detectedImageLinks.length > 0 
                      ? `Images détectées dans le fichier Excel + images uploadées optionnelles`
                      : `Ajoutez des images optionnelles ou incluez des liens d'images dans votre fichier Excel`
                    }
                  </p>
                </div>

                {/* Bouton d'envoi vers n8n */}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleExcelSubmit}
                    disabled={isImporting || !excelData.length || !importParcDisponible}
                    className="px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {isImporting ? 'Envoi en cours...' : 'Envoyer'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Section Photos */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Photos de l'équipement</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {images.map((image, index) => (
                <div key={index} className="relative aspect-square">
                  <img
                    src={image.preview}
                    alt={`Preview ${index + 1}`}
                    className="w-full h-full object-cover rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full hover:bg-red-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {images.length < MAX_IMAGES && (
                <label 
                  className="aspect-square border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-primary-500 transition-all relative group"
                  onDragOver={handleDragOver}
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  <div className="absolute inset-0 bg-primary-50 opacity-0 group-hover:opacity-10 transition-opacity rounded-lg"></div>
                  <Camera className="h-8 w-8 text-gray-400 group-hover:text-primary-500 transition-colors" />
                  <span className="mt-2 text-sm text-gray-500 text-center px-4">
                    <span className="font-medium">Glissez-déposez vos photos ici</span>
                    <br />
                    <span className="text-xs">ou cliquez pour sélectionner</span>
                  </span>
                  <span className="mt-1 text-xs text-gray-400">{MAX_IMAGES - images.length} emplacements restants</span>
                </label>
              )}
            </div>
            <p className="mt-2 text-sm text-gray-500 flex items-center">
              <Info className="h-4 w-4 mr-1" />
              Ajoutez jusqu'à 8 photos de haute qualité
            </p>
          </div>

          {/* Informations générales */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Informations générales</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700">Catégorie de machine</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-gray-300 shadow-sm"
                >
                  <option value="">Sélectionner une catégorie</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.name}>{cat.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Nom de l'équipement</label>
                <select
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-primary-500 focus:border-primary-500"
                  required
                >
                  <option value="">Sélectionner un type</option>
                  {equipmentNames.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Marque</label>
                <select
                  value={formData.brand}
                  onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-primary-500 focus:border-primary-500"
                  required
                >
                  <option value="">Sélectionner une marque</option>
                  {brands.map((brand) => (
                    <option key={brand} value={brand}>{brand}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Modèle</label>
                <input
                  type="text"
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-primary-500 focus:border-primary-500"
                  required
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      if (!formData.brand || !formData.model) {
                        toast('Renseignez la marque et le modèle');
                        return;
                      }
                      try {
                        const context = {
                          name: formData.name,
                          brand: formData.brand,
                          model: formData.model,
                          category: formData.category,
                          type: formData.type,
                          year: formData.year,
                          price: formData.price,
                          condition: formData.condition,
                          total_hours: formData.total_hours,
                          specifications: formData.specifications
                        };
                                                 const { specs } = await fetchModelSpecsFull(formData.brand, formData.model, context); // context sérialisé avec champs vides transmis
                        if (!specs) {
                          toast('Aucune spécification trouvée');
                          return;
                        }
                        const mapped = toSellEquipmentForm(specs);
                        setFormData(prev => ({
                          ...prev,
                          description: mapped.description || prev.description,
                          specifications: {
                            ...prev.specifications,
                            ...mapped.specifications
                          }
                        }));
                        const summary = summarizeSpecs(specs);
                        const missing = missingForSell(specs);
                        const msg = `Spécifications pré-remplies.\n${summary}${missing.length ? `\nChamps manquants: ${missing.join(', ')}` : ''}`;
                        toast(msg);
                      } catch (e) {
                        toast('Erreur lors de la récupération des spécifications');
                        logger.error(e);
                      }
                    }}
                    className="px-3 py-1 text-sm bg-orange-600 text-white rounded hover:bg-orange-700"
                  >
                    Récupérer les caractéristiques
                  </button>
                  <button
                    type="button"
                    disabled={aiWriting}
                    className="px-3 py-1 text-sm bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white rounded hover:from-violet-700 hover:to-fuchsia-700 disabled:opacity-50"
                    onClick={async () => {
                      if (!formData.brand || !formData.model) {
                        toast('Renseignez la marque et le modèle');
                        return;
                      }
                      setAiWriting(true);
                      try {
                        const res = await generateListingCopy({
                          brand: formData.brand,
                          model: formData.model,
                          year: formData.year,
                          price: formData.price,
                          category: formData.category,
                        });
                        if (res.ok) {
                          setFormData(prev => ({
                            ...prev,
                            name: res.title || prev.name,
                            description: res.description || prev.description,
                          }));
                          toast('✨ Titre et description rédigés par l’IA');
                        } else if (res.error && /aucune ia/i.test(res.error)) {
                          toast('Connectez d’abord votre IA dans « Assistant IA ».');
                        } else {
                          toast(`IA : ${res.error || 'échec de la rédaction'}`);
                        }
                      } finally {
                        setAiWriting(false);
                      }
                    }}
                  >
                    {aiWriting ? '✨ Rédaction…' : '✨ Rédiger avec l’IA'}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Catégorie</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-primary-500 focus:border-primary-500"
                  required
                >
                  <option value="">Sélectionner un secteur</option>
                  <option value="Transport">Transport</option>
                  <option value="Terrassement">Terrassement</option>
                  <option value="Forage">Forage</option>
                  <option value="Voirie">Voirie</option>
                  <option value="Maintenance & Levage">Maintenance & Levage</option>
                  <option value="Construction">Construction</option>
                  <option value="Mines">Mines</option>
                  <option value="Outils & Accessoires">Outils & Accessoires</option>
                  <option value="Pièces détachées">Pièces détachées</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Année</label>
                <input
                  type="number"
                  value={formData.year}
                  onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) })}
                  min="1900"
                  max={new Date().getFullYear()}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-primary-500 focus:border-primary-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Prix (€)</label>
                <input
                  type="number"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  min="0"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-primary-500 focus:border-primary-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">État</label>
                <select
                  value={formData.condition}
                  onChange={(e) => setFormData({ ...formData, condition: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-primary-500 focus:border-primary-500"
                  required
                >
                  <option value="new">Neuf</option>
                  <option value="used">Occasion</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Nombre d'heures</label>
                <input
                  type="number"
                  value={formData.total_hours}
                  onChange={(e) => setFormData({ ...formData, total_hours: e.target.value })}
                  min="0"
                  placeholder="Ex: 2500"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-primary-500 focus:border-primary-500"
                />
                <p className="mt-1 text-xs text-gray-500">Nombre total d'heures d'utilisation de la machine</p>
              </div>
            </div>
          </div>

          {/* Spécifications techniques */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Spécifications techniques</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Poids (kg)
                </label>
                <input
                  type="number"
                  value={formData.specifications.weight}
                  onChange={(e) => setFormData({
                    ...formData,
                    specifications: {
                      ...formData.specifications,
                      weight: e.target.value
                    }
                  })}
                  min="0"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Dimensions (m)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="number"
                    placeholder="Longueur"
                    value={formData.specifications.dimensions.length}
                    onChange={(e) => setFormData({
                      ...formData,
                      specifications: {
                        ...formData.specifications,
                        dimensions: {
                          ...formData.specifications.dimensions,
                          length: e.target.value
                        }
                      }
                    })}
                    step="0.01"
                    min="0"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                  />
                  <input
                    type="number"
                    placeholder="Largeur"
                    value={formData.specifications.dimensions.width}
                    onChange={(e) => setFormData({
                      ...formData,
                      specifications: {
                        ...formData.specifications,
                        dimensions: {
                          ...formData.specifications.dimensions,
                          width: e.target.value
                        }
                      }
                    })}
                    step="0.01"
                    min="0"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                  />
                  <input
                    type="number"
                    placeholder="Hauteur"
                    value={formData.specifications.dimensions.height}
                    onChange={(e) => setFormData({
                      ...formData,
                      specifications: {
                        ...formData.specifications,
                        dimensions: {
                          ...formData.specifications.dimensions,
                          height: e.target.value
                        }
                      }
                    })}
                    step="0.01"
                    min="0"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Puissance
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    value={formData.specifications.power.value}
                    onChange={(e) => setFormData({
                      ...formData,
                      specifications: {
                        ...formData.specifications,
                        power: {
                          ...formData.specifications.power,
                          value: e.target.value
                        }
                      }
                    })}
                    min="0"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                    required
                  />
                  <select
                    value={formData.specifications.power.unit}
                    onChange={(e) => setFormData({
                      ...formData,
                      specifications: {
                        ...formData.specifications,
                        power: {
                          ...formData.specifications.power,
                          unit: e.target.value as 'kW' | 'CV'
                        }
                      }
                    })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                  >
                    <option value="kW">kW</option>
                    <option value="CV">CV</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Capacité opérationnelle
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    value={formData.specifications.operatingCapacity.value}
                    onChange={(e) => setFormData({
                      ...formData,
                      specifications: {
                        ...formData.specifications,
                        operatingCapacity: {
                          ...formData.specifications.operatingCapacity,
                          value: e.target.value
                        }
                      }
                    })}
                    min="0"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                  />
                  <select
                    value={formData.specifications.operatingCapacity.unit}
                    onChange={(e) => setFormData({
                      ...formData,
                      specifications: {
                        ...formData.specifications,
                        operatingCapacity: {
                          ...formData.specifications.operatingCapacity,
                          unit: e.target.value
                        }
                      }
                    })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                  >
                    <option value="kg">kg</option>
                    <option value="m3">m³</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Description détaillée</h2>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={6}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
              placeholder="Décrivez en détail l'état, l'historique et les caractéristiques particulières de votre équipement..."
              required
            />
          </div>

          {/* Boutons d'action */}
          <div className="flex justify-end space-x-4">
            <button
              type="button"
              className="px-6 py-3 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Enregistrer en brouillon
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-3 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Publication en cours...' : "Publier l'annonce"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
