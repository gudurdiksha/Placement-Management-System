/* ============================================================
   Create Job Posting — form controller (job-posting-create.js)
   This file is ONLY for job-posting-create.html.
   Do NOT include job-postings.js (the list page script) here.
============================================================= */

const JOB_TYPE_LABELS = {
  FULL_TIME: "Full Time",
  PART_TIME: "Part Time",
  INTERNSHIP: "Internship",
  CONTRACT: "Contract",
  REMOTE: "Remote"
};

const jcState = { skills: [], qualifications: [], submitting: false };

let form, fields, skillInput, skillTagsEl, skillBoxEl, submitBtn, submitLabel, progressBar, progressFill;

/* ============ PROFILE COMPLETION GATE ============ */
async function getProfileCompletion(){
  let profile = (window.Session && Session.getCachedProfile) ? Session.getCachedProfile() || {} : {};
  try {
    const res = await fetch(`${COMPANY_API_BASE}/profile`, { method: 'GET', credentials: 'include' });
    if (res.ok) {
      const remote = await res.json();
      profile = Object.assign({}, profile, remote);
      Session.setCachedProfile(profile);
    }
  } catch (err) {
    console.warn('Could not verify profile completion from server, using cached copy.', err);
  }
  return Session.computeCompletion(profile);
}

function promptCompleteProfile(percent){
  if (window.M && M.toast) {
    M.toast({ html: `Complete your company profile (${percent}% done) before posting a job.`, displayLength: 4000, classes: 'red' });
  } else {
    alert(`Complete your company profile (${percent}% done) before posting a job.`);
  }
}

async function guardProfileComplete(redirectIfIncomplete = true){
  const result = await getProfileCompletion();
  if (!result.isComplete) {
    promptCompleteProfile(result.percent);
    if (redirectIfIncomplete) setTimeout(() => { window.location.href = 'profile.html'; }, 1200);
    return false;
  }
  return true;
}

/* ============ INIT — single entry point ============ */
document.addEventListener('DOMContentLoaded', async () => {

  // Grab all elements AFTER the DOM is ready — never at top-level.
  form = document.getElementById('job-create-form');
  fields = {
    title: document.getElementById('f-title'),
    role: document.getElementById('f-role'),
    department: document.getElementById('f-department'),
    location: document.getElementById('f-location'),
    jobType: document.getElementById('f-jobType'),
    description: document.getElementById('f-description'),
   // experienceRequired: document.getElementById('f-experience'),
    // qualification: document.getElementById('f-qualification'),
    minSalary: document.getElementById('f-minSalary'),
    maxSalary: document.getElementById('f-maxSalary'),
    numberOfOpenings: document.getElementById('f-openings'),
    applicationDeadline: document.getElementById('f-deadline')
  };
  skillInput = document.getElementById('f-skill-input');
  skillTagsEl = document.getElementById('skill-tags');
  skillBoxEl = document.getElementById('skill-box');
  submitBtn = document.getElementById('jc-submit-btn');
  submitLabel = document.getElementById('jc-submit-label');
  progressBar = document.getElementById('jc-progress');
  progressFill = document.getElementById('jc-progress-fill');

 const missing = Object.entries(fields).filter(([k, el]) => !el).map(([k]) => k);
if (!form) {
  console.error('job-posting-create.js: form #job-create-form not found.');
  return;
}
if (missing.length) {
  console.error('job-posting-create.js: missing fields ->', missing);
  if (window.M && M.toast) M.toast({ html: 'Some form fields failed to load — check console.', classes: 'red' });
  // DON'T return — let the rest of the script wire up whatever exists
}

  // Profile completion gate
  let allowed = true;
  try {
    allowed = await guardProfileComplete();
  } catch (err) {
    console.error('Profile completion check failed, allowing form to load:', err);
    allowed = true; // fail open
  }
  if (!allowed) {
    submitBtn.disabled = true;
    form.querySelectorAll('input, select, textarea, button').forEach(el => {
      if (el !== submitBtn) el.disabled = true;
    });
    return;
  }

  // --- Deadline field: block past dates properly ---
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  fields.applicationDeadline.min = tomorrow.toISOString().split('T')[0];
  // If a stale/old value somehow got set (e.g. browser autofill), clear it.
  if (fields.applicationDeadline.value) {
    const chosen = new Date(fields.applicationDeadline.value + 'T00:00:00');
    if (chosen < tomorrow) fields.applicationDeadline.value = '';
  }

  bindCharCounter(fields.title, 'count-title', 150);
  bindCharCounter(fields.description, 'count-description', 5000);

  Object.entries(fields).forEach(([key, el]) => {
    if (!el) return;  
    el.addEventListener('input', () => { clearFieldError(key); updatePreview(); updateProgress(); });
    el.addEventListener('change', () => { clearFieldError(key); updatePreview(); updateProgress(); });
    el.addEventListener('blur', () => validateField(key));
  });

  skillInput.addEventListener('keydown', onSkillKeydown);
  skillInput.addEventListener('blur', () => { addSkillFromInput(); validateField('skillsRequired'); });

  // ---- Qualification tag input ----
const qualInput = document.getElementById('f-qualification-input');
const qualTagsEl = document.getElementById('qualification-tags');

if (qualInput && qualTagsEl) {
  qualInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addQualificationFromInput();
    } else if (e.key === 'Backspace' && qualInput.value === '' && jcState.qualifications.length) {
      removeQualification(jcState.qualifications.length - 1);
    }
  });
  qualInput.addEventListener('blur', () => {
    addQualificationFromInput();
    validateField('qualification');
  });
}

