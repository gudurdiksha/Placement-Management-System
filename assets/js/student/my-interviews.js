
(function () {
  'use strict';

  const API = (window.API_BASE || 'http://127.0.0.1:8080') + '/api/interviews';

  const state = {
    interviews: [],
    filter: { tab: 'all', search: '', sort: 'date-asc' }
  };

 // Use:
// if (document.readyState === 'loading') {
//   document.addEventListener('DOMContentLoaded', boot);
// } else {
//   boot();   // DOM already parsed → run immediately
// }
document.addEventListener('DOMContentLoaded', boot);

  async function boot() {
    if (typeof Session !== 'undefined' && Session.requireSession) {
      if (!Session.requireSession()) return;
    }
    bindUI();
    await loadInterviews();
  }

  function bindUI() {
    document.getElementById('refreshInterviewsBtn').addEventListener('click', loadInterviews);

    document.querySelectorAll('.interview-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.interview-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.filter.tab = btn.dataset.tab;
        render();
      });
    });

    document.getElementById('interviewSearchInput')
      .addEventListener('input', e => {
        state.filter.search = e.target.value.toLowerCase().trim();
        render();
      });

    document.getElementById('interviewSortSelect')
      .addEventListener('change', e => {
        state.filter.sort = e.target.value;
        render();
      });

    const closeBtn = document.getElementById('upcomingBannerClose');
    if (closeBtn) closeBtn.addEventListener('click', () => {
      document.getElementById('upcomingBanner').hidden = true;
    });
  }

 async function loadInterviews() {
  const list = document.getElementById('interviewList');
  list.innerHTML = `<div class="iv-empty">...</div>`;

  try {
    const res = await fetch(`${API}/my-interviews`, { credentials: 'include' });

    console.log('=== MY-INTERVIEWS DEBUG ===');
    console.log('Status:', res.status);
    console.log('OK:', res.ok);
    console.log('Content-Type:', res.headers.get('content-type'));

    if (!res.ok) throw new Error('Failed to load interviews (HTTP ' + res.status + ')');

    const data = await res.json();
    console.log('Data received:', data);
    console.log('Is Array?', Array.isArray(data));
    console.log('Length:', data.length);

    state.interviews = Array.isArray(data) ? data : [];
    updateStats();
    updateTabCounts();
    renderUpcomingBanner();
    render();
  } catch (e) {
    console.error('LOAD ERROR:', e);
    list.innerHTML = `...`;
  }
}


