const test = require('node:test');
const assert = require('node:assert/strict');
const {upcoming, selected} = require('../src/stellis/static/health-dashboard.js');
test('upcoming preserves scheduling provenance and excludes ended or past events', () => {
 const events = upcoming([
  {title:'Ended',start:'2026-10-23T08:00:00Z',end:'2026-10-23T09:00:00Z',provider:'google'},
  {title:'Booked',start:'2026-10-24T10:00:00Z',end:'2026-10-24T11:00:00Z',provider:'google',notebook_id:'nutrition'},
 ],[
  {kind:'document',title:'Future letter',date:'2026-10-25',target:'/document/a'},
  {kind:'fact',title:'Future condition',date:'2026-10-25',target:'/document/b'},
  {kind:'document',title:'Past letter',date:'2026-10-20'},
 ],[{source:{kind:'page',id:'p',title:'Care plan'},items:[{text:'Follow-up',due_date:'2026-10-26',due_time:'09:00'}]}],new Date('2026-10-23T12:00:00Z'));
 assert.deepEqual(events.map(e=>e.status),['Scheduled','Dated record','Planned']);
 assert.equal(events[0].target,'/notebook/nutrition');
 assert.equal(events[1].target,'/document/a');
 assert.equal(events[2].target,'/page/p');
});
test('selections retain explicit order and omit unavailable notebooks',()=>{
 assert.deepEqual(selected([{id:'b'},{id:'a'}],['a','deleted','b']),[{id:'a'},{id:'b'}]);
 assert.deepEqual(selected([{id:'a'}],[]),[]);
});
test('entered appointments preserve planned status and exclude elapsed starts',()=>{
 const events=upcoming([], [
  {kind:'event',title:'My plan',starts_at:'2026-10-24T10:00:00Z',status:'planned',target:'/?event=one'},
  {kind:'event',title:'My appointment',starts_at:'2026-10-25T10:00:00Z',status:'scheduled',target:'/?event=two'},
  {kind:'event',title:'Past appointment',starts_at:'2026-10-22T10:00:00Z',status:'scheduled',target:'/?event=three'},
 ],[],new Date('2026-10-23T12:00:00Z'));
 assert.deepEqual(events.map(e=>[e.title,e.status,e.target]),[['My plan','Planned','/?event=one'],['My appointment','Scheduled','/?event=two']]);
});
