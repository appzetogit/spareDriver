import { useState, useCallback, useEffect, useRef } from 'react';

function readDraft(key, fallback) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? { ...fallback, ...parsed } : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Persists onboarding form fields in sessionStorage until the step is submitted.
 * File blobs are not stored here — use useDocumentsManager for deferred image staging.
 */
export function useFormDraft(key, initialValue) {
  const initialRef = useRef(initialValue);
  const [value, setValue] = useState(() => readDraft(key, initialRef.current));

  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Quota exceeded or private mode — ignore
    }
  }, [key, value]);

  const clearDraft = useCallback(() => {
    sessionStorage.removeItem(key);
  }, [key]);

  const replaceDraft = useCallback((next) => {
    setValue(next);
  }, []);

  return [value, setValue, clearDraft, replaceDraft];
}
