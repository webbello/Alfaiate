/* global document */
// Marks JavaScript as available before first paint, so the theme can start animated elements hidden without ever hiding content from readers without JavaScript.
// An external file (not an inline script) because the content security policy allows no inline scripts.
document.documentElement.classList.add('js');
