/* =====================================================================
   my-profile.js
   Depends on config.js (STUDENT_API_BASE) and sidebar.js (highlightActiveLink,
   renderNotifBadge, initTopbarProfile, initPageTransitions) being loaded first.
   ===================================================================== */
(function () {
'use strict';
// Reuse the base URL if config.js already defines it; otherwise fall back.
const PROFILE_API = (typeof STUDENT_API_BASE !== 'undefined')
    ? STUDENT_API_BASE
    : 'http://127.0.0.1:8080/api/students';

// Base URL the backend serves uploaded files from (mirrors how profilePhoto
// is already served — see updateSummary()). Resumes are served the same way.
const RESUME_BASE_URL = 'http://localhost:8080/uploads/student-resumes';

/* ---------------------------- Branch enum mapping ----------------------------
   GET /profile serializes Branch via name() -> "COMPUTER_ENGINEERING" etc.
   PUT /updateProfile deserializes via Branch.fromString(), which looks the
   value up in a map keyed by display strings — NOT a simple underscore->space
   swap (B_COM / B_SC use periods). This table mirrors that LOOKUP map exactly
   so round-tripping never throws "Invalid branch".

   Branch is READ-ONLY from the UI (set at signup, can't be changed here) —
   the <select> is disabled in populateForm(), and buildUpdatePayload() always
   sends the branch back from ORIGINAL_PROFILE rather than the dropdown value.
   This table is kept only so we can convert ORIGINAL_PROFILE's enum name()
   into the lookup string the backend expects when round-tripping.
   ------------------------------------------------------------------------- */
const BRANCH_OPTIONS = [
    { value: 'BCA', label: 'BCA', lookup: 'BCA' },
    { value: 'BBA', label: 'BBA', lookup: 'BBA' },
    { value: 'MECHANICAL_ENGINEERING', label: 'Mechanical Engineering', lookup: 'MECHANICAL ENGINEERING' },
    { value: 'B_COM', label: 'B.Com', lookup: 'B.COM' },
    { value: 'CIVIL_ENGINEERING', label: 'Civil Engineering', lookup: 'CIVIL ENGINEERING' },
    { value: 'MCA', label: 'MCA', lookup: 'MCA' },
    { value: 'MBA', label: 'MBA', lookup: 'MBA' },
    { value: 'B_SC', label: 'B.Sc', lookup: 'B.SC' },
    { value: 'AI_AND_DATA_SCIENCE', label: 'AI & Data Science', lookup: 'AI AND DATA SCIENCE' },
    { value: 'COMPUTER_ENGINEERING', label: 'Computer Engineering', lookup: 'COMPUTER ENGINEERING' },
    { value: 'ELECTRONICS_AND_TELECOMMUNICATION', label: 'Electronics & Telecommunication', lookup: 'ELECTRONICS AND TELECOMMUNICATION' },
    { value: 'INFORMATION_TECHNOLOGY', label: 'Information Technology', lookup: 'INFORMATION TECHNOLOGY' },
    { value: 'COMPUTER_SCIENCE', label: 'Computer Science', lookup: 'COMPUTER SCIENCE' },
    { value: 'ELECTRICAL_ENGINEERING', label: 'Electrical Engineering', lookup: 'ELECTRICAL ENGINEERING' }
];

function branchLookupFor(enumName) {
    const found = BRANCH_OPTIONS.find(b => b.value === enumName);
    return found ? found.lookup : enumName;
}

/* ---------------------------- Branch value normalization ----------------------------
   The branch dropdown was showing blank ("Select branch") for existing students
   because whatever format the signup form (student-auth.js) sent — and whatever
   format the backend actually stored/returned it in — didn't always match our
   <option value="ENUM_NAME"> list exactly. Rather than guess one canonical format,
   match case/punctuation-insensitively against value, label, AND lookup, so
   "Computer Science", "COMPUTER SCIENCE", "COMPUTER_SCIENCE", etc. all resolve
   to the same option.
   ------------------------------------------------------------------------- */
function normalizeBranchKey(str) {
    return (str || '').toString().toUpperCase().replace(/[^A-Z]/g, '');
}

const BRANCH_LOOKUP_BY_KEY = (() => {
    const map = {};
    BRANCH_OPTIONS.forEach(b => {
        [b.value, b.label, b.lookup].forEach(candidate => {
            map[normalizeBranchKey(candidate)] = b;
        });
    });
    return map;
})();

function findBranchOption(raw) {
    if (!raw) return null;
    return BRANCH_LOOKUP_BY_KEY[normalizeBranchKey(raw)] || null;
}

// Resolves whatever the backend sent for branch to the value our <select>
// actually has an option for. If it's a format we don't recognize at all,
// add a one-off option for it instead of silently showing a blank dropdown —
// better to show the raw value than to look like the data is missing.
function ensureBranchOptionExists(rawValue) {
    const select = document.getElementById('f_branch');
    if (!select || !rawValue) return '';
    const opt = findBranchOption(rawValue);
    if (opt) return opt.value;

    const alreadyThere = Array.from(select.options).some(o => o.value === rawValue);
    if (!alreadyThere) {
        const custom = document.createElement('option');
        custom.value = rawValue;
        custom.textContent = rawValue.toString().replace(/_/g, ' ');
        select.appendChild(custom);
    }
    return rawValue;
}

// Human-readable branch label for display (summary chip, meta line), using
// the same fuzzy match so it renders nicely even if the raw value is in an
// unexpected format.
function branchDisplayLabel(raw) {
    if (!raw) return '';
    const opt = findBranchOption(raw);
    return opt ? opt.label : raw.toString().replace(/_/g, ' ');
}

// The full name has shown up under different keys depending on which
// endpoint/script reads it (student.name vs student.fullName) — this is a
// stopgap until we confirm the real key from the raw /profile response.
// Remove the extra fallbacks once that's confirmed.
function resolveStudentName(s) {
    return s.name || s.fullName || s.studentName || s.full_name || '';
}
function resolveStudentBranch(s) {
    return s.branch || s.branchName || s.department || s.course || s.branch_name || '';
}
/* ---------------------------- State ---------------------------- */
// Holds the last-fetched profile as-is (raw GET /profile shape), so we can
// round-trip fields the UI doesn't edit (profilePhoto, idCardPhoto, placed,
// verified, id, resumeUrl, branch) instead of sending nulls/false and risking
// an overwrite.
let ORIGINAL_PROFILE = null;

/* ---------------------------- Content init (runs on load + pjax nav) ---------------------------- */
function initMyProfilePageContent() {
    const form = document.getElementById('profileForm');
    if (!form) return; // not on this page

    populateBranchOptions();
    wireForm();
    fetchProfile();
}

function populateBranchOptions() {
    const select = document.getElementById('f_branch');
    if (!select || select.options.length) return; // already populated
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select branch';
    placeholder.disabled = true;
    select.appendChild(placeholder);
    BRANCH_OPTIONS.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.value;
        opt.textContent = b.label;
        select.appendChild(opt);
    });
}