/* -------- Stats -------- */
function updateStats() {
    const total     = state.interviews.length;
    const upcoming  = state.interviews.filter(isUpcoming).length;
    const selected  = state.interviews.filter(iv => getResult(iv) === 'SELECTED').length;
    const rejected  = state.interviews.filter(iv => getResult(iv) === 'REJECTED').length;

    document.getElementById('statTotalIv').textContent     = total;
    document.getElementById('statUpcomingIv').textContent  = upcoming;
    document.getElementById('statSelectedIv').textContent  = selected;
    document.getElementById('statRejectedIv').textContent  = rejected;
  }

  function updateTabCounts() {
    document.getElementById('tabCountAll').textContent       = state.interviews.length;
    document.getElementById('tabCountUpcoming').textContent  = state.interviews.filter(isUpcoming).length;
    document.getElementById('tabCountCompleted').textContent = state.interviews.filter(iv =>
      (iv.status || '').toUpperCase() === 'COMPLETED').length;
    document.getElementById('tabCountCancelled').textContent = state.interviews.filter(iv =>
      (iv.status || '').toUpperCase() === 'CANCELLED').length;
  }

  /* -------- Upcoming banner -------- */
  function renderUpcomingBanner() {
    const banner = document.getElementById('upcomingBanner');
    const today = state.interviews.filter(iv => isToday(iv));
    if (!today.length) { banner.hidden = true; return; }

    const first = today[0];
    document.getElementById('upcomingBannerTitle').textContent =
      today.length === 1 ? 'You have an interview today!' : `You have ${today.length} interviews today!`;
    document.getElementById('upcomingBannerText').textContent =
      `${first.jobTitle || 'Interview'} at ${first.startTime || ''} with ${first.interviewerName || 'the interviewer'}.`;

    document.getElementById('upcomingBannerBtn').onclick = () => openDetail(first);
    banner.hidden = false;
  }

  /* -------- Filters / Sort -------- */
  function applyFilters(list) {
    let out = [...list];

    // Tab
    switch (state.filter.tab) {
      case 'upcoming':  out = out.filter(isUpcoming); break;
      case 'completed': out = out.filter(iv => (iv.status || '').toUpperCase() === 'COMPLETED'); break;
      case 'cancelled': out = out.filter(iv => (iv.status || '').toUpperCase() === 'CANCELLED'); break;
    }

    // Search
    if (state.filter.search) {
      const q = state.filter.search;
      out = out.filter(iv =>
        (iv.jobTitle || '').toLowerCase().includes(q) ||
        (iv.companyName || '').toLowerCase().includes(q) ||
        (iv.interviewerName || '').toLowerCase().includes(q)
      );
    }

    // Sort
    out.sort((a, b) => {
      const da = new Date(`${a.interviewDate || ''}T${a.startTime || '00:00'}`).getTime();
      const db = new Date(`${b.interviewDate || ''}T${b.startTime || '00:00'}`).getTime();
      switch (state.filter.sort) {
        case 'date-desc': return db - da;
        case 'company':   return (a.companyName || '').localeCompare(b.companyName || '');
        default:          return da - db;
      }
    });

    return out;
  }

  function render() {
    const container = document.getElementById('interviewList');
    const list = applyFilters(state.interviews);

    document.getElementById('interviewResultCount').textContent =
      `${list.length} interview${list.length === 1 ? '' : 's'}`;

    if (!list.length) {
      container.innerHTML = renderEmpty();
      return;
    }

    container.innerHTML = list.map(renderCard).join('');
  }

  function renderEmpty() {
    const tab = state.filter.tab;
    const messages = {
      all:       { title: 'No interviews yet',       body: 'You haven\'t been scheduled for any interviews. Once a company schedules one, it will appear here.' },
      upcoming:  { title: 'No upcoming interviews',  body: 'You don\'t have any upcoming interviews scheduled right now.' },
      completed: { title: 'No completed interviews', body: 'Completed interviews will show up here.' },
      cancelled: { title: 'No cancelled interviews', body: 'Cancelled interviews will show up here.' }
    };
    const m = messages[tab] || messages.all;
    return `
      <div class="iv-empty">
        <div class="iv-empty-icon"><i class="bi bi-calendar-x"></i></div>
        <h5>${m.title}</h5>
        <p>${m.body}</p>
        <a href="applications.html" class="btn-teal">
          <i class="bi bi-briefcase-fill"></i> View Applications
        </a>
      </div>`;
  }

  function renderCard(iv) {
    const status = (iv.status || 'SCHEDULED').toUpperCase();
    const result = getResult(iv);
    const today = isToday(iv);
    const past  = isPast(iv);

    let cardClass = 'is-scheduled';
    if (status === 'CANCELLED') cardClass = 'is-cancelled';
    else if (status === 'COMPLETED') cardClass = 'is-completed';
    else if (today) cardClass = 'is-today';

    let statusClass = 'scheduled';
    let statusLabel = 'Scheduled';
    if (status === 'CANCELLED') { statusClass = 'cancelled'; statusLabel = 'Cancelled'; }
    else if (status === 'COMPLETED') { statusClass = 'completed'; statusLabel = 'Completed'; }
    else if (today) { statusClass = 'today'; statusLabel = 'Today'; }

    // Countdown
    let countdown = '';
    if (status === 'SCHEDULED') {
      if (today) {
        countdown = `<span class="iv-countdown urgent"><i class="bi bi-alarm-fill"></i> Today at ${escapeHtml(iv.startTime || '')}</span>`;
      } else if (past) {
        countdown = `<span class="iv-countdown past"><i class="bi bi-clock-history"></i> Awaiting result</span>`;
      } else {
        const days = daysUntil(iv);
        countdown = `<span class="iv-countdown"><i class="bi bi-hourglass"></i> In ${days} day${days === 1 ? '' : 's'}</span>`;
      }
    }

    // Result badge
    let resultHtml = '';
    if (result === 'SELECTED') {
      resultHtml = `<span class="iv-countdown" style="background:#dcfce7;color:#166534;"><i class="bi bi-patch-check-fill"></i> Selected</span>`;
    } else if (result === 'REJECTED') {
      resultHtml = `<span class="iv-countdown" style="background:#fee2e2;color:#991b1b;"><i class="bi bi-x-circle-fill"></i> Not Selected</span>`;
    }

    return `
      <div class="iv-card ${cardClass}" data-id="${escapeHtml(iv.id)}">
        <div class="iv-main">
          <div class="iv-title-row">
            <h3 class="iv-job-title">${escapeHtml(iv.jobTitle || 'Interview')}</h3>
            <span class="iv-status ${statusClass}">
              <i class="bi bi-dot" style="font-size:18px;line-height:1;"></i>
              ${statusLabel}
            </span>
            ${resultHtml}
          </div>
          <p class="iv-company">
            <i class="bi bi-building"></i>
            ${escapeHtml(iv.companyName || 'Company')}
            ${iv.department ? ' · ' + escapeHtml(iv.department) : ''}
          </p>

          ${countdown}

          <div class="iv-meta-grid">
            <div class="iv-meta">
              <i class="bi bi-calendar-event"></i>
              <div>
                <span class="iv-meta-label">Date</span>
                <span class="iv-meta-value">${formatDate(iv.interviewDate)}</span>
              </div>
            </div>
            <div class="iv-meta">
              <i class="bi bi-clock"></i>
              <div>
                <span class="iv-meta-label">Time</span>
                <span class="iv-meta-value">${escapeHtml(iv.startTime || '—')} – ${escapeHtml(iv.endTime || '—')}</span>
              </div>
            </div>
            <div class="iv-meta">
              <i class="bi bi-camera-video"></i>
              <div>
                <span class="iv-meta-label">Mode</span>
                <span class="iv-meta-value">${formatMode(iv.mode)}</span>
              </div>
            </div>
            <div class="iv-meta">
              <i class="bi bi-person-badge"></i>
              <div>
                <span class="iv-meta-label">Interviewer</span>
                <span class="iv-meta-value">${escapeHtml(iv.interviewerName || '—')}</span>
              </div>
            </div>
          </div>

          ${iv.notes ? `
            <div class="iv-notes">
              <strong>Notes:</strong> ${escapeHtml(iv.notes)}
            </div>` : ''}
        </div>

        <div class="iv-actions">
          ${renderActions(iv)}
        </div>
      </div>`;
  }

  function renderActions(iv) {
    const status = (iv.status || 'SCHEDULED').toUpperCase();
    const today  = isToday(iv);
    const past   = isPast(iv);
    const isOnline = (iv.mode || '').toUpperCase() === 'ONLINE';

    const buttons = [];

    if (status === 'SCHEDULED' && (today || !past) && isOnline && iv.location) {
      buttons.push(`
        <a class="btn-iv primary" href="${escapeHtml(iv.location)}" target="_blank" rel="noopener">
          <i class="bi bi-camera-video-fill"></i> Join Interview
        </a>`);
    }

    buttons.push(`
      <button class="btn-iv outline" onclick="window.viewInterviewDetail('${escapeHtml(iv.id)}')">
        <i class="bi bi-eye"></i> View Details
      </button>`);

    if (status === 'SCHEDULED' && !today && !past) {
      buttons.push(`
        <button class="btn-iv ghost" onclick="window.addToCalendar('${escapeHtml(iv.id)}')">
          <i class="bi bi-calendar-plus"></i> Add to Calendar
        </button>`);
    }

    return buttons.join('');
  }

  /* -------- Detail modal -------- */
  function openDetail(iv) {
    const modalEl = document.getElementById('ivDetailModal');
    document.getElementById('ivDetailModalTitle').textContent = iv.jobTitle || 'Interview Details';

    const result = getResult(iv);
    const status = (iv.status || 'SCHEDULED').toUpperCase();
    const isOnline = (iv.mode || '').toUpperCase() === 'ONLINE';

    document.getElementById('ivDetailModalBody').innerHTML = `
      <div class="iv-detail-section">
        <h6>Company</h6>
        <ul class="iv-detail-list">
          <li><i class="bi bi-building"></i>
            <div><strong>Name</strong>${escapeHtml(iv.companyName || '—')}</div>
          </li>
          ${iv.department ? `
          <li><i class="bi bi-diagram-3"></i>
            <div><strong>Department</strong>${escapeHtml(iv.department)}</div>
          </li>` : ''}
          <li><i class="bi bi-briefcase"></i>
            <div><strong>Role</strong>${escapeHtml(iv.jobTitle || '—')}</div>
          </li>
        </ul>
      </div>

      <div class="iv-detail-section">
        <h6>Schedule</h6>
        <ul class="iv-detail-list">
          <li><i class="bi bi-calendar-event"></i>
            <div><strong>Date</strong>${formatDate(iv.interviewDate)}</div>
          </li>
          <li><i class="bi bi-clock"></i>
            <div><strong>Time</strong>${escapeHtml(iv.startTime || '—')} – ${escapeHtml(iv.endTime || '—')}</div>
          </li>
          <li><i class="bi bi-camera-video"></i>
            <div><strong>Mode</strong>${formatMode(iv.mode)}</div>
          </li>
          <li><i class="bi bi-person-badge"></i>
            <div><strong>Interviewer</strong>${escapeHtml(iv.interviewerName || '—')}</div>
          </li>
        </ul>
      </div>

      <div class="iv-detail-section">
        <h6>Location / Meeting Link</h6>
        <p style="font-size:13.5px;color:#0f172a;word-break:break-all;margin:0;">
          ${iv.location
            ? (isOnline
                ? `<a href="${escapeHtml(iv.location)}" target="_blank" rel="noopener">${escapeHtml(iv.location)}</a>`
                : escapeHtml(iv.location))
            : '—'}
        </p>
      </div>

      ${iv.notes ? `
      <div class="iv-detail-section">
        <h6>Instructions / Notes</h6>
        <div class="iv-notes" style="margin-top:0;">
          ${escapeHtml(iv.notes)}
        </div>
      </div>` : ''}

      <div class="iv-detail-section">
        <h6>Status</h6>
        <p style="font-size:13.5px;color:#0f172a;margin:0;">
          <strong>${status}</strong>
          ${result === 'SELECTED'
            ? ' · <span style="color:#166534;">You were selected! 🎉</span>'
            : result === 'REJECTED'
              ? ' · <span style="color:#991b1b;">Not selected this time.</span>'
              : ''}
        </p>
      </div>
    `;

    bootstrap.Modal.getOrCreateInstance(modalEl).show();
  }

  /* -------- Calendar export -------- */
  function addToCalendar(id) {
    const iv = state.interviews.find(x => x.id === id);
    if (!iv) return;

    const dtStart = toICSDate(iv.interviewDate, iv.startTime);
    const dtEnd   = toICSDate(iv.interviewDate, iv.endTime);
    const title   = `${iv.jobTitle || 'Interview'} — ${iv.companyName || ''}`.trim();
    const desc    = `Interviewer: ${iv.interviewerName || '—'}\\nMode: ${formatMode(iv.mode)}\\nLocation: ${iv.location || '—'}`;

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//CampusConnect//MyInterviews//EN',
      'BEGIN:VEVENT',
      `UID:${iv.id}@campusconnect`,
      `DTSTAMP:${toICSDate(new Date().toISOString().slice(0,10), new Date().toTimeString().slice(0,5))}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${title}`,
      `DESCRIPTION:${desc}`,
      iv.location && (iv.mode || '').toUpperCase() === 'ONLINE' ? `URL:${iv.location}` : '',
      iv.location && (iv.mode || '').toUpperCase() !== 'ONLINE' ? `LOCATION:${iv.location}` : '',
      'END:VEVENT',
      'END:VCALENDAR'
    ].filter(Boolean).join('\r\n');

    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `interview-${iv.jobTitle || 'event'}.ics`.replace(/\s+/g, '-');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /* -------- Helpers -------- */
  function getResult(iv) {
    const results = iv.candidateResults || {};
    if (results[iv.studentId]) return results[iv.studentId];
    // fallback: check top-level result field if backend provides it
    return (iv.result || '').toUpperCase();
  }

  function isUpcoming(iv) {
    const status = (iv.status || '').toUpperCase();
    if (status === 'CANCELLED' || status === 'COMPLETED') return false;
    return !isPast(iv) || isToday(iv);
  }

  function isToday(iv) {
    if (!iv.interviewDate) return false;
    const today = new Date().toISOString().slice(0, 10);
    return iv.interviewDate === today;
  }

  function isPast(iv) {
    if (!iv.interviewDate) return false;
    const dt = new Date(`${iv.interviewDate}T${iv.endTime || iv.startTime || '23:59'}`);
    return dt.getTime() < Date.now();
  }

  function daysUntil(iv) {
    const dt = new Date(`${iv.interviewDate}T${iv.startTime || '00:00'}`);
    const diff = dt.getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso + 'T00:00');
      return d.toLocaleDateString('en-IN', {
        weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
      });
    } catch { return iso; }
  }

  function formatMode(mode) {
    const m = (mode || '').toUpperCase();
    if (m === 'ONLINE')      return 'Online (Video Call)';
    if (m === 'OFFLINE')     return 'Offline (In-Person)';
    if (m === 'TELEPHONIC')  return 'Telephonic';
    return mode || '—';
  }

  function toICSDate(dateStr, timeStr) {
    const [y, mo, d] = (dateStr || '').split('-');
    const [h, mi] = (timeStr || '00:00').split(':');
    return `${y}${mo}${d}T${h}${mi}00`;
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  /* -------- Expose globals for inline onclick -------- */
  window.viewInterviewDetail = function (id) {
    const iv = state.interviews.find(x => x.id === id);
    if (iv) openDetail(iv);
  };
  window.addToCalendar = addToCalendar;


})();