function addQualificationFromInput() {
  const raw = qualInput.value.trim().replace(/,+$/, '');
  if (!raw) return;
  const exists = jcState.qualifications.some(q => q.toLowerCase() === raw.toLowerCase());
  if (!exists) jcState.qualifications.push(raw);
  qualInput.value = '';
  renderQualifications();
  clearFieldError('qualification');
  updateProgress();
}

function removeQualification(index) {
  jcState.qualifications.splice(index, 1);
  renderQualifications();
  updateProgress();
}
window.removeQualification = removeQualification;

function renderQualifications() {
  qualTagsEl.innerHTML = jcState.qualifications.map((q, i) => `
    <span class="jc-tag">${escapeHtml(q)}
      <button type="button" aria-label="Remove ${escapeHtml(q)}"
              onclick="removeQualification(${i})">
        <i class="material-icons">close</i>
      </button>
    </span>
  `).join('');
}
  form.addEventListener('submit', onSubmit);

  updatePreview();
});

/* ============ CHARACTER COUNTERS ============ */
function bindCharCounter(el, counterId, max){
  const counter = document.getElementById(counterId);
  if (!counter) return;
  const update = () => { counter.textContent = `${el.value.length} / ${max}`; };
  el.addEventListener('input', update);
  update();
}

/* ============ PROGRESS BAR ============ */
function updateProgress(){
  const required = [fields.title, fields.location, fields.jobType, fields.description, fields.numberOfOpenings, fields.applicationDeadline];
  let filled = required.filter(f => String(f.value || '').trim() !== '').length;
  if (jcState.skills.length) filled += 1;
  const totalTracked = required.length + 1;
  const pct = Math.round((filled / totalTracked) * 100);
  if (progressBar) progressBar.classList.add('active');
  if (progressFill) progressFill.style.width = pct + '%';
}

/* ============ SKILLS TAG INPUT ============ */
function onSkillKeydown(e){
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    addSkillFromInput();
  } else if (e.key === 'Backspace' && skillInput.value === '' && jcState.skills.length) {
    removeSkill(jcState.skills.length - 1);
  }
}

function addSkillFromInput(){
  const raw = skillInput.value.trim().replace(/,+$/, '');
  if (!raw) return;
  const exists = jcState.skills.some(s => s.toLowerCase() === raw.toLowerCase());
  if (!exists) jcState.skills.push(raw);
  skillInput.value = '';
  renderSkills();
  clearFieldError('skillsRequired');
  updatePreview();
  updateProgress();
}

function removeSkill(index){
  jcState.skills.splice(index, 1);
  renderSkills();
  updatePreview();
  updateProgress();
}

function renderSkills(){
  skillTagsEl.innerHTML = jcState.skills.map((s, i) => `
    <span class="jc-tag">${escapeHtml(s)}
      <button type="button" aria-label="Remove ${escapeHtml(s)}" onclick="removeSkill(${i})"><i class="material-icons">close</i></button>
    </span>
  `).join('');
}
window.removeSkill = removeSkill;

