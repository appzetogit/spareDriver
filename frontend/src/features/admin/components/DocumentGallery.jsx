import { useState } from 'react';
import ImageLightbox from '../../../components/ImageLightbox';
import { DOCUMENT_LABELS, dedupeDocumentsForDisplay } from '../../../utils/documents';

const DocumentGallery = ({ documents = [], emptyMessage = 'No documents uploaded' }) => {
  const items = dedupeDocumentsForDisplay(documents);
  const [preview, setPreview] = useState(null);

  if (!items.length) {
    return <p className="text-sm text-slate-500">{emptyMessage}</p>;
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {items.map((doc) => {
          const label = DOCUMENT_LABELS[doc.type] || doc.type.replace(/_/g, ' ');
          return (
            <button
              key={doc.type}
              type="button"
              onClick={() => setPreview({ url: doc.fileUrl, alt: label })}
              className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100 aspect-[4/3] text-left"
            >
              <img
                src={doc.fileUrl}
                alt={label}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                <p className="text-[10px] text-white font-medium truncate">{label}</p>
              </div>
            </button>
          );
        })}
      </div>
      <ImageLightbox
        src={preview?.url}
        alt={preview?.alt}
        onClose={() => setPreview(null)}
      />
    </>
  );
};

export default DocumentGallery;
