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
    showLoader();
    if (APP_DATA[sheetName] && !forceRefresh) { hideLoader(); return APP_DATA[sheetName]; }
    try {
        const response = await fetch(`${API_URL}?sheet=${sheetName}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const result = await response.json();
        if (result.success) { APP_DATA[sheetName] = result.data; return result.data; }
        return null;
    } catch (error) { console.error(`Failed to fetch ${sheetName}:`, error); return null; }
    finally { hideLoader(); }
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
    loginError.textContent = 'Authenticating...';
    const users = await getData('Users', true);
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
        'user-create-req-view': loadUserCreateReq, 'user-status-view': loadUserStatusView,
    };
    viewLoadFunctions[viewId]?.();
}

function updateNavControls() {
    const user = JSON.parse(sessionStorage.getItem('loggedInUser'));
    if(user && (user.Role === 'Admin' || user.Role === 'Vendor')) {
        document.getElementById('nav-back').disabled = navHistory.stack.length <= 1;
        document.getElementById('nav-next').disabled = navHistory.forwardStack.length === 0;
    }
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
    document.getElementById('admin-dashboard-reqs').innerHTML = '<div class="list-group-item text-center"><div class="spinner-border spinner-border-sm"></div></div>';
    document.getElementById('admin-dashboard-bids').innerHTML = '<div class="list-group-item text-center"><div class="spinner-border spinner-border-sm"></div></div>';
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

    const recentBids = (bids || []).filter(b => b.BidStatus === 'Submitted').sort((a,b) => new Date(b.SubmittedAt) - new Date(a.SubmittedAt)).slice(0, 5);
    const recentBidsDiv = document.getElementById('admin-dashboard-bids');
    recentBidsDiv.innerHTML = recentBids.length > 0 ? '' : '<div class="list-group-item text-center text-muted p-4">No recent bids.</div>';
    recentBids.forEach(bid => {
        const vendorName = (users || []).find(u => u.UserID === bid.VendorID)?.FullName || 'N/A';
        recentBidsDiv.innerHTML += `<div class="list-group-item">${vendorName}<small class="d-block text-muted">bid ₹${bid.BidAmount} on ${bid.RequirementID}</small></div>`;
    });
}

async function loadAdminRequirements() {
    const loader = document.getElementById('admin-req-loader'), table = document.getElementById('admin-req-table'), tbody = document.getElementById('admin-req-tbody');
    loader.style.display = 'block'; table.style.display = 'none';
    const [reqs, bids, users] = await Promise.all([getData('Requirements'), getData('Bids'), getData('Users')]);
    const nonAwardedReqs = (reqs || []).filter(r => r.Status !== 'Awarded');
    tbody.innerHTML = '';
    nonAwardedReqs.forEach(req => {
        const bidsForThisReq = (bids || []).filter(b => b.RequirementID === req.RequirementID).sort((a,b) => parseFloat(a.BidAmount) - parseFloat(b.BidAmount));
        const l1Bid = bidsForThisReq[0];
        const l1Vendor = l1Bid ? (users || []).find(u => u.UserID === l1Bid.VendorID) : null;
        const row = document.createElement('tr');
        row.innerHTML = `<td>${req.RequirementID}</td><td>${req.ProductName}</td><td><span class="badge bg-${getBadgeColor(req.Status)}">${req.Status}</span></td><td>${l1Vendor ? l1Vendor.FullName : 'No Bids'}</td><td>${l1Bid ? `₹${l1Bid.BidAmount}` : '-'}</td>`;
        row.onclick = () => openAdminActionModal(req.RequirementID);
        tbody.appendChild(row);
    });
    table.style.display = 'table'; loader.style.display = 'none';
}

async function loadAdminAwardedContracts() {
    const loader = document.getElementById('admin-awarded-loader'), table = document.getElementById('admin-awarded-table'), tbody = document.getElementById('admin-awarded-tbody');
    loader.style.display = 'block'; table.style.display = 'none';
    const awarded = await getData('AwardedContracts');
    tbody.innerHTML = (awarded || []).length > 0 ? '' : '<tr><td colspan="5" class="text-center">No contracts awarded yet.</td></tr>';
    (awarded || []).forEach(c => { tbody.innerHTML += `<tr><td>${c.ContractID}</td><td>${c.ProductName}</td><td>${c.VendorName}</td><td>₹${c.AwardedAmount}</td><td>${new Date(c.AwardedDate).toLocaleDateString()}</td></tr>`; });
    table.style.display = 'table'; loader.style.display = 'none';
}

async function loadPendingRequisitions() {
    const loader = document.getElementById('admin-pending-reqs-loader'), table = document.getElementById('admin-pending-reqs-table'), tbody = document.getElementById('admin-pending-reqs-tbody');
    loader.style.display = 'block'; table.style.display = 'none';
    const [reqs, users] = await Promise.all([getData('Requirements'), getData('Users')]);
    const pendingReqs = (reqs || []).filter(r => r.Status === 'Pending Approval');
    tbody.innerHTML = pendingReqs.length > 0 ? '' : '<tr><td colspan="5" class="text-center">No pending requisitions.</td></tr>';
    pendingReqs.forEach(req => {
        const creatorName = (users || []).find(u => u.UserID === req.CreatedBy)?.FullName || 'N/A';
        tbody.innerHTML += `<tr><td>${req.RequirementID}</td><td>${req.ProductName}</td><td>${creatorName}</td><td>${new Date(req.CreatedAt).toLocaleDateString()}</td><td><button class="btn btn-sm btn-success" onclick="approveRequisition('${req.RequirementID}')">Approve</button></td></tr>`;
    });
    table.style.display = 'table'; loader.style.display = 'none';
}

async function approveRequisition(reqId) {
    const result = await postData({ action: 'updateRecord', data: { sheetName: 'Requirements', id: reqId, record: { Status: 'Active' } } });
    if(result.success) { showToast('Requisition Approved!'); await getData('Requirements', true); loadPendingRequisitions(); } else { showToast('Error!', 'error'); }
}

async function loadPendingUsers() {
    const loader = document.getElementById('admin-pending-users-loader'), table = document.getElementById('admin-pending-users-table'), tbody = document.getElementById('admin-pending-users-tbody');
    loader.style.display = 'block'; table.style.display = 'none';
    const pendingUsers = await getData('PendingUsers');
    tbody.innerHTML = (pendingUsers || []).length > 0 ? '' : '<tr><td colspan="5" class="text-center">No pending approvals.</td></tr>';
    (pendingUsers || []).forEach(user => { tbody.innerHTML += `<tr><td>${user.FullName}</td><td>${user.Email}</td><td>${user.Role}</td><td>${user.CompanyName}</td><td><button class="btn btn-sm btn-success" onclick="approveUser('${user.TempID}')">Approve</button></td></tr>`; });
    table.style.display = 'table'; loader.style.display = 'none';
}

async function approveUser(tempId) {
    const result = await postData({ action: 'approveUser', data: { TempID: tempId } });
    if (result.success) { showToast(result.message); await Promise.all([getData('PendingUsers', true), getData('Users', true)]); loadPendingUsers(); } 
    else { showToast('Approval failed: ' + result.error, 'error'); }
}

async function loadAdminReports() {
    const [bids, users, reqs] = await Promise.all([getData('Bids'), getData('Users'), getData('Requirements')]);
    const vendorAmounts = (bids || []).reduce((acc, bid) => {
        const vendorName = (users || []).find(u => u.UserID === bid.VendorID)?.FullName || bid.VendorID;
        acc[vendorName] = (acc[vendorName] || 0) + parseFloat(bid.BidAmount);
        return acc;
    }, {});
    const vCtx = document.getElementById('vendorAmountChart').getContext('2d');
    if (window.vendorAmountChart) window.vendorAmountChart.destroy();
    window.vendorAmountChart = new Chart(vCtx, { type: 'bar', data: { labels: Object.keys(vendorAmounts), datasets: [{ label: 'Total Bid Amount (₹)', data: Object.values(vendorAmounts), backgroundColor: '#28a745'}] }, options: { indexAxis: 'y' } });
    const statusCounts = (reqs || []).reduce((acc, req) => { acc[req.Status] = (acc[req.Status] || 0) + 1; return acc; }, {});
    const rCtx = document.getElementById('reqStatusChart').getContext('2d');
    if (window.reqStatusChart) window.reqStatusChart.destroy();
    window.reqStatusChart = new Chart(rCtx, { type: 'pie', data: { labels: Object.keys(statusCounts), datasets: [{ data: Object.values(statusCounts), backgroundColor: ['#0d6efd', '#ffc107', '#198754', '#6c757d', '#dc3545'] }] } });
}

document.getElementById('bulkUploadInput').addEventListener('change', async (event) => {
    const file = event.target.files[0]; if (!file) return;
    const statusDiv = document.getElementById('upload-status'); statusDiv.innerHTML = `<div class="spinner-border spinner-border-sm"></div> Reading file...`;
    const data = await file.arrayBuffer(); let requirements = [];
    if (file.name.endsWith('.csv')) { requirements = Papa.parse(new TextDecoder("utf-8").decode(data), { header: true, skipEmptyLines: true }).data; }
    else { const workbook = XLSX.read(data, { type: 'array' }); requirements = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]); }
    if (requirements.length > 0) {
        statusDiv.innerHTML = `<div class="spinner-border spinner-border-sm"></div> Uploading ${requirements.length} records...`;
        const result = await postData({ action: 'bulkUploadRequirements', data: requirements });
        statusDiv.innerHTML = result.success ? `<span class="text-success">${result.message}</span>` : `<span class="text-danger">Error: ${result.error}</span>`;
        if(result.success) { await getData('Requirements', true); loadAdminRequirements(); }
    }
});

async function openAdminActionModal(reqId) {
    adminActionModal.show();
    document.getElementById('adminActionModalTitle').textContent = `Details for ${reqId}`;
    document.getElementById('adminActionModal').dataset.reqId = reqId;
    document.getElementById('view-bids-tab').click();
    loadBidsForAdmin(reqId);
    loadVendorsForAssignment(reqId);
}

async function loadBidsForAdmin(reqId) {
    const bidsTbody = document.getElementById('bids-tbody');
    document.getElementById('bids-loader').style.display = 'block'; document.getElementById('bids-table').style.display = 'none'; bidsTbody.innerHTML = '';
    const [allBids, allUsers] = await Promise.all([getData('Bids'), getData('Users')]);
    const relevantBids = (allBids || []).filter(bid => bid.RequirementID === reqId).sort((a, b) => parseFloat(a.BidAmount) - parseFloat(b.BidAmount));
    if(relevantBids.length > 0) {
         relevantBids.forEach((bid, index) => {
            const rank = `L${index + 1}`;
            const vendorName = (allUsers || []).find(u => u.UserID === bid.VendorID)?.FullName || bid.VendorID;
            const statusOptions = ['Submitted', 'Viewed', 'Accepted', 'Rejected'].map(s => `<option value="${s}" ${s === bid.BidStatus ? 'selected' : ''}>${s}</option>`).join('');
            bidsTbody.innerHTML += `<tr><td><span class="badge bg-info">${rank}</span></td><td>${vendorName}</td><td>₹${bid.BidAmount}</td><td>${bid.Comments}</td><td><select class="form-select form-select-sm" onchange="updateBidStatus('${bid.BidID}', this.value)" ${bid.BidStatus === 'Awarded' || bid.BidStatus === 'Rejected' ? 'disabled' : ''}>${statusOptions}</select></td><td><button class="btn btn-sm btn-success" onclick='awardContract(${JSON.stringify(bid)})' ${bid.BidStatus === 'Awarded' || bid.BidStatus === 'Rejected' ? 'disabled' : ''}>Award</button></td></tr>`;
        });
    } else { bidsTbody.innerHTML = '<tr><td colspan="6" class="text-center">No bids submitted yet.</td></tr>'; }
    document.getElementById('bids-loader').style.display = 'none'; document.getElementById('bids-table').style.display = 'table';
}

async function updateBidStatus(bidId, newStatus) { 
    const result = await postData({ action: 'updateRecord', data: { sheetName: 'Bids', id: bidId, record: { BidStatus: newStatus } } });
    if(result.success) { await getData('Bids', true); showToast('Status Updated!'); }
}

async function awardContract(bid) {
    if (!confirm(`Are you sure you want to award this contract for ₹${bid.BidAmount}?`)) return;
    const [requirements, users] = await Promise.all([getData('Requirements'), getData('Users')]);
    const requirement = requirements.find(r => r.RequirementID === bid.RequirementID);
    const vendor = users.find(u => u.UserID === bid.VendorID);
    const result = await postData({ action: 'awardContract', data: { bid: bid, productName: requirement.ProductName, vendorName: vendor.FullName } });
    if(result.success) {
        showToast('Contract awarded successfully!');
        adminActionModal.hide();
        await Promise.all([getData('Requirements', true), getData('Bids', true), getData('AwardedContracts', true)]);
        navigateTo('admin-requirements-view');
    } else { showToast('Error awarding contract.', 'error'); }
}

async function loadVendorsForAssignment(reqId) {
    const vendorListDiv = document.getElementById('vendor-list');
    document.getElementById('vendors-loader').style.display = 'block'; vendorListDiv.innerHTML = '';
    const [assignments, users] = await Promise.all([getData('RequirementAssignments'), getData('Users')]);
    const vendors = (users || []).filter(u => u.Role === 'Vendor');
    const assignedVendorIds = (assignments || []).filter(a => a.RequirementID === reqId).map(a => a.VendorID);
    vendorListDiv.innerHTML = vendors.map(v => `<div class="form-check"><input class="form-check-input" type="checkbox" value="${v.UserID}" id="v-${v.UserID}" ${assignedVendorIds.includes(v.UserID) ? 'checked' : ''}><label class="form-check-label" for="v-${v.UserID}">${v.FullName}</label></div>`).join('');
    document.getElementById('vendors-loader').style.display = 'none';
}
        
document.getElementById('save-assignments-btn').addEventListener('click', async () => {
    const reqId = document.getElementById('adminActionModal').dataset.reqId;
    const selectedVendorIds = Array.from(document.querySelectorAll('#vendor-list input:checked')).map(input => input.value);
    const result = await postData({ action: 'assignVendors', data: { RequirementID: reqId, vendorIds: selectedVendorIds } });
    if (result.success) { showToast('Assignments saved!'); } else { showToast('Error saving assignments.', 'error'); }
});

// --- VENDOR FUNCTIONS ---
async function loadVendorDashboard(vendorId) {
     const loader = document.getElementById('vendor-loader'), table = document.getElementById('vendor-req-table'), tbody = document.getElementById('vendor-req-tbody');
     loader.style.display = 'block'; table.style.display = 'none';
     const [allReqs, allAssignments, allBids] = await Promise.all([getData('Requirements'), getData('RequirementAssignments'), getData('Bids')]);
    const myBids = (allBids || []).filter(b => b.VendorID === vendorId);
    const assignedReqIds = (allAssignments || []).filter(a => a.VendorID === vendorId).map(a => a.RequirementID);
    const assignedReqs = (allReqs || []).filter(r => assignedReqIds.includes(r.RequirementID));
    document.getElementById('vendor-stats-assigned').textContent = assignedReqs.filter(r => r.Status === 'Active').length;
    document.getElementById('vendor-stats-submitted').textContent = myBids.length;
    document.getElementById('vendor-stats-won').textContent = myBids.filter(b => b.BidStatus === 'Awarded').length;
    tbody.innerHTML = '';
    assignedReqs.forEach(req => {
        const myBidsForThisReq = myBids.filter(b => b.RequirementID === req.RequirementID);
        const allBidsForThisReq = (allBids || []).filter(b => b.RequirementID === req.RequirementID).sort((a,b) => parseFloat(a.BidAmount) - parseFloat(b.BidAmount));
        const myLatestBid = myBidsForThisReq.sort((a, b) => new Date(b.SubmittedAt) - new Date(a.SubmittedAt))[0];
        const myRankIndex = myLatestBid ? allBidsForThisReq.findIndex(b => b.BidID === myLatestBid.BidID) : -1;
        const myRank = myRankIndex !== -1 ? `L${myRankIndex + 1}` : '-';
        let bidStatus = myLatestBid ? `<span class="badge bg-${getBadgeColor(myLatestBid.BidStatus)}">${myLatestBid.BidStatus}</span>` : 'Not Submitted';
        let l1BidInfo = '-';
        if (req.Status === 'Awarded') {
            const l1Rate = allBidsForThisReq[0] ? `₹${allBidsForThisReq[0].BidAmount}` : 'N/A';
            if(!myBidsForThisReq.some(b => b.BidStatus === 'Awarded')) { bidStatus = `<span class="badge bg-danger">Closed</span>`; }
            l1BidInfo = l1Rate;
        }
        const imageUrlCell = req.ImageURL ? `<a href="${req.ImageURL}" target="_blank"><i class="fas fa-image"></i></a>` : '-';
        const row = document.createElement('tr');
        row.innerHTML = `<td>${req.RequirementID}</td><td>${req.ProductName}</td><td>${imageUrlCell}</td><td>${req.Status}</td><td>${bidStatus}</td><td>${l1BidInfo}</td>`;
        if(req.Status === 'Active') row.onclick = () => openBidModal(req);
        tbody.appendChild(row);
    });
    table.style.display = 'table'; loader.style.display = 'none';
}

async function loadVendorAwarded(vendorId) {
    const loader = document.getElementById('vendor-awarded-loader'), table = document.getElementById('vendor-awarded-table'), tbody = document.getElementById('vendor-awarded-tbody');
    loader.style.display = 'block'; table.style.display = 'none';
    const awarded = (await getData('AwardedContracts') || []).filter(c => c.VendorID === vendorId);
    tbody.innerHTML = awarded.length > 0 ? '' : '<tr><td colspan="4" class="text-center">No contracts awarded to you yet.</td></tr>';
    awarded.forEach(c => { tbody.innerHTML += `<tr><td>${c.ContractID}</td><td>${c.ProductName}</td><td>₹${c.AwardedAmount}</td><td>${new Date(c.AwardedDate).toLocaleDateString()}</td></tr>`; });
    table.style.display = 'table'; loader.style.display = 'none';
}

function openBidModal(req) {
    const currentUser = JSON.parse(sessionStorage.getItem('loggedInUser'));
    document.getElementById('bidModalTitle').textContent = `Bid for: ${req.ProductName}`;
    document.getElementById('bid-req-id').value = req.RequirementID;
    const form = document.getElementById('bid-form'); form.reset();
    const myBidsForThisReq = (APP_DATA.bids || []).filter(b => b.RequirementID === req.RequirementID && b.VendorID === currentUser.UserID);
    const submitButton = form.querySelector('button[type="submit"]');
    if (myBidsForThisReq.length >= 3) {
        submitButton.disabled = true; submitButton.textContent = 'Maximum 3 Bids Reached';
        form.querySelectorAll('input, textarea').forEach(el => el.disabled = true);
    } else {
        submitButton.disabled = false; submitButton.textContent = `Submit Bid (${myBidsForThisReq.length + 1} of 3)`;
        form.querySelectorAll('input, textarea').forEach(el => el.disabled = false);
    }
    bidModal.show();
}

document.getElementById('bid-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const user = JSON.parse(sessionStorage.getItem('loggedInUser'));
    const result = await postData({ action: 'createBid', data: { RequirementID: document.getElementById('bid-req-id').value, VendorID: user.UserID, BidAmount: document.getElementById('bidAmount').value, Comments: document.getElementById('bidComments').value, BidStatus: 'Submitted' } });
    if (result.success) { showToast('Bid submitted!'); bidModal.hide(); await Promise.all([getData('Bids', true), getData('BidHistory', true)]); loadVendorDashboard(user.UserID); } 
    else { showToast('Error: ' + result.error, 'error'); }
});

document.getElementById('download-history-btn').addEventListener('click', () => {
    const user = JSON.parse(sessionStorage.getItem('loggedInUser'));
    const startDate = document.getElementById('startDate').value; const endDate = document.getElementById('endDate').value;
    let downloadUrl = `${API_URL}?format=csv&sheet=BidHistory&vendorId=${user.UserID}`;
    if (startDate) downloadUrl += `&startDate=${startDate}`; if (endDate) downloadUrl += `&endDate=${endDate}`;
    window.open(downloadUrl, '_blank');
});

// --- USER FUNCTIONS ---
async function loadUserDashboard() { navigateTo('user-create-req-view'); }
async function loadUserCreateReq() {
    const checklistDiv = document.getElementById('req-vendor-checklist');
    checklistDiv.innerHTML = '<p class="text-muted">Loading vendors...</p>';
    const users = await getData('Users');
    if (users) {
        const vendors = users.filter(u => u.Role === 'Vendor');
        if (vendors.length > 0) {
            const selectAllHTML = `<div class="form-check fw-bold border-bottom pb-2 mb-2"><input class="form-check-input" type="checkbox" id="vendor-select-all"><label class="form-check-label" for="vendor-select-all">Select All Vendors</label></div>`;
            const vendorListHTML = vendors.map(v => `<div class="form-check"><input class="form-check-input vendor-checkbox" type="checkbox" value="${v.UserID}" id="vendor-${v.UserID}"><label class="form-check-label" for="vendor-${v.UserID}">${v.FullName}</label></div>`).join('');
            checklistDiv.innerHTML = selectAllHTML + vendorListHTML;
            document.getElementById('vendor-select-all').addEventListener('change', (e) => { document.querySelectorAll('.vendor-checkbox').forEach(checkbox => checkbox.checked = e.target.checked); });
        } else { checklistDiv.innerHTML = '<p class="text-danger">No registered vendors found.</p>'; }
    }
}
async function loadUserStatusView() {
    const user = JSON.parse(sessionStorage.getItem('loggedInUser'));
    const listDiv = document.getElementById('user-req-status-list');
    document.getElementById('user-req-status-loader').style.display = 'block'; listDiv.innerHTML = '';
    const [myReqs, awarded] = await Promise.all([getData('Requirements'), getData('AwardedContracts')]);
    const filteredReqs = (myReqs || []).filter(r => r.CreatedBy === user.UserID);
    if(filteredReqs.length > 0) {
        filteredReqs.forEach(req => {
            let awardedInfo = '';
            if (req.Status === 'Awarded') {
                const contract = (awarded || []).find(c => c.RequirementID === req.RequirementID);
                if(contract) awardedInfo = `<small class="d-block text-muted">Awarded to: ${contract.VendorName} for ₹${contract.AwardedAmount}</small>`;
            }
            listDiv.innerHTML += `<div class="list-group-item"><div class="d-flex w-100 justify-content-between"><h6 class="mb-1">${req.ProductName}</h6><span class="badge bg-${getBadgeColor(req.Status)}">${req.Status}</span></div>${awardedInfo}</div>`;
        });
    } else { listDiv.innerHTML = '<div class="list-group-item">You have not created any requisitions yet.</div>'; }
    document.getElementById('user-req-status-loader').style.display = 'none';
}
document.getElementById('requisition-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const submitButton = this.querySelector('button[type="submit"]');
    submitButton.disabled = true; submitButton.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Submitting...`;
    const imageFile = document.getElementById('req-image').files[0]; let imageUrl = '';
    if (imageFile) {
        submitButton.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Uploading Image...`;
        const reader = new FileReader(); reader.readAsDataURL(imageFile);
        const base64File = await new Promise((resolve) => { reader.onload = () => resolve(reader.result); });
        const uploadResult = await postData({ action: 'uploadImage', data: { file: base64File, fileName: imageFile.name, mimeType: imageFile.type } });
        if (uploadResult && uploadResult.success) { imageUrl = uploadResult.fileUrl; } 
        else { showToast('Image upload failed: ' + (uploadResult ? uploadResult.error : 'Network error'), 'error'); submitButton.disabled = false; submitButton.textContent = 'Submit for Approval'; return; }
    }
    submitButton.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Saving Requisition...`;
    const currentUser = JSON.parse(sessionStorage.getItem('loggedInUser'));
    const selectedVendorIds = Array.from(document.querySelectorAll('#req-vendor-checklist input:checked')).map(input => input.value);
    if (selectedVendorIds.length === 0) { showToast('Please select at least one vendor.', 'error'); submitButton.disabled = false; submitButton.textContent = 'Submit for Approval'; return; }
    const result = await postData({ action: 'createRequisition', data: { ProductName: document.getElementById('req-product-name').value, Quantity: document.getElementById('req-quantity').value, Description: document.getElementById('req-description').value, ImageURL: imageUrl, CreatedBy: currentUser.UserID, vendorIds: selectedVendorIds } });
    if (result.success) {
        showToast(result.message); this.reset();
        await getData('Requirements', true); loadUserStatusView();
    } else { showToast('Error: ' + result.error, 'error'); }
    submitButton.disabled = false; submitButton.textContent = 'Submit for Approval';
});

// --- UTILITY FUNCTIONS ---
function getBadgeColor(status) {
    const colors = { 'Awarded': 'primary', 'Accepted': 'success', 'Rejected': 'danger', 'Viewed': 'info', 'Active': 'success', 'Pending Approval': 'warning' };
    return colors[status] || 'secondary';
}
function downloadCSV(sheetName) { window.open(`${API_URL}?sheet=${sheetName}&format=csv`, '_blank'); }
async function downloadAdvancedRequirementsReport() {
    showToast('Generating advanced report...');
    const [reqs, bids, users] = await Promise.all([getData('Requirements'), getData('Bids'), getData('Users')]);
    const reportData = [];
    (reqs || []).forEach(req => {
        const bidsForReq = (bids || []).filter(b => b.RequirementID === req.RequirementID).sort((a,b) => parseFloat(a.BidAmount) - parseFloat(b.BidAmount));
        if (bidsForReq.length > 0) {
            bidsForReq.forEach((bid, index) => {
                const vendor = (users || []).find(u => u.UserID === bid.VendorID);
                reportData.push({ RequirementID: req.RequirementID, ProductName: req.ProductName, RequirementStatus: req.Status, BidRank: `L${index + 1}`, VendorName: vendor ? vendor.FullName : 'N/A', BidAmount_INR: bid.BidAmount, BidStatus: bid.BidStatus, BidDate: new Date(bid.SubmittedAt).toLocaleString() });
            });
        } else {
            reportData.push({ RequirementID: req.RequirementID, ProductName: req.ProductName, RequirementStatus: req.Status, BidRank: '-', VendorName: 'No Bids', BidAmount_INR: '-', BidStatus: '-', BidDate: '-' });
        }
    });
    const csv = Papa.unparse(reportData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "advanced_requirements_report.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
function showToast(message, type = 'success') {
    const toastContainer = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 5000);
}
function showLoader() { document.getElementById('loader-overlay').classList.remove('hidden'); }
function hideLoader() { document.getElementById('loader-overlay').classList.add('hidden'); }
    </script>
</body>
</html>
