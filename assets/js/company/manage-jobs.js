/* ============================================================
   manage-jobs.js
   Company dashboard — Job Postings management table.

   Depends on (loaded before this file, per manage-jobs.html):
     config.js   -> defines the global `API_BASE` (e.g. "http://127.0.0.1:8080")
     session.js  -> handles auth/session redirect helpers (not required by this file)
     navbar.js   -> injects shared navbar
     app.js      -> shared dropdown / toast helpers (this file has safe fallbacks if absent)

   Backend endpoints used (JobPostingController):
     GET    /api/jobs/my-jobs
     GET    /api/jobs/{id}
     PUT    /api/jobs/{id}
     PUT    /api/jobs/{id}/activate
     PUT    /api/jobs/{id}/deactivate
     DELETE /api/jobs/{id}

   Rendering uses the classes already defined in manage-jobs-style.css
   (.job-cell, .job-avatar, .salary-amt, .status-toggle, .action-link, etc.)
   instead of ad-hoc markup, so the table actually looks like the rest
   of the design system.
   ============================================================ */

(function () {
  'use strict';

  // Reads the global `API_BASE` from config.js. Named JOBS_API here (not API_BASE)
  // so this const doesn't shadow the outer one in the shared script scope.
const JOBS_API = (typeof API_BASE !== 'undefined' ? API_BASE : '') + '/api/jobs';
const APPS_API = (typeof API_BASE !== 'undefined' ? API_BASE : '') + '/api/applications';
const APT_API = (typeof API_BASE !== 'undefined' ? API_BASE : '') + '/api/aptitude';

  /* ---------- state ---------- */
  //let scheduledJobIds = new Set();   // jobIds that already have an aptitude schedule
  let allJobs = [];
  let filteredJobs = [];
  let currentPage = 1;
  let pageSize = 10;

  const filters = {
    time: 'this-month',
    branch: 'all',
    type: 'all',
    status: 'all',
    search: ''
  };

  // Avatar background colors, cycled by row index (matches the reference design)
  const AVATAR_COLORS = ['#2f6fed', '#7c4fe0', '#16a34a', '#d98a1a', '#e0392f', '#0e7c86'];

  /* ---------- element refs ---------- */
  const els = {};

  document.addEventListener('DOMContentLoaded', init);

 async function init() {
  cacheEls();
  injectModalMarkup();
  // injectAptitudeModal();
  injectDynamicStyles();
  bindFilterDropdowns();
  bindSearch();
  bindPageSize();
  bindClearFilters();
  bindDownloadReport();
  bindAptReminderToggle();
  await loadJobs();
   await loadSchedules();
  renderAptitudeReminder();
}

  function cacheEls() {
    els.tbody = document.getElementById('jobTableBody');
    els.downloadReportBtn = document.getElementById('downloadReportBtn');
    els.statCards = document.getElementById('statCards');
    els.emptyState = document.getElementById('emptyState');
    els.entriesInfo = document.getElementById('entriesInfo');
    els.pagination = document.getElementById('pagination');
    els.pageSizeSelect = document.getElementById('pageSizeSelect');
    els.searchInput = document.getElementById('searchJob');
    els.clearFiltersBtn = document.getElementById('clearFiltersBtn');
    els.toast = document.getElementById('toast');
    els.createJobBtn = document.getElementById('createJobBtn');
  }

  /* ============================================================
     DATA LOADING
     ============================================================ */

 async function loadJobs() {
  setTableLoading(true);
  try {
    // Fetch jobs and application counts in parallel
    const [jobsRes, countsMap] = await Promise.all([
      fetch(`${JOBS_API}/my-jobs`, { credentials: 'include' }),
      fetchApplicationCounts()
    ]);

    if (jobsRes.status === 401) {
      showToast('Session expired. Please log in again.');
      setTimeout(() => (window.location.href = '../index.html'), 1200);
      return;
    }
    if (!jobsRes.ok) throw new Error(`Failed to load jobs (${jobsRes.status})`);
    
    const raw = await jobsRes.json();
    allJobs = (Array.isArray(raw) ? raw : []).map((job) => {
      const normalized = normalizeJob(job);
      // Prefer count from the applications API; fall back to whatever the job
      // payload already had (which is usually 0).
      if (countsMap[normalized.id] != null) {
        normalized.applicationsCount = countsMap[normalized.id];
      }
      return normalized;
    });

    renderStatCards();
    populateBranchFilterOptions();
    applyFilters();
  } catch (err) {
    console.error('loadJobs error:', err);
    renderTableError(err);
  }
}
// async function loadSchedules() {
//   try {
//     // If your session exposes companyId, use it; otherwise adjust the URL.
//     const companyId = window.COMPANY_ID || (await guessCompanyId());
//     if (!companyId) return;

//     const res = await fetch(`${APT_API}/my-schedules?companyId=${companyId}`, {
//       credentials: 'include'
//     });
//     if (!res.ok) return;

//     const list = await res.json();
//     scheduledJobIds = new Set(list.map(s => String(s.jobId)));
//   } catch (err) {
//     console.warn('Could not load aptitude schedules:', err);
//   }
// }

// // Best-effort: reuse the existing jobs response which has companyId on each job
// async function guessCompanyId() {
//   // allJobs[*].companyId is populated by normalizeJob
//   const first = allJobs.find(j => j.companyId != null);
//   return first ? first.companyId : null;
// }

/* ---- after APT_API const ---- */
const AptitudeAPI = (typeof API_BASE !== 'undefined' ? API_BASE : '') + '/api/aptitude';

let scheduledJobIds = new Set();
let currentAptJob = null;   // kept here so reminder banner can use it

async function loadSchedules() {
  try {
    scheduledJobIds = await AptitudeSchedule.fetchScheduledJobIds();
  } catch (err) {
    console.warn('Could not load aptitude schedules:', err);
  }
}
/**
 * Returns a map of { [jobId]: count }.
 * Tries GET /api/applications/count-by-job first.
 * Falls back to GET /api/applications/my-applications and groups by jobId.
 * On any failure, returns {} so the table still renders.
 */
async function fetchApplicationCounts() {
  // --- Attempt 1: dedicated count endpoint ---
  try {
    const res = await fetch(`${APPS_API}/count-by-job`, { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      // Expect either { jobId: count, ... } or [{ jobId, count }, ...]
      if (Array.isArray(data)) {
        return data.reduce((acc, row) => {
          acc[row.jobId] = Number(row.count) || 0;
          return acc;
        }, {});
      }
      return Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, Number(v) || 0])
      );
    }
    // If 401, don't try the fallback — bubble up cleanly
    if (res.status === 401) return {};
  } catch (err) {
    console.warn('count-by-job endpoint unavailable, falling back:', err.message);
  }

  // --- Attempt 2: fetch all applications and group client-side ---
  try {
    const res = await fetch(`${APPS_API}/my-applications`, { credentials: 'include' });
    if (!res.ok) return {};

    const raw = await res.json();
    const list = Array.isArray(raw) ? raw : (raw.data || raw.applications || []);

    return list.reduce((acc, app) => {
      // Try every reasonable field name your backend might use
      const jobId = app.jobId ?? app.jobPostingId ?? app.job?.id ?? app.job?._id;
      if (jobId == null) return acc;
      acc[jobId] = (acc[jobId] || 0) + 1;
      return acc;
    }, {});
  } catch (err) {
    console.warn('Falling back to zero application counts:', err.message);
    return {};
  }
}

