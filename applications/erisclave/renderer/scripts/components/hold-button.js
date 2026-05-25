/* Hold-button : bouton circulaire qui declenche apres maintien (ring SVG progress) */

window.HoldButton = (function() {
  'use strict';

  const HOLD_MS = 1600;

  /**
   * @param {Object} opts
   * @param {string} opts.label
   * @param {Function} opts.onTrigger
   * @returns {HTMLElement}
   */
  function create(opts) {
    const size = 180;
    const stroke = 6;
    const r = (size / 2) - stroke;
    const circ = 2 * Math.PI * r;

    const wrap = document.createElement('button');
    wrap.type = 'button';
    wrap.className = 'circle-btn';
    wrap.style.setProperty('--circ', String(circ));

    wrap.innerHTML = `
      <svg class="ring" viewBox="0 0 ${size} ${size}">
        <circle class="track" cx="${size/2}" cy="${size/2}" r="${r}" stroke-width="${stroke}" fill="none"></circle>
        <circle class="fill" cx="${size/2}" cy="${size/2}" r="${r}" stroke-width="${stroke}" fill="none"
                stroke-dasharray="${circ}" stroke-dashoffset="${circ}"></circle>
      </svg>
      <div class="label">${opts.label || 'Maintenir'}</div>
      <div class="hint">Maintenir 1.6s</div>
    `;

    let timer = null;
    let fillTimer = null;
    let triggered = false;
    const fill = wrap.querySelector('.fill');

    function start() {
      if (triggered) return;
      wrap.classList.add('holding');
      // Animation CSS du remplissage
      fill.style.transition = `stroke-dashoffset ${HOLD_MS}ms linear`;
      requestAnimationFrame(() => { fill.style.strokeDashoffset = '0'; });

      timer = setTimeout(() => {
        triggered = true;
        wrap.classList.remove('holding');
        wrap.classList.add('triggered');
        if (typeof opts.onTrigger === 'function') opts.onTrigger();
      }, HOLD_MS);
    }

    function cancel() {
      if (triggered) return;
      wrap.classList.remove('holding');
      if (timer) { clearTimeout(timer); timer = null; }
      // Reset rapide du ring
      fill.style.transition = 'stroke-dashoffset .25s ease-out';
      fill.style.strokeDashoffset = String(circ);
    }

    wrap.addEventListener('mousedown', start);
    wrap.addEventListener('touchstart', e => { e.preventDefault(); start(); }, { passive: false });
    ['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach(ev => {
      wrap.addEventListener(ev, cancel);
    });
    // Empeche le clic court de declencher
    wrap.addEventListener('click', e => e.preventDefault());

    return wrap;
  }

  return { create };
})();
