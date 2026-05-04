import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCurrencyStore } from '../stores/currencyStore';
import type { Currency } from '../types';
import supabase from '../utils/supabaseClient';

// Note : on utilise console.info / console.warn directement (et pas le logger
// centralise qui est silent en prod) pour que la detection de devise reste
// diagnosticable en production. La detection est un point utilisateur-visible,
// on veut pouvoir tracer rapidement un probleme chez un user final.

export const COUNTRY_TO_CURRENCY: Record<string, Currency> = {
  MA: 'MAD',
  US: 'USD', CA: 'USD',
  FR: 'EUR', BE: 'EUR', DE: 'EUR', IT: 'EUR', ES: 'EUR', PT: 'EUR', NL: 'EUR', LU: 'EUR', IE: 'EUR', GR: 'EUR', AT: 'EUR', FI: 'EUR',
  SN: 'XOF', CI: 'XOF', BF: 'XOF', BJ: 'XOF', TG: 'XOF', ML: 'XOF', NE: 'XOF', GW: 'XOF',
  CM: 'XAF', GA: 'XAF', TD: 'XAF', CF: 'XAF', CG: 'XAF', GQ: 'XAF',
  NG: 'NGN',
  ZA: 'ZAR',
  EG: 'EGP',
  KE: 'KES',
  GH: 'GHS',
};

// Fournisseurs IP-geolocation gratuits, sans cle API.
// On essaie dans l'ordre et on s'arrete au premier qui repond avec un code
// pays utilisable. Chacun expose un format different donc extractor dedie.
type IpProvider = {
  name: string;
  url: string;
  extract: (json: unknown) => string | null;
};

const IP_PROVIDERS: IpProvider[] = [
  {
    // ~30k req/mois gratuit, CORS ok. Retourne { country: "MA", ... }.
    name: 'country.is',
    url: 'https://api.country.is/',
    extract: (json) => (json as { country?: string } | null)?.country || null,
  },
  {
    // GeoJS (sponsorise par StackPath). Retourne { country: "MA", ... }.
    name: 'geojs',
    url: 'https://get.geojs.io/v1/ip/country.json',
    extract: (json) => (json as { country?: string } | null)?.country || null,
  },
  {
    // Fallback historique, souvent bloque par ad-blockers.
    name: 'ipapi.co',
    url: 'https://ipapi.co/json/',
    extract: (json) => (json as { country_code?: string } | null)?.country_code || null,
  },
];

async function detectCountryFromIp(): Promise<{ provider: string; country: string } | null> {
  for (const p of IP_PROVIDERS) {
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 3500);
      const res = await fetch(p.url, { signal: ctrl.signal });
      clearTimeout(timeout);
      if (!res.ok) {
        // console.info (pas logger.warn) : visible en prod, utile pour
        // diagnostiquer un provider bloque chez un utilisateur final.
        console.info(`[currency] ${p.name} status=${res.status}`);
        continue;
      }
      const json = await res.json();
      const country = p.extract(json)?.toUpperCase();
      if (country && country.length === 2) {
        console.info(`[currency] ${p.name} -> ${country}`);
        return { provider: p.name, country };
      }
      console.info(`[currency] ${p.name} no country in response`, json);
    } catch (err) {
      console.info(`[currency] ${p.name} fetch failed`, err);
    }
  }
  return null;
}

function countryFromNavigator(): string | null {
  try {
    const locales = navigator.languages && navigator.languages.length > 0
      ? navigator.languages
      : [navigator.language || ''];
    for (const loc of locales) {
      const region = loc.split('-')[1]?.toUpperCase();
      if (region && region.length === 2) return region;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Detection multi-providers :
 *   1. api.country.is (rapide, CORS ok, gratuit)
 *   2. geojs.io (fallback)
 *   3. ipapi.co (fallback historique, souvent bloque)
 *   4. navigator.language (dernier recours, depend du systeme user)
 */
export async function detectCurrencyFromBrowser(): Promise<Currency | null> {
  const geo = await detectCountryFromIp();
  if (geo) {
    const mapped = COUNTRY_TO_CURRENCY[geo.country];
    if (mapped) {
      console.info(`[currency] detected ${mapped} via ${geo.provider} (country=${geo.country})`);
      return mapped;
    }
    console.info(`[currency] ${geo.provider} -> ${geo.country} (pas de devise mappee)`);
  }

  const navCountry = countryFromNavigator();
  if (navCountry) {
    const mapped = COUNTRY_TO_CURRENCY[navCountry];
    if (mapped) {
      console.info(`[currency] detected ${mapped} via navigator.language (country=${navCountry})`);
      return mapped;
    }
    console.info(`[currency] navigator.language -> ${navCountry} (pas de devise mappee)`);
  }

  console.warn('[currency] aucun provider IP n\'a repondu, on garde EUR par defaut');
  return null;
}

// Taux de change fixes en cas d'erreur de l'API
const FALLBACK_RATES: Record<Currency, number> = {
  EUR: 1.0000,
  USD: 1.0850,
  MAD: 10.8500,
  XOF: 655.96,
  XAF: 655.96,
  NGN: 1590.35,
  ZAR: 20.65,
  EGP: 33.72,
  KES: 158.48,
  GHS: 13.89
};

export function useExchangeRates() {
  const { setRates, setAutoCurrency } = useCurrencyStore();
  const hasTriedGeoRef = useRef(false);

  useEffect(() => {
    // La detection IP s'execute une seule fois par chargement de page (pas
    // une fois par re-render). Elle applique systematiquement la devise
    // detectee, ecrasant toute selection manuelle faite lors d'une session
    // precedente : l'IP est la source de verite.
    if (hasTriedGeoRef.current) return;
    hasTriedGeoRef.current = true;

    void (async () => {
      const detected = await detectCurrencyFromBrowser();
      if (detected) {
        setAutoCurrency(detected);
      }
    })();
  }, [setAutoCurrency]);

  return useQuery({
    queryKey: ['exchangeRates'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.rpc('exchange_rates');

        if (error) {
          console.warn('⚠️ Erreur RPC exchange_rates, utilisation des taux fixes', error);
          setRates(FALLBACK_RATES);
          return FALLBACK_RATES;
        }

        const ratesArray = Array.isArray(data) ? data : [];
        // Convertir le format array en Record<Currency, number>
        const ratesRecord: Record<Currency, number> = {} as Record<Currency, number>;
        ratesArray.forEach((rate) => {
          const currency = (rate as { currency?: string }).currency;
          const value = (rate as { rate?: number }).rate;
          if (currency && typeof value === 'number') {
            ratesRecord[currency as Currency] = value;
          }
        });

        if (Object.keys(ratesRecord).length === 0) {
          setRates(FALLBACK_RATES);
          return FALLBACK_RATES;
        }
        
        setRates(ratesRecord);
        return ratesRecord;
      } catch (error) {
        console.warn('⚠️ Erreur réseau sur exchange_rates, utilisation des taux fixes:', error);
        // En cas d'erreur réseau, utiliser les taux fixes
        setRates(FALLBACK_RATES);
        return FALLBACK_RATES;
      }
    },
    refetchInterval: 1000 * 60 * 60, // Refresh every hour
    retry: 1, // Réduire les tentatives pour éviter les erreurs répétées
    staleTime: 1000 * 60 * 30 // Considérer les données comme fraîches pendant 30 minutes
  });
}