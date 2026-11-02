// HireDesk shared app script — loaded on every page
document.addEventListener('DOMContentLoaded', function () {

    // Init all Materialize sidenavs (mobile hamburger)
    var sidenavs = document.querySelectorAll('.sidenav');
    M.Sidenav.init(sidenavs, { edge: 'left' });

    // Init dropdowns
    var dropdowns = document.querySelectorAll('.dropdown-trigger');
    M.Dropdown.init(dropdowns, { coverTrigger: false, constrainWidth: false });

    // Init tooltips
    var tooltips = document.querySelectorAll('.tooltipped');
    M.Tooltip.init(tooltips);

    // Init selects
    var selects = document.querySelectorAll('select');
    M.FormSelect.init(selects);

    // Highlight active nav link based on current file name
    var current = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.side-link').forEach(function (link) {
        var href = link.getAttribute('href');
        var li = link.closest('li');
        if (href === current) {
            li.classList.add('active');
        } else {
            li.classList.remove('active');
        }
    });

});