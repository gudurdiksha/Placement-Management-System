
// =========================
// Profile Photo Validation
// =========================

function isValidProfilePhoto(file) {

    if (!file) {
        return {
            valid: false,
            message: 'Profile photo is required'
        };
    }

    const allowedTypes = [
        'image/jpeg',
        'image/png',
        'image/webp'
    ];

    if (!allowedTypes.includes(file.type)) {
        return {
            valid: false,
            message: 'Only JPG, PNG or WEBP images are allowed'
        };
    }

    const maxSize = 2 * 1024 * 1024;

    if (file.size > maxSize) {
        return {
            valid: false,
            message: 'Profile photo must be smaller than 2 MB'
        };
    }

    return {
        valid: true,
        message: ''
    };
}



// =========================
// Profile Photo Preview
// =========================


document.addEventListener('change', function (e) {

    if (e.target.id !== 'st_profilePhoto') {
        return;
    }

    const input = e.target;
    const file = input.files && input.files[0];

    const result = isValidProfilePhoto(file);

    if (!result.valid) {

        setFieldError(
            'st_profilePhoto',
            result.message
        );

        input.value = '';

        const preview = document.getElementById(
            'profilePhotoPreview'
        );

        if (preview) {
            preview.style.display = 'none';
        }

        return;
    }

    // Valid file
    setFieldError('st_profilePhoto', '');

    const preview = document.getElementById(
        'profilePhotoPreview'
    );

    const previewImg = document.getElementById(
        'profilePhotoPreviewImg'
    );

    if (preview && previewImg) {

        const reader = new FileReader();

        reader.onload = function (event) {

            previewImg.src = event.target.result;

            preview.style.display = 'block';
        };

        reader.readAsDataURL(file);
    }
});


function validateStudentSignup() {


    let ok = true;

    const name = getVal('st_name');
    const roll = getVal('st_roll2');
    const branch = getVal('st_branch');
    const phone = getVal('st_phone');
    const email = getVal('st_email');
    const pass = getVal('st_pass2');

    const profilePhotoInput =
        document.getElementById('st_profilePhoto');

    const profilePhoto =
        profilePhotoInput &&
        profilePhotoInput.files
            ? profilePhotoInput.files[0]
            : null;


    // =========================
    // Full Name
    // =========================

    const nameValid =
        name !== '' &&
        /^[A-Za-z]+(?:[ '-][A-Za-z]+)*$/.test(name) &&
        name.length >= 3 &&
        name.length <= 100;

    ok = setFieldError(
        'st_name',
        name === ''
            ? 'Full name is required'
            : !nameValid
                ? 'Enter a valid name'
                : ''
    ) && ok;


    // =========================
    // Roll Number
    // =========================

    ok = setFieldError(
        'st_roll2',
        roll === ''
            ? 'Roll number is required'
            : !isValidRoll(roll)
                ? 'Roll number must be alphanumeric'
                : ''
    ) && ok;


    // =========================
    // Branch
    // =========================

    ok = setFieldError(
        'st_branch',
        branch === ''
            ? 'Please choose a branch'
            : ''
    ) && ok;


    // =========================
    // Phone
    // =========================

    ok = setFieldError(
        'st_phone',
        phone === ''
            ? 'Phone number is required'
            : !isValidPhone(phone)
                ? 'Enter a valid 10-digit phone number'
                : ''
    ) && ok;


    // =========================
    // Email
    // =========================

    ok = setFieldError(
        'st_email',
        email === ''
            ? 'Email is required'
            : !isValidEmail(email)
                ? 'Enter a valid email address'
                : ''
    ) && ok;


    // =========================
    // Password
    // =========================

    ok = setFieldError(
        'st_pass2',
        pass === ''
            ? 'Password is required'
            : pass.length < 8
                ? 'Password must be at least 8 characters'
                : ''
    ) && ok;


    // =========================
    // Profile Photo
    // =========================

    const photoResult =
        isValidProfilePhoto(profilePhoto);

    ok = setFieldError(
        'st_profilePhoto',
        photoResult.message
    ) && ok;


    // =========================
    // Scroll to first error
    // =========================

    if (!ok) {

        const firstInvalid =
            document.querySelector(
                '#studentModal .invalid'
            );

        if (firstInvalid) {

            firstInvalid.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });

            // Focus normal inputs
            if (firstInvalid.type !== 'file') {
                firstInvalid.focus();
            }
        }
    }

    return ok;
}
function showError(id,message){

    const err=document.getElementById(id);

    err.textContent=message;
    err.classList.add("show");
}

function clearError(id){

    const err=document.getElementById(id);

    err.textContent="";
    err.classList.remove("show");
}

window.togglePassword = function (inputId, el) {
    const input = document.getElementById(inputId);
    if (!input) return;

    // 'el' may be the <i> itself OR a wrapping <button>
    const icon = el.tagName === 'I' ? el : el.querySelector('i');
    if (!icon) return;

    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    icon.textContent = isHidden ? 'visibility' : 'visibility_off';
    el.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
};



