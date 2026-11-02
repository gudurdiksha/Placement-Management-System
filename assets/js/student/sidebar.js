/* =====================================================================
   student-sidebar.js
   Sidebar/topbar markup now lives directly in each HTML page (no id
   lookup, no innerHTML injection). This file only wires up behavior:
   active-link highlighting, notification badge, toggle, chart, and
   smooth page transitions — selected by class, not id.
   ===================================================================== */


const STUDENT_API= 'http://127.0.0.1:8080/api/students'; // reuse if already defined in config.js — don't redeclare if so

// The full name has appeared under different keys in different places
// (student.fullName here vs student.name in my-profile.js) — this is a
// stopgap fallback chain until the real backend key is confirmed. Once
// confirmed, replace with a single direct property access in both files.
function resolveStudentName(s) {
    return s.fullName || s.name || s.studentName || s.full_name || '';
}

/* ---------------------------- Topbar profile (from backend) ---------------------------- */
// Guarded so that even if multiple pages/scripts call this, only one
// /profile fetch actually happens per page load (two concurrent calls
// were previously racing each other and producing flaky results).
let _cachedStudentProfile = null;

// Pure render step — no fetch. Used both by the initial topbar load and by
// any page (e.g. my-profile.js) that already has fresh profile data and
// just needs the topbar to reflect it immediately.
function renderTopbarProfile(student) {
    const nameEl = document.querySelector('.profile-chip-text strong');
    const metaEl = document.querySelector('.profile-chip-text span');
    const imgEl = document.querySelector('.profile-chip img');
    if (!nameEl || !imgEl || !student) return;

    nameEl.textContent = resolveStudentName(student) || 'Student';
    if (metaEl) metaEl.textContent = student.branch ? student.branch.replaceAll('_', ' ') : '';
    if (student.profilePhoto) {
        imgEl.src = `http://localhost:8080/uploads/student-photos/${student.profilePhoto}`;
    }
}

async function initTopbarProfile() {
    const nameEl = document.querySelector('.profile-chip-text strong');
    const imgEl = document.querySelector('.profile-chip img');
    if (!nameEl || !imgEl) return;

    if (_topbarProfileInFlight) return _topbarProfileInFlight;

    _topbarProfileInFlight = (async () => {
        try {
            const response = await fetch(`${STUDENT_API}/profile`, {
                method: 'GET',
                credentials: 'include',
                cache: 'no-store'
            });

            if (!response.ok) {
                window.location.href = '/index.html';
                return;
            }

            const student = await response.json();
            _cachedStudentProfile = student;
            renderTopbarProfile(student);
        } catch (err) {
            console.error('Failed to load profile:', err);
        } finally {
            _topbarProfileInFlight = null;
        }
    })();

    return _topbarProfileInFlight;
}

// Exposed so pages (e.g. my-profile.js after a save/resume upload) can
// refresh the topbar chip's name/photo instantly from data they already
// have, without triggering another network fetch.
window.StudentTopbar = {
    refresh: function (student) {
        if (student) _cachedStudentProfile = student;
        if (_cachedStudentProfile) renderTopbarProfile(_cachedStudentProfile);
    }
};
/* ---------------------------- Active link highlight ---------------------------- */
function highlightActiveLink() {
    const activePage = document.body.dataset.page || '';
    document.querySelectorAll('.sidebar-nav .nav-link').forEach(function (link) {
        link.classList.toggle('active', link.dataset.page === activePage);
    });
}

/* ---------------------------- Notification badge ---------------------------- */
function renderNotifBadge(count) {
    document.querySelectorAll('.notif-badge-nav, .notif-dot').forEach(function (el) {
        if (count > 0) {
            el.textContent = count;
            el.style.display = '';
        } else {
            el.style.display = 'none';
        }
    });
}

