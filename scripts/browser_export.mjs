// Functions passed to page.evaluate are self-contained browser-side code.
export async function waitForReady({ index, step, useApi, timeout, identity }) {
  const wait = async () => {
    const api = window.htmlDeck;
    if (api?.ready !== undefined) {
      if (!api.ready || typeof api.ready.then !== 'function') throw new Error('htmlDeck.ready must be a Promise.');
      await api.ready;
    }
    if (useApi) {
      const prepared = api.prepareExport({ index, step });
      if (!prepared || typeof prepared.then !== 'function') throw new Error('htmlDeck.prepareExport must return a Promise.');
      await prepared;
    }
    await document.fonts.ready;
    await Promise.all([...document.images].map(image => image.decode()));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  };
  let timer;
  try { await Promise.race([wait(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Readiness timed out after ${timeout}ms: ${identity}`)), timeout); })]); }
  finally { clearTimeout(timer); }
}
export function inspectDocument() {
  const invalid = [];
  for (const element of document.querySelectorAll('[src],[srcset],link[href],object[data],iframe')) {
    for (const attribute of ['src', 'srcset', 'href', 'data']) {
      const value = element.getAttribute(attribute);
      if (value && !value.startsWith('data:') && !value.startsWith('#') && !(attribute === 'href' && element.tagName !== 'LINK')) invalid.push(`${element.tagName} ${attribute}=${value}`);
    }
  }
  for (const element of document.querySelectorAll('[style],style')) {
    const css = element.tagName === 'STYLE' ? element.textContent : element.getAttribute('style');
    for (const match of css.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) if (!match[2].startsWith('data:') && !match[2].startsWith('#')) invalid.push(`CSS url(${match[2]})`);
    if (/@import\s/i.test(css)) invalid.push('CSS @import');
  }
  const slides = [...document.querySelectorAll('#deck > .slide')];
  function noteText(note) {
    if (!note) return '';
    function text(node) {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent;
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      if (node.tagName === 'BR') return '\n';
      if (node.tagName === 'OL' || node.tagName === 'UL') return '\n' + [...node.children].map((item, index) => `${node.tagName === 'OL' ? `${index + 1}.` : '•'} ${[...item.childNodes].map(text).join('').trim()}`).join('\n') + '\n';
      const value = [...node.childNodes].map(text).join('');
      return ['P', 'DIV'].includes(node.tagName) ? `\n\n${value}\n\n` : value;
    }
    return [...note.childNodes].map(text).join('').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  const legacy = slides.map((slide, index) => ({ index, id: slide.id, title: slide.dataset.title || slide.querySelector('h1,h2')?.textContent || '', notes: noteText(slide.querySelector('.speaker-note')), stepCount: new Set([...slide.querySelectorAll('[data-step]')].map(element => element.dataset.step)).size }));
  const metadata = typeof window.htmlDeck?.getSlides === 'function' ? window.htmlDeck.getSlides() : legacy;
  const interactiveSlides = slides.flatMap((slide, index) => {
    const marked = [...slide.querySelectorAll('[data-interactive],[data-effect]')];
    if (slide.matches('[data-interactive],[data-effect]')) marked.unshift(slide);
    return marked.length ? [{ slide: index + 1, title: legacy[index].title, effects: [...new Set(marked.map(element => element.dataset.effect).filter(Boolean))], interactiveRegions: marked.filter(element => element.hasAttribute('data-interactive')).length }] : [];
  });
  return { invalid, count: slides.length, exportMode: document.body.classList.contains('export-slide'), metadata, hasApi: typeof window.htmlDeck?.getSlides === 'function' && typeof window.htmlDeck?.prepareExport === 'function', interactiveSlides };
}
export function validateMetadata(info) {
  if (!info.exportMode || !info.count) throw new Error('Expected html-deck template with #deck > .slide and ?export=1 support.');
  if (!Array.isArray(info.metadata) || info.metadata.length !== info.count || info.metadata.some((slide, index) => slide?.index !== index || typeof slide.title !== 'string' || typeof slide.notes !== 'string' || !Number.isSafeInteger(slide.stepCount) || slide.stepCount < 0)) throw new Error('htmlDeck.getSlides() must return ordered {index,title,notes,stepCount} metadata matching #deck > .slide.');
}
