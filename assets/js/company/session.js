/* ==========================================================================
   session.js — single source of truth for "who is logged in" and how far
   along their profile is. No markup here; assets/navbar.js owns the actual
   navbar UI and reads from this module.

   Include order on every page:
     <script src="assets/config.js"></script>
     <script src="assets/session.js"></script>
     <script src="assets/navbar.js"></script>

   NOTE: the backend's company record uses two independent booleans —
   isVerified and isActive — not a single "status" string. This module
   stores/reads both directly (see company_login.js, which writes them).
   ========================================================================== */

const Session = (function () {

    // Where to send people who aren't logged in. These pages live one level
    // under /frontend/company/, so the login page is one level up.
    const LOGIN_URL = '../index.html';

    // "core" = collected at signup, present the moment a company logs in.
    // "extra" = filled in later, from the Profile page.
    const PROFILE_FIELDS = {
        core: ['name', 'location', 'contactPersonName', 'contactNumber', 'email', 'website', 'registrationNumber', 'industryType'],
        extra: ['branch', 'contactPersonDesignation', 'companyType', 'foundedYear', 'description', 'employeeCount', 'linkedinUrl'],
    };
    const ALL_PROFILE_FIELDS = [...PROFILE_FIELDS.core, ...PROFILE_FIELDS.extra];

    function getSession() {
        const id = localStorage.getItem('vertex_company_id');
        if (!id) return null;
        return {
            id,
            token: localStorage.getItem('vertex_company_token') || null,
            name: localStorage.getItem('vertex_company_name') || 'Company',
            email: localStorage.getItem('vertex_company_email') || '',
            isVerified: localStorage.getItem('vertex_company_verified') === 'true',
            isActive: localStorage.getItem('vertex_company_active') === 'true',
        };
    }

    function requireSession() {
        const session = getSession();
        if (!session) {
            window.location.href = LOGIN_URL;
            return null;
        }
        return session;
    }

    function logout() {
        ['vertex_company_token', 'vertex_company_id', 'vertex_company_name',
            'vertex_company_email', 'vertex_company_verified', 'vertex_company_active',
            'vertex_company_profile']
            .forEach(k => localStorage.removeItem(k));
        window.location.href = LOGIN_URL;
    }

    function getCachedProfile() {
        try {
            const raw = localStorage.getItem('vertex_company_profile');
            return raw ? JSON.parse(raw) : {};
        } catch {
            return {};
        }
    }

    function setCachedProfile(profile) {
        localStorage.setItem('vertex_company_profile', JSON.stringify(profile || {}));
    }

    function computeCompletion(profile) {
        const data = profile || getCachedProfile();
        const filled = ALL_PROFILE_FIELDS.filter(f => {
            const v = data[f];
            return v !== undefined && v !== null && String(v).trim() !== '';
        });
        const percent = Math.round((filled.length / ALL_PROFILE_FIELDS.length) * 100);
        return {
            percent,
            filledCount: filled.length,
            totalCount: ALL_PROFILE_FIELDS.length,
            isComplete: filled.length === ALL_PROFILE_FIELDS.length,
        };
    }

    return {
        PROFILE_FIELDS,
        ALL_PROFILE_FIELDS,
        LOGIN_URL,
        getSession,
        requireSession,
        logout,
        getCachedProfile,
        setCachedProfile,
        computeCompletion,
    };
})();