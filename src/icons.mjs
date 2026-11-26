const paths = {
  cursor: '<path d="m5 3 14 10-7 1-3 7z"/>',
  rectangle:
    '<rect x="4" y="5" width="16" height="14" rx="1"/><path d="M2 5h4M4 3v4m14 12h4m-2-2v4"/>',
  pen: '<path d="m4 20 4-1L20 7l-4-4L4 15zM14 5l4 4M4 20l-1 1"/><path d="m3 14 2 1"/>',
  circle: '<circle cx="12" cy="12" r="8"/><path d="M12 12h8m-8-2v4"/>',
  box: '<path d="m12 3 9 5v9l-9 5-9-5V8zM3 8l9 5 9-5m-9 5v9M7 5l10 6"/>',
  extrude: '<path d="m3 15 9-5 9 5-9 6zM3 15v-4l9-5 9 5v4M12 15V2m-3 3 3-3 3 3"/>',
  move: '<path d="M12 2v20M2 12h20M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3m14-6 3 3-3 3"/>',
  rotate: '<path d="M20 10a8 8 0 1 0-2 8M20 4v6h-6"/><path d="M12 8v5l3 2"/>',
  scale:
    '<rect x="3" y="12" width="9" height="9" rx="1"/><path d="M6 8V3h15v15h-5M10 14 21 3m-6 0h6v6"/>',
  paint:
    '<path d="m4 11 8-8 9 9-8 8-9-9zm4-4 9 9M7 3l6 6M3 17s-2 3-2 4a2 2 0 0 0 4 0c0-1-2-4-2-4z"/>',
  eraser: '<path d="m14 3 7 7-11 11H6l-4-4zM8 11l7 7m-5 3h12"/>',
  ruler: '<path d="m3 16 13-13 5 5L8 21zM6 13l2 2m1-5 2 2m1-5 2 2m1-5 2 2"/>',
  orbit:
    '<circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="11" ry="5" transform="rotate(-30 12 12)"/><path d="M8 3c-2 4 0 15 5 18"/>',
  file: '<path d="M14 3H6v18h12V7zM14 3v5h5M8 12h8M8 16h6"/>',
  folder: '<path d="M3 6h7l2 3h9l-2 11H3zM3 9V4h7l2 2h7v3"/>',
  save: '<path d="M4 3h13l4 4v14H3V3zM7 3v6h10V3M7 21v-8h10v8"/>',
  export: '<path d="M12 15V2m-4 4 4-4 4 4M5 10H3v11h18V10h-2"/>',
  undo: '<path d="m8 4-5 5 5 5M3 9h10a7 7 0 0 1 0 14"/>',
  redo: '<path d="m16 4 5 5-5 5m5-5H11a7 7 0 0 0 0 14"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 5V3H3v13h2"/>',
  group:
    '<rect x="2" y="2" width="20" height="20" rx="2" stroke-dasharray="3 3"/><rect x="6" y="7" width="7" height="7"/><rect x="11" y="11" width="7" height="7"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  fit: '<path d="M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6M8 8h8v8H8z"/>',
  grid: '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M9 3v18m6-18v18M3 9h18M3 15h18"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',
  camera: '<path d="M3 7h5l2-3h4l2 3h5v14H3z"/><circle cx="12" cy="13" r="4"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 5 2c-1 1-2 1-2 3m0 3v.1"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  hidden: '<path d="M2 2l20 20M9 5c7-2 13 7 13 7l-3 4M6 6l-4 6s4 7 10 7l4-1M10 10l4 4"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3"/>',
  unlock:
    '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0M12 14v3"/>',
};
export const icon = (name) =>
  `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.box}</svg>`;
export function hydrateIcons(root = document) {
  root
    .querySelectorAll('[data-icon]')
    .forEach((el) => el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)));
}
