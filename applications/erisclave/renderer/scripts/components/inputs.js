/* Composants input — rendu de tous les types de champ */

window.Inputs = (function() {
  'use strict';

  const { el, clear } = Utils;

  /**
   * Rend un champ selon sa definition. Renvoie {wrap, getValue}.
   * @param {Object} def {id, label, type, hint, required, options, columns, items}
   * @param {*} value valeur initiale
   * @param {Function} onChange (newValue) => void
   */
  function render(def, value, onChange) {
    const wrap = el('div', { class: 'field-group' + (def.variantOf ? ' is-variant' : '') });
    if (def.label) {
      const lbl = el('label', { class: 'field-label' + (def.required ? ' required' : '') }, def.label);
      if (def.variantOf) {
        lbl.appendChild(el('span', { class: 'variant-chip', title: 'Champ specifique au type "' + def.variantOf + '"' }, def.variantOf));
      }
      wrap.appendChild(lbl);
    }
    if (def.hint) {
      wrap.appendChild(el('div', { class: 'field-hint' }, def.hint));
    }

    const inputs = {
      text: renderText,
      longtext: renderLongtext,
      select: renderSelect,
      list: renderList,
      table: renderTable,
      checklist: renderChecklist,
      image: renderImage,
      tags: renderTags
    };
    const renderer = inputs[def.type] || renderText;
    const ctrl = renderer(def, value, onChange);
    wrap.appendChild(ctrl);

    return wrap;
  }

  function renderText(def, value, onChange) {
    const inp = el('input', { class: 'input', type: 'text', placeholder: def.placeholder || '' });
    inp.value = value || '';
    inp.addEventListener('input', () => onChange(inp.value));
    return inp;
  }

  function renderLongtext(def, value, onChange) {
    const ta = el('textarea', { class: 'textarea', placeholder: def.placeholder || '' });
    ta.value = value || '';
    ta.addEventListener('input', () => onChange(ta.value));
    return ta;
  }

  function renderSelect(def, value, onChange) {
    const sel = el('select', { class: 'select' });
    (def.options || []).forEach(opt => {
      const o = el('option', { value: opt.value }, opt.label);
      if (value === opt.value) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => onChange(sel.value));
    return sel;
  }

  function renderList(def, value, onChange) {
    const items = Array.isArray(value) ? [...value] : [];
    const wrap = el('div', { class: 'list-input' });

    function rerender() {
      clear(wrap);
      items.forEach((it, idx) => {
        const row = el('div', { class: 'list-row' });
        const inp = el('input', { class: 'input', type: 'text', placeholder: def.itemPlaceholder || '' });
        inp.value = it;
        inp.addEventListener('input', () => { items[idx] = inp.value; onChange([...items]); });
        const del = el('button', { class: 'btn btn-ghost btn-icon', type: 'button', title: 'Supprimer' });
        del.innerHTML = '<svg viewBox="0 0 24 24"><path d="M19 13H5v-2h14v2z"/></svg>';
        del.addEventListener('click', () => { items.splice(idx, 1); onChange([...items]); rerender(); });
        row.appendChild(inp);
        row.appendChild(del);
        wrap.appendChild(row);
      });
      const addBtn = el('button', { class: 'btn btn-ghost btn-add', type: 'button' });
      addBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg> Ajouter';
      addBtn.addEventListener('click', () => { items.push(''); onChange([...items]); rerender(); });
      wrap.appendChild(addBtn);
    }
    rerender();
    return wrap;
  }

  function renderTable(def, value, onChange) {
    const cols = def.columns || [];
    const rows = Array.isArray(value) ? value.map(r => ({ ...r })) : [];
    const wrap = el('div', { class: 'dynamic-table' });

    function rerender() {
      clear(wrap);
      const table = el('table');
      const thead = el('thead');
      const trh = el('tr');
      cols.forEach(c => trh.appendChild(el('th', null, c.label)));
      trh.appendChild(el('th', { style: { width: '40px' } }, ''));
      thead.appendChild(trh);
      table.appendChild(thead);

      const tbody = el('tbody');
      rows.forEach((row, idx) => {
        const tr = el('tr');
        cols.forEach(c => {
          const td = el('td');
          const inp = el('input', { class: 'input', type: 'text', placeholder: c.placeholder || '' });
          inp.value = row[c.id] || '';
          inp.addEventListener('input', () => { rows[idx][c.id] = inp.value; onChange(rows.map(r => ({ ...r }))); });
          td.appendChild(inp);
          tr.appendChild(td);
        });
        const tdDel = el('td');
        const del = el('button', { class: 'btn btn-ghost btn-icon', type: 'button', title: 'Supprimer' });
        del.innerHTML = '<svg viewBox="0 0 24 24"><path d="M19 13H5v-2h14v2z"/></svg>';
        del.addEventListener('click', () => { rows.splice(idx, 1); onChange(rows.map(r => ({ ...r }))); rerender(); });
        tdDel.appendChild(del);
        tr.appendChild(tdDel);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      wrap.appendChild(table);

      const addBtn = el('button', { class: 'btn btn-ghost btn-add', type: 'button' });
      addBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg> Ajouter une ligne';
      addBtn.addEventListener('click', () => {
        const empty = {};
        cols.forEach(c => empty[c.id] = '');
        rows.push(empty);
        onChange(rows.map(r => ({ ...r })));
        rerender();
      });
      wrap.appendChild(addBtn);
    }
    rerender();
    return wrap;
  }

  function renderChecklist(def, value, onChange) {
    // Mode "options fixes" : multi-select de strings ou de {value,label}
    if (Array.isArray(def.options) && def.options.length) {
      const opts = def.options.map(o => (typeof o === 'string' ? { value: o, label: o } : o));
      const selected = new Set(Array.isArray(value) ? value : []);
      const wrap = el('div', { class: 'checklist-input fixed' });
      opts.forEach(opt => {
        const row = el('label', { class: 'checklist-row check-wrap' });
        const inp = el('input', { type: 'checkbox' });
        if (selected.has(opt.value)) inp.checked = true;
        inp.addEventListener('change', () => {
          if (inp.checked) selected.add(opt.value);
          else selected.delete(opt.value);
          onChange(Array.from(selected));
        });
        row.appendChild(inp);
        row.appendChild(el('span', { class: 'check-box' }));
        row.appendChild(el('span', { class: 'check-label' }, opt.label));
        wrap.appendChild(row);
      });
      return wrap;
    }

    // Mode "liste libre" : items {text, checked} editables
    const items = Array.isArray(value) ? [...value] : [];
    const wrap = el('div', { class: 'checklist-input' });

    function rerender() {
      clear(wrap);
      items.forEach((it, idx) => {
        const row = el('div', { class: 'checklist-row' });
        const chk = el('label', { class: 'check-wrap' });
        const inp = el('input', { type: 'checkbox' });
        if (it.checked) inp.checked = true;
        inp.addEventListener('change', () => { items[idx].checked = inp.checked; onChange([...items]); });
        chk.appendChild(inp);
        chk.appendChild(el('span', { class: 'check-box' }));
        row.appendChild(chk);

        const text = el('input', { class: 'input', type: 'text', placeholder: 'Item...' });
        text.value = it.text || '';
        text.addEventListener('input', () => { items[idx].text = text.value; onChange([...items]); });
        row.appendChild(text);

        const del = el('button', { class: 'btn btn-ghost btn-icon', type: 'button', title: 'Supprimer' });
        del.innerHTML = '<svg viewBox="0 0 24 24"><path d="M19 13H5v-2h14v2z"/></svg>';
        del.addEventListener('click', () => { items.splice(idx, 1); onChange([...items]); rerender(); });
        row.appendChild(del);

        wrap.appendChild(row);
      });
      const addBtn = el('button', { class: 'btn btn-ghost btn-add', type: 'button' });
      addBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg> Ajouter';
      addBtn.addEventListener('click', () => { items.push({ text: '', checked: false }); onChange([...items]); rerender(); });
      wrap.appendChild(addBtn);
    }
    rerender();
    return wrap;
  }

  function renderImage(def, value, onChange) {
    const wrap = el('div', { class: 'image-input' });
    const list = el('div', { class: 'image-list' });
    const images = Array.isArray(value) ? [...value] : [];

    function rerender() {
      clear(list);
      images.forEach((img, idx) => {
        const row = el('div', { class: 'image-row' });
        const thumb = el('div', { class: 'image-thumb', style: { backgroundImage: `url('file://${img.path.replace(/\\/g, '/')}')` } });
        row.appendChild(thumb);
        const meta = el('div', { class: 'image-meta' });
        meta.appendChild(el('div', { class: 'image-name' }, img.name || img.path.split(/[\\/]/).pop()));
        if (img.caption !== undefined) {
          const cap = el('input', { class: 'input', type: 'text', placeholder: 'Legende...' });
          cap.value = img.caption || '';
          cap.addEventListener('input', () => { images[idx].caption = cap.value; onChange([...images]); });
          meta.appendChild(cap);
        }
        row.appendChild(meta);
        const del = el('button', { class: 'btn btn-ghost btn-icon', type: 'button' });
        del.innerHTML = '<svg viewBox="0 0 24 24"><path d="M19 13H5v-2h14v2z"/></svg>';
        del.addEventListener('click', () => { images.splice(idx, 1); onChange([...images]); rerender(); });
        row.appendChild(del);
        list.appendChild(row);
      });
    }

    const addBtn = el('button', { class: 'btn btn-secondary btn-add-image', type: 'button' });
    addBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg> Ajouter une image';
    addBtn.addEventListener('click', async () => {
      const res = await window.erisclave.assets.upload({ contextHint: def.id });
      if (res.ok && res.files && res.files.length) {
        res.files.forEach(f => images.push({ path: f.absolutePath, name: f.name, caption: '' }));
        onChange([...images]);
        rerender();
      }
    });

    rerender();
    wrap.appendChild(list);
    wrap.appendChild(addBtn);
    return wrap;
  }

  function renderTags(def, value, onChange) {
    const selected = new Set(value || []);
    const wrap = el('div', { class: 'tag-input' });
    (def.options || []).forEach(opt => {
      const chip = el('button', { class: 'tag-chip', type: 'button' }, opt.label);
      if (selected.has(opt.value)) chip.classList.add('active');
      chip.addEventListener('click', () => {
        if (selected.has(opt.value)) selected.delete(opt.value);
        else selected.add(opt.value);
        chip.classList.toggle('active');
        onChange(Array.from(selected));
      });
      wrap.appendChild(chip);
    });
    return wrap;
  }

  return { render };
})();
