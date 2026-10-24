/* Actual local camera capture, kept separate from the fictional Maya history. */
(() => {
  const storageKey = 'stellis-preview-camera-session';
  const read = () => {try{return JSON.parse(sessionStorage.getItem(storageKey)||'[]');}catch{return [];}};
  const publish = (points) => {
    sessionStorage.setItem(storageKey,JSON.stringify(points));
    window.dash_clientside.set_props('preview-camera-data',{data:points});
  };
  function symbols() {
    if(document.getElementById('prototype-camera-icons'))return;
    const node=document.createElement('div');node.id='prototype-camera-icons';node.hidden=true;
    node.innerHTML='<svg xmlns="http://www.w3.org/2000/svg"><symbol id="i-x" viewBox="0 0 24 24"><path d="M18 6l-12 12M6 6l12 12"/></symbol><symbol id="i-info-circle" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></symbol><symbol id="i-volume" viewBox="0 0 24 24"><path d="M15 8a5 5 0 0 1 0 8M18 5a9 9 0 0 1 0 14M3 9v6h4l5 4V5L7 9z"/></symbol><symbol id="i-volume-off" viewBox="0 0 24 24"><path d="M3 3l18 18M3 9v6h4l5 4V12M9 7l3-2v3M16 9a5 5 0 0 1 0 6"/></symbol></svg>';
    document.body.append(node);
  }
  const syncTheme=()=>document.documentElement.dataset.theme=document.documentElement.dataset.mantineColorScheme||'dark';
  new MutationObserver(syncTheme).observe(document.documentElement,{attributes:true,attributeFilter:['data-mantine-color-scheme']});syncTheme();
  document.addEventListener('click',event=>{
    if(event.target.closest('#preview-clear-camera')) {publish([]);return;}
    if(!event.target.closest('#preview-live-camera'))return;
    symbols();
    const pending=[];
    window.StellisCameraPulse.open(async()=>publish([...read(),...pending]),null,{
      showComparison:false,
      saveReading:async reading=>{const point={...reading,time:new Date().toISOString(),id:crypto.randomUUID()};pending.push(point);return point;}
    });
    for(const link of document.querySelectorAll('.pulse-dialog .accuracy-note'))link.target='_blank';
  });
})();