/* ============ LIVE PREVIEW ============ */
function updatePreview(){
  const title = fields.title.value.trim();
  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  const setHtml = (id, val) => { const el = document.getElementById(id); if (el) el.innerHTML = val; };

  setText('pv-title', title || 'Untitled Job');
  setText('pv-badge', initials(title || 'Job Draft'));
  setText('pv-description', fields.description.value.trim() || 'Your job description will appear here as you type.');
  setHtml('pv-tags', jcState.skills.map(s => `<span class="job-tag">${escapeHtml(s)}</span>`).join(''));
  setText('pv-role', fields.role.value.trim() || '—');
  setText('pv-type', JOB_TYPE_LABELS[fields.jobType.value] || '—');
  setText('pv-location', fields.location.value.trim() || '—');
  setText('pv-openings', fields.numberOfOpenings.value || '—');

  const min = fields.minSalary.value, max = fields.maxSalary.value;
  setText('pv-salary', (min !== '' && max !== '') ? `₹${min} - ${max} LPA` : 'Not disclosed');

  const deadline = fields.applicationDeadline.value;
  setText('pv-deadline', deadline
    ? new Date(deadline).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—');
}

function initials(title){
  return title.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'JD';
}
function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ============ VALIDATION ============ */
function validateField(key){
  const errors = runValidation();
  if (errors[key]) showFieldError(key, errors[key]); else clearFieldError(key);
  return !errors[key];
}

function runValidation(){
  const errors = {};

  const title = fields.title.value.trim();
  if (!title) errors.title = 'Title is required.';
  else if (title.length > 150) errors.title = 'Title must be under 150 characters.';

  const description = fields.description.value.trim();
  if (!description) errors.description = 'Description is required.';
  else if (description.length > 5000) errors.description = 'Description is too long (max 5000 characters).';

  const location = fields.location.value.trim();
  if (!location) errors.location = 'Location is required.';

  const jobType = fields.jobType.value;
  if (!jobType || !JOB_TYPE_LABELS[jobType]) errors.jobType = 'Please select a job type.';

  if (jcState.skills.length === 0) errors.skillsRequired = 'Add at least one required skill.';

  if (jcState.qualifications.length === 0) {
  errors.qualification = 'Add at least one eligible qualification.';
}

  const openings = fields.numberOfOpenings.value;
  if (openings === '' || openings === null) errors.numberOfOpenings = 'Number of openings is required.';
  else if (!Number.isInteger(Number(openings)) || Number(openings) < 1) errors.numberOfOpenings = 'There must be at least 1 opening.';

  const deadline = fields.applicationDeadline.value;
  if (!deadline) {
    errors.applicationDeadline = 'Application deadline is required.';
  } else {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const chosen = new Date(deadline + 'T00:00:00');
    if (chosen <= today) errors.applicationDeadline = 'Deadline must be a future date — past dates are not allowed.';
  }

  const min = fields.minSalary.value, max = fields.maxSalary.value;
  if (min !== '' && Number(min) < 0) errors.minSalary = 'Min salary cannot be negative.';
  if (max !== '' && Number(max) < 0) errors.maxSalary = 'Max salary cannot be negative.';
  if (min !== '' && max !== '' && Number(max) < Number(min)) errors.maxSalary = 'Max salary cannot be less than min salary.';

  return errors;
}

function showFieldError(key, message){
  const errEl = document.getElementById('err-' + key);
  if (errEl) errEl.textContent = message;
  const container = (key === 'skillsRequired') ? skillBoxEl : (fields[key] ? fields[key].closest('.jc-field') : null);
  if (container) container.classList.add('jc-invalid');
}

function clearFieldError(key){
  const errEl = document.getElementById('err-' + key);
  if (errEl) errEl.textContent = '';
  const container = (key === 'skillsRequired') ? skillBoxEl : (fields[key] ? fields[key].closest('.jc-field') : null);
  if (container) container.classList.remove('jc-invalid');
}

function focusFirstError(errors){
  const order = ['title', 'location', 'jobType', 'description', 'skillsRequired', 'numberOfOpenings', 'applicationDeadline', 'minSalary', 'maxSalary'];
  const firstKey = order.find(k => errors[k]);
  if (!firstKey) return;
  if (firstKey === 'skillsRequired') skillInput.focus();
  else if (fields[firstKey]) fields[firstKey].focus();
}

/* ============ SUBMIT ============ */
async function onSubmit(e){
  e.preventDefault();
  if (jcState.submitting) return;

  const stillAllowed = await guardProfileComplete(false);
  if (!stillAllowed) {
    if (window.M && M.toast) M.toast({ html: 'Your profile is no longer complete. Redirecting…', classes: 'red' });
    setTimeout(() => { window.location.href = '../../company/profile.html'; }, 1200);
    return;
  }

  addSkillFromInput();
  const errors = runValidation();
  Object.keys(fields).forEach(clearFieldError);
  clearFieldError('skillsRequired');

  if (Object.keys(errors).length) {
    Object.entries(errors).forEach(([key, msg]) => showFieldError(key, msg));
    focusFirstError(errors);
    if (window.M && M.toast) M.toast({ html: 'Please fix the highlighted fields before publishing.', classes: 'red' });
    return;
  }

  const payload = {
    title: fields.title.value.trim(),
    description: fields.description.value.trim(),
    department: fields.department.value.trim() || null,
    location: fields.location.value.trim(),
    jobType: fields.jobType.value,
   // experienceRequired: fields.experienceRequired.value.trim() || null,
    skillsRequired: jcState.skills,
    // qualification: fields.qualification.value.trim() || null,
    qualification: jcState.qualifications,
    minSalary: fields.minSalary.value !== '' ? Number(fields.minSalary.value) : null,
    maxSalary: fields.maxSalary.value !== '' ? Number(fields.maxSalary.value) : null,
    numberOfOpenings: Number(fields.numberOfOpenings.value),
    applicationDeadline: fields.applicationDeadline.value
  };

  setSubmitting(true);
  try {
    const res = await fetch(`${API_BASE}/api/jobs/post`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.status === 201) {
      if (window.M && M.toast) {
        M.toast({ 
          html: `"${payload.title}" was published successfully.`, 
          displayLength: 3000,   // 3 seconds, adjust as you like
          classes: 'teal'
        });
      }
      setTimeout(() => {
        window.location.href = '../../company/job-postings.html';
      }, 1200); // give the toast time to actually be seen before navigating
      return;
      }

    if (res.status === 401) {
      let errorMessage = 'Server rejected the request (401).';
      try {
        const errorData = await res.json();
        errorMessage = errorData.message || errorData.error || errorData.detail || errorMessage;
      } catch {
        const errorText = await res.text().catch(() => '');
        if (errorText) errorMessage = errorText;
      }
      console.error('Job posting authentication error:', { status: res.status, url: res.url, message: errorMessage });
      if (window.M && M.toast) M.toast({ html: `Job rejected: ${errorMessage}`, classes: 'red' });
      return;
    }

    if (res.status === 403) {
      const msg = await res.text().catch(() => 'You are not permitted to post this job.');
      if (window.M && M.toast) M.toast({ html: msg || 'You are not permitted to post this job.', classes: 'red' });
      return;
    }

    await handleErrorResponse(res);

  } catch (err) {
    console.error('Job post request failed:', err);
    if (window.M && M.toast) M.toast({ html: `Request failed: ${err?.message || 'Unknown fetch error'}`, classes: 'red' });
  } finally {
    setSubmitting(false);
  }
}

async function handleErrorResponse(res){
  let body;
  const raw = await res.text().catch(() => '');
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }

  const fieldErrorList = body?.errors || body?.fieldErrors;
  if (Array.isArray(fieldErrorList) && fieldErrorList.length) {
    fieldErrorList.forEach(fe => {
      const key = fe.field || fe.fieldName;
      const msg = fe.defaultMessage || fe.message;
      if (key && msg) showFieldError(key, msg);
    });
    if (window.M && M.toast) M.toast({ html: 'Please fix the highlighted fields before publishing.', classes: 'red' });
    return;
  }
  if (fieldErrorList && typeof fieldErrorList === 'object') {
    Object.entries(fieldErrorList).forEach(([key, msg]) => showFieldError(key, Array.isArray(msg) ? msg[0] : msg));
    if (window.M && M.toast) M.toast({ html: 'Please fix the highlighted fields before publishing.', classes: 'red' });
    return;
  }

  const message = body?.message || (typeof body === 'string' ? body : null) || raw || 'Something went wrong while posting this job.';
  if (window.M && M.toast) M.toast({ html: message, classes: 'red' });
}

function setSubmitting(isSubmitting){
  jcState.submitting = isSubmitting;
  submitBtn.disabled = isSubmitting;
  submitLabel.innerHTML = isSubmitting
    ? '<span class="jc-spinner"></span>Publishing…'
    : 'Publish Job Posting';
  if (progressBar) progressBar.classList.toggle('active', !isSubmitting);
}