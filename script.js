// ❗ IMPORTANT: Yahan apna Google Apps Script ka URL daalein
const API_URL = 'https://script.google.com/macros/s/AKfycbwWoJizLIiRDoJbhu891-KWdUBfJmCVL21R3ujktl67t0LZ0MN31xxUJ79nBBJKnJmnkw/exec';

// --- GLOBAL CACHE & STATE ---
let APP_DATA = {};
const navHistory = {
    stack: [], forwardStack: [],
    push(viewId) { if (this.stack.length === 0 || this.stack[this.stack.length - 1] !== viewId) { this.stack.push(viewId); this.forwardStack = []; } },
    back() { if (this.stack.length > 1) { this.forwardStack.push(this.stack.pop()); return this.stack[this.stack.length - 1]; } return null; },
    forward() { if (this.forwardStack.length > 0) { const nextView = this.forwardStack.pop(); this.stack.push(nextView); return nextView; } return null; }
};
const loginWrapper = document.getElementById('login-wrapper'), appContainer = document.getElementById('app-container');
const loginForm = document.getElementById('login-form'), loginError = document.getElementById('login-error');
const mainView = document.getElementById('main-view'), headerTitle = document.getElementById('header-title');
const navLinksContainer = document.getElementById('nav-links');
let registerModal, bidModal, adminActionModal, adminChart, vendorAmountChart, reqStatusChart;

// --- CORE APP LOGIC ---
window.onload = () => {
    try {
        registerModal = new bootstrap.Modal(document.getElementById('registerModal'));
        bidModal = new bootstrap.Modal(document.getElementById('bidModal'));
        adminActionModal = new bootstrap.Modal(document.getElementById('adminActionModal'));
    } catch (e) { console.error("Error initializing modals:", e); }
    
    if (sessionStorage.getItem('loggedInUser')) {
        const user = JSON.parse(sessionStorage.getItem('loggedInUser'));
        setupUIForRole(user);
        navigateTo(getDefaultViewForRole(user.Role));
    }
};

