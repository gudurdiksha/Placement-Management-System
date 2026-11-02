/* ==========================================================================
   Company Signup — validates the form, then POSTs to /api/companies/register
   to persist the company in MongoDB via CompanyService.registerCompany().

   NOTE: COMPANY_API_BASE now comes from assets/config.js — make sure
   config.js is included on the page BEFORE this file.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', function () {
    const btn = document.getElementById('companySignupBtn');
    if (!btn) return;

    btn.addEventListener('click', async function () {
        clearCompanySignupErrors();

        // Keys match CompanyRegisterRequest exactly.
        const payload = {
            name: document.getElementById('co_name').value.trim(),
            location: document.getElementById('co_location').value.trim(),
            email: document.getElementById('co_email2').value.trim(),
            password: document.getElementById('co_pass2').value,
            website: document.getElementById('co_website').value.trim(),
            contactNumber: document.getElementById('co_phone').value.trim(),
            contactPersonName: document.getElementById('co_contact').value.trim(),
            industryType: document.getElementById('co_industry').value,
            registrationNumber: document.getElementById('co_cin').value.trim(),
            // Not collected at signup — company fills these in later from
            // the Profile page: branch, contactPersonDesignation, companyType,
            // foundedYear, description, employeeCount, linkedinUrl
        };
        const confirmPassword = document.getElementById('co_pass3').value;

        if (!validateCompanySignup(payload, confirmPassword)) return;

        btn.disabled = true;
        const originalLabel = btn.textContent;
        btn.textContent = 'Signing up…';

        try {
            const res = await fetch(`${COMPANY_API_BASE}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                await handleRegisterError(res);
                return;
            }

            const company = await res.json();
            showToastSafe('Company registered successfully. Awaiting verification.', 'success');
            document.getElementById('companySignupForm').reset();

            const modalEl = document.getElementById('companyModal');
            if (modalEl && window.M) M.Modal.getInstance(modalEl).close();

        } catch (err) {
            console.error('Company signup error:', err);
            showToastSafe('Could not reach the server. Please try again.', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = originalLabel;
        }
    });
});

async function handleRegisterError(res) {
    const body = await safeJson(res);

    if (body && body.message && !body.errors) {
        showToastSafe(body.message, 'error');
        return;
    }

    const fieldErrors = body?.errors || body?.fieldErrors;
    if (fieldErrors) {
        const fieldToInputId = {
            name: 'co_name', location: 'co_location', email: 'co_email2',
            password: 'co_pass2', contactNumber: 'co_phone',
            contactPersonName: 'co_contact', registrationNumber: 'co_cin',
            industryType: 'co_industry',
        };
        Object.entries(fieldErrors).forEach(([field, msg]) => {
            const inputId = fieldToInputId[field];
            if (inputId) setError(inputId, Array.isArray(msg) ? msg[0] : msg);
        });
        showToastSafe('Please fix the highlighted fields.', 'error');
        return;
    }

    showToastSafe(`Registration failed (${res.status}).`, 'error');
}

function validateCompanySignup(payload, confirmPassword) {
    let isValid = true;

    const required = {
        co_name: payload.name,
        co_location: payload.location,
        co_contact: payload.contactPersonName,
        co_phone: payload.contactNumber,
        co_email2: payload.email,
        co_website: payload.website,
        co_cin: payload.registrationNumber,
        co_industry: payload.industryType,
        co_pass2: payload.password,
    };

    for (const [id, value] of Object.entries(required)) {
        if (!value) {
            setError(id, 'This field is required.');
            isValid = false;
        }
    }

    if (payload.email && !/^\S+@\S+\.\S+$/.test(payload.email)) {
        setError('co_email2', 'Enter a valid email address.');
        isValid = false;
    }

    if (payload.contactNumber && !/^[+]?[0-9]{10,13}$/.test(payload.contactNumber)) {
        setError('co_phone', 'Enter a valid contact number (10–13 digits).');
        isValid = false;
    }

    if (payload.password && payload.password.length < 8) {
        setError('co_pass2', 'Password must be at least 8 characters.');
        isValid = false;
    }

    if (payload.password !== confirmPassword) {
        setError('co_pass3', 'Passwords do not match.');
        isValid = false;
    }

    return isValid;
}

function setError(fieldId, message) {
    const el = document.getElementById('err_' + fieldId);
    if (el) el.textContent = message;
}

function clearCompanySignupErrors() {
    document.querySelectorAll('#companySignupForm .error-msg').forEach(el => el.textContent = '');
}

async function safeJson(res) {
    try { return await res.json(); } catch { return null; }
}

function showToastSafe(message, kind) {
    if (typeof showToast === 'function') showToast(message, kind);
    else if (window.M && M.toast) M.toast({ html: message, classes: kind === 'error' ? 'red' : 'teal' });
    else alert(message);
}