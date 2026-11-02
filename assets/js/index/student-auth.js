/* =====================================================================
   student-auth.js
   Wires up the Student Login/Signup modal to the backend.
   Depends on config.js being loaded first (STUDENT_API_BASE).
   ===================================================================== */
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        width: auto;
        max-width: 320px;
        height: auto;
        background: ${type === 'success' ? '#2e7d32' : '#333'};
        color: #fff;
        padding: 12px 20px;
        border-radius: 8px;
        font-size: 14px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        z-index: 99999;
        text-align: center;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}
document.addEventListener('DOMContentLoaded', function () {
    initPasswordToggles();
    initProfilePhotoPreview();
    initStudentLogin();
    initStudentSignup();
});

/* ---------------------------- Password show/hide ---------------------------- */
function initPasswordToggles() {
    document.querySelectorAll('.toggle-pass').forEach(function (icon) {
        icon.addEventListener('click', function () {
            const targetId = icon.getAttribute('data-target');
            const input = document.getElementById(targetId);
            if (!input) return;
            const isHidden = input.type === 'password';
            input.type = isHidden ? 'text' : 'password';
            icon.textContent = isHidden ? 'visibility' : 'visibility_off';
        });
    });
}

/* ---------------------------- Profile photo preview ---------------------------- */
function initProfilePhotoPreview() {
    const fileInput = document.getElementById('st_profilePhoto');
    const previewWrap = document.getElementById('profilePhotoPreview');
    const previewImg = document.getElementById('profilePhotoPreviewImg');
    if (!fileInput || !previewWrap || !previewImg) return;

    fileInput.addEventListener('change', function () {
        const file = fileInput.files && fileInput.files[0];
        clearError('err_st_profilePhoto');

        if (!file) {
            previewWrap.style.display = 'none';
            return;
        }

        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        const maxBytes = 2 * 1024 * 1024; // 2MB

        if (!allowedTypes.includes(file.type)) {
            showError('err_st_profilePhoto', 'Only JPG, PNG or WEBP files are allowed');
            fileInput.value = '';
            previewWrap.style.display = 'none';
            return;
        }
        if (file.size > maxBytes) {
            showError('err_st_profilePhoto', 'File must be under 2 MB');
            fileInput.value = '';
            previewWrap.style.display = 'none';
            return;
        }

        const reader = new FileReader();
        reader.onload = function (e) {
            previewImg.src = e.target.result;
            previewWrap.style.display = 'block';
        };
        reader.readAsDataURL(file);
    });
}

/* ---------------------------- Error helpers ---------------------------- */
function showError(id, message) {
    const el = document.getElementById(id);
    if (el) el.textContent = message;
}
function clearError(id) {
    const el = document.getElementById(id);
    if (el) el.textContent = '';
}
function clearErrors(ids) {
    ids.forEach(clearError);
}

/* ---------------------------- Login ---------------------------- */
function initStudentLogin() {
    const btn = document.getElementById('studentLoginBtn');
    if (!btn) return;

    btn.addEventListener('click', async function () {
        clearErrors(['err_st_roll', 'err_st_pass']);

        const email = document.getElementById('st_roll').value.trim();
        const password = document.getElementById('st_pass').value;

        let hasError = false;
        if (!email) {
            showError('err_st_roll', 'Enter your college email');
            hasError = true;
        }
        if (!password) {
            showError('err_st_pass', 'Enter your password');
            hasError = true;
        }
        if (hasError) return;

        btn.disabled = true;
        const originalText = btn.textContent;
        btn.textContent = 'Logging in...';

        try {
            const response = await fetch(`${STUDENT_API_BASE}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include', // needed so the session cookie set by the backend is stored
                body: JSON.stringify({ email, password })
            });

            if (!response.ok) {
                const errText = await response.text();
                showError('err_st_pass', errText || 'Invalid email or password');
                return;
            }

            if (typeof showToast === 'function') {
            showToast('Login successful', 'success');
             }
            window.location.href = '/student/student-dashboard.html';
        } catch (err) {
            console.error('Login error:', err);
            showError('err_st_pass', 'Could not reach the server. Please try again.');
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    });
}

/* ---------------------------- Signup ---------------------------- */
function initStudentSignup() {
    const btn = document.getElementById('studentSignupBtn');
    if (!btn) return;

    btn.addEventListener('click', async function () {
        const fieldIds = [
            'err_st_name', 'err_st_roll2', 'err_st_branch',
            'err_st_phone', 'err_st_email', 'err_st_profilePhoto', 'err_st_pass2'
        ];
        clearErrors(fieldIds);

        const name = document.getElementById('st_name').value.trim();
        const prnNo = document.getElementById('st_roll2').value.trim();
        const branch = document.getElementById('st_branch').value;
        const phone = document.getElementById('st_phone').value.trim();
        const email = document.getElementById('st_email').value.trim();
        const password = document.getElementById('st_pass2').value;
        const photoInput = document.getElementById('st_profilePhoto');
        const photoFile = photoInput.files && photoInput.files[0];

        let hasError = false;

        if (!name) { showError('err_st_name', 'Full name is required'); hasError = true; }
        if (!prnNo) { showError('err_st_roll2', 'Roll number is required'); hasError = true; }
        if (!branch) { showError('err_st_branch', 'Please choose a branch'); hasError = true; }
        if (!/^\d{10}$/.test(phone)) { showError('err_st_phone', 'Enter a valid 10-digit phone number'); hasError = true; }
        if (!/^\S+@\S+\.\S+$/.test(email)) { showError('err_st_email', 'Enter a valid email address'); hasError = true; }
        if (!photoFile) { showError('err_st_profilePhoto', 'Profile photo is required'); hasError = true; }
        if (!password || password.length < 6) { showError('err_st_pass2', 'Password must be at least 6 characters'); hasError = true; }

        if (hasError) return;

        
        // Matches the Student entity fields consumed by StudentService.registerStudent()
        const studentPayload = { name, prnNo, branch, phone, email, password };

        const formData = new FormData();
        formData.append('student', new Blob([JSON.stringify(studentPayload)], { type: 'application/json' }));
        formData.append('profilePhoto', photoFile);

        btn.disabled = true;
        const originalText = btn.textContent;
        btn.textContent = 'Signing up...';

        try {
            const response = await fetch(`${STUDENT_API_BASE}`, {
                method: 'POST',
                body: formData
                // Do NOT set Content-Type manually for FormData — the browser
                // sets the correct multipart boundary automatically.
            });

            if (!response.ok) {
                const errText = await response.text();
                if (/email/i.test(errText)) {
                    showError('err_st_email', errText);
                } else if (/prn/i.test(errText)) {
                    showError('err_st_roll2', errText);
                } else {
                    showError('err_st_pass2', errText || 'Registration failed. Please try again.');
                }
                return;
            }
            if (typeof showToast === 'function') {
                showToast('Account created! Please log in.', 'success');
            }

            // Switch to the Login tab inside the modal (Materialize tabs)
            const loginTabLink = document.querySelector('.tabs a[href="#studentLogin"]');
            if (loginTabLink) loginTabLink.click();
            document.getElementById('studentSignupForm').reset();
            document.getElementById('profilePhotoPreview').style.display = 'none';
        } catch (err) {
            console.error('Signup error:', err);
            showError('err_st_pass2', 'Could not reach the server. Please try again.');
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    });
}