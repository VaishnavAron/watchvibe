export function clean(value) {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

export function toNumber(value) {
  if (value && typeof value.toNumber === 'function') return value.toNumber();
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function slug(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'movie';
}

export function placeholder(title, size) {
  return `https://placehold.co/${size}/1f2937/f9fafb?text=${encodeURIComponent(title)}`;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function normalizeArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map(clean).filter(Boolean);
}
