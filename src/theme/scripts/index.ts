/** Entry point for the theme's client-side behavior. */
import {
  initAccordions,
  initCategoryDropdown,
  initAnchors,
  initForms,
  initPagination,
  initSliders,
  initTabs,
  initTeamSocial,
} from './components';
import { initCart } from './cart';
import { initHeader } from './header';
import { initLightbox } from './lightbox';
import { initBackgroundVideo, initVideoControls } from './video';

function init(): void {
  initHeader();
  initCart();
  initTabs();
  initAccordions();
  initPagination();
  initCategoryDropdown();
  initSliders();
  initForms();
  initAnchors();
  initLightbox();
  initTeamSocial();
  initBackgroundVideo();
  initVideoControls();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
