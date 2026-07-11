import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import Card from '../../../../components/Card';
import Button from '../../../../components/Button';
import Input from '../../../../components/Input';
import api from '../../../../utils/api';
import { SITE_LEGAL_PAGES } from '../../../landing/constants/legalPages';

const emptyForms = () =>
  Object.fromEntries(
    SITE_LEGAL_PAGES.map((page) => [
      page.type,
      { title: page.titleFallback, content: '' },
    ]),
  );

const LegalPagesTab = () => {
  const [forms, setForms] = useState(emptyForms);
  const [baseline, setBaseline] = useState(emptyForms);
  const [activeType, setActiveType] = useState(SITE_LEGAL_PAGES[0].type);
  const [loading, setLoading] = useState(true);
  const [savingType, setSavingType] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const next = emptyForms();
        await Promise.all(
          SITE_LEGAL_PAGES.map(async (page) => {
            const res = await api.get(`/admin/settings/legal-documents?type=${page.type}`);
            const docs = res?.data?.data || [];
            const active = docs.find((d) => d.isActive) || docs[0];
            if (active) {
              next[page.type] = {
                title: active.title || page.titleFallback,
                content: active.content || '',
              };
            }
          }),
        );
        if (!cancelled) {
          setForms(next);
          setBaseline(next);
        }
      } catch (err) {
        console.error('Failed to load legal pages', err);
        toast.error(err.response?.data?.message || 'Failed to load legal pages');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeMeta = SITE_LEGAL_PAGES.find((p) => p.type === activeType);
  const activeForm = forms[activeType] || { title: '', content: '' };
  const activeBaseline = baseline[activeType] || { title: '', content: '' };
  const isDirty =
    activeForm.title !== activeBaseline.title ||
    activeForm.content !== activeBaseline.content;
  const isSaving = savingType === activeType;

  const savePage = async (type) => {
    const form = forms[type];
    if (!form?.title?.trim() || !form?.content?.trim()) {
      toast.error('Title and content are required');
      return;
    }
    setSavingType(type);
    try {
      await api.post(`/admin/settings/legal-documents/${type}`, form);
      setBaseline((prev) => ({ ...prev, [type]: { ...form } }));
      toast.success('Legal page saved');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save legal page');
    } finally {
      setSavingType(null);
    }
  };

  if (loading) {
    return (
      <div className="py-16 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
        <p className="text-sm text-slate-500">Loading legal pages…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-bold text-slate-800">Website Legal Pages</h3>
        <p className="text-sm text-slate-500 mt-1">
          Content shown on the public landing-site legal pages. Use plain text; line breaks are preserved.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {SITE_LEGAL_PAGES.map((page) => (
          <button
            key={page.type}
            type="button"
            onClick={() => setActiveType(page.type)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              activeType === page.type
                ? 'bg-yellow-400 text-black shadow-md'
                : 'bg-slate-100 text-slate-600 hover:bg-white'
            }`}
          >
            {page.label}
          </button>
        ))}
      </div>

      <Card className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h4 className="font-bold text-slate-800">{activeMeta?.label}</h4>
            <Link
              to={activeMeta?.path || '/'}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-slate-500 hover:text-slate-700 underline"
            >
              Open public page
            </Link>
          </div>
          <Button
            onClick={() => savePage(activeType)}
            loading={isSaving}
            disabled={!isDirty || isSaving || loading}
            className="flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            Save {activeMeta?.label}
          </Button>
        </div>

        <Input
          label="Page Title"
          value={activeForm.title}
          onChange={(e) =>
            setForms((prev) => ({
              ...prev,
              [activeType]: { ...prev[activeType], title: e.target.value },
            }))
          }
          required
        />

        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-slate-700">Page Content</label>
          <textarea
            value={activeForm.content}
            onChange={(e) =>
              setForms((prev) => ({
                ...prev,
                [activeType]: { ...prev[activeType], content: e.target.value },
              }))
            }
            rows={18}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-yellow-400/60"
            placeholder="Paste or write the full policy content here…"
            required
          />
        </div>
      </Card>
    </div>
  );
};

export default LegalPagesTab;
