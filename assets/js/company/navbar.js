
requestAnimationFrame(() => {
    document.body.classList.add('page-ready');
});
(function () {
    const NAVBAR_HTML = `
<style>
    .profile-nudge-dot{display:inline-block;width:7px;height:7px;border-radius:50%;
        background:var(--bad,#e53935);margin-left:6px;vertical-align:middle;}
    .side-foot{display:flex;align-items:center;}
</style>

<ul id="mobile-sidenav" class="sidenav sidenav-fixed">
    <div class="side-brand">
        <div class="brand-mark">H</div>
        <div class="brand-text">
            <span id="nav-brand-name" class="name">HireDesk</span>
            <span class="sub">Company Portal</span>
        </div>
    </div>

    <li class="side-section-label">Main</li>

<li data-nav="dashboard">
    <a class="side-link" href="index.html">
        <i class="material-icons">dashboard</i>
        Dashboard
    </a>
</li>

<li data-nav="profile">
    <a class="side-link" href="profile.html">
        <i class="material-icons">business</i>
        Profile
        <span id="nav-profile-dot" class="profile-nudge-dot" hidden></span>
    </a>
</li>

<li data-nav="jobs" class="has-submenu">
    <a href="#!" class="side-link nav-dropdown-toggle">
        <i class="material-icons">work</i>
        <span>Jobs</span>
        <i class="material-icons dropdown-arrow">keyboard_arrow_down</i>
    </a>

    <ul class="side-submenu">
        <li data-nav="create-job">
            <a href="job-postings.html" class="side-sub-link">
                <i class="material-icons">add</i>
                Create Job
            </a>
        </li>

        <li data-nav="manage-jobs">
            <a href="manage-jobs.html" class="side-sub-link">
                <i class="material-icons">list</i>
                Manage Jobs
            </a>
        </li>
    </ul>
</li>

<li data-nav="applications">
    <a class="side-link" href="applications.html">
        <i class="material-icons">assignment_ind</i>
        Applications
    </a>
</li>

<li data-nav="assessments">
    <a class="side-link" href="test-assessments.html">
        <i class="material-icons">quiz</i>
        Test Assessments
    </a>
</li>

<li data-nav="interviews">
    <a class="side-link" href="interview-process.html">
        <i class="material-icons">event</i>
        Interview Process
    </a>
</li>

<li data-nav="reports">
    <a class="side-link" href="reports.html">
        <i class="material-icons">bar_chart</i>
        Reports
    </a>
</li>
<li data-nav="notifications">
    <a class="side-link" href="notifications.html">
        <i class="material-icons">notifications</i>
        Notifications
    </a>
</li>

    <div class="side-foot">
        <a href="profile.html" style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;text-decoration:none;color:inherit;">
            <div id="nav-avatar" class="avatar">--</div>
            <div class="who" style="min-width:0;">
                <span id="nav-company-name" class="n" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;">Loading…</span>
                <span id="nav-profile-pct" class="r">-- % profile complete</span>
            </div>
        </a>
        <a href="#" id="nav-logout-btn" class="tooltipped" data-position="top" data-tooltip="Log out" style="margin-left:8px;">
            <i class="material-icons" style="font-size:20px;opacity:.7;">logout</i>
        </a>
    </div>
</ul>

<div id="app-topbar" class="topbar">
    <div class="page-title">
        <span id="nav-page-title"></span>
        <span id="nav-page-crumb" class="crumb"></span>
    </div>
    <div class="top-actions">
        <span id="nav-status-pill" class="pill"></span>
        <i class="material-icons icon-btn tooltipped" data-position="bottom" data-tooltip="Notifications">notifications_none</i>
        <i class="material-icons icon-btn tooltipped" data-position="bottom" data-tooltip="Help">help_outline</i>
        <i id="nav-logout-btn-top" class="material-icons icon-btn tooltipped" data-position="bottom" data-tooltip="Log out">logout</i>
    </div>
</div>
`;

    function initialsFrom(name) {
        return (name || '?')
            .split(/\s+/).filter(Boolean).slice(0, 2)
            .map(w => w[0].toUpperCase()).join('') || '?';
    }

    // Re-reads session + cached profile and refreshes just the navbar bits
    // that can change after the page loads (e.g. after saving the profile
    // form). Safe to call any time after navbar:ready has fired.
    function refresh() {
        const session = Session.getSession();
        if (!session) return;
        const completion = Session.computeCompletion(Session.getCachedProfile());

        const avatarEl = document.getElementById('nav-avatar');
        if (avatarEl) avatarEl.textContent = initialsFrom(session.name);

        const nameEl = document.getElementById('nav-company-name');
        if (nameEl) nameEl.textContent = session.name || 'Company';

        const brandNameEl = document.getElementById('nav-brand-name');
        if (brandNameEl) brandNameEl.textContent = session.name || 'HireDesk';

        const pctEl = document.getElementById('nav-profile-pct');
        if (pctEl) pctEl.textContent = completion.percent + '% profile complete';

        const dot = document.getElementById('nav-profile-dot');
        if (dot) dot.hidden = completion.isComplete;

        const statusPill = document.getElementById('nav-status-pill');
        if (statusPill) {
            // Backend sends two independent booleans, not a single status string.
            const verified = !!session.isVerified;
            const active = !!session.isActive;

            let label, cls;
            if (!verified) {
                label = 'Pending Verification';
                cls = 'pill-warn';
            } else if (!active) {
                label = 'Deactivated';
                cls = 'pill-warn';
            } else {
                label = 'Verified';
                cls = 'pill-ok';
            }

            statusPill.textContent = label;
            statusPill.className = 'pill ' + cls;
        }
    }

    // function initNavbar() {
    //     const placeholder = document.getElementById('navbar-placeholder');
    //     if (!placeholder) {
    //         console.warn('navbar.js: no #navbar-placeholder on this page — nothing to connect.');
    //         return;
    //     }

    //     // Guard the page before rendering the navbar.
    //     const session = Session.requireSession();
    //     if (!session) return; // already redirecting to login

    //     const pageTitle = placeholder.dataset.pageTitle || '';
    //     const pageCrumb = placeholder.dataset.pageCrumb || '';
    //     const activeKey = placeholder.dataset.navActive || '';

    //     // Inline injection — no fetch(), so this works from file:// too.
    //     placeholder.outerHTML = NAVBAR_HTML;

        
    //     // Active link highlight
    //     // if (activeKey) {
    //     //     const activeLi = document.querySelector(`#mobile-sidenav li[data-nav="${activeKey}"]`);
    //     //     if (activeLi) activeLi.classList.add('active');
    //     // }
    //     // Active link + Jobs dropdown
    function initNavbar() {
    const session = Session.requireSession();
    if (!session) return;

    const placeholder = document.getElementById('navbar-placeholder');

    // If page already contains inline navbar markup, use it as the source
    // of page metadata; do not re-inject.
    if (placeholder) {
        const pageTitle = placeholder.dataset.pageTitle || '';
        const pageCrumb = placeholder.dataset.pageCrumb || '';
        const activeKey = placeholder.dataset.navActive || '';

        // Inject only if navbar isn't already in the DOM
        if (!document.getElementById('mobile-sidenav')) {
            placeholder.outerHTML = NAVBAR_HTML;
        } else {
            placeholder.remove();
        }

        // Store for later use (title, crumb, active key)
        window.__navMeta = { pageTitle, pageCrumb, activeKey };
    } else {
        // No placeholder at all — page must already have the inline navbar.
        // We don't know title/crumb/active from a placeholder, so read them
        // from data attributes on <body> as a fallback.
        const b = document.body;
        window.__navMeta = {
            pageTitle: b.dataset.pageTitle || '',
            pageCrumb: b.dataset.pageCrumb || '',
            activeKey: b.dataset.navActive || ''
        };
    }

    const { pageTitle, pageCrumb, activeKey } = window.__navMeta;
if (activeKey) {
    const activeLi = document.querySelector(
        `#mobile-sidenav li[data-nav="${activeKey}"]`
    );

    if (activeLi) {
        activeLi.classList.add('active');

        // If Create Job or Manage Jobs is active,
        // automatically open the Jobs dropdown.
        const parentMenu = activeLi.closest('.has-submenu');

        if (parentMenu) {
            parentMenu.classList.add('open');
            parentMenu.classList.add('parent-active');
        }
    }
}

// Jobs dropdown click
document.querySelectorAll('.nav-dropdown-toggle').forEach(toggle => {
    toggle.addEventListener('click', function (e) {
        e.preventDefault();

        const parent = this.closest('.has-submenu');

        if (parent) {
            parent.classList.toggle('open');
        }
    });
});

        // Page title / breadcrumb
        const titleEl = document.getElementById('nav-page-title');
        if (titleEl) titleEl.textContent = pageTitle;
        const crumbEl = document.getElementById('nav-page-crumb');
        if (crumbEl) crumbEl.textContent = pageCrumb;

        refresh();

        // Materialize widgets need to be (re)initialized on the injected markup
        if (window.M) {
            M.Sidenav.init(document.querySelectorAll('.sidenav'));
            M.Tooltip.init(document.querySelectorAll('.tooltipped'));
        }

        // Logout, from either sidenav or topbar
        ['nav-logout-btn', 'nav-logout-btn-top'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', function (e) { e.preventDefault(); Session.logout(); });
        });

        document.dispatchEvent(new CustomEvent('navbar:ready', { detail: { session } }));
    }

    if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNavbar);
} else {
    initNavbar();
}

    // Exposed so pages (e.g. profile.js after a save) can refresh the
    // navbar's name/avatar/completion % without reloading it from scratch.
    window.Navbar = { refresh };
})();