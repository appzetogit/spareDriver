import { useEffect, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import api from '../../../utils/api';
import { getLegalPageMeta } from '../constants/legalPages';
import { LandingFooter, LandingHeader } from '../components/LandingShell';

/**
 * @param {{ type: string }} props
 */
const LegalDocumentPage = ({ type }) => {
  const meta = getLegalPageMeta(type);
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const title = meta?.titleFallback || 'Legal';
    document.title = `${title} - sparedriver`;

    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.name = 'description';
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute('content', meta?.description || title);
    window.scrollTo(0, 0);

    let cancelled = false;
    setLoading(true);
    api
      .get(`/common/legal/${type}`)
      .then((res) => {
        if (!cancelled) setDoc(res.data?.data || null);
      })
      .catch(() => {
        if (!cancelled) setDoc(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [type, meta?.description, meta?.titleFallback]);

  const heading = doc?.title || meta?.titleFallback || 'Legal Document';
  const updatedAt = doc?.updatedAt
    ? new Date(doc.updatedAt).toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  return (
    <div className="w-full min-h-screen bg-bg text-text antialiased font-sans flex flex-col justify-between">
      <LandingHeader backToHome />

      <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-16">
        <div className="space-y-4 mb-12 border-b border-border pb-8">
          <div className="inline-flex p-3 bg-[#F5C400] rounded-2xl text-black mb-2">
            <FileText className="w-6 h-6" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-dark">{heading}</h1>
          {updatedAt ? (
            <p className="text-text-secondary text-sm">Last Updated: {updatedAt}</p>
          ) : null}
        </div>

        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-sm text-text-secondary">Loading document…</p>
          </div>
        ) : doc?.content ? (
          <div className="text-text-secondary text-sm md:text-base leading-relaxed whitespace-pre-wrap">
            {doc.content}
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-white p-8 text-center space-y-2">
            <p className="font-semibold text-dark">Content not published yet</p>
            <p className="text-sm text-text-secondary">
              This page will appear here once it is added from Platform Settings in the admin panel.
            </p>
          </div>
        )}
      </main>

      <LandingFooter />
    </div>
  );
};

export default LegalDocumentPage;
