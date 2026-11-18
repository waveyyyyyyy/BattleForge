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
