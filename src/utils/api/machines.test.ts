import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Non-régression FE-02 : chaque image ne doit être téléversée QU'UNE FOIS.
 *
 * Avant correction, `SellEquipment.handleSubmit` téléversait déjà les images
 * puis passait les mêmes `File[]` à `publishMachine`, qui les re-téléversait :
 * 2 copies par image, la première devenant orpheline dans le bucket.
 */

const hoisted = vi.hoisted(() => {
  const uploadMock = vi.fn(async () => ({ error: null }));
  const insertMock = vi.fn(
    async (_rows: Array<Record<string, unknown>>) => ({ data: [{ id: 'machine-1' }], error: null }),
  );

  const supabaseMock = {
    storage: {
      from: vi.fn(() => ({ upload: uploadMock })),
    },
    from: vi.fn(() => ({ insert: insertMock })),
  };

  return { uploadMock, insertMock, supabaseMock };
});

vi.mock('../supabaseClient', () => ({ default: hoisted.supabaseMock }));
vi.mock('./auth', () => ({ getCurrentUser: vi.fn(async () => ({ id: 'user-1' })) }));

import { publishMachine, sanitizeImageFileName } from './machines';

function file(name: string): File {
  return new File(['x'], name, { type: 'image/jpeg' });
}

describe('publishMachine — téléversement des images', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.uploadMock.mockResolvedValue({ error: null } as never);
    hoisted.insertMock.mockResolvedValue({ data: [{ id: 'machine-1' }], error: null } as never);
  });

  it('FE-02 : téléverse exactement une fois par image (pas de doublon)', async () => {
    await publishMachine({ name: 'Pelle' } as never, [file('a.jpg'), file('b.jpg')]);

    expect(hoisted.uploadMock).toHaveBeenCalledTimes(2);
  });

  it('FE-02 : enregistre un chemin d’image par fichier téléversé', async () => {
    await publishMachine({ name: 'Pelle' } as never, [file('a.jpg'), file('b.jpg')]);

    const row = hoisted.insertMock.mock.calls[0]?.[0]?.[0] as unknown as { images: string[] };
    expect(row.images).toHaveLength(2);
    expect(new Set(row.images).size).toBe(2);
  });

  it('remonte une erreur de téléversement au lieu de publier une annonce muette', async () => {
    hoisted.uploadMock.mockResolvedValueOnce({ error: { message: 'quota dépassé' } } as never);

    await expect(publishMachine({ name: 'Pelle' } as never, [file('a.jpg')])).rejects.toThrow(
      /quota dépassé/,
    );
    expect(hoisted.insertMock).not.toHaveBeenCalled();
  });

  it('publie sans image sans téléverser quoi que ce soit', async () => {
    await publishMachine({ name: 'Pelle' } as never, []);

    expect(hoisted.uploadMock).not.toHaveBeenCalled();
    expect(hoisted.insertMock).toHaveBeenCalledTimes(1);
  });
});

describe('sanitizeImageFileName', () => {
  it('retire le chemin, les accents et les caractères non sûrs', () => {
    expect(sanitizeImageFileName('dossier/Pelle Été #1.JPG')).toBe('Pelle_Ete__1.JPG');
  });

  it('laisse intact un nom déjà sûr', () => {
    expect(sanitizeImageFileName('pelle-01_v2.jpg')).toBe('pelle-01_v2.jpg');
  });
});
