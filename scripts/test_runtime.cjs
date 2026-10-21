/* Run with node scripts/test_runtime.cjs; no browser or dependencies required. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../assets/deck-template.html'), 'utf8');
const helper = html.split('// STEP_STATE_START')[1].split('// STEP_STATE_END')[0].split('\n').slice(1).join('\n');
const context = vm.createContext({});
vm.runInContext(helper, context);
const transition = (state, action, counts, progressive = true) => JSON.parse(JSON.stringify(context.stepTransition(state, action, counts, progressive)));
const counts = [0, 3, 4, 0, 0, 0, 0, 0, 0, 0];
assert.deepEqual(transition({index:0,step:0}, 'previous', counts), {index:0,step:0});
assert.deepEqual(transition({index:0,step:0}, 'next', counts), {index:1,step:0});
assert.deepEqual(transition({index:1,step:0}, 'next', counts), {index:1,step:1});
assert.deepEqual(transition({index:1,step:1}, 'previous', counts), {index:1,step:0});
assert.deepEqual(transition({index:1,step:3}, 'next', counts), {index:2,step:0});
assert.deepEqual(transition({index:2,step:0}, 'previous', counts), {index:1,step:3});
assert.deepEqual(transition({index:1,step:2}, 'toggle', counts, false), {index:1,step:0});
assert.deepEqual(transition({index:1,step:0}, 'next', counts, false), {index:2,step:0});
assert.deepEqual(transition({index:2,step:0}, 'previous', counts, false), {index:1,step:0});
assert.deepEqual(transition({index:2,step:3}, 'reset', counts), {index:2,step:0});
assert.deepEqual(transition({index:9,step:0}, 'next', counts), {index:9,step:0});
let state = {index:0,step:0};
for (let i=0;i<16;i++) state=transition(state,'next',counts);
assert.deepEqual(state,{index:9,step:0});
for (let i=0;i<16;i++) state=transition(state,'previous',counts);
assert.deepEqual(state,{index:0,step:0});
const content=html.split('<!-- DECK CONTENT START')[1].split('<!-- DECK CONTENT END -->')[0];
const sections=[...content.matchAll(/<section class="slide[\s\S]*?<\/section>/g)].map(m=>m[0]);
assert.equal(sections.length,10);
assert.deepEqual(sections.map(section=>new Set([...section.matchAll(/data-step="(\d+)"/g)].map(m=>m[1])).size),counts);
assert.equal(sections.filter(section=>section.includes('class="speaker-note"')).length,10);
assert.equal(sections.filter(section=>section.includes('class="static-effect"')).length,2);
// The print rule must outrank body.presenting .step-hidden, including !important.
// A bare [data-step] print selector loses and omits unrevealed fragments in PDF.
assert.match(html, /@media print\{body\.presenting #deck \[data-step\],#deck \[data-step\],[^{]+\{opacity:1!important;visibility:visible!important;transform:none!important\}/);
assert.match(html, /cancelAnimationFrame\(simulation.raf\)/);
console.log('PASS: 13 step transitions plus full forward/back traversal; 10-slide/fragment/note/static-fallback contracts.');
