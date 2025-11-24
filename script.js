// --- 1. GLOBAL STATE & KEYS ---
const KEYS = { DATA: 'omni_v5_data', SETTINGS: 'omni_v5_settings', LOGS: 'omni_v5_logs', LEAVES: 'omni_v5_leaves', ATTENDANCE: 'omni_v5_attendance' };
let employees = [];
let leaves = [];
// UPDATED ATTENDANCE STRUCTURE: { 'YYYY-MM-DD': { empId: { in: 'HH:MM', out: 'HH:MM', status: 'P'/'A'/'L' } } }
let attendance = {}; 
let departments = ['IT', 'HR', 'Finance', 'Sales', 'Marketing', 'Operations'];
let settings = { 
    payDay: 25,
    credentials: { username: 'admin', password: 'admin123' }
};
let currentDeleteId = null;
let chartInstance = null;
const KEYS_EXTRA = { EXPENSES: 'omni_v5_expenses', ANNOUNCE: 'omni_v5_announcements' };

// --- 2. INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    // Disable text selection and right-click to prevent Google search
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('selectstart', (e) => {
        // Allow selection only in input fields and textareas
        if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
            e.preventDefault();
        }
    });
    
    // Hide error message on fresh load
    const loginError = document.getElementById('loginError');
    if (loginError) loginError.classList.add('hidden');
    
    // Add input listeners for debug info
    const userInput = document.getElementById('loginUser');
    const passInput = document.getElementById('loginPass');
    const debugStatus = document.getElementById('debugStatus');
    
    if (userInput && passInput && debugStatus) {
        const updateDebug = () => {
            const u = (userInput.value || '').trim();
            const p = (passInput.value || '').trim();
            debugStatus.innerText = `Input: [${u}] / [${p}] | Match: ${u === 'admin' && p === 'admin123' ? '✓ YES' : '✗ NO'}`;
        };
        userInput.addEventListener('input', updateDebug);
        passInput.addEventListener('input', updateDebug);
    }
    
    if (localStorage.getItem('omni_theme') === 'dark') document.documentElement.classList.add('dark');
    if (sessionStorage.getItem('isLoggedIn') === 'true') showApp();
});

// Keep multiple open windows/tabs in sync: listen for storage changes
window.addEventListener('storage', (e) => {
    try {
        if (!e.key) return;
        if (e.key === KEYS.ATTENDANCE) {
            attendance = e.newValue ? JSON.parse(e.newValue) : {};
            // Update manager UI
            updateDashboard();
            const viewAttendance = document.getElementById('view-attendance');
            if (viewAttendance && !viewAttendance.classList.contains('hidden')) renderAttendanceTable();
        }
        // Also handle employees and leaves updates so manager sees new records
        if (e.key === KEYS.DATA) {
            employees = e.newValue ? JSON.parse(e.newValue) : [];
            renderTable(employees);
            updateDashboard();
        }
        if (e.key === KEYS.LEAVES) {
            leaves = e.newValue ? JSON.parse(e.newValue) : [];
            const viewLeaves = document.getElementById('view-leaves');
            if (viewLeaves && !viewLeaves.classList.contains('hidden')) renderLeaveSection();
            updateDashboard();
        }
    } catch (err) {
        // Fail silently but log to console for debugging
        console.warn('Storage sync parse error', err);
    }
});

function handleLogin(e) {
    e.preventDefault();
    
    // Always use default credentials - don't override from storage
    const u = (document.getElementById('loginUser').value || '').trim();
    const p = (document.getElementById('loginPass').value || '').trim();
    
    // Default credentials
    const expectedUser = 'admin';
    const expectedPass = 'admin123';
    
    console.log('Login attempt:', { inputUser: u, inputPass: p, expectedUser, expectedPass });
    
    if (u === expectedUser && p === expectedPass) {
        sessionStorage.setItem('isLoggedIn', 'true');
        sessionStorage.setItem('role', 'manager');
        document.getElementById('loginError').classList.add('hidden');
        loadData(); // Load app data
        showApp();
    } else { 
        console.log('Login FAILED - credentials do not match');
        document.getElementById('loginError').classList.remove('hidden'); 
    }
}

function showApp() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('appContainer').classList.remove('hidden');
    document.getElementById('appContainer').classList.add('flex');
    // loadData already called in handleLogin, but safe to call again
    switchTab('dashboard');
    checkAutoPay();
    // Display role badge
    const role = sessionStorage.getItem('role') || 'manager';
    const badge = document.getElementById('roleBadge');
    if (badge) {
        badge.innerText = role.charAt(0).toUpperCase() + role.slice(1);
        const roleColors = { manager: 'bg-indigo-100 text-indigo-700', hr: 'bg-purple-100 text-purple-700', admin: 'bg-red-100 text-red-700', employee: 'bg-blue-100 text-blue-700' };
        badge.className = `text-xs px-2 py-0.5 rounded-full font-bold ${roleColors[role] || 'bg-slate-100 text-slate-700'}`;
    }
}