/* ---------------------------- Fetch ---------------------------- */
async function fetchProfile() {
    setSaveStatus('', '');
    try {
        const student = await StudentProfileStore.refresh(); // one fetch, everyone re-renders
        ORIGINAL_PROFILE = student;
        populateForm(student);
        updateSummary(student);
        updateCompletion(student);
        return true;
    } catch (err) {
        console.error('Profile fetch error:', err);
        setSaveStatus('Could not load your profile. Try refreshing the page.', 'err');
        return false;
    }
}

function populateForm(s) {
   setVal('f_name', resolveStudentName(s));
    setVal('f_prn', s.prnNo);
    setVal('f_branch', ensureBranchOptionExists(resolveStudentBranch(s)));
    setVal('f_gender', s.gender || '');
    setVal('f_dob', s.dateOfBirth || '');
    setVal('f_email', s.email);
    setVal('f_phone', s.phone);
    setVal('f_city', s.city);
    setVal('f_state', s.state);
    setVal('f_address', s.address);
    setVal('f_cgpa', s.cgpa != null ? s.cgpa : '');
    setVal('f_backlogs', s.activeBacklogs != null ? s.activeBacklogs : '');
    setVal('f_gradyear', s.graduationYear != null ? s.graduationYear : '');
    setVal('f_duration', s.courseDuration != null ? s.courseDuration : '');
    updateResumeInfo(s.resumeUrl);
}

function setVal(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value ?? '';
}

