/* ============================================================
   aptitude-test.js — professional exam module
   ============================================================ */
(function () {
  'use strict';

  const API     = 'http://127.0.0.1:8080/api/aptitude';
  const TEST_ID = new URLSearchParams(location.search).get('testId');

  // ---- state
  let test       = null;          // { title, company, durationMinutes, questions: [...] }
  let answers    = {};            // { qNo: 'A' | 'B' | ... }
  let marked     = new Set();     // qNos marked for review
  let visited    = new Set();     // qNos the user has opened
  let current    = 0;
  let endsAt     = null;          // epoch ms
  let timerId    = null;
  let submitted  = false;
  let beganAt    = null;

 const LS_KEY        = `aptitude-test:v2:${TEST_ID}`;
const LS_ENDS_AT    = `aptitude-test:v2:${TEST_ID}:endsAt`;
const LS_BEGAN_AT   = `aptitude-test:v2:${TEST_ID}:beganAt`;

  document.addEventListener('DOMContentLoaded', boot);

  /* ============================================================
     BOOT
     ============================================================ */
  async function boot() {
    if (!TEST_ID) return showError('Missing test id', 'No testId in URL.');

    try {
      test = await startAttempt();
    } catch (err) {
      return showError(err.title || 'Cannot start test', err.message || String(err));
    }
     // ✅ THIS BLOCK MUST BE HERE — right after startAttempt()
  // (test.questions || []).forEach((q, i) => {
  //   q.qNo = q.qNo ?? q.questionNo ?? q.question_no ?? q.qno
  //        ?? q.number ?? q.id ?? q.questionId ?? q.question_id ?? (i + 1);
  // });
  (test.questions || []).forEach((q, i) => {
  q.qNo = i + 1;
});

    // -------- refresh-safe timer --------
    // If a previous session's endsAt exists and matches duration → reuse.
    // Otherwise compute fresh from server.
    const serverEndsAt = new Date(test.startTime).getTime()
                       + (test.durationMinutes * 60_000);
    const savedEndsAt  = Number(localStorage.getItem(LS_ENDS_AT) || 0);
    const savedBeganAt = Number(localStorage.getItem(LS_BEGAN_AT) || 0);

    // Only trust saved endsAt if it's not in the future beyond server window
    if (savedEndsAt && savedEndsAt <= serverEndsAt && savedEndsAt > Date.now()) {
      endsAt  = savedEndsAt;
      beganAt = savedBeganAt || Date.now();
    } else {
      endsAt  = serverEndsAt;
      beganAt = Date.now();
    }

    restoreDraft();
    renderIntro();
    window.__test = test;
  }

  /* ============================================================
     API
     ============================================================ */
  async function startAttempt() {
    const res = await fetch(`${API}/tests/${encodeURIComponent(TEST_ID)}/start`, {
      credentials: 'include'
    });
    if (!res.ok) {
      let msg = `Server responded ${res.status}`;
      try { const j = await res.json(); msg = j.error || j.message || msg; } catch {}
      const title = res.status === 403 ? 'Test not available'
                  : res.status === 409 ? 'Already submitted'
                  : 'Failed to load test';
      throw { title, message: msg };
    }
    return res.json();
  }

  async function submitAttempt(auto) {
    if (submitted) return;
    submitted = true;
    clearInterval(timerId);

    try {
      const res = await fetch(`${API}/tests/${encodeURIComponent(TEST_ID)}/submit`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers, autoSubmitted: !!auto })
      });

      if (!res.ok) {
        const err = await res.text().catch(() => '');
        console.error('[submit]', res.status, err);
        alert('Failed to submit. Please contact support.');
        submitted = false;
        return;
      }

  
           const result = await res.json();
      localStorage.removeItem(LS_KEY);
      localStorage.removeItem(LS_ENDS_AT);
      localStorage.removeItem(LS_BEGAN_AT);
      window.onbeforeunload = null;
      renderResult(result, auto);
     
    } catch (e) {
      console.error(e);
      alert('Network error while submitting.');
      submitted = false;
    }
  }

  /* ============================================================
     INTRO SCREEN
     ============================================================ */
  function renderIntro() {
    hide('#at-loading');
    hide('#at-error');

    // header
    $('#eh-test-name').textContent = test.title || 'Aptitude Assessment';
    $('#eh-sub').textContent = [test.company, test.department].filter(Boolean).join(' · ') || '—';
    $('#eh-logo').textContent = (test.company || 'A').charAt(0).toUpperCase();
    $('#eh-qcount').textContent   = (test.questions || []).length;
    $('#eh-marks').textContent    = test.totalMarks ?? '—';
    $('#eh-duration').textContent = (test.durationMinutes || 0) + ' min';

    // intro
    $('#at-title').textContent   = test.title || 'Aptitude Assessment';
    $('#at-company').textContent = [test.company, test.department].filter(Boolean).join(' · ') || '';
    $('#at-duration').textContent = test.durationMinutes + ' min';
    $('#at-qcount').textContent   = (test.questions || []).length;
    $('#at-marks').textContent    = test.totalMarks ?? '—';
    $('#at-pass').textContent     = test.passingMarks ?? '—';
    $('#at-instructions').textContent = test.instructions || 'Follow the on-screen prompts.';

    // user card
    $('#pal-avatar').textContent = (test.studentName || 'S').charAt(0).toUpperCase();
    $('#pal-name').textContent   = test.studentName || 'Candidate';
    $('#pal-role').textContent   = test.company || '—';

    show('#at-intro');
    $('#at-begin').addEventListener('click', beginQuiz, { once: true });
  }

  /* ============================================================
     BEGIN
     ============================================================ */
  function beginQuiz() {
    hide('#at-intro');
    show('#at-quiz');

    // persist start so refresh keeps the same countdown
    beganAt = beganAt || Date.now();
    localStorage.setItem(LS_ENDS_AT, String(endsAt));
    localStorage.setItem(LS_BEGAN_AT, String(beganAt));

    // guard against accidental leave
    window.addEventListener('beforeunload', (e) => {
      if (submitted) return;
      saveDraft();
      e.preventDefault();
      e.returnValue = 'Your test is in progress. Leaving will not pause the timer.';
      return e.returnValue;
    });

    // bind delegated handlers ONCE
    bindOptionChange();
    bindPaletteClick();

    buildPalette();
    renderQuestion();
    startTimer();
  }

  /* ============================================================
     OPTIONS (delegated change)
     ============================================================ */
  function bindOptionChange() {
    const wrap = document.getElementById('at-options');
    if (wrap.dataset.bound) return;
    wrap.dataset.bound = '1';
    wrap.addEventListener('change', (e) => {
      const input = e.target.closest('input[type="radio"]');
      if (!input) return;
      const q = test.questions[current];
      answers[q.qNo] = input.value;
      saveDraft();
      // refresh highlight
      wrap.querySelectorAll('.q-opt').forEach(lbl => {
        const inp = lbl.querySelector('input');
        lbl.classList.toggle('is-checked', inp.checked);
      });
      updatePalette();
    });
  }

  function bindPaletteClick() {
    const grid = document.getElementById('at-palette');
    if (grid.dataset.bound) return;
    grid.dataset.bound = '1';
    grid.addEventListener('click', (e) => {
      const btn = e.target.closest('.pal-btn');
      if (!btn) return;
      current = Number(btn.dataset.index);
      renderQuestion();
    });
  }

  /* ============================================================
     PALETTE
     ============================================================ */
  function buildPalette() {
    const grid = $('#at-palette');
    grid.innerHTML = test.questions.map((_, i) =>
      `<button type="button" class="pal-btn" data-index="${i}">${i + 1}</button>`
    ).join('');
  }

  function updatePalette() {
    let nAnswered = 0, nReview = 0, nNotAns = 0, nNotVisited = 0;

    document.querySelectorAll('.pal-btn').forEach((btn, i) => {
      const q = test.questions[i];
      const isAnswered  = !!answers[q.qNo];
      const isReview    = marked.has(q.qNo);
      const isVisited   = visited.has(q.qNo) || i === current;

      btn.classList.toggle('answered', isAnswered);
      btn.classList.toggle('review',   isReview);
      btn.classList.toggle('visited',  isVisited && !isAnswered && !isReview);
      btn.classList.toggle('current',  i === current);

      if (isAnswered)        nAnswered++;
      else if (isReview)     nReview++;
      else if (isVisited)    nNotAns++;
      else                   nNotVisited++;
    });

    setText('cnt-answered',    nAnswered);
    setText('cnt-review',      nReview);
    setText('cnt-notanswered', nNotAns);
    setText('cnt-notvisited',  nNotVisited);
  }

  /* ============================================================
     RENDER QUESTION
     ============================================================ */
  function renderQuestion() {
    const q = test.questions[current];
    if (!q) return;

    visited.add(q.qNo);

    $('#at-qno').textContent = `Question ${current + 1}`;
    $('#at-qmeta').textContent = [
      q.marks ? `${q.marks} mark${q.marks !== 1 ? 's' : ''}` : '',
      q.topic || '',
      q.difficulty || ''
    ].filter(Boolean).join(' · ');

    $('#at-qtext').textContent = q.question;

    // optional image
    const imgWrap = $('#at-qimage-wrap');
    if (q.imageUrl) {
      $('#at-qimage').src = q.imageUrl;
      imgWrap.hidden = false;
    } else {
      imgWrap.hidden = true;
    }

    // options
    const letters = ['A', 'B', 'C', 'D'];
    $('#at-options').innerHTML = letters.map(L => {
      const txt = q['option' + L];
      if (!txt) return '';
      const checked = answers[q.qNo] === L;
      return `
        <label class="q-opt ${checked ? 'is-checked' : ''}">
          <input type="radio" name="q${q.qNo}" value="${L}" ${checked ? 'checked' : ''}>
          <span class="q-opt-letter">${L}</span>
          <span class="q-opt-text">${escapeHtml(txt)}</span>
        </label>`;
    }).join('');

    // nav buttons
    $('#at-prev').disabled = current === 0;
    const isLast = current === test.questions.length - 1;
    $('#at-next').innerHTML = isLast
      ? 'Save <i class="bi bi-check2"></i>'
      : 'Save &amp; Next <i class="bi bi-arrow-right"></i>';

    // mark-for-review state
    const isMarked = marked.has(q.qNo);
    $('#at-mark').classList.toggle('is-marked', isMarked);
    $('#at-mark').innerHTML = isMarked
      ? '<i class="bi bi-bookmark-fill"></i> Unmark'
      : '<i class="bi bi-bookmark"></i> Mark for Review';

    updatePalette();
  }

  /* ============================================================
     NAV ACTIONS
     ============================================================ */
  $('#at-prev')?.addEventListener('click', () => {
    if (current > 0) { current--; renderQuestion(); }
  });

  $('#at-next')?.addEventListener('click', () => {
    // Save & Next: answer already saved on change; just move.
    if (current < test.questions.length - 1) {
      current++;
      renderQuestion();
    } else {
      // last question → open submit modal
      openSubmitModal();
    }
  });

  $('#at-mark')?.addEventListener('click', () => {
    const q = test.questions[current];
    marked.has(q.qNo) ? marked.delete(q.qNo) : marked.add(q.qNo);
    saveDraft();
    renderQuestion();
  });

  $('#at-clear')?.addEventListener('click', () => {
    const q = test.questions[current];
    delete answers[q.qNo];
    saveDraft();
    renderQuestion();
  });

  $('#at-submit-side')?.addEventListener('click', openSubmitModal);

  /* ============================================================
     TIMER
     ============================================================ */
  function startTimer() {
    tick();
    timerId = setInterval(tick, 1000);
  }

  function tick() {
    const left     = Math.max(0, endsAt - Date.now());
    const totalSec = Math.floor(left / 1000);
    const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const ss = String(totalSec % 60).padStart(2, '0');

    const el = $('#eh-timer');
    el.textContent = `${mm}:${ss}`;

    el.parentElement.classList.toggle('warn',   totalSec <= 300 && totalSec > 60);
    el.parentElement.classList.toggle('danger', totalSec <= 60);

    if (left <= 0) {
      clearInterval(timerId);
      autoSubmit();
    }
  }

  function autoSubmit() {
    // best-effort toast, then submit without waiting
    try { alert('Time is up. Your test is being submitted.'); } catch {}
    submitAttempt(true);
  }

  /* ============================================================
     SUBMIT MODAL
     ============================================================ */
  function openSubmitModal() {
    const totalQ     = test.questions.length;
    const nAnswered  = Object.keys(answers).length;
    const nReview    = marked.size;
    const nNotVisited = test.questions.filter(q => !visited.has(q.qNo)).length;
    const nUnanswered = totalQ - nAnswered;

    setText('ms-answered',    nAnswered);
    setText('ms-unanswered',  nUnanswered);
    setText('ms-review',      nReview);
    setText('ms-notvisited',  nNotVisited);

    show('#submit-modal');
  }

  $('#ms-cancel')?.addEventListener('click', () => hide('#submit-modal'));
  $('#ms-confirm')?.addEventListener('click', () => {
    hide('#submit-modal');
    submitAttempt(false);
  });

  /* ============================================================
     DRAFT PERSISTENCE
     ============================================================ */
  function saveDraft() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        answers,
        marked:  [...marked],
        visited: [...visited]
      }));
    } catch {}
  }
  function restoreDraft() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.answers)              answers = d.answers;
      if (Array.isArray(d.marked))  marked  = new Set(d.marked);
      if (Array.isArray(d.visited)) visited = new Set(d.visited);
    } catch {}
  }

  /* ============================================================
     RESULT
     ============================================================ */
 function renderResult(r, auto) {
  hide('#at-quiz');
  hide('#at-intro');
  hide('#at-loading');
  show('#at-result');

  $('#at-result-title').textContent = auto
    ? 'Time Up — Test Auto-Submitted'
    : 'Test Submitted Successfully';

  $('#at-result-msg').innerHTML = `
    <p style="margin:0 0 .75rem;">
      <i class="bi bi-check-circle-fill" style="color:#16a34a;font-size:1.5rem;vertical-align:middle;"></i>
      Your responses have been saved.
    </p>
    <p style="margin:0;color:#64748b;">
      Your result will be provided as soon as possible. You can check
      <a href="test-results.html">Test Results</a> for updates.
    </p>
  `;

  // Hide the score grid since we're not revealing results yet
  const grid = document.querySelector('.at-result-grid');
  if (grid) grid.style.display = 'none';
}

  /* ============================================================
     HELPERS
     ============================================================ */
  function show(sel) { const e = $(sel); if (e) e.hidden = false; }
  function hide(sel) { const e = $(sel); if (e) e.hidden = true; }
  function $(sel)    { return document.querySelector(sel); }
  function setText(id, val){ const e = document.getElementById(id); if (e) e.textContent = val; }
  function showError(title, msg) {
    hide('#at-loading');
    show('#at-error');
    $('#at-error-title').textContent = title;
    $('#at-error-msg').textContent   = msg;
  }
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }
})();