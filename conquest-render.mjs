// Renders one entry of the "Custom ..." reference pages (armors, shields, items, ...) in the original Webflow markup.
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const COPY = 'fs-copyclip-message="copied!" fs-copyclip-element="click" href="#"';

export function renderConquestItem(it, cfg) {
  const name = cfg.nameTag === 'div'
    ? `<div class="heading-4-copy">${esc(it.name)}</div>`
    : `<a ${COPY} class="heading-4-copy">${esc(it.name)}</a>`;
  let notes = '';
  if (cfg.notes === 'single') notes = it.note ? `<div class="text-block-11">${esc(it.note)}</div>` : '<div class="text-block-11"></div>';
  else if (cfg.notes === 'mob') notes = `<div class="div-block-242"><div class="text-block-11">${esc(it.note || '')}</div>${it.note2 ? `<div class="text-block-11-copy">${esc(it.note2)}</div>` : ''}</div>`;
  const cmd = cfg.cmd ? `<div class="div-block-230"><a ${COPY} class="commandbox">${esc(it.cmd || '')}</a></div>` : '';
  const alias = it.alias ? `<div class="div-block-231"><a ${COPY} class="heading-4-copy">${esc(it.alias)}</a></div>` : '';
  const body = `${cfg.grad ? '<div class="div-block-47"></div>' : ''}<div class="${cfg.preview}"><img src="${it.img}" loading="lazy" alt="" class="${cfg.img}"/></div>${alias}<div class="div-block-230">${name}</div>${cmd}${notes}`;
  return `<div pointer-events="none" role="listitem" class="${cfg.frame} w-dyn-item"><div class="itembackdrop"><div class="${cfg.inner}">${cfg.b215 ? `<div class="div-block-215">${body}</div>` : body}</div></div></div>`;
}

// One entry of the block catalog (/catalog): the picture, its blurred copy for the hover zoom, and the name.
export function renderCatalogItem(it, wid) {
  const esc2 = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<div role="listitem" class="collection-item-28 w-dyn-item"><div data-w-id="${wid}" class="extra-states-copy"><div class="div-block-249"><div class="div-block-248"><img src="${it.img}" loading="lazy" alt="" class="base"/></div></div><div class="div-block-249-copy"><div class="div-block-248"><img src="${it.img}" loading="lazy" style="display:none;transform-style:preserve-3d" alt="" class="shadow"/></div></div></div><div class="div-block-247"><p class="paragraph-23">${esc2(it.name)}</p></div></div>`;
}
