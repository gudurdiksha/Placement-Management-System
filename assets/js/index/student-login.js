function validateStudentLogin() {
    let ok = true;
    const roll = getVal('st_roll');
    const pass = getVal('st_pass');

    ok = setFieldError('st_roll', roll === '' ? 'Roll number or email is required' : '') && ok;
    ok = setFieldError('st_pass', pass === '' ? 'Password is required' : '') && ok;

    return ok;
}