import React, { useState, useEffect } from 'react';
import {
  Package,
  Upload,
  FileText, 
  Download, 
  Trash2, 
  Search,
  Filter,
  Plus,
  Folder,
  Eye,
  Calendar,
  User,
  Building2,
  CheckCircle,
  AlertCircle,
  X
} from 'lucide-react';
import supabase from '../utils/supabaseClient';
import { DOCUMENTS_ESPACE_COLUMNS } from '../constants/apiQueryFields';
import { toast } from '../utils/toast';
import BackToDashboardButton from '../components/common/BackToDashboardButton';
interface Document {
  id: string;
  name: string;
  type: 'facture' | 'contrat' | 'fiche_technique' | 'certificat' | 'autre';
  category: string;
  file_url: string;
  file_size: number;
  uploaded_at: string;
  uploaded_by: string;
  description: string;
  tags: string[];
  status: 'actif' | 'archivé' | 'expiré';
}

const documentTypes = [
  { value: 'facture', label: 'Factures', icon: FileText, color: 'text-green-600' },
  { value: 'contrat', label: 'Contrats', icon: FileText, color: 'text-blue-600' },
  { value: 'fiche_technique', label: 'Fiches techniques', icon: FileText, color: 'text-purple-600' },
  { value: 'certificat', label: 'Certificats', icon: CheckCircle, color: 'text-orange-600' },
  { value: 'autre', label: 'Autres', icon: FileText, color: 'text-gray-600' }
];

const categories = [
  'Machines',
  'Clients',
  'Fournisseurs',
  'Maintenance',
  'Garantie',
  'Transport',
  'Douane',
  'Administratif'
];

