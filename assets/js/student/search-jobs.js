/* =====================================================================
   search-jobs.js
   Fetches real job postings from the backend and renders them into the
   existing static markup structure (same CSS classes, dynamic content).
   ===================================================================== */
   (function attachBasicAuth() {
    const origFetch = window.fetch;
    window.fetch = function (input, init = {}) {
        const basic = sessionStorage.getItem('authBasic');
        if (basic) {
            init.headers = {
                ...(init.headers || {}),
                'Authorization': `Basic ${basic}`
            };
        }
        init.credentials = init.credentials || 'include';
        return origFetch(input, init);
    };
})();
(function () {
    'use strict';

    const JOB_API_BASE = "http://127.0.0.1:8080/api/jobs";
    const COMPANY_API_BASE = "http://127.0.0.1:8080/api/companies";
    const APPLY_API        = "http://127.0.0.1:8080/api/applications"; 
    const JOB_ICON = 'bi-briefcase-fill';
    const JOB_ICON_BG_CLASSES = ['icon-blue-bg', 'icon-purple-bg', 'icon-orange-bg'];

    const CLOSING_SOON_DAYS = 3;   // show "Closing Soon" badge if ≤ 3 days left

    /* ============================================================
   Branch options — keep in sync with the signup form
   ============================================================ */
const BRANCH_OPTIONS = [
  'BCA',
  'BBA',
  'B.Com',
  'B.Sc',
  'Civil Engineering',
  'Mechanical Engineering',
  'Computer Engineering',
  'Information Technology',
  'Electronics & Telecommunication',
  'Electrical Engineering',
  'Artificial Intelligence & Data Science',
  'Computer Science',
  'MCA',
  'MBA'
];
/* ============================================================
   Branch aliases — how each branch might appear in a job's
   `qualification` field. Keys = values in BRANCH_OPTIONS.
   ============================================================ */
const BRANCH_ALIASES = {
  'BCA':                                   ['bca', 'bachelor of computer applications'],
  'BBA':                                   ['bba', 'bachelor of business administration'],
  'B.Com':                                 ['b.com', 'bcom', 'bachelor of commerce'],
  'B.Sc':                                  ['b.sc', 'bsc', 'bachelor of science'],
  'Civil Engineering':                     ['civil', 'civil engineering'],
  'Mechanical Engineering':                ['mechanical', 'mechanical engineering'],
  'Computer Engineering':                  ['computer engineering', 'computer science engineering', 'cse', 'b.tech cse'],
  'Information Technology':                ['information technology', 'it ', ' b.tech it'],
  'Electronics & Telecommunication':       ['electronics', 'telecommunication', 'e&tc', 'extc', 'entc'],
  'Electrical Engineering':                ['electrical', 'electrical engineering'],
  'Artificial Intelligence & Data Science':['artificial intelligence', 'ai & ds', 'ai and ds', 'aids', 'ai-ds'],
  'Computer Science':                      ['computer science', 'cs ', 'b.sc cs', 'bsc cs'],
  'MCA':                                   ['mca', 'master of computer applications'],
  'MBA':                                   ['mba', 'master of business administration', 'pgdm'],
  // Generic engineering fallback — company says "B.Tech" without specifying stream
  'Engineering':                           ['b.tech', 'btech', 'b.e', 'be ', 'bachelor of engineering', 'bachelor of technology']
};
    let ALL_JOBS = [];
    let ACTIVE_TAB = 'all';
    let VISIBLE_COUNT = 5;
    const PAGE_SIZE = 5;

   let filterState = {
    keyword: '',
    jobTypes: [],
    location: '',
    locationTypes: [],
    experience: [],
    branches: []           // ← NEW
};

    /* ---------------------------- Boot ---------------------------- */
    // function initSearchJobsPage() {
    //      if (document.body.dataset.page !== 'search-jobs') return;
    //     const container = document.querySelector('.job-list-col');
    //     if (!container) return;

    //     initProfileProgressWidget(); 
    //     showLoadingState();
    //     fetchJobs();
    //     wireTabClicks();
    //     wireFilterControls();
    //     wireSort();
    //     wireLoadMore();
    // }
    async function initSearchJobsPage() {
  if (document.body.dataset.page !== 'search-jobs') return;
  const container = document.querySelector('.job-list-col');
  if (!container) return;

  // ---- Load applied jobIds first so cards can render correctly on the first paint ----
  try {
    if (window.MyApplicationsStore) {
      await window.MyApplicationsStore.fetchAppliedJobIds();
    }
  } catch (_) {}

  initProfileProgressWidget();
  showLoadingState();
  fetchJobs();
  wireTabClicks();
  wireFilterControls();
  wireSort();
  wireLoadMore();
  renderBranchFilter();  
}

    /* ---------------------------- Loading state ---------------------------- */
    function showLoadingState() {
        const listCol = document.querySelector('.job-list-col');
        if (!listCol) return;

        listCol.querySelectorAll('.job-listing, .loading-skeleton, .empty-state').forEach(el => el.remove());

        const toolbar = listCol.querySelector('.list-toolbar');
        const skeletonHtml = Array.from({ length: 3 }).map(() => `
            <div class="loading-skeleton">
                <div class="skeleton-logo"></div>
                <div class="skeleton-body">
                    <div class="skeleton-line w-60"></div>
                    <div class="skeleton-line w-40"></div>
                    <div class="skeleton-line w-80"></div>
                </div>
            </div>
        `).join('');

        if (toolbar) {
            toolbar.insertAdjacentHTML('afterend', skeletonHtml);
        }
    }

    function hideLoadingState() {
        document.querySelectorAll('.loading-skeleton').forEach(el => el.remove());
    }

    function renderBranchFilter() {
    const list = document.getElementById('branchFilterList');
    if (!list) return;

    list.innerHTML = BRANCH_OPTIONS.map(b => `
        <div class="filter-check" data-branch="${escapeAttr(b)}">
            <label>
                <input type="checkbox" class="branch-cb" value="${escapeAttr(b)}">
                <span>${escapeHtml(b)}</span>
            </label>
        </div>
    `).join('');

    // Live filter for the "Search branch..." input
    const searchInput = document.getElementById('branchSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const q = e.target.value.trim().toLowerCase();
            let visible = 0;
            list.querySelectorAll('.filter-check').forEach(row => {
                const name = row.dataset.branch.toLowerCase();
                const match = !q || name.includes(q);
                row.style.display = match ? '' : 'none';
                if (match) visible++;
            });

            // Show "no match" message if nothing
            const existing = list.querySelector('.no-match');
            if (existing) existing.remove();
            if (visible === 0) {
                const msg = document.createElement('div');
                msg.className = 'no-match';
                msg.textContent = 'No matching branch';
                list.appendChild(msg);
            }
        });
    }

    // Branch checkbox → live filter
    list.querySelectorAll('.branch-cb').forEach(cb => {
        cb.addEventListener('change', () => {
            filterState.branches = Array.from(
                list.querySelectorAll('.branch-cb:checked')
            ).map(x => x.value);
            VISIBLE_COUNT = PAGE_SIZE;
            applyFiltersAndRender();
        });
    });
}
    /* ---------------------------- Fetch ---------------------------- */
    async function fetchJobs() {
        const listCol = document.querySelector('.job-list-col');
        try {
            const res = await fetch(`${JOB_API_BASE}/active`, { credentials: 'include' });
            if (!res.ok) throw new Error('Failed to load jobs');
            const jobs = await res.json();

            // Map + filter out expired jobs
            const now = Date.now();
            ALL_JOBS = jobs
                .map(normalizeJob)
                .filter(isJobStillOpen(now));

            hideLoadingState();
            applyFiltersAndRender();
            updateTabCounts();
            updateFilterCounts();
        } catch (err) {
            console.error('Job fetch error:', err);
            hideLoadingState();
            if (listCol) {
                renderEmptyState(listCol, {
                    icon: 'bi-wifi-off',
                    title: 'Could not load jobs',
                    message: 'Please check your connection and try again.',
                    actionLabel: 'Retry',
                    onAction: () => {
                        showLoadingState();
                        fetchJobs();
                    }
                });
            }
        }
    }

    /* ---------------------------- Deadline helpers ---------------------------- */
    function isJobStillOpen(now = Date.now()) {
        return (job) => {
            // If no deadline is set, treat the job as always open
            if (!job.applicationDeadline) return true;
            const deadline = new Date(job.applicationDeadline).getTime();
            if (Number.isNaN(deadline)) return true; // malformed date → don't hide
            // Consider the deadline valid through the END of that calendar day
            const endOfDeadline = endOfDay(deadline);
            return endOfDeadline >= now;
        };
    }

    function endOfDay(ts) {
        const d = new Date(ts);
        d.setHours(23, 59, 59, 999);
        return d.getTime();
    }

    function daysLeft(deadlineStr) {
        if (!deadlineStr) return null;
        const deadline = new Date(deadlineStr).getTime();
        if (Number.isNaN(deadline)) return null;
        const diff = endOfDay(deadline) - Date.now();
        return Math.ceil(diff / 86400000); // 0 = today is last day
    }

    function deadlineBadge(job) {
        const left = daysLeft(job.applicationDeadline);
        if (left === null) return '';
        if (left < 0)  return ''; // shouldn't happen after filter, but safe
        if (left === 0) return `<span class="deadline-badge deadline-today"><i class="bi bi-fire"></i> Last day to apply</span>`;
        if (left === 1) return `<span class="deadline-badge deadline-urgent"><i class="bi bi-alarm"></i> 1 day left</span>`;
        if (left <= CLOSING_SOON_DAYS) return `<span class="deadline-badge deadline-soon"><i class="bi bi-hourglass-split"></i> ${left} days left</span>`;
        return `<span class="deadline-badge deadline-normal"><i class="bi bi-calendar-event"></i> Apply by ${formatShortDate(job.applicationDeadline)}</span>`;
    }

    /* ---------------------------- Normalize ---------------------------- */
   function normalizeJob(job) {
    const jobTypeMap = {
        FULL_TIME: 'Full Time',
        PART_TIME: 'Part Time',
        INTERNSHIP: 'Internship',
        CONTRACT: 'Contract',
        REMOTE: 'Remote'
    };

    return {
        id: job.id ?? job._id,
        companyId: job.companyId ?? '',
        title: job.title ?? 'Untitled Role',
        companyName: job.companyName ?? 'Unknown Company',
        location: job.location ?? '',
        jobType: jobTypeMap[job.jobType] ?? job.jobType ?? 'Full Time',
        workMode: job.jobType === 'REMOTE' ? 'Remote' : 'On-site',
        experienceLevel: job.experienceRequired ?? 'Fresher',
        description: job.description ?? '',
        skills: Array.isArray(job.skillsRequired) ? job.skillsRequired : [],
        postedAt: job.postedAt ?? null,
        updatedAt: job.updatedAt ?? null,
        department: job.department ?? '',
        // Normalize qualification: handle both "BCA,B.Tech" (string) and ["BCA", "B.Tech"] (array)
qualification: Array.isArray(job.qualification) 
    ? job.qualification.join(', ') 
    : (job.qualification || ''),   // ← this is what we match against
        minSalary: job.minSalary ?? null,
        maxSalary: job.maxSalary ?? null,
        minimumCgpa: job.minimumCgpa ?? null,
        numberOfOpenings: job.numberOfOpenings ?? null,
        applicationDeadline: job.applicationDeadline ?? null,
        status: job.status ?? 'ACTIVE'
    };
}

    /* ---------------------------- Tabs ---------------------------- */
    function wireTabClicks() {
        document.querySelectorAll('.tab-card').forEach(tab => {
            tab.addEventListener('click', function () {
                document.querySelectorAll('.tab-card').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                ACTIVE_TAB = tab.dataset.tab;
                VISIBLE_COUNT = PAGE_SIZE;
                applyFiltersAndRender();
            });
        });
    }

    function tabMatches(job) {
        switch (ACTIVE_TAB) {
            case 'fulltime': return job.jobType === 'Full Time';
            case 'internship': return job.jobType === 'Internship';
            case 'parttime': return job.jobType === 'Part Time';
            case 'remote': return job.workMode === 'Remote';
            default: return true;
        }
    }

    function updateTabCounts() {
        const counts = { all: ALL_JOBS.length, fulltime: 0, internship: 0, parttime: 0, remote: 0 };
        ALL_JOBS.forEach(j => {
            if (j.jobType === 'Full Time') counts.fulltime++;
            if (j.jobType === 'Internship') counts.internship++;
            if (j.jobType === 'Part Time') counts.parttime++;
            if (j.workMode === 'Remote') counts.remote++;
        });
        document.querySelectorAll('.tab-card').forEach(tab => {
            const small = tab.querySelector('small');
            if (small) small.textContent = counts[tab.dataset.tab] ?? 0;
        });
    }

    /* ---------------------------- Filters panel ---------------------------- */
    function wireFilterControls() {
    const keywordInput  = document.querySelector('.filter-search input[placeholder*="Job title"]');
    const locationInput = document.querySelector('.filter-search input[placeholder*="location"]');
    const applyBtn      = document.querySelector('.btn-apply-filters');
    const clearBtn      = document.getElementById('clearFilters');

    // ---- LIVE keyword search (fires on every keystroke) ----
    if (keywordInput) {
        let debounceTimer = null;
        keywordInput.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                filterState.keyword = e.target.value.trim().toLowerCase();
                VISIBLE_COUNT = PAGE_SIZE;
                applyFiltersAndRender();
            }, 180);   // ~180ms debounce — feels instant but avoids jank
        });
    }

    // ---- LIVE location search ----
    if (locationInput) {
        let debounceTimer = null;
        locationInput.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                filterState.location = e.target.value.trim().toLowerCase();
                VISIBLE_COUNT = PAGE_SIZE;
                applyFiltersAndRender();
            }, 180);
        });
    }

    // ---- Apply Filters button (still works for checkboxes) ----
    if (applyBtn) {
        applyBtn.addEventListener('click', function (e) {
            e.preventDefault();
            filterState.keyword    = keywordInput  ? keywordInput.value.trim().toLowerCase()  : '';
            filterState.location   = locationInput ? locationInput.value.trim().toLowerCase() : '';
            filterState.jobTypes   = getCheckedLabels('Job Type');
            filterState.locationTypes = getCheckedLabels('Location');
            filterState.experience = getCheckedLabels('Experience Level');
            // branches is already updated by the checkbox listener
            VISIBLE_COUNT = PAGE_SIZE;
            applyFiltersAndRender();
        });
    }

    // ---- Clear All ----
    if (clearBtn) {
        clearBtn.addEventListener('click', function (e) {
            e.preventDefault();
            document.querySelectorAll('.filter-check input[type="checkbox"]').forEach(cb => cb.checked = false);
            if (keywordInput)  keywordInput.value = '';
            if (locationInput) locationInput.value = '';
            const branchSearch = document.getElementById('branchSearchInput');
            if (branchSearch) {
                branchSearch.value = '';
                branchSearch.dispatchEvent(new Event('input'));
            }
            filterState = {
                keyword: '', jobTypes: [], location: '',
                locationTypes: [], experience: [], branches: []
            };
            VISIBLE_COUNT = PAGE_SIZE;
            applyFiltersAndRender();
        });
    }
}

    function getCheckedLabels(blockLabelText) {
        const blocks = Array.from(document.querySelectorAll('.filter-block'));
        const block = blocks.find(b => {
            const label = b.querySelector('.filter-label');
            return label && label.textContent.trim() === blockLabelText;
        });
        if (!block) return [];
        return Array.from(block.querySelectorAll('.filter-check input[type="checkbox"]:checked'))
            .map(cb => cb.closest('label').querySelector('span').textContent.trim());
    }

    function updateFilterCounts() {
        const jobTypeCounts = {}, locationCounts = {}, expCounts = {};
        ALL_JOBS.forEach(j => {
            jobTypeCounts[j.jobType] = (jobTypeCounts[j.jobType] || 0) + 1;
            locationCounts[j.workMode] = (locationCounts[j.workMode] || 0) + 1;
            expCounts[j.experienceLevel] = (expCounts[j.experienceLevel] || 0) + 1;
        });
        document.querySelectorAll('.filter-check').forEach(row => {
            const label = row.querySelector('label span');
            const countEl = row.querySelector('.filter-count');
            if (!label || !countEl) return;
            const text = label.textContent.trim();
            countEl.textContent = jobTypeCounts[text] ?? locationCounts[text] ?? expCounts[text] ?? 0;
        });
    }

   function filterMatches(job) {
    if (filterState.keyword) {
        const hay = `${job.title} ${job.companyName} ${job.skills.join(' ')} ${job.department || ''}`.toLowerCase();
        if (!hay.includes(filterState.keyword)) return false;
    }
    if (filterState.location && !job.location.toLowerCase().includes(filterState.location)) return false;
    if (filterState.jobTypes.length && !filterState.jobTypes.includes(job.jobType)) return false;
    if (filterState.locationTypes.length && !filterState.locationTypes.includes(job.workMode)) return false;
    if (filterState.experience.length && !filterState.experience.includes(job.experienceLevel)) return false;

    
    // ---- Branch filter (matches against company's qualification requirement) ----
// ---- Branch filter (with alias support) ----
if (filterState.branches.length) {
    const haystack = [
        job.qualification,
        job.department,
        job.title
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

    // No qualification declared → job is open to everyone
    if (!haystack.trim()) return true;

    const match = filterState.branches.some(branch => {
        const aliases = BRANCH_ALIASES[branch] || [branch.toLowerCase()];
        return aliases.some(a => haystack.includes(a));
    });

    if (!match) return false;
}

    return true;
}

    /* ---------------------------- Sort ---------------------------- */
    function wireSort() {
        const select = document.querySelector('.sort-select');
        if (!select) return;
        select.addEventListener('change', applyFiltersAndRender);
    }
    function sortJobs(jobs) {
        const mode = document.querySelector('.sort-select')?.value;
        if (mode === 'Newest First') {
            return [...jobs].sort((a, b) => new Date(b.postedAt || 0) - new Date(a.postedAt || 0));
        }
        if (mode === 'Salary: High to Low') {
            return [...jobs].sort((a, b) => (b.maxSalary || b.minSalary || 0) - (a.maxSalary || a.minSalary || 0));
        }
        // Default: Most Relevant → soonest deadline first (urgent jobs bubble up)
        return [...jobs].sort((a, b) => {
            const da = daysLeft(a.applicationDeadline);
            const db = daysLeft(b.applicationDeadline);
            if (da === null && db === null) return 0;
            if (da === null) return 1;
            if (db === null) return -1;
            return da - db;
        });
    }

    /* ---------------------------- Load more ---------------------------- */
    function wireLoadMore() {
        const btn = document.querySelector('.btn-load-more');
        if (!btn) return;
        btn.addEventListener('click', function () {
            VISIBLE_COUNT += PAGE_SIZE;
            applyFiltersAndRender();
        });
    }
    /**
 * Re-renders only the card for one job (fast path). Falls back to a full
 * re-render if the card isn't found in the DOM.
 */
function refreshJobCardFor(jobId) {
  const btn = document.querySelector(`.job-listing .btn-apply[data-job-id="${jobId}"]`);
  const card = btn ? btn.closest('.job-listing') : null;

  if (card) {
    const idx = Array.from(document.querySelectorAll('.job-listing')).indexOf(card);
    const job = ALL_JOBS.find(j => String(j.id) === String(jobId));
    if (job) {
      const fresh = buildJobCard(job, idx);
      card.replaceWith(fresh);
      return;
    }
  }
  // Fallback: full re-render
  applyFiltersAndRender();
}
    /* ---------------------------- Render ---------------------------- */
    function applyFiltersAndRender() {
        const filtered = sortJobs(ALL_JOBS.filter(tabMatches).filter(filterMatches));

        const countEl = document.querySelector('.result-count');
        if (countEl) {
            countEl.textContent = `${filtered.length} Job${filtered.length === 1 ? '' : 's'} found`;
        }

        const listCol = document.querySelector('.job-list-col');
        if (!listCol) return;

        listCol.querySelectorAll('.job-listing, .empty-state').forEach(el => el.remove());

        // Empty state
        if (filtered.length === 0) {
            renderEmptyState(listCol, {
                icon: 'bi-search',
                title: 'No matching jobs',
                message: 'Try changing your filters or keywords to see more openings.',
                actionLabel: 'Clear Filters',
                onAction: () => document.getElementById('clearFilters')?.click()
            });
            const loadMoreBtn0 = listCol.querySelector('.btn-load-more');
            if (loadMoreBtn0) loadMoreBtn0.style.display = 'none';
            return;
        }

        const toRender = filtered.slice(0, VISIBLE_COUNT);
        const toolbar = listCol.querySelector('.list-toolbar');
        let insertAfter = toolbar;

        toRender.forEach((job, i) => {
            const card = buildJobCard(job, i);
            insertAfter.insertAdjacentElement('afterend', card);
            insertAfter = card;
        });

        const loadMoreBtn = listCol.querySelector('.btn-load-more');
        if (loadMoreBtn) {
            if (VISIBLE_COUNT >= filtered.length) {
                loadMoreBtn.style.display = 'none';
            } else {
                loadMoreBtn.style.display = '';
                loadMoreBtn.innerHTML = `Load More Jobs (${filtered.length - VISIBLE_COUNT} remaining) <i class="bi bi-arrow-down"></i>`;
            }
        }
    }

    function renderEmptyState(listCol, { icon, title, message, actionLabel, onAction }) {
        const wrap = document.createElement('div');
        wrap.className = 'empty-state';
        wrap.innerHTML = `
            <div class="empty-icon"><i class="bi ${icon}"></i></div>
            <h5>${escapeHtml(title)}</h5>
            <p>${escapeHtml(message)}</p>
            ${actionLabel ? `<button class="btn-apply empty-action">${escapeHtml(actionLabel)}</button>` : ''}
        `;
        const toolbar = listCol.querySelector('.list-toolbar');
        if (toolbar) toolbar.insertAdjacentElement('afterend', wrap);
        else listCol.appendChild(wrap);

        if (actionLabel && typeof onAction === 'function') {
            wrap.querySelector('.empty-action').addEventListener('click', onAction);
        }
    }

    function buildJobCard(job, index) {
  const article = document.createElement('article');
  article.className = 'job-listing';

  const bgClass = JOB_ICON_BG_CLASSES[index % JOB_ICON_BG_CLASSES.length];
  const pillClass = job.jobType === 'Internship' ? 'pill-internship' : 'pill-fulltime';
  const posted = timeAgo(job.postedAt);
  const badge = deadlineBadge(job);
  const expired = !isJobStillOpen(Date.now())(job);

  const applied = window.MyApplicationsStore
    ? window.MyApplicationsStore.hasApplied(job.id)
    : false;

  const skills = (job.skills || []).slice(0, 4);
  const extra = (job.skills || []).length - skills.length;

  // ---- Decide what the action button shows ----
  let actionBtn;
  if (applied) {
    actionBtn = `<button class="btn-apply btn-applied" disabled>
                   <i class="bi bi-check-circle-fill"></i> Applied
                 </button>`;
  } else if (expired) {
    actionBtn = `<button class="btn-apply" disabled>Closed</button>`;
  } else {
    actionBtn = `<button class="btn-apply" data-job-id="${job.id}">Apply Now</button>`;
  }

  article.innerHTML = `
    <div class="job-logo ${bgClass}"><i class="bi ${JOB_ICON}"></i></div>
    <div class="job-listing-body">
      <div class="job-listing-top">
        <h5>
          ${escapeHtml(job.title)}
          <span class="pill ${pillClass}">${escapeHtml(job.jobType)}</span>
          ${applied ? `<span class="pill pill-applied"><i class="bi bi-check2"></i> Applied</span>` : ''}
        </h5>
        <span class="posted-time">${posted}</span>
      </div>
      <p class="job-company">${escapeHtml(job.companyName)}</p>
      <div class="job-facts">
        <span><i class="bi bi-geo-alt"></i> ${escapeHtml(job.location || '—')}</span>
        <span><i class="bi bi-building"></i> ${escapeHtml(job.workMode)}</span>
        <span><i class="bi bi-person"></i> ${escapeHtml(job.experienceLevel)}</span>
      </div>
      ${badge}
      <p class="job-desc">${escapeHtml(truncate(job.description, 180))}</p>
      <div class="job-tags">
        ${skills.map(s => `<span class="tag">${escapeHtml(s)}</span>`).join('')}
        ${extra > 0 ? `<span class="tag tag-more">+${extra}</span>` : ''}
      </div>
    </div>
    <div class="job-listing-actions">
      <i class="bi bi-bookmark save-icon" data-job-id="${job.id}" title="Save job"></i>
      ${actionBtn}
      <a href="#" class="view-details" data-job-id="${job.id}">View Details</a>
    </div>
  `;

  // Only attach the apply click handler if the button is enabled
  const applyBtn = article.querySelector('.btn-apply:not([disabled])');
  if (applyBtn && !applied && !expired) {
    applyBtn.addEventListener('click', () => applyToJob(job.id));
  }
  article.querySelector('.save-icon').addEventListener('click', (e) => toggleSaveJob(job.id, e.target));
  article.querySelector('.view-details').addEventListener('click', (e) => {
    e.preventDefault();
    openCompanyProfile(job);
  });

  return article;
}

    function truncate(str, n) {
        if (!str) return '';
        return str.length > n ? str.slice(0, n).trimEnd() + '…' : str;
    }

    function applyToJob(jobId) {
        console.log('Apply clicked for job:', jobId);
        alert('Apply endpoint not implemented on the backend yet.');
    }

    async function toggleSaveJob(jobId, iconEl) {
  const store = window.SavedJobsStore;
  const currentlySaved = iconEl.classList.contains('bi-bookmark-fill');

  // Optimistic UI
  iconEl.classList.toggle('bi-bookmark');
  iconEl.classList.toggle('bi-bookmark-fill');

  try {
    if (store) {
      if (currentlySaved) {
        await store.remove(jobId);
      } else {
        await store.save(jobId);
      }
    } else {
      // Fallback if saved-jobs.js hasn't loaded on this page
      const KEY = 'campusconnect.savedJobs';
      let cur = [];
      try { cur = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch {}
      if (currentlySaved) {
        cur = cur.filter(e => String(e.id) !== String(jobId));
      } else if (!cur.some(e => String(e.id) === String(jobId))) {
        cur.unshift({ id: jobId, savedAt: new Date().toISOString() });
      }
      localStorage.setItem(KEY, JSON.stringify(cur));
    }
    showSaveToast(currentlySaved ? 'Removed from saved jobs' : 'Saved to your list');
  } catch (err) {
    console.error('Save toggle failed:', err);
    // Revert
    iconEl.classList.toggle('bi-bookmark');
    iconEl.classList.toggle('bi-bookmark-fill');
  }
}

function showSaveToast(msg) {
  let t = document.getElementById('saveToast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'saveToast';
    t.className = 'saved-toast';
    document.body.appendChild(t);
  }
  t.innerHTML = `<i class="bi bi-check-circle-fill"></i><span>${msg}</span>`;
  t.hidden = false;
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(t._timer);
  t._timer = setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => { t.hidden = true; }, 250);
  }, 2600);
}

    /* ---------------------------- Helpers ---------------------------- */
    function timeAgo(dateStr) {
        if (!dateStr) return '';
        const diffMs = Date.now() - new Date(dateStr).getTime();
        const days = Math.floor(diffMs / 86400000);
        if (days <= 0) return 'Posted today';
        if (days === 1) return 'Posted 1 day ago';
        if (days < 30) return `Posted ${days} days ago`;
        const months = Math.floor(days / 30);
        return `Posted ${months} month${months > 1 ? 's' : ''} ago`;
    }

    function formatShortDate(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str ?? '';
        return div.innerHTML;
    }

    /* ---------------------------- Company profile modal ---------------------------- */
    async function openCompanyProfile(job) {
        const modalEl = document.getElementById('companyProfileModal');
        const bodyEl = document.getElementById('companyProfileModalBody');
        const titleEl = document.getElementById('companyProfileModalLabel');
        if (!modalEl || !bodyEl) return;

        titleEl.textContent = job.companyName || 'Company Profile';
        bodyEl.innerHTML = `
            <div class="profile-loading">
                <div class="spinner-border" role="status"></div>
                <span>Loading company profile…</span>
            </div>`;

        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();

        if (!job.companyId) {
            renderCompanyProfile(bodyEl, {}, job, 'No company reference on this job posting.');
            return;
        }

        try {
            const res = await fetch(`${COMPANY_API_BASE}/${job.companyId}`, { credentials: 'include' });
            if (!res.ok) {
                let detail = '';
                try { detail = (await res.json())?.message || ''; } catch (_) {}
                throw new Error(`status ${res.status}${detail ? ' — ' + detail : ''}`);
            }
            const company = await res.json();
            renderCompanyProfile(bodyEl, company, job);
        } catch (err) {
            console.error('Company profile fetch error:', err);
            renderCompanyProfile(bodyEl, {}, job, `Full company profile could not be loaded (${err.message}).`);
        }
        // Expose so other pages (e.g. saved-jobs.js) can reuse the same modal
window.openCompanyProfile = openCompanyProfile;
window.openApplyModal = openApplyModal;   // optional — for "Apply Now" reuse too
    }

    function renderCompanyProfile(bodyEl, company, job, errorNote) {
        const infoItems = [
            { icon: 'bi-globe', label: 'Website', value: company.website, isLink: true },
            { icon: 'bi-envelope', label: 'Email', value: company.email },
            { icon: 'bi-telephone', label: 'Contact', value: company.contactNumber },
            { icon: 'bi-person-badge', label: 'Contact Person', value: company.contactPersonName
                ? `${company.contactPersonName}${company.contactPersonDesignation ? ' — ' + company.contactPersonDesignation : ''}`
                : null },
            { icon: 'bi-geo-alt', label: 'Location', value: company.location },
            { icon: 'bi-people', label: 'Employees', value: company.employeeCount },
            { icon: 'bi-diagram-3', label: 'Industry', value: company.industryType },
            { icon: 'bi-buildings', label: 'Company Type', value: company.companyType },
            { icon: 'bi-calendar3', label: 'Founded', value: company.foundedYear },
            { icon: 'bi-patch-check', label: 'Verified', value: company.isVerified ? 'Yes' : null },
            { icon: 'bi-linkedin', label: 'LinkedIn', value: company.linkedinUrl, isLink: true },
        ].filter(item => item.value);

        const jobDetailItems = [
            { icon: 'bi-cash-stack', label: 'Salary Range', value: formatSalary(job.minSalary, job.maxSalary) },
            { icon: 'bi-people-fill', label: 'Openings', value: job.numberOfOpenings ? `${job.numberOfOpenings} position${job.numberOfOpenings > 1 ? 's' : ''}` : null },
            { icon: 'bi-mortarboard', label: 'Qualification', value: job.qualification },
            { icon: 'bi-bar-chart', label: 'Min. CGPA', value: job.minimumCgpa != null ? job.minimumCgpa : null },
            { icon: 'bi-diagram-3', label: 'Department', value: job.department },
            { icon: 'bi-calendar-x', label: 'Apply By', value: formatDate(job.applicationDeadline) },
        ].filter(item => item.value);

        const logoHtml = company.profileImage
            ? `<img src="${escapeAttr(company.profileImage)}" alt="${escapeAttr(company.name || job.companyName)}" class="company-profile-logo-img">`
            : `<div class="company-profile-logo"><i class="bi bi-building"></i></div>`;

        bodyEl.innerHTML = `
            <div class="company-profile-header">
                ${logoHtml}
                <div>
                    <h5>${escapeHtml(company.name || job.companyName)}</h5>
                    ${company.industryType ? `<small>${escapeHtml(company.industryType)}</small>` : ''}
                </div>
            </div>

            ${infoItems.length ? `
                <div class="company-info-grid">
                    ${infoItems.map(item => `
                        <div class="info-item">
                            <i class="bi ${item.icon}"></i>
                            <div>
                                <strong>${escapeHtml(item.label)}</strong>
                                ${item.isLink
                                    ? `<a href="${escapeAttr(item.value)}" target="_blank" rel="noopener">${escapeHtml(item.value)}</a>`
                                    : escapeHtml(String(item.value))}
                            </div>
                        </div>
                    `).join('')}
                </div>
            ` : ''}

            ${company.description ? `
                <div class="company-about-section">
                    <h6>About Company</h6>
                    <div class="company-about">${escapeHtml(company.description)}</div>
                </div>
            ` : ''}

            <div class="job-summary-card">
                <h6>This Job</h6>
                <div class="job-summary-title">${escapeHtml(job.title)} &mdash; ${escapeHtml(job.jobType)}</div>
                <div class="job-summary-meta">${escapeHtml(job.location)} • ${escapeHtml(job.workMode)} • ${escapeHtml(job.experienceLevel)}</div>

                ${jobDetailItems.length ? `
                    <div class="company-info-grid job-detail-grid">
                        ${jobDetailItems.map(item => `
                            <div class="info-item">
                                <i class="bi ${item.icon}"></i>
                                <div>
                                    <strong>${escapeHtml(item.label)}</strong>
                                    ${escapeHtml(String(item.value))}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}

                <p class="job-summary-desc">${escapeHtml(job.description)}</p>

                ${(job.skills && job.skills.length) ? `
                    <div class="job-tags mt-2">
                        ${job.skills.map(s => `<span class="tag">${escapeHtml(s)}</span>`).join('')}
                    </div>
                ` : ''}
            </div>

            ${errorNote ? `<div class="profile-error-note"><i class="bi bi-exclamation-triangle"></i> ${escapeHtml(errorNote)}</div>` : ''}
        `;
    }

    /* ---------------------------- Profile completion ring (right sidebar) ---------------------------- */
async function initProfileProgressWidget() {
    const ring = document.querySelector('.widget-progress-ring');
    if (!ring) return; // not on this page

    const labelEl = ring.querySelector('.ring-center strong');
    const circle  = ring.querySelector('.ring-fg');
    const r = 30;
    const circumference = 2 * Math.PI * r; // ≈ 188.5

    // Match the same weighted fields used by my-profile.js
    const COMPLETION_FIELDS = [
        'gender', 'dateOfBirth', 'city', 'state', 'address',
        'cgpa', 'activeBacklogs', 'graduationYear', 'courseDuration', 'resumeUrl','coverLetter'
    ];

    try {
        // Reuse the shared store so we don't double-fetch /profile
        const student = (typeof StudentProfileStore !== 'undefined')
            ? await StudentProfileStore.refresh()
            : await fetchProfileDirect();

        const filled = COMPLETION_FIELDS.filter(k => {
            const v = student[k];
            return v !== null && v !== undefined && v !== '';
        }).length;

        const percent = Math.round((filled / COMPLETION_FIELDS.length) * 100);

        // Animate the ring
        if (circle) {
            circle.style.strokeDasharray  = `${circumference}`;
            circle.style.strokeDashoffset = `${circumference - (circumference * percent) / 100}`;
        }
        if (labelEl) labelEl.textContent = `${percent}%`;

        // Also update the sidebar's "Complete Your Profile" widget if present
        const sidebarLabel = document.querySelector('.progress-ring-label');
        const sidebarRing  = document.querySelector('.progress-ring .ring-fg');
        if (sidebarLabel) sidebarLabel.textContent = `${percent}%`;
        if (sidebarRing) {
            sidebarRing.style.strokeDasharray  = `169.6`;
            sidebarRing.style.strokeDashoffset = `${169.6 - (169.6 * percent) / 100}`;
        }
    } catch (err) {
        console.error('Profile progress widget error:', err);
        // Leave hardcoded fallback in place — don't show a broken state
    }
}

// Fallback for pages where StudentProfileStore isn't loaded yet
async function fetchProfileDirect() {
    const base = (typeof STUDENT_API_BASE !== 'undefined')
        ? STUDENT_API_BASE
        : 'http://127.0.0.1:8080/api/students';
    const res = await fetch(`${base}/profile`, { credentials: 'include' });
    if (!res.ok) throw new Error(`status ${res.status}`);
    return res.json();
}
    function formatSalary(min, max) {
        if (min == null && max == null) return null;
        const fmt = (n) => `₹${Number(n).toLocaleString('en-IN')}`;
        if (min != null && max != null) return `${fmt(min)} – ${fmt(max)}`;
        if (min != null) return `From ${fmt(min)}`;
        return `Up to ${fmt(max)}`;
    }

    function formatDate(dateStr) {
        if (!dateStr) return null;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return null;
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function escapeAttr(str) {
        return String(str ?? '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
/* =====================================================================
   Job Application form
   ===================================================================== */
const PROFILE_API_BASE = (typeof STUDENT_API_BASE !== 'undefined')
    ? STUDENT_API_BASE
    : 'http://127.0.0.1:8080/api/students';

const RESUME_BASE_URL_APPLY = 'http://localhost:8080/uploads/student-resumes';
const APPLY_RESUME_MAX_BYTES = 10 * 1024 * 1024;
const APPLY_RESUME_ALLOWED_EXT = ['.pdf', '.doc', '.docx'];

// Same weighted list used by my-profile.js so "100% complete" means the same
// thing everywhere in the app.
const APPLY_COMPLETION_FIELDS = [
    'gender', 'dateOfBirth', 'city', 'state', 'address',
    'cgpa', 'activeBacklogs', 'graduationYear', 'courseDuration', 'resumeUrl'
];
const APPLY_COMPLETION_LABELS = {
    gender: 'Gender', dateOfBirth: 'Date of birth',
    city: 'City', state: 'State', address: 'Address',
    cgpa: 'CGPA', activeBacklogs: 'Active backlogs',
    graduationYear: 'Graduation year',
    courseDuration: 'Course duration', resumeUrl: 'Resume'
};

// Cache for the duration of the modal
let CURRENT_APPLY_JOB = null;
let CURRENT_APPLY_PROFILE = null;
let CURRENT_APPLY_COMPANY = null;
/* ---------- Eligibility configuration ---------- */

// Job types that require an engineering degree
const ENGINEERING_BRANCH_KEYWORDS = [
  'b.tech', 'btech', 'b.e', 'be ', 'b.e.', 'bachelor of engineering',
  'bachelor of technology', 'm.tech', 'mtech', 'm.e'
];

// Map of degree-family → branches that satisfy it
const QUALIFICATION_BRANCH_MAP = {
  'b.tech':  ['b.tech', 'btech', 'b.e', 'be', 'bachelor of engineering', 'bachelor of technology'],
  'btech':   ['b.tech', 'btech', 'b.e', 'be', 'bachelor of engineering', 'bachelor of technology'],
  'b.e':     ['b.tech', 'btech', 'b.e', 'be', 'bachelor of engineering', 'bachelor of technology'],
  'm.tech':  ['m.tech', 'mtech', 'm.e', 'me', 'master of technology', 'master of engineering'],
  'mba':     ['mba', 'master of business administration', 'pgdm'],
  'mca':     ['mca', 'master of computer applications'],
  'bca':     ['bca', 'bachelor of computer applications'],
  'b.sc':    ['b.sc', 'bsc', 'bachelor of science'],
  'm.sc':    ['m.sc', 'msc', 'master of science']
};

/**
 * Normalizes a raw branch/qualification string for comparison.
 * "B.Tech (Computer Science)" → "b.tech"
 */
function normalizeQualification(raw) {
  if (!raw) return '';
  return String(raw)
    .toLowerCase()
    .replace(/\(.*?\)/g, '')   // strip parenthetical major
    .replace(/[^a-z.\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts the base degree token from a free-form qualification string.
 * Examples:
 *   "B.Tech"                        → "b.tech"
 *   "B.Tech Computer Science"       → "b.tech"
 *   "Bachelor of Technology (CSE)"  → "bachelor of technology"
 *   "MBA"                           → "mba"
 */
function extractDegreeToken(raw) {
  const norm = normalizeQualification(raw);
  if (!norm) return '';

  // Longer phrases first so "bachelor of technology" wins over "bachelor"
  const phrases = [
    'bachelor of technology', 'bachelor of engineering',
    'master of technology', 'master of engineering',
    'master of business administration', 'master of computer applications',
    'bachelor of computer applications', 'bachelor of science', 'master of science',
    'b.tech', 'm.tech', 'b.e', 'm.e', 'b.sc', 'm.sc', 'bca', 'mca', 'mba', 'pgdm'
  ];
  for (const p of phrases) {
    if (norm.includes(p)) return p;
  }
  // Fallback: first token
  return norm.split(' ')[0];
}

/**
 * Evaluates whether a student profile meets a job's eligibility criteria.
 * Returns { eligible: boolean, failures: string[], warnings: string[] }
 *
 * `failures` block submission; `warnings` are soft mismatches the student
 * can still override (rare).
 */
function evaluateEligibility(profile, job) {
  const failures = [];
  const warnings = [];

  const studentBranch = resolveStudentBranchApply(profile);          // e.g. "MBA"
  const studentDegree = extractDegreeToken(studentBranch || profile.qualification);
  const requiredQual = job.qualification || job.requiredQualification || '';
  const requiredDegree = extractDegreeToken(requiredQual);

   /* ---- 1. Qualification / branch match ---- */
  if (requiredQual && studentDegree) {
    // Split the required qualification by comma to handle "BCA,B.Tech,MBA"
    const requiredList = requiredQual.split(',').map(s => s.trim()).filter(Boolean);
    
    let matched = false;

    // Also get the raw student branch string for fallback matching
    const rawStudentBranch = (studentBranch || '').toLowerCase();

    for (const req of requiredList) {
        // 1. Extract the degree token (e.g., "b.tech" from "B.Tech Computer Science")
        const reqDegree = extractDegreeToken(req);
        if (!reqDegree) continue;

        // 2. Get allowed aliases for this degree
        const allowed = QUALIFICATION_BRANCH_MAP[reqDegree] || [reqDegree];

        // 3. Check if student's extracted degree matches any allowed alias
        const degreeMatch = allowed.some(a => 
            studentDegree.includes(a) || a.includes(studentDegree)
        );

        // 4. Fallback: Check if the raw student branch string is contained in the requirement
        //    (e.g., student has "BCA", requirement says "BCA" or "Bachelor of Computer Applications")
        const rawMatch = rawStudentBranch.includes(req.toLowerCase()) || 
                         req.toLowerCase().includes(rawStudentBranch);

        if (degreeMatch || rawMatch) {
            matched = true;
            break; // Found a match, no need to check further
        }
    }

    // If no match found in the list, it's a hard fail
    if (!matched) {
      failures.push(
        `This role requires one of: ${requiredQual}. Your profile shows "${studentBranch || 'N/A'}".`
      );
    }
  } else if (requiredQual && !studentDegree) {
    // If the job requires a qualification but the student's profile is missing it, add a warning
    warnings.push(`Company requires "${requiredQual}". We couldn't detect your degree from your profile.`);
  }

  /* ---- 2. Minimum CGPA ---- */
  if (job.minimumCgpa != null && job.minimumCgpa !== '') {
    const myCgpa = profile.cgpa != null ? Number(profile.cgpa) : null;
    if (myCgpa == null) {
      failures.push(`This role requires a minimum CGPA of ${job.minimumCgpa}. Add your CGPA to your profile.`);
    } else if (myCgpa < Number(job.minimumCgpa)) {
      failures.push(`Minimum CGPA required: ${job.minimumCgpa}. Your CGPA: ${myCgpa}.`);
    }
  }

  /* ---- 3. Backlog limit (if company exposes one) ---- */
  const maxBacklogs = job.maxBacklogs ?? job.allowedBacklogs ?? null;
  if (maxBacklogs != null) {
    const myBacklogs = profile.activeBacklogs != null ? Number(profile.activeBacklogs) : 0;
    if (myBacklogs > Number(maxBacklogs)) {
      failures.push(`Maximum ${maxBacklogs} active backlog(s) allowed. You have ${myBacklogs}.`);
    }
  }

  /* ---- 4. Graduation year window ---- */
  const gradFrom = job.graduationYearFrom ?? job.eligibleGraduationYearFrom ?? null;
  const gradTo   = job.graduationYearTo   ?? job.eligibleGraduationYearTo   ?? null;
  if (gradFrom != null || gradTo != null) {
    const myGrad = profile.graduationYear != null ? Number(profile.graduationYear) : null;
    if (myGrad == null) {
      failures.push('This role has a graduation-year requirement. Please add your graduation year to your profile.');
    } else {
      if (gradFrom != null && myGrad < Number(gradFrom))
        failures.push(`Only students graduating in ${gradFrom}–${gradTo ?? 'onwards'} are eligible. You: ${myGrad}.`);
      if (gradTo != null && myGrad > Number(gradTo))
        failures.push(`Only students graduating up to ${gradTo} are eligible. You: ${myGrad}.`);
    }
  }

  /* ---- 5. Gender restriction (some companies) ---- */
  const genderReq = job.genderRequirement || job.eligibleGender || null;
  if (genderReq && profile.gender && String(profile.gender).toUpperCase() !== String(genderReq).toUpperCase()) {
    failures.push(`This role is open to ${genderReq} candidates only.`);
  }

  /* ---- 6. Course duration ---- */
  const minDuration = job.minimumCourseDuration ?? null;
  if (minDuration != null) {
    const myDur = profile.courseDuration != null ? Number(profile.courseDuration) : null;
    if (myDur != null && myDur < Number(minDuration)) {
      failures.push(`Minimum course duration: ${minDuration} years. Yours: ${myDur}.`);
    }
  }

  return { eligible: failures.length === 0, failures, warnings };
}
/* ---------- Profile shape helpers ---------- */
function resolveStudentNameApply(s) {
    return s?.name || s?.fullName || s?.studentName || s?.full_name || '';
}
function resolveStudentBranchApply(s) {
    return s?.branch || s?.branchName || s?.department || s?.course || s?.branch_name || '';
}
function branchLabelApply(raw) {
    if (!raw) return '';
    return String(raw).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
function computeCompletionProfile(s) {
    if (!s) return { percent: 0, missing: APPLY_COMPLETION_FIELDS.slice() };
    const filled = APPLY_COMPLETION_FIELDS.filter(k => {
        const v = s[k];
        return v !== null && v !== undefined && v !== '';
    });
    const missing = APPLY_COMPLETION_FIELDS.filter(k => !filled.includes(k));
    return { percent: Math.round((filled.length / APPLY_COMPLETION_FIELDS.length) * 100), missing };
}
async function fetchStudentProfileForApply() {
    if (typeof StudentProfileStore !== 'undefined' && StudentProfileStore.refresh) {
        return StudentProfileStore.refresh();
    }
    const res = await fetch(`${PROFILE_API_BASE}/profile`, {
        credentials: 'include', cache: 'no-store'
    });
    if (!res.ok) throw new Error(`profile fetch failed: ${res.status}`);
    return res.json();
}

/* ---------- Entry point (called from job card's "Apply Now") ---------- */
function applyToJob(jobId) {
    const job = ALL_JOBS.find(j => String(j.id) === String(jobId));
    if (!job) return;
    openApplyModal(job);
}

/* ---------- Open modal ---------- */
async function openApplyModal(job) {
  const modalEl = document.getElementById('applyJobModal');
  if (!modalEl) {
    console.error('applyJobModal missing in DOM');
    alert('Apply modal is not available on this page.');
    return;
  }

  CURRENT_APPLY_JOB = job;
  CURRENT_APPLY_PROFILE = null;
  CURRENT_APPLY_COMPANY = null;

  // Guard every header/hidden element
  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  const setHidden = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.hidden = v;
  };

  setText('applyJobModalLabel', `Apply · ${job.title}`);
  setText('applyJobSubtitle',   `${job.companyName} · ${job.location || 'Location not specified'}`);

  setHidden('applyProfileGate', true);
  setHidden('jobApplicationForm', true);
  setHidden('applyGlobalError', true);
  setHidden('applyEligibilityGate', true);

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();

  // ---- Fetch profile (wrap in try/catch so we always show *something*) ----
  let profile, company = null;
  try {
    profile = await fetchStudentProfileForApply();
  } catch (err) {
    console.error('Apply: profile fetch failed', err);
    showApplyGlobalError('Could not load your profile. Please try again.');
    return;
  }
  CURRENT_APPLY_PROFILE = profile;

  // ---- Company (optional) ----
  if (job.companyId) {
    try {
      const res = await fetch(`${COMPANY_API_BASE}/${job.companyId}`, { credentials: 'include' });
      if (res.ok) company = await res.json();
    } catch (_) { /* optional */ }
  }
  CURRENT_APPLY_COMPANY = company;

  // ---- Gate 1: Profile completeness ----
  try {
    const { percent, missing } = computeCompletionProfile(profile);
    if (percent < 100) {
      renderProfileGate(percent, missing);
      return;
    }
  } catch (err) {
    console.error('Profile gate render failed:', err);
    showApplyGlobalError('Profile gate failed to render.');
    return;
  }

  // ---- Gate 2: Eligibility ----
  try {
    const elig = evaluateEligibility(profile, job);
    if (!elig.eligible) {
      renderEligibilityGate(elig.failures, elig.warnings);
      return;
    }
  } catch (err) {
    console.error('Eligibility gate render failed:', err);
    showApplyGlobalError('Eligibility check failed.');
    return;
  }

  // ---- Show the form ----
  setHidden('jobApplicationForm', false);
  wireApplyFormOnce();
  renderApplySummary(job, company);
  prefillApplyForm(profile, job);
  document.getElementById('applySubmitBtn')?.focus();
}

/* ---------- Profile gate ---------- */
function renderProfileGate(percent, missing) {
    const gate = document.getElementById('applyProfileGate');
    gate.hidden = false;

    document.getElementById('applyGatePercent').textContent = `${percent}%`;
    document.getElementById('applyGateBarFill').style.width = `${percent}%`;
    document.getElementById('applyGateMessage').innerHTML =
        `Your profile is <strong>${percent}%</strong> complete. You need <strong>100%</strong> to apply for jobs.`;

    const list = document.getElementById('applyGateMissing');
    list.innerHTML = '';
    missing.forEach(key => {
        const li = document.createElement('li');
        li.textContent = APPLY_COMPLETION_LABELS[key] || key;
        list.appendChild(li);
    });
}



function renderEligibilityGate(failures, warnings) {
  const gate = document.getElementById('applyEligibilityGate');
  if (!gate) {
    // Fallback: show the failures as a global error so the student isn't stuck
    console.warn('applyEligibilityGate not in DOM — falling back to global error');
    showApplyGlobalError(
      'You are not eligible:\n' + failures.join('\n')
    );
    return;
  }
  gate.hidden = false;

  const list = gate.querySelector('.eligibility-failures');
  if (list) {
    list.innerHTML = failures.map(f =>
      `<li><i class="bi bi-x-circle-fill"></i> ${escapeHtml(f)}</li>`
    ).join('');
  }

  const warnBox = gate.querySelector('.eligibility-warnings');
  if (warnBox) {
    if (warnings && warnings.length) {
      warnBox.hidden = false;
      warnBox.innerHTML = warnings.map(w =>
        `<li><i class="bi bi-info-circle"></i> ${escapeHtml(w)}</li>`
      ).join('');
    } else {
      warnBox.hidden = true;
    }
  }

  const btn = gate.querySelector('.btn-update-profile');
  if (btn) btn.onclick = () => { window.location.href = 'my-profile.html'; };
}

/* ---------- Summary + company strip ---------- */
function renderApplySummary(job, company) {
    const logo = document.getElementById('applyCompanyLogo');
    logo.innerHTML = company?.profileImage
        ? `<img src="${escapeAttr(company.profileImage)}" alt="${escapeAttr(company.name || job.companyName)}">`
        : `<i class="bi bi-building"></i>`;

    document.getElementById('applyJobTitle').textContent = job.title;
    document.getElementById('applyCompanyName').textContent = company?.name || job.companyName;

    const industry = document.getElementById('applyCompanyIndustry');
    industry.textContent = company?.industryType || '';
    industry.style.display = company?.industryType ? '' : 'none';

    document.getElementById('applyJobFacts').innerHTML = `
        <span><i class="bi bi-geo-alt"></i> ${escapeHtml(job.location || '—')}</span>
        <span><i class="bi bi-building"></i> ${escapeHtml(job.workMode)}</span>
        <span><i class="bi bi-person"></i> ${escapeHtml(job.experienceLevel)}</span>
        ${job.department ? `<span><i class="bi bi-diagram-3"></i> ${escapeHtml(job.department)}</span>` : ''}
        ${job.numberOfOpenings ? `<span><i class="bi bi-people"></i> ${job.numberOfOpenings} openings</span>` : ''}
    `;

    const dl = document.getElementById('applyDeadlineBadge');
    dl.innerHTML = job.applicationDeadline ? deadlineBadge(job) : '';

    const salary = document.getElementById('applySalaryBox');
    salary.textContent = formatSalary(job.minSalary, job.maxSalary) || '';

    // Company strip
    const strip = document.getElementById('applyCompanyStrip');
    const items = [];
    if (company?.industryType)  items.push(['Industry', escapeHtml(company.industryType)]);
    if (company?.companyType)   items.push(['Company Type', escapeHtml(company.companyType)]);
    if (company?.employeeCount) items.push(['Employees', escapeHtml(String(company.employeeCount))]);
    if (company?.foundedYear)   items.push(['Founded', escapeHtml(String(company.foundedYear))]);
    if (company?.location)      items.push(['HQ', escapeHtml(company.location)]);
    if (company?.website)       items.push(['Website',
        `<a href="${escapeAttr(company.website)}" target="_blank" rel="noopener">${escapeHtml(company.website)}</a>`]);

    strip.innerHTML = items.map(([k, v]) =>
        `<div class="apply-strip-item"><strong>${k}</strong>${v}</div>`
    ).join('');
}

/* ---------- Prefill ---------- */
function prefillApplyForm(profile, job) {
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val ?? '';
    };

    set('af_fullName', resolveStudentNameApply(profile));
    set('af_prnNo', profile.prnNo);
    set('af_email', profile.email);
    set('af_phone', profile.phone);
    set('af_dateOfBirth', profile.dateOfBirth || '');
    set('af_gender', profile.gender || '');
    set('af_address', profile.address || '');
    set('af_city', profile.city || '');
    set('af_state', profile.state || '');
    set('af_branch', branchLabelApply(resolveStudentBranchApply(profile)));
    set('af_cgpa', profile.cgpa != null ? profile.cgpa : '');
    set('af_activeBacklogs', profile.activeBacklogs != null ? profile.activeBacklogs : '');
    set('af_graduationYear', profile.graduationYear != null ? profile.graduationYear : '');
    set('af_courseDuration', profile.courseDuration != null ? profile.courseDuration : '');
    // set('af_qualification', profile.qualification || '');

    // Seed skills from job requirements
    if (Array.isArray(job.skills) && job.skills.length) {
        set('af_skills', job.skills.join(', '));
    }
    /* ---------- Profile photo widget ---------- */
const APPLY_PHOTO_MAX_BYTES = 5 * 1024 * 1024;   // 5 MB
const APPLY_PHOTO_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const PROFILE_PHOTO_BASE_URL = 'http://localhost:8080/uploads/student-photos';

/**
 * Renders the photo row given the profile's current photo filename
 * (or null if the student has none).
 */
function renderPhotoRow(photoFileName) {
    const row = document.getElementById('applyPhotoRow');
    if (!row) return;

    row.classList.remove('empty', 'changed');

    if (photoFileName) {
        row.innerHTML = `
            <div class="apply-photo-preview">
                <img src="${PROFILE_PHOTO_BASE_URL}/${encodeURIComponent(photoFileName)}"
                     alt="Profile photo"
                     onerror="this.replaceWith(Object.assign(document.createElement('i'),{className:'bi bi-person-fill'}))">
            </div>
            <div class="apply-photo-info">
                <span class="apply-photo-label">Using your profile photo</span>
                <span class="apply-photo-hint">
                    <a href="${PROFILE_PHOTO_BASE_URL}/${encodeURIComponent(photoFileName)}"
                       target="_blank" rel="noopener">View full size</a>
                </span>
            </div>
            <button type="button" class="btn-photo-replace" id="btnReplacePhoto">
                <i class="bi bi-arrow-repeat"></i> Replace
            </button>
        `;

        row.querySelector('#btnReplacePhoto')?.addEventListener('click', () => {
            document.getElementById('af_profilePhoto')?.click();
        });
    } else {
        row.classList.add('empty');
        row.innerHTML = `
            <div class="apply-photo-preview">
                <i class="bi bi-person-fill"></i>
            </div>
            <div class="apply-photo-info">
                <span class="apply-photo-label">No profile photo</span>
                <span class="apply-photo-hint">Please upload a photo to continue.</span>
            </div>
        `;
    }
}

/**
 * Shows the newly chosen photo in the row (with a NEW badge)
 * and lets the student revert to the profile photo.
 */
function renderNewPhotoPreview(file) {
    const row = document.getElementById('applyPhotoRow');
    if (!row) return;

    row.classList.remove('empty');
    row.classList.add('changed');

    const objectUrl = URL.createObjectURL(file);

    row.innerHTML = `
        <div class="apply-photo-preview changed">
            <img src="${objectUrl}" alt="New photo preview">
        </div>
        <div class="apply-photo-info">
            <span class="apply-photo-label">New photo ready to upload</span>
            <span class="apply-photo-hint">
                ${escapeHtml(file.name)} · ${(file.size / 1024).toFixed(0)} KB
            </span>
        </div>
        <button type="button" class="btn-photo-remove" id="btnRemoveNewPhoto">
            <i class="bi bi-x-lg"></i> Remove
        </button>
    `;

    row.querySelector('#btnRemoveNewPhoto')?.addEventListener('click', () => {
        // Revoke blob URL to free memory
        URL.revokeObjectURL(objectUrl);

        const input = document.getElementById('af_profilePhoto');
        if (input) input.value = '';

        // Restore the original profile photo view
        renderPhotoRow(CURRENT_APPLY_PROFILE?.profilePhoto);
        clearApplyError('af_profilePhoto');
    });
}
function renderNewResumePreview(file) {
    const row = document.getElementById('applyResumeRow');
    if (!row) return;

    row.classList.remove('empty');
    row.classList.add('changed');

    row.innerHTML = `
        <i class="bi bi-file-earmark-check"></i>
        <span>New resume ready:&nbsp;<strong>${escapeHtml(file.name)}</strong></span>
        <small>(${(file.size / 1024).toFixed(0)} KB)</small>
        <button type="button" class="btn-resume-remove" id="btnRemoveNewResume">
            <i class="bi bi-x-lg"></i> Remove
        </button>
    `;

    row.querySelector('#btnRemoveNewResume')?.addEventListener('click', () => {
        const input = document.getElementById('af_resume');
        if (input) input.value = '';
        // Restore original profile resume view
        renderResumeRow(CURRENT_APPLY_PROFILE?.resumeUrl);
        clearApplyError('af_resume');
    });
}
        // Profile photo
    renderPhotoRow(profile.profilePhoto || null);
    renderResumeRow(profile.resumeUrl);

    // "From profile" chips
    document.querySelectorAll('.apply-source').forEach(el => {
        const key = el.dataset.source;
        const present = profile[key] !== null && profile[key] !== undefined && profile[key] !== '';
        el.textContent = present ? 'From profile' : '';
        el.classList.toggle('empty', !present);
    });

    updateCoverCount();
}

function renderResumeRow(resumeFileName) {
    const row = document.getElementById('applyResumeRow');
    if (!row) return;
    if (resumeFileName) {
        row.classList.remove('empty');
        row.innerHTML = `
            <i class="bi bi-file-earmark-check"></i>
            <span>Using profile resume:&nbsp;</span>
            <a href="${RESUME_BASE_URL_APPLY}/${encodeURIComponent(resumeFileName)}"
               target="_blank" rel="noopener">View</a>
        `;
    } else {
        row.classList.add('empty');
        row.innerHTML = `
            <i class="bi bi-exclamation-triangle"></i>
            <span>No resume on your profile — please upload one below.</span>
        `;
    }
}

function updateCoverCount() {
    const ta = document.getElementById('af_coverLetter');
    const out = document.getElementById('af_coverCount');
    if (!ta || !out) return;
    out.textContent = ta.value.length;
    out.parentElement.classList.toggle('over', ta.value.length > 2000);
}

/* ---------- Validation ---------- */
const APPLY_VALIDATORS = {
    af_fullName:    () => reqApply('af_fullName', 'Full name is required'),
    af_prnNo:       () => reqApply('af_prnNo', 'PRN is required'),
    af_email:       () => fmtApply('af_email', /^\S+@\S+\.\S+$/, 'Enter a valid email'),
    af_phone:       () => fmtApply('af_phone', /^[6-9]\d{9}$/, 'Enter a valid 10-digit phone number'),
    af_dateOfBirth: () => {
        const v = valApply('af_dateOfBirth');
        if (!v) return 'Date of birth is required';
        const d = new Date(v + 'T00:00:00');
        if (isNaN(d)) return 'Enter a valid date';
        const today = new Date();
        if (d > today) return 'Date of birth cannot be in the future';
        const age = (today - d) / (1000 * 60 * 60 * 24 * 365.25);
        if (age < 15) return 'You must be at least 15 years old';
        if (age > 100) return 'Enter a valid date of birth';
        return null;
    },
    af_gender:      () => reqApply('af_gender', 'Please select your gender'),
    af_address:     () => reqApply('af_address', 'Address is required'),
    af_city:        () => reqApply('af_city', 'City is required'),
    af_state:       () => reqApply('af_state', 'State is required'),
    af_branch:      () => reqApply('af_branch', 'Branch is required'),
    af_cgpa:        () => {
        const v = valApply('af_cgpa');
        if (v === '') return 'CGPA is required';
        const n = Number(v);
        if (isNaN(n) || n < 0 || n > 10) return 'CGPA must be between 0 and 10';
        if (CURRENT_APPLY_JOB?.minimumCgpa != null && n < CURRENT_APPLY_JOB.minimumCgpa) {
            return `This job requires a minimum CGPA of ${CURRENT_APPLY_JOB.minimumCgpa}`;
        }
        return null;
    },
    af_activeBacklogs: () => {
        const v = valApply('af_activeBacklogs');
        if (v === '') return 'Active backlogs is required';
        const n = Number(v);
        if (isNaN(n) || n < 0 || !Number.isInteger(n)) return 'Enter a non-negative whole number';
        return null;
    },
    af_graduationYear: () => {
        const v = valApply('af_graduationYear');
        if (v === '') return 'Graduation year is required';
        const n = Number(v);
        const y = new Date().getFullYear();
        if (!Number.isInteger(n) || n < y - 10 || n > y + 10) {
            return `Enter a valid year (${y - 10}–${y + 10})`;
        }
        return null;
    },
    af_courseDuration: () => {
        const v = valApply('af_courseDuration');
        if (v === '') return 'Course duration is required';
        const n = Number(v);
        if (!Number.isInteger(n) || n < 1 || n > 10) return 'Duration must be 1–10 years';
        return null;
    },
    // af_qualification: () => reqApply('af_qualification', 'Qualification is required'),
      af_profilePhoto: () => {
        const hasProfilePhoto = !!CURRENT_APPLY_PROFILE?.profilePhoto;
        const file = document.getElementById('af_profilePhoto')?.files?.[0];
        // Only require a photo if the student doesn't already have one
        if (!hasProfilePhoto && !file) return 'Please upload a profile photo';
        return null;
    },
    af_resume:        () => {
        const hasProfileResume = !!CURRENT_APPLY_PROFILE?.resumeUrl;
        const file = document.getElementById('af_resume')?.files?.[0];
        if (!hasProfileResume && !file) return 'Please upload a resume';
        return null;
    },
    // af_skills: () => {
    //     const v = valApply('af_skills').trim();
    //     if (!v) return 'Please list at least one skill';
    //     return null;
    // },
    af_coverLetter: () => {
        const v = valApply('af_coverLetter').trim();
        if (!v) return 'Cover letter is required';
        if (v.length < 50) return `Please write at least 50 characters (currently ${v.length})`;
        if (v.length > 2000) return 'Cover letter cannot exceed 2000 characters';
        return null;
    },
    // af_portfolio: () => {
    //     const v = valApply('af_portfolio').trim();
    //     if (!v) return null;
    //     try { new URL(v); } catch { return 'Enter a valid URL (https://…)'; }
    //     return null;
    // },
    af_declare: () => {
        const cb = document.getElementById('af_declare');
        if (!cb || !cb.checked) return 'You must confirm the declaration before submitting';
        return null;
    }
    
};

function valApply(id) { return document.getElementById(id)?.value ?? ''; }
function reqApply(id, msg) { return valApply(id).trim() ? null : msg; }
function fmtApply(id, re, msg) { return re.test(valApply(id).trim()) ? null : msg; }

function validateApplyField(id) {
    const v = APPLY_VALIDATORS[id];
    if (!v) return true;
    const msg = v();
    if (msg) { showApplyError(id, msg); return false; }
    clearApplyError(id);
    return true;
}

function validateApplyForm() {
    let ok = true;
    Object.keys(APPLY_VALIDATORS).forEach(id => {
        const fieldOk = validateApplyField(id);
        ok = ok && fieldOk;
    });
    return ok;
}

function showApplyError(id, msg) {
    const el = document.getElementById(id);
    if (el) el.classList.add('is-invalid');
    const err = document.querySelector(`#jobApplicationForm .field-error[data-for="${id}"]`);
    if (err) err.textContent = msg;
}

function clearApplyError(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('is-invalid');
    const err = document.querySelector(`#jobApplicationForm .field-error[data-for="${id}"]`);
    if (err) err.textContent = '';
}

function showApplyGlobalError(msg) {
    const el = document.getElementById('applyGlobalError');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
}
function hideApplyGlobalError() {
    const el = document.getElementById('applyGlobalError');
    if (el) el.hidden = true;
}

/* ---------- Wire once ---------- */
function wireApplyFormOnce() {
    const form = document.getElementById('jobApplicationForm');
    if (!form || form.dataset.wired === 'true') return;
    form.dataset.wired = 'true';

    Object.keys(APPLY_VALIDATORS).forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const evt = (el.tagName === 'SELECT' || el.type === 'date'
                  || el.type === 'checkbox' || el.type === 'file')
            ? 'change' : 'blur';
        el.addEventListener(evt, () => validateApplyField(id));
    });

    const ta = document.getElementById('af_coverLetter');
    if (ta) ta.addEventListener('input', updateCoverCount);

        // Profile photo upload
    const photoInput = document.getElementById('af_profilePhoto');
    if (photoInput) {
        photoInput.addEventListener('change', () => {
            const f = photoInput.files[0];
            if (!f) return;

            // Type check
            if (!APPLY_PHOTO_ALLOWED_TYPES.includes(f.type)) {
                showApplyError('af_profilePhoto', 'Only JPG, PNG, or WEBP images are allowed');
                photoInput.value = '';
                return;
            }

            // Size check
            if (f.size > APPLY_PHOTO_MAX_BYTES) {
                showApplyError('af_profilePhoto', 'Image is too large — max 5 MB');
                photoInput.value = '';
                return;
            }

            clearApplyError('af_profilePhoto');
            renderNewPhotoPreview(f);
        });
    }
    // Resume file validation
    const file = document.getElementById('af_resume');
    if (file) {
        file.addEventListener('change', () => {
            const f = file.files[0];
            if (!f) return;
            const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
            if (!APPLY_RESUME_ALLOWED_EXT.includes(ext)) {
                showApplyError('af_resume', 'Only PDF or Word documents are allowed');
                file.value = '';
                return;
            }
            if (f.size > APPLY_RESUME_MAX_BYTES) {
                showApplyError('af_resume', 'File is too large — max 10 MB');
                file.value = '';
                return;
            }
            clearApplyError('af_resume');
            renderNewResumePreview(f);   // <-- ADD THIS
        });
    }

    // Submit
    form.addEventListener('submit', submitJobApplication);
}

/* ---------- Submit ---------- */
async function submitJobApplication(e) {
    e.preventDefault();
    hideApplyGlobalError();

      // ---- Re-check eligibility against the freshest profile ----
  try {
    const freshProfile = await fetchStudentProfileForApply();
    CURRENT_APPLY_PROFILE = freshProfile;
    const elig = evaluateEligibility(freshProfile, CURRENT_APPLY_JOB);
    if (!elig.eligible) {
      document.getElementById('jobApplicationForm').hidden = true;
      renderEligibilityGate(elig.failures, elig.warnings);
      showApplyGlobalError('Your profile no longer meets the eligibility criteria for this job.');
      return;
    }
  } catch (err) {
    console.warn('Eligibility re-check failed, continuing:', err);
  }
  
    if (!validateApplyForm()) {
        const firstInvalid = document.querySelector('#jobApplicationForm .is-invalid');
        if (firstInvalid) firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
        showApplyGlobalError('Please fix the highlighted fields before submitting.');
        return;
    }

    const btn = document.getElementById('applySubmitBtn');
    const label = btn.querySelector('.apply-btn-label');
    const spinner = btn.querySelector('.apply-btn-spinner');
    btn.disabled = true;
    label.hidden = true;
    spinner.hidden = false;

    try {
        const fd = new FormData();

        // Profile-derived + editable fields
        [
            'fullName', 'prnNo', 'email', 'phone', 'dateOfBirth', 'gender',
            'address', 'city', 'state', 'branch', 'cgpa', 'activeBacklogs',
            'graduationYear', 'courseDuration', 'qualification',
            'coverLetter'
        ].forEach(name => {
            const el = document.querySelector(`#jobApplicationForm [name="${name}"]`);
            if (el) fd.append(name, el.value);
        });

        fd.append('jobId', CURRENT_APPLY_JOB.id);
        fd.append('declarationAccepted', document.getElementById('af_declare').checked);
        fd.append('contactConsent', document.getElementById('af_consent').checked);

        // Resume: prefer the newly uploaded one; else backend will reuse profile resume
        const file = document.getElementById('af_resume').files[0];
        if (file) fd.append('resume', file);
                // Profile photo: prefer the newly uploaded one; else backend reuses profile photo
        const photoFile = document.getElementById('af_profilePhoto')?.files?.[0];
        if (photoFile) fd.append('profilePhoto', photoFile);

        const basic = sessionStorage.getItem('authBasic');

const res = await fetch(`${APPLY_API}/${CURRENT_APPLY_JOB.id}/apply`, {
    method: 'POST',
    credentials: 'include',
    headers: basic ? { 'Authorization': `Basic ${basic}` } : {},
    body: fd
});

        if (!res.ok) {
            let detail = '';
            try { detail = (await res.json())?.message || await res.text(); } catch (_) {}
            throw new Error(detail || `status ${res.status}`);
        }

        await res.json().catch(() => ({}));

// Success — mark as applied so every card updates
const appliedJobId = CURRENT_APPLY_JOB.id;
const appliedJobTitle = CURRENT_APPLY_JOB.title;

if (window.MyApplicationsStore) {
  window.MyApplicationsStore.markApplied(appliedJobId);
}

// Hide the apply modal
const modalEl = document.getElementById('applyJobModal');
bootstrap.Modal.getOrCreateInstance(modalEl).hide();

// Re-render the job list so the card flips to "Applied"
refreshJobCardFor(appliedJobId);

// Show the success modal after the apply modal closes
modalEl.addEventListener('hidden.bs.modal', function showSuccessOnce() {
    modalEl.removeEventListener('hidden.bs.modal', showSuccessOnce);
    showApplicationSuccessModal(appliedJobTitle);
}, { once: true });

    } catch (err) {
        console.error('Application submit error:', err);
        showApplyGlobalError(`Couldn't submit your application: ${err.message}`);
    } finally {
        btn.disabled = false;
        label.hidden = false;
        spinner.hidden = true;
    }
}

/* ---------- Application Success Modal ---------- */
function showApplicationSuccessModal(jobTitle) {
    const modalEl = document.getElementById('applicationSuccessModal');
    if (!modalEl) {
        // Fallback to toast if modal HTML isn't present
        showApplyToast(`Application submitted for "${jobTitle}". We'll notify you soon!`);
        return;
    }

    const titleEl = document.getElementById('successJobTitle');
    if (titleEl) titleEl.textContent = jobTitle;

    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}
/* ---------- Toast ---------- */
function showApplyToast(msg) {
    let toast = document.getElementById('applyToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'applyToast';
        toast.className = 'apply-toast';
        document.body.appendChild(toast);
    }
    toast.innerHTML = `<i class="bi bi-check-circle-fill"></i> ${escapeHtml(msg)}`;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 4000);
}
    /* ---------------------------- Boot ---------------------------- */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSearchJobsPage, { once: true });
    } else {
        initSearchJobsPage();
    }
})();