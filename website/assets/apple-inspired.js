/* BattleForge motion system — viewport-aware, low-workload and accessible */
(() => {
 const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 const fine=window.matchMedia('(hover:hover) and (pointer:fine)').matches;
 const $=(s,root=document)=>root.querySelector(s);
 const $$=(s,root=document)=>Array.from(root.querySelectorAll(s));

 // Reveal once; no scroll polling.
 const reveal=$$('.section-label,.section-title,.manifesto-card,.format-row,.step,.ledger-row,.bounty,.faq-list,.feature-item,.feature-visual,.loop-panel,.social-card,.arena-display');
 if(!reduce && 'IntersectionObserver' in window){
  const io=new IntersectionObserver((entries,obs)=>entries.forEach(entry=>{
   if(entry.isIntersecting){entry.target.classList.add('in');obs.unobserve(entry.target);}
  }),{threshold:.08,rootMargin:'0px 0px -24px 0px'});
  reveal.forEach((el,i)=>{el.classList.add('reveal');el.style.transitionDelay=(i%3*35)+'ms';io.observe(el);});
 }else reveal.forEach(el=>el.classList.add('in'));

 // Only a few decorative objects per section; animations run only near the viewport.
 const targets=[
  ['.hero-right',['orb','ring','spark','capsule','orb pink']],
  ['#identity',['orb','ring','spark']],
  ['#formats',['orb cyan','ring','spark']],
  ['#inside',['orb pink','ring','spark']],
  ['#forge-loop',['orb','ring','spark']],
  ['#rewards',['orb pink','ring','spark']],
  ['#how',['orb cyan','ring','spark']],
  ['#wallet',['orb','ring','spark']],
  ['#community',['orb pink','ring','spark']],
  ['#faq',['orb','ring','spark']]
 ];
 const floatLayers=[];
 targets.forEach(([selector,types],sectionIndex)=>{
  const host=$(selector);if(!host||$('.bf-float-layer',host))return;
  if(getComputedStyle(host).position==='static')host.style.position='relative';
  const layer=document.createElement('div');layer.className='bf-float-layer';layer.setAttribute('aria-hidden','true');
  types.forEach((type,i)=>{
   const node=document.createElement('span');node.className='bf-float '+type;
   node.style.setProperty('--size',(type.includes('ring')?68+(i%2)*24:48+(i%3)*18)+'px');
   node.style.setProperty('--dur',(14+(i*3+sectionIndex)%9)+'s');
   node.style.setProperty('--spin',(38+(i*5)%18)+'s');
   node.style.setProperty('--delay',-((i*1.8+sectionIndex)%10)+'s');
   node.style.setProperty('--alpha',String(.2+(i%3)*.1));
   if(type==='capsule')node.textContent='BATTLEFORGE / PLAYER ONE';
   layer.appendChild(node);
  });
  host.prepend(layer);floatLayers.push(layer);
 });
 if('IntersectionObserver' in window){
  const floatIO=new IntersectionObserver(entries=>entries.forEach(e=>{
   e.target.classList.toggle('is-active',e.isIntersecting);
  }),{rootMargin:'100px'});
  floatLayers.forEach(layer=>floatIO.observe(layer.parentElement));
 }else floatLayers.forEach(layer=>layer.classList.add('is-active'));

 // Character typing on key display headings. Original text remains available to assistive tech.
 if(!reduce){
  const headings=$$('.hero h1,.section-title,.social-head h2,.download-inner h2,.blueprint h2');
  const split=(node,state)=>{
   if(node.nodeType===Node.TEXT_NODE){
    const value=node.nodeValue;if(!value||!value.trim())return;
    const frag=document.createDocumentFragment();
    for(const char of value){
     const span=document.createElement('span');span.className='bf-char';span.textContent=char;
     span.style.setProperty('--char-delay',(state.i*13)+'ms');state.i++;frag.appendChild(span);
    }
    node.parentNode.replaceChild(frag,node);
   }else if(node.nodeType===Node.ELEMENT_NODE && !['SCRIPT','STYLE'].includes(node.tagName)){
    Array.from(node.childNodes).forEach(child=>split(child,state));
   }
  };
  headings.forEach(h=>{
   const state={i:0};h.dataset.bfTypingText=h.textContent.replace(/\s+/g,' ').trim();
   split(h,state);h.classList.add('bf-typing');h.setAttribute('aria-label',h.dataset.bfTypingText);
   if(!('IntersectionObserver'in window)){h.classList.add('bf-typed');return;}
  });
  if('IntersectionObserver'in window){
   const typeIO=new IntersectionObserver((entries,obs)=>entries.forEach(e=>{
    if(e.isIntersecting){e.target.classList.add('bf-typed');obs.unobserve(e.target);}
   }),{threshold:.35});
   headings.forEach(h=>typeIO.observe(h));
  }else headings.forEach(h=>h.classList.add('bf-typed'));
 }

 // Pointer tilt is intentionally limited to the hero on desktop; never runs on touch devices.
 if(!reduce&&fine){
  const hero=$('.hero-right');
  if(hero){
   let frame=0,lastX=0,lastY=0;
   hero.addEventListener('pointermove',e=>{
    const r=hero.getBoundingClientRect();
    lastX=(e.clientX-r.left)/r.width-.5;lastY=(e.clientY-r.top)/r.height-.5;
    if(frame)return;
    frame=requestAnimationFrame(()=>{
     hero.style.setProperty('--hero-tilt-x',(lastX*2.2).toFixed(2)+'deg');
     hero.style.setProperty('--hero-tilt-y',(lastY*-2.2).toFixed(2)+'deg');
     frame=0;
    });
   },{passive:true});
   hero.addEventListener('pointerleave',()=>{
    if(frame)cancelAnimationFrame(frame);frame=0;
    hero.style.setProperty('--hero-tilt-x','0deg');hero.style.setProperty('--hero-tilt-y','0deg');
   },{passive:true});
  }
 }
 // Pause ambient work when the tab is hidden.
 document.addEventListener('visibilitychange',()=>{
  document.documentElement.classList.toggle('bf-page-hidden',document.hidden);
 });
})();
