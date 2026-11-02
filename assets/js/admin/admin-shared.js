/* ==========================================================================
   Vertex Admin Console — shared runtime
   Static/mock data only. No network calls (pages are opened via file://,
   so fetch()/XHR to local JSON would fail under CORS anyway).
   ========================================================================== */

/* ---------------------------- Mock data store ---------------------------- */
const MOCK = {

    students: [
        { id:'S-2201', roll:'CS21B045', name:'Aarav Kapoor', branch:'Computer Science', cgpa:8.7, status:'verified', placed:true, package:'12.5 LPA', company:'Nimbus Systems' },
        { id:'S-2202', roll:'EC21B012', name:'Meera Iyer', branch:'Electronics', cgpa:9.1, status:'verified', placed:true, package:'10.2 LPA', company:'Solstice Analytics' },
        { id:'S-2203', roll:'ME21B078', name:'Yash Trivedi', branch:'Mechanical', cgpa:7.6, status:'pending', placed:false, package:'-', company:'-' },
        { id:'S-2204', roll:'CS21B103', name:'Sanya Bhatt', branch:'Computer Science', cgpa:9.4, status:'verified', placed:true, package:'18 LPA', company:'Northbridge Consulting' },
        { id:'S-2205', roll:'IT21B029', name:'Rehan Qureshi', branch:'Information Tech', cgpa:8.0, status:'verified', placed:false, package:'-', company:'-' },
        { id:'S-2206', roll:'CV21B011', name:'Ojas Pandit', branch:'Civil', cgpa:7.2, status:'pending', placed:false, package:'-', company:'-' },
        { id:'S-2207', roll:'CS21B067', name:'Dhruv Sethi', branch:'Computer Science', cgpa:8.3, status:'verified', placed:true, package:'9.8 LPA', company:'Ledgerly Finance' },
        { id:'S-2208', roll:'EC21B054', name:'Nandini Rao', branch:'Electronics', cgpa:8.9, status:'verified', placed:false, package:'-', company:'-' },
        { id:'S-2209', roll:'ME21B033', name:'Kabir Anand', branch:'Mechanical', cgpa:6.9, status:'rejected', placed:false, package:'-', company:'-' },
        { id:'S-2210', roll:'CS21B091', name:'Ishita Verma', branch:'Computer Science', cgpa:9.6, status:'verified', placed:true, package:'22 LPA', company:'Nimbus Systems' },
    ],

    jobPostings: [
        { id:'J-301', title:'Software Engineer I', company:'Nimbus Systems', type:'Full-time', ctc:'12-15 LPA', eligibility:'CS / IT · 7.0+ CGPA', applicants:64, status:'open', postedOn:'2026-08-01' },
        { id:'J-302', title:'Business Analyst Intern', company:'Northbridge Consulting', type:'Internship', ctc:'40k/mo', eligibility:'All branches · 7.5+ CGPA', applicants:112, status:'open', postedOn:'2026-07-28' },
        { id:'J-303', title:'Embedded Systems Engineer', company:'Solstice Analytics', type:'Full-time', ctc:'10-12 LPA', eligibility:'EC / EE · 7.0+ CGPA', applicants:38, status:'closed', postedOn:'2026-07-10' },
        { id:'J-304', title:'Financial Analyst', company:'Ledgerly Finance', type:'Full-time', ctc:'9-11 LPA', eligibility:'All branches · 8.0+ CGPA', applicants:57, status:'open', postedOn:'2026-08-04' },
        { id:'J-305', title:'Manufacturing Trainee', company:'IronGate Manufacturing', type:'Full-time', ctc:'6-8 LPA', eligibility:'Mech / Civil · 6.5+ CGPA', applicants:29, status:'pending', postedOn:'2026-08-06' },
    ],

    notifications: [
        { id:1, type:'company', title:'New company registration', desc:'ByteCraft Labs submitted a registration awaiting verification.', time:'12 min ago', unread:true },
        { id:2, type:'student', title:'Student flagged for review', desc:'Ojas Pandit\'s profile was flagged for an incomplete document set.', time:'1 hr ago', unread:true },
        { id:3, type:'job', title:'Drive closing soon', desc:'Embedded Systems Engineer at Solstice Analytics closes applications tomorrow.', time:'3 hr ago', unread:true },
        { id:4, type:'placed', title:'Offer accepted', desc:'Ishita Verma accepted an offer from Nimbus Systems — 22 LPA.', time:'Yesterday', unread:false },
        { id:5, type:'company', title:'Company verified', desc:'Ledgerly Finance was verified and can now post drives.', time:'2 days ago', unread:false },
        { id:6, type:'report', title:'Monthly report ready', desc:'The July placement summary report has been generated.', time:'3 days ago', unread:false },
    ],

    admin: {
        name:'Devika Rane',
        role:'Placement Cell Administrator',
        email:'devika.rane@vertex.college.edu',
        phone:'+91 98200 11234',
        department:'Training & Placement Office',
        joined:'2024-01-15',
    }
};
/* =====================================================================
   SHARED SIDEBAR — single source of truth for nav across all admin pages.
   Edit NAV_ITEMS / CURRENT_USER here and every page picks it up.
   ===================================================================== */