function renderAptitudeReminder() {
  const banner = document.getElementById('aptReminder');
  const title  = document.getElementById('aptReminderTitle');
  const sub    = document.getElementById('aptReminderSub');
  const list   = document.getElementById('aptPendingItems');
  if (!banner) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const pending = allJobs.filter(job => {
    if (job.status !== 'ACTIVE') return false;
    if (!job.applicationDeadline) return false;

    const deadline = new Date(job.applicationDeadline);
    if (isNaN(deadline) || deadline < today) return false;

    // Not already scheduled
    return !scheduledJobIds.has(String(job.id));
  });

  if (pending.length === 0) {
    banner.hidden = true;
    document.getElementById('aptPendingList').hidden = true;
    return;
  }

  banner.hidden = false;
  title.textContent = `${pending.length} active job${pending.length > 1 ? 's' : ''} still need an aptitude test scheduled`;
  sub.textContent   = `Deadline has not passed yet. Schedule the aptitude round before applications close.`;

  list.innerHTML = pending.map(job => `
    <li>
      <div>
        <div class="apt-job-title">${escapeHtml(job.title)}</div>
        <div class="apt-job-meta">
          ${escapeHtml(job.department || '—')} · Deadline: ${formatDate(job.applicationDeadline)}
        </div>
      </div>
      <button type="button" class="apt-schedule-btn" data-schedule-job="${job.id}">
        Schedule Aptitude
      </button>
    </li>
  `).join('');

  list.querySelectorAll('[data-schedule-job]').forEach(btn => {
  btn.addEventListener('click', () => {
    const jobId = btn.getAttribute('data-schedule-job');
    const job = allJobs.find(j => String(j.id) === String(jobId));
    if (job) AptitudeSchedule.open(job, () => {
      scheduledJobIds.add(String(job.id));
      renderAptitudeReminder();
      applyFilters();
    });
  });
});
}

function bindAptReminderToggle() {
  const viewBtn = document.getElementById('aptReminderViewBtn');
  const listBox = document.getElementById('aptPendingList');
  if (!viewBtn || !listBox) return;
  viewBtn.addEventListener('click', () => {
    listBox.hidden = !listBox.hidden;
    viewBtn.textContent = listBox.hidden ? 'View jobs' : 'Hide jobs';
  });
}
  function renderTableError(err) {
    const isLikelyCors = err instanceof TypeError; // fetch throws a bare TypeError on network/CORS failure
    const message = isLikelyCors
      ? "Could not reach the server. This is usually a CORS or network issue — open the browser console (F12) for the exact error, and check that the backend allows requests from this page's origin."
      : err.message || 'Could not load job postings.';

    els.tbody.innerHTML = `<tr><td colspan="8" class="mj-loading-row">${escapeHtml(message)}</td></tr>`;
    els.emptyState.hidden = true;
    els.entriesInfo.textContent = 'Showing 0 of 0 entries';
    els.pagination.innerHTML = '';
    showToast('Could not load job postings.');
  }

  // Maps 1:1 to the real JobPosting document (there's no separate response DTO —
  // GET/PUT return the raw model, confirmed against the Postman sample response).
  function normalizeJob(job) {
    return {
      id: job.id,
      companyId: job.companyId ?? null,
      companyName: job.companyName ?? '',
      title: job.title ?? 'Untitled Job',
      description: job.description ?? '',
      department: job.department ?? '',
      location: job.location ?? '',
      jobType: (job.jobType ?? '').toString(), // FULL_TIME | PART_TIME | INTERNSHIP | CONTRACT | REMOTE
      experienceRequired: job.experienceRequired ?? '',
      skillsRequired: job.skillsRequired ?? [],
      qualification: job.qualification ?? '',
      minSalary: job.minSalary ?? null,
      maxSalary: job.maxSalary ?? null,
      numberOfOpenings: job.numberOfOpenings ?? 0,
      applicationDeadline: job.applicationDeadline ?? null, // LocalDate -> "yyyy-MM-dd"
      status: (job.status ?? 'ACTIVE').toString().toUpperCase(), // ACTIVE | CLOSED | EXPIRED
      postedAt: job.postedAt ?? null, // LocalDateTime -> ISO string
      updatedAt: job.updatedAt ?? null,
      // Not present on the model/controller yet — stays 0 until there's an
      // endpoint or field to source it from.
      applicationsCount: job.applicationsCount ?? 0
    };
  }

  /* ============================================================
     STAT CARDS
     ============================================================ */

  function renderStatCards() {
    const total = allJobs.length;
    const active = allJobs.filter((j) => j.status === 'ACTIVE').length;
    const inactive = allJobs.filter((j) => j.status === 'CLOSED').length;
    const expired = allJobs.filter((j) => j.status === 'EXPIRED').length;
    const applications = allJobs.reduce((sum, j) => sum + (Number(j.applicationsCount) || 0), 0);

    const cards = [
      { label: 'Total Job Postings', value: total, tone: 'blue', icon: ICONS.briefcase },
      { label: 'Active Jobs', value: active, tone: 'green', icon: ICONS.checkCircle },
      { label: 'Inactive Jobs', value: inactive, tone: 'orange', icon: ICONS.pauseCircle },
      { label: 'Total Applications', value: applications, tone: 'purple', icon: ICONS.users },
      { label: 'Expired', value: expired, tone: 'red', icon: ICONS.calendarX }
    ];

    els.statCards.innerHTML = cards
      .map(
        (c) => `
        <div class="stat-card">
          <div class="stat-icon ${c.tone}">${c.icon}</div>
          <div class="stat-info">
            <p class="value">${c.value}</p>
            <p class="label">${c.label}</p>
          </div>
        </div>`
      )
      .join('');
  }

  const ICONS = {
    briefcase:
      '<svg viewBox="0 0 24 24"><path d="M3 7h18M3 7v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    checkCircle:
      '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9 12l2 2 4-4"/></svg>',
    pauseCircle:
      '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/></svg>',
    calendarX:
      '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M9.5 14.5l5 5M14.5 14.5l-5 5"/></svg>',
    users:
      '<svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    pin:
      '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    calendar:
      '<svg viewBox="0 0 24 24" width="14" height="14"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>'
  };

  /* ============================================================
     FILTER BAR (dropdowns already exist in manage-jobs.html markup)
     ============================================================ */

  function bindFilterDropdowns() {
    document.querySelectorAll('.filter-field[data-dropdown]').forEach((field) => {
      const key = field.getAttribute('data-dropdown');
      const trigger = field.querySelector('.mj-select-trigger');
      const menu = field.querySelector('.mj-select-menu');
      const valueEl = field.querySelector('.mj-select-value');

      if (!trigger || !menu) return;

      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        // The menu is shown via CSS on `.filter-field.is-open .mj-select-menu`,
        // so the `is-open` class has to live on the field, not the menu itself.
        document
          .querySelectorAll('.filter-field.is-open')
          .forEach((f) => f !== field && f.classList.remove('is-open'));
        field.classList.toggle('is-open');
      });

      menu.querySelectorAll('button[data-value]').forEach((btn) => {
        btn.addEventListener('click', () => {
          menu.querySelectorAll('button').forEach((b) => b.classList.remove('is-selected'));
          btn.classList.add('is-selected');
          valueEl.textContent = btn.textContent.trim();
          field.classList.remove('is-open');

          filters[key] = btn.getAttribute('data-value');
          currentPage = 1;
          applyFilters();
        });
      });
    });

    document.addEventListener('click', () => {
      document.querySelectorAll('.filter-field.is-open').forEach((f) => f.classList.remove('is-open'));
    });
  }

  // Branch/Department filter options depend on what the company has actually posted,
  // so we rebuild that menu from the loaded jobs instead of hardcoding it.
  function populateBranchFilterOptions() {
    const field = document.querySelector('.filter-field[data-dropdown="branch"]');
    if (!field) return;
    const menu = field.querySelector('.mj-select-menu');
    if (!menu) return;

    const depts = Array.from(new Set(allJobs.map((j) => j.department).filter(Boolean))).sort();

    menu.innerHTML =
      `<button type="button" data-value="all" class="is-selected">All Branches</button>` +
      depts.map((d) => `<button type="button" data-value="${escapeHtml(d)}">${escapeHtml(d)}</button>`).join('');

    // Re-bind just this menu's buttons (bindFilterDropdowns already wired the trigger).
    menu.querySelectorAll('button[data-value]').forEach((btn) => {
      btn.addEventListener('click', () => {
        menu.querySelectorAll('button').forEach((b) => b.classList.remove('is-selected'));
        btn.classList.add('is-selected');
        field.querySelector('.mj-select-value').textContent = btn.textContent.trim();
        field.classList.remove('is-open');
        filters.branch = btn.getAttribute('data-value');
        currentPage = 1;
        applyFilters();
      });
    });
  }

  function bindSearch() {
    if (!els.searchInput) return;
    let debounce;
    els.searchInput.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        filters.search = els.searchInput.value.trim().toLowerCase();
        currentPage = 1;
        applyFilters();
      }, 250);
    });
  }

  function bindPageSize() {
    if (!els.pageSizeSelect) return;
    els.pageSizeSelect.addEventListener('change', () => {
      pageSize = parseInt(els.pageSizeSelect.value, 10) || 10;
      currentPage = 1;
      renderTable();
    });
  }
