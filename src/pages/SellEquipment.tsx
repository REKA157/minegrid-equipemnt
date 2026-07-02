import React, { useEffect, useState, ChangeEvent } from 'react';
import { Upload, Plus, X, Camera, Info, FileSpreadsheet } from 'lucide-react';
import { publishMachine, getCurrentUser } from '../utils/api';
import supabase from '../utils/supabaseClient';
import { brands } from '../data/brands';
import { categories } from '../data/categories';
import { fetchModelSpecs, fetchModelSpecsFull, toSellEquipmentForm, summarizeSpecs, missingForSell } from '../services/autoSpecsService';
import { logger } from '../utils/logger';
import { toast } from '../utils/toast';
// NOTE: 'exceljs' (~600 kB minifie) est importe dynamiquement dans
// handleExcelFileUpload ci-dessous. Cela evite d'alourdir le chunk de la
// page SellEquipment pour les utilisateurs qui ne font pas d'import Excel.

function cleanImagePath(img: string): string {
  const match = img.match(/(?:.*\/)?([^/]+\.png|jpg|jpeg|webp)/i);
  return match ? match[1] : img;
}

const equipmentNames = categories.flatMap(cat =>
  cat.subcategories?.map(sub => sub.name) || []
);

interface ImageFile extends File {
  preview?: string;
}

