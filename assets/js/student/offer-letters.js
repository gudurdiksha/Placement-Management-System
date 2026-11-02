/* ========================================================================
   Offer Letters — Student Page
   ======================================================================== */

(function () {
  'use strict';

  const API = (window.API_BASE || 'http://127.0.0.1:8080') + '/api/offers';

  const state = {
    offers: [],
    studentId: null,
    currentPreviewOffer: null
  };

  // document.addEventListener('DOMContentLoaded', boot);

  // Use:
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();   // DOM already parsed → run immediately
}
  async function boot() {
    if (typeof Session !== 'undefined' && Session.requireSession) {
      if (!Session.requireSession()) return;
    }
    bindUI();
    await loadOffers();
  }

  /* -------- Bind UI -------- */
  function bindUI() {
    document.getElementById('refreshOffersBtn')
      .addEventListener('click', loadOffers);

    document.getElementById('previewDownloadBtn')
      .addEventListener('click', () => {
        if (state.currentPreviewOffer) {
          downloadPDF(state.currentPreviewOffer);
        }
      });
  }

  /* -------- Resolve student ID -------- */
  /* -------- Resolve student ID (multi-source) -------- */
function getStudentId() {
  // 1. Try Session helper if it exposes a getter
  if (typeof Session !== 'undefined') {
    if (typeof Session.getStudentId === 'function') {
      const sid = Session.getStudentId();
      if (sid) return sid;
    }
    if (typeof Session.getUser === 'function') {
      const u = Session.getUser();
      if (u) {
        const sid = u.studentId || u.id || u.userId || u._id;
        if (sid) return sid;
      }
    }
    // Some projects store in Session.data / Session.user
    if (Session.data) {
      const sid = Session.data.studentId || Session.data.id || Session.data.userId;
      if (sid) return sid;
    }
    if (Session.user) {
      const sid = Session.user.studentId || Session.user.id || Session.user.userId;
      if (sid) return sid;
    }
  }

  // 2. Try localStorage / sessionStorage
  const storageKeys = [
    'studentId', 'userId', 'user_id',
    'currentStudentId', 'campusconnect_user'
  ];
  for (const key of storageKeys) {
    let v = localStorage.getItem(key) || sessionStorage.getItem(key);
    if (!v) continue;
    // If stored as JSON, try to parse
    if (v.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(v);
        const sid = parsed.studentId || parsed.id || parsed.userId || parsed._id;
        if (sid) return sid;
      } catch { /* ignore */ }
    } else if (v) {
      return v;
    }
  }

  // 3. Fallback: read the DOM for a hidden data attribute
  const el = document.querySelector('[data-student-id]');
  if (el) {
    const sid = el.getAttribute('data-student-id');
    if (sid) return sid;
  }

  return null;
}

  /* -------- Load offers -------- */
 /* -------- Load offers -------- */