function updateResumeInfo(resumeFileName) {
    const el = document.getElementById('currentResumeInfo');
    if (!el) return;
    if (resumeFileName) {
        el.innerHTML = `Current resume: <a href="${RESUME_BASE_URL}/${resumeFileName}" target="_blank" rel="noopener">View / download</a>`;
    } else {
        el.textContent = 'No resume uploaded yet.';
    }
}
// ---------------------------- Profile preview modal ----------------------------
function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function showProfilePreview() {
    if (!ORIGINAL_PROFILE) return;
    const s = ORIGINAL_PROFILE;
    const name = resolveStudentName(s);
    const branch = branchDisplayLabel(resolveStudentBranch(s));

    const header = document.getElementById('previewHeader');
if (header) {
    header.innerHTML = `
        <div class="preview-avatar">${
            s.profilePhoto
                ? `<img src="http://localhost:8080/uploads/student-photos/${s.profilePhoto}" alt="${escapeHtml(name)}">`
                : (name || '?').trim().charAt(0).toUpperCase() || '?'
        }</div>
        <h5 class="preview-name">${escapeHtml(name) || 'Student'}</h5>
        <p class="preview-meta">${escapeHtml(branch)}${branch && s.prnNo ? ' • ' : ''}${escapeHtml(s.prnNo)}</p>
        <div class="preview-chips">
            <span class="preview-chip ${s.placed ? 'chip-good' : 'chip-neutral'}">
                ${s.placed ? 'Placed' : 'Not placed'}
            </span>
        </div>
    `;
}

    const section = (title, pairs) => `
        <div class="preview-section">
            <h6 class="preview-section-title">${title}</h6>
            <div class="preview-grid">
                ${pairs
                    .filter(([, value]) => value !== null && value !== undefined && value !== '')
                    .map(([label, value]) => `
                        <div class="preview-cell">
                            <span class="preview-label">${label}</span>
                            <span class="preview-value">${value}</span>
                        </div>
                    `).join('')}
            </div>
        </div>
    `;

    const resumeCell = s.resumeUrl
        ? `<a href="${RESUME_BASE_URL}/${encodeURIComponent(s.resumeUrl)}" target="_blank" rel="noopener">View / download</a>`
        : null;

    const body = document.getElementById('profilePreviewBody');
    if (body) {
        body.innerHTML =
            section('Contact', [
                ['Email', escapeHtml(s.email)],
                ['Phone', escapeHtml(s.phone)],
                ['City', escapeHtml(s.city)],
                ['State', escapeHtml(s.state)]
            ]) +
            section('Academic', [
                ['CGPA', s.cgpa != null ? s.cgpa : null],
                ['Backlogs', s.activeBacklogs != null ? s.activeBacklogs : null],
                ['Grad. year', s.graduationYear != null ? s.graduationYear : null],
                ['Duration', s.courseDuration != null ? `${s.courseDuration} yr` : null]
            ]) +
            section('Other', [
                ['Gender', escapeHtml(s.gender)],
                ['Date of birth', escapeHtml(s.dateOfBirth)],
                ['Resume', resumeCell]
            ]);
    }

    if (window.bootstrap) {
        bootstrap.Modal.getOrCreateInstance(document.getElementById('profilePreviewModal')).show();
    }
}
/* ---------------------------- Summary panel ---------------------------- */
function updateSummary(s) {
    const nameEl = document.getElementById('summaryName');
    const metaEl = document.getElementById('summaryMeta');
    const chipName = document.querySelector('.profile-chip-text strong');
    const chipMeta = document.querySelector('.profile-chip-text span');
    const displayName = resolveStudentName(s);

    if (nameEl) nameEl.textContent = displayName || 'Student';
     if (metaEl) metaEl.textContent = [branchDisplayLabel(resolveStudentBranch(s)), s.prnNo].filter(Boolean).join(' • ');
    if (chipName) chipName.textContent = displayName || 'Student';
    if (chipMeta) chipMeta.textContent = branchDisplayLabel(resolveStudentBranch(s));

    if (s.profilePhoto) {
        const img = document.querySelector('.profile-chip img');
        if (img) img.src = `http://localhost:8080/uploads/student-photos/${s.profilePhoto}`;
    }

    const verifiedPill = document.getElementById('verifiedPill');
    const placedPill = document.getElementById('placedPill');
    if (verifiedPill) {
        verifiedPill.className = 'status-pill ' + (s.verified ? 'is-good' : 'is-neutral');
        verifiedPill.innerHTML = s.verified
            ? '<i class="bi bi-patch-check-fill"></i> Verified'
            : '<i class="bi bi-hourglass-split"></i> Not verified yet';
    }
    if (placedPill) {
        placedPill.className = 'status-pill ' + (s.placed ? 'is-good' : '');
        placedPill.innerHTML = s.placed
            ? '<i class="bi bi-briefcase-fill"></i> Placed'
            : '<i class="bi bi-briefcase"></i> Not placed yet';
    }
}