const NAV_ITEMS = [
    { group: 'Placement Cell' },
    { page: 'overview',        href: 'admin-dashboard.html',  icon: 'dashboard',          label: 'Overview' },
    { page: 'companies',       href: 'companies.html',        icon: 'apartment',          label: 'Companies' },
    { page: 'students',        href: 'students.html',         icon: 'school',             label: 'Students' },
    { page: 'job-postings',    href: 'job-postings.html',     icon: 'work_outline',       label: 'Job Postings' },
    { page: 'placed-students', href: 'placed-students.html',  icon: 'military_tech',      label: 'Placed Students' },
    { page: 'reports',         href: 'reports.html',          icon: 'bar_chart',          label: 'Reports' },
    { group: 'Account' },
    { page: 'notifications',   href: 'notifications.html',    icon: 'notifications_none', label: 'Notifications', badge: true },
    { page: 'admin-profile',   href: 'admin-profile.html',    icon: 'account_circle',     label: 'Admin Profile' },
];

const CURRENT_USER = { initials: 'DR', name: 'Devika Rane', role: 'Placement Admin' };

function renderSidebar() {
    const mount = document.getElementById('adminSidebar');
    if (!mount) return; // page hasn't been migrated to the placeholder yet

    const activePage = document.body.dataset.page || mount.dataset.page || '';

    const navHtml = NAV_ITEMS.map(item => {
        if (item.group) {
            return `<span class="nav-group-label">${item.group}</span>`;
        }
        const active = item.page === activePage ? ' active-forced' : ''; // CSS below matches your existing [data-page] styling
        const badge = item.badge
            ? `<span class="badge-count" id="notifBadgeCount" style="display:none;">0</span>`
            : '';
        return `<a href="${item.href}" class="nav-link" data-page="${item.page}">
                    <i class="material-icons">${item.icon}</i> ${item.label}${badge}
                </a>`;
    }).join('');

    mount.innerHTML = `
        <div class="sidebar-brand">
            <div class="brand-mark">A</div>
            <div class="brand-text">
                <span class="name">Vertex</span>
                <span class="tag">Admin Console</span>
            </div>
        </div>

        <nav class="sidebar-nav">
            ${navHtml}
        </nav>

        <div class="sidebar-foot">
            <a href="admin-profile.html" class="sidebar-user">
                <div class="avatar">${CURRENT_USER.initials}</div>
                <div>
                    <div class="u-name">${CURRENT_USER.name}</div>
                    <div class="u-role">${CURRENT_USER.role}</div>
                </div>
            </a>
            <a href="../index.html" class="logout-link">
                <i class="material-icons">logout</i> Logout
            </a>
        </div>
    `;

    // Highlight the active link the same way your existing CSS expects.
    // If your admin-shared.css keys active state off `data-page` on <body>
    // matching the link's `data-page`, this is already handled by the
    // browser via your existing [data-page="x"] selectors — no extra JS
    // needed. If instead it relies on an `.active` class, uncomment:
    // const current = mount.querySelector(`.nav-link[data-page="${activePage}"]`);
    // if (current) current.classList.add('active');
}


