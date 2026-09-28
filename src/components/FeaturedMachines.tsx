import React, { useEffect, useState } from 'react';
import MachineCard from './MachineCard';
import type { Machine } from '../types';
import supabase from '../utils/supabaseClient';
import { MACHINE_LIST_COLUMNS } from '../constants/machineQueryFields';

export default function FeaturedMachines() {
  const [featuredMachines, setFeaturedMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const imageQualityScore = (urls: string[]): number => {
      if (!urls.length) return 0;
      let score = 0;
      for (const raw of urls) {
        const u = String(raw || '').toLowerCase();
        if (!u) continue;
        // Penalize obvious placeholders or tiny thumbnails.
        if (u.includes('placeholder') || u.includes('default') || u.includes('thumb')) {
          score -= 2;
        }
        // Reward likely high-res image URLs.
        if (u.includes('w=1200') || u.includes('w=1600') || u.includes('large') || u.includes('original')) {
          score += 3;
        } else if (u.includes('w=800') || u.includes('medium')) {
          score += 2;
        } else {
          score += 1;
        }
      }
      return Math.max(score, 0);
    };

    const computeQualityScore = (m: any): number => {
      const imageList = Array.isArray(m.images) ? m.images : [];
      const photoList = Array.isArray(m.photos) ? m.photos : [];
      const mergedMedia = [...imageList, ...photoList].filter(Boolean);
      const mediaCount = mergedMedia.length;
      const mediaQuality = imageQualityScore(mergedMedia);
      const descriptionLength = String(m.description || '').trim().length;
      const specsCount = m.specifications && typeof m.specifications === 'object'
        ? Object.keys(m.specifications).filter((k) => m.specifications[k] !== null && m.specifications[k] !== '').length
        : 0;
      const hasPrice = Number(m.price || 0) > 0;
      const year = Number(m.year || 0);
      const isVeryRecent = year >= 2021;
      const isRecent = year >= 2018;
      const isPremium = !!m.premium;
      const createdAt = new Date(m.created_at || 0).getTime();
      const now = Date.now();
      const ageDays = createdAt > 0 ? (now - createdAt) / (1000 * 60 * 60 * 24) : 9999;
      const isFreshListing = ageDays <= 45;

      let score = 0;
      score += mediaQuality * 2; // quality of URLs
      score += Math.min(mediaCount, 8) * 3; // quantity of photos
      score += descriptionLength >= 80 ? 8 : descriptionLength >= 30 ? 4 : 0;
      score += specsCount >= 4 ? 8 : specsCount >= 2 ? 4 : 0;
      score += hasPrice ? 6 : 0;
      score += isVeryRecent ? 8 : isRecent ? 4 : 0;
      score += isFreshListing ? 6 : 0;
      score += isPremium ? 3 : 0;
      return score;
    };

    const fetchFeatured = async () => {
      try {
      const { data, error } = await supabase
        .from('machines')
        .select(MACHINE_LIST_COLUMNS)
        .order('created_at', { ascending: false })
        .limit(80);

      if (error || !data) {
        if (error) console.error('[FeaturedMachines] requete en erreur', error);
        return;
      }

      const withImages = data
        .filter((m: any) => (Array.isArray(m.images) && m.images.length > 0) || (Array.isArray(m.photos) && m.photos.length > 0))
        .map((m: any) => ({ ...m, __qualityScore: computeQualityScore(m) }))
        .filter((m: any) => m.__qualityScore >= 18)
        .sort((a: any, b: any) => {
          if (b.__qualityScore !== a.__qualityScore) return b.__qualityScore - a.__qualityScore;
          // Tie-breakers: recent listing first, then newer machine year.
          const createdDelta = new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
          if (createdDelta !== 0) return createdDelta;
          return Number(b.year || 0) - Number(a.year || 0);
        })
        .slice(0, 3)
        .map((m: any) => ({
          ...m,
          seller: m.seller || {
            id: m.sellerid || m.seller_id || '',
            name: '',
            rating: 0,
            location: [m.city, m.region, m.country].filter(Boolean).join(', ') || 'Localisation inconnue',
          },
          specifications: m.specifications || {},
        }));

      setFeaturedMachines(withImages as Machine[]);
      } catch (err) {
        // R-11b : sans ce filet, un REJET de la promesse (coupure reseau,
        // exception dans le calcul de score) laissait `loading` a true et la
        // section « Machines en vedette » bloquee sur son spinner, avec une
        // unhandledrejection en console. L'erreur reste VISIBLE en log.
        console.error('[FeaturedMachines] chargement impossible', err);
        setFeaturedMachines([]);
      } finally {
        setLoading(false);
      }
    };

    fetchFeatured();
  }, []);

  return (
    <div className="py-8 bg-gradient-to-b from-primary-50 to-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Machines en Vedette</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading ? (
            <p className="col-span-full text-gray-500">Chargement des machines...</p>
          ) : featuredMachines.length === 0 ? (
            <p className="col-span-full text-gray-500">Aucune machine en vedette disponible.</p>
          ) : (
            featuredMachines.map((machine) => (
              <MachineCard key={machine.id} machine={machine} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}