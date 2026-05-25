'use strict';

const fs = require('fs');
const path = require('path');

function checkSlug(specsDir, candidate) {
  if (!candidate) return { conflict: false, suggestion: candidate };
  const htmlPath = path.join(specsDir, candidate + '.html');
  if (!fs.existsSync(htmlPath)) {
    return { conflict: false, suggestion: candidate };
  }
  let i = 2;
  while (i < 100) {
    const candidateN = candidate + '-v' + i;
    const p = path.join(specsDir, candidateN + '.html');
    if (!fs.existsSync(p)) return { conflict: true, suggestion: candidateN, existing: htmlPath };
    i++;
  }
  return { conflict: true, suggestion: candidate + '-v' + Date.now(), existing: htmlPath };
}

module.exports = { checkSlug };
