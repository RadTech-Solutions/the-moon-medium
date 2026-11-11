/* Shared page behaviour: header state, reveal on scroll, current nav link, hidden tab flag. */
document.documentElement.classList.add('js'); // fallback for pages without the inline head flag
(function () {
  'use strict';
  const header = document.querySelector('.site-header');
  const onScroll = () => header && header.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Mark the nav link for this page.
  const here = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav a').forEach(a => {
    if (a.getAttribute('href') === here) a.setAttribute('aria-current', 'page');
  });

  // Reveal sections as they arrive.
  const items = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    items.forEach(el => io.observe(el));
  } else {
    items.forEach(el => el.classList.add('in'));
  }

  // Pages pause their visuals while the tab is hidden (CSS can use html.tab-hidden).
  const vis = () => document.documentElement.classList.toggle('tab-hidden', document.hidden);
  document.addEventListener('visibilitychange', vis);
  vis();
})();
