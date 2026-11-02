/* ==========================================================================
   Shared config — include this BEFORE session.js / company_login.js /
   company_signup.js on every page. If you already define COMPANY_API_BASE
   somewhere else, delete one of the two to avoid a duplicate-const error.
   ========================================================================== */
 const API_BASE = "http://127.0.0.1:8080"; 

const COMPANY_API_BASE =
    "http://127.0.0.1:8080/api/companies";

const STUDENT_API_BASE =
    "http://127.0.0.1:8080/api/students";