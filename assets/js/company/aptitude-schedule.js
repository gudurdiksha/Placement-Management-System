/* ============================================================
   aptitude-schedule.js
   Owns the "Schedule Aptitude Test" modal:
     - Excel upload → parsed locally → preview
     - OR external link mode
     - Schedule fields (date, time, duration)
     - Generates student test link on save
   Exposes: window.AptitudeSchedule = { open, fetchScheduledJobIds }
   ============================================================ */

(function () {
  'use strict';
   // Near top of file / module scope
let scheduledJobIds = new Set();
  const API = (typeof API_BASE !== 'undefined' ? API_BASE : '') + '/api/aptitude';
  let onScheduledCallback = null;
  let currentJob = null;
  let parsedQuestions = [];     // [{question, a,b,c,d,correct,marks,topic,difficulty}]
  let parsedMeta = null;        // {totalQuestions, totalMarks, passingMarks}

  /* ---------- public API ---------- */
  const AptitudeSchedule = {
    open(job, onScheduled) {
      // ✅ NEW: Only Active jobs may be scheduled
    const status = String(job.status || job.jobStatus || '').trim().toLowerCase();
    if (status && status !== 'active') {
      showToast('Only Active jobs can be scheduled for an aptitude test.');
      return;
    }
      currentJob = job;
      onScheduledCallback = onScheduled || null;
      ensureModal();
      resetForm();
      document.getElementById('as-job-label').textContent =
        `${job.title} · ${job.department || '—'} · Deadline ${fmtDate(job.applicationDeadline)}`;
      prefillDefaults();
      prefillExisting(job.id);
      show(document.getElementById('as-modal'));
    },

    async fetchScheduledJobIds() {
      try {
        const companyId = window.COMPANY_ID || await guessCompanyId();
        if (!companyId) return new Set();
        const res = await fetch(`${API}/my-schedules?companyId=${companyId}`, {
          credentials: 'include'
        });
        if (!res.ok) return new Set();
        const list = await res.json();
        return new Set(list.map(s => String(s.jobId)));
      } catch {
        return new Set();
      }
    }
  };

  window.AptitudeSchedule = AptitudeSchedule;

  /* ---------- companyId guess (jobs API has it) ---------- */
  async function guessCompanyId() {
    try {
      const res = await fetch((typeof API_BASE !== 'undefined' ? API_BASE : '') + '/api/jobs/my-jobs', {
        credentials: 'include'
      });
      if (!res.ok) return null;
      const jobs = await res.json();
      const first = Array.isArray(jobs) ? jobs.find(j => j.companyId != null) : null;
      return first ? first.companyId : null;
    } catch { return null; }
  }

  /* ---------- modal markup ---------- */
  function ensureModal() {
    if (document.getElementById('as-modal')) return;

    const wrap = document.createElement('div');
    wrap.innerHTML = `
    <div class="mj-modal-overlay" id="as-modal" hidden>
      <div class="mj-modal mj-modal-wide">
        <button type="button" class="mj-modal-close" data-as-close>&times;</button>
        <h5>Schedule Aptitude Test</h5>
        <p class="as-job-meta" id="as-job-label"></p>

        <form id="as-form" novalidate>

          <!-- STEP 1: SOURCE -->
          <div class="as-section">
            <div class="as-section-title">1. Test Source</div>

            <div class="as-radio-row">
              <label class="as-radio">
                <input type="radio" name="sourceType" value="excel_upload" checked>
                <span>Upload question paper (Excel)</span>
              </label>
              <label class="as-radio">
                <input type="radio" name="sourceType" value="external_link">
                <span>External link (Google Form / other)</span>
              </label>
            </div>

            <!-- Excel block -->
            <div id="as-excel-block">
              <div class="as-dropzone" id="as-dropzone">
                <svg viewBox="0 0 24 24" width="28" height="28"><path fill="currentColor" d="M19 15v4H5v-4H3v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4zM12 3l-5 5h3v6h4V8h3z"/></svg>
                <p><strong>Click to upload</strong> or drag your .xlsx / .csv here</p>
                <p class="as-hint">Expected columns: question, option_a, option_b, option_c, option_d, correct, marks, topic, difficulty</p>
                <input type="file" id="as-file" accept=".xlsx,.xls,.csv" hidden>
              </div>

              <div class="as-file-row" id="as-file-row" hidden>
                <div>
                  <div class="as-file-name" id="as-file-name"></div>
                  <div class="as-file-meta" id="as-file-meta"></div>
                </div>
                <button type="button" class="as-remove-file" id="as-remove-file">Remove</button>
              </div>

              <div class="as-preview" id="as-preview" hidden>
                <div class="as-preview-head">
                  <strong>Preview</strong>
                  <span id="as-preview-count"></span>
                </div>
                <div class="as-preview-scroll">
                  <table class="as-preview-table" id="as-preview-table"></table>
                </div>
              </div>

              <div class="as-actions-inline">
                <button type="button" class="as-link-btn" id="as-download-template">
                  ⬇ Download Excel template
                </button>
              </div>
            </div>

            <!-- External link block -->
            <div id="as-external-block" hidden>
              <div class="jc-field">
                <label>External test URL *</label>
                <input type="url" name="externalUrl" placeholder="https://forms.gle/... or any test URL">
                <p class="as-hint">Students will be redirected here. Auto-grading and analytics won't be available for external links — you'll need to upload scores manually.</p>
              </div>
            </div>
          </div>

          <!-- STEP 2: SCHEDULE -->
          <div class="as-section">
            <div class="as-section-title">2. Schedule</div>
            <div class="as-grid-2">
              <div class="jc-field">
                <label>Test Date *</label>
                <input type="date" name="testDate" required>
              </div>
              <div class="jc-field">
                <label>Start Time *</label>
                <input type="time" name="startTime" required>
              </div>
            </div>
            <div class="as-grid-2">
              <div class="jc-field">
                <label>Duration (minutes) *</label>
                <input type="number" name="durationMinutes" min="10" max="300" value="60" required>
              </div>
              <div class="jc-field">
                <label>End Time (auto)</label>
                <input type="text" name="endTimeDisplay" readonly tabindex="-1">
              </div>
            </div>
            <div class="as-grid-2">
              <div class="jc-field">
                <label>Mode</label>
                <select name="mode">
                  <option value="ONLINE" selected>Online (in-app)</option>
                  <option value="OFFLINE">Offline / On-campus</option>
                </select>
              </div>
              <div class="jc-field" id="as-venue-field" hidden>
                <label>Venue *</label>
                <input type="text" name="venue" placeholder="Room 302, Block A">
              </div>
            </div>
          </div>

          <!-- STEP 3: MARKING (auto from excel, editable) -->
          <div class="as-section">
            <div class="as-section-title">3. Marking</div>
            <div class="as-grid-3">
              <div class="jc-field">
                <label>Total Questions</label>
                <input type="number" name="totalQuestions" readonly>
              </div>
              <div class="jc-field">
                <label>Total Marks</label>
                <input type="number" name="totalMarks" readonly>
              </div>
              <div class="jc-field">
                <label>Passing Marks</label>
                <input type="number" name="passingMarks" min="0">
              </div>
            </div>
          </div>

          <!-- STEP 4: INSTRUCTIONS -->
          <div class="as-section">
            <div class="as-section-title">4. Instructions for candidates</div>
            <div class="jc-field">
              <textarea name="instructions" rows="3"
                placeholder="e.g. Sections: Aptitude, Reasoning, Coding. No calculators allowed."></textarea>
            </div>
          </div>

          <div class="mj-modal-actions">
            <button type="button" class="action-chip ghost" data-as-close>Cancel</button>
            <button type="submit" class="btn waves-effect waves-light" id="as-submit">
              Save &amp; Generate Link
            </button>
          </div>
        </form>

        <!-- success panel -->
        <div id="as-success" hidden>
          <div class="as-success-icon">✅</div>
          <h5>Test scheduled</h5>
          <p class="as-success-meta" id="as-success-meta"></p>

          <label class="as-label">Student test link</label>
          <div class="as-link-box">
            <input type="text" id="as-link-input" readonly>
            <button type="button" class="as-copy-btn" id="as-copy-btn">Copy</button>
          </div>
          <p class="as-hint">Students will also see this test in their dashboard — it unlocks at the scheduled start time.</p>

          <div class="mj-modal-actions">
            <button type="button" class="action-chip ghost" id="as-close-success">Close</button>
            <button type="button" class="btn" id="as-view-submissions">View submissions</button>
          </div>
        </div>
      </div>
    </div>`;
    document.body.appendChild(wrap);

    bindModal();
    injectStyles();
  }

  /* ---------- behaviour ---------- */
  function bindModal() {
    const modal = document.getElementById('as-modal');
    modal.querySelectorAll('[data-as-close]').forEach(btn =>
      btn.addEventListener('click', () => hide(modal))
    );
    modal.addEventListener('click', e => { if (e.target === modal) hide(modal); });

    // source type toggle
    document.querySelectorAll('input[name="sourceType"]').forEach(r =>
      r.addEventListener('change', applySourceType)
    );

    // file upload
    const dz = document.getElementById('as-dropzone');
    const fileInput = document.getElementById('as-file');
    dz.addEventListener('click', () => fileInput.click());
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('is-drag'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('is-drag'));
    dz.addEventListener('drop', e => {
      e.preventDefault(); dz.classList.remove('is-drag');
      if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', () => {
      if (fileInput.files[0]) handleFile(fileInput.files[0]);
    });
    document.getElementById('as-remove-file').addEventListener('click', clearFile);
    document.getElementById('as-download-template').addEventListener('click', downloadTemplate);

    // end-time autocalc
    const form = document.getElementById('as-form');
    ['testDate', 'startTime', 'durationMinutes'].forEach(n =>
      form.elements[n].addEventListener('input', updateEndTime)
    );

    // mode → venue visibility
    form.elements['mode'].addEventListener('change', () => {
      const offline = form.elements['mode'].value === 'OFFLINE';
      document.getElementById('as-venue-field').hidden = !offline;
    });

    form.addEventListener('submit', submitForm);

    // copy link
    document.getElementById('as-copy-btn').addEventListener('click', () => {
      const inp = document.getElementById('as-link-input');
      inp.select(); document.execCommand('copy');
      showToast('Link copied to clipboard');
    });
    document.getElementById('as-close-success').addEventListener('click', () => hide(modal));
    document.getElementById('as-view-submissions').addEventListener('click', () => {
      const t = document.getElementById('as-link-input').dataset.testId;
      if (t) window.location.href = `aptitude-submissions.html?testId=${t}`;
    });
  }

  function applySourceType() {
    const val = document.querySelector('input[name="sourceType"]:checked').value;
    const excel = val === 'excel_upload';
    document.getElementById('as-excel-block').hidden = !excel;
    document.getElementById('as-external-block').hidden = excel;

    // external URL required only when external
    document.getElementById('as-form').elements['externalUrl'].required = !excel;

    // reset totals if switching
    if (!excel) {
      document.getElementById('as-form').elements['totalQuestions'].value = '';
      document.getElementById('as-form').elements['totalMarks'].value = '';
    } else {
      applyParsedTotals();
    }
  }

  function resetForm() {
    const form = document.getElementById('as-form');
    form.reset();
    document.getElementById('as-success').hidden = true;
    form.hidden = false;
    document.querySelector('input[name="sourceType"][value="excel_upload"]').checked = true;
    applySourceType();
    clearFile();
  }

  function prefillDefaults() {
    const form = document.getElementById('as-form');
    const d = new Date(); d.setDate(d.getDate() + 7);
    form.elements['testDate'].value = d.toISOString().slice(0, 10);
    form.elements['startTime'].value = '10:00';
    form.elements['durationMinutes'].value = 60;
    form.elements['mode'].value = 'ONLINE';
    document.getElementById('as-venue-field').hidden = true;
    updateEndTime();
  }

  async function prefillExisting(jobId) {
    try {
      const res = await fetch(`${API}/job/${jobId}`, { credentials: 'include' });
      if (!res.ok) return;
      const ex = await res.json();
      if (!ex) return;
      const form = document.getElementById('as-form');
      if (ex.testDate) form.elements['testDate'].value = ex.testDate;
      if (ex.startTime) form.elements['startTime'].value = (ex.startTime + '').slice(0, 5);
      if (ex.durationMinutes) form.elements['durationMinutes'].value = ex.durationMinutes;
      if (ex.mode) form.elements['mode'].value = ex.mode;
      if (ex.locationOrLink) {
  form.elements['venue'].value = ex.locationOrLink;
  document.getElementById('as-venue-field').hidden = false;
}
      if (ex.passingMarks != null) form.elements['passingMarks'].value = ex.passingMarks;
      if (ex.instructions) form.elements['instructions'].value = ex.instructions;
      updateEndTime();
    } catch { /* silent */ }
  }

  function updateEndTime() {
    const form = document.getElementById('as-form');
    const date = form.elements['testDate'].value;
    const start = form.elements['startTime'].value;
    const dur = parseInt(form.elements['durationMinutes'].value, 10);
    if (!date || !start || !dur) {
      form.elements['endTimeDisplay'].value = '';
      return;
    }
    const s = new Date(`${date}T${start}:00`);
    const e = new Date(s.getTime() + dur * 60000);
    form.elements['endTimeDisplay'].value =
      e.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }

  /* ---------- Excel parsing ---------- */
  function handleFile(file) {
    const name = file.name.toLowerCase();
    if (!/\.(xlsx|xls|csv)$/.test(name)) {
      showToast('Please upload an .xlsx, .xls, or .csv file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const rows = parseWorkbook(e.target.result, name.endsWith('.csv'));
        const { questions, meta, errors } = validateRows(rows);
        if (questions.length === 0) {
          showToast('No valid questions found. Check column names.');
          return;
        }
        parsedQuestions = questions;
        parsedMeta = meta;
        renderFileRow(file.name, questions.length, errors.length);
        renderPreview(questions.slice(0, 8), questions.length);
        applyParsedTotals();
        if (errors.length) {
          console.warn('Row issues:', errors);
          showToast(`${errors.length} row(s) skipped — see console.`);
        }
      } catch (err) {
        console.error(err);
        showToast('Could not parse the file. Is SheetJS loaded?');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function parseWorkbook(buffer, isCsv) {
    if (typeof XLSX === 'undefined') throw new Error('SheetJS (XLSX) not loaded');
    const wb = isCsv
      ? XLSX.read(new TextDecoder('utf-8').decode(buffer), { type: 'string' })
      : XLSX.read(new Uint8Array(buffer), { type: 'array' });
    const first = wb.SheetNames[0];
    return XLSX.utils.sheet_to_json(wb.Sheets[first], { defval: '' });
  }

  function validateRows(rows) {
    const out = [];
    const errors = [];
    rows.forEach((r, i) => {
      const q = String(r.question || r.Question || '').trim();
      if (!q) { errors.push(`Row ${i + 2}: missing question`); return; }
      const a = r.option_a ?? r.A ?? r.optionA ?? '';
      const b = r.option_b ?? r.B ?? r.optionB ?? '';
      const c = r.option_c ?? r.C ?? r.optionC ?? '';
      const d = r.option_d ?? r.D ?? r.optionD ?? '';
      const correct = String(r.correct ?? r.Correct ?? '').trim().toUpperCase();
      if (!['A', 'B', 'C', 'D'].includes(correct)) {
        errors.push(`Row ${i + 2}: invalid correct option "${correct}"`); return;
      }
      out.push({
        qNo: out.length + 1,
        question: q,
        optionA: String(a), optionB: String(b), optionC: String(c), optionD: String(d),
        correctOption: correct,
        marks: Number(r.marks ?? r.Marks ?? 1) || 1,
        topic: String(r.topic ?? r.Topic ?? '').trim(),
        difficulty: String(r.difficulty ?? r.Difficulty ?? '').trim()
      });
    });
    const totalMarks = out.reduce((s, q) => s + q.marks, 0);
    return {
      questions: out,
      meta: { totalQuestions: out.length, totalMarks, passingMarks: Math.ceil(totalMarks * 0.4) },
      errors
    };
  }

  function applyParsedTotals() {
    if (!parsedMeta) return;
    const form = document.getElementById('as-form');
    form.elements['totalQuestions'].value = parsedMeta.totalQuestions;
    form.elements['totalMarks'].value = parsedMeta.totalMarks;
    if (!form.elements['passingMarks'].value) {
      form.elements['passingMarks'].value = parsedMeta.passingMarks;
    }
  }

  function renderFileRow(name, count, errCount) {
    document.getElementById('as-file-row').hidden = false;
    document.getElementById('as-file-name').textContent = name;
    document.getElementById('as-file-meta').textContent =
      `${count} question${count !== 1 ? 's' : ''} detected` +
      (errCount ? ` · ${errCount} row(s) skipped` : '');
  }

  function renderPreview(rows, total) {
    const box = document.getElementById('as-preview');
    const table = document.getElementById('as-preview-table');
    box.hidden = false;
    document.getElementById('as-preview-count').textContent = `${total} total`;
    const head = `<thead><tr>
      <th>#</th><th>Question</th><th>A</th><th>B</th><th>C</th><th>D</th><th>Ans</th><th>Marks</th>
    </tr></thead>`;
    const body = rows.map(q => `<tr>
      <td>${q.qNo}</td>
      <td title="${esc(q.question)}">${esc(q.question).slice(0, 60)}${q.question.length > 60 ? '…' : ''}</td>
      <td>${esc(q.optionA).slice(0, 14)}</td>
      <td>${esc(q.optionB).slice(0, 14)}</td>
      <td>${esc(q.optionC).slice(0, 14)}</td>
      <td>${esc(q.optionD).slice(0, 14)}</td>
      <td class="as-correct">${q.correctOption}</td>
      <td>${q.marks}</td>
    </tr>`).join('');
    table.innerHTML = head + `<tbody>${body}</tbody>`;
  }

  function clearFile() {
    parsedQuestions = []; parsedMeta = null;
    const fi = document.getElementById('as-file');
    if (fi) fi.value = '';
    ['as-file-row', 'as-preview'].forEach(id => {
      const el = document.getElementById(id); if (el) el.hidden = true;
    });
  }

  function downloadTemplate() {
    // Build a tiny CSV template client-side
    const headers = ['question','option_a','option_b','option_c','option_d','correct','marks','topic','difficulty'];
    const sample = [
      ['What is 2 + 2?','3','4','5','6','B','1','arithmetic','easy'],
      ['Capital of France?','Berlin','Madrid','Paris','Rome','C','1','gk','easy']
    ];
    const csv = [headers, ...sample]
      .map(r => r.map(v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g,'""')}"` : v).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'aptitude-test-template.csv';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  /* ---------- submit ---------- */
  async function submitForm(e) {
    e.preventDefault();
     // ✅ Re-validate at submit time
  if (currentJob && String(currentJob.status || '').toLowerCase() !== 'active') {
    showToast('This job is no longer Active. Cannot schedule.');
    return;
  }
    const form = e.target;
    const sourceType = document.querySelector('input[name="sourceType"]:checked').value;

    if (sourceType === 'excel_upload' && parsedQuestions.length === 0) {
      showToast('Please upload the Excel file with questions first.');
      return;
    }
    if (sourceType === 'external_link') {
      const url = form.elements['externalUrl'].value.trim();
      if (!/^https?:\/\//.test(url)) { showToast('Enter a valid external URL.'); return; }
    }

    const duration = Number(form.elements['durationMinutes'].value);
    const payload = {
      jobId: currentJob.id,
      companyId: currentJob.companyId,
      sourceType,
      externalUrl: sourceType === 'external_link' ? form.elements['externalUrl'].value.trim() : null,
      testDate: form.elements['testDate'].value,
      startTime: form.elements['startTime'].value + ':00',
      durationMinutes: duration,
      mode: form.elements['mode'].value,
      locationOrLink: form.elements['mode'].value === 'OFFLINE'
  ? form.elements['venue'].value.trim()
  : null,
      totalQuestions: Number(form.elements['totalQuestions'].value || 0) || null,
      totalMarks: Number(form.elements['totalMarks'].value || 0) || null,
      passingMarks: Number(form.elements['passingMarks'].value || 0) || null,
      instructions: form.elements['instructions'].value.trim(),
      questions: sourceType === 'excel_upload' ? parsedQuestions : []
    };

    const btn = document.getElementById('as-submit');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const res = await fetch(`${API}/schedule`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error((await safeText(res)) || `Failed (${res.status})`);
      const data = await res.json();

      showSuccess(data, payload);
      if (typeof onScheduledCallback === 'function') onScheduledCallback();
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Could not save the schedule.');
    } finally {
      btn.disabled = false; btn.textContent = 'Save & Generate Link';
    }
  }

  function showSuccess(data, payload) {
    document.getElementById('as-form').hidden = true;
    document.getElementById('as-success').hidden = false;

    const token = data.linkToken || data.token;
    const link = `${window.location.origin}/t/${token}`;
    const inp = document.getElementById('as-link-input');
    inp.value = link;
    inp.dataset.testId = data.testId || data.id || '';

    document.getElementById('as-success-meta').textContent =
      `${payload.testDate} · ${payload.startTime.slice(0,5)} · ${payload.durationMinutes} min` +
      (payload.totalQuestions ? ` · ${payload.totalQuestions} questions` : '');
    document.getElementById('as-view-submissions').disabled = !inp.dataset.testId;
  }

  /* ---------- modal helpers ---------- */
  function show(m) { m.hidden = false; m.style.display = 'flex'; requestAnimationFrame(() => m.classList.add('is-open')); }
  function hide(m) { m.classList.remove('is-open'); setTimeout(() => { m.style.display = 'none'; m.hidden = true; }, 150); }

  /* ---------- styles ---------- */
  function injectStyles() {
    if (document.getElementById('as-styles')) return;
    const s = document.createElement('style');
    s.id = 'as-styles';
    s.textContent = `
      .as-job-meta{color:#6b7f92;font-size:13px;margin:4px 0 16px;}
      .as-section{border-top:1px solid #eef2f5;padding-top:14px;margin-top:14px;}
      .as-section:first-of-type{border-top:none;padding-top:0;margin-top:0;}
      .as-section-title{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#0E9AA3;margin-bottom:10px;}
      .as-radio-row{display:flex;gap:18px;margin-bottom:12px;flex-wrap:wrap;}
      .as-radio{display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;}
      .as-dropzone{border:2px dashed #cbd5e1;border-radius:10px;padding:18px;text-align:center;cursor:pointer;transition:.15s;}
      .as-dropzone:hover,.as-dropzone.is-drag{border-color:#0E9AA3;background:#f0fbfc;}
      .as-dropzone p{margin:4px 0;font-size:13px;color:#6b7f92;}
      .as-hint{font-size:11.5px;color:#8899a6;margin-top:6px;}
      .as-file-row{display:flex;justify-content:space-between;align-items:center;background:#f0fbfc;border:1px solid #d6eff2;border-radius:8px;padding:10px 12px;margin-top:10px;}
      .as-file-name{font-weight:600;font-size:13px;}
      .as-file-meta{font-size:11.5px;color:#6b7f92;}
      .as-remove-file{background:none;border:none;color:#e0392f;font-size:12px;cursor:pointer;}
      .as-preview{margin-top:12px;border:1px solid #e7ebf0;border-radius:8px;overflow:hidden;}
      .as-preview-head{display:flex;justify-content:space-between;padding:8px 12px;background:#f7f9fb;font-size:12px;border-bottom:1px solid #e7ebf0;}
      .as-preview-scroll{max-height:200px;overflow:auto;}
      .as-preview-table{width:100%;border-collapse:collapse;font-size:11.5px;}
      .as-preview-table th,.as-preview-table td{padding:6px 8px;text-align:left;border-bottom:1px solid #eef2f5;white-space:nowrap;}
      .as-preview-table th{background:#fafbfc;font-weight:600;color:#6b7f92;position:sticky;top:0;}
      .as-correct{color:#16a34a;font-weight:700;}
      .as-actions-inline{margin-top:8px;text-align:right;}
      .as-link-btn{background:none;border:none;color:#0E9AA3;font-size:12px;cursor:pointer;padding:4px 0;}
      .as-link-btn:hover{text-decoration:underline;}
      .as-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
      .as-grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;}
      .as-label{font-size:12px;font-weight:600;color:#6b7f92;display:block;margin:14px 0 6px;}
      .as-link-box{display:flex;gap:8px;}
      .as-link-box input{flex:1;border:1px solid #e7ebf0;border-radius:8px;padding:9px 10px;font-size:13px;background:#f7f9fb;}
      .as-copy-btn{background:#0E9AA3;color:#fff;border:none;border-radius:8px;padding:0 16px;cursor:pointer;font-size:13px;}
      .as-success-icon{font-size:34px;text-align:center;margin-bottom:6px;}
      #as-success h5{text-align:center;margin-bottom:2px;}
      .as-success-meta{text-align:center;color:#6b7f92;font-size:13px;margin-bottom:14px;}
    `;
    document.head.appendChild(s);
  }

  /* ---------- utils ---------- */
  function fmtDate(v) {
    if (!v) return '—';
    const d = new Date(v); if (isNaN(d)) return '—';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  async function safeText(r) { try { return await r.text(); } catch { return ''; } }
  function showToast(msg) {
    if (window.showToast && typeof window.showToast === 'function') return window.showToast(msg);
    const t = document.getElementById('toast');
    if (!t) return alert(msg);
    t.textContent = msg; t.classList.add('is-visible');
    setTimeout(() => t.classList.remove('is-visible'), 2500);
  }
})();