function bindDownloadReport() {
  if (!els.downloadReportBtn) return;
  els.downloadReportBtn.addEventListener('click', downloadReportCsv);
}

function downloadReportCsv() {
  if (!filteredJobs.length) {
    showToast('No jobs to export for the current filters.');
    return;
  }

  const headers = [
    'Title', 'Department', 'Location', 'Job Type', 'Experience',
    'Min Salary (LPA)', 'Max Salary (LPA)', 'Openings',
    'Posted On', 'Application Deadline', 'Status', 'Applications'
  ];

  const rows = filteredJobs.map((j) => [
    j.title,
    j.department,
    j.location,
    jobTypeLabel(j.jobType),
    j.experienceRequired,
    j.minSalary ?? '',
    j.maxSalary ?? '',
    j.numberOfOpenings ?? '',
    formatDate(j.postedAt),
    formatDate(j.applicationDeadline),
    j.status,
    j.applicationsCount
  ]);

  const escapeCsv = (val) => {
    const s = String(val ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const csv = [headers, ...rows].map((r) => r.map(escapeCsv).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `job-postings-report-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  showToast('Report downloaded.');
}

function bindClearFilters() {
  if (!els.clearFiltersBtn) return;
  els.clearFiltersBtn.addEventListener('click', () => {
    filters.time = 'all';
    filters.branch = 'all';
    filters.type = 'all';
    filters.status = 'all';
    filters.search = '';
    if (els.searchInput) els.searchInput.value = '';

      document.querySelectorAll('.filter-field[data-dropdown]').forEach((field) => {
        const menu = field.querySelector('.mj-select-menu');
        const valueEl = field.querySelector('.mj-select-value');
        const allBtn = menu?.querySelector('button[data-value="all"]');
        if (allBtn) {
          menu.querySelectorAll('button').forEach((b) => b.classList.remove('is-selected'));
          allBtn.classList.add('is-selected');
          valueEl.textContent = allBtn.textContent.trim();
        }
      });

      currentPage = 1;
      applyFilters();
    });
  }

  /* ============================================================
     FILTER + PAGINATE + RENDER
     ============================================================ */

  function applyFilters() {
    const now = new Date();

    filteredJobs = allJobs.filter((job) => {
      // time filter (based on postedAt)
      if (filters.time !== 'all' && job.postedAt) {
        const posted = new Date(job.postedAt);
        if (!isNaN(posted)) {
          if (filters.time === 'this-week') {
            const startOfWeek = new Date(now);
            startOfWeek.setDate(now.getDate() - now.getDay());
            startOfWeek.setHours(0, 0, 0, 0);
            if (posted < startOfWeek) return false;
          } else if (filters.time === 'this-month') {
            if (posted.getMonth() !== now.getMonth() || posted.getFullYear() !== now.getFullYear())
              return false;
          } else if (filters.time === 'last-month') {
            const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            if (
              posted.getMonth() !== lastMonth.getMonth() ||
              posted.getFullYear() !== lastMonth.getFullYear()
            )
              return false;
          }
        }
      }

      if (filters.branch !== 'all' && job.department !== filters.branch) return false;

      if (filters.type !== 'all') {
        const typeLabel = jobTypeLabel(job.jobType);
        if (typeLabel !== filters.type) return false;
      }

      if (filters.status !== 'all') {
        const statusLabel = job.status === 'ACTIVE' ? 'Active' : job.status === 'EXPIRED' ? 'Expired' : 'Inactive';
        if (statusLabel !== filters.status) return false;
      }

      if (filters.search) {
        const haystack = [job.title, job.department, job.location, job.description, ...(job.skillsRequired || [])]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(filters.search)) return false;
      }

      return true;
    });

    currentPage = 1;
    renderTable();
  }

  function renderTable() {
    setTableLoading(false);

    const totalEntries = filteredJobs.length;
    const totalPages = Math.max(1, Math.ceil(totalEntries / pageSize));
    currentPage = Math.min(currentPage, totalPages);

    const start = (currentPage - 1) * pageSize;
    const pageItems = filteredJobs.slice(start, start + pageSize);

    els.emptyState.hidden = totalEntries !== 0;
    els.tbody.innerHTML = pageItems.map(rowTemplate).join('');

    bindRowActions();

    const shownCount = pageItems.length;
    els.entriesInfo.textContent =
      totalEntries === 0
        ? 'Showing 0 of 0 entries'
        : `Showing ${start + 1}-${start + shownCount} of ${totalEntries} entries`;

    renderPagination(totalPages);
  }

  function rowTemplate(job, idx) {
    const active = job.status === 'ACTIVE';
    const statusLabel = job.status === 'ACTIVE' ? 'Active' : job.status === 'EXPIRED' ? 'Expired' : 'Inactive';
    const salary = formatSalary(job.minSalary, job.maxSalary);
    const avatarColor = AVATAR_COLORS[(allJobs.indexOf(job) >= 0 ? allJobs.indexOf(job) : idx) % AVATAR_COLORS.length];
    const initials = getInitials(job.title);
    const tags = (job.skillsRequired || []).slice(0, 4);
    const extraTags = (job.skillsRequired || []).length - tags.length;

    return `
      <tr data-job-id="${job.id}">
        <td class="col-job">
          <div class="job-cell">
            <div class="job-avatar" style="background:${avatarColor}">${initials}</div>
            <div class="job-cell-text">
              <p class="job-title">${escapeHtml(job.title)}
               ${scheduledJobIds.has(String(job.id))
              ? `<span class="mj-badge-scheduled" title="Aptitude test scheduled">✅ Schedule Added</span>`
              : ''}
          </p>
          ${job.companyName ? `<span class="job-company">${escapeHtml(job.companyName)}</span>` : ''}
          <p class="job-desc">${escapeHtml(job.description || 'No description provided.')}</p>

              </p>
              ${job.companyName ? `<span class="job-company">${escapeHtml(job.companyName)}</span>` : ''}
              <p class="job-desc">${escapeHtml(job.description || 'No description provided.')}</p>
              <div class="job-tags">
                ${tags.map((s) => `<span class="job-tag">${escapeHtml(s)}</span>`).join('')}
                ${extraTags > 0 ? `<span class="job-tag">+${extraTags} more</span>` : ''}
              </div>
            </div>
          </div>
        </td>
        <td class="col-role" data-label="Role &amp; Employment">
          <p class="role-type">${escapeHtml(jobTypeLabel(job.jobType) || '—')}</p>
          <p class="role-emp">Experience: ${escapeHtml(job.experienceRequired || '—')}</p>
          <p class="role-pos">Position: ${job.numberOfOpenings ?? '—'} Opening${job.numberOfOpenings === 1 ? '' : 's'}</p>
        </td>
        <td class="col-location" data-label="Location &amp; Branch">
          <div class="loc-line">${ICONS.pin}<span>${escapeHtml(job.location || '—')}</span></div>
          <p class="loc-dept">${escapeHtml(job.department || '—')}</p>
        </td>
        <td class="col-salary">
          <p class="salary-amt">${salary}</p>
          <p class="salary-sub">Annual CTC</p>
          <span class="negotiable-pill">Negotiable</span>
        </td>
        <td class="col-posted">
          <div class="posted-date">${ICONS.calendar}<span>${formatDate(job.postedAt)}</span></div>
          <p class="posted-time">${formatTime(job.postedAt)}</p>
          <p class="closes-label">Closes on</p>
          <p class="closes-date">${formatDate(job.applicationDeadline)}</p>
        </td>
        <td class="col-apps" data-label="Applications">
  <a href="applications.html?jobId=${encodeURIComponent(job.id)}" class="apps-count-link">
    <p class="apps-count">${job.applicationsCount}</p>
    <p class="apps-label">Applications</p>
  </a>
  <button type="button" class="view-details" data-action="view">View Details</button>
</td>
        <td class="col-status" data-label="Status">
          <div class="status-cell">
            <button type="button" class="status-toggle ${active ? 'on' : ''}" data-action="toggle-status"
              title="${active ? 'Deactivate' : 'Activate'}" aria-label="Toggle job status"></button>
            <span class="status-label ${active ? 'active' : 'inactive'}">${statusLabel}</span>
          </div>
        </td>
        <td class="col-actions">
  <div class="action-links">
    <button type="button" class="action-link edit" data-action="edit">Edit</button>
    ${job.status === 'ACTIVE'
  ? `<button type="button" class="action-link schedule" data-action="schedule-aptitude"
        ${scheduledJobIds.has(String(job.id)) ? 'disabled title="Already scheduled"' : ''}>
       ${scheduledJobIds.has(String(job.id)) ? 'Aptitude ✓' : 'Schedule Aptitude'}
     </button>`
  : `<button type="button" class="action-link schedule" disabled
        title="Only Active jobs can be scheduled">Schedule Aptitude</button>`}
    
    <button type="button" class="action-link ${active ? 'deactivate' : 'activate'}" data-action="toggle-status">
      ${active ? 'Deactivate' : 'Activate'}
    </button>
    <button type="button" class="action-link delete" data-action="delete">Delete</button>
  </div>
</td>
      </tr>`;
  }

  function bindRowActions() {
    els.tbody.querySelectorAll('tr[data-job-id]').forEach((row) => {
      const id = row.getAttribute('data-job-id');
      const job = allJobs.find((j) => String(j.id) === String(id));
      if (!job) return;

      row.querySelectorAll('[data-action="view"]').forEach((btn) => btn.addEventListener('click', () => openViewModal(job)));
      row.querySelectorAll('[data-action="edit"]').forEach((btn) => btn.addEventListener('click', () => openEditModal(job)));
      row.querySelectorAll('[data-action="toggle-status"]').forEach((btn) => btn.addEventListener('click', () => toggleStatus(job)));
      row.querySelectorAll('[data-action="delete"]').forEach((btn) => btn.addEventListener('click', () => confirmDelete(job)));
      //row.querySelectorAll('[data-action="schedule-aptitude"]').forEach(btn => btn.addEventListener('click', () => openAptitudeModal(job)));
      row.querySelectorAll('[data-action="schedule-aptitude"]').forEach(btn =>
  btn.addEventListener('click', () => {
    AptitudeSchedule.open(job, () => {
      scheduledJobIds.add(String(job.id));
      renderAptitudeReminder();
      applyFilters();
    });
  })
);
    });
  }

//   function injectAptitudeModal() {
//   const wrapper = document.createElement('div');
//   wrapper.innerHTML = `
//     <div class="mj-modal-overlay" id="mj-apt-modal" hidden>
//       <div class="mj-modal mj-modal-wide">
//         <button type="button" class="mj-modal-close" data-close-modal>&times;</button>
//         <h5>Schedule Aptitude Test</h5>
//         <form id="mj-apt-form">
//           <p class="mj-view-meta" id="mj-apt-job-label"></p>

//           <div class="apt-grid-2">
//             <div class="jc-field">
//               <label>Test Date *</label>
//               <input type="date" name="testDate" required>
//             </div>
//             <div class="jc-field">
//               <label>Start Time *</label>
//               <input type="time" name="startTime" required>
//             </div>
//           </div>

//           <div class="apt-grid-2">
//             <div class="jc-field">
//               <label>Duration (minutes) *</label>
//               <input type="number" name="durationMinutes" min="10" max="300" value="60" required>
//             </div>
//             <div class="jc-field">
//               <label>Mode </label>
//               <select name="mode" id="aptModeSelect" class="browser-default" required>
//               <option value="ONLINE" selected>Online</option>
//               <option value="OFFLINE">Offline / On-campus</option>
//             </select>
//             </div>
//           </div>

//           <div class="jc-field">
//             <label id="mj-apt-loc-label">Meeting Link / Venue *</label>
//             <input type="text" name="locationOrLink" required
//                    placeholder="https://meet.google.com/... or Room 302, Block A">
//           </div>

//           <div class="apt-grid-3">
//             <div class="jc-field">
//               <label>Total Questions</label>
//               <input type="number" name="totalQuestions" min="1" placeholder="30">
//             </div>
//             <div class="jc-field">
//               <label>Total Marks</label>
//               <input type="number" name="totalMarks" min="1" placeholder="100">
//             </div>
//             <div class="jc-field">
//               <label>Passing Marks</label>
//               <input type="number" name="passingMarks" min="1" placeholder="40">
//             </div>
//           </div>

//           <div class="jc-field">
//             <label>Instructions for candidates</label>
//             <textarea name="instructions" rows="3"
//                       placeholder="e.g. Sections: Aptitude, Reasoning, Coding. No calculators allowed."></textarea>
//           </div>

//           <div class="mj-modal-actions">
//             <button type="button" class="action-chip ghost" data-close-modal>Cancel</button>
//             <button type="submit" class="btn waves-effect waves-light" id="mj-apt-submit">
//               Save Schedule
//             </button>
//           </div>
//         </form>
//       </div>
//     </div>`
//     // Initialize Materialize's custom select widget for our dynamically-injected select
// if (window.M && typeof M.FormSelect === 'function') {
//   const el = document.getElementById('aptModeSelect');
//   if (el) M.FormSelect.init(el);
// };
//   document.body.appendChild(wrapper);

//   // Wire close buttons for THIS modal
//   wrapper.querySelectorAll('[data-close-modal]').forEach(btn =>
//     btn.addEventListener('click', () => hideModal(btn.closest('.mj-modal-overlay')))
//   );
//   wrapper.querySelector('.mj-modal-overlay').addEventListener('click', (e) => {
//     if (e.target.classList.contains('mj-modal-overlay')) hideModal(e.target);
//   });

//   // Submit handler
//   document.getElementById('mj-apt-form').addEventListener('submit', submitAptitudeForm);

//   // Swap label when mode changes
//   const form = document.getElementById('mj-apt-form');
//   form.elements['mode'].addEventListener('change', () => {
//     const label = document.getElementById('mj-apt-loc-label');
//     const input = form.elements['locationOrLink'];
//     if (form.elements['mode'].value === 'ONLINE') {
//       label.textContent = 'Meeting Link *';
//       input.placeholder  = 'https://meet.google.com/...';
//     } else {
//       label.textContent = 'Venue *';
//       input.placeholder  = 'Room 302, Block A, Main Campus';
//     }
//   });
// }

// let currentAptJob = null;

// function openAptitudeModal(job) {
//   currentAptJob = job;
//   const modal = document.getElementById('mj-apt-modal');
//   const form  = document.getElementById('mj-apt-form');

//   form.reset();
//   document.getElementById('mj-apt-job-label').textContent =
//     `${job.title} · ${job.department || '—'} · Deadline ${formatDate(job.applicationDeadline)}`;

//   // Pre-fill sensible defaults
//   const nextWeek = new Date();
//   nextWeek.setDate(nextWeek.getDate() + 7);
//   form.elements['testDate'].value       = nextWeek.toISOString().slice(0, 10);
//   form.elements['startTime'].value      = '10:00';
//   form.elements['durationMinutes'].value = 60;
//   form.elements['mode'].value            = 'ONLINE';

//   // If already scheduled, load & prefill
//   fetch(`${APT_API}/job/${job.id}`, { credentials: 'include' })
//     .then(r => r.ok ? r.json() : null)
//     .then(existing => {
//       if (!existing) return;
//       form.elements['testDate'].value        = existing.testDate || '';
//       form.elements['startTime'].value       = existing.startTime || '';
//       form.elements['durationMinutes'].value = existing.durationMinutes || 60;
//       form.elements['mode'].value            = existing.mode || 'ONLINE';
//       form.elements['locationOrLink'].value  = existing.locationOrLink || '';
//       form.elements['totalQuestions'].value  = existing.totalQuestions ?? '';
//       form.elements['totalMarks'].value      = existing.totalMarks ?? '';
//       form.elements['passingMarks'].value    = existing.passingMarks ?? '';
//       form.elements['instructions'].value    = existing.instructions || '';
//     })
//     .catch(() => {});

//   showModal(modal);
// }

// async function submitAptitudeForm(e) {
//   e.preventDefault();
//   if (!currentAptJob) return;

//   const form = e.target;
//   const submitBtn = document.getElementById('mj-apt-submit');

//   const payload = {
//     jobId:           currentAptJob.id,
//     companyId:       currentAptJob.companyId,
//     testDate:        form.elements['testDate'].value,
//     startTime:       form.elements['startTime'].value + ':00',  // add seconds
//     durationMinutes: Number(form.elements['durationMinutes'].value),
//     mode:            form.elements['mode'].value,
//     locationOrLink:  form.elements['locationOrLink'].value.trim(),
//     totalQuestions:  form.elements['totalQuestions'].value ? Number(form.elements['totalQuestions'].value) : null,
//     totalMarks:      form.elements['totalMarks'].value ? Number(form.elements['totalMarks'].value) : null,
//     passingMarks:    form.elements['passingMarks'].value ? Number(form.elements['passingMarks'].value) : null,
//     instructions:    form.elements['instructions'].value.trim()
//   };

//   submitBtn.disabled = true;
//   submitBtn.textContent = 'Saving…';

//   try {
//     const res = await fetch(`${APT_API}/schedule`, {
//       method: 'POST',
//       credentials: 'include',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify(payload)
//     });

//     if (!res.ok) {
//       const msg = await safeText(res);
//       throw new Error(msg || `Scheduling failed (${res.status})`);
//     }

//     // Mark as scheduled locally
//     scheduledJobIds.add(String(currentAptJob.id));

//     hideModal(document.getElementById('mj-apt-modal'));
//     showToast('Aptitude test scheduled successfully.');
//     renderAptitudeReminder();
//     applyFilters(); // refresh row actions (disables "Schedule Aptitude")
//   } catch (err) {
//     console.error(err);
//     showToast(err.message || 'Could not save the schedule.');
//   } finally {
//     submitBtn.disabled = false;
//     submitBtn.textContent = 'Save Schedule';
//   }
// }
  function renderPagination(totalPages) {
    if (totalPages <= 1) {
      els.pagination.innerHTML = '';
      return;
    }
    let html = `<button type="button" class="page-btn" data-page="${currentPage - 1}" ${
      currentPage === 1 ? 'disabled' : ''
    }>&laquo;</button>`;

    for (let p = 1; p <= totalPages; p++) {
      html += `<button type="button" class="page-btn ${p === currentPage ? 'is-active' : ''}" data-page="${p}">${p}</button>`;
    }

    html += `<button type="button" class="page-btn" data-page="${currentPage + 1}" ${
      currentPage === totalPages ? 'disabled' : ''
    }>&raquo;</button>`;

    els.pagination.innerHTML = html;

    els.pagination.querySelectorAll('.page-btn[data-page]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = parseInt(btn.getAttribute('data-page'), 10);
        if (p >= 1 && p <= totalPages) {
          currentPage = p;
          renderTable();
        }
      });
    });
  }

  function setTableLoading(isLoading) {
    if (!els.tbody) return;
    if (isLoading) {
      els.tbody.innerHTML = `<tr><td colspan="8" class="mj-loading-row">Loading job postings…</td></tr>`;
      els.emptyState.hidden = true;
    }
  }

  /* ============================================================
     ROW ACTIONS: view / edit / activate-deactivate / delete
     ============================================================ */

  function openViewModal(job) {
    const modal = document.getElementById('mj-view-modal');
    const body = document.getElementById('mj-view-body');

    body.innerHTML = `
      <h5>${escapeHtml(job.title)}</h5>
      <p class="mj-view-meta">${escapeHtml(jobTypeLabel(job.jobType) || '—')} · ${escapeHtml(
      job.location || '—'
    )} · ${escapeHtml(job.department || '—')}</p>
      <p class="mj-view-desc">${escapeHtml(job.description || 'No description provided.')}</p>
      <div class="mj-view-tags">
        ${(job.skillsRequired || []).map((s) => `<span class="mj-tag">${escapeHtml(s)}</span>`).join('')}
      </div>
      <table class="mj-view-table">
        <tr><td>Experience</td><td>${escapeHtml(job.experienceRequired || '—')}</td></tr>
        <tr><td>Qualification</td><td>${escapeHtml(job.qualification || '—')}</td></tr>
        <tr><td>Openings</td><td>${job.numberOfOpenings ?? '—'}</td></tr>
        <tr><td>Salary</td><td>${formatSalary(job.minSalary, job.maxSalary)}</td></tr>
        <tr><td>Deadline</td><td>${formatDate(job.applicationDeadline)}</td></tr>
        <tr><td>Posted On</td><td>${formatDate(job.postedAt)}</td></tr>
        <tr><td>Status</td><td>${job.status}</td></tr>
      </table>`;

    showModal(modal);
  }

  function openEditModal(job) {
    const modal = document.getElementById('mj-edit-modal');
    const form = document.getElementById('mj-edit-form');

    form.elements['title'].value = job.title || '';
    form.elements['experienceRequired'].value = job.experienceRequired || '';
    form.elements['department'].value = job.department || '';
    form.elements['location'].value = job.location || '';
    form.elements['jobType'].value = job.jobType || '';
    form.elements['description'].value = job.description || '';
    form.elements['qualification'].value = job.qualification || '';
    form.elements['minSalary'].value = job.minSalary ?? '';
    form.elements['maxSalary'].value = job.maxSalary ?? '';
    form.elements['numberOfOpenings'].value = job.numberOfOpenings ?? '';
    form.elements['applicationDeadline'].value = toDateInputValue(job.applicationDeadline);

    renderEditSkillTags(job.skillsRequired || []);
    form.dataset.jobId = job.id;

    showModal(modal);
  }

  let currentEditSkills = [];

  function renderEditSkillTags(skills) {
    currentEditSkills = [...skills];
    const box = document.getElementById('mj-edit-skill-tags');
    box.innerHTML = currentEditSkills
      .map(
        (s, i) =>
          `<span class="jc-tag">${escapeHtml(s)}<button type="button" data-remove-skill="${i}">&times;</button></span>`
      )
      .join('');
    box.querySelectorAll('[data-remove-skill]').forEach((btn) => {
      btn.addEventListener('click', () => {
        currentEditSkills.splice(parseInt(btn.getAttribute('data-remove-skill'), 10), 1);
        renderEditSkillTags(currentEditSkills);
      });
    });
  }

  function bindEditSkillInput() {
    const input = document.getElementById('mj-edit-skill-input');
    if (!input) return;
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const val = input.value.trim().replace(/,$/, '');
        if (val && !currentEditSkills.includes(val)) {
          currentEditSkills.push(val);
          renderEditSkillTags(currentEditSkills);
        }
        input.value = '';
      }
    });
  }

  async function submitEditForm(e) {
    e.preventDefault();
    const form = e.target;
    const id = form.dataset.jobId;
    const submitBtn = form.querySelector('button[type="submit"]');

    // Matches JobPostingRequest exactly (skillsRequired, not skills; no "role" field exists).
    const payload = {
      title: form.elements['title'].value.trim(),
      description: form.elements['description'].value.trim(),
      department: form.elements['department'].value.trim(),
      location: form.elements['location'].value.trim(),
      jobType: form.elements['jobType'].value,
      experienceRequired: form.elements['experienceRequired'].value.trim(),
      skillsRequired: currentEditSkills,
      qualification: form.elements['qualification'].value.trim(),
      minSalary: form.elements['minSalary'].value ? Number(form.elements['minSalary'].value) : null,
      maxSalary: form.elements['maxSalary'].value ? Number(form.elements['maxSalary'].value) : null,
      numberOfOpenings: Number(form.elements['numberOfOpenings'].value || 0),
      applicationDeadline: form.elements['applicationDeadline'].value || null
    };

    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving…';

    try {
      const res = await fetch(`${JOBS_API}/${id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const msg = await safeText(res);
        throw new Error(msg || `Update failed (${res.status})`);
      }

      const updated = normalizeJob(await res.json());
      allJobs = allJobs.map((j) => (String(j.id) === String(id) ? updated : j));

      hideModal(document.getElementById('mj-edit-modal'));
      showToast('Job updated successfully.');
      renderStatCards();
      applyFilters();
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Could not update job.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save Changes';
    }
  }

  async function toggleStatus(job) {
    const activating = job.status !== 'ACTIVE';
    const endpoint = activating ? 'activate' : 'deactivate';

    try {
      const res = await fetch(`${JOBS_API}/${job.id}/${endpoint}`, {
        method: 'PUT',
        credentials: 'include'
      });
      if (!res.ok) {
        const msg = await safeText(res);
        throw new Error(msg || `Could not ${endpoint} job.`);
      }

      job.status = activating ? 'ACTIVE' : 'CLOSED';
      showToast(`Job ${activating ? 'activated' : 'deactivated'}.`);
      renderStatCards();
      applyFilters();
    } catch (err) {
      console.error(err);
      showToast(err.message);
    }
  }

  function confirmDelete(job) {
    const modal = document.getElementById('mj-confirm-modal');
    document.getElementById('mj-confirm-text').textContent = `Delete "${job.title}"? This can't be undone.`;

    const confirmBtn = document.getElementById('mj-confirm-delete-btn');
    const newBtn = confirmBtn.cloneNode(true); // strip old listeners
    confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);

    newBtn.addEventListener('click', async () => {
      newBtn.disabled = true;
      try {
        const res = await fetch(`${JOBS_API}/${job.id}`, { method: 'DELETE', credentials: 'include' });
        if (!res.ok) {
          const msg = await safeText(res);
          throw new Error(msg || 'Could not delete job.');
        }
        allJobs = allJobs.filter((j) => String(j.id) !== String(job.id));
        hideModal(modal);
        showToast('Job deleted.');
        renderStatCards();
        applyFilters();
      } catch (err) {
        console.error(err);
        showToast(err.message);
      } finally {
        newBtn.disabled = false;
      }
    });

    showModal(modal);
  }

  /* ============================================================
     MODAL PLUMBING (self-contained — no HTML edits needed)
     ============================================================ */

  function injectModalMarkup() {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="mj-modal-overlay" id="mj-view-modal" hidden>
        <div class="mj-modal">
          <button type="button" class="mj-modal-close" data-close-modal>&times;</button>
          <div id="mj-view-body"></div>
        </div>
      </div>

      <div class="mj-modal-overlay" id="mj-edit-modal" hidden>
        <div class="mj-modal mj-modal-wide">
          <button type="button" class="mj-modal-close" data-close-modal>&times;</button>
          <h5>Edit Job Posting</h5>
          <form id="mj-edit-form">
            <div class="jc-grid-2">
              <div class="jc-field"><label>Title</label><input name="title" required maxlength="150"></div>
              <div class="jc-field"><label>Department</label><input name="department"></div>
            </div>
            <div class="jc-grid-2">
              <div class="jc-field"><label>Location</label><input name="location" required></div>
              <div class="jc-field">
                <label>Job Type</label>
                <select name="jobType" required>
                  <option value="FULL_TIME">Full Time</option>
                  <option value="PART_TIME">Part Time</option>
                  <option value="INTERNSHIP">Internship</option>
                  <option value="CONTRACT">Contract</option>
                  <option value="REMOTE">Remote</option>
                </select>
              </div>
            </div>
            <div class="jc-grid-2">
              <div class="jc-field"><label>Experience Required</label><input name="experienceRequired" placeholder="e.g. 0-1 years"></div>
              <div class="jc-field">
  <label>Qualification</label>
  <select name="qualification" id="mj-edit-qualification" class="browser-default">
    <option value="">Select qualification(s)</option>
    <option value="BCA">BCA</option>
    <option value="BBA">BBA</option>
    <option value="B.Com">B.Com</option>
    <option value="B.Sc">B.Sc</option>
    <option value="MCA">MCA</option>
    <option value="MBA">MBA</option>
    <option value="B.Tech">B.Tech</option>
    <option value="M.Tech">M.Tech</option>
    <option value="Computer Engineering">Computer Engineering</option>
    <option value="Information Technology">Information Technology</option>
    <option value="Civil Engineering">Civil Engineering</option>
    <option value="Mechanical Engineering">Mechanical Engineering</option>
    <option value="Electronics & Telecommunication">Electronics & Telecommunication</option>
    <option value="Electrical Engineering">Electrical Engineering</option>
    <option value="Artificial Intelligence & Data Science">Artificial Intelligence & Data Science</option>
    <option value="Computer Science">Computer Science</option>
    <option value="Any">Any / Open to All</option>
  </select>
</div>
            </div>
            <div class="jc-field"><label>Description</label><textarea name="description" rows="4"></textarea></div>
            <div class="jc-field">
              <label>Skills</label>
              <div class="jc-tag-box">
                <div class="jc-tags" id="mj-edit-skill-tags"></div>
                <input type="text" id="mj-edit-skill-input" placeholder="Type a skill and hit Enter…">
              </div>
            </div>
            <div class="jc-grid-3">
              <div class="jc-field"><label>Min Salary (LPA)</label><input type="number" step="0.1" name="minSalary"></div>
              <div class="jc-field"><label>Max Salary (LPA)</label><input type="number" step="0.1" name="maxSalary"></div>
              <div class="jc-field"><label>Openings</label><input type="number" min="1" name="numberOfOpenings" required></div>
            </div>
            <div class="jc-field jc-field-narrow"><label>Deadline</label><input type="date" name="applicationDeadline" required></div>
            <div class="mj-modal-actions">
              <button type="button" class="action-chip ghost" data-close-modal>Cancel</button>
              <button type="submit" class="btn waves-effect waves-light">Save Changes</button>
            </div>
          </form>
        </div>
      </div>

      <div class="mj-modal-overlay" id="mj-confirm-modal" hidden>
        <div class="mj-modal mj-modal-narrow">
          <p id="mj-confirm-text"></p>
          <div class="mj-modal-actions">
            <button type="button" class="action-chip ghost" data-close-modal>Cancel</button>
            <button type="button" class="btn red" id="mj-confirm-delete-btn">Delete</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(wrapper);

    document.querySelectorAll('[data-close-modal]').forEach((btn) => {
      btn.addEventListener('click', () => hideModal(btn.closest('.mj-modal-overlay')));
    });
    document.querySelectorAll('.mj-modal-overlay').forEach((overlay) => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) hideModal(overlay);
      });
    });

    document.getElementById('mj-edit-form').addEventListener('submit', submitEditForm);
    bindEditSkillInput();
  }

  function showModal(modal) {
    modal.hidden = false;
    modal.style.display = 'flex';
    requestAnimationFrame(() => modal.classList.add('is-open'));
  }
  function hideModal(modal) {
    modal.classList.remove('is-open');
    setTimeout(() => {
      modal.style.display = 'none';
      modal.hidden = true;
    }, 150);
  }

  /* ============================================================
     UTILITIES
     ============================================================ */

  function jobTypeLabel(type) {
    const map = {
      FULL_TIME: 'Full Time',
      PART_TIME: 'Part Time',
      INTERNSHIP: 'Internship',
      CONTRACT: 'Contract',
      REMOTE: 'Remote'
    };
    return map[type] || type || '';
  }

  function formatSalary(min, max) {
    if (min == null && max == null) return 'Not disclosed';
    if (min != null && max != null) return `₹${min} - ₹${max} LPA`;
    return `₹${min ?? max} LPA`;
  }

  function formatDate(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function formatTime(value) {
    if (!value) return '';
    const d = new Date(value);
    if (isNaN(d)) return '';
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }

  function toDateInputValue(value) {
    if (!value) return '';
    const d = new Date(value);
    if (isNaN(d)) return '';
    return d.toISOString().slice(0, 10);
  }

  function getInitials(title) {
    if (!title) return '?';
    const words = title.trim().split(/\s+/).filter(Boolean);
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  }

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));
  }

  async function safeText(res) {
    try {
      return await res.text();
    } catch {
      return '';
    }
  }

  function showToast(msg) {
    if (window.showToast && typeof window.showToast === 'function') {
      window.showToast(msg);
      return;
    }
    if (!els.toast) return alert(msg);
    els.toast.textContent = msg;
    els.toast.classList.add('is-visible');
    setTimeout(() => els.toast.classList.remove('is-visible'), 2500);
  }

  /* ---- minimal extra styles for loading row + modals only.
     Everything table/stat-card/status/action related now comes from
     manage-jobs-style.css, so it isn't duplicated here anymore. ---- */
  function injectDynamicStyles() {
    if (document.getElementById('mj-dynamic-styles')) return;
    const style = document.createElement('style');
    style.id = 'mj-dynamic-styles';
    style.textContent = `
      .mj-loading-row{text-align:center;padding:24px;color:#6b7f92;font-size:14px;}
      .mj-modal-overlay{position:fixed;inset:0;background:rgba(15,30,40,.45);align-items:center;justify-content:center;opacity:0;transition:opacity .15s;z-index:1000;display:none;}
      .mj-modal-overlay.is-open{opacity:1;}
      .mj-modal{background:#fff;border-radius:14px;padding:24px;max-width:480px;width:92%;max-height:85vh;overflow-y:auto;position:relative;}
      .mj-modal-wide{max-width:720px;}
      .mj-modal-narrow{max-width:380px;}
      .mj-modal-close{position:absolute;top:12px;right:14px;border:none;background:none;font-size:22px;cursor:pointer;color:#6b7f92;}
      .mj-modal-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:16px;}
      .mj-view-meta{color:#6b7f92;font-size:13px;margin:4px 0 12px;}
      .mj-view-desc{font-size:14px;line-height:1.5;margin-bottom:12px;}
      .mj-view-tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;}
      .mj-tag{background:#e6f7f8;color:#0E9AA3;font-size:12px;padding:3px 10px;border-radius:999px;}
      .mj-view-table{width:100%;font-size:13px;border-collapse:collapse;}
      .mj-view-table td{padding:6px 0;border-top:1px solid #eef2f5;}
      .mj-view-table td:first-child{color:#6b7f92;width:40%;}
      .jc-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;}
      .jc-grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px;}
      .jc-field{display:flex;flex-direction:column;gap:5px;margin-bottom:12px;}
      .jc-field label{font-size:12px;font-weight:600;color:#6b7f92;}
      .jc-field input, .jc-field select, .jc-field textarea{border:1px solid #e7ebf0;border-radius:8px;padding:8px 10px;font-size:13px;font-family:inherit;}
      .jc-field-narrow{max-width:220px;}
      .jc-tag-box{border:1px solid #e7ebf0;border-radius:8px;padding:8px;}
      .jc-tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;}
      .jc-tag{background:#f1f4f7;color:#6b7a87;font-size:12px;padding:3px 8px;border-radius:6px;display:inline-flex;align-items:center;gap:6px;}
      .jc-tag button{border:none;background:none;cursor:pointer;color:#6b7a87;font-size:14px;line-height:1;}
      #mj-edit-skill-input{border:none;outline:none;font-size:13px;width:100%;padding:4px 2px;}
      .action-chip.ghost{background:none;border:1px solid #e7ebf0;padding:9px 16px;border-radius:8px;cursor:pointer;font-size:13px;}
      .apps-count-link{text-decoration:none;color:inherit;display:inline-block;}
      .apps-count-link:hover .apps-count{color:#0E9AA3;}
      `;
    document.head.appendChild(style);
  }
})();