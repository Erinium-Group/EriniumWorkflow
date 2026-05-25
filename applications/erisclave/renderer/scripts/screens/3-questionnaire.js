/* Ecran 3 : Questionnaire (par feature) */

window.Screens = window.Screens || {};

window.Screens.questionnaire = function() {
  const { el } = Utils;
  const state = Store.get();
  const feature = Store.activeFeature();
  if (!feature) {
    const empty = el('div', { class: 'screen' });
    empty.innerHTML = '<p style="padding:40px">Aucune feature active.</p>';
    return empty;
  }

  const screen = el('div', { class: 'screen fade-up' });
  const inner = el('div', { class: 'screen-inner' });

  // Header — montre quelle feature
  const header = el('div', { class: 'screen-header' },
    el('div', { class: 'left' },
      el('div', { class: 'eyebrow' }, 'Edition de feature'),
      el('h1', null, feature.titleProvisoire || '(feature sans titre)'),
      el('p', null, 'Repondez aux questions ci-dessous. L\'app sauvegarde toutes les 700ms. Les sections vides seront automatiquement omises du cahier des charges.')
    ),
    el('div', { class: 'right' },
      el('button', { class: 'btn btn-ghost', type: 'button',
        onclick: () => navigate('project')
      }, '← Retour au projet')
    )
  );
  inner.appendChild(header);

  // Selecteur de type
  const typeGroup = el('div', { class: 'glass card', style: { padding: '20px 24px', marginBottom: '24px' } });
  typeGroup.appendChild(Inputs.render(
    { id: 'featureType', label: 'Type de feature', type: 'select',
      hint: 'Determine les questions supplementaires posees dans certaines sections.',
      options: (state.featureTypes || []).map(t => ({ value: t.id, label: t.label })) },
    feature.featureType,
    v => {
      feature.featureType = v;
      Autosave.trigger();
      // Re-render pour appliquer les nouvelles questions
      const fresh = window.Screens.questionnaire();
      const root = document.getElementById('root');
      Utils.clear(root); root.appendChild(fresh);
    }
  ));
  inner.appendChild(typeGroup);

  // Loader async du questionnaire
  const layout = el('div', { class: 'questionnaire' });
  const sidebar = el('aside', { class: 'q-sidebar' });
  sidebar.appendChild(el('h3', null, 'Sections'));
  const sectionList = el('div', { class: 'q-sections' });
  sidebar.appendChild(sectionList);
  layout.appendChild(sidebar);

  const main = el('div', { class: 'q-main' });
  main.appendChild(el('div', { class: 'spinner-dots' }, el('span'), el('span'), el('span')));
  layout.appendChild(main);
  inner.appendChild(layout);

  // Footer — un seul bouton qui valide et ramene au projet
  const footer = el('div', { class: 'screen-footer' },
    el('div', { class: 'left' },
      el('button', { class: 'btn btn-ghost', type: 'button',
        onclick: () => navigate('project')
      }, '← Retour au projet')
    ),
    el('div', { class: 'right' },
      el('button', { class: 'btn btn-primary', type: 'button',
        onclick: () => {
          Autosave.flush ? Autosave.flush() : Autosave.trigger();
          Utils.toast('Feature enregistree', { type: 'success' });
          navigate('project');
        }
      }, 'Valider →')
    )
  );
  inner.appendChild(footer);

  screen.appendChild(inner);

  // Charge le questionnaire en async
  loadQuestionnaire(feature, main, sectionList);

  return screen;
};

async function loadQuestionnaire(feature, mainHost, sidebarHost) {
  const { el, clear } = Utils;
  const state = Store.get();
  let questions = state.questionnaires[feature.featureType];
  if (!questions) {
    try {
      questions = await window.erisclave.questions.load(feature.featureType);
      state.questionnaires[feature.featureType] = questions;
    } catch (e) {
      mainHost.innerHTML = '<p style="color:var(--red-ko)">Echec du chargement du questionnaire.</p>';
      return;
    }
  }

  clear(mainHost);
  clear(sidebarHost);

  // Render sections
  questions.sections.forEach((section, sIdx) => {
    // Sidebar link
    const link = el('a', { class: 'q-section-link', href: '#section-' + section.id,
      onclick: (e) => {
        e.preventDefault();
        document.getElementById('section-' + section.id).scrollIntoView({ behavior: 'smooth', block: 'start' });
        sidebarHost.querySelectorAll('.q-section-link').forEach(a => a.classList.remove('active'));
        link.classList.add('active');
      }
    });
    link.appendChild(el('div', { class: 'num' }, String(sIdx + 1)));
    link.appendChild(el('div', null, section.title));
    sidebarHost.appendChild(link);
    if (sIdx === 0) link.classList.add('active');

    // Section content
    const sec = el('section', { class: 'q-section', id: 'section-' + section.id });
    sec.appendChild(el('h2', null, section.title));
    if (section.description) sec.appendChild(el('div', { class: 'section-desc' }, section.description));
    const fields = el('div', { class: 'q-fields' });
    sec.appendChild(fields);

    section.fields.forEach(field => {
      if (!feature.answers) feature.answers = {};
      const current = feature.answers[field.id];
      const ctrl = Inputs.render(field, current, v => {
        feature.answers[field.id] = v;
        Autosave.trigger();
      });
      fields.appendChild(ctrl);
    });

    mainHost.appendChild(sec);
  });
}
