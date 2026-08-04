import { Plus, Trash2, ImageIcon } from 'lucide-react';
import Input from '../../../../components/Input';
import Toggle from '../../../../components/Toggle';
import { uploadImage } from '../../../../utils/upload';
import toast from 'react-hot-toast';
import { createEmptyKitItem } from './kitItemFormUtils';

const DEFAULT_SIZE_VARIANTS = [
  { id: 's', label: 'S' },
  { id: 'm', label: 'M' },
  { id: 'l', label: 'L' },
  { id: 'xl', label: 'XL' },
  { id: 'xxl', label: 'XXL' },
  { id: 'xxxl', label: 'XXXL' },
];

const KitItemsEditor = ({ items, onChange }) => {
  const updateItem = (index, patch) => {
    const next = items.map((item, i) => (i === index ? { ...item, ...patch } : item));
    onChange(next);
  };

  const addItem = () => onChange([...items, createEmptyKitItem()]);

  const removeItem = (index) => onChange(items.filter((_, i) => i !== index));

  const addVariant = (itemIndex) => {
    const item = items[itemIndex];
    updateItem(itemIndex, {
      // Stable id — never derive from the live label (that remounts inputs
      // mid-keystroke and makes XXL / XXXL almost impossible to type).
      variants: [...(item.variants || []), { id: `v-${Date.now()}-${item.variants?.length || 0}`, label: '' }],
    });
  };

  const updateVariant = (itemIndex, variantIndex, label) => {
    const item = items[itemIndex];
    const variants = [...item.variants];
    const prev = variants[variantIndex] || {};
    variants[variantIndex] = {
      id: prev.id || `v-${variantIndex}`,
      label,
    };
    updateItem(itemIndex, { variants });
  };

  const removeVariant = (itemIndex, variantIndex) => {
    const item = items[itemIndex];
    updateItem(itemIndex, {
      variants: item.variants.filter((_, i) => i !== variantIndex),
    });
  };

  const handleImageUpload = async (index, file) => {
    if (!file) return;
    try {
      const { url } = await uploadImage(file);
      updateItem(index, { image: url });
      toast.success('Image uploaded');
    } catch (err) {
      toast.error(err.message || 'Image upload failed');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-800">Kit contents</p>
        <button
          type="button"
          onClick={addItem}
          className="text-xs font-semibold text-primary inline-flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" /> Add item
        </button>
      </div>

      {items.map((item, index) => (
        <div
          key={item.clientKey || index}
          className="p-4 rounded-2xl border border-slate-200 bg-slate-50/80 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase text-slate-400">Item {index + 1}</span>
            {items.length > 1 && (
              <button type="button" onClick={() => removeItem(index)} className="p-1.5 text-rose-500">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex gap-4">
            <label className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-200 bg-white flex items-center justify-center overflow-hidden shrink-0 cursor-pointer">
              {item.image ? (
                <img src={item.image} alt="" className="w-full h-full object-cover" />
              ) : (
                <ImageIcon className="w-6 h-6 text-slate-300" />
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleImageUpload(index, e.target.files?.[0])}
              />
            </label>
            <div className="flex-1 space-y-2">
              <Input
                label="Item name"
                value={item.name}
                onChange={(e) => updateItem(index, { name: e.target.value })}
                placeholder="e.g. Driver T-Shirt"
              />
              <Input
                label="Short description"
                value={item.description}
                onChange={(e) => updateItem(index, { description: e.target.value })}
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="flex items-center justify-between p-3 bg-white rounded-xl">
            <span className="text-sm font-medium text-slate-700">Has size / variant options</span>
            <Toggle
              checked={item.hasVariants}
              onChange={(v) =>
                updateItem(index, {
                  hasVariants: v,
                  variants: v && !item.variants?.length
                    ? DEFAULT_SIZE_VARIANTS.map((opt) => ({ ...opt }))
                    : item.variants,
                })
              }
            />
          </div>

          {item.hasVariants && (
            <div className="space-y-2 pl-1">
              <Input
                label="Variant label"
                value={item.variantLabel}
                onChange={(e) => updateItem(index, { variantLabel: e.target.value })}
                placeholder="Size"
              />
              <p className="text-xs text-slate-500">Driver will pick one option when ordering</p>
              {item.variants?.map((variant, vIdx) => (
                <div key={variant.id || `opt-${index}-${vIdx}`} className="flex gap-2 items-end">
                  <Input
                    label={vIdx === 0 ? 'Options' : ''}
                    value={variant.label}
                    onChange={(e) => updateVariant(index, vIdx, e.target.value)}
                    placeholder="e.g. XXL"
                  />
                  {item.variants.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeVariant(index, vIdx)}
                      className="p-2.5 text-slate-400 hover:text-rose-500 mb-0.5"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => addVariant(index)}
                className="text-xs font-semibold text-primary"
              >
                + Add option
              </button>
            </div>
          )}

          {!item.hasVariants && (
            <p className="text-xs text-slate-500">Fixed item — no variant selection at checkout</p>
          )}
        </div>
      ))}
    </div>
  );
};

export default KitItemsEditor;
