/* This component shares the app's session and APIs; it owns no workspace store. */
(() => {
 let pending=null, published='', theme='', day='', received=false;
 const send=(action,detail={})=>parent.postMessage({stellisMeasurements:true,action,...detail},location.origin);
 window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==parent||!event.data?.stellisMeasurements)return;
  pending=event.data;received=true;
 });
 window.dash_clientside=Object.assign({},window.dash_clientside,{
  stellisMeasurements:{bridge(){
   if(pending&&window.dash_clientside.set_props){
    const key=JSON.stringify(pending.measures);
    if(key!==published){window.dash_clientside.set_props('measure-data',{data:pending.measures||[]});published=key;}
    if(day!==pending.today){day=pending.today;window.dash_clientside.set_props('measure-today',{data:day});}
    if(theme!==pending.theme){theme=pending.theme;window.dash_clientside.set_props('measure-theme',{forceColorScheme:theme});document.documentElement.dataset.theme=theme;}
    const note=document.getElementById('measure-demo-note');if(note)note.hidden=!pending.demo;
    if(pending.category!=null){window.dash_clientside.set_props('measure-category-select',{value:String(pending.category)});pending.category=null;}
   }
   send('ready');return received?'Connected':'';
  }}
 });
 document.addEventListener('click',event=>{
  const source=event.target.closest('[data-measure-source]');
  if(source){event.preventDefault();send('navigate',{path:source.getAttribute('href')});return;}
  const control=event.target.closest('[data-measure-action]');
  if(control)send(control.dataset.measureAction,{measure:control.dataset.measure,id:control.dataset.readingId});
 });
 let previous=0;
 setInterval(()=>{const height=Math.ceil(document.querySelector('.measurements-body')?.getBoundingClientRect().height||480);if(Math.abs(height-previous)>2){previous=height;send('resize',{height});}},300);
})();
