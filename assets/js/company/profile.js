/* ==========================================================================
   profile.js — powers profile.html.
   Reads/writes the fields in Session.ALL_PROFILE_FIELDS, keeps the
   completion progress bar + Pending/Complete pill in sync as the user
   types, validates fields with inline red error messages, and persists
   changes via PUT /api/companies/{id}.
   ========================================================================== */

document.addEventListener('navbar:ready', async function (e) {
    const session = e.detail.session;

    const FIELD_IDS = Session.ALL_PROFILE_FIELDS; // e.g. 'name', 'branch', ...

    function fieldEl(field) {
        return document.getElementById('pf_' + field);
    }

    /* ---------------------------------------------------------------------
       VALIDATION
       --------------------------------------------------------------------- */

    // Rules: each returns an error string, or '' / null if valid.
    // "required: true" fields must be non-empty; others are optional but
    // still validated for format if the user has typed something.
    const VALIDATORS = {
        name: { required: true, fn: v => v.length < 2 ? 'Company name is too short.' : '' },
        email: {
            required: true,
            fn: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? '' : 'Enter a valid email address.'
        },
        contactPersonName: { required: true, fn: v => v.length < 2 ? 'Enter the contact person\'s name.' : '' },
        contactNumber: {
            required: true,
            fn: v => /^[0-9+\-\s()]{7,15}$/.test(v) ? '' : 'Enter a valid contact number (7–15 digits).'
        },
        location: { required: true, fn: () => '' },
        website: {
            required: false,
            fn: v => /^(https?:\/\/)?([\w-]+\.)+[\w-]{2,}(\/\S*)?$/.test(v) ? '' : 'Enter a valid website URL.'
        },
        registrationNumber: {
            required: false,
            fn: v => /^[A-Za-z0-9]{5,25}$/.test(v) ? '' : 'Enter a valid registration number (CIN).'
        },
        industryType: { required: true, fn: () => '' },
        branch: { required: false, fn: () => '' },
        contactPersonDesignation: { required: false, fn: () => '' },
        companyType: { required: true, fn: () => '' },
        foundedYear: {
            required: false,
            fn: v => {
                const n = Number(v);
                if (!Number.isInteger(n)) return 'Enter a valid year.';
                if (n < 1800 || n > 2026) return 'Founded year must be between 1800 and 2026.';
                return '';
            }
        },
        employeeCount: {
            required: false,
            fn: v => {
                const n = Number(v);
                if (!Number.isInteger(n) || n < 1) return 'Enter a valid employee count.';
                return '';
            }
        },
        linkedinUrl: {
            required: false,
            fn: v => /^(https?:\/\/)?(www\.)?linkedin\.com\/\S+$/i.test(v) ? '' : 'Enter a valid LinkedIn URL.'
        },
        description: {
            required: false,
            fn: v => v.length > 0 && v.length < 20 ? 'Description should be at least 20 characters.' : ''
        }
    };

    function validateField(field, value) {
        const rule = VALIDATORS[field];
        if (!rule) return ''; // no rule defined -> always valid

        const trimmed = (value || '').trim();

        if (!trimmed) {
            return rule.required ? 'This field is required.' : '';
        }
        return rule.fn(trimmed) || '';
    }

   function getErrorEl(field) {
    const input = fieldEl(field);
    if (!input) return null;
    // New Bootstrap markup uses .field wrapper
    const wrapper = input.closest('.field') || input.closest('.input-field') || input.parentElement;
    let errEl = wrapper.querySelector('.field-error-msg');
    if (!errEl) {
        errEl = document.createElement('span');
        errEl.className = 'field-error-msg';
        wrapper.appendChild(errEl);
    }
    return errEl;
}

    function showFieldError(field, message) {
    const input = fieldEl(field);
    const errEl = getErrorEl(field);
    if (input) {
        input.classList.add('invalid');     // <-- matches new CSS
        input.classList.remove('valid');
    }
    if (errEl) errEl.textContent = message;
}

function clearFieldError(field) {
    const input = fieldEl(field);
    const errEl = getErrorEl(field);
    if (input) {
        input.classList.remove('invalid');
    }
    if (errEl) errEl.textContent = '';
}

    function validateAndShow(field) {
        const el = fieldEl(field);
        const value = el ? el.value : '';
        const error = validateField(field, value);
        if (error) {
            showFieldError(field, error);
        } else {
            clearFieldError(field);
        }
        return !error;
    }

    // Validates every field, shows/clears messages, returns true if all valid.
    function validateAll() {
        let allValid = true;
        let firstInvalidEl = null;
        FIELD_IDS.forEach(f => {
            const ok = validateAndShow(f);
            if (!ok) {
                allValid = false;
                if (!firstInvalidEl) firstInvalidEl = fieldEl(f);
            }
        });
        if (firstInvalidEl) {
            firstInvalidEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            firstInvalidEl.focus();
        }
        return allValid;
    }
    async function fetchProfile() {
    setSaveStatus('', '');
    try {
        const res = await fetch(`${PROFILE_API}/profile`, {
            credentials: 'include',
            cache: 'no-store'
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const student = await res.json();
        ORIGINAL_PROFILE = student;
        populateForm(student);
        updateSummary(student);
        updateCompletion(student);

        // Keep the topbar chip (name/photo) in sync the moment we have
        // fresh data — mirrors Navbar.refresh() on the company side, so a
        // name change or new photo shows up immediately, no page reload.
        if (window.StudentTopbar) window.StudentTopbar.refresh(student);

        return true;
    } catch (err) {
        console.error('Profile fetch error:', err);
        setSaveStatus('Could not load your profile. Try refreshing the page.', 'err');
        return false;
    }
}
    /* ---------------------------------------------------------------------
       FORM VALUES / PROGRESS UI
       --------------------------------------------------------------------- */

    function getFormValues() {
        const values = {};
        FIELD_IDS.forEach(f => {
            const el = fieldEl(f);
            values[f] = el ? el.value.trim() : '';
        });
        return values;
    }

    function setFormValues(profile) {
    FIELD_IDS.forEach(f => {
        const el = fieldEl(f);
        if (el && profile[f] !== undefined && profile[f] !== null) el.value = profile[f];
    });
    if (window.M) {
        M.updateTextFields();
        M.FormSelect.init(document.querySelectorAll('select'));
        const companyTypeEl = document.getElementById('pf_companyType');
        if (companyTypeEl && companyTypeEl.value) M.FormSelect.init(companyTypeEl);
    }
}

    function refreshProgressUI(values) {
        const result = Session.computeCompletion(values);
        document.getElementById('profile-progress-fill').style.width = result.percent + '%';
        document.getElementById('profile-progress-percent').textContent = result.percent + '%';
        document.getElementById('profile-progress-label').textContent =
            `${result.filledCount} of ${result.totalCount} fields complete`;

        const pill = document.getElementById('profile-status-pill');
        const note = document.getElementById('profile-status-note');
        if (result.isComplete) {
            pill.textContent = 'Profile Complete';
            pill.className = 'pill pill-ok';
            note.innerHTML = '<i class="material-icons" style="font-size:18px;color:var(--ok,#2e7d32);">check_circle</i>' +
                '<span>Nice — your profile is fully filled out.</span>';
        } else {
            pill.textContent = 'Profile Pending';
            pill.className = 'pill pill-warn';
            note.innerHTML = '<i class="material-icons" style="font-size:18px;color:#0C6A70;">info</i>' +
                '<span>Fill in the Company Details section below to complete your profile.</span>';
        }
        return result;
    }

    let profile = Object.assign(
        {
            name: session.name,
            email: session.email
        },
        Session.getCachedProfile()
    );

    try {
        const res = await fetch(`${COMPANY_API_BASE}/profile`, {
            method: 'GET',
            credentials: 'include'
        });

        if (!res.ok) {
            throw new Error(`Profile fetch failed (${res.status})`);
        }

        const remote = await res.json();
        profile = Object.assign({}, profile, remote);
        Session.setCachedProfile(profile);

    } catch (err) {
        console.warn('Could not fetch profile from server, using cached copy.', err);
    }

    setFormValues(profile);
    refreshProgressUI(profile);

    // --- live recompute + live validation as the user types ---
    FIELD_IDS.forEach(f => {
        const el = fieldEl(f);
        if (el) {
            el.addEventListener('input', () => {
                refreshProgressUI(getFormValues());
                validateAndShow(f); // live inline validation
            });
            el.addEventListener('blur', () => validateAndShow(f));
        }
    });
    const companyTypeEl = document.getElementById('pf_companyType');
    if (companyTypeEl) {
        companyTypeEl.addEventListener('change', () => {
            refreshProgressUI(getFormValues());
            validateAndShow('companyType');
        });
    }

    // --- save ---
    const saveBtn = document.getElementById('profileSaveBtn');
    saveBtn.addEventListener('click', async function () {
        const values = getFormValues();
        const result = refreshProgressUI(values);

        // Block save if validation fails
        if (!validateAll()) {
            showToastSafe('Please fix the highlighted fields before saving.', 'error');
            return;
        }

        saveBtn.disabled = true;
        const originalLabel = saveBtn.innerHTML;
        saveBtn.innerHTML = 'Saving…';

        try {
            const res = await fetch(`${COMPANY_API_BASE}/profile`, {
                method: 'PUT',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(values)
            });

            if (!res.ok) throw new Error(`Save failed (${res.status})`);

            const saved = await res.json().catch(() => values);
            Session.setCachedProfile(Object.assign({}, values, saved));

            if (values.name) localStorage.setItem('vertex_company_name', values.name);
            if (values.email) localStorage.setItem('vertex_company_email', values.email);

            showToastSafe(
                result.isComplete ? 'Profile saved — your profile is complete!' : 'Profile saved.',
                'success'
            );
            Navbar.refresh();
        } catch (err) {
            Session.setCachedProfile(values);
            showToastSafe('Could not reach the server — your changes were saved locally only.', 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalLabel;
        }
    });
});

function showToastSafe(message, kind) {
    if (window.M && M.toast) {
        M.toast({ html: message, classes: kind === 'error' ? 'red' : 'teal' });
    } else {
        alert(message);
    }
}