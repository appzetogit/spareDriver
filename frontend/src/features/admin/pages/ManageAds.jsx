import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Plus,
  Image as ImageIcon,
  Video,
  Pencil,
  Trash2,
  ExternalLink,
  Loader2,
  RefreshCw,
  Megaphone,
  X,
  UploadCloud,
} from 'lucide-react';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import Input from '../../../components/Input';
import Drawer from '../../../components/Drawer';
import api from '../../../utils/api';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { useAdsStore } from '../../../store/user/useAdsStore';

/**
 * Admin → Manage Ads.
 *
 * Admins and sub_admins can publish promotional creatives (image or
 * short video) that surface on the user home screen. Optional click-
 * through URL opens in a new tab on the user side.
 */
const ManageAds = () => {
  // Default to `loading: true` so the initial fetch effect doesn't
  // need a synchronous setLoading(true), avoiding the React lint rule
  // against calling setState directly inside an effect body.
  const [ads, setAds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingAd, setEditingAd] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const sortedAds = useMemo(() => {
    return [...ads].sort((a, b) => {
      const orderA = Number(a.sortOrder ?? 0);
      const orderB = Number(b.sortOrder ?? 0);
      if (orderA !== orderB) return orderA - orderB;
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
  }, [ads]);

  /**
   * Manual refresh — runs from the toolbar button and after CRUD
   * actions. Toggling `loading: true` inside this handler is fine
   * because it's an event-handler context, not an effect body.
   */
  const fetchAds = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/ads');
      setAds(res?.data?.data || []);
      setError('');
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load ads');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial hydration — fire-and-forget. The state updates happen
  // inside the promise callbacks, which the lint rule allows.
  useEffect(() => {
    let cancelled = false;
    api
      .get('/admin/ads')
      .then((res) => {
        if (cancelled) return;
        setAds(res?.data?.data || []);
        setError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.response?.data?.message || 'Failed to load ads');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleNew = () => {
    setEditingAd(null);
    setShowForm(true);
  };

  const handleEdit = (ad) => {
    setEditingAd(ad);
    setShowForm(true);
  };

  const handleSaved = () => {
    setShowForm(false);
    setEditingAd(null);
    useAdsStore.getState().invalidate();
    fetchAds();
  };

  const handleDelete = async () => {
    if (!confirmDelete?._id) return;
    setDeleting(true);
    try {
      await api.delete(`/admin/ads/${confirmDelete._id}`);
      toast.success('Ad deleted');
      setConfirmDelete(null);
      useAdsStore.getState().invalidate();
      fetchAds();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not delete ad');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-3.5 sm:space-y-5 animate-fade-in-up pb-10">
      <div className="bg-gradient-to-br from-indigo-500 to-violet-600 text-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 shadow-sm flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
        <div className="flex items-start gap-2.5 sm:gap-3 min-w-0">
          <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
            <Megaphone className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold">Manage Ads</h1>
            <p className="text-[11px] sm:text-[12px] text-white/80 mt-0.5 leading-snug">
              Upload promotional images or short videos with optional
              click-through links. Active ads appear on the user home
              screen.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 w-full sm:w-auto">
          <button
            type="button"
            onClick={fetchAds}
            disabled={loading}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 sm:py-2 rounded-xl bg-white/10 text-white text-xs font-semibold hover:bg-white/15 disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <Button size="sm" icon={Plus} onClick={handleNew} className="flex-1 sm:flex-initial">
            New ad
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 sm:p-4 bg-rose-50 border border-rose-100 rounded-xl sm:rounded-2xl text-rose-600 text-xs sm:text-sm">
          {error}
        </div>
      )}

      {loading && ads.length === 0 ? (
        <Card className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </Card>
      ) : sortedAds.length === 0 ? (
        <Card className="py-12 sm:py-16 text-center p-4">
          <div className="w-12 h-12 sm:w-14 sm:h-14 mx-auto rounded-xl sm:rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3">
            <Megaphone className="w-6 h-6 sm:w-7 sm:h-7" />
          </div>
          <p className="text-xs sm:text-sm font-semibold text-slate-700">No ads yet</p>
          <p className="text-[11px] sm:text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Create your first ad — upload an image or short video and
            optionally attach a link. Users will see it on the home screen.
          </p>
          <Button className="mt-4" icon={Plus} onClick={handleNew}>
            Create your first ad
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
          {sortedAds.map((ad) => (
            <AdRowCard
              key={ad._id}
              ad={ad}
              onEdit={() => handleEdit(ad)}
              onDelete={() => setConfirmDelete(ad)}
            />
          ))}
        </div>
      )}

      {showForm && (
        <AdFormModal
          ad={editingAd}
          onClose={() => {
            setShowForm(false);
            setEditingAd(null);
          }}
          onSaved={handleSaved}
        />
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => !deleting && setConfirmDelete(null)}
        onConfirm={handleDelete}
        title="Delete this ad?"
        description={`This will remove "${confirmDelete?.title || 'this ad'}" from the user home screen and delete the uploaded media. This cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Keep"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
};

/* ------------------------------------------------------------------ */

function AdRowCard({ ad, onEdit, onDelete }) {
  const isVideo = ad.mediaType === 'video';
  return (
    <Card className="!p-0 overflow-hidden flex flex-col sm:flex-col">
      {/* Mobile Card Layout (< sm) */}
      <div className="sm:hidden flex items-center p-2.5 gap-3 min-w-0">
        <div className="relative w-24 h-16 rounded-lg overflow-hidden bg-slate-900 shrink-0">
          {isVideo ? (
            <video
              src={ad.mediaUrl}
              className="w-full h-full object-cover"
              muted
              playsInline
              loop
              autoPlay
            />
          ) : (
            <img
              src={ad.mediaUrl}
              alt={ad.title || 'Ad creative'}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          )}
          <span
            className={`absolute bottom-1 left-1 px-1 py-0.2 rounded text-[8px] font-bold ${
              isVideo ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white'
            }`}
          >
            {isVideo ? 'Vid' : 'Img'}
          </span>
          <span
            className={`absolute top-1 right-1 w-2 h-2 rounded-full ${
              ad.isActive ? 'bg-emerald-400 ring-1 ring-white' : 'bg-slate-400'
            }`}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1.5">
            <p className="text-xs font-bold text-slate-900 truncate">
              {ad.title || <span className="text-slate-400 italic">Untitled</span>}
            </p>
            <span
              className={`shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
                ad.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {ad.isActive ? 'Active' : 'Hidden'}
            </span>
          </div>
          {ad.linkUrl ? (
            <a
              href={ad.linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-[10px] text-indigo-600 hover:underline mt-0.5 truncate max-w-full"
            >
              <ExternalLink className="w-2.5 h-2.5 shrink-0" />
              <span className="truncate">{ad.linkUrl}</span>
            </a>
          ) : (
            <p className="text-[10px] text-slate-400 mt-0.5">No link</p>
          )}
          <div className="flex items-center justify-between gap-2 mt-1.5">
            <span className="text-[9px] text-slate-400">Order: {ad.sortOrder || 0}</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md border border-slate-200 bg-white text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Pencil className="w-2.5 h-2.5" />
                Edit
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold text-rose-600 hover:bg-rose-50"
              >
                <Trash2 className="w-2.5 h-2.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop Card Layout (sm: and above) */}
      <div className="hidden sm:block">
        <div className="relative aspect-[16/9] bg-slate-900">
          {isVideo ? (
            <video
              src={ad.mediaUrl}
              className="w-full h-full object-cover"
              muted
              playsInline
              loop
              autoPlay
            />
          ) : (
            <img
              src={ad.mediaUrl}
              alt={ad.title || 'Ad creative'}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          )}
          <span
            className={`absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
              isVideo ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
            }`}
          >
            {isVideo ? <Video className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
            {isVideo ? 'Video' : 'Image'}
          </span>
          <span
            className={`absolute top-2 right-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
              ad.isActive ? 'bg-emerald-500 text-white' : 'bg-slate-600 text-white'
            }`}
          >
            {ad.isActive ? 'Active' : 'Hidden'}
          </span>
        </div>
        <div className="p-4 flex-1 flex flex-col gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-900 truncate">
              {ad.title || <span className="text-slate-400 italic">Untitled</span>}
            </p>
            {ad.linkUrl ? (
              <a
                href={ad.linkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:underline mt-0.5 truncate max-w-full"
              >
                <ExternalLink className="w-3 h-3 shrink-0" />
                <span className="truncate">{ad.linkUrl}</span>
              </a>
            ) : (
              <p className="text-[11px] text-slate-400 mt-0.5">No click-through link</p>
            )}
            <p className="text-[10px] text-slate-400 mt-1">Sort order: {ad.sortOrder || 0}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" icon={Pencil} onClick={onEdit} className="flex-1 sm:flex-initial">
              Edit
            </Button>
            <Button size="sm" variant="ghost" icon={Trash2} onClick={onDelete} className="flex-1 sm:flex-initial">
              Delete
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function AdFormModal({ ad, onClose, onSaved }) {
  const isEdit = !!ad?._id;
  const [title, setTitle] = useState(ad?.title || '');
  const [linkUrl, setLinkUrl] = useState(ad?.linkUrl || '');
  const [isActive, setIsActive] = useState(ad?.isActive ?? true);
  const [sortOrder, setSortOrder] = useState(ad?.sortOrder ?? 0);
  const [mediaUrl, setMediaUrl] = useState(ad?.mediaUrl || '');
  const [mediaPublicId, setMediaPublicId] = useState(ad?.mediaPublicId || '');
  const [mediaType, setMediaType] = useState(ad?.mediaType || '');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleFile = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('media', file);
      if (mediaPublicId) {
        formData.append('oldPublicId', mediaPublicId);
        formData.append('oldMediaType', mediaType);
      }
      const res = await api.post('/admin/ads/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const payload = res?.data?.data;
      if (!payload?.url || !payload?.publicId) {
        throw new Error('Upload failed');
      }
      setMediaUrl(payload.url);
      setMediaPublicId(payload.publicId);
      setMediaType(payload.mediaType);
      toast.success('Media uploaded');
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!mediaUrl || !mediaPublicId || !mediaType) {
      toast.error('Upload an image or video for this ad first');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        linkUrl: linkUrl.trim(),
        isActive,
        sortOrder: Number(sortOrder) || 0,
        mediaUrl,
        mediaPublicId,
        mediaType,
      };
      if (isEdit) {
        await api.put(`/admin/ads/${ad._id}`, payload);
        toast.success('Ad updated');
      } else {
        await api.post('/admin/ads', payload);
        toast.success('Ad created');
      }
      onSaved();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not save ad');
    } finally {
      setSubmitting(false);
    }
  };

  const hasMedia = !!mediaUrl;
  const isVideo = mediaType === 'video';

  const drawerHeader = (
    <div className="px-5 py-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-slate-500">
          {isEdit ? 'Edit ad' : 'New ad'}
        </p>
        <h2 className="text-base font-bold text-slate-900 truncate">
          {isEdit ? title || 'Untitled ad' : 'Create promotional ad'}
        </h2>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="p-2 rounded-xl hover:bg-slate-100"
        aria-label="Close"
      >
        <X className="w-5 h-5 text-slate-600" />
      </button>
    </div>
  );

  const drawerFooter = (
    <div className="px-5 py-3 flex gap-3">
      <Button variant="outline" fullWidth onClick={onClose} disabled={submitting}>
        Cancel
      </Button>
      <Button
        fullWidth
        loading={submitting}
        disabled={uploading || !mediaUrl}
        onClick={handleSubmit}
      >
        {isEdit ? 'Save changes' : 'Publish ad'}
      </Button>
    </div>
  );

  return (
    <Drawer isOpen onClose={onClose} header={drawerHeader} footer={drawerFooter} width="max-w-xl">
      <form onSubmit={handleSubmit} className="p-5 space-y-5">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Media (image or short video)
            </p>
            <label
              className={`flex flex-col items-center justify-center gap-2 px-4 py-6 rounded-2xl border-2 border-dashed cursor-pointer transition ${
                hasMedia
                  ? 'border-emerald-300 bg-emerald-50/40'
                  : 'border-slate-300 hover:border-primary hover:bg-primary/5'
              } ${uploading ? 'opacity-60 pointer-events-none' : ''}`}
            >
              <input
                type="file"
                accept="image/jpeg,image/png,image/jpg,image/webp,video/mp4,video/webm,video/quicktime,video/mov"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
                disabled={uploading}
              />
              {uploading ? (
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
              ) : hasMedia ? (
                <>
                  {isVideo ? (
                    <Video className="w-6 h-6 text-emerald-600" />
                  ) : (
                    <ImageIcon className="w-6 h-6 text-emerald-600" />
                  )}
                  <p className="text-sm font-semibold text-slate-800">
                    Click to replace media
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {isVideo ? 'Current: video' : 'Current: image'}
                  </p>
                </>
              ) : (
                <>
                  <UploadCloud className="w-7 h-7 text-slate-400" />
                  <p className="text-sm font-semibold text-slate-700">
                    Click to upload
                  </p>
                  <p className="text-[11px] text-slate-500 text-center">
                    Image up to 5 MB (JPG/PNG/WEBP) or video up to 25 MB
                    (MP4/WEBM/MOV)
                  </p>
                </>
              )}
            </label>
            {hasMedia && (
              <div className="mt-3 rounded-2xl overflow-hidden border border-slate-200 bg-slate-100">
                {isVideo ? (
                  <video
                    src={mediaUrl}
                    controls
                    playsInline
                    className="w-full max-h-72 object-cover bg-black"
                  />
                ) : (
                  <img
                    src={mediaUrl}
                    alt="Ad creative preview"
                    className="w-full max-h-72 object-cover"
                  />
                )}
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Title (shown internally)
            </p>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Diwali offer banner"
              maxLength={120}
            />
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Click-through link (optional)
            </p>
            <Input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://yourpartner.com/landing"
              icon={ExternalLink}
            />
            <p className="text-[11px] text-slate-500 mt-1.5">
              When set, tapping the ad opens this URL in a new browser
              tab on the user app. Leave blank for a non-clickable ad.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Sort order
              </p>
              <Input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                placeholder="0"
              />
              <p className="text-[11px] text-slate-500 mt-1.5">
                Lower numbers appear first.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Visibility
              </p>
              <label className="flex items-center gap-2 mt-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-sm text-slate-700 font-medium">
                  Show on user home
                </span>
              </label>
            </div>
          </div>
        </form>
    </Drawer>
  );
}

export default ManageAds;
