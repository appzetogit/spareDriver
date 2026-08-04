const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export const createEmptyKitItem = () => ({
  clientKey: uid(),
  name: '',
  image: '',
  description: '',
  qty: 1,
  hasVariants: false,
  variantLabel: 'Size',
  variants: [
    { id: 's', label: 'S' },
    { id: 'm', label: 'M' },
    { id: 'l', label: 'L' },
    { id: 'xl', label: 'XL' },
    { id: 'xxl', label: 'XXL' },
    { id: 'xxxl', label: 'XXXL' },
  ],
});

export const kitItemFromApi = (item) => ({
  clientKey: item._id || uid(),
  _id: item._id,
  name: item.name || '',
  image: item.image || '',
  description: item.description || '',
  qty: item.qty || 1,
  hasVariants: Boolean(item.hasVariants),
  variantLabel: item.variantLabel || 'Size',
  variants: item.variants?.length
    ? item.variants.map((v) => ({ id: v.id, label: v.label }))
    : [{ id: 'm', label: 'M' }],
});

export const kitItemsToPayload = (items) =>
  items
    .filter((i) => i.name?.trim())
    .map(({ clientKey, ...item }) => ({
      ...item,
      variants: item.hasVariants ? item.variants.filter((v) => v.label?.trim()) : [],
    }));

export { getKitItemKey } from '../../../../utils/kitItems';
