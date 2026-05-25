'use strict';

const FEATURE_TYPES = require('./feature-types.json');
const BASE          = require('./base-questions.json');
const VARIANTS      = {
  bloc:    require('./variants/bloc.json'),
  item:    require('./variants/item.json'),
  gui:     require('./variants/gui.json'),
  system:  require('./variants/system.json'),
  command: require('./variants/command.json'),
  world:   require('./variants/world.json'),
  mob:     require('./variants/mob.json'),
  eriapi:  require('./variants/eriapi.json'),
  pvp:     require('./variants/pvp.json'),
  economie:require('./variants/economie.json')
};

function listFeatureTypes() {
  return FEATURE_TYPES;
}

function getQuestionnaire(featureType) {
  const variant = VARIANTS[featureType] || {};
  const typeMeta = (FEATURE_TYPES || []).find(t => t.id === featureType);
  const typeLabel = typeMeta ? typeMeta.label : featureType;
  const sections = BASE.sections.map(section => {
    const overlay = (variant.sections || {})[section.id] || {};
    const fields = section.fields.map(f => {
      const o = (overlay.fields || {})[f.id] || {};
      const merged = Object.assign({}, f, o);
      // Marque le champ si l'overlay l'a modifié
      if (Object.keys(o).length > 0) merged.variantOf = typeLabel;
      return merged;
    });
    const bonusFields = (overlay.bonusFields || []).map(f => Object.assign({}, f, { variantOf: typeLabel, isBonus: true }));
    return Object.assign({}, section, {
      hint: overlay.hint || section.hint,
      variantHint: overlay.hint && overlay.hint !== section.hint ? typeLabel : null,
      fields: fields.concat(bonusFields)
    });
  });
  return { featureType, featureTypeLabel: typeLabel, sections };
}

module.exports = { listFeatureTypes, getQuestionnaire };
