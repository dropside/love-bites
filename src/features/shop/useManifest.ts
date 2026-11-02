import { useEffect, useState } from 'react';
import { loadManifest } from '../../data/catalog';
import type { CatalogManifest } from '../../domain/types';

export function useManifest() {
  const [m, setM] = useState<CatalogManifest | null>(null);
  useEffect(() => {
    loadManifest().then(setM).catch(() => setM(null));
  }, []);
  return m;
}
