    // Global state
    let allPlacedStudents = []; 
    let placedBranch = '', placedSearch = '';

    // DOM Elements
    const tableBody = document.getElementById('placedTableBody');
    const resultCount = document.getElementById('placedResultCount');
    
    // Stats Elements (Add IDs to these in your HTML)
    // <div class="stat-num" id="stat-total-placed">...</div>
    // <div class="stat-num" id="stat-avg-ctc">...</div>
    // <div class="stat-num" id="stat-highest-ctc">...</div>

    document.addEventListener('DOMContentLoaded', function () {
        fetchPlacedStudents();
        setupEventListeners();
    });

    async function fetchPlacedStudents() {
        try {
            // Show loading state
            tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Loading data...</td></tr>';

            // Replace with your actual backend URL
            const response = await fetch('/api/admin/students/placed'); 
            
            if (!response.ok) throw new Error('Failed to fetch data');
            
            allPlacedStudents = await response.json();
            
            // Update UI
            calculateStats(allPlacedStudents);
            renderPlacedTable();
            
        } catch (error) {
            console.error("Error fetching placed students:", error);
            tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:red;">Failed to load data. Please try again.</td></tr>';
        }
    }

    function calculateStats(students) {
        // Update Total Placed
        const totalEl = document.getElementById('stat-total-placed');
        if (totalEl) totalEl.textContent = students.length;

        // Calculate Average and Highest CTC (Assuming packageLpa is a string like "12.5 LPA")
        // You may need to adjust parsing based on your actual backend output
        if (students.length > 0) {
            let maxCtc = 0;
            let totalCtc = 0;
            let validCtcCount = 0;

            students.forEach(s => {
                // Extract number from string (e.g., "12.5 LPA" -> 12.5)
                const ctcValue = parseFloat(s.packageLpa); 
                if (!isNaN(ctcValue)) {
                    if (ctcValue > maxCtc) maxCtc = ctcValue;
                    totalCtc += ctcValue;
                    validCtcCount++;
                }
            });

            const avgEl = document.getElementById('stat-avg-ctc');
            if (avgEl && validCtcCount > 0) {
                avgEl.textContent = (totalCtc / validCtcCount).toFixed(1);
            }

            const highEl = document.getElementById('stat-highest-ctc');
            if (highEl) highEl.textContent = maxCtc;
        }
    }

    function renderPlacedTable() {
        // Filter data based on search and branch
        let filteredRows = allPlacedStudents.filter(s => {
            if (placedBranch && s.branch !== placedBranch) return false;
            if (placedSearch && !(s.name + ' ' + s.company).toLowerCase().includes(placedSearch.toLowerCase())) return false;
            return true;
        });

        resultCount.textContent = filteredRows.length + ' result' + (filteredRows.length !== 1 ? 's' : '');

        if (filteredRows.length === 0) {
            tableBody.innerHTML = '<tr class="empty-row"><td colspan="6">No placed students match this view.</td></tr>';
            return;
        }

        // Helper function for initials (assuming you have this defined globally)
        const getInitials = (name) => {
            return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        };

        // Helper to escape HTML to prevent XSS
        const escapeHtml = (unsafe) => {
            return (unsafe || '').replace(/[&<"'>]/g, function (m) {
                return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
            });
        };

        tableBody.innerHTML = filteredRows.map(s => `
            <tr>
                <td>
                    <div class="avatar-cell">
                        <div class="av">${getInitials(s.name)}</div>
                        <div class="cell-primary">${escapeHtml(s.name)}</div>
                    </div>
                </td>
                <td class="mono">${escapeHtml(s.roll)}</td>
                <td>${escapeHtml(s.branch)}</td>
                <td class="mono">${s.cgpa ? s.cgpa.toFixed(1) : 'N/A'}</td>
                <td>${escapeHtml(s.company)}</td>
                <td class="mono cell-primary">${escapeHtml(s.packageLpa)}</td>
            </tr>
        `).join('');
    }

    function setupEventListeners() {
        // Branch Filters
        document.querySelectorAll('#placedFilters .chip').forEach(chip => {
            chip.addEventListener('click', function () {
                document.querySelectorAll('#placedFilters .chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                placedBranch = chip.dataset.filter;
                renderPlacedTable(); // Note: removed the '()' from earlier code for consistency
            });
        });

        // Search Input
        document.getElementById('placedSearch').addEventListener('input', function (e) { 
            placedSearch = e.target.value; 
            renderPlacedTable(); 
        });
    }