// --- DATA FETCHING & POSTING ---
async function getData(sheetName, forceRefresh = false) {
    if (APP_DATA[sheetName] && !forceRefresh) return APP_DATA[sheetName];
    try {
        const response = await fetch(`${API_URL}?sheet=${sheetName}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const result = await response.json();
        if (result.success) { APP_DATA[sheetName] = result.data; return result.data; }
        return null;
    } catch (error) { console.error(`Failed to fetch ${sheetName}:`, error); return null; }
}

async function postData(payload) {
    showLoader();
    try {
        const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify(payload), headers: {'Content-Type': 'text/plain;charset=utf-8'}, redirect: 'follow' });
        const textResponse = await response.text();
        if (textResponse) { return JSON.parse(textResponse); }
        return { success: true };
    } catch (error) { console.error('POST Error:', error); return { success: false, error: 'Network error' }; }
    finally { hideLoader(); }
}

// --- AUTHENTICATION ---
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.textContent = 'Authenticating...'; showLoader();
    const users = await getData('Users', true);
    hideLoader();
    if (users) {
        const emailInput = document.getElementById('email').value.toLowerCase();
        const passwordInput = document.getElementById('password').value;
        const foundUser = users.find(user => user.Email.toLowerCase() === emailInput && user.Password === passwordInput);
        if (foundUser) {
            sessionStorage.setItem('loggedInUser', JSON.stringify(foundUser));
            APP_DATA = {};
            setupUIForRole(foundUser);
        } else { loginError.textContent = 'Invalid email or password.'; }
    } else { loginError.textContent = 'Could not connect to server.'; }
});

document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const result = await postData({ action: 'submitRegistration', data: { FullName: document.getElementById('reg-fullname').value, Email: document.getElementById('reg-email').value, Password: document.getElementById('reg-password').value, CompanyName: document.getElementById('reg-company').value, Role: document.getElementById('reg-role').value } });
    if (result.success) { showToast(result.message); registerModal.hide(); } 
    else { showToast('Registration failed: ' + result.error, 'error'); }
});

function handleLogout() {
    sessionStorage.removeItem('loggedInUser');
    APP_DATA = {};
    window.location.reload();
}

// --- NAVIGATION & UI SETUP ---
function navigateTo(viewId, fromHistory = false) {
    const navLinkElement = document.querySelector(`.nav-link[data-view="${viewId}"]`);
    mainView.querySelectorAll('.view').forEach(view => view.classList.add('hidden'));
    const targetView = document.getElementById(viewId);
    if(targetView) targetView.classList.remove('hidden');

    navLinksContainer.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
    if (navLinkElement) {
         navLinkElement.classList.add('active');
         headerTitle.textContent = navLinkElement.textContent.trim();
    } else {
        const fallbackLink = document.querySelector(`.nav-link[data-view="${viewId}"]`);
        if(fallbackLink) { fallbackLink.classList.add('active'); headerTitle.textContent = fallbackLink.textContent.trim(); }
    }
    if(!fromHistory) navHistory.push(viewId);
    updateNavControls();
    
    const viewLoadFunctions = {
        'admin-dashboard-view': loadAdminDashboard, 'admin-requirements-view': loadAdminRequirements,
        'admin-awarded-view': loadAdminAwardedContracts, 'admin-pending-reqs-view': loadPendingRequisitions,
        'admin-pending-users-view': loadPendingUsers, 'admin-reports-view': loadAdminReports,
        'vendor-dashboard-view': () => loadVendorDashboard(JSON.parse(sessionStorage.getItem('loggedInUser')).UserID),
        'vendor-awarded-view': () => loadVendorAwarded(JSON.parse(sessionStorage.getItem('loggedInUser')).UserID),
        'user-dashboard-view': loadUserDashboard, 'user-create-req-view': loadUserCreateReq, 'user-status-view': loadUserStatusView,
    };
    viewLoadFunctions[viewId]?.();
}

function updateNavControls() {
    document.getElementById('nav-back').disabled = navHistory.stack.length <= 1;
    document.getElementById('nav-next').disabled = navHistory.forwardStack.length === 0;
}
document.getElementById('nav-back').addEventListener('click', () => { const prev = navHistory.back(); if(prev) navigateTo(prev, true); });
document.getElementById('nav-next').addEventListener('click', () => { const next = navHistory.forward(); if(next) navigateTo(next, true); });
document.getElementById('nav-home').addEventListener('click', () => navigateTo(getDefaultViewForRole('Admin')));

function setupUIForRole(user) {
    loginWrapper.classList.add('hidden'); appContainer.classList.remove('hidden');
    document.getElementById('user-name-sidebar').textContent = user.FullName;
    document.getElementById('user-email-sidebar').textContent = user.Email;
    document.querySelectorAll('#nav-links .nav-link').forEach(link => link.classList.add('hidden'));
    document.querySelectorAll(`.${user.Role.toLowerCase()}-nav-item`).forEach(link => link.classList.remove('hidden'));
    const navControls = document.getElementById('nav-controls');
    if (user.Role === 'Admin' || user.Role === 'Vendor') {
        navControls.classList.remove('hidden');
    } else {
        navControls.classList.add('hidden');
    }
    navigateTo(getDefaultViewForRole(user.Role));
}

function getDefaultViewForRole(role) { return { 'Admin': 'admin-dashboard-view', 'Vendor': 'vendor-dashboard-view', 'User': 'user-create-req-view' }[role]; }

// --- ADMIN FUNCTIONS ---
async function loadAdminDashboard() {
    const [reqs, users, bids, awarded] = await Promise.all([getData('Requirements'), getData('Users'), getData('Bids'), getData('AwardedContracts')]);
    document.getElementById('stats-active-tenders').textContent = (reqs || []).filter(r => r.Status === 'Active').length;
    document.getElementById('stats-registered-vendors').textContent = (users || []).filter(u => u.Role === 'Vendor').length;
    document.getElementById('stats-pending-bids').textContent = (bids || []).filter(b => b.BidStatus === 'Submitted').length;
    document.getElementById('stats-awarded-contracts').textContent = (awarded || []).length;
    
    const pendingReqs = (reqs || []).filter(r => r.Status === 'Pending Approval').slice(0, 5);
    const pendingReqsDiv = document.getElementById('admin-dashboard-reqs');
    pendingReqsDiv.innerHTML = pendingReqs.length > 0 ? '' : '<div class="list-group-item text-center text-muted p-4">No pending requisitions.</div>';
    pendingReqs.forEach(req => {
        const creatorName = (users || []).find(u => u.UserID === req.CreatedBy)?.FullName || 'N/A';
        pendingReqsDiv.innerHTML += `<a href="#" onclick="navigateTo('admin-pending-reqs-view')" class="list-group-item list-group-item-action clickable">${req.ProductName}<small class="d-block text-muted">by ${creatorName}</small></a>`;
    });

    const recentBids = (bids || []).filter(b => b.BidStatus === 'Submitted').slice(0, 5);
    const recentBidsDiv = document.getElementById('admin-dashboard-bids');
    recentBidsDiv.innerHTML = recentBids.length > 0 ? '' : '<div class="list-group-item text-center text-muted p-4">No recent bids.</div>';
    recentBids.forEach(bid => {
        const vendorName = (users || []).find(u => u.UserID === bid.VendorID)?.FullName || 'N/A';
        recentBidsDiv.innerHTML += `<div class="list-group-item">${vendorName}<small class="d-block text-muted">bid ₹${bid.BidAmount} on ${bid.RequirementID}</small></div>`;
    });
}
async function loadAdminRequirements() { /* ... */ }
async function loadAdminAwardedContracts() { /* ... */ }
async function loadPendingRequisitions() { /* ... */ }
async function approveRequisition(reqId) { /* ... */ }
async function loadPendingUsers() { /* ... */ }
async function approveUser(tempId) { /* ... */ }
document.getElementById('bulkUploadInput').addEventListener('change', async (event) => { /* ... */ });
async function openAdminActionModal(reqId) { /* ... */ }
async function loadBidsForAdmin(reqId) { /* ... */ }
async function updateBidStatus(bidId, newStatus) { /* ... */ }
async function awardContract(bid) { /* ... */ }
async function loadVendorsForAssignment(reqId) { /* ... */ }
document.getElementById('save-assignments-btn').addEventListener('click', async () => { /* ... */ });
async function loadAdminReports() { /* ... */ }

// --- VENDOR FUNCTIONS ---
async function loadVendorDashboard(vendorId) { /* ... */ }
async function loadVendorAwarded(vendorId) { /* ... */ }
function openBidModal(req) { /* ... */ }
document.getElementById('bid-form').addEventListener('submit', async function(e) { /* ... */ });
document.getElementById('download-history-btn').addEventListener('click', () => { /* ... */ });

// --- USER FUNCTIONS ---
function loadUserDashboard() { navigateTo('user-create-req-view'); }
async function loadUserCreateReq() { /* ... */ }
async function loadUserStatusView() { /* ... */ }
document.getElementById('requisition-form').addEventListener('submit', async function(e) { /* ... */ });

// --- UTILITY FUNCTIONS ---
function getBadgeColor(status) { /* ... */ }
function downloadCSV(sheetName, dateFiltered = false) { /* ... */ }
async function downloadAdvancedRequirementsReport() { /* ... */ }
function showToast(message, type = 'success') { /* ... */ }
function showLoader() { document.getElementById('loader-overlay').classList.remove('hidden'); }
function hideLoader() { document.getElementById('loader-overlay').classList.add('hidden'); }
    </script>
</body>
</html>