/* ---------------------------- Completion % ---------------------------- */
// Fields that count toward completeness. Core signup fields (name, prnNo,
// branch, email, phone, password) are collected at signup, so they aren't
// weighted here — this tracks the fields a student fills in afterwards.
const COMPLETION_FIELDS = [
    'gender', 'dateOfBirth', 'city', 'state', 'address',
    'cgpa', 'activeBacklogs', 'graduationYear', 'courseDuration', 'resumeUrl'
];

function computeCompletion(s) {
    const filled = COMPLETION_FIELDS.filter(key => {
        const v = s[key];
        return v !== null && v !== undefined && v !== '';
    });
    const percent = Math.round((filled.length / COMPLETION_FIELDS.length) * 100);
    const missing = COMPLETION_FIELDS.filter(key => !filled.includes(key));
    return { percent, missing };
}

const FIELD_LABELS = {
    gender: 'Gender',
    dateOfBirth: 'Date of birth',
    city: 'City',
    state: 'State',
    address: 'Address',
    cgpa: 'CGPA',
    activeBacklogs: 'Active backlogs',
    graduationYear: 'Graduation year',
    courseDuration: 'Course duration',
    resumeUrl: 'Resume'
};

function updateCompletion(s) {
    const { percent, missing } = computeCompletion(s);

    setRing('mainRingFg', 326.7, percent);
    setRing('sidebarRingFg', 169.6, percent);

    const mainLabel = document.getElementById('mainRingLabel');
    const sideLabel = document.getElementById('sidebarRingLabel');
    if (mainLabel) mainLabel.textContent = `${percent}%`;
    if (sideLabel) sideLabel.textContent = `${percent}%`;

    const hint = document.getElementById('summaryHint');
    if (hint) {
        hint.textContent = percent === 100
            ? "Your profile is fully filled in — nice work."
            : `${missing.length} field${missing.length === 1 ? '' : 's'} left to complete your profile.`;
    }

    const list = document.getElementById('missingFieldsList');
    if (list) {
        list.innerHTML = '';
        if (missing.length === 0) {
            const li = document.createElement('li');
            li.className = 'missing-empty';
            li.textContent = 'Nothing left — you\'re all set.';
            list.appendChild(li);
        } else {
            missing.forEach(key => {
                const li = document.createElement('li');
                li.textContent = FIELD_LABELS[key] || key;
                list.appendChild(li);
            });
        }
    }
}

function setRing(id, circumference, percent) {
    const el = document.getElementById(id);
    if (!el) return;
    const offset = circumference - (circumference * percent) / 100;
    el.style.strokeDasharray = `${circumference}`;
    el.style.strokeDashoffset = `${offset}`;
}

/* ---------------------------- Validation ----------------------------
   Each field owns its own validator and its own error message/element, so
   one field's state never depends on, or clears, another field's error.
   The same validators back both live (blur/change) validation and the
   full submit-time check.
   ------------------------------------------------------------------- */
function requiredCheck(id, message) {
    const el = document.getElementById(id);
    if (!el || !el.value || !el.value.trim()) return message;
    return null;
}

