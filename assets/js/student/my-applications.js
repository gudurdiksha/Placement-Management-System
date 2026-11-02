/* =====================================================================
   applications.js — My Applications page
   ===================================================================== */
   console.log('[applications.js] file loaded, readyState =', document.readyState);
(function attachBasicAuth() {
  const origFetch = window.fetch;
  window.fetch = function (input, init = {}) {
    const basic = sessionStorage.getItem('authBasic');
    if (basic) {
      init.headers = { ...(init.headers || {}), 'Authorization': `Basic ${basic}` };
    }
    init.credentials = init.credentials || 'include';
    return origFetch(input, init);
  };
})();

(function () {
  'use strict';

  const APPLY_API   = 'http://127.0.0.1:8080/api/applications';
  const JOB_API     = 'http://127.0.0.1:8080/api/jobs';
  const COMPANY_API = 'http://127.0.0.1:8080/api/companies';

  const ICON_BG_CLASSES = ['', 'logo-purple', 'logo-orange', 'logo-green', 'logo-pink'];

  let ALL_APPLICATIONS = [];
  let ACTIVE_FILTER = 'all';

  /* ---------------------------------------------------------------- */
  /* Status metadata                                                   */
  /* ---------------------------------------------------------------- */
  const STATUS_META = {
    SUBMITTED:    { label: 'Submitted',    icon: 'bi-send-check-fill',      cls: 'status-submitted' },
    UNDER_REVIEW: { label: 'Under Review', icon: 'bi-hourglass-split',      cls: 'status-under-review' },
    SHORTLISTED:  { label: 'Shortlisted',  icon: 'bi-star-fill',            cls: 'status-shortlisted' },
    INTERVIEW:    { label: 'Interview',    icon: 'bi-people-fill',          cls: 'status-interview' },
    OFFERED:      { label: 'Offered',      icon: 'bi-trophy-fill',          cls: 'status-offered' },
    REJECTED:     { label: 'Rejected',     icon: 'bi-x-circle-fill',        cls: 'status-rejected' },
    WITHDRAWN:    { label: 'Withdrawn',    icon: 'bi-slash-circle',         cls: 'status-withdrawn' }
  };

  /* ---------------------------------------------------------------- */
  /* Boot                                                              */
  /* ---------------------------------------------------------------- */
  function init() {
    if (document.body.dataset.page !== 'applications') return;

    wireTabs();
    showLoading();
    fetchApplications();
  }

  /* ---------------------------------------------------------------- */
  /* Fetch                                                             */
  /* ---------------------------------------------------------------- */
  async function fetchApplications() {
    try {
        console.log('[applications.js] fetching applications...');
      const res = await fetch(`${APPLY_API}/me`, { credentials: 'include' });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const apps = await res.json();

      // Fetch job details for each application so we can show title/company/etc.
      const enriched = await Promise.all(
        apps.map(async (app) => {
          let job = null;
          try {
            const jr = await fetch(`${JOB_API}/${app.jobId}`, { credentials: 'include' });
            if (jr.ok) job = await jr.json();
          } catch (_) {}
          return normalizeApplication(app, job);
        })
      );

      ALL_APPLICATIONS = enriched;
      hideLoading();
      renderStats();
      renderTabs();
      render();
    } catch (err) {
      console.error('Applications fetch failed:', err);
      hideLoading();
      renderEmpty({
        icon: 'bi-wifi-off',
        title: 'Could not load your applications',
        message: err.message.includes('401')
          ? 'You are not signed in. Please log in again.'
          : 'Something went wrong. Please try again.',
        actionLabel: 'Retry',
        onAction: () => { showLoading(); fetchApplications(); }
      });
    }
  }

  /* ---------------------------------------------------------------- */
  /* Normalize                                                         */
  /* ---------------------------------------------------------------- */
  function normalizeApplication(app, job) {
    const jobTypeMap = {
      FULL_TIME: 'Full Time', PART_TIME: 'Part Time',
      INTERNSHIP: 'Internship', CONTRACT: 'Contract', REMOTE: 'Remote'
    };

    return {
      id: app.id,
      jobId: app.jobId,
      companyId: app.companyId,
      title: job?.title ?? app.jobTitle ?? 'Untitled Role',
      companyName: job?.companyName ?? app.companyName ?? 'Unknown Company',
      location: job?.location ?? '',
      jobType: jobTypeMap[job?.jobType] ?? job?.jobType ?? '',
      workMode: job?.jobType === 'REMOTE' ? 'Remote' : 'On-site',
      experienceLevel: job?.experienceRequired ?? 'Fresher',
      minSalary: job?.minSalary ?? null,
      maxSalary: job?.maxSalary ?? null,
      department: job?.department ?? '',
      appliedAt: app.createdAt ?? app.appliedAt ?? null,
      status: (app.status || 'SUBMITTED').toUpperCase(),
      statusHistory: Array.isArray(app.statusHistory) ? app.statusHistory : [],
      aptitudetestScheduledAt: app.aptitudeTestScheduledAt ?? app.testScheduledAt ?? null,
      aptitudeTestCompleted: !!app.aptitudeTestCompleted,
      interviewScheduledAt: app.interviewScheduledAt ?? app.interviewDate ?? null,
      resumeViewed: !!app.resumeViewed
    };
  }

  /* ---------------------------------------------------------------- */
  /* Stats                                                             */
  /* ---------------------------------------------------------------- */
  function renderStats() {
    const total       = ALL_APPLICATIONS.length;
    const inProgress  = ALL_APPLICATIONS.filter(a =>
      ['SUBMITTED', 'UNDER_REVIEW'].includes(a.status)).length;
    const shortlisted = ALL_APPLICATIONS.filter(a =>
      ['SHORTLISTED', 'INTERVIEW', 'OFFERED'].includes(a.status)).length;
    const rejected    = ALL_APPLICATIONS.filter(a =>
      ['REJECTED', 'WITHDRAWN'].includes(a.status)).length;

    setText('statTotal', total);
    setText('statPending', inProgress);
    setText('statShortlisted', shortlisted);
    setText('statRejected', rejected);
  }

  function renderTabs() {
    setText('tabCountAll', ALL_APPLICATIONS.length);
    setText('tabCountSubmitted', count('SUBMITTED'));
    setText('tabCountUnderReview', count('UNDER_REVIEW'));
    setText('tabCountShortlisted', count('SHORTLISTED'));
    setText('tabCountRejected', count('REJECTED') + count('WITHDRAWN'));
  }

  function count(status) {
    return ALL_APPLICATIONS.filter(a => a.status === status).length;
  }

  /* ---------------------------------------------------------------- */
  /* Tabs wiring                                                       */
  /* ---------------------------------------------------------------- */
  function wireTabs() {
    document.querySelectorAll('.app-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.app-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        ACTIVE_FILTER = tab.dataset.filter;
        render();
      });
    });
  }

  /* ---------------------------------------------------------------- */
  /* Render list                                                       */
  /* ---------------------------------------------------------------- */
  function render() {
    const list = document.getElementById('appList');
    if (!list) return;

    const filtered = ACTIVE_FILTER === 'all'
      ? ALL_APPLICATIONS
      : ALL_APPLICATIONS.filter(a => a.status === ACTIVE_FILTER);

    list.innerHTML = '';

    if (filtered.length === 0) {
      renderEmpty({
        icon: 'bi-inbox',
        title: ACTIVE_FILTER === 'all' ? 'No applications yet' : 'No applications in this category',
        message: ACTIVE_FILTER === 'all'
          ? "You haven't applied to any jobs yet. Start exploring!"
          : 'Try a different filter.',
        actionLabel: ACTIVE_FILTER === 'all' ? 'Browse Jobs' : null,
        onAction: () => { window.location.href = 'search-jobs.html'; }
      });
      return;
    }

    filtered.forEach((app, i) => {
      list.appendChild(buildCard(app, i));
    });
  }

  function buildCard(app, index) {
    const meta = STATUS_META[app.status] || STATUS_META.SUBMITTED;
    const logoCls = ICON_BG_CLASSES[index % ICON_BG_CLASSES.length];
    const applied = timeAgo(app.appliedAt);

    const card = document.createElement('article');
    card.className = 'app-card';

    card.innerHTML = `
      <div class="app-card-logo ${logoCls}"><i class="bi bi-briefcase-fill"></i></div>

      <div class="app-card-body">
        <div class="app-card-top">
          <h5 class="app-card-title">${escapeHtml(app.title)}</h5>
          <span class="status-badge ${meta.cls}">
            <i class="bi ${meta.icon}"></i> ${escapeHtml(meta.label)}
          </span>
        </div>

        <p class="app-card-company">
          <i class="bi bi-building"></i> ${escapeHtml(app.companyName)}
          ${app.location ? `<span class="dot">•</span> ${escapeHtml(app.location)}` : ''}
        </p>

        <div class="app-card-facts">
          ${app.jobType ? `<span><i class="bi bi-briefcase"></i> ${escapeHtml(app.jobType)}</span>` : ''}
          ${app.workMode ? `<span><i class="bi bi-laptop"></i> ${escapeHtml(app.workMode)}</span>` : ''}
          ${app.experienceLevel ? `<span><i class="bi bi-person"></i> ${escapeHtml(app.experienceLevel)}</span>` : ''}
          ${formatSalaryRange(app.minSalary, app.maxSalary)}
        </div>

        <span class="app-card-applied">
          <i class="bi bi-calendar-check"></i> Applied ${applied}
        </span>

        <div class="app-card-badges">
          ${renderAptitudeBadge(app)}
          ${renderInterviewBadge(app)}
          ${app.resumeViewed
            ? `<span class="mini-badge resume-viewed"><i class="bi bi-eye-fill"></i> Resume viewed</span>`
            : ''}
        </div>
      </div>

      <div class="app-card-actions">
        <button class="btn-view-details" data-app-id="${app.id}">
          View Details <i class="bi bi-arrow-right"></i>
        </button>
        ${['SUBMITTED', 'UNDER_REVIEW'].includes(app.status)
          ? `<button class="btn-withdraw" data-withdraw-id="${app.id}">Withdraw</button>`
          : ''}
      </div>
    `;

    card.querySelector('.btn-view-details')
      ?.addEventListener('click', () => openDetails(app));

    card.querySelector('.btn-withdraw')
      ?.addEventListener('click', () => withdrawApplication(app.id));

    return card;
  }

  /* ---------------------------------------------------------------- */
  /* Badges                                                             */
  /* ---------------------------------------------------------------- */
  function renderAptitudeBadge(app) {
    if (app.aptitudeTestCompleted) {
      return `<span class="mini-badge test-scheduled">
        <i class="bi bi-patch-check-fill"></i> Aptitude test completed
      </span>`;
    }
    if (app.aptitudeTestScheduledAt) {
      return `<span class="mini-badge test-scheduled">
        <i class="bi bi-calendar-event-fill"></i> Aptitude test · ${formatDate(app.aptitudeTestScheduledAt)}
      </span>`;
    }
    if (['SHORTLISTED', 'INTERVIEW', 'UNDER_REVIEW'].includes(app.status)) {
      return `<span class="mini-badge test-pending">
        <i class="bi bi-hourglass"></i> Aptitude test not scheduled
      </span>`;
    }
    return '';
  }

  function renderInterviewBadge(app) {
    if (app.interviewScheduledAt) {
      return `<span class="mini-badge interview-scheduled">
        <i class="bi bi-people-fill"></i> Interview · ${formatDate(app.interviewScheduledAt)}
      </span>`;
    }
    if (app.status === 'SHORTLISTED') {
      return `<span class="mini-badge interview-pending">
        <i class="bi bi-hourglass"></i> Interview not scheduled
      </span>`;
    }
    return '';
  }

  /* ---------------------------------------------------------------- */
  /* Detail modal                                                      */
  /* ---------------------------------------------------------------- */
  function openDetails(app) {
    const modalEl = document.getElementById('appDetailsModal');
    const bodyEl  = document.getElementById('appDetailsBody');
    const titleEl = document.getElementById('appDetailsTitle');
    if (!modalEl || !bodyEl) return;

    titleEl.textContent = app.title;
    const meta = STATUS_META[app.status] || STATUS_META.SUBMITTED;

    const timelineHtml = (app.statusHistory || []).map(h => `
      <li>
        <div class="tl-dot"><i class="bi bi-check"></i></div>
        <div class="tl-body">
          <div class="tl-title">${escapeHtml(STATUS_META[h.status]?.label || h.status)}</div>
          <div class="tl-time">${formatDateTime(h.changedAt || h.timestamp || h.createdAt)}</div>
          ${h.note ? `<div class="tl-note">${escapeHtml(h.note)}</div>` : ''}
        </div>
      </li>
    `).join('');

    bodyEl.innerHTML = `
      <div class="detail-header">
        <div class="detail-logo"><i class="bi bi-briefcase-fill"></i></div>
        <div>
          <h5>${escapeHtml(app.title)}</h5>
          <small>${escapeHtml(app.companyName)}${app.location ? ' · ' + escapeHtml(app.location) : ''}</small>
        </div>
        <span class="status-badge ${meta.cls}" style="margin-left:auto;">
          <i class="bi ${meta.icon}"></i> ${escapeHtml(meta.label)}
        </span>
      </div>

      <div class="detail-grid">
        <div class="detail-item"><strong>Applied on</strong><span>${formatDate(app.appliedAt)}</span></div>
        <div class="detail-item"><strong>Job type</strong><span>${escapeHtml(app.jobType || '—')}</span></div>
        <div class="detail-item"><strong>Work mode</strong><span>${escapeHtml(app.workMode || '—')}</span></div>
        <div class="detail-item"><strong>Experience</strong><span>${escapeHtml(app.experienceLevel || '—')}</span></div>
        <div class="detail-item"><strong>Salary</strong><span>${formatSalaryRange(app.minSalary, app.maxSalary) || '—'}</span></div>
        <div class="detail-item"><strong>Department</strong><span>${escapeHtml(app.department || '—')}</span></div>
      </div>

      <h6 style="font-weight:700;color:#1f2d3d;margin: 4px 0 12px;">Application timeline</h6>
      ${timelineHtml
        ? `<ul class="timeline">${timelineHtml}</ul>`
        : `<p style="color:#6b7280;font-size:.9rem;">No timeline updates yet.</p>`}
    `;

    bootstrap.Modal.getOrCreateInstance(modalEl).show();
  }

  /* ---------------------------------------------------------------- */
  /* Withdraw                                                          */
  /* ---------------------------------------------------------------- */
  async function withdrawApplication(appId) {
    if (!confirm('Withdraw this application? This cannot be undone.')) return;
    try {
      const res = await fetch(`${APPLY_API}/${appId}/withdraw`, {
        method: 'PATCH',
        credentials: 'include'
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      // Update local state
      const app = ALL_APPLICATIONS.find(a => String(a.id) === String(appId));
      if (app) app.status = 'WITHDRAWN';
      renderStats();
      renderTabs();
      render();
      showToast('Application withdrawn');
    } catch (err) {
      console.error('Withdraw failed:', err);
      showToast('Could not withdraw application', true);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Loading / empty                                                   */
  /* ---------------------------------------------------------------- */
  function showLoading() {
    const list = document.getElementById('appList');
    if (!list) return;
    list.innerHTML = Array.from({ length: 3 }).map(() => `
      <div class="app-skeleton">
        <div class="sk-logo"></div>
        <div class="sk-body">
          <div class="sk-line w-60"></div>
          <div class="sk-line w-40"></div>
          <div class="sk-line w-80"></div>
        </div>
      </div>
    `).join('');
  }

  function hideLoading() {
    document.querySelectorAll('.app-skeleton').forEach(el => el.remove());
  }

  function renderEmpty({ icon, title, message, actionLabel, onAction }) {
    const list = document.getElementById('appList');
    if (!list) return;
    list.innerHTML = `
      <div class="app-empty">
        <i class="bi ${icon}"></i>
        <h5>${escapeHtml(title)}</h5>
        <p>${escapeHtml(message)}</p>
        ${actionLabel ? `<button class="btn-view-details" id="emptyAction">${escapeHtml(actionLabel)}</button>` : ''}
      </div>
    `;
    if (actionLabel && typeof onAction === 'function') {
      document.getElementById('emptyAction')?.addEventListener('click', onAction);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Helpers                                                           */
  /* ---------------------------------------------------------------- */
  function setText(id, v) {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
  }

  function timeAgo(dateStr) {
    if (!dateStr) return '—';
    const diff = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diff / 86400000);
    if (days <= 0) return 'today';
    if (days === 1) return '1 day ago';
    if (days < 30) return `${days} days ago`;
    const months = Math.floor(days / 30);
    return `${months} month${months > 1 ? 's' : ''} ago`;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function formatDateTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: 'numeric', minute: '2-digit'
    });
  }

  function formatSalaryRange(min, max) {
    if (min == null && max == null) return '';
    const fmt = n => `₹${Number(n).toLocaleString('en-IN')}`;
    let s;
    if (min != null && max != null) s = `${fmt(min)} – ${fmt(max)}`;
    else if (min != null)           s = `From ${fmt(min)}`;
    else                            s = `Up to ${fmt(max)}`;
    return `<span><i class="bi bi-cash-stack"></i> ${s}</span>`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function showToast(msg, isError = false) {
    let t = document.getElementById('appToast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'appToast';
      t.style.cssText = `
        position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(20px);
        background:#1f2d3d;color:#fff;padding:12px 22px;border-radius:10px;
        font-size:.92rem;box-shadow:0 8px 24px rgba(0,0,0,.18);
        opacity:0;transition:all .25s ease;z-index:9999;pointer-events:none;
      `;
      document.body.appendChild(t);
    }
    t.style.background = isError ? '#dc3545' : '#1f2d3d';
    t.textContent = msg;
    requestAnimationFrame(() => {
      t.style.opacity = '1';
      t.style.transform = 'translateX(-50%) translateY(0)';
    });
    clearTimeout(t._t);
    t._t = setTimeout(() => {
      t.style.opacity = '0';
      t.style.transform = 'translateX(-50%) translateY(20px)';
    }, 2800);
  }

  /* ---------------------------------------------------------------- */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
  console.log('[applications.js] init, body.dataset.page =', document.body.dataset.page);
})();