async function loadOffers() {
  const container = document.getElementById('offerList');

  try {
    // ✅ Use the session-based endpoint — no studentId needed
    const res = await fetch(`${API}/my-offers?t=${Date.now()}`, {
      credentials: 'include',
      cache: 'no-store'
    });

    if (res.status === 401) {
      container.innerHTML = renderEmptyState({
        icon: 'exclamation-triangle-fill',
        iconBg: '#fee2e2',
        iconColor: '#991b1b',
        title: 'Session expired',
        body: 'Please log in again to view your offers.',
        ctaLabel: 'Go to Login',
        ctaIcon: 'box-arrow-in-right',
        ctaHref: 'login.html'
      });
      return;
    }

    if (!res.ok) throw new Error('Failed to load offers (HTTP ' + res.status + ')');
    const data = await res.json();

    state.offers = Array.isArray(data) ? data : [];
    updateStats();
    render();
  } catch (e) {
    console.error('LOAD ERROR:', e);
    container.innerHTML = renderEmptyState({
      icon: 'x-octagon-fill',
      iconBg: '#fee2e2',
      iconColor: '#991b1b',
      title: 'Could not load offers',
      body: e.message,
      ctaLabel: 'Retry',
      ctaIcon: 'arrow-clockwise',
      ctaHref: 'javascript:location.reload()'
    });
  }

  /* -------- Stats -------- */
  function updateStats() {
    const total    = state.offers.length;
    const sent     = state.offers.filter(o => (o.status || '').toUpperCase() === 'SENT').length;
    const accepted = state.offers.filter(o => (o.status || '').toUpperCase() === 'ACCEPTED').length;
    const declined = state.offers.filter(o => (o.status || '').toUpperCase() === 'DECLINED').length;

    document.getElementById('statTotalOffers').textContent    = total;
    document.getElementById('statPendingOffers').textContent  = sent;
    document.getElementById('statAcceptedOffers').textContent = accepted;
    document.getElementById('statDeclinedOffers').textContent = declined;
  }

  /* -------- Render list -------- */
  function render() {
    const container = document.getElementById('offerList');

    if (!state.offers.length) {
      container.innerHTML = renderEmptyState({
        icon: 'envelope-open',
        title: 'No offer letters yet',
        body: 'When a company sends you an offer letter, it will appear here.',
        ctaLabel: 'View My Interviews',
        ctaIcon: 'people-fill',
        ctaHref: 'my-interviews.html'
      });
      return;
    }

    container.innerHTML = state.offers.map(renderCard).join('');
  }
}
  function renderEmptyState(opts) {
    const iconBg    = opts.iconBg    || '#f0fdfa';
    const iconColor = opts.iconColor || '#0E9AA3';
    return `
      <div class="ol-empty">
        <div class="ol-empty-icon" style="background:${iconBg};color:${iconColor};">
          <i class="bi bi-${opts.icon}"></i>
        </div>
        <h5>${escapeHtml(opts.title)}</h5>
        <p>${escapeHtml(opts.body)}</p>
        <a href="${opts.ctaHref}" class="btn-teal">
          <i class="bi bi-${opts.ctaIcon}"></i> ${escapeHtml(opts.ctaLabel)}
        </a>
      </div>`;
  }

  function renderCard(o) {
    const status = (o.status || 'SENT').toUpperCase();
    const cardClass = status === 'ACCEPTED' ? 'is-accepted'
                    : status === 'DECLINED' ? 'is-declined'
                    : '';

    const statusIcon = status === 'ACCEPTED' ? 'patch-check-fill'
                     : status === 'DECLINED' ? 'x-circle-fill'
                     : 'send-fill';

    const statusLabel = status === 'SENT' ? 'Awaiting Response' : status;

    return `
      <div class="ol-card ${cardClass}">
        <div>
          <div class="ol-header">
            <h3 class="ol-role">${escapeHtml(o.role || 'Job Offer')}</h3>
            <span class="ol-status ${status}">
              <i class="bi bi-${statusIcon}"></i> ${statusLabel}
            </span>
          </div>
          <p class="ol-company">
            <i class="bi bi-building"></i>
            ${escapeHtml(o.companyName || 'Company')}
          </p>

          <div class="ol-grid">
            <div class="ol-meta">
              <i class="bi bi-currency-rupee"></i>
              <div>
                <span class="ol-meta-label">Salary (CTC)</span>
                <span class="ol-meta-value">₹ ${escapeHtml(o.salary || '—')}</span>
              </div>
            </div>
            <div class="ol-meta">
              <i class="bi bi-calendar-event"></i>
              <div>
                <span class="ol-meta-label">Joining Date</span>
                <span class="ol-meta-value">${formatDate(o.joiningDate)}</span>
              </div>
            </div>
            <div class="ol-meta">
              <i class="bi bi-geo-alt"></i>
              <div>
                <span class="ol-meta-label">Location</span>
                <span class="ol-meta-value">${escapeHtml(o.location || '—')}</span>
              </div>
            </div>
            <div class="ol-meta">
              <i class="bi bi-clock-history"></i>
              <div>
                <span class="ol-meta-label">Sent On</span>
                <span class="ol-meta-value">${formatDate(o.sentAt)}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="ol-actions">
          <button class="ol-btn outline" onclick="OfferLetters.viewOffer('${o.id}')">
            <i class="bi bi-eye-fill"></i> View Letter
          </button>
          <button class="ol-btn primary" onclick="OfferLetters.downloadOffer('${o.id}')">
            <i class="bi bi-download"></i> Download PDF
          </button>
          ${status === 'SENT' ? `
            <button class="ol-btn success" onclick="OfferLetters.respondOffer('${o.id}','ACCEPTED')">
              <i class="bi bi-check-circle-fill"></i> Accept
            </button>
            <button class="ol-btn danger" onclick="OfferLetters.respondOffer('${o.id}','DECLINED')">
              <i class="bi bi-x-circle-fill"></i> Decline
            </button>` : ''}
        </div>
      </div>`;
  }

  /* -------- Offer preview modal -------- */
  function viewOffer(offerId) {
    const o = state.offers.find(x => x.id === offerId);
    if (!o) return;
    state.currentPreviewOffer = o;

    const today = new Date().toLocaleDateString('en-IN', {
      day: '2-digit', month: 'long', year: 'numeric'
    });

    document.getElementById('offerPreviewContent').innerHTML = `
      <div class="letterhead">
        <div class="brand">
          ${escapeHtml(o.companyName || 'HireDesk')}
          <small>Offer of Employment</small>
        </div>
        <div class="date">${today}</div>
      </div>

      <h3>Offer Letter for ${escapeHtml(o.role || 'the position')}</h3>

      <p>Dear <strong>${escapeHtml(o.studentName || 'Candidate')}</strong>,</p>

      <p>
        We are pleased to offer you the position of <strong>${escapeHtml(o.role || '—')}</strong>
        at <strong>${escapeHtml(o.companyName || 'our company')}</strong>. Your
        performance during the interview process was impressive, and we are excited to have
        you join our team.
      </p>

      <div class="terms">
        <div><strong>Position</strong> <span>${escapeHtml(o.role || '—')}</span></div>
        <div><strong>Annual CTC</strong> <span>₹ ${escapeHtml(o.salary || '—')}</span></div>
        <div><strong>Joining Date</strong> <span>${formatDate(o.joiningDate)}</span></div>
        <div><strong>Work Location</strong> <span>${escapeHtml(o.location || '—')}</span></div>
      </div>

      ${o.notes ? `
        <p><strong>Additional Terms:</strong></p>
        <p style="white-space:pre-line;">${escapeHtml(o.notes)}</p>` : ''}

      <p>
        Please review the details above carefully. Kindly confirm your acceptance by
        clicking the <em>Accept</em> button in your dashboard or by writing back to us.
      </p>

      <p>We look forward to welcoming you aboard!</p>

      <div class="signature">
        <p>Warm regards,</p>
        <div class="sign-name">${escapeHtml(o.interviewerName || 'HR Team')}</div>
        <div class="sign-role">${escapeHtml(o.companyName || 'Company')}</div>
      </div>
    `;

    bootstrap.Modal.getOrCreateInstance(
      document.getElementById('offerPreviewModal')
    ).show();
  }

  /* -------- Download PDF -------- */
  function downloadOffer(offerId) {
    const o = state.offers.find(x => x.id === offerId);
    if (!o) return;
    downloadPDF(o);
  }

  function downloadPDF(o) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });

    const pageW = doc.internal.pageSize.getWidth();
    const margin = 60;
    let y = margin;

    // Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor('#0E9AA3');
    doc.text(o.companyName || 'HireDesk', margin, y);
    y += 24;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor('#64748b');
    doc.text('OFFER OF EMPLOYMENT', margin, y);
    y += 30;

    // Divider
    doc.setDrawColor('#0E9AA3');
    doc.setLineWidth(1.5);
    doc.line(margin, y, pageW - margin, y);
    y += 30;

    // Date
    doc.setFontSize(10);
    doc.setTextColor('#64748b');
    const dateStr = new Date().toLocaleDateString('en-IN', {
      day: '2-digit', month: 'long', year: 'numeric'
    });
    doc.text(dateStr, pageW - margin, y, { align: 'right' });
    y += 24;

    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor('#0f172a');
    doc.text(`Offer Letter — ${o.role || 'Job Offer'}`, margin, y);
    y += 30;

    // Body
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor('#334155');

    doc.text(`Dear ${o.studentName || 'Candidate'},`, margin, y);
    y += 20;

    const body = doc.splitTextToSize(
      `We are pleased to offer you the position of ${o.role || 'the position'} at ` +
      `${o.companyName || 'our company'}. Your performance during the interview process ` +
      `was impressive, and we are excited to have you join our team.`,
      pageW - margin * 2
    );
    doc.text(body, margin, y);
    y += body.length * 15 + 12;

    // Terms box
    doc.setFillColor('#f0fdfa');
    doc.roundedRect(margin, y, pageW - margin * 2, 90, 6, 6, 'F');
    y += 22;

    doc.setFont('helvetica', 'bold');
    doc.setTextColor('#0E9AA3');
    doc.setFontSize(11);
    doc.text('OFFER DETAILS', margin + 16, y);
    y += 18;

    doc.setFont('helvetica', 'normal');
    doc.setTextColor('#334155');
    doc.setFontSize(10);

    const terms = [
      ['Position',      o.role || '—'],
      ['Annual CTC',    'Rs. ' + (o.salary || '—')],
      ['Joining Date',  formatDate(o.joiningDate)],
      ['Work Location', o.location || '—']
    ];
    terms.forEach(([k, v]) => {
      doc.setFont('helvetica', 'bold');
      doc.text(k, margin + 16, y);
      doc.setFont('helvetica', 'normal');
      doc.text(String(v), margin + 140, y);
      y += 15;
    });

    y += 20;

    // Notes
    if (o.notes) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor('#0f172a');
      doc.text('Additional Terms:', margin, y);
      y += 16;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor('#475569');
      const notes = doc.splitTextToSize(o.notes, pageW - margin * 2);
      doc.text(notes, margin, y);
      y += notes.length * 14 + 12;
    }

    // Closing
    doc.setFontSize(11);
    doc.setTextColor('#334155');
    const closing = doc.splitTextToSize(
      'Please review the details above carefully. Kindly confirm your acceptance ' +
      'by clicking the Accept button in your dashboard or by writing back to us. ' +
      'We look forward to welcoming you aboard!',
      pageW - margin * 2
    );
    doc.text(closing, margin, y);
    y += closing.length * 15 + 30;

    // Signature
    doc.setDrawColor('#cbd5e1');
    doc.setLineWidth(0.8);
    doc.line(margin, y, pageW - margin, y);
    y += 20;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor('#0f172a');
    doc.text('Warm regards,', margin, y);
    y += 16;
    doc.setFontSize(12);
    doc.text(o.interviewerName || 'HR Team', margin, y);
    y += 14;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor('#64748b');
    doc.text(o.companyName || 'Company', margin, y);

    // Footer
    doc.setFontSize(8);
    doc.setTextColor('#94a3b8');
    doc.text(
      'This is a computer-generated offer letter.',
      pageW / 2, doc.internal.pageSize.getHeight() - 30, { align: 'center' }
    );

    const safeRole = (o.role || 'Offer').replace(/[^a-z0-9]/gi, '_');
    const safeName = (o.studentName || 'Candidate').replace(/\s+/g, '_');
    doc.save(`OfferLetter_${safeRole}_${safeName}.pdf`);
  }

  /* -------- Accept / Decline -------- */
  async function respondOffer(offerId, status) {
    const verb = status === 'ACCEPTED' ? 'accept' : 'decline';
    if (!confirm(`Are you sure you want to ${verb} this offer?`)) return;

    try {
      const res = await fetch(`${API}/${offerId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to update offer');
      }

      showToast(`Offer ${status.toLowerCase()} successfully`, 'success');
      await loadOffers();
    } catch (e) {
      showToast('Error: ' + e.message, 'danger');
    }
  }

  /* -------- Helpers -------- */
  function formatDate(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      if (isNaN(d)) return iso;
      return d.toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric'
      });
    } catch { return iso; }
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function showToast(msg, kind) {
    const t = document.createElement('div');
    t.className = `ol-toast ${kind || 'info'}`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }

  /* -------- Public API -------- */
  window.OfferLetters = {
    viewOffer,
    downloadOffer,
    respondOffer,
    reload: loadOffers
  };

})();