function logout() { sessionStorage.removeItem('isLoggedIn'); location.reload(); }

// --- 3. DATA HANDLING ---
function loadSettings() {
    const s = localStorage.getItem(KEYS.SETTINGS);
    if (s) {
        try {
            const loadedSettings = JSON.parse(s);
            // Merge, keeping credentials if not in localStorage
            if (loadedSettings.credentials) {
                settings.credentials = loadedSettings.credentials;
            }
            settings.payDay = loadedSettings.payDay || settings.payDay;
            settings.departments = loadedSettings.departments || settings.departments;
        } catch (err) {
            console.warn('Settings load error:', err);
        }
    }
}

function loadData() {
    loadSettings();

    const d = localStorage.getItem(KEYS.DATA);
    employees = d ? JSON.parse(d) : getMockData();
    
    const l = localStorage.getItem(KEYS.LEAVES);
    leaves = l ? JSON.parse(l) : [];

    const a = localStorage.getItem(KEYS.ATTENDANCE);
    attendance = a ? JSON.parse(a) : {};
    
    const s = localStorage.getItem(KEYS.SETTINGS);
    if (s) {
        const loadedSettings = JSON.parse(s);
        departments = loadedSettings.departments || departments;
    }
    
    if (!d) saveData();
}

function saveData() {
    settings.departments = departments; 
    localStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
    
    localStorage.setItem(KEYS.DATA, JSON.stringify(employees));
    localStorage.setItem(KEYS.LEAVES, JSON.stringify(leaves));
    localStorage.setItem(KEYS.ATTENDANCE, JSON.stringify(attendance));
    updateDashboard();
}

function getMockData() {
    return [
        { id: 101, firstName: "Tony", lastName: "Stark", email: "tony@stark.com", phone: "9876543210", address: "Stark Tower, New York", emergencyContact: "Pepper Potts", department: "IT", position: "CTO", salary: 250000, status: "Active", joined: "2020-01-15", photo: null, role: "employee", performance: "Excellent", documents: [] },
        { id: 102, firstName: "Steve", lastName: "Rogers", email: "cap@avengers.com", phone: "8765432109", address: "Brooklyn, New York", emergencyContact: "Bucky Barnes", department: "HR", position: "Manager", salary: 120000, status: "Active", joined: "2021-03-10", photo: null, role: "manager", performance: "Outstanding", documents: [] }
    ];
}

// --- 4. VIEW NAVIGATION (TABS) ---
function switchTab(tab) {
    ['dashboard', 'attendance', 'leaves'].forEach(t => {
        document.getElementById(`view-${t}`).classList.add('hidden');
        document.getElementById(`tab-${t}`).classList.remove('active');
    });
    document.getElementById(`view-${tab}`).classList.remove('hidden');
    document.getElementById(`tab-${tab}`).classList.add('active');
    
    if (tab === 'dashboard') { renderTable(employees); updateDashboard(); }
    if (tab === 'attendance') renderAttendanceTable();
    if (tab === 'leaves') renderLeaveSection();
}

