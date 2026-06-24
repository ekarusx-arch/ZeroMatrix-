export const TAG_COLOR_OPTIONS = [
  '#60A5FA',
  '#34D399',
  '#F87171',
  '#FBBF24',
  '#A78BFA',
  '#F472B6',
  '#2DD4BF',
  '#FB923C',
];

export function normalizeTagName(value) {
  return String(value || '').trim().replace(/^#+/, '');
}

export function normalizeTagPalette(rawPalette) {
  if (!Array.isArray(rawPalette)) return [];

  const seen = new Set();
  return rawPalette.reduce((palette, item) => {
    const tag = normalizeTagName(item?.tag);
    if (!tag || seen.has(tag)) return palette;
    seen.add(tag);
    palette.push({
      tag,
      color: /^#[0-9a-f]{6}$/i.test(item?.color || '')
        ? item.color
        : TAG_COLOR_OPTIONS[palette.length % TAG_COLOR_OPTIONS.length],
    });
    return palette;
  }, []);
}

export function mergeTagPalette(palette, tags) {
  const normalized = normalizeTagPalette(palette);
  const seen = new Set(normalized.map((item) => item.tag));

  tags.forEach((value) => {
    const tag = normalizeTagName(value);
    if (!tag || seen.has(tag)) return;
    normalized.push({
      tag,
      color: TAG_COLOR_OPTIONS[normalized.length % TAG_COLOR_OPTIONS.length],
    });
    seen.add(tag);
  });

  return normalized;
}

export function getTagColor(palette, value) {
  const tag = normalizeTagName(value);
  const match = normalizeTagPalette(palette).find((item) => item.tag === tag);
  if (match) return match.color;

  const hash = Array.from(tag).reduce((total, character) => total + character.charCodeAt(0), 0);
  return TAG_COLOR_OPTIONS[hash % TAG_COLOR_OPTIONS.length];
}

export function toSlateTagPalette(palette) {
  return normalizeTagPalette(palette).map((item) => ({
    tag: `#${item.tag}`,
    color: item.color,
  }));
}
