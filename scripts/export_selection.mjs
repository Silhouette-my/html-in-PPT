// Source-page selectors are one-based, unique and in source order.
export function selectPages(value, count) {
  if (value === undefined) return Array.from({ length: count }, (_, index) => index);
  if (!/^[1-9]\d*(?:-[1-9]\d*)?(?:,[1-9]\d*(?:-[1-9]\d*)?)*$/.test(value)) throw new Error('--pages must use positive page numbers or ascending ranges, e.g. 1,3-5.');
  const pages = new Set();
  for (const part of value.split(',')) {
    const [first, last = first] = part.split('-').map(Number);
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || last < first || last > count) throw new Error(`--pages range ${part} is outside 1-${count} or reversed.`);
    for (let page = first; page <= last; page++) pages.add(page - 1);
  }
  return [...pages].sort((a, b) => a - b);
}
export function exportMapping(metadata, indices, steps) {
  return indices.flatMap(index => steps
    ? Array.from({ length: metadata[index].stepCount + 1 }, (_, step) => ({ sourcePage: index + 1, step, totalSteps: metadata[index].stepCount }))
    : [{ sourcePage: index + 1, step: 'all', totalSteps: metadata[index].stepCount }]);
}
export function notesForMapping(metadata, mapping, steps) {
  return mapping.map(item => {
    const note = metadata[item.sourcePage - 1].notes;
    const cue = `导出定位：源页 ${item.sourcePage} · ${item.step === 0 ? '初始' : `步骤 ${item.step}`} (${item.step}/${item.totalSteps})`;
    return steps ? [note, cue].filter(Boolean).join('\n\n') : note;
  });
}
