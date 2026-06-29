import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { uploadImage } from '../utils/upload';
import { validateImageFile } from '../utils/fileLimits';
import { EMPTY_DOCUMENT, documentsArrayToMap, documentsMapToArray } from '../utils/documents';

function revokeLocalPreview(doc) {
  if (doc?.isLocal && doc?.url) {
    URL.revokeObjectURL(doc.url);
  }
}

/**
 * Manages document slots. By default uploads are deferred until uploadAllPending().
 * @param {string[]} documentTypes
 * @param {{ deferUpload?: boolean }} options
 */
export function useDocumentsManager(documentTypes = [], { deferUpload = true } = {}) {
  const documentTypesKey = documentTypes.join('|');
  const [documents, setDocuments] = useState(() =>
    documentTypes.reduce((acc, type) => ({ ...acc, [type]: { ...EMPTY_DOCUMENT } }), {}),
  );
  const documentsRef = useRef(documents);
  documentsRef.current = documents;

  useEffect(
    () => () => {
      Object.values(documentsRef.current).forEach(revokeLocalPreview);
    },
    [],
  );

  const loadFromApiDocuments = useCallback(
    (apiDocuments) => {
      const map = documentsArrayToMap(apiDocuments, documentTypes.length ? documentTypes : null);
      setDocuments((prev) => {
        const next = { ...prev };
        documentTypes.forEach((type) => {
          revokeLocalPreview(prev[type]);
          next[type] = map[type] || { ...EMPTY_DOCUMENT };
        });
        return next;
      });
    },
    [documentTypesKey],
  );

  const stageDocument = useCallback((type, file) => {
    if (!file || !type) return;

    const check = validateImageFile(file);
    if (!check.ok) {
      throw new Error(check.message);
    }

    setDocuments((prev) => {
      const prevDoc = prev[type] || { ...EMPTY_DOCUMENT };
      revokeLocalPreview(prevDoc);

      return {
        ...prev,
        [type]: {
          url: URL.createObjectURL(file),
          publicId: prevDoc.publicId,
          pendingFile: file,
          isLocal: true,
          loading: false,
        },
      };
    });
  }, []);

  const uploadDocumentImmediate = useCallback(async (type, file) => {
    if (!file || !type) return;

    const check = validateImageFile(file);
    if (!check.ok) {
      throw new Error(check.message);
    }

    let previousPublicId = null;
    setDocuments((prev) => {
      const prevDoc = prev[type] || { ...EMPTY_DOCUMENT };
      previousPublicId = prevDoc.publicId;
      revokeLocalPreview(prevDoc);
      return {
        ...prev,
        [type]: { ...prevDoc, loading: true, pendingFile: null, isLocal: false },
      };
    });

    try {
      const result = await uploadImage(file, previousPublicId);
      setDocuments((prev) => ({
        ...prev,
        [type]: {
          url: result.url,
          publicId: result.publicId,
          loading: false,
          pendingFile: null,
          isLocal: false,
        },
      }));
      return result;
    } catch (error) {
      setDocuments((prev) => ({
        ...prev,
        [type]: { ...(prev[type] || EMPTY_DOCUMENT), loading: false },
      }));
      throw error;
    }
  }, []);

  const uploadDocument = useCallback(
    async (type, file) => {
      if (deferUpload) {
        stageDocument(type, file);
        return null;
      }
      return uploadDocumentImmediate(type, file);
    },
    [deferUpload, stageDocument, uploadDocumentImmediate],
  );

  const uploadAllPending = useCallback(async () => {
    const snapshot = documentsRef.current;
    const pendingTypes = documentTypes.filter((type) => snapshot[type]?.pendingFile);
    if (!pendingTypes.length) return snapshot;

    setDocuments((prev) => {
      const next = { ...prev };
      pendingTypes.forEach((type) => {
        next[type] = { ...next[type], loading: true };
      });
      return next;
    });

    const nextDocs = { ...documentsRef.current };

    for (const type of pendingTypes) {
      const doc = snapshot[type];
      try {
        revokeLocalPreview(doc);
        const result = await uploadImage(doc.pendingFile, doc.publicId);
        nextDocs[type] = {
          url: result.url,
          publicId: result.publicId,
          loading: false,
          pendingFile: null,
          isLocal: false,
        };
        setDocuments((prev) => ({ ...prev, [type]: nextDocs[type] }));
      } catch (error) {
        setDocuments((prev) => ({
          ...prev,
          [type]: {
            ...prev[type],
            loading: false,
            url: doc.pendingFile ? URL.createObjectURL(doc.pendingFile) : prev[type]?.url,
            pendingFile: doc.pendingFile,
            isLocal: Boolean(doc.pendingFile),
          },
        }));
        throw error;
      }
    }

    return nextDocs;
  }, [documentTypesKey]);

  const hasPendingUploads = useMemo(
    () => documentTypes.some((type) => Boolean(documents[type]?.pendingFile)),
    [documentTypesKey, documents],
  );

  const isAnyUploading = useMemo(
    () => Object.values(documents).some((d) => d?.loading),
    [documents],
  );

  const allRequiredUploaded = useCallback(
    (requiredTypes) =>
      requiredTypes.every((type) => {
        const doc = documents[type];
        return Boolean(doc?.url) && !doc?.loading;
      }),
    [documents],
  );

  const toPayloadArray = useCallback((customDocs) => documentsMapToArray(customDocs || documents), [documents]);

  return {
    documents,
    loadFromApiDocuments,
    uploadDocument,
    uploadAllPending,
    hasPendingUploads,
    isAnyUploading,
    allRequiredUploaded,
    toPayloadArray,
  };
}
