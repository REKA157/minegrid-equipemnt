import React, { useState, useEffect } from 'react';
import { Zap, TrendingUp, Target, CheckCircle, AlertTriangle, Settings, BarChart3, DollarSign, Search, Image, Tag } from 'lucide-react';
import { aiWidgetService } from '../../../services/aiWidgetService';

interface AIOptimizationWidgetProps {
  userId: string;
  widgetSize?: 'small' | 'medium' | 'large';
}

interface OptimizationSuggestion {
  type: string;
  title: string;
  description: string;
  actions: string[];
  expectedImpact: string;
  priority: 'low' | 'medium' | 'high';
  category: 'seo' | 'pricing' | 'content' | 'marketing';
}

const AIOptimizationWidget: React.FC<AIOptimizationWidgetProps> = ({ userId, widgetSize = 'medium' }) => {
  const [suggestions, setSuggestions] = useState<OptimizationSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<'all' | 'seo' | 'pricing' | 'content' | 'marketing'>('all');

  useEffect(() => {
    loadOptimizationData();
  }, [userId]);

  const loadOptimizationData = async () => {
    try {
      setLoading(true);
      setError(null);

      const optimizationData = await aiWidgetService.getOptimizationSuggestions(userId);
      
      // Transformation des données en suggestions structurées
      const structuredSuggestions: OptimizationSuggestion[] = optimizationData.map((item: any) => ({
        type: item.type,
        title: item.title,
        description: item.description,
        actions: item.actions,
        expectedImpact: item.expectedImpact,
        priority: getPriorityFromImpact(item.expectedImpact),
        category: getCategoryFromType(item.type)
      }));

      setSuggestions(structuredSuggestions);
    } catch (err) {
      console.error('Erreur chargement optimisations:', err);
      setError('Erreur lors du chargement des suggestions d\'optimisation');
    } finally {
      setLoading(false);
    }
  };

  const getPriorityFromImpact = (impact: string): 'low' | 'medium' | 'high' => {
    if (impact.includes('30-40%') || impact.includes('15-20%')) return 'high';
    if (impact.includes('10-15%')) return 'medium';
    return 'low';
  };

  const getCategoryFromType = (type: string): 'seo' | 'pricing' | 'content' | 'marketing' => {
    switch (type) {
      case 'seo_optimization': return 'seo';
      case 'price_optimization': return 'pricing';
      case 'content_optimization': return 'content';
      default: return 'marketing';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-red-600 bg-red-50 border-red-200';
      case 'medium': return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'low': return 'text-green-600 bg-green-50 border-green-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'seo': return <Search className="w-4 h-4" />;
      case 'pricing': return <DollarSign className="w-4 h-4" />;
      case 'content': return <Image className="w-4 h-4" />;
      case 'marketing': return <Target className="w-4 h-4" />;
      default: return <Settings className="w-4 h-4" />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'seo': return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'pricing': return 'text-green-600 bg-green-50 border-green-200';
      case 'content': return 'text-purple-600 bg-purple-50 border-purple-200';
      case 'marketing': return 'text-orange-600 bg-orange-50 border-orange-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const filteredSuggestions = activeCategory === 'all' 
    ? suggestions 
    : suggestions.filter(s => s.category === activeCategory);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex items-center justify-center space-x-2">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600"></div>
          <span className="text-gray-600">Analyse d'optimisation en cours...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex items-center space-x-2 text-red-600">
          <AlertTriangle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center space-x-2">
          <Zap className="w-5 h-5 text-orange-600" />
          <h3 className="font-semibold text-gray-900">Recommandations d'optimisation</h3>
        </div>
        <button
          onClick={loadOptimizationData}
          className="p-1 hover:bg-gray-100 rounded transition-colors"
          title="Actualiser les optimisations"
        >
          <Settings className="w-4 h-4 text-gray-600" />
        </button>
      </div>

      {/* Category Filters */}
      <div className="flex flex-wrap gap-1 p-3 border-b border-gray-200">
        <button
          onClick={() => setActiveCategory('all')}
          className={`px-3 py-1 text-xs rounded-full transition-colors ${
            activeCategory === 'all'
              ? 'bg-orange-100 text-orange-700 border border-orange-300'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Toutes ({suggestions.length})
        </button>
        <button
          onClick={() => setActiveCategory('seo')}
          className={`px-3 py-1 text-xs rounded-full transition-colors ${
            activeCategory === 'seo'
              ? 'bg-blue-100 text-blue-700 border border-blue-300'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          SEO ({suggestions.filter(s => s.category === 'seo').length})
        </button>
        <button
          onClick={() => setActiveCategory('pricing')}
          className={`px-3 py-1 text-xs rounded-full transition-colors ${
            activeCategory === 'pricing'
              ? 'bg-green-100 text-green-700 border border-green-300'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Prix ({suggestions.filter(s => s.category === 'pricing').length})
        </button>
        <button
          onClick={() => setActiveCategory('content')}
          className={`px-3 py-1 text-xs rounded-full transition-colors ${
            activeCategory === 'content'
              ? 'bg-purple-100 text-purple-700 border border-purple-300'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Contenu ({suggestions.filter(s => s.category === 'content').length})
        </button>
        <button
          onClick={() => setActiveCategory('marketing')}
          className={`px-3 py-1 text-xs rounded-full transition-colors ${
            activeCategory === 'marketing'
              ? 'bg-orange-100 text-orange-700 border border-orange-300'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Marketing ({suggestions.filter(s => s.category === 'marketing').length})
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4 max-h-96 overflow-y-auto">
        {filteredSuggestions.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Zap className="w-12 h-12 mx-auto mb-2 text-gray-300" />
            <p>Aucune optimisation suggérée</p>
            <p className="text-sm">Les optimisations apparaîtront ici lorsqu'une amélioration réelle sera détectée sur vos annonces.</p>
          </div>
        ) : (
          filteredSuggestions.map((suggestion, index) => (
            <div
              key={index}
              className={`p-4 rounded-lg border ${getCategoryColor(suggestion.category)}`}
            >
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 mt-1">
                  {getCategoryIcon(suggestion.category)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-sm">{suggestion.title}</h4>
                    <span className={`text-xs px-2 py-1 rounded-full ${getPriorityColor(suggestion.priority)} bg-white`}>
                      {suggestion.priority === 'high' ? 'Priorité haute' : 
                       suggestion.priority === 'medium' ? 'Priorité moyenne' : 'Priorité basse'}
                    </span>
                  </div>
                  
                  <p className="text-sm mb-3">{suggestion.description}</p>
                  
                  <div className="mb-3">
                    <div className="text-xs font-medium text-gray-700 mb-2">Actions recommandées:</div>
                    <div className="space-y-1">
                      {suggestion.actions.map((action, actionIndex) => (
                        <div key={actionIndex} className="flex items-center space-x-2 text-xs">
                          <CheckCircle className="w-3 h-3 text-green-600" />
                          <span>{action}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2 text-xs bg-white p-2 rounded border">
                    <TrendingUp className="w-3 h-3 text-green-600" />
                    <span className="font-medium">Impact attendu:</span>
                    <span className="text-green-700">{suggestion.expectedImpact}</span>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Summary */}
      {filteredSuggestions.length > 0 && (
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center space-x-2">
              <BarChart3 className="w-4 h-4 text-gray-600" />
              <span className="text-gray-700">
                {filteredSuggestions.length} optimisation{filteredSuggestions.length > 1 ? 's' : ''} suggérée{filteredSuggestions.length > 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex items-center space-x-4 text-xs">
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                <span>Haute priorité: {filteredSuggestions.filter(s => s.priority === 'high').length}</span>
              </div>
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                <span>Moyenne: {filteredSuggestions.filter(s => s.priority === 'medium').length}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIOptimizationWidget; 