/* ---------------------------- Smooth page transition ---------------------------- */
function initPageTransitions() {
    document.querySelectorAll('a[href$=".html"]').forEach(function (link) {
        link.addEventListener('click', async function (e) {
            const href = link.getAttribute('href');
            if (link.target === '_blank' || e.metaKey || e.ctrlKey || !href) return;
            e.preventDefault();

            const main = document.querySelector('main.content');
            if (main) main.style.opacity = '0';

            try {
                // const res = await fetch(href);
                const res = await fetch(href, { cache: 'no-store' });
                const html = await res.text();
                const parser = new DOMParser();
                const newDoc = parser.parseFromString(html, 'text/html');
                const newMain = newDoc.querySelector('main.content');

                if (main && newMain) {
    await syncStylesheets(newDoc);
    syncInlineStyles(newDoc);

    main.innerHTML = newMain.innerHTML;
    document.title = newDoc.title;
    document.body.dataset.page = newDoc.body.dataset.page;
    highlightActiveLink();
    history.pushState({}, '', href);

    // Swapping innerHTML doesn't make the browser recompute scroll
    // height/overflow on its own — that's why a page could look
    // unscrollable right after a pjax nav but fine after a hard refresh.
    // Force a reflow, reset scroll position, and nudge anything listening
    // for resize (custom scrollbars, sticky containers, etc.) to recheck.
    window.scrollTo(0, 0);
    main.scrollTop = 0;
    void main.offsetHeight; // force reflow
    window.dispatchEvent(new Event('resize'));

    main.style.opacity = '1';

    // innerHTML does NOT execute <script> tags. Recreate them AND wait
    // for src-based scripts to actually finish loading before continuing,
    // otherwise pjax:pageLoaded fires before the page's own script has
    // registered its listener for it.
    const oldScripts = Array.from(main.querySelectorAll('script'));
    for (const oldScript of oldScripts) {
        await new Promise(resolve => {
            const newScript = document.createElement('script');
            Array.from(oldScript.attributes).forEach(attr =>
                newScript.setAttribute(attr.name, attr.value)
            );
            if (oldScript.src) {
                newScript.async = false;      // preserve execution order
                newScript.onload = resolve;
                newScript.onerror = resolve;  // don't hang nav if one 404s
                oldScript.replaceWith(newScript);
            } else {
                newScript.textContent = oldScript.textContent;
                oldScript.replaceWith(newScript); // inline scripts run synchronously on insert
                resolve();
            }
        });
    }

    document.dispatchEvent(new CustomEvent('pjax:pageLoaded', { detail: { page: newDoc.body.dataset.page } }));
} else {
                    window.location.href = href; // fallback
                }
            } catch (err) {
                window.location.href = href; // fallback on any failure
            }
        });
    });

    window.addEventListener('popstate', function () {
        location.reload(); // simplest safe fallback
    });
}

/* ---------------------------- Keep <head> stylesheets in sync across pjax navigations ---------------------------- */
function syncStylesheets(newDoc) {
    const newHrefs = new Set(
        Array.from(newDoc.querySelectorAll('link[rel="stylesheet"]'))
            .map(link => new URL(link.getAttribute('href'), href_base(newDoc)).href)
    );

    document.querySelectorAll('link[rel="stylesheet"]').forEach(function (link) {
        const href = new URL(link.href, window.location.href).href;
        if (!newHrefs.has(href)) link.remove();
    });

    const currentHrefs = new Set(
        Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
            .map(link => new URL(link.href, window.location.href).href)
    );

    const loadPromises = Array.from(newDoc.querySelectorAll('link[rel="stylesheet"]'))
        .filter(link => !currentHrefs.has(new URL(link.getAttribute('href'), href_base(newDoc)).href))
        .map(link => new Promise(resolve => {
            const clone = document.createElement('link');
            clone.rel = 'stylesheet';
            clone.href = link.getAttribute('href');
            clone.onload = resolve;
            clone.onerror = resolve;
            document.head.appendChild(clone);
        }));

    return Promise.all(loadPromises);
}

function href_base(doc) {
    // resolves relative hrefs the same way the browser would have for that document's own URL
    return doc.baseURI || window.location.href;
}

