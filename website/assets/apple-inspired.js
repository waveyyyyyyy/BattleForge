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
