import React from 'react';
import { ArrowRight, Store } from 'lucide-react';
import { trackEvent } from '../utils/analytics';

export default function Hero() {
  return (
    <div className="relative bg-white overflow-hidden">
      <div className="max-w-7xl mx-auto">
        <div className="relative z-10 pt-6 px-4 sm:px-6 lg:px-8 pb-8 bg-white sm:pb-16 md:pb-20 lg:max-w-2xl lg:w-full lg:pb-28 xl:pb-32">
          <svg
            className="hidden lg:block absolute right-0 top-0 bottom-0 h-full w-48 text-white transform translate-x-1/2"
            fill="currentColor"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <polygon points="50,0 100,0 50,100 0,100" />
          </svg>

          <main className="mt-10 max-w-none px-0 sm:mt-12 md:mt-16 lg:mt-20 xl:mt-28">
            <div className="sm:text-center lg:text-left">
              <h1 className="text-3xl tracking-tight font-extrabold text-gray-900 sm:text-4xl md:text-5xl">
                <span className="block text-orange-600 xl:inline">
                  La Plateforme africaine des professionnels<br />de Construction et Mines
                </span>
              </h1>
              <p className="mt-3 text-base text-gray-500 sm:mt-5 sm:text-lg sm:max-w-xl sm:mx-auto md:mt-5 md:text-xl lg:mx-0">
                L'expertise dans la distribution de machines et de solutions pour les secteurs minier, BTP, et industriel en Afrique.
              </p>
              <div className="mt-5 sm:mt-8 grid w-full max-w-xl grid-cols-2 gap-3 mx-auto lg:mx-0 lg:flex lg:w-auto lg:max-w-none lg:gap-3">
                <a
                  href="#machines"
                  onClick={() => trackEvent('hero_cta', { target: 'machines' })}
                  className="flex min-h-[3rem] w-full min-w-0 items-center justify-center rounded-xl px-2 py-3 text-center text-xs font-medium leading-tight text-white bg-orange-600 shadow-md ring-1 ring-black/5 transition hover:bg-orange-700 hover:shadow-lg sm:px-4 sm:text-sm md:min-h-0 md:py-4 md:text-lg md:px-10 lg:shrink-0"
                >
                  Découvrir nos machines
                </a>
                <a
                  href="#financement"
                  onClick={() => trackEvent('hero_cta', { target: 'financement' })}
                  className="flex min-h-[3rem] w-full min-w-0 items-center justify-center rounded-xl px-2 py-3 text-center text-xs font-medium leading-tight text-orange-700 bg-orange-100 shadow-md ring-1 ring-orange-900/10 transition hover:bg-orange-200 hover:shadow-lg sm:px-4 sm:text-sm md:min-h-0 md:py-4 md:text-lg md:px-10 lg:shrink-0"
                >
                  Demander un financement
                </a>
              </div>
              <div className="mt-6 sm:mt-8">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 sm:text-center lg:text-left mb-2">
                  Vous êtes vendeur professionnel ?
                </p>
                <a
                  href="#inscription?type=seller"
                  onClick={() => trackEvent('hero_cta', { target: 'inscription_seller' })}
                  className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-lg border-2 border-orange-500 bg-white px-6 py-3 text-base font-semibold text-orange-700 shadow-sm hover:bg-orange-50 transition-colors md:px-8"
                >
                  <Store className="h-5 w-5 shrink-0" aria-hidden />
                  Publier une annonce
                  <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
                </a>
                <p className="mt-2 text-xs text-gray-500 sm:text-center lg:text-left max-w-md">
                  Inscription vendeur en quelques minutes — ou accédez directement à{' '}
                  <a
                    href="#vendre"
                    onClick={() => trackEvent('hero_cta', { target: 'vendre' })}
                    className="text-orange-600 hover:underline font-medium"
                  >
                    l&apos;espace publication rapide
                  </a>
                  .
                </p>
              </div>
            </div>
          </main>
        </div>
      </div>
      <div className="mx-4 mt-8 overflow-hidden rounded-2xl shadow-sm ring-1 ring-gray-200/80 sm:mx-6 sm:mt-10 lg:mx-0 lg:mt-0 lg:rounded-none lg:shadow-none lg:ring-0 lg:absolute lg:top-0 lg:bottom-0 lg:right-0 lg:w-1/2">
        <img
          className="h-56 w-full object-cover sm:h-72 md:h-96 lg:h-full lg:w-full"
          src="https://images.unsplash.com/photo-1553784402-88d4f4b2a884?ixlib=rb-1.2.1&auto=format&fit=crop&w=1950&q=80"
          alt=""
        />
      </div>
    </div>
  );
}