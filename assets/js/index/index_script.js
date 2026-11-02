//const COMPANY_API_BASE = 'http://localhost:8080/api/companies';
document.addEventListener('DOMContentLoaded', function () {

    // ---------- Re-parent every modal to <body> ----------
    // Guards against markup bugs where one modal ends up nested inside
    // another (missing closing tag etc.) — nesting breaks stacking
    // context and traps click events on the inner modal's buttons.
    document.querySelectorAll('.modal').forEach(function (modalEl) {
        if (modalEl.parentElement !== document.body) {
            document.body.appendChild(modalEl);
        }
    });

    M.Sidenav.init(document.querySelectorAll('.sidenav'));
    M.Modal.init(document.querySelectorAll('.modal'));
    M.Tabs.init(document.querySelectorAll('.tabs'), {
        onShow: function () {
            M.updateTextFields();
        }
    });
    M.FormSelect.init(document.querySelectorAll('select'));
    M.updateTextFields();

    // ---------- HARD RESET + explicit open (don't rely on Materialize's own delegation) ----------
document.addEventListener('click', function (e) {
    const trigger = e.target.closest('.modal-trigger');
    if (!trigger) return;

    // Stop the browser's default "#adminModal" anchor jump — this is what
    // was breaking the admin login button.
    e.preventDefault();

    // Force-close any modal that's stuck open.
    document.querySelectorAll('.modal.open').forEach(function (m) {
        const inst = M.Modal.getInstance(m);
        if (inst) {
            inst.close();
        } else {
            m.classList.remove('open');
            m.style.display = 'none';
        }
    });
    document.querySelectorAll('.modal-overlay').forEach(function (o) {
        o.remove();
    });
    document.body.classList.remove('modal-open');

    // Now explicitly open the modal this trigger points to.
    const href = trigger.getAttribute('href') || '';
    const modalId = trigger.dataset.target || href.replace('#', '');
    const modalEl = document.getElementById(modalId);
    if (!modalEl) return;

    let instance = M.Modal.getInstance(modalEl);
    if (!instance) {
        instance = M.Modal.init(modalEl); // lazily init if it wasn't picked up initially
    }
    instance.open(trigger);
}, true);
    // ---------- Generic password show/hide toggle ----------
    document.querySelectorAll('.toggle-pass').forEach(function (icon) {
        icon.addEventListener('click', function () {
            const input = document.getElementById(icon.dataset.target);
            if (!input) return;
            if (input.type === 'password') {
                input.type = 'text';
                icon.textContent = 'visibility';
            } else {
                input.type = 'password';
                icon.textContent = 'visibility_off';
            }
        });
    });

    document.getElementById('adminLoginBtn').addEventListener('click', function () {

        if (!validateAdminLogin()) {
            return;
        }

        alert('Admin Login Successful!');

        window.location.href = "admin/admin-dashboard.html";
    });

    //bindForm('companyLoginBtn', validateCompanyLogin, 'companyModal', 'company-dashboard.html', 'Login Successful!');
   //bindForm('companySignupBtn', validateCompanySignup, 'companyModal', 'company-dashboard.html', 'Registration Successful!');
    bindForm('studentLoginBtn', validateStudentLogin, 'studentModal', 'student-dashboard.html', 'Login Successful!');
    bindForm('studentSignupBtn', validateStudentSignup, 'studentModal', 'student-dashboard.html', 'Registration Successful!');

});

function bindForm(btnId, validateFn, modalId, redirectUrl, successMessage) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener('click', function () {
        if (validateFn()) {
            const modalEl = document.getElementById(modalId);
            showSuccessAndRedirect(modalEl, successMessage, redirectUrl);
        }
    });
}

// Hides the tabs/forms inside the modal and shows a success message,
// then redirects to the relevant dashboard page.
function showSuccessAndRedirect(modalEl, message, redirectUrl) {
    modalEl.querySelectorAll('.tabs, .modal-content, .modal-footer').forEach(function (el) {
        el.style.display = 'none';
    });

    let box = modalEl.querySelector('.success-box');
    if (!box) {
        box = document.createElement('div');
        box.className = 'success-box';
        modalEl.appendChild(box);
    }
    box.innerHTML =
        '<i class="material-icons success-icon">check_circle</i>' +
        '<p class="success-text">' + message + '</p>' +
        '<p class="redirect-note">Redirecting to your dashboard&hellip;</p>';
    box.style.display = 'flex';

    setTimeout(function () {
        window.location.href = redirectUrl;
    }, 1400);
}

// ========================= Shared validators =========================
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function isValidPhone(phone) {
    return /^[6-9]\d{9}$/.test(phone); // exactly 10 digits, Indian mobile pattern
}
function isValidRoll(roll) {
    return /^[A-Za-z0-9]+$/.test(roll);
}

function getVal(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
}

// Sets/clears the error message + invalid/valid styling for one field.
// Returns true if the field is valid, false otherwise.
// function setFieldError(inputId, message) {
//     const input = document.getElementById(inputId);
//     const errorEl = document.getElementById('err_' + inputId);

