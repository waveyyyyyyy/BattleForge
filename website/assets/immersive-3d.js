/* Lightweight 3D interaction layer. No dependencies; disabled for reduced motion/touch-only devices. */
(() => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;

  const revealTargets = document.querySelectorAll('.quick-download-inner,.feature-visual,.feature-item,.arena-display,.social-card,.download-inner,.support-inner');
  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('bf-depth-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.14, rootMargin: '0px 0px -35px 0px' });
    revealTargets.forEach(element => {
      element.classList.add('bf-depth-reveal');
      revealObserver.observe(element);
    });
  }

  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const targets = document.querySelectorAll('.brand-logo-plate,.manifesto-card,.feature-visual,.bounty,.social-card,.arena-glyph');
  targets.forEach(element => {
    let frame = 0;
    const reset = () => {
      if (frame) cancelAnimationFrame(frame);
      element.style.removeProperty('--bf-pointer-x');
      element.style.removeProperty('--bf-pointer-y');
      element.classList.remove('bf-tilt-active');
    };
    element.addEventListener('pointermove', event => {
      const rect = element.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        element.classList.add('bf-tilt-active');
        element.style.setProperty('--bf-pointer-x', (x * 5.5).toFixed(2) + 'deg');
        element.style.setProperty('--bf-pointer-y', (y * -5.5).toFixed(2) + 'deg');
      });
    }, { passive: true });
    element.addEventListener('pointerleave', reset, { passive: true });
  });
})();


/* Lightweight cosmic ambience: minimal DOM, no scroll handlers, no continuous planet layout work. */
(() => {
  if (document.querySelector('.bf-cosmos')) return;
  const cosmos=document.createElement('div');
  cosmos.className='bf-cosmos';
  cosmos.setAttribute('aria-hidden','true');
  let seed=37;
  const rand=()=>{seed=(seed*9301+49297)%233280;return seed/233280};
  const mobile=window.matchMedia('(max-width: 700px)').matches;
  const count=mobile?18:34;
  for(let i=0;i<count;i++){
    const star=document.createElement('i');
    star.className='bf-star';
    star.style.left=(rand()*100).toFixed(1)+'%';
    star.style.top=(rand()*100).toFixed(1)+'%';
    const size=rand()*1.5+.6;
    star.style.width=size+'px';
    star.style.height=size+'px';
    cosmos.appendChild(star);
  }
  document.body.prepend(cosmos);

  const placements=[
    ['.hero-right','hero'],
    ['#identity','identity'],
    ['#formats','formats'],
    ['#inside','inside'],
    ['#community','community'],
    ['#forge-loop','loop'],
    ['#wallet','wallet'],
    ['.download-band','download']
  ];
  placements.forEach(([selector,kind])=>{
    const host=document.querySelector(selector);
    if(!host)return;
    const planet=document.createElement('div');
    planet.className='bf-planet bf-planet--'+kind;
    planet.setAttribute('aria-hidden','true');
    host.prepend(planet);
  });
})();
