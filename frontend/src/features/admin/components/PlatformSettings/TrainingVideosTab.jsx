import { useState } from 'react';
import { Plus, Edit2, Trash2, Video, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import Button from '../../../../components/Button';
import Input from '../../../../components/Input';
import Toggle from '../../../../components/Toggle';
import Modal from '../../../../components/Modal';
import { useVideoUpload } from '../../../../hooks/useVideoUpload';

const emptyForm = {
  title: '',
  description: '',
  videoUrl: '',
  cloudinaryPublicId: '',
  durationSeconds: 0,
  isRequired: true,
  isActive: true,
  sortOrder: 0,
};

const TrainingVideosTab = ({ videos, onRefresh, onCreate, onUpdate, onDelete, readOnly = false }) => {
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const { uploadVideo, uploading, error: uploadError } = useVideoUpload();

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (video) => {
    setEditing(video);
    setForm({
      title: video.title,
      description: video.description || '',
      videoUrl: video.videoUrl,
      cloudinaryPublicId: video.cloudinaryPublicId,
      durationSeconds: video.durationSeconds || 0,
      isRequired: video.isRequired,
      isActive: video.isActive,
      sortOrder: video.sortOrder || 0,
    });
    setShowModal(true);
  };

  const handleVideoFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const result = await uploadVideo(file, editing?.cloudinaryPublicId || '');
    if (result) {
      setForm((prev) => ({
        ...prev,
        videoUrl: result.url,
        cloudinaryPublicId: result.publicId,
        durationSeconds: result.durationSeconds || prev.durationSeconds,
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.videoUrl || !form.cloudinaryPublicId) {
      toast.error('Please upload a training video');
      return;
    }
    setSubmitting(true);
    try {
      if (editing) {
        await onUpdate(editing._id, form);
      } else {
        await onCreate(form);
      }
      setShowModal(false);
      onRefresh();
      toast.success(editing ? 'Training video updated' : 'Training video created');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
            <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-slate-800">Driver training videos</h3>
          <p className="text-sm text-slate-500 mt-1">Required videos drivers must complete before submission</p>
        </div>
        {!readOnly && (
          <Button onClick={openCreate} className="flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add video
          </Button>
        )}
      </div>
      <div className="space-y-3">
        {videos.map((video, idx) => (
          <div key={video._id} className="flex items-center justify-between p-5 bg-white rounded-2xl border border-slate-200">
            <div className="flex items-center gap-4 min-w-0">
              <span className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center shrink-0"><Video className="w-4 h-4 text-slate-500" /></span>
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{video.title}</p>
                <p className="text-xs text-slate-500 mt-0.5">{Math.round(video.durationSeconds || 0)} sec {video.isRequired ? '· Required' : ''}</p>
              </div>
            </div>
            {!readOnly && (
              <div className="flex gap-1 shrink-0">
                <button type="button" onClick={() => openEdit(video)} className="p-2.5 hover:bg-slate-100 rounded-xl text-slate-400"><Edit2 className="w-4 h-4" /></button>
                <button type="button" onClick={() => onDelete(video._id)} className="p-2.5 hover:bg-rose-50 rounded-xl text-slate-400 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>
              </div>
            )}
          </div>
        ))}
      </div>
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit training video' : 'New training video'}>
        <form onSubmit={handleSubmit} className="space-y-4 p-2">
          <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <Input label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <Input label="Sort order" type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} />
          <label className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-slate-200 rounded-2xl cursor-pointer hover:border-primary">
            <Upload className="w-6 h-6 text-slate-400" />
            <span className="text-sm font-semibold text-slate-600">{uploading ? 'Uploading...' : 'Upload video (MP4, WEBM, MOV)'}</span>
            <input type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden" onChange={handleVideoFile} disabled={uploading} />
          </label>
          {uploadError && <p className="text-xs text-rose-600">{uploadError}</p>}
          {form.videoUrl && <p className="text-xs text-emerald-600 truncate">Video uploaded</p>}
          <div className="space-y-3 p-4 bg-slate-50 rounded-2xl">
            <div className="flex items-center justify-between"><span className="text-sm font-semibold">Required for drivers</span><Toggle checked={form.isRequired} onChange={(v) => setForm({ ...form, isRequired: v })} /></div>
            <div className="flex items-center justify-between pt-3 border-t border-slate-200"><span className="text-sm font-semibold">Active</span><Toggle checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} /></div>
          </div>
          <div className="pt-4 flex gap-3">
            <Button variant="outline" fullWidth type="button" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button fullWidth type="submit" loading={submitting || uploading}>{editing ? 'Update' : 'Create'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default TrainingVideosTab;
