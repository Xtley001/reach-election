// Dark mode: prevent FOUC. Loaded as an external script (not inline) so the
// CSP script-src directive does not need 'unsafe-inline' (audit 6.2).
(function () {
  var saved = localStorage.getItem('reach-theme');
  document.documentElement.setAttribute('data-theme', saved || 'light');
})();
