document.addEventListener('DOMContentLoaded', function () {
    // Check if user is logged in and is admin
    const token = localStorage.getItem('authToken');
    if (!token) {
        window.location.href = '/';
        return;
    }
    // Verify admin access before proceeding
    verifyAdminAccess();

    // Function to verify admin access
    async function verifyAdminAccess() {
        try {
            const response = await fetch('/api/auth/verify', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();

                if (!data.user.is_admin) {
                    // Not an admin, redirect to user dashboard
                    window.location.href = '/success';
                    return;
                }

                // User is admin, continue loading dashboard
                adminName.textContent = data.user.username || 'Admin';

                // Initialize the dashboard
                initDashboard();
            } else {
                // Invalid token, redirect to login
                localStorage.removeItem('authToken');
                window.location.href = '/';
            }
        } catch (error) {
            console.error('Error verifying admin access:', error);
            localStorage.removeItem('authToken');
            window.location.href = '/';
        }
    }
    // API endpoints
    const API = {
        VERIFY: '/api/auth/verify',
        USERS: '/api/admin/users',
        USER_DETAILS: '/api/admin/users',
        FILES: '/api/admin/files',
        STORAGE: '/api/admin/storage',
        LOGOUT: '/api/auth/logout',
        DASHBOARD: '/api/admin/dashboard'
    };

    // Elements
    const adminName = document.getElementById('adminName');
    const totalUsers = document.getElementById('totalUsers');
    const totalFiles = document.getElementById('totalFiles');
    const totalStorage = document.getElementById('totalStorage');
    const premiumUsers = document.getElementById('premiumUsers');
    const usersTableBody = document.getElementById('usersTableBody');
    const filesTableBody = document.getElementById('filesTableBody');
    const usersPagination = document.getElementById('usersPagination');
    const filesPagination = document.getElementById('filesPagination');
    const logoutBtn = document.getElementById('logoutBtn');

    // Search inputs
    const userSearchInput = document.getElementById('userSearchInput');
    const userSearchBtn = document.getElementById('userSearchBtn');
    const fileSearchInput = document.getElementById('fileSearchInput');
    const fileSearchBtn = document.getElementById('fileSearchBtn');

    // Modals
    const userDetailsModal = document.getElementById('userDetailsModal');
    const closeButtons = document.querySelectorAll('.close-modal');

    // User details elements
    const userDetailsAvatar = document.getElementById('userDetailsAvatar');
    const userDetailsName = document.getElementById('userDetailsName');
    const userDetailsEmail = document.getElementById('userDetailsEmail');
    const userDetailsMemberSince = document.getElementById('userDetailsMemberSince');
    const userDetailsLastLogin = document.getElementById('userDetailsLastLogin');
    const userDetailsIP = document.getElementById('userDetailsIP');
    const userDetailsAccountType = document.getElementById('userDetailsAccountType');
    const userDetailsStorage = document.getElementById('userDetailsStorage');
    const userDetailsFiles = document.getElementById('userDetailsFiles');
    const userDetailsNotes = document.getElementById('userDetailsNotes');
    const userDetailsAccountTypeSelect = document.getElementById('userDetailsAccountTypeSelect');
    const userDetailsStatusSelect = document.getElementById('userDetailsStatusSelect');
    const userDetailsId = document.getElementById('userDetailsId');
    const deleteUserBtn = document.getElementById('deleteUserBtn');
    const saveUserChangesBtn = document.getElementById('saveUserChangesBtn');

    // Format file size
    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        else if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
        else return (bytes / 1073741824).toFixed(2) + ' GB';
    }

    // Format date
    function formatDate(dateString) {
        const date = new Date(dateString);
        const options = { year: 'numeric', month: 'short', day: 'numeric' };
        return date.toLocaleDateString('en-US', options);
    }

    // Format date with time
    function formatDateTime(dateString) {
        const date = new Date(dateString);
        const options = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
        return date.toLocaleDateString('en-US', options);
    }

    // Get initials from name
    function getInitials(name) {
        return name.split(' ').map(n => n[0]).join('').toUpperCase();
    }

    // Get file icon based on extension
    function getFileIcon(extension) {
        const iconMap = {
            'pdf': 'fas fa-file-pdf file-icon file-pdf',
            'doc': 'fas fa-file-word file-icon file-doc',
            'docx': 'fas fa-file-word file-icon file-doc',
            'xls': 'fas fa-file-excel file-icon file-xls',
            'xlsx': 'fas fa-file-excel file-icon file-xls',
            'ppt': 'fas fa-file-powerpoint file-icon file-ppt',
            'pptx': 'fas fa-file-powerpoint file-icon file-ppt',
            'jpg': 'fas fa-file-image file-icon file-img',
            'jpeg': 'fas fa-file-image file-icon file-img',
            'png': 'fas fa-file-image file-icon file-img',
            'gif': 'fas fa-file-image file-icon file-img',
            'txt': 'fas fa-file-alt file-icon file-other',
            'zip': 'fas fa-file-archive file-icon file-zip',
            'rar': 'fas fa-file-archive file-icon file-zip'
        };

        return iconMap[extension.toLowerCase()] || 'fas fa-file file-icon file-other';
    }

    // Load dashboard stats
    async function loadDashboardStats() {
        try {
            const token = localStorage.getItem('authToken');

            const response = await fetch(API.DASHBOARD, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                console.log('Dashboard stats loaded:', data);

                // Update the dashboard statistics
                totalUsers.textContent = data.total_users || 0;
                totalFiles.textContent = data.total_files || 0;
                totalStorage.textContent = formatFileSize(data.total_storage_used || 0);
                premiumUsers.textContent = data.premium_users || 0;
            } else {
                console.error('Failed to load dashboard stats:', response.status);
                const errorData = await response.json().catch(() => ({}));
                console.error('Error details:', errorData);
            }
        } catch (error) {
            console.error('Error loading dashboard stats:', error);
        }
    }

    // Load users list
    async function loadUsers(page = 1, search = '') {
        try {
            let url = `${API.USERS}?page=${page}`;
            if (search) {
                url += `&search=${encodeURIComponent(search)}`;
            }

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (response.ok) {
                const data = await response.json();
                renderUsers(data.users);
                renderPagination(usersPagination, data.total_pages, page, loadUsers, search);
            }
        } catch (error) {
            console.error('Error loading users:', error);
            showErrorNotification('Error loading users');
        }
    }

    // Render users to table
    function renderUsers(users) {
        usersTableBody.innerHTML = '';

        if (users.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `<td colspan="6" style="text-align: center;">No users found</td>`;
            usersTableBody.appendChild(row);
            return;
        }

        users.forEach(user => {
            const row = document.createElement('tr');
            const initials = getInitials(user.username);
            const planBadge = user.plan_id > 1 ?
                '<span class="premium-badge">Premium</span>' :
                '<span class="free-badge">Free</span>';

            row.innerHTML = `
                <td>
                    <div class="user-info">
                        <div class="user-avatar">${initials}</div>
                        <div>${user.username}</div>
                    </div>
                </td>
                <td>${user.email}</td>
                <td>${planBadge}</td>
                <td>
                    <div>${formatFileSize(user.storage_used)} / ${formatFileSize(user.storage_limit)}</div>
                    <div class="storage-bar">
                        <div class="storage-progress" style="width: ${Math.min((user.storage_used / user.storage_limit) * 100, 100)}%;"></div>
                    </div>
                </td>
                <td>${user.file_count || 0}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-sm btn-warning view-user-btn" data-userid="${user.user_id}">View</button>
                        <button class="btn btn-sm btn-danger" data-userid="${user.user_id}">Lock</button>
                    </div>
                </td>
            `;

            usersTableBody.appendChild(row);
        });

        // Add view user event listeners
        document.querySelectorAll('.view-user-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                const userId = this.getAttribute('data-userid');
                loadUserDetails(userId);
            });
        });
    }

    // Load user details
    async function loadUserDetails(userId) {
        try {
            const response = await fetch(`${API.USER_DETAILS}/${userId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const user = await response.json();

                userDetailsId.value = user.user_id;
                userDetailsAvatar.textContent = getInitials(user.username);
                userDetailsName.textContent = user.username;
                userDetailsEmail.textContent = user.email;
                userDetailsMemberSince.textContent = formatDate(user.created_at);
                userDetailsLastLogin.textContent = user.last_login ? formatDateTime(user.last_login) : 'Never';
                userDetailsIP.textContent = user.ip_address || 'Unknown';

                userDetailsAccountType.innerHTML = user.plan_id > 1 ?
                    '<span class="premium-badge">Premium</span>' :
                    '<span class="free-badge">Free</span>';

                userDetailsStorage.textContent = `${formatFileSize(user.storage_used)} / ${formatFileSize(user.storage_limit)}`;
                userDetailsFiles.textContent = user.file_count || 0;
                userDetailsNotes.value = user.notes || '';

                userDetailsAccountTypeSelect.value = user.plan_id;
                userDetailsStatusSelect.value = user.status || 'active';

                userDetailsModal.style.display = 'flex';
            } else {
                showErrorNotification('Error loading user details');
            }
        } catch (error) {
            console.error('Error loading user details:', error);
            showErrorNotification('Error loading user details');
        }
    }
    // Save user changes
    async function saveUserChanges() {
        try {
            const userId = userDetailsId.value;
            const planId = userDetailsAccountTypeSelect.value;
            const status = userDetailsStatusSelect.value;
            const notes = userDetailsNotes.value;

            const response = await fetch(`${API.USER_DETAILS}/${userId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    plan_id: planId,
                    status: status,
                    notes: notes
                })
            });

            if (response.ok) {
                showSuccessNotification('User updated successfully');
                userDetailsModal.style.display = 'none';
                loadUsers();  // Reload users table
                loadDashboardStats();  // Reload dashboard stats
            } else {
                showErrorNotification('Error updating user');
            }
        } catch (error) {
            console.error('Error saving user changes:', error);
            showErrorNotification('Error saving changes');
        }
    }

    // Delete user
    async function deleteUser(userId) {
        try {
            const response = await fetch(`${API.USER_DETAILS}/${userId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                showSuccessNotification('User deleted successfully');
                userDetailsModal.style.display = 'none';
                loadUsers();  // Reload users table
                loadDashboardStats();  // Reload dashboard stats
            } else {
                showErrorNotification('Error deleting user');
            }
        } catch (error) {
            console.error('Error deleting user:', error);
            showErrorNotification('Error deleting user');
        }
    }

    // Load files list
    async function loadFiles(page = 1, search = '') {
        try {
            let url = `${API.FILES}?page=${page}`;
            if (search) {
                url += `&search=${encodeURIComponent(search)}`;
            }

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                renderFiles(data.files);
                renderPagination(filesPagination, data.total_pages, page, loadFiles, search);
            }
        } catch (error) {
            console.error('Error loading files:', error);
            showErrorNotification('Error loading files');
        }
    }

    // Render files to table
    function renderFiles(files) {
        filesTableBody.innerHTML = '';

        if (files.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `<td colspan="6" style="text-align: center;">No files found</td>`;
            filesTableBody.appendChild(row);
            return;
        }

        files.forEach(file => {
            const row = document.createElement('tr');
            const extension = file.extension || file.file_name.split('.').pop().toLowerCase();
            const fileIcon = getFileIcon(extension);

            row.innerHTML = `
                <td>
                    <div class="user-info">
                        <i class="${fileIcon}"></i>
                        <div>${file.file_name}</div>
                    </div>
                </td>
                <td>${file.username}</td>
                <td>${formatFileSize(file.file_size)}</td>
                <td>${formatDate(file.upload_date)}</td>
                <td>${file.type_name || `${extension.toUpperCase()} File`}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-sm btn-success download-file-btn" data-fileid="${file.file_id}">Download</button>
                        <button class="btn btn-sm btn-danger delete-file-btn" data-fileid="${file.file_id}">Delete</button>
                    </div>
                </td>
            `;

            filesTableBody.appendChild(row);
        });

        // Add download and delete file event listeners
        document.querySelectorAll('.download-file-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                const fileId = this.getAttribute('data-fileid');
                downloadFile(fileId);
            });
        });

        document.querySelectorAll('.delete-file-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                const fileId = this.getAttribute('data-fileid');
                if (confirm('Are you sure you want to delete this file?')) {
                    deleteFile(fileId);
                }
            });
        });
    }

    // Download file
    function downloadFile(fileId) {
        const downloadUrl = `/api/admin/files/${fileId}/download`;

        // Create a temporary link element and trigger the download
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.setAttribute('target', '_blank');

        // Add authorization header for the download
        fetch(downloadUrl, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
            .then(response => {
                if (response.ok) {
                    return response.blob();
                }
                throw new Error('Download failed');
            })
            .then(blob => {
                const url = window.URL.createObjectURL(blob);
                link.href = url;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                showSuccessNotification('File download started');
            })
            .catch(error => {
                console.error('Error downloading file:', error);
                showErrorNotification('Error downloading file');
            });
    }

    // Delete file
    async function deleteFile(fileId) {
        try {
            const response = await fetch(`${API.FILES}/${fileId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                showSuccessNotification('File deleted successfully');
                loadFiles();  // Reload files table
                loadDashboardStats();  // Reload dashboard stats
            } else {
                showErrorNotification('Error deleting file');
            }
        } catch (error) {
            console.error('Error deleting file:', error);
            showErrorNotification('Error deleting file');
        }
    }

    function renderPagination(container, totalPages, currentPage, loadFunction, search = '') {
        container.innerHTML = '';

        if (totalPages <= 1) {
            return;
        }

        // Previous page button
        const prevBtn = document.createElement('button');
        prevBtn.className = 'page-item';
        prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
        prevBtn.disabled = currentPage === 1;
        prevBtn.addEventListener('click', () => {
            if (currentPage > 1) {
                loadFunction(currentPage - 1, search);
            }
        });
        container.appendChild(prevBtn);

        // Page buttons
        let startPage = Math.max(1, currentPage - 2);
        let endPage = Math.min(totalPages, startPage + 4);

        if (endPage - startPage < 4) {
            startPage = Math.max(1, endPage - 4);
        }

        for (let i = startPage; i <= endPage; i++) {
            const pageBtn = document.createElement('button');
            pageBtn.className = 'page-item';
            if (i === currentPage) {
                pageBtn.classList.add('active');
            }
            pageBtn.textContent = i;
            pageBtn.addEventListener('click', () => {
                loadFunction(i, search);
            });
            container.appendChild(pageBtn);
        }

        // Next page button
        const nextBtn = document.createElement('button');
        nextBtn.className = 'page-item';
        nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
        nextBtn.disabled = currentPage === totalPages;
        nextBtn.addEventListener('click', () => {
            if (currentPage < totalPages) {
                loadFunction(currentPage + 1, search);
            }
        });
        container.appendChild(nextBtn);
    }

    // Logout user
    async function logoutUser() {
        try {
            const response = await fetch(API.LOGOUT, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            // Remove token regardless of response
            localStorage.removeItem('authToken');
            window.location.href = '/';
        } catch (error) {
            console.error('Error logging out:', error);
            localStorage.removeItem('authToken');
            window.location.href = '/';
        }
    }

    // Tab Switching
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active class from all tabs and tab contents
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            // Add active class to clicked tab
            tab.classList.add('active');

            // Show corresponding tab content
            const tabId = tab.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');
        });
    });

    // Close Modals
    closeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.modal').forEach(modal => {
                modal.style.display = 'none';
            });
        });
    });

    // Close modals when clicking outside
    window.addEventListener('click', (event) => {
        if (event.target.classList.contains('modal')) {
            document.querySelectorAll('.modal').forEach(modal => {
                if (modal === event.target) {
                    modal.style.display = 'none';
                }
            });
        }
    });

    // Event Listeners

    // User search
    userSearchBtn.addEventListener('click', () => {
        const query = userSearchInput.value.trim();
        loadUsers(1, query);
    });

    userSearchInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            userSearchBtn.click();
        }
    });

    // File search
    fileSearchBtn.addEventListener('click', () => {
        const query = fileSearchInput.value.trim();
        loadFiles(1, query);
    });

    fileSearchInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            fileSearchBtn.click();
        }
    });


    // Save user changes
    saveUserChangesBtn.addEventListener('click', () => {
        saveUserChanges();
    });

    // Delete user
    deleteUserBtn.addEventListener('click', () => {
        const userId = userDetailsId.value;
        if (confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
            deleteUser(userId);
        }
    });

    // Logout button
    logoutBtn.addEventListener('click', (event) => {
        event.preventDefault();
        logoutUser();
    });

    function showSuccessNotification(message) {
        alert(message);
    }

    function showErrorNotification(message) {
        alert(message);
    }

    async function initDashboard() {
        try {
            await loadDashboardStats();
            await loadUsers();
            await loadFiles();
        } catch (error) {
            console.error('Error initializing dashboard:', error);
        }
    }

    initDashboard();
});