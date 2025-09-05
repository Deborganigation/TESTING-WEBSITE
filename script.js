// ❗ IMPORTANT: Yahan apna Google Apps Script ka URL daalein
const API_URL = 'https://script.google.com/macros/s/AKfycbwWoJizLIiRDoJbhu891-KWdUBfJmCVL21R3ujktl67t0LZ0MN31xxUJ79nBBJKnJmnkw/exec';

// --- GLOBAL STATE & DOM REFERENCES ---
let APP_DATA = {};
const loginWrapper = document.getElementById('login-wrapper'),
      appContainer = document.getElementById('app-container'),
      loginForm = document.getElementById('login-form'),
      loginError = document.getElementById('login-error'),
      mainView = document.getElementById('main-view'),
      headerTitle = document.getElementById('header-title'),
      navLinksContainer = document.getElementById('nav-links'),
      userNameSidebar = document.getElementById('user-name-sidebar');
let formModal;

// --- CORE APP LOGIC ---
window.onload = () => {
    try {
        formModal = new bootstrap.Modal(document.getElementById('formModal'));
    } catch (e) { console.error("Error initializing modals:", e); }
    
    // For this simplified version, we log out on refresh.
    // A more complex app would use sessionStorage.
    handleLogout(); 
};

// --- DATA FETCHING & POSTING ---
async function fetchData(action) {
    showLoader();
    try {
        const response = await fetch(`${API_URL}?action=${action}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const result = await response.json();
        APP_DATA[action.replace('get','').toLowerCase()] = result;
        return result;
    } catch (error) {
        console.error(`Failed to fetch ${action}:`, error);
        showToast(`Error fetching data: ${error.message}`, 'error');
        return null;
    } finally {
        hideLoader();
    }
}

async function postData(payload) {
    showLoader();
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: {'Content-Type': 'text/plain;charset=utf-8'}
        });
        const result = await response.json();
        if(result.result !== 'success') throw new Error(result.error || 'Unknown error');
        return result;
    } catch (error) {
        console.error('POST Error:', error);
        showToast(`Submission failed: ${error.message}`, 'error');
        return { result: 'error', error: error.message };
    } finally {
        hideLoader();
    }
}

// --- AUTHENTICATION ---
loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    loginError.textContent = '';
    // This is a simplified login. In a real app, this would be a secure check.
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    // For this example, we'll assume a generic admin login and not check sheets.
    // In your final version, you would fetch 'getUsers' and check against the list.
    if(email && password){
        sessionStorage.setItem('loggedInUser', email);
        setupUIForRole('Admin'); // Assuming only Admin role for now
    } else {
        loginError.textContent = 'Please enter email and password.';
    }
});

function handleLogout() {
    sessionStorage.removeItem('loggedInUser');
    loginWrapper.classList.remove('hidden');
    appContainer.classList.add('hidden');
    document.getElementById('email').value = '';
    document.getElementById('password').value = '';
}

// --- NAVIGATION & UI SETUP ---
navLinksContainer.addEventListener('click', (e) => {
    const navLink = e.target.closest('.nav-link');
    if (navLink) {
        e.preventDefault();
        navigateTo(navLink.dataset.view);
    }
});

function navigateTo(viewId) {
    const navLinkElement = document.querySelector(`.nav-link[data-view="${viewId}"]`);
    if(navLinkElement) {
        navLinksContainer.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
        navLinkElement.classList.add('active');
        headerTitle.textContent = navLinkElement.textContent.trim();
    }
    
    const viewLoadFunctions = {
        'admin-dashboard-view': loadAdminDashboard,
        'admin-tenders-view': loadAdminTenders,
        'admin-vendors-view': loadAdminVendors,
        'admin-quotations-view': loadAdminQuotations
    };
    viewLoadFunctions[viewId]?.();
}

function setupUIForRole(role) {
    loginWrapper.classList.add('hidden');
    appContainer.classList.remove('hidden');
    userNameSidebar.textContent = sessionStorage.getItem('loggedInUser');
    navigateTo('admin-dashboard-view');
}

// --- VIEW LOADING FUNCTIONS ---
async function loadAdminDashboard() {
    mainView.innerHTML = `
        <div class="row g-4">
            <div class="col-md-4"><div class="stat-card bg-primary">...</div></div>
            <div class="col-md-4"><div class="stat-card bg-success">...</div></div>
            <div class="col-md-4"><div class="stat-card bg-warning">...</div></div>
        </div>
        <p class="mt-4">Welcome to the Dashboard. Select a view from the sidebar.</p>
    `;
    // Add logic here to update stat card numbers
}

async function loadAdminTenders() {
    mainView.innerHTML = `
        <div class="card shadow-sm border-0">
            <div class="card-header bg-white d-flex justify-content-between align-items-center">
                <h5 class="mb-0">Tenders</h5>
                <button class="btn btn-sm btn-primary" onclick="openForm('Tender')"><i class="fas fa-plus me-2"></i>Add Tender</button>
            </div>
            <div class="card-body">
                <div id="loader" class="text-center p-5"><div class="spinner-border"></div></div>
                <div id="table-container" class="table-responsive"></div>
            </div>
        </div>`;
    
    const tenders = await fetchData('getTenders');
    let tableHTML = `<table class="table table-hover">
        <thead class="table-light"><tr><th>ID</th><th>Title</th><th>Deadline</th><th>Status</th></tr></thead>
        <tbody>`;
    if(tenders && tenders.length > 0) {
        tenders.forEach(t => {
            tableHTML += `<tr><td>${t.id}</td><td>${t.title}</td><td>${t.deadline}</td><td><span class="badge bg-success">${t.status}</span></td></tr>`;
        });
    } else {
        tableHTML += `<tr><td colspan="4" class="text-center">No tenders found.</td></tr>`;
    }
    tableHTML += `</tbody></table>`;
    document.getElementById('loader').classList.add('hidden');
    document.getElementById('table-container').innerHTML = tableHTML;
}

async function loadAdminVendors() { /* Similar to loadAdminTenders */ }
async function loadAdminQuotations() { /* Similar to loadAdminTenders */ }


// --- FORM & MODAL LOGIC ---
function openForm(type) {
    let formHTML = '';
    document.getElementById('formModalTitle').textContent = `Add New ${type}`;
    
    if (type === 'Tender') {
        formHTML = `
            <form id="add-form">
                <input type="hidden" name="action" value="addTender">
                <div class="mb-3"><label class="form-label">Tender ID</label><input type="text" name="id" class="form-control" required></div>
                <div class="mb-3"><label class="form-label">Title</label><input type="text" name="title" class="form-control" required></div>
                <div class="mb-3"><label class="form-label">Description</label><textarea name="description" class="form-control"></textarea></div>
                <div class="mb-3"><label class="form-label">Deadline</label><input type="date" name="deadline" class="form-control" required></div>
                <input type="hidden" name="status" value="active">
                <input type="hidden" name="createdBy" value="${sessionStorage.getItem('loggedInUser')}">
                <button type="submit" class="btn btn-primary w-100">Save Tender</button>
            </form>`;
    } else if (type === 'Vendor') {
         formHTML = `...`; // Form for adding a vendor
    }
    document.getElementById('formModalBody').innerHTML = formHTML;

    document.getElementById('add-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const payload = Object.fromEntries(formData.entries());
        
        const result = await postData(payload);
        if(result.result === 'success') {
            formModal.hide();
            showToast(`${type} added successfully!`);
            // Refresh the current view
            const currentView = document.querySelector('#nav-links .active').dataset.view;
            navigateTo(currentView);
        }
    });

    formModal.show();
}

// --- UTILITY FUNCTIONS ---
function showToast(message, type = 'success') {
    const toastContainer = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 4000);
}
function showLoader() { document.getElementById('loader-overlay').classList.remove('hidden'); }
function hideLoader() { document.getElementById('loader-overlay').classList.add('hidden'); }
