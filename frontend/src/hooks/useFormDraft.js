import { useState, useCallback, useEffect, useRef } from 'react';

function getStorage(kind) {
  return kind === 'local' ? localStorage : sessionStorage;
}

function readDraft(key, fallback, storageKind) {
  try {
    const storage = getStorage(storageKind);
    let raw = storage.getItem(key);
    // Migrate session → local when switching storage for the same key.
    if (!raw && storageKind === 'local') {
      raw = sessionStorage.getItem(key);
      if (raw) {
        storage.setItem(key, raw);
        sessionStorage.removeItem(key);
      }
    }
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? { ...fallback, ...parsed } : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Persists onboarding form fields until the step is submitted.
 * File blobs are not stored here — persist durable URLs (e.g. Cloudinary) instead.
 *
 * @param {string} key
 * @param {object} initialValue
 * @param {{ storage?: 'session' | 'local' }} [options]
 */
export function useFormDraft(key, initialValue, { storage: storageKind = 'session' } = {}) {
  const initialRef = useRef(initialValue);
  const [value, setValue] = useState(() => readDraft(key, initialRef.current, storageKind));

  useEffect(() => {
    try {
      getStorage(storageKind).setItem(key, JSON.stringify(value));
    } catch {
      // Quota exceeded or private mode — ignore
    }
  }, [key, value, storageKind]);

  const clearDraft = useCallback(() => {
    try {
      getStorage(storageKind).removeItem(key);
      if (storageKind === 'local') sessionStorage.removeItem(key);
    } catch {
      // ignore
    }
    setValue(initialRef.current);
  }, [key, storageKind]);

  const replaceDraft = useCallback((next) => {
    setValue(next);
  }, []);

  return [value, setValue, clearDraft, replaceDraft];
}