const FIELD_VALIDATORS = {
    f_name: () => requiredCheck('f_name', 'Full name is required'),
    f_prn: () => requiredCheck('f_prn', 'PRN number is required'),
    f_branch: () => requiredCheck('f_branch', 'Please choose a branch'),

    f_email: () => {
        const v = document.getElementById('f_email').value.trim();
        if (!/^\S+@\S+\.\S+$/.test(v)) return 'Enter a valid email address';
        return null;
    },

    f_phone: () => {
        const v = document.getElementById('f_phone').value.trim();
        if (!/^[6-9]\d{9}$/.test(v)) return 'Enter a valid 10-digit phone number';
        return null;
    },

    f_dob: () => {
        const v = document.getElementById('f_dob').value;
        if (!v) return null; // optional field
        const dob = new Date(v + 'T00:00:00');
        if (isNaN(dob.getTime())) return 'Enter a valid date';
        const today = new Date();
        if (dob > today) return 'Date of birth can\'t be in the future';
        const ageYears = (today - dob) / (1000 * 60 * 60 * 24 * 365.25);
        if (ageYears < 15) return 'You must be at least 15 years old';
        if (ageYears > 100) return 'Enter a valid date of birth';
        return null;
    },

    f_cgpa: () => {
        const v = document.getElementById('f_cgpa').value;
        if (v === '') return null;
        const n = Number(v);
        if (isNaN(n) || n < 0 || n > 10) return 'CGPA must be between 0 and 10';
        return null;
    },

    f_backlogs: () => {
        const v = document.getElementById('f_backlogs').value;
        if (v === '') return null;
        const n = Number(v);
        if (isNaN(n) || n < 0) return 'Active backlogs can\'t be negative';
        return null;
    },

    f_gradyear: () => {
        const v = document.getElementById('f_gradyear').value;
        if (v === '') return null;
        const n = Number(v);
        const currentYear = new Date().getFullYear();
        const min = currentYear - 10;
        const max = currentYear + 10;
        if (!Number.isInteger(n) || n < min || n > max) {
            return `Enter a valid graduation year (${min}–${max})`;
        }
        return null;
    },

    f_duration: () => {
        const v = document.getElementById('f_duration').value;
        const n = Number(v);
        if (v === '' || isNaN(n) || n < 1 || n > 10) return 'Course duration must be 1–10 years';
        return null;
    }
};

function validateField(id) {
    const validator = FIELD_VALIDATORS[id];
    if (!validator) return true;
    const message = validator();
    if (message) {
        showFieldError(id, message);
        return false;
    }
    clearFieldError(id);
    return true;
}

function validateForm() {
    let allOk = true;
    Object.keys(FIELD_VALIDATORS).forEach(id => {
        const fieldOk = validateField(id);
        allOk = allOk && fieldOk;
    });
    return allOk;
}

function showFieldError(id, message) {
    const el = document.getElementById(id);
    if (el) el.classList.add('is-invalid');
    const errEl = document.querySelector(`.field-error[data-for="${id}"]`);
    if (errEl) errEl.textContent = message;
}

function clearFieldError(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('is-invalid');
    const errEl = document.querySelector(`.field-error[data-for="${id}"]`);
    if (errEl) errEl.textContent = '';
}

// Named clearAllFieldErrors (not clearErrors) on purpose: student-auth.js
// also declares a top-level function called clearErrors with a different
// signature (it takes an array of ids). Both scripts load in the same global
// scope, so whichever loaded second was silently overwriting the other —
// meaning "Discard changes" could throw depending on script load order.
function clearAllFieldErrors() {
    document.querySelectorAll('.field-error').forEach(el => el.textContent = '');
    document.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
}

/* ---------------------------- Save ---------------------------- */
function buildUpdatePayload() {
    // Round-trip fields the UI doesn't edit, using the exact JSON keys
    // StudentUpdateRequest expects (note: "placed"/"verified", not
    // "isPlaced"/"isVerified" — Lombok's boolean getter/setter convention).
    //
    // - fullName IS editable from this form now — send the input's value.
    // - PRN/email/phone/branch stay read-only in the UI and are always sent
    //   back from ORIGINAL_PROFILE so the backend contract doesn't change.
    //   Branch specifically must go back through branchLookupFor() because
    //   ORIGINAL_PROFILE.branch is the enum name() (e.g. "COMPUTER_ENGINEERING")
    //   but /updateProfile expects the lookup display string.
    return {
        id: ORIGINAL_PROFILE ? ORIGINAL_PROFILE.id : undefined,
        fullName: document.getElementById('f_name').value.trim(),
        prnNo: ORIGINAL_PROFILE ? ORIGINAL_PROFILE.prnNo : document.getElementById('f_prn').value.trim(),
        branch: (() => {
    const raw = ORIGINAL_PROFILE ? resolveStudentBranch(ORIGINAL_PROFILE) : null;
    if (!raw) return null;
    const opt = findBranchOption(raw);
    return opt ? opt.lookup : raw;
})(),
        email: ORIGINAL_PROFILE ? ORIGINAL_PROFILE.email : document.getElementById('f_email').value.trim(),
        phone: ORIGINAL_PROFILE ? ORIGINAL_PROFILE.phone : document.getElementById('f_phone').value.trim(),
        city: document.getElementById('f_city').value.trim() || null,
        state: document.getElementById('f_state').value.trim() || null,
        address: document.getElementById('f_address').value.trim() || null,
        gender: document.getElementById('f_gender').value || null,
        dateOfBirth: document.getElementById('f_dob').value || null,
        cgpa: numOrNull('f_cgpa'),
        activeBacklogs: intOrNull('f_backlogs'),
        graduationYear: intOrNull('f_gradyear'),
        courseDuration: intOrNull('f_duration'),
        profilePhoto: ORIGINAL_PROFILE ? ORIGINAL_PROFILE.profilePhoto : null,
        idCardPhoto: ORIGINAL_PROFILE ? ORIGINAL_PROFILE.idCardPhoto : null,
        resumeUrl: ORIGINAL_PROFILE ? ORIGINAL_PROFILE.resumeUrl : null, // resume is updated via /uploadResume, not this form
        placed: ORIGINAL_PROFILE ? !!ORIGINAL_PROFILE.placed : false,
        verified: ORIGINAL_PROFILE ? !!ORIGINAL_PROFILE.verified : false
    };
}

