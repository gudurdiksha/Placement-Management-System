/* ============================================================
   test-schedule.js — Student Test Schedule page
   ============================================================ */
(function () {
  'use strict';

  console.log('[test-schedule.js] file loaded, readyState =', document.readyState);

  const APPS_API = 'http://127.0.0.1:8080/api/applications';
  const APT_API  = 'http://127.0.0.1:8080/api/aptitude';

  console.log('[test-schedule.js] APPS_API =', APPS_API);
  console.log('[test-schedule.js] APT_API  =', APT_API);

  let allTests = [];
  let activeFilter = 'all';
  let detailsModalInstance = null;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  async function init() {
  console.log('[test-schedule.js] init started');
  bindTabs();
  bindCardActions();
  watchForListSwaps();   

  try { await loadTests(); } catch (e) { console.error(e); }
  render();

  // Re-render every 20s so UPCOMING → LIVE happens automatically.
  // Only re-renders if a status actually changed (avoids flicker).
  setInterval(() => {
    const before = allTests.map(t => t.__lastStatus || '').join('|');
    allTests.forEach(t => { t.__lastStatus = statusOf(t); });
    const after = allTests.map(t => t.__lastStatus).join('|');
    if (before !== after) {
      console.log('[test-schedule.js] status change detected, re-rendering');
      render();
    }
  }, 20_000);
}
function statusOf(t) {
  const now = Date.now();
  if (now < t.start.getTime()) return 'UPCOMING';
  if (now <= t.end.getTime())   return 'LIVE';
  return 'EXPIRED';
}

/* Remove `status: computeStatus(...)` from normalizeSchedule's return object.
   Keep `start` and `end` — they're what statusOf needs. */

function sortByDateAsc(a, b) {
  const order = { LIVE: 0, UPCOMING: 1, EXPIRED: 2 };
  const sa = statusOf(a), sb = statusOf(b);
  if (order[sa] !== order[sb]) return order[sa] - order[sb];
  if (sa === 'EXPIRED') return b.start - a.start;
  return a.start - b.start;
}

function render() {
  const listEl = document.getElementById('tsList');
  if (!listEl) return;
  listEl.dataset.rendered = '1';
  updateStats();

  const visible = activeFilter === 'all'
    ? allTests
    : allTests.filter(t => statusOf(t) === activeFilter);

  if (!visible.length) {
    listEl.innerHTML = `
      <div class="ts-empty">
        <i class="bi bi-calendar-x"></i>
        <p>No test schedules${activeFilter !== 'all' ? ' for this filter' : ' yet'}.</p>
        <a href="applications.html" class="ts-btn primary">
          <i class="bi bi-briefcase"></i> View My Applications
        </a>
      </div>`;
    return;
  }
  listEl.innerHTML = visible.map(cardTemplate).join('');
}
  function bindTabs() {
    const tabs = document.querySelectorAll('#tsTabs .app-tab');
    if (!tabs.length) return;
    tabs.forEach(tab => {
      // prevent duplicate binding
      if (tab.dataset.bound === '1') return;
      tab.dataset.bound = '1';
      tab.addEventListener('click', () => {
        document.querySelectorAll('#tsTabs .app-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        activeFilter = tab.dataset.filter;
        render();
      });
    });
  }

  async function loadTests() {
    const listEl = document.getElementById('tsList');
    if (listEl) listEl.innerHTML = `<p class="ts-loading">Loading your test schedule…</p>`;

    let appliedJobIds = [];
    try {
      appliedJobIds = await fetchAppliedJobIds();
      console.log('[test-schedule.js] applied jobIds =', appliedJobIds);
    } catch (err) {
      console.error('[test-schedule.js] fetchAppliedJobIds error:', err);
    }

    if (!appliedJobIds.length) {
      console.warn('[test-schedule.js] no applied jobs — nothing to show');
      allTests = [];
      return;
    }

    try {
      allTests = await fetchSchedulesForJobs(appliedJobIds);
      console.log('[test-schedule.js] raw schedules =', allTests);
      allTests = allTests.map(normalizeSchedule).sort(sortByDateAsc);
      console.log('[test-schedule.js] normalized =', allTests);
    } catch (err) {
      console.error('[test-schedule.js] fetchSchedulesForJobs error:', err);
      allTests = [];
    }
  }

  async function fetchAppliedJobIds() {
    const url = `${APPS_API}/me`;
    console.log('[test-schedule.js] GET', url);
    const res = await fetch(url, { credentials: 'include' });
    console.log('[test-schedule.js] applications status =', res.status);
    if (!res.ok) return [];
    const raw = await res.json();
    console.log('[test-schedule.js] applications raw =', raw);

    const list = Array.isArray(raw) ? raw : (raw.data || raw.applications || []);
    return Array.from(new Set(
      list.map(a => a.jobId ?? a.jobPostingId ?? a.job?.id ?? a.job?._id)
        .filter(id => id != null)
        .map(String)
    ));
  }

  async function fetchSchedulesForJobs(jobIds) {
    const qs = encodeURIComponent(jobIds.join(','));
    const url = `${APT_API}/student-schedules?jobIds=${qs}`;
    console.log('[test-schedule.js] GET', url);
    const res = await fetch(url, { credentials: 'include' });
    console.log('[test-schedule.js] student-schedules status =', res.status);
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.error('[test-schedule.js] student-schedules failed:', res.status, txt);
      return [];
    }
    const data = await res.json();
    console.log('[test-schedule.js] student-schedules raw =', data);
    return Array.isArray(data) ? data : (data.schedules || []);
  }

  function normalizeSchedule(s) {
    const testDate  = s.testDate || s.test_date;
    const startTime = s.startTime || s.start_time || '00:00:00';
    const duration  = Number(s.durationMinutes ?? s.duration_minutes ?? 60);

    const start = new Date(`${testDate}T${padTime(startTime)}`);
    const end   = new Date(start.getTime() + duration * 60 * 1000);

    return {
      jobId:         String(s.jobId ?? s.job_id ?? ''),
      testId:        String(s.testId ?? s.test_id ?? s.id ?? s.scheduleId ?? s._id ?? ''),
      title:         s.title || s.jobTitle || s.job_title || 'Aptitude Test',
      company:       s.companyName || s.company_name || '',
      department:    s.department || '',
      testDate,
      startTime:     padTime(startTime).slice(0, 5),
      durationMinutes: duration,
      start,
      end,
      mode:          (s.mode || 'ONLINE').toUpperCase(),
      locationOrLink: s.locationOrLink || s.location_or_link || '',
      totalQuestions: s.totalQuestions ?? s.total_questions ?? null,
      totalMarks:     s.totalMarks ?? s.total_marks ?? null,
      passingMarks:   s.passingMarks ?? s.passing_marks ?? null,
      instructions:   s.instructions || '',
      linkToken:      s.linkToken || s.link_token || s.token || null,
      status:         computeStatus(start, end)
    };
  }

  function padTime(t) {
    const parts = String(t).split(':');
    while (parts.length < 3) parts.push('00');
    return parts.map(p => String(p).padStart(2, '0')).join(':');
  }

  function computeStatus(start, end) {
    const now = Date.now();
    if (now < start.getTime()) return 'UPCOMING';
    if (now >= start.getTime() && now <= end.getTime()) return 'LIVE';
    return 'EXPIRED';
  }

  // function sortByDateAsc(a, b) {
  //   const order = { LIVE: 0, UPCOMING: 1, EXPIRED: 2 };
  //   if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
  //   if (a.status === 'EXPIRED') return b.start - a.start;
  //   return a.start - b.start;
  // }

function render() {
  const listEl = document.getElementById('tsList');
  if (!listEl) return;
  listEl.dataset.rendered = '1';
  updateStats();

  const visible = activeFilter === 'all'
    ? allTests
    : allTests.filter(t => statusOf(t) === activeFilter);

  if (!visible.length) {
    listEl.innerHTML = `
      <div class="ts-empty">
        <i class="bi bi-calendar-x"></i>
        <p>No test schedules${activeFilter !== 'all' ? ' for this filter' : ' yet'}.</p>
        <a href="applications.html" class="ts-btn primary">
          <i class="bi bi-briefcase"></i> View My Applications
        </a>
      </div>`;
    return;
  }
  listEl.innerHTML = visible.map(cardTemplate).join('');
}
function cardTemplate(t) {
  const d = t.start;
  const day   = String(d.getDate()).padStart(2, '0');
  const month = d.toLocaleString('en-IN', { month: 'short' });
  const year  = d.getFullYear();

  const status = statusOf(t);                 // ← live
  const statusLabel = status === 'UPCOMING' ? 'Upcoming'
                    : status === 'LIVE'     ? 'Live Now'
                    : 'Expired';
  const statusClass = status.toLowerCase();

  let actionBtn;
  if (status === 'LIVE') {
    actionBtn = `<a href="aptitude-test.html?testId=${encodeURIComponent(t.testId)}"
                   class="ts-btn primary">
                   <i class="bi bi-play-circle"></i> Start Test
                 </a>`;
  } else if (status === 'UPCOMING') {
    actionBtn = `<button class="ts-btn primary" disabled>
                   <i class="bi bi-clock"></i> Unlocks at ${t.startTime}
                 </button>`;
  } else {
    actionBtn = `<a href="test-results.html?testId=${encodeURIComponent(t.testId)}"
                   class="ts-btn ghost">
                   <i class="bi bi-bar-chart"></i> View Result
                 </a>`;
  }

  return `
    <div class="ts-card" data-job-id="${t.jobId}" data-test-id="${t.testId}">
      <div class="ts-date-badge">
        <div class="ts-day">${day}</div>
        <div class="ts-month">${month}</div>
        <div class="ts-year">${year}</div>
      </div>
      <div class="ts-body">
        <div class="ts-title-row">
          <h3 class="ts-title">${escapeHtml(t.title)}</h3>
          <span class="ts-status-pill ${statusClass}">
            <i class="bi ${status === 'LIVE' ? 'bi-broadcast'
                       : status === 'EXPIRED' ? 'bi-clock-fill'
                       : 'bi-calendar-check'}"></i>
            ${statusLabel}
          </span>
        </div>
        ${t.company ? `<p class="ts-company">${escapeHtml(t.company)}${t.department ? ' · ' + escapeHtml(t.department) : ''}</p>` : ''}
        <div class="ts-meta">
          <span><i class="bi bi-clock"></i>${t.startTime} · ${t.durationMinutes} min</span>
          <span><i class="bi bi-laptop"></i>${t.mode === 'OFFLINE' ? 'Offline' : 'Online'}</span>
          ${t.totalQuestions ? `<span><i class="bi bi-list-ol"></i>${t.totalQuestions} questions</span>` : ''}
          ${t.totalMarks ? `<span><i class="bi bi-award"></i>${t.totalMarks} marks</span>` : ''}
        </div>
        <div class="ts-actions">
          ${actionBtn}
          <button type="button" class="ts-btn ghost" data-action="details">
            <i class="bi bi-info-circle"></i> View Details
          </button>
        </div>
      </div>
    </div>`;
}


  /* Delegated click handler — bound ONCE on #tsList. Works even after re-render. */
// function bindCardActions() {
//   // Delegate on document — survives any DOM swap by sidebar.js
//   if (document.body.dataset.tsActionsBound === '1') return;
//   document.body.dataset.tsActionsBound = '1';

//   document.addEventListener('click', (e) => {
//     const btn = e.target.closest('#tsList [data-action="details"]');
//     if (!btn) return;
//     const card = btn.closest('.ts-card');
//     if (!card) return;

//     const testId = card.dataset.testId;
//     const test = allTests.find(t => t.testId === testId);
//     console.log('[test-schedule.js] details clicked testId=', testId, '→', test);

//     if (!test) {
//       console.warn('[test-schedule.js] no test found for testId', testId);
//       return;
//     }
//     openDetailsModal(test);
//   });
// }
/* ---------- Delegated click — survives ANY DOM swap ---------- */
function bindCardActions() {
  if (document.body.dataset.tsActionsBound === '1') return;
  document.body.dataset.tsActionsBound = '1';

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('#tsList [data-action="details"]');
    if (!btn) return;
    const card = btn.closest('.ts-card');
    if (!card) return;
    const testId = card.dataset.testId;
    const test = allTests.find(t => t.testId === testId);
    console.log('[test-schedule.js] details clicked testId=', testId, '→', test);
    if (test) openDetailsModal(test);
  });
}

