import React, { useEffect, useState } from 'react';
import type { Machine } from '../types';
import { MapPin, Star, Calendar, Wrench } from 'lucide-react';
import Price from './Price';
import supabase from '../utils/supabaseClient';
import {
  buildSrcSet,
  getOptimizedImageUrl,
  handleImageErrorFallback,
} from '../utils/imageOptimization';

interface MachineCardProps {
  machine: Machine;
}

export default function MachineCard({ machine }: MachineCardProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);

  useEffect(() => {
    const scoreImageUrl = (rawUrl: string): number => {
      const url = String(rawUrl || '').toLowerCase();
      if (!url) return -999;
      let score = 0;
      if (url.startsWith('https://')) score += 1;
      if (url.includes('original') || url.includes('large') || url.includes('xl')) score += 8;
      if (url.includes('w=2000') || url.includes('w=1600') || url.includes('w=1200')) score += 6;
      else if (url.includes('w=1000') || url.includes('w=900') || url.includes('w=800')) score += 4;
      if (url.includes('thumb') || url.includes('thumbnail') || url.includes('small') || url.includes('icon')) score -= 8;
      if (url.includes('placeholder') || url.includes('default')) score -= 12;
      return score;
    };

    const candidates: string[] = [];
    if (Array.isArray(machine.images)) {
      candidates.push(...machine.images);
    }
    const photos = (machine as any)?.photos;
    if (Array.isArray(photos)) {
      candidates.push(...photos);
    }

    if (!candidates.length) {
      setImageUrl(null);
      return;
    }

    const best = [...candidates]
      .map((u) => String(u || '').trim())
      .filter(Boolean)
      .sort((a, b) => scoreImageUrl(b) - scoreImageUrl(a))[0];

    if (!best) {
      setImageUrl(null);
      setOriginalImageUrl(null);
      return;
    }

    // Mascus/Piloterr : URL externe déjà complète.
    // Legacy : chemin dans le bucket Supabase `machine-image`.
    const publicUrl =
      best.startsWith('http://') || best.startsWith('https://')
        ? best
        : supabase.storage.from('machine-image').getPublicUrl(best).data?.publicUrl || null;

    if (!publicUrl) {
      setImageUrl(null);
      setOriginalImageUrl(null);
      return;
    }

    // Carte catalogue = zone ~400-600px affichée, on vise 800px (x2 pour Retina = 1600px via srcSet).
    const optimized = getOptimizedImageUrl(publicUrl, {
      width: 800,
      quality: 80,
      resize: 'cover',
    });

    setOriginalImageUrl(publicUrl);
    setImageUrl(optimized);
  }, [machine]);

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
      <a href={`#machines/${machine.id}`} className="block">
        <div className="relative h-48 bg-gray-200 flex items-center justify-center">
          {imageUrl ? (
            <img
              src={imageUrl}
              srcSet={buildSrcSet(originalImageUrl || imageUrl, 800, 80) || undefined}
              sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
              alt={machine.name}
              loading="lazy"
              decoding="async"
              onError={(e) => handleImageErrorFallback(e, originalImageUrl || imageUrl)}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-gray-500 text-sm">Image non disponible</span>
          )}
          <div className="absolute top-2 right-2 bg-primary-600 text-white px-2 py-1 rounded text-sm capitalize">
            {machine.condition === 'new' ? 'Neuf' : 'Occasion'}
          </div>
        </div>

        <div className="p-4">
          <div className="mb-2">
            <h3 className="text-lg font-semibold text-gray-900">{machine.name}</h3>
            <p className="text-sm text-gray-600">{machine.model}</p>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="flex items-center text-sm text-gray-600">
              <Calendar className="h-4 w-4 mr-1" />
              <span>{machine.year}</span>
            </div>
            <div className="flex items-center text-sm text-gray-600">
              <Wrench className="h-4 w-4 mr-1" />
              <span>
                {machine.specifications.power?.value && machine.specifications.power?.unit 
                  ? `${machine.specifications.power.value} ${machine.specifications.power.unit}`
                  : 'Non spécifié'
                }
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center text-sm text-gray-600">
              <MapPin className="h-4 w-4 mr-1" />
              <span>{machine.seller?.location ?? 'Localisation inconnue'}</span>
            </div>
            <div className="flex items-center text-sm">
              <Star className="h-4 w-4 text-yellow-400 mr-1" />
              <span>{machine.seller?.rating ?? '-'}</span>
            </div>
          </div>

          <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
  <div className="text-center sm:text-left">
    <Price 
      amount={machine.price}
      showOriginal={true}
      className="text-lg sm:text-xl font-bold text-primary-600"
    />
  </div>
  <div
    className="w-full sm:w-auto text-center px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors cursor-pointer"
  >
    Détails / devis
  </div>
</div>


        </div>
      </a>
    </div>
  );
}