function numOrNull(id) {
    const v = document.getElementById(id).value;
    return v === '' ? null : Number(v);
}
function intOrNull(id) {
    const v = document.getElementById(id).value;
    return v === '' ? null : parseInt(v, 10);
}

async function saveProfile(e) {
    e.preventDefault();
    if (!validateForm()) {
        setSaveStatus('Please fix the highlighted fields.', 'err');
        return;
    }

    const btn = document.getElementById('saveBtn');
    btn.disabled = true;
    setSaveStatus('Saving…', '');

    try {
        const res = await fetch(`${PROFILE_API}/updateProfile`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(buildUpdatePayload())
        });

        if (!res.ok) {
            let detail = '';
            try { detail = (await res.json())?.message || await res.text(); } catch (_) {}
            throw new Error(detail || `status ${res.status}`);
        }

        // Re-fetch rather than trusting this response's shape directly —
        // if /updateProfile ever returns a partial object, using it as-is
        // would make the completion ring regress even though the backend
        // saved everything correctly. fetchProfile() uses cache: 'no-store',
        // so this is guaranteed to reflect what was just saved.
        await res.json();
        const refreshed = await fetchProfile();
        if (refreshed) setSaveStatus('Saved.', 'ok');
    } catch (err) {
        console.error('Profile save error:', err);
        setSaveStatus(`Couldn't save: ${err.message}`, 'err');
    } finally {
        btn.disabled = false;
    }
}

/* ---------------------------- Resume upload ---------------------------- */
// Bumped from 5MB to 10MB. NOTE: if the backend still rejects uploads with
// "Maximum upload size exceeded", that error is coming from Spring's
// multipart config, not from here — also raise
// spring.servlet.multipart.max-file-size and max-request-size (e.g. to 10MB)
// in application.properties, or this client-side check will pass files the
// server still bounces.
const RESUME_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const RESUME_ALLOWED_EXT = ['.pdf', '.doc', '.docx'];

async function handleResumeFileChange(e) {
    const input = e.target;
    const file = input.files && input.files[0];
    if (!file) return;

    const dotIndex = file.name.lastIndexOf('.');
    const ext = dotIndex >= 0 ? file.name.slice(dotIndex).toLowerCase() : '';

    if (!RESUME_ALLOWED_EXT.includes(ext)) {
        showFieldError('f_resume_file', 'Only PDF or Word documents (.pdf, .doc, .docx) are allowed');
        input.value = '';
        return;
    }
    if (file.size > RESUME_MAX_BYTES) {
        showFieldError('f_resume_file', 'File is too large — max 10 MB');
        input.value = '';
        return;
    }
    clearFieldError('f_resume_file');

    const formData = new FormData();
    formData.append('resume', file);

    setSaveStatus('Uploading resume…', '');
    try {
        const res = await fetch(`${PROFILE_API}/uploadResume`, {
            method: 'POST',
            credentials: 'include',
            body: formData
        });

        if (!res.ok) {
            let detail = '';
            try { detail = (await res.json())?.message || await res.text(); } catch (_) {}
            throw new Error(detail || `status ${res.status}`);
        }

        // Same reasoning as saveProfile(): don't trust /uploadResume's
        // response shape for recomputing completion. If it only returns
        // resume-related fields (not the full profile), updateCompletion()
        // would compute against a mostly-empty object and the ring would
        // regress (e.g. drop to 30%) even though the resume — and everything
        // else — saved correctly. Re-fetching guarantees we're drawing from
        // the real, full, current profile.
        await res.json();
        const refreshed = await fetchProfile();
        if (refreshed) setSaveStatus('Resume uploaded.', 'ok');
    } catch (err) {
        console.error('Resume upload error:', err);
        setSaveStatus(`Couldn't upload resume: ${err.message}`, 'err');
    } finally {
        input.value = '';
    }
}

