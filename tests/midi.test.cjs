const {test} = require('node:test');
const assert = require('node:assert/strict');
const midi = require('../src/midi-core.js');
function harness() {
  const events = [];
  const callbacks = Object.fromEntries(['silence','monitor','learn','slider','press','release','reset','tap'].map(name => [name,(...args) => events.push([name,...args])]));
  return {router:new midi.Router(callbacks),events};
}
test('message parsing and filtering', () => {
  assert.deepEqual(midi.parse([0x92,60,100]), {type:'note',channel:3,number:60,value:100});
  assert.equal(midi.parse([0x82,60,100]).value, 0);
  assert.equal(midi.parse([0x92,60,0]).value,0);
  for (const bytes of [[0xf8],[0xf0,1,2],[0xb0,128,2],[0xb0,1,-1],[0xb0,1,1.5]]) assert.equal(midi.parse(bytes),null);
});
test('scaling clamps endpoints and rounds to slider steps', () => {
  assert.equal(midi.scale(0,20,1000,1),20);
  assert.equal(midi.scale(127,20,1000,1),1000);
  assert.equal(midi.scale(64,0.1,12,0.1),6.1);
});
test('learn filters notes for sliders and suppresses performance', () => {
  const {router,events} = harness(); router.learning='volume';
  router.receive([0x90,36,127],{},true); assert.equal(router.learning,'volume');
  router.receive([0xb0,1,77],{},true);
  assert.equal(router.learning,null);
  assert.deepEqual(events.filter(e=>e[0]==='learn'),[['learn','volume',{type:'cc',channel:1,number:1}]]);
  assert.equal(events.filter(e=>e[0]==='slider').length,0);
});
test('hold, repeated messages, release and channel isolation', () => {
  const {router,events} = harness(); const bindings={play:{type:'note',channel:1,number:36}};
  for (const bytes of [[0x91,36,100],[0x90,36,100],[0x90,36,80],[0x80,36,100]]) router.receive(bytes,bindings,false);
  assert.deepEqual(events.filter(e=>['press','release'].includes(e[0])),[['press','note:1:36'],['release','note:1:36']]);
});
test('CC pad actions trigger on rising edges only', () => {
  const {router,events} = harness(); const bindings={tap:{type:'cc',channel:1,number:5}};
  for (const value of [127,50,0,1,0]) router.receive([0xb0,5,value],bindings,false);
  assert.equal(events.filter(e=>e[0]==='tap').length,2);
  router.clear(); assert.equal(router.down.size,0);
});
test('learned pad must release before it can play', () => {
  const {router,events} = harness(); router.learning='play';
  router.receive([0x90,36,127],{},true);
  const bindings={play:{type:'note',channel:1,number:36}};
  router.receive([0x90,36,127],bindings,false);
  assert.equal(events.filter(e=>e[0]==='press').length,0);
  router.receive([0x90,36,0],bindings,false); router.receive([0x90,36,127],bindings,false);
  assert.equal(events.filter(e=>e[0]==='press').length,1);
});
test('settings version, identity, target and duplicate validation', () => {
  assert.deepEqual(midi.validate(midi.empty()),midi.empty());
  assert.throws(()=>midi.validate({version:2,devices:{}}));
  const device={id:'lpd8',name:'LPD8',manufacturer:'Akai',bindings:{volume:{type:'cc',channel:1,number:1}}};
  const settings={version:1,selected:{id:device.id,name:device.name,manufacturer:device.manufacturer},devices:{lpd8:device}};
  assert.deepEqual(midi.validate(JSON.parse(JSON.stringify(settings))),settings);
  device.bindings.delayTime={...device.bindings.volume};
  assert.throws(()=>midi.validate(settings));
});
test('silencing blocks held pads until release but does not block knobs', () => {
  const {router,events} = harness();
  const bindings={play:{type:'cc',channel:1,number:1},volume:{type:'cc',channel:1,number:2}};
  router.receive([0xb0,1,127],bindings,false); router.receive([0xb0,2,100],bindings,false);
  router.clear();
  router.receive([0xb0,1,127],bindings,false); router.receive([0xb0,2,99],bindings,false);
  assert.equal(events.filter(e=>e[0]==='press').length,1);
  assert.deepEqual(events.filter(e=>e[0]==='slider').at(-1),['slider','volume',99]);
  router.receive([0xb0,1,0],bindings,false); router.receive([0xb0,1,127],bindings,false);
  assert.equal(events.filter(e=>e[0]==='press').length,2);
});
test('knob learning accepts zero without treating a zero-velocity note as a press', () => {
  const {router,events} = harness(); router.learning='volume';
  router.receive([0xb0,7,0],{},true);
  assert.equal(events.filter(e=>e[0]==='learn').length,1);
  router.learning='play'; router.receive([0x90,36,0],{},true);
  assert.equal(router.learning,'play');
});