export default function DocumentsEspace() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadData, setUploadData] = useState({
    name: '',
    type: 'autre' as Document['type'],
    category: '',
    description: '',
    tags: ''
  });

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('documents')
        .select(DOCUMENTS_ESPACE_COLUMNS)
        .eq('user_id', user.id)
        .order('uploaded_at', { ascending: false });

      if (error) {
        console.error('Erreur chargement documents:', error);
        return;
      }

      setDocuments(data || []);
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setUploadData(prev => ({ ...prev, name: file.name }));
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Upload du fichier
      const fileName = `documents/${user.id}/${Date.now()}_${selectedFile.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, selectedFile);

      if (uploadError) {
        console.error('Erreur upload:', uploadError);
        toast('Erreur lors de l\'upload');
        return;
      }

      // Récupérer l'URL publique
      const { data: { publicUrl } } = supabase.storage
        .from('documents')
        .getPublicUrl(fileName);

      // Sauvegarder les métadonnées
      const documentData = {
        name: uploadData.name,
        type: uploadData.type,
        category: uploadData.category,
        file_url: publicUrl,
        file_size: selectedFile.size,
        uploaded_by: user.id,
        user_id: user.id,
        description: uploadData.description,
        tags: uploadData.tags.split(',').map(tag => tag.trim()).filter(tag => tag),
        status: 'actif',
        uploaded_at: new Date().toISOString()
      };

      const { error: dbError } = await supabase
        .from('documents')
        .insert(documentData);

      if (dbError) {
        console.error('Erreur sauvegarde:', dbError);
        toast('Erreur lors de la sauvegarde');
        return;
      }

      setShowUploadModal(false);
      setSelectedFile(null);
      setUploadData({
        name: '',
        type: 'autre',
        category: '',
        description: '',
        tags: ''
      });
      loadDocuments();
      toast('Document uploadé avec succès !');
    } catch (error) {
      console.error('Erreur:', error);
      toast('Erreur lors de l\'upload');
    } finally {
      setUploading(false);
    }
  };

  const deleteDocument = async (documentId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce document ?')) return;

    try {
      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', documentId);

      if (error) {
        console.error('Erreur suppression:', error);
        toast('Erreur lors de la suppression');
        return;
      }

      loadDocuments();
      toast('Document supprimé avec succès !');
    } catch (error) {
      console.error('Erreur:', error);
      toast('Erreur lors de la suppression');
    }
  };

  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = doc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         doc.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         doc.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesType = selectedType === 'all' || doc.type === selectedType;
    const matchesCategory = selectedCategory === 'all' || doc.category === selectedCategory;
    
    return matchesSearch && matchesType && matchesCategory;
  });

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getTypeIcon = (type: Document['type']) => {
    const typeData = documentTypes.find(t => t.value === type);
    return typeData ? typeData.icon : FileText;
  };

  const getTypeColor = (type: Document['type']) => {
    const typeData = documentTypes.find(t => t.value === type);
    return typeData ? typeData.color : 'text-gray-600';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center">
            <BackToDashboardButton className="mr-6" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Mes documents</h1>
              <p className="text-gray-600">Gérez vos factures, contrats et fiches techniques</p>
            </div>
          </div>
          <button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
          >
            <Plus className="h-4 w-4 mr-2" />
            Ajouter un document
          </button>
        </div>

        {/* Filtres et recherche */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder="Rechercher..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="all">Tous les types</option>
              {documentTypes.map(type => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
            
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="all">Toutes les catégories</option>
              {categories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
            
            <div className="text-sm text-gray-600 flex items-center">
              <Folder className="h-4 w-4 mr-2" />
              {filteredDocuments.length} document(s)
            </div>
          </div>
        </div>

        {/* Liste des documents */}
        <div className="bg-white rounded-lg shadow-sm">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600 mx-auto"></div>
              <p className="mt-2 text-gray-600">Chargement des documents...</p>
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="p-8 text-center">
              <Package className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600">Aucun document trouvé</p>
              <button
                onClick={() => setShowUploadModal(true)}
                className="mt-4 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
              >
                Ajouter votre premier document
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {filteredDocuments.map((doc) => {
                const TypeIcon = getTypeIcon(doc.type);
                const typeColor = getTypeColor(doc.type);
                
                return (
                  <div key={doc.id} className="p-6 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className={`p-2 rounded-lg bg-gray-100 ${typeColor}`}>
                          <TypeIcon className="h-6 w-6" />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-gray-900">{doc.name}</h3>
                          <p className="text-sm text-gray-600">{doc.description}</p>
                          <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                            <span className="flex items-center">
                              <Calendar className="h-3 w-3 mr-1" />
                              {new Date(doc.uploaded_at).toLocaleDateString('fr-FR')}
                            </span>
                            <span>{formatFileSize(doc.file_size)}</span>
                            <span className="px-2 py-1 bg-gray-100 rounded-full">{doc.category}</span>
                            {doc.tags.map((tag, index) => (
                              <span key={index} className="px-2 py-1 bg-orange-100 text-orange-800 rounded-full">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <a
                          href={doc.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 text-gray-400 hover:text-orange-600 transition-colors"
                          title="Voir"
                        >
                          <Eye className="h-4 w-4" />
                        </a>
                        <a
                          href={doc.file_url}
                          download
                          className="p-2 text-gray-400 hover:text-orange-600 transition-colors"
                          title="Télécharger"
                        >
                          <Download className="h-4 w-4" />
                        </a>
                        <button
                          onClick={() => deleteDocument(doc.id)}
                          className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                          title="Supprimer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal d'upload */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="flex justify-between items-center p-6 border-b">
              <h3 className="text-lg font-semibold">Ajouter un document</h3>
              <button
                onClick={() => setShowUploadModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Fichier
                </label>
                <input
                  type="file"
                  onChange={handleFileSelect}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nom du document
                </label>
                <input
                  type="text"
                  value={uploadData.name}
                  onChange={(e) => setUploadData({...uploadData, name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Type
                </label>
                <select
                  value={uploadData.type}
                  onChange={(e) => setUploadData({...uploadData, type: e.target.value as Document['type']})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  {documentTypes.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Catégorie
                </label>
                <select
                  value={uploadData.category}
                  onChange={(e) => setUploadData({...uploadData, category: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="">Sélectionner une catégorie</option>
                  {categories.map(category => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  value={uploadData.description}
                  onChange={(e) => setUploadData({...uploadData, description: e.target.value})}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tags (séparés par des virgules)
                </label>
                <input
                  type="text"
                  value={uploadData.tags}
                  onChange={(e) => setUploadData({...uploadData, tags: e.target.value})}
                  placeholder="ex: machine, client, maintenance"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 p-6 border-t">
              <button
                onClick={() => setShowUploadModal(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
                className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {uploading ? 'Upload en cours...' : 'Uploader'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 