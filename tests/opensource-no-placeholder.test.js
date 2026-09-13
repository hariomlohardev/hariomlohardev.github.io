'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const files = ['opensource.html', 'index.html'];
const forbidden = [
  'DEMO_DATA',
  'OSS_FALLBACK',
  'opensource-curated.json',
  'opensource-data.json',
  'github.com/langchain-ai/langchain/pull/12345'
];

for(const file of files){
  const html = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  for(const value of forbidden){
    assert.ok(!html.includes(value), `${file} must not contain or load dummy/static Open Source data: ${value}`);
  }
}

for(const file of ['opensource-curated.json', 'opensource-data.json', 'scripts/curate-opensource.js', 'scripts/generate-opensource.js']){
  assert.ok(!fs.existsSync(path.join(__dirname, '..', file)), `${file} must be removed`);
}
