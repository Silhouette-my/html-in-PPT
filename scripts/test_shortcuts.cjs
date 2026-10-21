const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(path.join(__dirname, '../assets/deck-template.html'), 'utf8');
const source = html.split('// START_SHORTCUT_START')[1].split('// START_SHORTCUT_END')[0].split('\n').slice(1).join('\n');
const context = {}; vm.createContext(context); vm.runInContext(source, context);
const key = (key, extra={}) => ({key, ...extra});
for (const mac of [true,false]) {
 assert.equal(context.startShortcut(key('F5'),mac),'first');
 assert.equal(context.startShortcut(key('F5',{shiftKey:true}),mac),'current');
 for (const modifier of ['ctrlKey','altKey','isComposing']) assert.equal(context.startShortcut(key('F5',{[modifier]:true}),mac),null);
}
assert.equal(context.startShortcut(key('Enter',{metaKey:true}),true),'current');
assert.equal(context.startShortcut(key('Enter',{metaKey:true,shiftKey:true}),true),'first');
assert.equal(context.startShortcut(key('Enter',{metaKey:true}),false),null);
assert.equal(context.startShortcut(key('r',{metaKey:true}),true),null);
assert.equal(context.startShortcut(key('Enter'),true),null);
console.log('PASS: Windows/Mac launch keys and modifier exclusions');