/* ---------------------------- Sidebar active state ---------------------------- */
document.addEventListener('DOMContentLoaded', function () {
    renderSidebar();               // <-- populate #adminSidebar first
    // Smooth transition between pages: fade out before navigating,
    document.querySelectorAll('a[href$=".html"]').forEach(function (link) {
        link.addEventListener('click', function (e) {
            const href = link.getAttribute('href');
            if (link.target === '_blank' || e.metaKey || e.ctrlKey || !href) return;
            e.preventDefault();
            const main = document.querySelector('.admin-main');
            if (main) main.classList.add('page-leaving');
            setTimeout(function () { window.location.href = href; }, 150);
        });
    });

    const current = document.body.dataset.page;
    document.querySelectorAll('.sidebar-nav .nav-link').forEach(function (link) {
        link.classList.toggle('active', link.dataset.page === current);
    });

    const toggleBtn = document.getElementById('sidebarToggle');
    const sidebar = document.querySelector('.admin-sidebar');
    if (toggleBtn && sidebar) {
        toggleBtn.addEventListener('click', function () {
            sidebar.classList.toggle('open');
        });
    }

    renderNotifBadge();
});

function renderNotifBadge() {
    const badge = document.getElementById('notifBadgeCount');
    if (!badge) return;
    const unread = MOCK.notifications.filter(n => n.unread).length;
    if (unread > 0) {
        badge.textContent = unread;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

/* ---------------------------- Toast ---------------------------- */
function showToast(message, kind) {
    kind = kind || 'success';
    let stack = document.querySelector('.toast-stack');
    if (!stack) {
        stack = document.createElement('div');
        stack.className = 'toast-stack';
        document.body.appendChild(stack);
    }
    const icon = kind === 'success' ? 'check_circle' : 'error';
    const el = document.createElement('div');
    el.className = 'toast-item ' + kind;
    el.innerHTML = '<i class="material-icons">' + icon + '</i><span>' + escapeHtml(message) + '</span>';
    stack.appendChild(el);
    setTimeout(function () {
        el.style.transition = 'opacity .3s ease';
        el.style.opacity = '0';
        setTimeout(function () { el.remove(); }, 300);
    }, 2600);
}

/* ---------------------------- Confirm dialog (shared) ---------------------------- */
let _confirmCallback = null;

function ensureConfirmModal() {
    if (document.getElementById('sharedConfirmModal')) return;
    const wrap = document.createElement('div');
    wrap.id = 'sharedConfirmModal';
    wrap.className = 'modal-overlay-c';
    wrap.innerHTML =
        '<div class="modal-box">' +
        '  <h5 id="confirmModalTitle">Confirm action</h5>' +
        '  <p id="confirmModalMsg">Are you sure?</p>' +
        '  <div class="modal-actions">' +
        '    <button class="btn-cancel" id="confirmModalCancel">Cancel</button>' +
        '    <button class="btn-confirm" id="confirmModalOk">Confirm</button>' +
        '  </div>' +
        '</div>';
    document.body.appendChild(wrap);

    document.getElementById('confirmModalCancel').addEventListener('click', closeConfirmModal);
    wrap.addEventListener('click', function (e) { if (e.target === wrap) closeConfirmModal(); });
    document.getElementById('confirmModalOk').addEventListener('click', function () {
        if (_confirmCallback) _confirmCallback();
        closeConfirmModal();
    });
}

function openConfirm(opts) {
    ensureConfirmModal();
    document.getElementById('confirmModalTitle').textContent = opts.title || 'Confirm action';
    document.getElementById('confirmModalMsg').innerHTML = opts.message || 'Are you sure?';
    const okBtn = document.getElementById('confirmModalOk');
    okBtn.textContent = opts.confirmLabel || 'Confirm';
    okBtn.className = 'btn-confirm' + (opts.positive ? ' positive' : '');
    _confirmCallback = opts.onConfirm || null;
    document.getElementById('sharedConfirmModal').classList.add('open');
}
function closeConfirmModal() {
    const m = document.getElementById('sharedConfirmModal');
    if (m) m.classList.remove('open');
    _confirmCallback = null;
}

/* ---------------------------- Utilities ---------------------------- */
function escapeHtml(str) {
    if (str == null) return '';
    return String(str).replace(/[&<>"']/g, function (c) {
        return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
}

function statusPillHtml(status) {
    const labels = { verified:'Verified', pending:'Pending', rejected:'Rejected', open:'Open', closed:'Closed', placed:'Placed', unplaced:'Unplaced', inactive:'Inactive' };
    return '<span class="pill ' + status + '">' + (labels[status] || status) + '</span>';
}

function initials(name) {
    return name.split(' ').filter(Boolean).slice(0,2).map(function (w) { return w[0]; }).join('').toUpperCase();
}