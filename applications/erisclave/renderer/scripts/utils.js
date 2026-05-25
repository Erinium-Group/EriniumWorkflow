/* Utilitaires DOM, toast, format */

window.Utils = (function() {
  'use strict';

  function el(tag, props, ...children) {
    const node = document.createElement(tag);
    if (props) {
      Object.entries(props).forEach(([k, v]) => {
        if (k === 'class') node.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else if (k === 'dataset') Object.entries(v).forEach(([dk, dv]) => node.dataset[dk] = dv);
        else if (k.startsWith('on') && typeof v === 'function') {
          node.addEventListener(k.slice(2).toLowerCase(), v);
        } else if (v !== null && v !== undefined && v !== false) {
          if (k === 'html') node.innerHTML = v;
          else node.setAttribute(k, v === true ? '' : v);
        }
      });
    }
    children.flat().forEach(c => {
      if (c === null || c === undefined || c === false) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function svg(d, viewBox) {
    const ns = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(ns, 'svg');
    s.setAttribute('viewBox', viewBox || '0 0 24 24');
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    s.appendChild(p);
    return s;
  }

  // --- Toast ---
  function toast(message, opts) {
    opts = opts || {};
    const host = document.getElementById('toast-host');
    if (!host) return;
    const t = el('div', { class: 'toast ' + (opts.type || '') }, message);
    host.appendChild(t);
    const timeout = opts.timeout || 3200;
    setTimeout(() => {
      t.style.animation = 'slide-out-left .3s var(--ease-out) forwards';
      setTimeout(() => t.remove(), 320);
    }, timeout);
  }

  // --- Debounce ---
  function debounce(fn, ms) {
    let h = null;
    return function(...args) {
      if (h) clearTimeout(h);
      h = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  // --- Format ---
  function relTime(when) {
    if (!when) return '';
    const t = typeof when === 'number' ? when : new Date(when).getTime();
    if (isNaN(t)) return '';
    const d = Date.now() - t;
    if (d < 60000) return 'a l\'instant';
    if (d < 3600000) return Math.floor(d / 60000) + ' min';
    if (d < 86400000) return Math.floor(d / 3600000) + ' h';
    if (d < 7 * 86400000) return Math.floor(d / 86400000) + ' j';
    return new Date(t).toLocaleDateString('fr-FR');
  }

  function pluralize(n, sg, pl) {
    return n + ' ' + (n <= 1 ? sg : (pl || (sg + 's')));
  }

  // --- Confetti ---
  let confettiInstance = null;
  function fireConfetti() {
    if (!window.confetti) return;
    if (!confettiInstance) {
      confettiInstance = window.confetti.create(
        document.getElementById('confetti-canvas'),
        { resize: true, useWorker: true }
      );
    }
    const opts = { particleCount: 80, spread: 70, origin: { y: 0.7 },
      colors: ['#a371a6', '#c79bcb', '#d4a574', '#f2e6f4', '#7d4f86'] };
    confettiInstance(opts);
    setTimeout(() => confettiInstance({ ...opts, particleCount: 60, angle: 60, origin: { x: 0, y: 0.7 } }), 200);
    setTimeout(() => confettiInstance({ ...opts, particleCount: 60, angle: 120, origin: { x: 1, y: 0.7 } }), 400);
  }

  // --- Prompt / Confirm modaux (Electron ne supporte pas window.prompt) ---
  function prompt(opts) {
    opts = opts || {};
    return new Promise(resolve => {
      const overlay = el('div', { class: 'modal-overlay fade-in' });
      const dialog = el('div', { class: 'modal glass-strong card' });

      if (opts.eyebrow) dialog.appendChild(el('div', { class: 'eyebrow' }, opts.eyebrow));
      dialog.appendChild(el('h2', null, opts.title || 'Saisir'));
      if (opts.message) dialog.appendChild(el('p', { class: 'modal-hint' }, opts.message));

      const input = el('input', {
        type: 'text',
        class: 'manage-search',
        placeholder: opts.placeholder || '',
        value: opts.defaultValue || ''
      });
      dialog.appendChild(input);

      let done = false;
      function finish(val) {
        if (done) return; done = true;
        overlay.remove();
        resolve(val);
      }

      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') finish(input.value.trim() || null);
        if (e.key === 'Escape') finish(null);
      });

      const actions = el('div', { class: 'modal-actions row' });
      const okBtn = el('button', { class: 'btn btn-primary', type: 'button',
        onclick: () => finish(input.value.trim() || null)
      }, opts.confirmLabel || 'Valider');
      const cancelBtn = el('button', { class: 'btn btn-ghost', type: 'button',
        onclick: () => finish(null)
      }, 'Annuler');
      actions.appendChild(cancelBtn);
      actions.appendChild(okBtn);
      dialog.appendChild(actions);

      overlay.addEventListener('click', e => { if (e.target === overlay) finish(null); });
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      setTimeout(() => input.focus(), 50);
    });
  }

  function confirm(opts) {
    opts = opts || {};
    return new Promise(resolve => {
      const overlay = el('div', { class: 'modal-overlay fade-in' });
      const dialog = el('div', { class: 'modal glass-strong card' });

      if (opts.eyebrow) dialog.appendChild(el('div', { class: 'eyebrow ' + (opts.danger ? 'danger' : '') }, opts.eyebrow));
      dialog.appendChild(el('h2', null, opts.title || 'Confirmer ?'));
      if (opts.message) dialog.appendChild(el('p', { class: 'modal-hint' }, opts.message));

      let done = false;
      function finish(val) { if (done) return; done = true; overlay.remove(); resolve(val); }

      const actions = el('div', { class: 'modal-actions row' });
      const cancelBtn = el('button', { class: 'btn btn-ghost', type: 'button',
        onclick: () => finish(false)
      }, opts.cancelLabel || 'Annuler');
      const okBtn = el('button', {
        class: 'btn ' + (opts.danger ? 'btn-danger' : 'btn-primary'),
        type: 'button',
        onclick: () => finish(true)
      }, opts.confirmLabel || 'Confirmer');
      actions.appendChild(cancelBtn);
      actions.appendChild(okBtn);
      dialog.appendChild(actions);

      overlay.addEventListener('click', e => { if (e.target === overlay) finish(false); });
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
    });
  }

  return { el, clear, svg, toast, debounce, relTime, pluralize, fireConfetti, prompt, confirm };
})();
