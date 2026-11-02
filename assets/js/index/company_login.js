/* ==========================================================================
   Company Login — validates the form, POSTs to /api/companies/login,
   and only redirects into the company portal if the account is both
   verified AND active. Session (token + company id/name/verification
   flags) is kept in localStorage so frontend/company/index.html and its
   sibling pages can read it via session.js (Session.getSession() /
   Session.requireSession()).

   NOTE: COMPANY_API_BASE now comes from assets/config.js — make sure
   config.js is included on the page BEFORE this file.

   NOTE: the backend returns isVerified / isActive booleans on the company
   object — NOT a single "status" string. Both checks below reflect that.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', function () {
    const btn = document.getElementById('companyLoginBtn');
    if (!btn) return;

    btn.addEventListener('click', async function () {
        clearCompanyLoginErrors();

        const email = document.getElementById('co_email').value.trim();
        const password = document.getElementById('co_pass').value;

        if (!validateCompanyLoginFields(email, password)) return;

        btn.disabled = true;
        const originalLabel = btn.textContent;
        btn.textContent = 'Logging in…';

        try {
            const res = await fetch(`${COMPANY_API_BASE}/login`, {
    method: 'POST',
    credentials: 'include',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, password })
});

            if (!res.ok) {
                await handleLoginError(res);
                return;
            }

            const data = await res.json();
            // Expected shape (adjust field names to match your actual
            // AuthResponse / CompanyLoginResponse DTO):
            // { token: "...", company: { id, name, isVerified, isActive, email, ... } }
            // or a flat { token, id, name, isVerified, isActive, ... }
            const company = data.company || data;
            const token = data.token || data.jwt || null;

            if (!company || typeof company.isVerified === 'undefined') {
                showToastSafe('Unexpected response from server.', 'error');
                return;
            }

            if (!company.isVerified) {
                showToastSafe('Your company is not verified yet. Please wait for admin approval before logging in.', 'error');
                return;
            }

            if (!company.isActive) {
                showToastSafe('Your company account has been deactivated. Contact the placement cell for details.', 'error');
                return;
            }

            // --- Persist session for the company portal ---
            if (token) localStorage.setItem('vertex_company_token', token);
            localStorage.setItem('vertex_company_id', company.id || company._id || '');
            localStorage.setItem('vertex_company_name', company.name || '');
            localStorage.setItem('vertex_company_email', company.email || email);
            localStorage.setItem('vertex_company_verified', String(!!company.isVerified));
            localStorage.setItem('vertex_company_active', String(!!company.isActive));

            // --- Cache the full record so profile.html / the sidenav can
            //     compute "% profile complete" without another round trip ---
            if (window.Session) {
                Session.setCachedProfile(company);
            } else {
                localStorage.setItem('vertex_company_profile', JSON.stringify(company));
            }

            showToastSafe('Login successful!', 'success');

            window.location.href = '../../company/index.html';

        } catch (err) {
            console.error('Company login error:', err);
            showToastSafe('Could not reach the server. Please try again.', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = originalLabel;
        }
    });
});

async function handleLoginError(res) {
    const body = await safeJson(res);

    if (body && body.message) {
        showToastSafe(body.message, 'error');
        return;
    }

    if (res.status === 401) {
        showToastSafe('Incorrect email or password.', 'error');
        return;
    }

    showToastSafe(`Login failed (${res.status}).`, 'error');
}

function validateCompanyLoginFields(email, password) {
    let isValid = true;

    if (!email) {
        setError('co_email', 'This field is required.');
        isValid = false;
    } else if (!/^\S+@\S+\.\S+$/.test(email)) {
        setError('co_email', 'Enter a valid email address.');
        isValid = false;
    }

    if (!password) {
        setError('co_pass', 'This field is required.');
        isValid = false;
    }

    return isValid;
}

function setError(fieldId, message) {
    const el = document.getElementById('err_' + fieldId);
    if (el) el.textContent = message;
}

function clearCompanyLoginErrors() {
    document.querySelectorAll('#companyLoginForm .error-msg').forEach(el => el.textContent = '');
}

async function safeJson(res) {
    try { return await res.json(); } catch { return null; }
}

function showToastSafe(message, kind) {
    if (typeof showToast === 'function') showToast(message, kind);
    else if (window.M && M.toast) M.toast({ html: message, classes: kind === 'error' ? 'red' : 'teal' });
    else alert(message);
}