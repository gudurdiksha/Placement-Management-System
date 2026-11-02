/* Shows a banner if any scheduled aptitude tests have expired */
(function () {
  'use strict';

  async function checkExpired() {
    const banner = document.getElementById('aptExpiryBanner');
    const list   = document.getElementById('aptExpiryList');
    if (!banner || !list) return;

    const companyId = window.COMPANY_ID;
    if (!companyId) return;

    try {
      const res = await fetch(
        `${API_BASE}/api/aptitude/expired?companyId=${companyId}`,
        { credentials: 'include' }
      );
      if (!res.ok) return;
      const items = await res.json();
      if (!items.length) { banner.hidden = true; return; }

      list.innerHTML = items.map(it =>
        `<div>• <strong>${escapeHtml(it.title)}</strong> — 
          was scheduled on ${it.testDate} at ${String(it.startTime).slice(0,5)}
          (${it.durationMinutes} min). The window has passed.</div>`
      ).join('');
      banner.hidden = false;
    } catch (e) {
      console.warn('Expiry check failed', e);
    }
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  document.addEventListener('DOMContentLoaded', checkExpired);
})();