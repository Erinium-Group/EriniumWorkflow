/* Ecran 1 : Loading (init) */

window.Screens = window.Screens || {};

window.Screens.loading = function() {
  const { el } = Utils;
  const wrap = el('div', { class: 'loading fade-in' });
  wrap.appendChild(el('img', { class: 'grimoire grimoire-xl', src: 'assets/grimoire-grand-220px.gif', alt: '', draggable: 'false' }));
  wrap.appendChild(el('div', { class: 'loading-text' }, 'Initialisation d\'Erisclave...'));
  return wrap;
};
