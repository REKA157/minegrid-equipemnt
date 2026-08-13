import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { notificationService } from '../services/notificationService';
import { toast } from './toast';

/**
 * Tests du helper toast. Valident :
 *  - inference automatique du type : error si mot-cle d'erreur, success si
 *    marqueur de reussite explicite, INFO dans tous les autres cas ;
 *  - API `.success`, `.error`, `.warning`, `.info` route vers le bon niveau ;
 *  - le message et le titre par defaut sont corrects.
 *
 * CHANGEMENT DE REGLE, 2026-08-13 — l'inference ne conclut PLUS « succes » par
 * defaut. Un refus de changement de formule (« Nous n'avons pas pu modifier
 * votre formule... ») s'etait affiche sous un bandeau VERT intitule « Succes »,
 * faute de contenir un mot-cle d'erreur : l'utilisateur pouvait croire son
 * changement effectue. Le cas par defaut est desormais `info`, qui ne ment
 * jamais. Le premier test ci-dessous porte donc l'attente INVERSE de sa version
 * d'origine — c'est voulu.
 */

describe('toast', () => {
  let successSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warningSpy: ReturnType<typeof vi.spyOn>;
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    successSpy = vi.spyOn(notificationService, 'success').mockImplementation(() => {});
    errorSpy = vi.spyOn(notificationService, 'error').mockImplementation(() => {});
    warningSpy = vi.spyOn(notificationService, 'warning').mockImplementation(() => {});
    infoSpy = vi.spyOn(notificationService, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('toast(msg) sans mot-cle => INFO (et surtout jamais « succes »)', () => {
    toast('Machine publiee');
    expect(infoSpy).toHaveBeenCalledWith('Information', 'Machine publiee');
    expect(successSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("le refus reel du 2026-08-13 ne doit PAS passer pour un succes", () => {
    toast(
      "Nous n'avons pas pu modifier votre formule. Votre abonnement actuel reste " +
        "en place et aucun second prelevement n'a ete fait.",
    );
    expect(successSpy).not.toHaveBeenCalled();
  });

  it('un marqueur de reussite explicite reste un succes', () => {
    toast('✅ Paiement confirme. Votre abonnement est actif !');
    expect(successSpy).toHaveBeenCalled();
  });

  it("toast(msg) avec 'erreur' => error", () => {
    toast("Une erreur est survenue");
    expect(errorSpy).toHaveBeenCalledWith('Erreur', 'Une erreur est survenue');
    expect(successSpy).not.toHaveBeenCalled();
  });

  it("toast(msg) avec 'impossible' => error", () => {
    toast("Impossible de contacter le serveur");
    expect(errorSpy).toHaveBeenCalled();
  });

  it('toast(msg, "warning") force le type', () => {
    toast('La session va expirer', 'warning');
    expect(warningSpy).toHaveBeenCalledWith('Attention', 'La session va expirer');
  });

  it('toast.success(msg) appelle notificationService.success', () => {
    toast.success('Paiement recu');
    expect(successSpy).toHaveBeenCalledWith('Succes', 'Paiement recu');
  });

  it('toast.error(msg, title) prend le titre custom', () => {
    toast.error('Carte refusee', 'Erreur de paiement');
    expect(errorSpy).toHaveBeenCalledWith('Erreur de paiement', 'Carte refusee');
  });

  it('toast.info(msg) appelle notificationService.info', () => {
    toast.info('3 nouveaux messages');
    expect(infoSpy).toHaveBeenCalledWith('Information', '3 nouveaux messages');
  });
});
