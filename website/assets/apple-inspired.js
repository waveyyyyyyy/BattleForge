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
  floatLayers.forEach(layer=>floatIO.observe(layer));
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


/* Experience layer: interactions are pointer-aware, viewport-aware and reduced-motion safe. */
(() => {
 const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 const fine=window.matchMedia('(hover:hover) and (pointer:fine)').matches;
 const $=(s,r=document)=>r.querySelector(s);
 const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));

 // Pointer halo + card spotlight only on precise pointer devices.
 if(fine&&!reduce){
  const glow=document.createElement('div'),ring=document.createElement('div');
  glow.className='bf-cursor-glow';ring.className='bf-cursor-ring';
  document.body.append(glow,ring);
  let x=0,y=0,frame=0;
  window.addEventListener('pointermove',e=>{
   x=e.clientX;y=e.clientY;
   if(frame)return;
   frame=requestAnimationFrame(()=>{
    glow.style.left=ring.style.left=x+'px';glow.style.top=ring.style.top=y+'px';
    glow.classList.add('is-visible');ring.classList.add('is-visible');frame=0;
   });
  },{passive:true});
  document.addEventListener('pointerover',e=>{
   const hit=e.target.closest('a,button,[role="tab"],.achievement-card,.social-card');
   ring.classList.toggle('is-hover',!!hit);
  },{passive:true});
  $$('.manifesto-card,.social-card,.achievement-card,.feature-visual,.bounty,.arena-display').forEach(card=>{
   card.classList.add('bf-spotlight');
   card.addEventListener('pointermove',e=>{
    const r=card.getBoundingClientRect();
    card.style.setProperty('--spot-x',(e.clientX-r.left)+'px');
    card.style.setProperty('--spot-y',(e.clientY-r.top)+'px');
   },{passive:true});
  });
 }

 // Magnetic CTA: tiny movement, frame-throttled, desktop only.
 if(fine&&!reduce){
  $$('.hero-cta .button,.quick-download .button,.download-inner .button,.arena-display .button').forEach(button=>{
   let frame=0;
   button.addEventListener('pointermove',e=>{
    const r=button.getBoundingClientRect(),dx=(e.clientX-r.left-r.width/2)/r.width,dy=(e.clientY-r.top-r.height/2)/r.height;
    if(frame)cancelAnimationFrame(frame);
    frame=requestAnimationFrame(()=>{button.style.translate=(dx*5).toFixed(1)+'px '+(dy*4).toFixed(1)+'px';frame=0;});
   },{passive:true});
   button.addEventListener('pointerleave',()=>{if(frame)cancelAnimationFrame(frame);frame=0;button.style.translate='';},{passive:true});
  });
 }

 // Add a restrained spark field to the hero arena; never run when offscreen.
 const hero=$('.hero-right');
 if(hero&&!reduce){
  const count=window.matchMedia('(max-width:700px)').matches?7:13;
  for(let i=0;i<count;i++){
   const spark=document.createElement('i');spark.className='bf-spark';spark.setAttribute('aria-hidden','true');
   spark.style.left=(8+((i*37)%84))+'%';spark.style.top=(8+((i*53)%82))+'%';
   spark.style.setProperty('--spark-duration',(3.5+(i%5)*.7)+'s');
   spark.style.setProperty('--spark-delay',(-i*.43)+'s');
   spark.style.setProperty('--spark-x',((i%2?1:-1)*(8+(i%4)*5))+'px');
   hero.appendChild(spark);
  }
  if('IntersectionObserver'in window){
   const sparkIO=new IntersectionObserver(entries=>entries.forEach(e=>hero.classList.toggle('bf-hero-active',e.isIntersecting)),{rootMargin:'80px'});
   sparkIO.observe(hero);
  }else hero.classList.add('bf-hero-active');
 }

 // Reward vault: explanatory only; no invented payouts or live tournament claims.
 const vaultButton=$('.vault-trigger'),vault=$('#reward-vault');
 if(vaultButton&&vault){
  vaultButton.addEventListener('click',()=>{
   const open=vaultButton.getAttribute('aria-expanded')!=='true';
   vaultButton.setAttribute('aria-expanded',String(open));vault.hidden=!open;
   vaultButton.querySelector('b').textContent=open?'↘':'↗';
  });
 }

 // Community signal cycles editorial prompts, not live tournament status.
 const signal=$('.forge-signal-copy');
 if(signal&&!reduce){
  const messages=['YOUR NEXT MATCH STARTS WITH A SINGLE MOVE.','FIND YOUR FORMAT. BRING YOUR PEOPLE.','PLAY WITH INTENT. MAKE EVERY MOMENT COUNT.','THE FORGE IS BUILT AROUND THE PLAYERS.'];
  let index=0;
  window.setInterval(()=>{if(document.hidden)return;index=(index+1)%messages.length;signal.animate([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(5px)'},{opacity:1,transform:'translateY(0)'}],{duration:520,easing:'ease'});signal.textContent=messages[index];},5200);
 }

 // Tiny logo Easter egg: five deliberate taps/clicks reveal a short Forge salute.
 const logo=$('.hero-right .brand-logo-plate');
 if(logo){
  let taps=0,timer=0;
  const toast=document.createElement('div');toast.className='bf-easter-toast';toast.textContent='FORGED BY PLAYERS. BUILT FOR THE NEXT MATCH.';document.body.appendChild(toast);
  logo.addEventListener('click',()=>{
   taps++;window.clearTimeout(timer);
   if(taps>=5){taps=0;toast.classList.add('is-on');window.setTimeout(()=>toast.classList.remove('is-on'),2400);}
   else timer=window.setTimeout(()=>{taps=0;},1800);
  });
  logo.style.cursor='pointer';logo.setAttribute('tabindex','0');logo.setAttribute('role','button');logo.setAttribute('aria-label','BattleForge logo. Discover a hidden message.');
  logo.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();logo.click();}});
 }
})();
