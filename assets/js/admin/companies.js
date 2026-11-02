/* =====================================================================
   API CONFIGURATION
   -----------------------------------------------------------------------
   Adjust BASE_URL / paths here if your backend routes differ. All calls
   assume standard REST + JSON, and an optional bearer token stored in
   localStorage under "vertex_admin_token" (drop the header block below
   if your API doesn't need auth).
   ===================================================================== */
const API = {
    BASE_URL: 'http://localhost:8080/api/companies',
    list: () => `${API.BASE_URL}`,
    detail: (id) => `${API.BASE_URL}/${id}`,
    verify: (id) => `${API.BASE_URL}/${id}/verify`,
    activate: (id) => `${API.BASE_URL}/${id}/activate`,
    deactivate: (id) => `${API.BASE_URL}/${id}/deactivate`,
    remove: (id) => `${API.BASE_URL}/${id}`,
};

function authHeaders() {
    const token = localStorage.getItem('vertex_admin_token');
    return {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
}

async function apiRequest(url, options = {}) {
    const res = await fetch(url, { headers: authHeaders(), ...options });
    if (!res.ok) {
        let message = `Request failed (${res.status})`;
        try {
            const body = await res.json();
            if (body && body.message) message = body.message;
        } catch (_) { /* non-JSON error body, ignore */ }
        throw new Error(message);
    }
    if (res.status === 204) return null;
    return res.json();
}

/* =====================================================================
   STATE
   ===================================================================== */
let allCompanies = [];        // full list from the API, cached client-side
let companyFilter = 'all';
let companyIndustry = '';
let companySearch = '';
let loadState = 'loading';    // 'loading' | 'error' | 'ready'
let loadError = '';

/* =====================================================================
   DATA LOADING
   ===================================================================== */
async function loadCompanies() {
    loadState = 'loading';
    renderCompanies();
    try {
        const data = await apiRequest(API.list());
        // Accept either a bare array or a { companies: [...] } / { data: [...] } envelope.
        const raw = Array.isArray(data) ? data : (data.companies || data.data || []);
        // Filter out any null/undefined entries so renderCompanies never crashes.
        allCompanies = raw.filter(Boolean);
        loadState = 'ready';
    } catch (err) {
        loadState = 'error';
        loadError = err.message || 'Could not reach the server.';
    }
    renderCompanies();
    updateNotifBadgeFallback();
}

function updateNotifBadgeFallback() {
    // Keep existing badge behaviour if admin-shared.js doesn't already handle it.
    const pending = allCompanies.filter(c => !c.isVerified).length;
    const badge = document.getElementById('notifBadgeCount');
    if (badge && pending > 0) {
        badge.textContent = pending;
        badge.style.display = 'inline-block';
    }
}

/* =====================================================================
   COMPANY-SPECIFIC STATUS PILL
   -----------------------------------------------------------------------
   NOTE: this is intentionally NOT named statusPillHtml — that name is
   already used in admin-shared.js for a generic status->label pill
   (students, job postings, etc.) that takes a plain string. Companies
   need two independent booleans (verified + active), so this is a
   separate function local to this file.
   ===================================================================== */
function companyStatusPillHtml(c) {
    if (!c.isVerified) return `<span class="pill pill-pending">Pending</span>`;
    if (c.isVerified && c.isActive) return `<span class="pill pill-verified">Verified</span>`;
    return `<span class="pill pill-deactivated">Deactivated</span>`;
}

/* =====================================================================
   RENDER
   ===================================================================== */
function renderCompanies() {
    const body = document.getElementById('companyTableBody');
    const countEl = document.getElementById('companyResultCount');

    if (loadState === 'loading') {
        body.innerHTML = `<tr class="cd-state-row"><td colspan="7"><div class="spinner"></div>Loading companies…</td></tr>`;
        countEl.textContent = '— results';
        return;
    }

    if (loadState === 'error') {
        body.innerHTML = `<tr class="cd-state-row"><td colspan="7">
            Couldn't load companies: ${escapeHtml(loadError)}<br>
            <button class="cd-retry-btn" onclick="loadCompanies()">Retry</button>
        </td></tr>`;
        countEl.textContent = '— results';
        return;
    }

    let rows = allCompanies.filter(Boolean).filter(c => {
        if (companyFilter === 'verified' && !(c.isVerified && c.isActive)) return false;
        if (companyFilter === 'pending' && c.isVerified) return false;
        if (companyFilter === 'deactivated' && !(c.isVerified && !c.isActive)) return false;
        if (companyIndustry && c.industryType !== companyIndustry) return false;
        if (companySearch && !((c.name || '') + ' ' + (c.contactPersonName || '')).toLowerCase().includes(companySearch.toLowerCase())) return false;
        return true;
    });

    countEl.textContent = rows.length + ' result' + (rows.length !== 1 ? 's' : '');

    if (rows.length === 0) {
        body.innerHTML = '<tr class="empty-row"><td colspan="7">No companies match this view.</td></tr>';
        return;
    }

    body.innerHTML = rows.map(c => {
        const verified = !!c.isVerified;
        const active = !!c.isActive;

        return `
        <tr>
            <td><div class="avatar-cell"><div class="av">${initials(c.name)}</div><div>
                <div class="cell-primary">${escapeHtml(c.name)}</div>
                <div class="cell-sub">${escapeHtml(c.email || '')}</div>
            </div></div></td>

            <td>${escapeHtml(c.contactPersonName || '—')}</td>
            <td>${escapeHtml(c.industryType || '—')}</td>
            <td>${escapeHtml(c.employeeCount != null ? String(c.employeeCount) : '—')}</td>
            <td class="mono">${c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '—'}</td>
            <td>${companyStatusPillHtml(c)}</td>
            <td>
                <div class="row-actions">
                    <button class="view-btn" title="View details" onclick="openCompanyDetail('${c.id}')">
                        <i class="material-icons">visibility</i>
                    </button>

                    <button class="verify-btn ${verified ? 'is-verified' : ''}"
                            title="${verified ? 'Verified' : 'Verify company'}"
                            ${verified ? 'disabled' : ''}
                            onclick="companyAction('verify','${c.id}','${escapeHtml(c.name)}')">
                        <i class="material-icons">${verified ? 'verified' : 'check_circle'}</i>
                    </button>

                    <button class="toggle-btn ${active ? 'is-active' : 'is-inactive'} ${!verified ? 'is-locked' : ''}"
                            title="${!verified ? 'Verify company first' : (active ? 'Deactivate' : 'Activate')}"
                            ${!verified ? 'disabled' : ''}
                            onclick="companyAction('${active ? 'deactivate' : 'activate'}','${c.id}','${escapeHtml(c.name)}')">
                        <i class="material-icons">${!verified ? 'lock' : (active ? 'toggle_on' : 'toggle_off')}</i>
                    </button>

                    <button class="delete-btn" title="Delete" onclick="companyAction('delete','${c.id}','${escapeHtml(c.name)}')">
                        <i class="material-icons">delete</i>
                    </button>
                </div>
            </td>
        </tr>
    `;
    }).join('');
}

/* =====================================================================
   ACTIONS — verify / activate / deactivate / delete
   Each hits the API first; the table only updates locally once the
   server confirms the change, so the UI never drifts from real data.
   Verify and activate/deactivate are independent — each only touches
   its own field on the company record.
   ===================================================================== */
function companyAction(type, id, name) {
    const cfg = {
        verify: { title: 'Verify company', message: `Verify <b>${name}</b>? They can log in once they're also activated.`, label: 'Verify', positive: true },
        activate: { title: 'Activate company', message: `Activate <b>${name}</b>? They'll regain dashboard access (if verified).`, label: 'Activate', positive: true },
        deactivate: { title: 'Deactivate company', message: `Deactivate <b>${name}</b>? They will lose dashboard access immediately.`, label: 'Deactivate' },
        delete: { title: 'Delete company', message: `Permanently delete <b>${name}</b>? This cannot be undone.`, label: 'Delete' },
    }[type];

    openConfirm({
        title: cfg.title,
        message: cfg.message,
        confirmLabel: cfg.label,
        positive: cfg.positive,
        onConfirm: async function () {
            try {
                const c = allCompanies.find(x => x.id === id);

                // Guard: activate/deactivate is only allowed once verified.
                // The button is disabled in the UI for this case too, but this
                // stops the action if it's ever triggered another way.
                if ((type === 'activate' || type === 'deactivate') && c && !c.isVerified) {
                    showToast('Verify ' + name + ' before changing activation status.', 'error');
                    return;
                }

                if (type === 'verify') {
                    await apiRequest(API.verify(id), { method: 'PATCH' });
                    if (c) c.isVerified = true;
                } else if (type === 'activate') {
                    await apiRequest(API.activate(id), { method: 'PATCH' });
                    if (c) c.isActive = true;
                } else if (type === 'deactivate') {
                    await apiRequest(API.deactivate(id), { method: 'PATCH' });
                    if (c) c.isActive = false;
                } else if (type === 'delete') {
                    await apiRequest(API.remove(id), { method: 'DELETE' });
                    allCompanies = allCompanies.filter(x => x.id !== id);
                }
                renderCompanies();
                showToast(cfg.label + 'd ' + name + ' successfully.');
            } catch (err) {
                showToast('Failed to ' + cfg.label.toLowerCase() + ' ' + name + ': ' + (err.message || 'unknown error'), 'error');
            }
        }
    });
}

/* =====================================================================
   DETAIL MODAL — "view complete details" report for one company
   ===================================================================== */
async function openCompanyDetail(id) {
    const overlay = document.getElementById('cdModalOverlay');
    const bodyEl = document.getElementById('cdModalBody');
    const titleEl = document.getElementById('cdModalTitle');

    if (!overlay || !bodyEl || !titleEl) {
        console.error('Company detail modal elements missing:', { overlay, bodyEl, titleEl });
        alert('Modal elements not found on page — check that cdModalOverlay/cdModalBody/cdModalTitle exist in companies.html.');
        return;
    }

    overlay.classList.add('open');
    titleEl.textContent = 'Company details';
    bodyEl.innerHTML = `<div class="cd-state-row"><div class="spinner"></div>Loading details…</div>`;

    try {
        const data = await apiRequest(API.detail(id));
        // Accept either a bare company object or a { company: {...} } / { data: {...} } envelope.
        const c = data && (data.company || data.data || data);

        if (!c || typeof c !== 'object') {
            throw new Error('Unexpected response shape from server.');
        }

        titleEl.textContent = c.name || 'Company details';

        // modal basicFields array
        const basicFields = [
            ['HR Contact', c.contactPersonName],
            ['Email', c.email],
            ['Phone', c.contactNumber],
            ['Industry', c.industryType],
            ['Company Size', c.employeeCount],
            ['Website', c.website],
            ['Address', c.location],
            ['Joined', c.createdAt ? new Date(c.createdAt).toLocaleDateString() : null],
            ['Verified', c.isVerified ? 'Yes' : 'No'],
            ['Active', c.isActive ? 'Yes' : 'No'],
            ['LinkedIn', c.linkedinUrl],
            ['Registration code', c.registrationNumber]

        ].filter(([, v]) => v);

        let html = `<div class="cd-detail-grid">${basicFields.map(([k, v]) => `
            <div class="cd-detail-item"><div class="k">${escapeHtml(k)}</div><div class="v">${escapeHtml(String(v))}</div></div>
        `).join('')}</div>`;

        if (c.description) {
            html += `<div class="cd-section-title">About</div><div class="cd-list-item">${escapeHtml(c.description)}</div>`;
        }

        if (Array.isArray(c.jobPostings) && c.jobPostings.length) {
            html += `<div class="cd-section-title">Job postings (${c.jobPostings.length})</div>`;
            html += c.jobPostings.map(j => `
                <div class="cd-list-item">${escapeHtml(j.title || 'Untitled role')} — ${escapeHtml(j.status || '')} · ${j.applicants != null ? j.applicants + ' applicants' : ''}</div>
            `).join('');
        }

        if (Array.isArray(c.placedStudents) && c.placedStudents.length) {
            html += `<div class="cd-section-title">Students placed (${c.placedStudents.length})</div>`;
            html += c.placedStudents.map(s => `
                <div class="cd-list-item">${escapeHtml(s.name || 'Unnamed')} — ${escapeHtml(s.role || '')} ${s.package ? '· ' + escapeHtml(s.package) : ''}</div>
            `).join('');
        }

        bodyEl.innerHTML = html;
    } catch (err) {
        bodyEl.innerHTML = `<div class="cd-state-row">
            Couldn't load this company's details: ${escapeHtml(err.message || 'unknown error')}<br>
            <button class="cd-retry-btn" onclick="openCompanyDetail('${id}')">Retry</button>
        </div>`;
    }
}

function closeCompanyDetail() {
    document.getElementById('cdModalOverlay').classList.remove('open');
}

/* =====================================================================
   INIT
   ===================================================================== */
document.addEventListener('DOMContentLoaded', function () {
    loadCompanies();

    document.querySelectorAll('#companyFilters .chip').forEach(chip => {
        chip.addEventListener('click', function () {
            document.querySelectorAll('#companyFilters .chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            companyFilter = chip.dataset.filter;
            renderCompanies();
        });
    });
    document.getElementById('industryFilter').addEventListener('change', function (e) { companyIndustry = e.target.value; renderCompanies(); });
    document.getElementById('companySearch').addEventListener('input', function (e) { companySearch = e.target.value; renderCompanies(); });
    document.getElementById('refreshBtn').addEventListener('click', loadCompanies);

    document.getElementById('cdModalClose').addEventListener('click', closeCompanyDetail);
    document.getElementById('cdModalCloseBtn').addEventListener('click', closeCompanyDetail);
    document.getElementById('cdModalOverlay').addEventListener('click', function (e) {
        if (e.target === this) closeCompanyDetail();
    });
});