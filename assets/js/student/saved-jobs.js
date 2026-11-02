/* =====================================================================
   saved-jobs.js
   Reads/writes the same SavedJobsStore used by search-jobs.js so the
   bookmark state stays in sync across pages.
   ===================================================================== */
(function () {
  'use strict';

  const JOB_API_BASE = (typeof JOB_API !== 'undefined')
    ? JOB_API
    : 'http://127.0.0.1:8080/api/jobs';
  const SAVED_API_BASE = 'http://127.0.0.1:8080/api/students/saved-jobs';
  const STORAGE_KEY = 'campusconnect.savedJobs';

  const CLOSING_SOON_DAYS = 3;
  const JOB_ICON_BG_CLASSES = ['icon-blue-bg', 'icon-purple-bg', 'icon-orange-bg'];

  let ALL_SAVED = [];
  let STUDENT_PROFILE = null;
  let SEARCH_TERM = '';
  let SORT_MODE = 'deadline';
  let FILTER_MODE = 'all';
  let lastRemoved = null;

  /* ------------------------------------------------------------------
     SavedJobsStore — single source of truth
     Tries backend first; falls back to localStorage so the feature works
     even before the API exists. Records { id, savedAt }.
     ------------------------------------------------------------------ */
  const SavedJobsStore = {
   async list() {
  try {
    const res = await fetch(SAVED_API_BASE, { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      // Backend returns [{savedId, jobId, savedAt, job, eligible, ineligibilityReasons}]
      return data.map(item => ({
        id: item.jobId,
        savedAt: item.savedAt,
        job: item.job,                                    // KEEP the hydrated job
        serverEligible: item.eligible,
        serverReasons: item.ineligibilityReasons || []
      }));
    }
  } catch (_) {}
  return readLocal().map(e => ({ id: e.id, savedAt: e.savedAt, job: e.job || null }));
},

    async save(jobId) {
      const entry = { id: jobId, savedAt: new Date().toISOString() };
      try {
        const res = await fetch(`${SAVED_API_BASE}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ jobId })
        });
        if (res.ok) return entry;
      } catch (_) {}
      // Local fallback
      const cur = readLocal();
      if (!cur.some(e => String(e.id) === String(jobId))) cur.unshift(entry);
      writeLocal(cur);
      return entry;
    },

    async remove(jobId) {
      try {
        const res = await fetch(`${SAVED_API_BASE}/${jobId}`, {
          method: 'DELETE',
          credentials: 'include'
        });
        if (res.ok) return;
      } catch (_) {}
      writeLocal(readLocal().filter(e => String(e.id) !== String(jobId)));
    },

    isSaved(jobId) {
      return readLocal().some(e => String(e.id) === String(jobId));
    }
  };

  function readLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }
  function writeLocal(arr) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)); } catch {}
  }

  // Expose so search-jobs.js can reuse it
  window.SavedJobsStore = SavedJobsStore;

  /* ------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------ */
  function initSavedJobsPage() {
    const listCol = document.getElementById('savedJobList');
    if (!listCol) return; // not on this page

    wireToolbar();
    wireBanner();
    showSkeletons();
    loadPage();
  }

 async function loadPage() {
  try {
    const [saved, profile] = await Promise.all([
      SavedJobsStore.list(),
      fetchStudentProfile()
    ]);
    console.log('[SavedJobs] raw entries from store:', saved);
    console.log('[SavedJobs] profile:', profile);
    STUDENT_PROFILE = profile;

    // Backend already sent the full job — no need to re-fetch.
    const entries = saved.filter(e => e.job);          // drop any without a job

    // If backend is down and we're reading from local, fall back to per-job fetch
    if (entries.length === 0 && saved.length > 0) {
      const hydrated = await Promise.all(
        saved.map(async (entry) => {
          const job = await fetchJob(entry.id);
          return job ? { ...normalizeJob(job), savedAt: entry.savedAt } : null;
        })
      );
      ALL_SAVED = hydrated.filter(Boolean);
    } else {
      ALL_SAVED = entries.map(e => {
  const job = normalizeJob(e.job);
  job.savedAt = e.savedAt;
  job.serverEligible = e.serverEligible;
  job.serverReasons = e.serverReasons;
  job._eligibility = checkEligibility(job, profile);
  return job;
});
    }

    hideSkeletons();
    renderAll();
  } catch (err) {
    console.error('Saved jobs load error:', err);
    hideSkeletons();
    renderError();
  }
}

  async function fetchJob(jobId) {
    try {
      const res = await fetch(`${JOB_API_BASE}/${jobId}`, { credentials: 'include' });
      if (res.ok) return res.json();
    } catch (_) {}
    return null;
  }

  async function fetchStudentProfile() {
    if (typeof StudentProfileStore !== 'undefined' && StudentProfileStore.refresh) {
      try { return await StudentProfileStore.refresh(); } catch (_) {}
    }
    try {
      const base = (typeof STUDENT_API_BASE !== 'undefined')
        ? STUDENT_API_BASE
        : 'http://127.0.0.1:8080/api/students';
      const res = await fetch(`${base}/profile`, { credentials: 'include' });
      if (res.ok) return res.json();
    } catch (_) {}
    return null;
  }

  /* ------------------------------------------------------------------
     Normalization — mirrors search-jobs.js
     ------------------------------------------------------------------ */
  function normalizeJob(job) {
    const jobTypeMap = {
      FULL_TIME: 'Full Time', PART_TIME: 'Part Time',
      INTERNSHIP: 'Internship', CONTRACT: 'Contract', REMOTE: 'Remote'
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
      qualification: job.qualification ?? '',
      minSalary: job.minSalary ?? null,
      maxSalary: job.maxSalary ?? null,
      minimumCgpa: job.minimumCgpa ?? null,
      numberOfOpenings: job.numberOfOpenings ?? null,
      applicationDeadline: job.applicationDeadline ?? null,
      department: job.department ?? ''
    };
  }

  /* ------------------------------------------------------------------
     Deadline helpers
     ------------------------------------------------------------------ */
  function endOfDay(ts) {
    const d = new Date(ts);
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }
  function daysLeft(deadlineStr) {
    if (!deadlineStr) return null;
    const t = new Date(deadlineStr).getTime();
    if (Number.isNaN(t)) return null;
    return Math.ceil((endOfDay(t) - Date.now()) / 86400000);
  }
  function isExpired(job) {
    const d = daysLeft(job.applicationDeadline);
    return d !== null && d < 0;
  }

  /* ------------------------------------------------------------------
     Qualification check
     Compares the student's profile against the job's requirements.
     Returns { eligible, reasons: [] }.
     ------------------------------------------------------------------ */
//   function checkEligibility(job, profile) {
//      if (typeof job.serverEligible === 'boolean') {
//     return { eligible: job.serverEligible, reasons: job.serverReasons || [] };
//   }
//     const reasons = [];
//     if (!profile) return { eligible: true, reasons }; // can't judge → don't block

//     // CGPA
//     if (job.minimumCgpa != null && profile.cgpa != null) {
//       if (Number(profile.cgpa) < Number(job.minimumCgpa)) {
//         reasons.push(
//           `Your CGPA (${profile.cgpa}) is below the required ${job.minimumCgpa}`
//         );
//       }
//     }

//     // Active backlogs — many postings require zero
//     if (job.qualification && /no\s*backlog/i.test(job.qualification)) {
//       if (Number(profile.activeBacklogs || 0) > 0) {
//         reasons.push(`This job requires no active backlogs (you have ${profile.activeBacklogs})`);
//       }
//     }

//     // Graduation year window — parse "2024-2026" style ranges in qualification
//     if (job.qualification) {
//       const yearRange = job.qualification.match(/(20\d{2})\s*[-–]\s*(20\d{2})/);
//       if (yearRange && profile.graduationYear) {
//         const y = Number(profile.graduationYear);
//         const [min, max] = [Number(yearRange[1]), Number(yearRange[2])];
//         if (y < min || y > max) {
//           reasons.push(
//             `Graduation year must be between ${min} and ${max} (yours is ${y})`
//           );
//         }
//       }
//     }

//     // Experience level — flag if job needs experience and profile is a fresher
//     if (job.experienceLevel && /^[1-9]/.test(job.experienceLevel)) {
//       reasons.push(`This role expects ${job.experienceLevel} of experience`);
//     }

//     return { eligible: reasons.length === 0, reasons };
//   }
/**
 * Returns a rich eligibility object:
 *   {
 *     eligible: boolean,
 *     reasons: string[],          // what's wrong
 *     matchedSkills: string[],    // overlap with profile
 *     missingSkills: string[],    // job wants these, you don't have
 *     cgpaGap: number|null,       // positive = you're short
 *     daysLeft: number|null,
 *     urgency: 'closed'|'today'|'urgent'|'soon'|'normal'|'rolling',
 *     matchScore: number,         // 0–100, higher = better fit
 *     recommendation: string      // human-readable hint
 *   }
 */
function checkEligibility(job, profile) {
  const result = {
    eligible: true,
    reasons: [],
    matchedSkills: [],
    missingSkills: [],
    cgpaGap: null,
    daysLeft: null,
    urgency: 'normal',
    matchScore: 0,
    recommendation: ''
  };

  
  // --- Prefer server-computed eligibility when available ---
  if (typeof job.serverEligible === 'boolean') {
    result.eligible = job.serverEligible;
    result.reasons = job.serverReasons || [];
  }

  // --- Deadline / urgency ---
  const dLeft = daysLeft(job.applicationDeadline);
  result.daysLeft = dLeft;
  if (dLeft === null) result.urgency = 'rolling';
  else if (dLeft < 0) result.urgency = 'closed';
  else if (dLeft === 0) result.urgency = 'today';
  else if (dLeft === 1) result.urgency = 'urgent';
  else if (dLeft <= CLOSING_SOON_DAYS) result.urgency = 'soon';
  else result.urgency = 'normal';

  if (!profile) {
    result.matchScore = 50; // neutral when we can't judge
    return result;
  }

  // --- CGPA ---
  if (job.minimumCgpa != null && profile.cgpa != null) {
    const gap = Number(job.minimumCgpa) - Number(profile.cgpa);
    result.cgpaGap = gap > 0 ? gap : null;
    if (gap > 0 && !result.reasons.some(r => /cgpa/i.test(r))) {
      result.reasons.push(
        `CGPA ${profile.cgpa} below required ${job.minimumCgpa} (short by ${gap.toFixed(2)})`
      );
    }
  }

  // --- Skills overlap ---
  const jobSkills = (job.skills || []).map(s => String(s).toLowerCase().trim());
  const profileSkills = new Set(
    [
      ...(Array.isArray(profile.skills) ? profile.skills : []),
      ...(typeof profile.skills === 'string' ? profile.skills.split(',') : [])
    ]
      .map(s => String(s).toLowerCase().trim())
      .filter(Boolean)
  );

  jobSkills.forEach(s => {
    if (profileSkills.has(s)) result.matchedSkills.push(s);
    else result.missingSkills.push(s);
  });

  // --- Compute a simple match score ---
  let score = 40; // base
  if (result.eligible) score += 20;
  if (result.cgpaGap === null && job.minimumCgpa != null) score += 10;
  if (jobSkills.length) {
    score += Math.round((result.matchedSkills.length / jobSkills.length) * 25);
  } else {
    score += 15;
  }
  if (result.urgency === 'today' || result.urgency === 'urgent') score += 5;
  result.matchScore = Math.min(100, score);

  // --- Recommendation text ---
  if (result.urgency === 'closed') {
    result.recommendation = 'This job has closed';
  } else if (!result.eligible) {
    result.recommendation = 'Review requirements before applying';
  } else if (result.urgency === 'today') {
    result.recommendation = 'Last day to apply — submit now';
  } else if (result.urgency === 'urgent') {
    result.recommendation = 'Closes tomorrow — apply today';
  } else if (result.urgency === 'soon') {
    result.recommendation = `Apply within ${dLeft} day${dLeft === 1 ? '' : 's'}`;
  } else if (result.matchScore >= 80) {
    result.recommendation = 'Strong match for your profile';
  } else if (result.matchScore >= 60) {
    result.recommendation = 'Good fit — worth applying';
  } else {
    result.recommendation = 'Consider improving your match first';
  }

  // Sync back to top-level flags
  result.eligible = result.reasons.length === 0;

  return result;
}

  /* ------------------------------------------------------------------
     Rendering
     ------------------------------------------------------------------ */
  function renderAll() {
    updateStats();
    renderBanner();
    renderList();
    renderSuggestions();
  }

  function updateStats() {
    const total = ALL_SAVED.length;
    const closing = ALL_SAVED.filter(j => {
      const d = daysLeft(j.applicationDeadline);
      return d !== null && d >= 0 && d <= CLOSING_SOON_DAYS;
    }).length;
    const urgent = ALL_SAVED.filter(j => {
      const d = daysLeft(j.applicationDeadline);
      return d !== null && d >= 0 && d <= 1;
    }).length;
    const eligible = ALL_SAVED.filter(j =>
      checkEligibility(j, STUDENT_PROFILE).eligible
    ).length;

    setText('statTotal', total);
    setText('statClosingSoon', closing);
    setText('statUrgent', urgent);
    setText('statEligible', eligible);
    setText('savedResultCount', `${total} job${total === 1 ? '' : 's'} saved`);
  }

  function renderBanner() {
    const banner = document.getElementById('deadlineBanner');
    if (!banner) return;
    if (sessionStorage.getItem('savedJobsBannerDismissed') === '1') {
      banner.hidden = true;
      return;
    }

    const urgentJobs = ALL_SAVED.filter(j => {
      const d = daysLeft(j.applicationDeadline);
      return d !== null && d >= 0 && d <= 1;
    });
    const soonJobs = ALL_SAVED.filter(j => {
      const d = daysLeft(j.applicationDeadline);
      return d !== null && d > 1 && d <= CLOSING_SOON_DAYS;
    });

    if (!urgentJobs.length && !soonJobs.length) {
      banner.hidden = true;
      return;
    }

    banner.hidden = false;
    banner.classList.toggle('urgent', urgentJobs.length > 0);

    const titleEl = document.getElementById('deadlineBannerTitle');
    const textEl = document.getElementById('deadlineBannerText');

    if (urgentJobs.length) {
      titleEl.textContent = `${urgentJobs.length} saved job${urgentJobs.length === 1 ? '' : 's'} closing today or tomorrow`;
      textEl.textContent = urgentJobs.slice(0, 2).map(j => j.title).join(' · ')
        + (urgentJobs.length > 2 ? ` +${urgentJobs.length - 2} more` : '');
    } else {
      titleEl.textContent = `${soonJobs.length} saved job${soonJobs.length === 1 ? '' : 's'} closing within ${CLOSING_SOON_DAYS} days`;
      textEl.textContent = soonJobs.slice(0, 2).map(j => j.title).join(' · ')
        + (soonJobs.length > 2 ? ` +${soonJobs.length - 2} more` : '');
    }
  }

  function renderList() {
    const list = document.getElementById('savedJobList');
    if (!list) return;
    list.innerHTML = '';

    let jobs = ALL_SAVED.slice();

    // Search
    if (SEARCH_TERM) {
      const q = SEARCH_TERM.toLowerCase();
      jobs = jobs.filter(j =>
        `${j.title} ${j.companyName} ${j.skills.join(' ')}`.toLowerCase().includes(q)
      );
    }

    // Filter
    if (FILTER_MODE === 'eligible') {
      jobs = jobs.filter(j => checkEligibility(j, STUDENT_PROFILE).eligible);
    } else if (FILTER_MODE === 'closing') {
      jobs = jobs.filter(j => {
        const d = daysLeft(j.applicationDeadline);
        return d !== null && d >= 0 && d <= CLOSING_SOON_DAYS;
      });
    } else if (FILTER_MODE === 'urgent') {
      jobs = jobs.filter(j => {
        const d = daysLeft(j.applicationDeadline);
        return d !== null && d >= 0 && d <= 1;
      });
    }

    // Sort
    jobs = sortJobs(jobs);

    if (!jobs.length) {
      renderEmpty(list);
      return;
    }

    jobs.forEach((job, i) => {
      list.appendChild(buildSavedCard(job, i));
    });
  }

  function sortJobs(jobs) {
    const arr = jobs.slice();
    switch (SORT_MODE) {
      case 'saved':
        return arr.sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0));
      case 'posted':
        return arr.sort((a, b) => new Date(b.postedAt || 0) - new Date(a.postedAt || 0));
      case 'salary':
        return arr.sort((a, b) =>
          (b.maxSalary || b.minSalary || 0) - (a.maxSalary || a.minSalary || 0)
        );
      case 'company':
        return arr.sort((a, b) => a.companyName.localeCompare(b.companyName));
      case 'deadline':
      default:
        return arr.sort((a, b) => {
          const da = daysLeft(a.applicationDeadline);
          const db = daysLeft(b.applicationDeadline);
          if (da === null && db === null) return 0;
          if (da === null) return 1;
          if (db === null) return -1;
          return da - db;
        });
    }
  }

  function buildSavedCard(job, index) {
  const card = document.createElement('article');
  const el = job._eligibility || checkEligibility(job, STUDENT_PROFILE);
  const expired = el.urgency === 'closed';

  card.className = 'saved-job-card';
  card.classList.add(`urgency-${el.urgency}`);
  if (expired) card.classList.add('expired');
  if (el.eligible && (el.urgency === 'today' || el.urgency === 'urgent')) {
    card.classList.add('top-match');
  }

  const bgClass = JOB_ICON_BG_CLASSES[index % JOB_ICON_BG_CLASSES.length];
  const pillClass = job.jobType === 'Internship' ? 'pill-internship' : 'pill-fulltime';

  const skills = (job.skills || []).slice(0, 5);
  const extra = (job.skills || []).length - skills.length;

    // ---- Applied state (NEW) ----
  const applied = window.MyApplicationsStore
    ? window.MyApplicationsStore.hasApplied(job.id)
    : false;

  let applyActionBtn;
  if (applied) {
    applyActionBtn = `<button class="btn-apply apply-btn" disabled>
                        <i class="bi bi-check-circle-fill"></i> Applied
                      </button>`;
  } else if (expired) {
    applyActionBtn = `<button class="btn-apply apply-btn" disabled>Closed</button>`;
  } else {
    applyActionBtn = `<button class="btn-apply apply-btn">
                        Apply Now
                        ${(el.urgency === 'today' || el.urgency === 'urgent')
                          ? '<i class="bi bi-lightning-charge-fill"></i>' : ''}
                      </button>`;
  }
  // ---- Deadline pill (color-coded) ----
  const deadlinePill = buildDeadlinePill(job, el);

  // ---- Eligibility block ----
  const eligibilityBlock = buildEligibilityBlock(el);

  // ---- Skill overlap indicator ----
  const skillMatchBlock = buildSkillMatch(el, job.skills || []);

  // ---- Match score ring ----
  const scoreRing = `
    <div class="match-score-ring ${el.matchScore >= 80 ? 'great' : el.matchScore >= 60 ? 'good' : 'weak'}"
         title="Match score: ${el.matchScore}/100">
      <svg viewBox="0 0 40 40" width="44" height="44">
        <circle cx="20" cy="20" r="17" fill="none" stroke="#eef0f4" stroke-width="3.5"/>
        <circle cx="20" cy="20" r="17" fill="none"
                stroke="${el.matchScore >= 80 ? '#2f9e44' : el.matchScore >= 60 ? '#f59f00' : '#e03131'}"
                stroke-width="3.5"
                stroke-linecap="round"
                stroke-dasharray="${2 * Math.PI * 17}"
                stroke-dashoffset="${2 * Math.PI * 17 * (1 - el.matchScore / 100)}"
                transform="rotate(-90 20 20)"/>
      </svg>
      <strong>${el.matchScore}</strong>
    </div>
  `;

  // ---- Top badges row ----
  const topBadges = [];
  if (el.eligible && (el.urgency === 'today' || el.urgency === 'urgent')) {
    topBadges.push(`<span class="badge-pill badge-hot"><i class="bi bi-fire"></i> Great Match</span>`);
  }
  if (el.urgency === 'today') {
    topBadges.push(`<span class="badge-pill badge-closed-soon"><i class="bi bi-alarm-fill"></i> Last Day</span>`);
  } else if (el.urgency === 'urgent') {
    topBadges.push(`<span class="badge-pill badge-closed-soon"><i class="bi bi-hourglass-split"></i> 1 Day Left</span>`);
  } else if (el.urgency === 'soon') {
    topBadges.push(`<span class="badge-pill badge-soon"><i class="bi bi-calendar-event"></i> ${el.daysLeft} Days Left</span>`);
  }

  card.innerHTML = `
    <button class="saved-remove-btn" title="Remove" aria-label="Remove from saved">
      <i class="bi bi-x-lg"></i>
    </button>

    <div class="saved-logo ${bgClass}"><i class="bi bi-briefcase-fill"></i></div>

    <div class="saved-body">
      <div class="saved-title-row">
        <div>
          <h5>
  ${escapeHtml(job.title)}
  <span class="pill ${pillClass}">${escapeHtml(job.jobType)}</span>
  ${applied ? `<span class="pill pill-applied"><i class="bi bi-check2"></i> Applied</span>` : ''}
</h5>
          <p class="saved-company">
            <i class="bi bi-building"></i> ${escapeHtml(job.companyName)}
            ${job.location ? `· <i class="bi bi-geo-alt"></i> ${escapeHtml(job.location)}` : ''}
            ${job.workMode ? `· <i class="bi bi-laptop"></i> ${escapeHtml(job.workMode)}` : ''}
          </p>
        </div>
        ${scoreRing}
      </div>

      ${topBadges.length ? `<div class="saved-badges">${topBadges.join('')}</div>` : ''}

      ${eligibilityBlock}
      ${skillMatchBlock}

      ${skills.length ? `
        <div class="saved-skills">
          ${skills.map(s => {
            const matched = el.matchedSkills.includes(String(s).toLowerCase());
            return `<span class="tag ${matched ? 'tag-match' : ''}">
              ${matched ? '<i class="bi bi-check2"></i> ' : ''}${escapeHtml(s)}
            </span>`;
          }).join('')}
          ${extra > 0 ? `<span class="tag tag-more">+${extra}</span>` : ''}
        </div>
      ` : ''}

      ${deadlinePill}

      ${el.recommendation ? `
        <div class="recommendation-bar urgency-${el.urgency}">
          <i class="bi ${iconForUrgency(el.urgency)}"></i>
          <span>${escapeHtml(el.recommendation)}</span>
        </div>
      ` : ''}
    </div>

    <div class="saved-actions">
  ${applyActionBtn}
  <button class="btn-ghost details-btn">
    <i class="bi bi-eye"></i> View Details
  </button>
  <button class="btn-ghost danger remove-btn">
    <i class="bi bi-trash3"></i> Remove
  </button>
</div>
  `;

  // ---------- Wiring ----------
  const removeHandler = () => removeJob(job);
  card.querySelector('.saved-remove-btn').addEventListener('click', removeHandler);
  card.querySelector('.remove-btn').addEventListener('click', removeHandler);

  // Only attach apply handler when the button is actually enabled
  const applyBtn = card.querySelector('.apply-btn:not([disabled])');
  if (applyBtn && !applied && !expired) {
    applyBtn.addEventListener('click', () => {
      if (typeof window.openApplyModal === 'function') window.openApplyModal(job);
      else if (typeof window.applyToJob === 'function') window.applyToJob(job.id);
      else window.location.href = `search-jobs.html?apply=${encodeURIComponent(job.id)}`;
    });
  }

  card.querySelector('.details-btn').addEventListener('click', () => {
    if (typeof window.openCompanyProfile === 'function') window.openCompanyProfile(job);
    else window.location.href = `search-jobs.html?job=${encodeURIComponent(job.id)}`;
  });

  return card;
}

/* ---------- Sub-builders ---------- */

function buildDeadlinePill(job, el) {
  if (el.urgency === 'rolling') {
    return `<span class="deadline-badge deadline-normal">
      <i class="bi bi-infinity"></i> Rolling deadline
    </span>`;
  }
  if (el.urgency === 'closed') {
    return `<span class="deadline-badge deadline-expired">
      <i class="bi bi-x-circle"></i> Applications closed
    </span>`;
  }
  const cls = el.urgency === 'today' ? 'deadline-today'
            : el.urgency === 'urgent' ? 'deadline-urgent'
            : el.urgency === 'soon' ? 'deadline-soon'
            : 'deadline-normal';
  const icon = el.urgency === 'today' ? 'bi-fire'
             : el.urgency === 'urgent' ? 'bi-alarm'
             : 'bi-calendar-event';
  const label = el.urgency === 'today' ? 'Last day to apply'
              : el.urgency === 'urgent' ? 'Closes tomorrow'
              : el.urgency === 'soon' ? `${el.daysLeft} days left`
              : `Apply by ${formatShortDate(job.applicationDeadline)}`;
  return `<span class="deadline-badge ${cls}">
    <i class="bi ${icon}"></i> ${escapeHtml(label)}
  </span>`;
}

function buildEligibilityBlock(el) {
  if (el.urgency === 'closed') return '';
  if (el.eligible) {
    return `
      <div class="qual-ok">
        <i class="bi bi-patch-check-fill"></i>
        <span>You meet all requirements</span>
        ${el.matchedSkills.length ? `<span class="qual-ok-sub">· ${el.matchedSkills.length} matching skill${el.matchedSkills.length === 1 ? '' : 's'}</span>` : ''}
      </div>`;
  }
  return `
    <div class="qual-warn">
      <i class="bi bi-exclamation-triangle-fill"></i>
      <div>
        <strong>You may not qualify</strong>
        <ul>${el.reasons.map(r => `<li>${escapeHtml(r)}</li>`).join('')}</ul>
      </div>
    </div>`;
}

function buildSkillMatch(el, jobSkills) {
  if (!jobSkills.length) return '';
  const total = el.matchedSkills.length + el.missingSkills.length;
  if (total === 0) return '';
  const pct = Math.round((el.matchedSkills.length / total) * 100);
  const tone = pct >= 70 ? 'great' : pct >= 40 ? 'good' : 'weak';
  return `
    <div class="skill-match-bar">
      <div class="skill-match-label">
        <span><i class="bi bi-stars"></i> Skill match</span>
        <strong>${el.matchedSkills.length}/${total}</strong>
      </div>
      <div class="skill-match-track">
        <span class="skill-match-fill ${tone}" style="width:${pct}%"></span>
      </div>
    </div>`;
}

function iconForUrgency(u) {
  return u === 'today' ? 'bi-fire'
       : u === 'urgent' ? 'bi-alarm'
       : u === 'soon' ? 'bi-hourglass-split'
       : u === 'closed' ? 'bi-x-circle'
       : u === 'rolling' ? 'bi-infinity'
       : 'bi-info-circle';
}
  function deadlineBadge(job) {
    const left = daysLeft(job.applicationDeadline);
    if (left === null) return `<span class="deadline-badge deadline-normal"><i class="bi bi-calendar-event"></i> Rolling</span>`;
    if (left < 0)  return `<span class="deadline-badge deadline-expired"><i class="bi bi-x-circle"></i> Closed</span>`;
    if (left === 0) return `<span class="deadline-badge deadline-today"><i class="bi bi-fire"></i> Last day to apply</span>`;
    if (left === 1) return `<span class="deadline-badge deadline-urgent"><i class="bi bi-alarm"></i> 1 day left</span>`;
    if (left <= CLOSING_SOON_DAYS) return `<span class="deadline-badge deadline-soon"><i class="bi bi-hourglass-split"></i> ${left} days left</span>`;
    return `<span class="deadline-badge deadline-normal"><i class="bi bi-calendar-event"></i> Apply by ${formatShortDate(job.applicationDeadline)}</span>`;
  }

  /* ------------------------------------------------------------------
     Empty / error / skeleton
     ------------------------------------------------------------------ */
  function renderEmpty(list) {
    const hasAny = ALL_SAVED.length > 0;
    list.innerHTML = `
      <div class="saved-empty">
        <div class="empty-icon">
          <i class="bi ${hasAny ? 'bi-funnel' : 'bi-bookmark'}"></i>
        </div>
        <h5>${hasAny ? 'No jobs match your filters' : 'No saved jobs yet'}</h5>
        <p>${hasAny
          ? 'Try clearing the search or switching the filter.'
          : 'Tap the bookmark icon on any job in Search Jobs to save it here for later.'}</p>
        ${hasAny
          ? `<button class="btn-ghost" id="clearSavedFilters">Clear filters</button>`
          : `<a href="search-jobs.html" class="btn-apply"><i class="bi bi-search"></i> Browse Jobs</a>`}
      </div>
    `;
    const clearBtn = document.getElementById('clearSavedFilters');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        SEARCH_TERM = '';
        FILTER_MODE = 'all';
        SORT_MODE = 'deadline';
        document.getElementById('savedSearchInput').value = '';
        document.getElementById('savedFilterSelect').value = 'all';
        document.getElementById('savedSortSelect').value = 'deadline';
        renderList();
      });
    }
  }

  function renderError() {
    const list = document.getElementById('savedJobList');
    if (!list) return;
    list.innerHTML = `
      <div class="saved-empty">
        <div class="empty-icon"><i class="bi bi-wifi-off"></i></div>
        <h5>Could not load your saved jobs</h5>
        <p>Please check your connection and try again.</p>
        <button class="btn-apply" id="retrySavedBtn">Retry</button>
      </div>
    `;
    document.getElementById('retrySavedBtn').addEventListener('click', () => {
      showSkeletons();
      loadPage();
    });
  }

  function showSkeletons() {
    const list = document.getElementById('savedJobList');
    if (!list) return;
    list.innerHTML = Array.from({ length: 4 }).map(() => `
      <div class="saved-skeleton">
        <div class="sk-logo"></div>
        <div class="sk-body">
          <div class="sk-line w-60"></div>
          <div class="sk-line w-40"></div>
          <div class="sk-line w-80"></div>
          <div class="sk-line w-30"></div>
        </div>
      </div>
    `).join('');
  }
  function hideSkeletons() {
    document.querySelectorAll('.saved-skeleton').forEach(el => el.remove());
  }

  /* ------------------------------------------------------------------
     Suggestions — pulls active jobs not already saved
     ------------------------------------------------------------------ */
  async function renderSuggestions() {
    const wrap = document.getElementById('savedSuggestions');
    const scroll = document.getElementById('suggestionsScroll');
    if (!wrap || !scroll) return;

    try {
      const res = await fetch(`${JOB_API_BASE}/active`, { credentials: 'include' });
      if (!res.ok) return;
      const jobs = await res.json();
      const savedIds = new Set(ALL_SAVED.map(j => String(j.id)));
      const suggestions = jobs
        .map(normalizeJob)
        .filter(j => !savedIds.has(String(j.id)) && !isExpired(j))
        .sort((a, b) => {
          const da = daysLeft(a.applicationDeadline) ?? 9999;
          const db = daysLeft(b.applicationDeadline) ?? 9999;
          return da - db;
        })
        .slice(0, 6);

      if (!suggestions.length) {
        wrap.hidden = true;
        return;
      }

      wrap.hidden = false;
      scroll.innerHTML = suggestions.map(j => `
        <div class="suggestion-card">
          <h6>${escapeHtml(j.title)}</h6>
          <p>${escapeHtml(j.companyName)} · ${escapeHtml(j.location || '—')}</p>
          <button class="btn-ghost suggest-save" data-job-id="${escapeHtml(String(j.id))}">
            <i class="bi bi-bookmark"></i> Save
          </button>
        </div>
      `).join('');

      scroll.querySelectorAll('.suggest-save').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.jobId;
          await SavedJobsStore.save(id);
          btn.innerHTML = `<i class="bi bi-check2"></i> Saved`;
          btn.disabled = true;
          showToast('Job saved');
          // Reload the page data
          loadPage();
        });
      });
    } catch (_) { /* suggestions are best-effort */ }
  }

  /* ------------------------------------------------------------------
     Remove with undo
     ------------------------------------------------------------------ */
  async function removeJob(job) {
    lastRemoved = { job, index: ALL_SAVED.findIndex(j => String(j.id) === String(job.id)) };
    ALL_SAVED = ALL_SAVED.filter(j => String(j.id) !== String(job.id));

    // Optimistic UI
    renderAll();

    await SavedJobsStore.remove(job.id);

    showToast(`Removed "${job.title}"`, 'Undo', async () => {
      if (!lastRemoved) return;
      await SavedJobsStore.save(lastRemoved.job.id);
      lastRemoved = null;
      loadPage();
    });
  }

  let toastTimer = null;
  function showToast(msg, actionLabel, onAction) {
    const toast = document.getElementById('savedToast');
    const msgEl = document.getElementById('savedToastMsg');
    const undoBtn = document.getElementById('savedToastUndo');
    if (!toast) return;

    msgEl.textContent = msg;
    if (actionLabel) {
      undoBtn.hidden = false;
      undoBtn.textContent = actionLabel;
      undoBtn.onclick = () => {
        onAction?.();
        hideToast();
      };
    } else {
      undoBtn.hidden = true;
      undoBtn.onclick = null;
    }

    toast.hidden = false;
    requestAnimationFrame(() => toast.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 5000);
  }
  function hideToast() {
    const toast = document.getElementById('savedToast');
    if (!toast) return;
    toast.classList.remove('show');
    setTimeout(() => { toast.hidden = true; }, 250);
  }

  /* ------------------------------------------------------------------
     Wiring
     ------------------------------------------------------------------ */
  function wireToolbar() {
    const search = document.getElementById('savedSearchInput');
    if (search) {
      let t;
      search.addEventListener('input', (e) => {
        clearTimeout(t);
        t = setTimeout(() => {
          SEARCH_TERM = e.target.value.trim();
          renderList();
        }, 180);
      });
    }
    const sort = document.getElementById('savedSortSelect');
    if (sort) sort.addEventListener('change', () => {
      SORT_MODE = sort.value;
      renderList();
    });
    const filter = document.getElementById('savedFilterSelect');
    if (filter) filter.addEventListener('change', () => {
      FILTER_MODE = filter.value;
      renderList();
    });

    const refresh = document.getElementById('refreshSavedBtn');
    if (refresh) refresh.addEventListener('click', () => {
      showSkeletons();
      loadPage();
      showToast('Saved jobs refreshed');
    });
  }

  function wireBanner() {
    const close = document.getElementById('deadlineBannerClose');
    if (close) close.addEventListener('click', () => {
      sessionStorage.setItem('savedJobsBannerDismissed', '1');
      document.getElementById('deadlineBanner').hidden = true;
    });
    const review = document.getElementById('deadlineBannerBtn');
    if (review) review.addEventListener('click', () => {
      FILTER_MODE = 'urgent';
      const filter = document.getElementById('savedFilterSelect');
      if (filter) filter.value = 'urgent';
      renderList();
      document.getElementById('savedJobList')
        .scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  /* ------------------------------------------------------------------
     Helpers
     ------------------------------------------------------------------ */
  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
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

  /* ------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------ */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSavedJobsPage, { once: true });
  } else {
    initSavedJobsPage();
  }
})();