/* ---------- Auto re-render whenever #tsList is (re)inserted ---------- */
function watchForListSwaps() {
  const mo = new MutationObserver(() => {
    const listEl = document.getElementById('tsList');
    if (!listEl) return;
    // New node → sidebar swapped → re-render into it
    if (listEl.dataset.rendered !== '1') {
      listEl.dataset.rendered = '1';
      console.log('[test-schedule.js] MutationObserver → rendering into new #tsList');
      // If data hasn't been fetched yet, fetch it. Otherwise just render.
      if (!allTests.length) {
        loadTests().then(render);
      } else {
        render();
      }
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });
}
 function updateStats() {
  const total    = allTests.length;
  const upcoming = allTests.filter(t => statusOf(t) === 'UPCOMING').length;
  const live     = allTests.filter(t => statusOf(t) === 'LIVE').length;
  const expired  = allTests.filter(t => statusOf(t) === 'EXPIRED').length;

  setText('statTotal', total);
  setText('statUpcoming', upcoming);
  setText('statLive', live);
  setText('statExpired', expired);
  setText('tsCountAll', total);
  setText('tsCountUpcoming', upcoming);
  setText('tsCountLive', live);
  setText('tsCountExpired', expired);
}

  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

 function openDetailsModal(t) {
  if (!t) return;

  // 🔑 Get-or-create the modal element on demand
  let modalEl = document.getElementById('tsDetailsModal');
  if (!modalEl) {
    console.log('[test-schedule.js] modal missing → injecting it');
    modalEl = document.createElement('div');
    modalEl.className = 'modal fade';
    modalEl.id = 'tsDetailsModal';
    modalEl.tabIndex = -1;
    modalEl.setAttribute('aria-hidden', 'true');
    modalEl.innerHTML = `
      <div class="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="tsDetailsTitle">Test Details</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body" id="tsDetailsBody"></div>
        </div>
      </div>`;
    document.body.appendChild(modalEl);

    // Reset cached Bootstrap instance for the new element
    detailsModalInstance = null;
  }

  const bodyEl  = document.getElementById('tsDetailsBody');
  const titleEl = document.getElementById('tsDetailsTitle');

  if (!bodyEl || !titleEl) {
    console.error('[test-schedule.js] modal internals missing');
    return;
  }

  titleEl.textContent = t.title;

  const endTime = t.end.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const dateStr = t.start.toLocaleDateString('en-IN',
    { day: '2-digit', month: 'short', year: 'numeric' });
  const status = statusOf(t);                                // ← use statusOf, not t.status
  const statusLabel = status === 'UPCOMING' ? 'Upcoming'
                    : status === 'LIVE'     ? 'Live Now'
                    : 'Expired';

  bodyEl.innerHTML = `
    <div class="ts-modal-section">
      <div class="ts-modal-label">Overview</div>
      <div class="ts-modal-grid">
        <div><span class="ts-k">Status:</span> <span class="ts-v">${statusLabel}</span></div>
        <div><span class="ts-k">Mode:</span> <span class="ts-v">${t.mode === 'OFFLINE' ? 'Offline' : 'Online'}</span></div>
        <div><span class="ts-k">Date:</span> <span class="ts-v">${dateStr}</span></div>
        <div><span class="ts-k">Duration:</span> <span class="ts-v">${t.durationMinutes} minutes</span></div>
        <div><span class="ts-k">Start:</span> <span class="ts-v">${t.startTime}</span></div>
        <div><span class="ts-k">Ends:</span> <span class="ts-v">${endTime}</span></div>
        ${t.totalQuestions ? `<div><span class="ts-k">Questions:</span> <span class="ts-v">${t.totalQuestions}</span></div>` : ''}
        ${t.totalMarks ? `<div><span class="ts-k">Total Marks:</span> <span class="ts-v">${t.totalMarks}</span></div>` : ''}
        ${t.passingMarks ? `<div><span class="ts-k">Passing Marks:</span> <span class="ts-v">${t.passingMarks}</span></div>` : ''}
      </div>
    </div>
    ${t.instructions ? `
    <div class="ts-modal-section">
      <div class="ts-modal-label">Instructions</div>
      <p class="ts-instructions">${escapeHtml(t.instructions)}</p>
    </div>` : ''}
  `;

  if (!detailsModalInstance) {
    detailsModalInstance = new bootstrap.Modal(modalEl);
  }
  detailsModalInstance.show();
}

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

//   /* pageshow inside the IIFE so `init` is in scope */
 window.addEventListener('pageshow', () => {
  const listEl = document.getElementById('tsList');
  if (!listEl) return;

  // If sidebar swapped the DOM, #tsList is a NEW node without our marker.
  // Data (allTests) is still in memory, so just re-render.
  if (listEl.dataset.rendered !== '1') {
    console.log('[test-schedule.js] pageshow → re-render into new #tsList');
    listEl.dataset.rendered = '1';
    render();
  }
});
})();