export default function SellEquipment() {
  const [images, setImages] = useState<ImageFile[]>([]);
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

  // 🔁 Import Excel vers n8n
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelData, setExcelData] = useState<any[]>([]);
  const [imagesExcelUpload, setImagesExcelUpload] = useState<ImageFile[]>([]);
  const [detectedImageLinks, setDetectedImageLinks] = useState<string[]>([]);
  const [showImportSection, setShowImportSection] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

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

    setIsImporting(true);
    try {
      // Récupérer l'utilisateur connecté
      logger.info("🔍 Tentative de récupération de l'utilisateur...");
      const user = await getCurrentUser();
      logger.info("👤 Utilisateur récupéré:", user);
      logger.info("🆔 ID de l'utilisateur:", user?.id);
      logger.info("🆔 Type de l'ID:", typeof user?.id);
      logger.info("🆔 ID est truthy:", !!user?.id);
      
      if (!user) {
        toast("Vous devez être connecté pour importer des machines.");
        setIsImporting(false);
        return;
      }

      if (!user.id) {
        logger.error("❌ L'utilisateur n'a pas d'ID !");
        logger.error("❌ Détails de l'utilisateur:", JSON.stringify(user, null, 2));
        toast("Erreur : Impossible de récupérer votre identifiant. Veuillez vous reconnecter.");
        setIsImporting(false);
        return;
      }

      // Analyser les données Excel pour détecter les liens d'images
      logger.info("📊 Analyse des données Excel...");
      logger.info("🖼️ Liens d'images déjà détectés:", detectedImageLinks);
      
      // 🔄 CONVERTIR LE FICHIER EXCEL EN BASE64
      logger.info("🔄 Conversion du fichier Excel en base64...");
      const arrayBuffer = await excelFile.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      logger.info("✅ Fichier converti en base64, taille:", base64.length);
      
      // Préparer les données JSON
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
      
      logger.info("📦 Données JSON préparées:");
      logger.info("  - Nom du fichier:", jsonData.excelFile.name);
      logger.info("  - Taille:", jsonData.excelFile.size);
      logger.info("  - SellerId:", jsonData.sellerId);
      logger.info("  - SellerId dans metadata:", jsonData.metadata.sellerId);
      logger.info("  - Liens d'images:", jsonData.imageLinks.length);
      logger.info("  - Nombre de machines:", jsonData.metadata.totalMachines);
      
      // 🔍 DEBUG : Vérifier que le sellerId est bien dans les données JSON
      logger.info("🔍 DEBUG - Vérification des données JSON:");
      logger.info("🆔 SellerId dans JSON:", jsonData.sellerId);
      logger.info("🆔 Type du sellerId:", typeof jsonData.sellerId);
      logger.info("🆔 Égalité avec user.id:", jsonData.sellerId === user.id);
      logger.info("🆔 JSON.stringify complet:", JSON.stringify(jsonData, null, 2));
      
      if (!jsonData.sellerId) {
        logger.error("❌ CRITIQUE : Le sellerId n'est pas dans les données JSON !");
        logger.error("❌ user.id original:", user.id);
        logger.error("❌ Type user.id:", typeof user.id);
        toast("Erreur : Le sellerId n'a pas été ajouté aux données. Veuillez réessayer.");
        return;
      }

      const importParcUrl = import.meta.env.VITE_N8N_IMPORT_PARC_URL || '';
      logger.info("🚀 Envoi vers n8n en JSON...");
      logger.info("🚀 URL:", importParcUrl);
      logger.info("🚀 Headers:", { 
        'Content-Type': 'application/json',
        'x-auth-token': 'minegrid-secret-token-2025'
      });
      
      // 🔍 DEBUG : Vérifier le body avant envoi
      const requestBody = JSON.stringify(jsonData);
      logger.info("🚀 Body à envoyer (premiers 500 caractères):", requestBody.substring(0, 500));
      logger.info("🚀 Body contient sellerId:", requestBody.includes('"sellerId"'));
      logger.info("🚀 Body contient l'ID:", requestBody.includes(user.id));
      logger.info("🚀 Nombre d'occurrences de sellerId:", (requestBody.match(/"sellerId"/g) || []).length);
      
      const response = await fetch(importParcUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': 'minegrid-secret-token-2025'
        },
        body: requestBody,
      });

      // Lire le body une seule fois
      const rawText = await response.text();
      let data;
      try {
        data = JSON.parse(rawText);
      } catch {
        data = rawText;
      }
      logger.info("📨 Réponse n8n :", data);
      logger.info("📊 Status HTTP:", response.status);
      logger.info("📊 Headers de réponse:", Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        let errorMsg = `Erreur lors de l'envoi des données (code HTTP ${response.status})`;
        errorMsg += `\nRéponse brute : ${rawText}`;
        toast(errorMsg);
        return;
      }

      toast('✅ Données envoyées avec succès ! Les annonces apparaîtront bientôt dans votre dashboard.');
      setExcelData([]);
      setImagesExcelUpload([]);
      setExcelFile(null);
      setShowImportSection(false);
    } catch (error) {
      logger.error('❌ Erreur:', error);
      logger.error('❌ Stack trace:', error instanceof Error ? error.stack : 'N/A');
      toast('Erreur lors de l\'envoi des données : ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setIsImporting(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newImages = files.map(file => Object.assign(file, {
      preview: URL.createObjectURL(file)
    }));
    setImages(prev => [...prev, ...newImages]);
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
    
    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    
    if (imageFiles.length > 0) {
      const remainingSlots = 8 - images.length;
      const filesToAdd = imageFiles.slice(0, remainingSlots);
      
      const newImages = filesToAdd.map(file => Object.assign(file, {
        preview: URL.createObjectURL(file)
      }));
      
      setImages(prev => [...prev, ...newImages]);
      
      if (imageFiles.length > remainingSlots) {
        toast(`Seules ${remainingSlots} image(s) ont été ajoutées. Maximum 8 images autorisées.`);
      }
    }
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
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error('Vous devez être connecté');

      const imagePaths: string[] = [];

      for (const image of images) {
        const rawName = image.name.split('/').pop() || image.name;
        const sanitized = rawName
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-zA-Z0-9._-]/g, '_');

        const fileName = `${Date.now()}_${sanitized}`;

        const { error } = await supabase.storage
          .from('machine-image')
          .upload(fileName, image, {
            cacheControl: '3600',
            upsert: false,
          });

        if (error) {
          throw new Error('Échec du téléversement de l\'image : ' + error.message);
        }

        imagePaths.push(fileName);
      }

      const payload = {
        ...formData,
        sellerId: user.id,
        condition: formData.condition as 'new' | 'used',
        images: imagePaths.map(cleanImagePath),
      };

      await publishMachine(payload as any, images);

      toast('Équipement publié avec succès !');
      window.location.hash = '#dashboard/annonces';
    } catch (err: any) {
      logger.error(err);
      toast('Erreur lors de la publication : ' + err.message);
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
                    disabled={isImporting || !excelData.length}
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
              {images.length < 8 && (
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
                  <span className="mt-1 text-xs text-gray-400">{8 - images.length} emplacements restants</span>
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
                <div className="mt-2">
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
                    Remplir automatiquement (IA)
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
              className="px-6 py-3 bg-primary-600 text-white rounded-md hover:bg-primary-700"
            >
              Publier l'annonce
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
