/* =====================================================================
   student-dashboard.js
   Single source of truth for the student sidebar across every student
   page. Edit NAV_ITEMS / CURRENT_USER here and every page picks it up —
   pages only need <aside class="sidebar" id="studentSidebar"></aside>
   and <body data-page="...">.
   ===================================================================== */


/* ---------------------------- Boot ---------------------------- */
document.addEventListener('DOMContentLoaded', function () {

    highlightActiveLink();
    renderNotifBadge(3);
    initPageTransitions();
    initTopbarProfile();
    
    const sidebar = document.getElementById('studentSidebar');
    const toggleBtn = document.getElementById('sidebarToggle');

    function isMobile() {
        return window.innerWidth <= 992;
    }

    if (toggleBtn && sidebar) {
        toggleBtn.addEventListener('click', function () {
            sidebar.classList.toggle(isMobile() ? 'mobile-open' : 'collapsed');
        });
    }

    // Close mobile sidebar when clicking outside of it
    document.addEventListener('click', function (e) {
        if (!isMobile() || !sidebar) return;
        const clickedInsideSidebar = sidebar.contains(e.target);
        const clickedToggle = toggleBtn && toggleBtn.contains(e.target);
        if (!clickedInsideSidebar && !clickedToggle) {
            sidebar.classList.remove('mobile-open');
        }
    });

    window.addEventListener('resize', function () {
        if (!isMobile() && sidebar) {
            sidebar.classList.remove('mobile-open');
        }
    });

    // Profile chip dropdown placeholder
    const profileChip = document.getElementById('profileChip');
    if (profileChip) {
        profileChip.addEventListener('click', function () {
            profileChip.classList.toggle('open');
        });
    }

    // Notification bell -> jump to notifications nav item visually
    const notifBtn = document.getElementById('notifBtn');
    if (notifBtn) {
        notifBtn.addEventListener('click', function () {
            window.location.href = 'notifications.html';
        });
    }

    initStatusChart();
});

/* ---------------------------- Application Status donut chart ---------------------------- */
/* ---------------------------- Application Status donut chart ---------------------------- */
/* ---------------------------- Application Status donut chart ---------------------------- */
function initStatusChart() {
    const ctx = document.getElementById('statusChart');
    if (!ctx || !window.Chart) return;

    new Chart(ctx, {
        type: 'doughnut',
        data: {
            // 1. Labels updated to match your legend exactly
            labels: ['In Progress', 'Under Review', 'Shortlisted', 'Selected', 'Not Selected'],
            datasets: [{
                // 2. Data updated to match your current numbers: [4, 0, 1, 1, 3] = 9 total
                // (Note: You can change the '1' for Selected to your real data later)
                data: [4, 0, 1, 1, 3], 
                // 3. Colors: Blue, Orange, Green, Teal (for Selected), Red (for Not Selected)
                backgroundColor: ['#4c7bf0', '#f2994a', '#1fae64', '#06b6d4', '#eb5757'],
                borderWidth: 0,
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '72%',
            plugins: {
                // You can leave this false because you have a custom HTML legend on the right
                legend: { display: false }, 
                tooltip: {
                    callbacks: {
                        label: function (item) {
                            return item.label + ': ' + item.raw;
                        }
                    }
                }
            }
        },
        plugins: [{
            id: 'centerText',
            afterDraw: function (chart) {
                const width = chart.width, height = chart.height, chartCtx = chart.ctx;
                chartCtx.save();
                const total = chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                chartCtx.font = "800 26px 'Plus Jakarta Sans', sans-serif";
                chartCtx.fillStyle = '#1c2333';
                chartCtx.textAlign = 'center';
                chartCtx.textBaseline = 'middle';
                chartCtx.fillText(total, width / 2, height / 2 - 10);
                chartCtx.font = "600 12px 'Plus Jakarta Sans', sans-serif";
                chartCtx.fillStyle = '#7c8698';
                chartCtx.fillText('Total', width / 2, height / 2 + 14);
                chartCtx.restore();
            }
        }]
    });
}