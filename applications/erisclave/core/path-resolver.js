'use strict';

const fs = require('fs');
const path = require('path');

const MAX_LEVELS = 6;

function resolveDocsRoot(startDir) {
  let dir = startDir;
  for (let i = 0; i < MAX_LEVELS; i++) {
    const roadmap = path.join(dir, 'roadmap.html');
    const specs   = path.join(dir, 'specs');
    if (fs.existsSync(roadmap) && fs.existsSync(specs)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('roadmap.html + specs/ introuvables en remontant depuis ' + startDir);
}

module.exports = { resolveDocsRoot };