function setSaveStatus(message, kind) {
    const el = document.getElementById('saveStatus');
    if (!el) return;
    el.textContent = message;
    el.className = 'save-status' + (kind ? ` ${kind}` : '');
}

/* ---------------------------- Wiring ---------------------------- */
function wireForm() {
    
    const form = document.getElementById('profileForm');
    if (form.dataset.wired) return; // avoid double-binding across pjax re-init
    const previewBtn = document.getElementById('viewPublicProfileBtn');
if (previewBtn) previewBtn.addEventListener('click', showProfilePreview);
    form.dataset.wired = 'true';

    form.addEventListener('submit', saveProfile);

    const resetBtn = document.getElementById('resetBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (ORIGINAL_PROFILE) {
                populateForm(ORIGINAL_PROFILE);
                clearAllFieldErrors();
                setSaveStatus('Changes discarded.', '');
            }
        });
    }

    const resumeFileInput = document.getElementById('f_resume_file');
    if (resumeFileInput) {
        resumeFileInput.addEventListener('change', handleResumeFileChange);
    }

    // Independent, per-field validation: each field validates and clears
    // only its own error, on blur (or change for selects/dates).
    Object.keys(FIELD_VALIDATORS).forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const evt = (el.tagName === 'SELECT' || el.type === 'date') ? 'change' : 'blur';
        el.addEventListener(evt, () => validateField(id));
    });

    // Live-recompute the completion ring as the student types, using
    // current form values layered over the last-fetched profile.
    form.addEventListener('input', () => {
        if (!ORIGINAL_PROFILE) return;
        updateCompletion({ ...ORIGINAL_PROFILE, ...buildUpdatePayloadForPreview() });
    });
}

// Lightweight variant of buildUpdatePayload() using COMPLETION_FIELDS' own
// keys (dateOfBirth, activeBacklogs, etc.) for the live-preview ring.
function buildUpdatePayloadForPreview() {
    return {
        gender: document.getElementById('f_gender').value || null,
        dateOfBirth: document.getElementById('f_dob').value || null,
        city: document.getElementById('f_city').value.trim() || null,
        state: document.getElementById('f_state').value.trim() || null,
        address: document.getElementById('f_address').value.trim() || null,
        cgpa: numOrNull('f_cgpa'),
        activeBacklogs: intOrNull('f_backlogs'),
        graduationYear: intOrNull('f_gradyear'),
        courseDuration: intOrNull('f_duration')
        // resumeUrl intentionally omitted: it only changes via /uploadResume
    };
}

/* ---------------------------- Chrome boot (sidebar/topbar init lives in student_dashboard.js) ---------------------------- */
// NOTE: student_dashboard.js is "the single source of truth for the student
// sidebar across every student page" and already calls highlightActiveLink(),
// renderNotifBadge(), initTopbarProfile(), and initPageTransitions() in its
// own DOMContentLoaded listener. Calling them again here caused a second,
// independent /profile fetch to race the first one — that's why the topbar
// looked different before vs. after a refresh. Do NOT duplicate that init
// here; my-profile.js only needs to boot its own form.

/* ---------------------------- Boot (works for first load AND pjax nav) ---------------------------- */
/* ---------------------------- Boot (works for first load AND pjax nav) ---------------------------- */
/* ---------------------------- Boot (works for first load AND pjax nav) ---------------------------- */
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMyProfilePageContent, { once: true });
} else {
    initMyProfilePageContent();
}

})(); // end IIFE