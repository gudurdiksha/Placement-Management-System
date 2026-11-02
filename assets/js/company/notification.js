/* ============================================================
   notifications.js
   Company dashboard — Notifications page.
   Currently surfaces: expired aptitude tests.
   ============================================================ */
(function () {
  'use strict';

  const APT_API = (typeof API_BASE !== 'undefined' ? API_BASE : '') + '/api/aptitude';
  let allNotifications = [];   // [{id, type, title, message, createdAt, unread}]
  let activeTab = 'all';

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    bindTabs();
    bindMarkAll();
    await loadNotifications();
    render();
  }

  function bindTabs() {
    document.querySelectorAll('.notif-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.notif-tab').forEach(t => t.classList.remove('is-active'));
        tab.classList.add('is-active');
        activeTab = tab.dataset.tab;
        render();
      });
    });
  }

  function bindMarkAll() {
    const btn = document.getElementById('markAllReadBtn');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      allNotifications.forEach(n => n.unread = false);
      // Optional: PATCH to backend to persist
      try {
        await fetch(`${APT_API}/notifications/mark-all-read`, {
          method: 'PATCH', credentials: 'include'
        });
      } catch { /* silent */ }
      render();
    });
  }

  async function loadNotifications() {
    allNotifications = [];
    await loadExpiredAptitudeTests();
    // You can push more notification sources here later
    allNotifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async function loadExpiredAptitudeTests() {
    const companyId = await guessCompanyId();
    if (!companyId) return;

    try {
      const res = await fetch(`${APT_API}/expired?companyId=${companyId}`, {
        credentials: 'include'
      });
      if (!res.ok) return;
      const items = await res.json();

      items.forEach(it => {
        allNotifications.push({
          id: `apt-expired-${it.jobId}`,
          type: 'aptitude',
          icon: '⏰',
          iconTone: 'warn',
          title: 'Aptitude test expired',
          message: `"${it.title}" — scheduled on ${it.testDate} at ${String(it.startTime).slice(0,5)} (${it.durationMinutes} min). The test window has passed.`,
          createdAt: buildEndTime(it),
          unread: true
        });
      });
    } catch (err) {
      console.warn('Could not load expired aptitude tests:', err);
    }
  }

  function buildEndTime(it) {
    try {
      const s = new Date(`${it.testDate}T${it.startTime}`);
      return new Date(s.getTime() + (it.durationMinutes || 0) * 60000).toISOString();
    } catch { return new Date().toISOString(); }
  }

  function render() {
    const box = document.getElementById('notificationList');
    if (!box) return;

    const list = activeTab === 'all'
      ? allNotifications
      : allNotifications.filter(n => n.type === activeTab);

    if (!list.length) {
      box.innerHTML = `<p class="notif-empty">You're all caught up — no notifications.</p>`;
      return;
    }

    box.innerHTML = list.map(n => `
      <div class="notif-item ${n.unread ? 'is-unread' : ''}" data-id="${n.id}">
        <div class="notif-icon ${n.iconTone}">${n.icon}</div>
        <div class="notif-body">
          <strong>${escapeHtml(n.title)}</strong>
          <p>${escapeHtml(n.message)}</p>
          <span class="notif-time">${formatWhen(n.createdAt)}</span>
        </div>
      </div>
    `).join('');
  }

  function formatWhen(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} d ago`;
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  }

  async function guessCompanyId() {
    if (window.COMPANY_ID) return window.COMPANY_ID;
    try {
      const res = await fetch(
        (typeof API_BASE !== 'undefined' ? API_BASE : '') + '/api/jobs/my-jobs',
        { credentials: 'include' }
      );
      if (!res.ok) return null;
      const jobs = await res.json();
      const first = Array.isArray(jobs) ? jobs.find(j => j.companyId != null) : null;
      if (first) {
        window.COMPANY_ID = first.companyId;   // cache
        return first.companyId;
      }
    } catch { /* silent */ }
    return null;
  }

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }
})();