//     if (message) {
//         if (errorEl) errorEl.textContent = message;
//         if (input) { input.classList.add('invalid'); input.classList.remove('valid'); }
//         return false;
//     }
//     if (errorEl) errorEl.textContent = '';
//     if (input) { input.classList.remove('invalid'); input.classList.add('valid'); }
//     return true;
// }
function setFieldError(inputId, message) {

    const input = document.getElementById(inputId);

    if (!input) {
        console.warn('Input not found:', inputId);
        return false;
    }

    let errorEl = document.getElementById('err_' + inputId);

    // Create error element automatically if missing
    if (!errorEl) {
        errorEl = document.createElement('div');
        errorEl.id = 'err_' + inputId;
        errorEl.className = 'field-error';

        // For file input, put error after its parent wrapper
        if (input.type === 'file') {
            const wrapper =
                input.closest('.file-field') ||
                input.parentElement;

            wrapper.insertAdjacentElement('afterend', errorEl);
        } else {
            input.insertAdjacentElement('afterend', errorEl);
        }
    }

    if (message) {

        errorEl.textContent = message;
        errorEl.style.display = 'block';

        input.classList.add('invalid');
        input.classList.remove('valid');

        // Special handling for file input
        if (input.type === 'file') {
            const fileField = input.closest('.file-field');

            if (fileField) {
                fileField.classList.add('file-error');
                fileField.classList.remove('file-valid');
            }
        }

        return false;
    }

    errorEl.textContent = '';
    errorEl.style.display = 'none';

    input.classList.remove('invalid');
    input.classList.add('valid');

    if (input.type === 'file') {
        const fileField = input.closest('.file-field');

        if (fileField) {
            fileField.classList.remove('file-error');
            fileField.classList.add('file-valid');
        }
    }

    return true;
}


// ========================= Form-specific validation =========================


function validateAdminLogin() {
    let ok = true;

    const id = getVal('admin_id');
    const pass = getVal('admin_pass');

    // Admin ID validation
    if (id === '') {
        setFieldError('admin_id', 'Admin ID is required');
        ok = false;
    } else {
        setFieldError('admin_id', '');
    }

    // Password validation
    if (pass === '') {
        setFieldError('admin_pass', 'Password is required');
        ok = false;
    } else if (pass.length < 6) {
        setFieldError(
            'admin_pass',
            'Password must be at least 6 characters'
        );
        ok = false;
    } else {
        setFieldError('admin_pass', '');
    }

    // Don't check credentials if basic validation failed
    if (!ok) {
        return false;
    }

    // Check admin credentials
    if (id !== 'admin' || pass !== 'admin123') {
        setFieldError('admin_id', 'Invalid Admin ID or Password');
        setFieldError('admin_pass', 'Invalid Admin ID or Password');
        return false;
    }

    // Correct credentials
    setFieldError('admin_id', '');
    setFieldError('admin_pass', '');

    return true;
}

function validateCompanyLogin() {
    let ok = true;
    const email = getVal('co_email');
    const pass = getVal('co_pass');

    ok = setFieldError('co_email',
        email === '' ? 'Email is required' :
            !isValidEmail(email) ? 'Enter a valid email address' : '') && ok;
    ok = setFieldError('co_pass',
        pass === '' ? 'Password is required' :
            pass.length < 6 ? 'Password must be at least 6 characters' : '') && ok;

    return ok;
}

// ---- New helper validators ----
function isValidUrl(url) {
    return /^(https?:\/\/)?([\w-]+\.)+[a-zA-Z]{2,}(\/[\w\-.~:/?#[\]@!$&'()*+,;=%]*)?$/.test(url);
}
function isValidCIN(cin) {
    // 21-char Indian CIN format: L/U + 5 digits + 2 letters + 4 digits + 3 letters + 6 digits
    return /^[LU][0-9]{5}[A-Za-z]{2}[0-9]{4}[A-Za-z]{3}[0-9]{6}$/.test(cin);
}

function validateCompanySignup() {
    let ok = true;
    const name = getVal('co_name');
    const contact = getVal('co_contact');
    const phone = getVal('co_phone');
    const email = getVal('co_email2');
    const website = getVal('co_website');
    const cin = getVal('co_cin');
    const industry = getVal('co_industry');
    const pass = getVal('co_pass2');
    const pass2 = getVal('co_pass3');

    ok = setFieldError('co_name', name === '' ? 'Company name is required' : '') && ok;
    ok = setFieldError('co_contact', contact === '' ? 'HR contact name is required' : '') && ok;
    ok = setFieldError('co_phone',
        phone === '' ? 'Phone number is required' :
            !isValidPhone(phone) ? 'Enter a valid 10-digit phone number' : '') && ok;
    ok = setFieldError('co_email2',
        email === '' ? 'Email is required' :
            !isValidEmail(email) ? 'Enter a valid email address' : '') && ok;
    ok = setFieldError('co_website',
        website === '' ? 'Company website is required' :
            !isValidUrl(website) ? 'Enter a valid website URL' : '') && ok;
    ok = setFieldError('co_cin',
        cin === '' ? 'CIN number is required' :
            !isValidCIN(cin) ? 'Enter a valid 21-character CIN' : '') && ok;
    ok = setFieldError('co_industry', industry === '' ? 'Please select an industry type' : '') && ok;
    ok = setFieldError('co_pass2',
        pass === '' ? 'Password is required' :
            pass.length < 6 ? 'Password must be at least 6 characters' : '') && ok;
    ok = setFieldError('co_pass3',
        pass2 === '' ? 'Please confirm your password' :
            pass2 !== pass ? 'Passwords do not match' : '') && ok;

    return ok;
}

// function validateStudentLogin() {
//     let ok = true;
//     const roll = getVal('st_roll');
//     const pass = getVal('st_pass');

//     ok = setFieldError('st_roll', roll === '' ? 'Roll number or email is required' : '') && ok;
//     ok = setFieldError('st_pass', pass === '' ? 'Password is required' : '') && ok;

//     return ok;
// }