/* ---------------------------- Keep <head> inline <style> blocks in sync across pjax navigations ----------------------------
   syncStylesheets() above only handles <link rel="stylesheet">. Some pages
   (my-profile.html, for one) ship a page-specific inline <style id="...">
   block in <head> for layout fixes that only apply to that page. Because
   pjax only ever swaps main.content's innerHTML, those inline blocks were
   never making it into the document on a soft nav — only on a hard refresh,
   which parses <head> from scratch. That's why a page could look broken
   (e.g. no internal scrolling) right after clicking a nav link, but fine
   after F5.

   Every <style> block that should survive pjax nav needs a stable `id` so
   we can tell "already present" apart from "belongs to a different page."
   Style blocks with no id are skipped (nothing to key on) — give them one
   if they need to persist across pjax navigation.
   ------------------------------------------------------------------------- */
function syncInlineStyles(newDoc) {
    const newStyleIds = new Set(
        Array.from(newDoc.head.querySelectorAll('style[id]')).map(s => s.id)
    );

    // Remove inline styles that belong to pages we're navigating away from
    document.head.querySelectorAll('style[id]').forEach(function (styleEl) {
        if (!newStyleIds.has(styleEl.id)) styleEl.remove();
    });

    // Add any new ones we don't have yet
    newDoc.head.querySelectorAll('style[id]').forEach(function (styleEl) {
        if (document.getElementById(styleEl.id)) return;
        const clone = document.createElement('style');
        clone.id = styleEl.id;
        clone.textContent = styleEl.textContent;
        document.head.appendChild(clone);
    });
}

/* =====================================================================
   student-profile-store.js
   Single source of truth for "the current student's profile" across all
   student pages. Fetch once, cache it, and let any UI (topbar, sidebar
   ring, profile form, future pages) subscribe to updates instead of each
   doing its own /profile fetch and going stale independently.
   ===================================================================== */
(function () {
    const API = (typeof STUDENT_API_BASE !== 'undefined') ? STUDENT_API_BASE : 'http://127.0.0.1:8080/api/students';

    let cached = null;
    let inFlight = null;
    const subscribers = [];

    async function fetchFresh() {
        const res = await fetch(`${API}/profile`, { credentials: 'include', cache: 'no-store' });
        if (!res.ok) throw new Error(`status ${res.status}`);
        return res.json();
    }

    function notify() {
        subscribers.forEach(fn => { try { fn(cached); } catch (err) { console.error(err); } });
        document.dispatchEvent(new CustomEvent('studentProfile:updated', { detail: { student: cached } }));
    }

    window.StudentProfileStore = {
        // Get the cached copy, fetching once if nothing's cached yet.
        async get() {
            if (cached) return cached;
            if (!inFlight) inFlight = fetchFresh().then(s => { cached = s; inFlight = null; notify(); return s; });
            return inFlight;
        },
        // Force a real refetch (call after save / upload / anything that
        // changed data server-side) — every subscriber re-renders automatically.
        async refresh() {
            cached = await fetchFresh();
            notify();
            return cached;
        },
        // Push already-known data in without a network call (e.g. optimistic update).
        set(student) {
            cached = student;
            notify();
        },
        // Register a render function. Called immediately if data is already
        // cached, and again on every future refresh()/set().
        subscribe(fn) {
            subscribers.push(fn);
            if (cached) fn(cached);
        }
    };
})();

function renderTopbarProfile(student) {
    const nameEl = document.querySelector('.profile-chip-text strong');
    const metaEl = document.querySelector('.profile-chip-text span');
    const imgEl = document.querySelector('.profile-chip img');
    if (!nameEl || !imgEl || !student) return;

    nameEl.textContent = resolveStudentName(student) || 'Student';
    if (metaEl) metaEl.textContent = student.branch ? student.branch.replaceAll('_', ' ') : '';
    if (student.profilePhoto) imgEl.src = `http://localhost:8080/uploads/student-photos/${student.profilePhoto}`;
}

async function initTopbarProfile() {
    StudentProfileStore.subscribe(renderTopbarProfile);
    try {
        await StudentProfileStore.get();
    } catch (err) {
        console.error('Failed to load profile:', err);
        window.location.href = '/index.html';
    }
}