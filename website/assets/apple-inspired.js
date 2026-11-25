/* BattleForge scroll reveals and ambient pointer response — respects reduced motion */
(() => {
 const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 const reveal = document.querySelectorAll('.section-label,.section-title,.manifesto-card,.format-row,.step,.ledger-row,.bounty,.faq-list,.feature-item,.feature-visual,.loop-panel,.social-card,.arena-display');
 if (!reduce && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries, obs) => {
   entries.forEach((entry) => {
    if (entry.isIntersecting) {
     entry.target.classList.add('in');
     obs.unobserve(entry.target);
    }
   });
  }, { threshold: 0.12, rootMargin: '0px 0px -35px 0px' });
  reveal.forEach((el, i) => {
   el.classList.add('reveal');
   el.style.transitionDelay = (Math.min(i % 4, 3) * 70) + 'ms';
   observer.observe(el);
  });
 }
 if (reduce || !window.matchMedia('(hover:hover) and (pointer:fine)').matches) return;
 const panels = document.querySelectorAll('.hero-right,.feature-visual,.arena-display');
 panels.forEach((panel) => {
  panel.addEventListener('pointermove', (event) => {
   const rect = panel.getBoundingClientRect();
   const x = (event.clientX - rect.left) / rect.width - .5;
   const y = (event.clientY - rect.top) / rect.height - .5;
   panel.style.setProperty('--pointer-x', (x * 12).toFixed(2) + 'px');
   panel.style.setProperty('--pointer-y', (y * 12).toFixed(2) + 'px');
  }, { passive: true });
  panel.addEventListener('pointerleave', () => {
   panel.style.setProperty('--pointer-x', '0px');
   panel.style.setProperty('--pointer-y', '0px');
  }, { passive: true });
 });
})();

/* Floating glass accents, scroll depth and gentle pointer parallax */
(() => {
 const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 const targets=[
  ['.hero-right',['orb','ring','spark','orb pink','capsule','orb cyan','ring','spark']],
  ['#identity',['orb','ring','spark','orb pink']],
  ['#formats',['orb cyan','ring','spark','orb']],
  ['#inside',['orb pink','ring','spark','orb']],
  ['#forge-loop',['orb','ring','spark','orb cyan']],
  ['#rewards',['orb pink','ring','spark','orb']],
  ['#how',['orb cyan','ring','spark','orb']],
  ['#wallet',['orb','ring','spark','orb pink']],
  ['#community',['orb pink','ring','spark','orb cyan']],
  ['#faq',['orb','ring','spark','orb pink']]
 ];
 targets.forEach((entry,sectionIndex)=>{
  const host=document.querySelector(entry[0]),types=entry[1];
  if(!host||host.querySelector(':scope > .bf-float-layer'))return;
  if(getComputedStyle(host).position==='static')host.style.position='relative';
  const layer=document.createElement('div');layer.className='bf-float-layer';layer.setAttribute('aria-hidden','true');
  types.forEach((type,i)=>{
   const item=document.createElement('span');item.className='bf-float '+type;
   const size=(type.includes('ring')?72+(i%3)*26:54+(i%4)*23)+'px';
   item.style.setProperty('--size',size);
   item.style.setProperty('--dur',(10+(i*2+sectionIndex)%9)+'s');
   item.style.setProperty('--spin',(28+(i*7)%22)+'s');
   item.style.setProperty('--delay',-((i*1.7+sectionIndex)%12)+'s');
   item.style.setProperty('--alpha',String(.24+(i%4)*.1));
   if(type.includes('capsule'))item.textContent='BATTLEFORGE / PLAYER ONE';
   layer.appendChild(item);
  });
  host.prepend(layer);
 });
 if(reduce)return;
 const hero=document.querySelector('.hero-right');
 if(hero&&matchMedia('(hover:hover) and (pointer:fine)').matches){
  hero.addEventListener('pointermove',e=>{
   const r=hero.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;
   hero.querySelectorAll('.bf-float').forEach((node,i)=>{
    const depth=(i%4+1)*5;node.style.marginLeft=(x*depth)+'px';node.style.marginTop=(y*depth)+'px';
   });
  },{passive:true});
  hero.addEventListener('pointerleave',()=>hero.querySelectorAll('.bf-float').forEach(n=>{n.style.marginLeft='';n.style.marginTop='';}),{passive:true});
 }
})();