// --- 5. DASHBOARD LOGIC ---
function renderTable(data) {
    const tbody = document.getElementById('employeeTableBody');
    const empty = document.getElementById('emptyState');
    tbody.innerHTML = '';
    
    if (data.length === 0) { empty.classList.remove('hidden'); empty.classList.add('flex'); return; }
    empty.classList.add('hidden'); empty.classList.remove('flex');

    data.forEach(emp => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-teal-50/50 dark:hover:bg-slate-800/50 border-b border-slate-50 dark:border-slate-700/50 group";
        
        let avatar = emp.photo ? `<img src="${emp.photo}" class="w-10 h-10 rounded-full object-cover">` : `<div class="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-slate-600 dark:text-slate-300">${emp.firstName[0]}${emp.lastName[0]}</div>`;
        
        let sColor = 'bg-gray-100 text-gray-600';
        if (emp.status === 'Active') sColor = 'bg-emerald-100 text-emerald-700';
        if (emp.status === 'Leave') sColor = 'bg-amber-100 text-amber-700';
        if (emp.status === 'Absent') sColor = 'bg-red-100 text-red-700';

        tr.innerHTML = `
            <td class="px-6 py-4"><div class="flex items-center gap-3">${avatar}<div><div class="font-bold text-slate-800 dark:text-white">${emp.firstName} ${emp.lastName}</div><div class="text-xs text-slate-500">${emp.email}</div></div></div></td>
            <td class="px-6 py-4"><span class="px-2 py-1 rounded-full text-xs font-bold ${sColor}">${emp.status}</span></td>
            <td class="px-6 py-4"><div class="text-sm text-slate-700 dark:text-slate-300">${emp.position}</div><div class="text-xs text-slate-400">${emp.department}</div></td>
            <td class="px-6 py-4 font-mono text-xs font-bold text-slate-600 dark:text-slate-400">${formatCurrency(emp.salary)}</td>
            
            <td class="px-6 py-4 text-right w-[150px]">
                <div class="flex justify-end gap-2"> 
                        <button onclick="viewProfile(${emp.id})" title="View Profile" class="p-2 text-sky-500 hover:bg-sky-50 rounded-lg"><i class="fa-solid fa-eye"></i></button>
                        <button onclick="generateIDCard(${emp.id})" title="ID Card" class="p-2 text-teal-500 hover:bg-teal-50 dark:hover:bg-teal-900/50 rounded-lg hover:shadow-md transition-all"><i class="fa-solid fa-id-card"></i></button>
                    <button onclick="openModal('edit', ${emp.id})" title="Edit Employee" class="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg hover:shadow-md transition-all"><i class="fa-solid fa-pen"></i></button>
                    <button onclick="initDelete(${emp.id})" title="Delete Employee" class="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/50 rounded-lg hover:shadow-md transition-all"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function updateDashboard() {
    document.getElementById('statsTotal').innerText = employees.length;
    document.getElementById('statsPayroll').innerText = formatCurrency(employees.reduce((s,e)=>s+e.salary,0)/12);
    document.getElementById('statsLeaves').innerText = employees.filter(e => e.status === 'Leave').length;
    
    // Count present today
    const today = new Date().toISOString().split('T')[0];
    const todayAtt = attendance[today] || {};
    // Check if status is explicitly 'P' (from manual set or employee punch-in)
    const presentCount = Object.values(todayAtt).filter(v => v.status === 'P').length; 
    document.getElementById('statsPresent').innerText = presentCount;

    renderChart();
    renderAnalytics();
    renderPendingExpenses();
}

function renderChart() {
    const ctx = document.getElementById('deptChart').getContext('2d');
    const depts = {};
    employees.forEach(e => depts[e.department] = (depts[e.department] || 0) + 1);
    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: Object.keys(depts), datasets: [{ data: Object.values(depts), backgroundColor: ['#14b8a6', '#f59e0b', '#3b82f6', '#ef4444', '#7c3aed'] }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
    });
}

// --- 6. ATTENDANCE LOGIC (UPDATED FOR TIME RECORD) ---
function renderAttendanceTable() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('attendanceDate').innerText = new Date().toDateString();
    const tbody = document.getElementById('attendanceTableBody');
    tbody.innerHTML = '';
    
    const record = attendance[today] || {};
    let presentCount = 0;

    employees.forEach(emp => {
        const empRecord = record[emp.id] || {};
        const status = empRecord.status || '-'; 
        const inTime = empRecord.in || '--:--';
        const outTime = empRecord.out || '--:--';
        
        if(status === 'P') presentCount++;

        const tr = document.createElement('tr');
        tr.className = "border-b border-slate-50 dark:border-slate-700";
        tr.innerHTML = `
            <td class="px-6 py-4 font-medium text-slate-700 dark:text-slate-200">${emp.firstName} ${emp.lastName}</td>
            <td class="px-6 py-4"><span class="text-xs font-bold ${status==='P'?'text-emerald-600':(status==='A'?'text-red-600':'text-slate-400')}">${status === 'P' ? 'PRESENT' : (status === 'A' ? 'ABSENT' : 'UNMARKED')}</span></td>
             <td class="px-6 py-4 text-xs text-slate-500 dark:text-slate-400">${inTime} - ${outTime}</td>
            <td class="px-6 py-4 text-right">
                <div class="flex justify-end gap-2">
                    <button onclick="markAttendance(${emp.id}, 'P')" class="att-btn att-btn-p ${status==='P'?'selected':''}"><i class="fa-solid fa-check"></i></button>
                    <button onclick="markAttendance(${emp.id}, 'A')" class="att-btn att-btn-a ${status==='A'?'selected':''}"><i class="fa-solid fa-xmark"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    const rate = employees.length > 0 ? Math.round((presentCount / employees.length) * 100) : 0;
    document.getElementById('dailyRate').innerText = `${rate}%`;
}

function markAttendance(id, status) {
    const today = new Date().toISOString().split('T')[0];
    const currentTime = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
    
    if (!attendance[today]) attendance[today] = {};
    
    // Set default in/out times if manager manually marks P/A
    let inTime = status === 'P' ? '09:00' : null;
    let outTime = status === 'P' ? '17:00' : null;

    // Check if employee has already punched in/out today
    const existingRecord = attendance[today][id] || {};
    if (existingRecord.in) inTime = existingRecord.in;
    if (existingRecord.out) outTime = existingRecord.out;

    attendance[today][id] = { in: inTime, out: outTime, status: status };
    
    // Auto-update employee status 
    const empIdx = employees.findIndex(e => e.id === id);
    if (empIdx > -1) {
        if (status === 'A') employees[empIdx].status = 'Absent';
        else if (status === 'P') employees[empIdx].status = 'Active';
        else if (employees[empIdx].status !== 'Leave') employees[empIdx].status = 'Active'; // Revert if unmarked
    }
    
    saveData();
    logAction('markAttendance', { id, status, date: today, time: currentTime });
    renderAttendanceTable();
}

// --- 7. LEAVE MANAGEMENT LOGIC ---
function renderLeaveSection() {
    const select = document.getElementById('leaveEmployee');
    select.innerHTML = '';
    employees.forEach(e => {
        const opt = document.createElement('option');
        opt.value = e.id; opt.innerText = `${e.firstName} ${e.lastName}`;
        select.appendChild(opt);
    });

    const container = document.getElementById('leaveList');
    container.innerHTML = '';
    
    // Sort pending first
    const sortedLeaves = leaves.sort((a, b) => {
        if (a.status === 'Pending' && b.status !== 'Pending') return -1;
        if (a.status !== 'Pending' && b.status === 'Pending') return 1;
        return new Date(b.start) - new Date(a.start);
    });
    
    if (sortedLeaves.length === 0) {
        container.innerHTML = `<div class="text-center text-slate-400 py-10">No records found.</div>`;
        return;
    }

    sortedLeaves.forEach((l, index) => {
        const emp = employees.find(e => e.id == l.empId);
        const name = emp ? `${emp.firstName} ${emp.lastName}` : 'Unknown';
        
        const div = document.createElement('div');
        div.className = `p-4 rounded-lg border ${l.status === 'Pending' ? 'bg-teal-50 border-teal-100 dark:bg-slate-700 dark:border-slate-600' : 'bg-white border-slate-100 opacity-70'}`;
        div.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <div>
                    <p class="font-bold text-slate-800 dark:text-white text-sm">${name}</p>
                    <p class="text-xs text-slate-500">${l.type} • ${l.start} to ${l.end}</p>
                </div>
                <span class="text-[10px] uppercase font-bold px-2 py-1 rounded ${l.status==='Approved'?'bg-emerald-100 text-emerald-600':(l.status==='Pending'?'bg-amber-100 text-amber-600':'bg-red-100 text-red-600')}">${l.status}</span>
            </div>
            <p class="text-xs text-slate-600 dark:text-slate-300 mb-3 italic">"${l.reason}"</p>
            ${l.status === 'Pending' ? `
                <div class="flex gap-2">
                    <button onclick="approveLeave(${index})" class="flex-1 py-1 bg-teal-600 text-white text-xs rounded hover:bg-teal-700">Approve</button>
                    <button onclick="rejectLeave(${index})" class="flex-1 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700">Reject Request</button>
                </div>
            ` : ''}
        `;
        container.appendChild(div);
    });
}

function submitLeave(e) {
    e.preventDefault();
    const req = {
        empId: document.getElementById('leaveEmployee').value,
        start: document.getElementById('leaveStart').value,
        end: document.getElementById('leaveEnd').value,
        type: document.getElementById('leaveType').value,
        reason: document.getElementById('leaveReason').value,
        status: 'Pending'
    };
    leaves.unshift(req);
    saveData();
    renderLeaveSection();
    showToast('Leave request submitted');
    e.target.reset();
}

function approveLeave(index) {
    leaves[index].status = 'Approved';
    
    // Update Employee Status to 'Leave'
    const empIdx = employees.findIndex(e => e.id == leaves[index].empId);
    if (empIdx > -1) {
        employees[empIdx].status = 'Leave';
    }
    
    saveData();
    renderLeaveSection();
    showToast('Leave approved');
}

/**
 * Marks a leave request as Rejected and ensures employee status is 'Active'.
 * @param {number} index - Index of the leave request in the global leaves array.
 */
function rejectLeave(index) {
    leaves[index].status = 'Rejected';
    
    // Ensure employee status is reverted to Active if it was set due to the pending leave
    const empIdx = employees.findIndex(e => e.id == leaves[index].empId);
    if (empIdx > -1) {
        // Only revert status to 'Active' if it's not currently 'Leave' (which would happen upon approval)
        if (employees[empIdx].status !== 'Leave') { 
             employees[empIdx].status = 'Active';
        }
    }
    
    saveData();
    renderLeaveSection();
    showToast('Leave request rejected.');
}


// --- 8. MANAGER CREDENTIALS LOGIC ---
function changeCredentials(e) {
    e.preventDefault();
    document.getElementById('credError').classList.add('hidden');
    
    const currentPass = document.getElementById('currentPass').value;
    const newUsername = document.getElementById('newUsername').value;
    const newPassword = document.getElementById('newPassword').value;

    if (currentPass !== settings.credentials.password) {
        document.getElementById('credError').innerText = "Error: Invalid Current Password.";
        document.getElementById('credError').classList.remove('hidden');
        return;
    }
    
    if (newUsername.length < 3 || newPassword.length < 6) {
        document.getElementById('credError').innerText = "Error: Username must be 3+ chars, Password 6+ chars.";
        document.getElementById('credError').classList.remove('hidden');
        return;
    }

    settings.credentials.username = newUsername;
    settings.credentials.password = newPassword;
    
    saveData();
    document.getElementById('settingsModal').classList.add('hidden');
    showToast('Manager credentials updated successfully!');
}


// --- 9. STANDARD CRUD ---
function handleFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('empId').value;
    const formData = {
        firstName: document.getElementById('firstName').value,
        lastName: document.getElementById('lastName').value,
        email: document.getElementById('email').value,
        phone: document.getElementById('phone').value,
        address: document.getElementById('address').value,
        emergencyContact: document.getElementById('emergencyContact').value,
        department: document.getElementById('department').value,
        position: document.getElementById('position').value,
        salary: Number(document.getElementById('salary').value),
        status: 'Active', 
        photo: document.getElementById('photoBase64').value || null,
        joined: id ? employees.find(x=>x.id==id).joined : new Date().toISOString().split('T')[0],
        role: document.getElementById('role').value || 'employee',
        performance: id ? (employees.find(x=>x.id==id).performance || 'Good') : 'Good',
        documents: id ? (employees.find(x=>x.id==id).documents || []) : []
    };
    
    if (id) {
        const idx = employees.findIndex(x => x.id == id);
        if(!formData.photo) formData.photo = employees[idx].photo;
        employees[idx] = { id: Number(id), ...formData };
        logAction('editEmployee', { id: Number(id), data: formData });
    } else {
        const newId = employees.length ? Math.max(...employees.map(e => e.id)) + 1 : 101;
        employees.push({ id: newId, ...formData });
        logAction('createEmployee', { id: newId, data: formData });
    }
    saveData(); closeModal(); renderTable(employees); updateDashboard();
}

function handlePhotoUpload(input) {
    const file = input.files[0];
    if (file) {
        const r = new FileReader();
        r.onload = (e) => {
            document.getElementById('photoBase64').value = e.target.result;
            document.getElementById('previewPhoto').src = e.target.result;
            document.getElementById('previewPhoto').classList.remove('hidden');
            document.getElementById('photoIcon').classList.add('hidden');
        };
        r.readAsDataURL(file);
    }
}

// --- 10. UTILS & MODALS ---
function openModal(mode, id) {
    updateDeptDropdown();
    const m = document.getElementById('employeeModal');
    const f = document.getElementById('employeeForm');
    
    document.getElementById('photoBase64').value = '';
    document.getElementById('previewPhoto').classList.add('hidden');
    document.getElementById('photoIcon').classList.remove('hidden');
    document.getElementById('photoInput').value = '';

    if (mode === 'edit') {
        const e = employees.find(x => x.id == id);
        document.getElementById('empId').value = id;
        document.getElementById('firstName').value = e.firstName;
        document.getElementById('lastName').value = e.lastName;
        document.getElementById('email').value = e.email;
        document.getElementById('phone').value = e.phone;
        document.getElementById('address').value = e.address;
        document.getElementById('emergencyContact').value = e.emergencyContact;
        document.getElementById('department').value = e.department;
        document.getElementById('position').value = e.position;
        document.getElementById('role').value = e.role || 'employee';
        document.getElementById('salary').value = e.salary;
        if (e.photo) {
            document.getElementById('photoBase64').value = e.photo;
            document.getElementById('previewPhoto').src = e.photo;
            document.getElementById('previewPhoto').classList.remove('hidden');
            document.getElementById('photoIcon').classList.add('hidden');
        }
        document.getElementById('modalTitle').innerText = 'Edit Employee';
    } else {
        f.reset(); document.getElementById('empId').value = '';
        // default role
        const roleEl = document.getElementById('role'); if (roleEl) roleEl.value = 'employee';
        document.getElementById('modalTitle').innerText = 'New Employee';
    }
    m.classList.remove('hidden');
}

function updateDeptDropdown() {
    const s = document.getElementById('department');
    if (s) s.innerHTML = '';
    departments.forEach(d => {
        if (s) {
            const o = document.createElement('option');
            o.value = d;
            o.innerText = d;
            s.appendChild(o);
        }
    });
    // Populate the dashboard filter dropdown if present
    const f = document.getElementById('filterDept');
    if (f) {
        f.innerHTML = '<option value="">All Depts</option>';
        departments.forEach(d => {
            const o = document.createElement('option');
            o.value = d;
            o.innerText = d;
            f.appendChild(o);
        });
    }
}

function closeModal() { document.getElementById('employeeModal').classList.add('hidden'); }
function initDelete(id) { currentDeleteId = id; document.getElementById('deleteModal').classList.remove('hidden'); }
function closeDeleteModal() { document.getElementById('deleteModal').classList.add('hidden'); }
function confirmDelete() { logAction('deleteEmployee', { id: currentDeleteId }); employees = employees.filter(e => e.id !== currentDeleteId); saveData(); renderTable(employees); updateDashboard(); closeDeleteModal(); }

// --- Audit Logging ---
function logAction(action, details) {
    try {
        const logs = JSON.parse(localStorage.getItem(KEYS.LOGS) || '[]');
        logs.unshift({ ts: new Date().toISOString(), action, details });
        localStorage.setItem(KEYS.LOGS, JSON.stringify(logs));
    } catch (err) { console.warn('logAction error', err); }
}

// Expenses submission
function submitExpense(e) {
    e.preventDefault();
    const expense = {
        id: Date.now(),
        title: document.getElementById('expenseTitle').value,
        amount: Number(document.getElementById('expenseAmount').value),
        receipt: document.getElementById('expenseReceipt').value,
        note: document.getElementById('expenseNote').value,
        status: 'Pending',
        date: new Date().toISOString()
    };
    const ex = JSON.parse(localStorage.getItem(KEYS_EXTRA.EXPENSES) || '[]');
    ex.unshift(expense);
    localStorage.setItem(KEYS_EXTRA.EXPENSES, JSON.stringify(ex));
    logAction('submitExpense', expense);
    showToast('Expense submitted');
    document.getElementById('expenseModal').classList.add('hidden');
}

// Export today's attendance as CSV
function exportAttendanceCSV() {
    const today = new Date().toISOString().split('T')[0];
    const record = attendance[today] || {};
    const rows = [['ID','Name','In','Out','Status']];
    employees.forEach(e => {
        const r = record[e.id] || {};
        rows.push([e.id, `${e.firstName} ${e.lastName}`, r.in || '', r.out || '', r.status || '']);
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `attendance_${today}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    showToast('Attendance exported');
    logAction('exportAttendance', { date: today });
}

function exportWeeklyAttendanceCSV() {
    const today = new Date();
    const week = [];
    const rows = [['ID', 'Name', ...Array.from({length:7}, (_, i) => {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    })]];
    
    employees.forEach(e => {
        const row = [e.id, `${e.firstName} ${e.lastName}`];
        for (let i = 0; i < 7; i++) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const key = d.toISOString().split('T')[0];
            const rec = attendance[key] && attendance[key][e.id];
            row.push(rec ? rec.status || 'Unmarked' : 'Unmarked');
        }
        rows.push(row);
    });
    
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `attendance_weekly_${today.toISOString().split('T')[0]}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    showToast('Weekly report exported');
    logAction('exportWeeklyAttendance', { week: today.toISOString().split('T')[0] });
}

// Settings & Depts
function openSettings() {

// View profile in modal
function viewProfile(id) {
    const e = employees.find(x => x.id == id);
    if (!e) return;
    document.getElementById('profileName').innerText = `${e.firstName} ${e.lastName}`;
    document.getElementById('profileRole').innerText = e.role || 'employee';
    document.getElementById('profileDept').innerText = e.department || '-';
    document.getElementById('profilePhone').innerText = e.phone || '-';
    document.getElementById('profileEmail').innerText = e.email || '-';
    document.getElementById('profileEmergency').innerText = e.emergencyContact || '-';
    document.getElementById('profileJoined').innerText = e.joined || '-';
    // Performance
    const perf = e.performance || [];
    document.getElementById('profilePerformance').innerHTML = perf.length ? perf.map(p=>`<div class="mb-1"><strong>${p.date}</strong> — ${p.score} (${p.evaluator || 'N/A'})<div class="text-xs text-slate-500">${p.notes||''}</div></div>`).join('') : '<div class="text-xs text-slate-400">No records</div>';
    // Documents
    const docs = e.docs || [];
    document.getElementById('profileDocs').innerHTML = docs.length ? docs.map(d=>`<div><a href="${d.url||'#'}" target="_blank" class="text-teal-600 underline">${d.name}</a></div>`).join('') : '<div class="text-xs text-slate-400">No documents</div>';
    document.getElementById('profileModal').classList.remove('hidden');
}
    document.getElementById('payDaySetting').value = settings.payDay;
    document.getElementById('currentPass').value = '';
    document.getElementById('newUsername').value = settings.credentials.username;
    document.getElementById('newPassword').value = '';
    document.getElementById('credError').classList.add('hidden');
    
    renderDeptList(); 
    document.getElementById('settingsModal').classList.remove('hidden');
}
function renderDeptList() {
    const c = document.getElementById('deptList'); c.innerHTML = '';
    departments.forEach(d => { c.innerHTML += `<div class="bg-slate-100 text-xs px-2 py-1 rounded flex gap-2"><span>${d}</span><button onclick="remDept('${d}')" class="text-red-500">&times;</button></div>`; });
}
function addDepartment() {
    const v = document.getElementById('newDeptName').value;
    if(v && !departments.includes(v)) { departments.push(v); renderDeptList(); document.getElementById('newDeptName').value = ''; }
}
function remDept(n) { departments = departments.filter(d => d !== n); renderDeptList(); }
function saveSettings() { 
    settings.payDay = Number(document.getElementById('payDaySetting').value); 
    saveData(); 
    document.getElementById('settingsModal').classList.add('hidden'); 
    checkAutoPay(); 
    showToast('Settings saved.');
}
function closeSettings() { document.getElementById('settingsModal').classList.add('hidden'); }
function resetData(f) { if(f) { localStorage.clear(); location.reload(); } }

// ID Card
function generateIDCard(id) {
    const e = employees.find(x => x.id == id);
    if (e.photo) { document.getElementById('idCardImg').src = e.photo; document.getElementById('idCardImg').classList.remove('hidden'); document.getElementById('idCardAvatar').classList.add('hidden'); }
    else { document.getElementById('idCardImg').classList.add('hidden'); document.getElementById('idCardAvatar').classList.remove('hidden'); document.getElementById('idCardAvatar').innerText = e.firstName[0]+e.lastName[0]; }
    document.getElementById('idCardName').innerText = `${e.firstName} ${e.lastName}`;
    document.getElementById('idCardRole').innerText = e.position;
    document.getElementById('idCardNum').innerText = e.id;
    document.getElementById('idCardDept').innerText = e.department;
    document.getElementById('idCardPhone').innerText = e.phone;
    document.getElementById('idCardEmergency').innerText = e.emergencyContact;

    document.getElementById('qrcode').innerHTML = '';
    // Use the global QRCode constructor (ensuring qrcode.min.js is loaded in index.html)
    new QRCode(document.getElementById('qrcode'), {text:JSON.stringify({id:e.id,name:e.firstName,phone:e.phone}),width:80,height:80});
    document.getElementById('idCardModal').classList.remove('hidden');
}
function closeIdCard() { document.getElementById('idCardModal').classList.add('hidden'); }

// Misc
function checkAutoPay() {
    const k = `pay_${new Date().getFullYear()}_${new Date().getMonth()}`;
    if (new Date().getDate() >= settings.payDay && !localStorage.getItem(k) && employees.length) {
        document.getElementById('paidMonthName').innerText = new Date().toLocaleString('default',{month:'long'});
        document.getElementById('paidAmountDisplay').innerText = formatCurrency(employees.reduce((s,e)=>s+e.salary,0)/12);
        document.getElementById('paymentModal').classList.remove('hidden'); localStorage.setItem(k, 'paid');
    }
}
function formatCurrency(n) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n); }
function toggleTheme() { document.documentElement.classList.toggle('dark'); localStorage.setItem('omni_theme', document.documentElement.classList.contains('dark')?'dark':'light'); }
function showToast(m, type = 'success') { 
    const d = document.createElement('div'); 
    d.className = `bg-white border-l-4 px-6 py-4 shadow-xl rounded animate-slide-in ${type === 'success' ? 'border-teal-500 text-teal-700' : 'border-red-500 text-red-700'}`; 
    d.innerText = m; 
    document.getElementById('toast-container').appendChild(d); 
    setTimeout(()=>d.remove(),3000); 
}

// --- Filters & Search ---
function getFilteredEmployees() {
    const q = (document.getElementById('searchInput') && document.getElementById('searchInput').value || '').toLowerCase();
    const dept = document.getElementById('filterDept') ? document.getElementById('filterDept').value : '';
    const role = document.getElementById('filterRole') ? document.getElementById('filterRole').value : '';
    const status = document.getElementById('filterStatus') ? document.getElementById('filterStatus').value : '';

    return employees.filter(emp => {
        if (dept && emp.department !== dept) return false;
        if (role && (emp.role || 'employee') !== role) return false;
        if (status && emp.status !== status) return false;
        if (!q) return true;
        return Object.values(emp).some(v => String(v).toLowerCase().includes(q));
    });
}

function initFilters() {
    const sq = document.getElementById('searchInput');
    const fd = document.getElementById('filterDept');
    const fr = document.getElementById('filterRole');
    const fs = document.getElementById('filterStatus');
    const handle = () => { renderTable(getFilteredEmployees()); };
    if (sq) sq.addEventListener('input', handle);
    if (fd) fd.addEventListener('change', handle);
    if (fr) fr.addEventListener('change', handle);
    if (fs) fs.addEventListener('change', handle);
}

// --- Analytics & Expense Panel Rendering ---
function renderAnalytics() {
    try {
        // Calculate average daily attendance (last 7 days)
        const avgAtt = calculateAveragAttendance();
        document.getElementById('avgAttendance').innerText = avgAtt + '%';
        
        // Total leave requests (all status)
        document.getElementById('totalLeaves').innerText = leaves.length;
        
        // Total pending expenses
        const expenses = JSON.parse(localStorage.getItem(KEYS_EXTRA.EXPENSES) || '[]');
        const pendingTotal = expenses.filter(e => e.status === 'Pending').reduce((s, e) => s + (e.amount || 0), 0);
        document.getElementById('totalExpenses').innerText = formatCurrency(pendingTotal);
        
        // Monthly payroll
        document.getElementById('monthlyPayroll').innerText = formatCurrency(employees.reduce((s,e)=>s+e.salary,0)/12);
    } catch (err) {
        console.warn('Analytics error:', err);
    }
}

function calculateAveragAttendance() {
    let totalDays = 0, totalPresent = 0;
    for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        const dayAtt = attendance[key] || {};
        totalDays++;
        totalPresent += Object.values(dayAtt).filter(v => v.status === 'P').length;
    }
    return totalDays > 0 ? Math.round((totalPresent / (totalDays * employees.length)) * 100) : 0;
}

function renderPendingExpenses() {
    try {
        const expenses = JSON.parse(localStorage.getItem(KEYS_EXTRA.EXPENSES) || '[]');
        const pending = expenses.filter(e => e.status === 'Pending').slice(0, 5);
        const container = document.getElementById('pendingExpenses');
        
        if (pending.length === 0) {
            container.innerHTML = '<p class="text-slate-400 text-sm">No pending expenses</p>';
            return;
        }
        
        container.innerHTML = pending.map(exp => `
            <div class="p-3 bg-amber-50 dark:bg-slate-700 rounded border-l-4 border-amber-500 flex justify-between items-center">
                <div>
                    <p class="font-bold text-sm text-slate-800 dark:text-white">${exp.title}</p>
                    <p class="text-xs text-slate-500">${new Date(exp.date).toLocaleDateString()}</p>
                </div>
                <div class="text-right">
                    <p class="font-bold text-amber-600">${formatCurrency(exp.amount)}</p>
                    <button onclick="approveExpense(${exp.id})" class="text-xs bg-emerald-500 text-white px-2 py-0.5 rounded mt-1">Approve</button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.warn('Expense render error:', err);
    }
}

function approveExpense(id) {
    const expenses = JSON.parse(localStorage.getItem(KEYS_EXTRA.EXPENSES) || '[]');
    const idx = expenses.findIndex(e => e.id === id);
    if (idx > -1) {
        expenses[idx].status = 'Approved';
        localStorage.setItem(KEYS_EXTRA.EXPENSES, JSON.stringify(expenses));
        renderPendingExpenses();
        showToast('Expense approved!');
        logAction('approveExpense', { id });
    }
}

// Initialize filters immediately (script is loaded at end of body)
initFilters();