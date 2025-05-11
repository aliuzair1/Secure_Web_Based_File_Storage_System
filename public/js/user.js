document.addEventListener('DOMContentLoaded', function () {
    // Check if user is logged in - FIXED: changed to authToken
    const token = localStorage.getItem('authToken');
    if (!token) {
        window.location.href = '/';
        return;
    }

    // Elements
    const uploadBtn = document.getElementById('uploadBtn');
    const uploadModal = document.getElementById('uploadModal');
    const confirmModal = document.getElementById('confirmModal');
    const closeModals = document.querySelectorAll('.close-modal');
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const selectedFile = document.getElementById('selectedFile');
    const fileName = document.getElementById('fileName');
    const uploadForm = document.getElementById('uploadForm');
    const cancelDelete = document.getElementById('cancelDelete');
    const confirmDelete = document.getElementById('confirmDelete');
    const deleteFileName = document.getElementById('deleteFileName');
    const notification = document.getElementById('notification');
    const notificationMessage = document.getElementById('notificationMessage');
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    const fileGrid = document.getElementById('fileGrid');
    const noFiles = document.getElementById('noFiles');
    const logoutBtn = document.getElementById('logoutBtn');
    const welcomeUser = document.getElementById('welcomeUser');
    const usageProgress = document.getElementById('usageProgress');
    const usedStorage = document.getElementById('usedStorage');
    const totalStorage = document.getElementById('totalStorage');
    const uploadProgress = document.getElementById('uploadProgress');
    const progressFill = document.querySelector('.progress-fill');
    const progressPercent = document.getElementById('progressPercent');

    // API endpoints
    const API = {
        FILES: '/api/files',
        UPLOAD: '/api/files/upload',
        DOWNLOAD: '/api/files/download',
        STORAGE: '/api/files/storage-info',
        LOGOUT: '/api/auth/logout',
        SEARCH: '/api/files/search',
        VERIFY: '/api/auth/verify'
    };

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

    // Get file icon based on extension
    function getFileIcon(extension) {
        const iconMap = {
            'pdf': 'far fa-file-pdf',
            'doc': 'far fa-file-word',
            'docx': 'far fa-file-word',
            'xls': 'far fa-file-excel',
            'xlsx': 'far fa-file-excel',
            'ppt': 'far fa-file-powerpoint',
            'pptx': 'far fa-file-powerpoint',
            'jpg': 'far fa-file-image',
            'jpeg': 'far fa-file-image',
            'png': 'far fa-file-image',
            'gif': 'far fa-file-image',
            'txt': 'far fa-file-alt',
            'zip': 'far fa-file-archive',
            'rar': 'far fa-file-archive'
        };

        return iconMap[extension.toLowerCase()] || 'far fa-file';
    }

    // Verify user token and load user info - FIXED: properly async/await
    async function verifyToken() {
        try {
            const response = await fetch(API.VERIFY, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                welcomeUser.textContent = `Welcome, ${data.user.username}`;
                return data.user;
            } else {
                // Redirect to login page if token is invalid
                localStorage.removeItem('authToken');
                window.location.href = '/';
                return null;
            }
        } catch (error) {
            console.error('Error verifying token:', error);
            showNotification('Session expired. Please login again.', 'error');
            localStorage.removeItem('authToken');
            setTimeout(() => {
                window.location.href = '/';
            }, 2000);
            return null;
        }
    }

    // Load storage info
    async function loadStorageInfo() {
        try {
            const response = await fetch(API.STORAGE, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                const usedBytes = parseFloat(data.storage_used);
                const totalBytes = parseFloat(data.storage_limit);
                const percentUsed = (usedBytes / totalBytes) * 100;

                usageProgress.style.width = `${Math.min(percentUsed, 100)}%`;
                usedStorage.textContent = `${formatFileSize(usedBytes)} used`;
                totalStorage.textContent = `${formatFileSize(totalBytes)} total`;

                // Change color based on usage
                if (percentUsed > 90) {
                    usageProgress.style.backgroundColor = '#e74c3c';
                } else if (percentUsed > 70) {
                    usageProgress.style.backgroundColor = '#f39c12';
                }
            }
        } catch (error) {
            console.error('Error loading storage info:', error);
        }
    }

    // Load all files
    async function loadFiles() {
        try {
            console.log('Loading files...');
            const response = await fetch(API.FILES, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            console.log('Files response status:', response.status);

            if (response.ok) {
                const files = await response.json();
                console.log('Files loaded:', files.length);
                renderFiles(files);
            } else {
                const errorData = await response.json().catch(() => ({}));
                console.error('Error loading files. Status:', response.status, 'Details:', errorData);
                showNotification('Error loading files: ' + (errorData.message || ''), 'error');
            }
        } catch (error) {
            console.error('Exception while loading files:', error);
            showNotification('Error loading files', 'error');
        }
    }

    // Render files in the grid
    function renderFiles(files) {
        fileGrid.innerHTML = '';

        if (files.length === 0) {
            fileGrid.style.display = 'none';
            noFiles.style.display = 'block';
            return;
        }

        fileGrid.style.display = 'grid';
        noFiles.style.display = 'none';

        files.forEach(file => {
            const extension = file.extension || file.file_name.split('.').pop().toLowerCase();
            const fileIcon = getFileIcon(extension);
            const typeName = file.type_name || `${extension.toUpperCase()} File`;

            const fileCard = document.createElement('div');
            fileCard.className = 'file-card';
            fileCard.dataset.fileid = file.file_id;
            fileCard.dataset.filename = file.file_name;

            fileCard.innerHTML = `
                <div class="file-icon">
                    <i class="${fileIcon}"></i>
                </div>
                <h3 class="file-name">${file.file_name}</h3>
                <div class="file-info">
                    <div>${typeName} • ${formatFileSize(file.file_size)}</div>
                    <div>Uploaded: ${formatDate(file.upload_date)}</div>
                </div>
                <div class="file-actions">
                    <button class="download-btn" title="Download">
                        <i class="fas fa-download"></i>
                    </button>
                    <button class="delete-btn" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;

            fileGrid.appendChild(fileCard);

            // Add event listeners
            fileCard.querySelector('.download-btn').addEventListener('click', function () {
                downloadFile(file.file_id, file.file_name);
            });

            fileCard.querySelector('.delete-btn').addEventListener('click', function () {
                showDeleteConfirmation(file.file_id, file.file_name);
            });
        });
    }

    // Download file
    function downloadFile(fileId, fileName) {
        const downloadUrl = `${API.DOWNLOAD}/${fileId}`;

        // Create a temporary link element and trigger the download
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.setAttribute('download', fileName);
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
                showNotification(`Downloading ${fileName}...`, 'success');
            })
            .catch(error => {
                console.error('Error downloading file:', error);
                showNotification('Error downloading file', 'error');
            });
    }

    // Show delete confirmation modal
    function showDeleteConfirmation(fileId, fileName) {
        deleteFileName.textContent = fileName;
        confirmDelete.dataset.fileId = fileId;
        confirmDelete.dataset.fileName = fileName;
        confirmModal.style.display = 'flex';
    }

    // Delete file
    async function deleteFile(fileId, fileName) {
        try {
            const response = await fetch(`${API.FILES}/${fileId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                // Remove file card from UI
                const fileCard = document.querySelector(`.file-card[data-fileid="${fileId}"]`);
                if (fileCard) {
                    fileCard.remove();
                }

                // Check if there are any files left
                if (fileGrid.children.length === 0) {
                    fileGrid.style.display = 'none';
                    noFiles.style.display = 'block';
                }

                // Refresh storage info
                loadStorageInfo();

                showNotification(`${fileName} deleted successfully`, 'success');
            } else {
                showNotification('Error deleting file', 'error');
            }
        } catch (error) {
            console.error('Error deleting file:', error);
            showNotification('Error deleting file', 'error');
        }
    }

    // Show notification
    function showNotification(message, type = 'success') {
        notificationMessage.textContent = message;
        notification.className = `notification ${type}`;
        notification.style.display = 'flex';

        setTimeout(() => {
            notification.style.display = 'none';
        }, 3000);
    }

    // Search files
    async function searchFiles(query) {
        try {
            const response = await fetch(`${API.SEARCH}?q=${encodeURIComponent(query)}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const files = await response.json();
                renderFiles(files);
            }
        } catch (error) {
            console.error('Error searching files:', error);
            showNotification('Error searching files', 'error');
        }
    }

    // Upload file - FIXED: proper event handling for the upload
    async function uploadFileToServer(file) {
        try {
            const formData = new FormData();
            formData.append('file', file);

            // Show progress bar
            uploadProgress.style.display = 'block';

            const xhr = new XMLHttpRequest();
            xhr.open('POST', API.UPLOAD);
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);

            // Add debug logging
            console.log('Uploading file:', file.name, 'Size:', file.size);

            // Track upload progress
            xhr.upload.addEventListener('progress', (event) => {
                if (event.lengthComputable) {
                    const percent = Math.round((event.loaded / event.total) * 100);
                    progressFill.style.width = percent + '%';
                    progressPercent.textContent = percent + '%';
                    console.log(`Upload progress: ${percent}%`);
                }
            });

            // Handle response
            xhr.onload = function () {
                console.log('Upload response status:', xhr.status);
                console.log('Response text:', xhr.responseText);

                if (xhr.status >= 200 && xhr.status < 300) {
                    let fileData;
                    try {
                        fileData = JSON.parse(xhr.responseText);
                    } catch (parseError) {
                        console.error('Error parsing server response:', parseError);
                        showNotification('Error processing server response', 'error');
                        uploadProgress.style.display = 'none';
                        return;
                    }

                    // Reset upload form
                    uploadForm.reset();
                    selectedFile.style.display = 'none';
                    uploadProgress.style.display = 'none';
                    progressFill.style.width = '0%';
                    progressPercent.textContent = '0%';
                    uploadModal.style.display = 'none';

                    // Refresh files and storage info
                    loadFiles();
                    loadStorageInfo();

                    showNotification(`${fileData.file_name} uploaded successfully`, 'success');
                } else {
                    let errorMessage = 'Error uploading file';
                    try {
                        const response = JSON.parse(xhr.responseText);
                        errorMessage = response.message || errorMessage;
                    } catch (e) {
                        console.error('Error parsing error response:', e);
                    }

                    console.error('Upload failed:', errorMessage);
                    showNotification(errorMessage, 'error');
                    uploadProgress.style.display = 'none';
                }
            };

            xhr.onerror = function (err) {
                console.error('Network error during upload:', err);
                showNotification('Network error occurred', 'error');
                uploadProgress.style.display = 'none';
            };

            // Send the form data
            xhr.send(formData);
            console.log('Upload request sent');
        } catch (error) {
            console.error('Error in uploadFileToServer function:', error);
            showNotification('Error uploading file: ' + error.message, 'error');
            uploadProgress.style.display = 'none';
        }
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

    // Event Listeners

    // Open upload modal
    uploadBtn.addEventListener('click', () => {
        uploadModal.style.display = 'flex';
    });

    // Close modals
    closeModals.forEach(closeBtn => {
        closeBtn.addEventListener('click', () => {
            uploadModal.style.display = 'none';
            confirmModal.style.display = 'none';
        });
    });

    // Close modals when clicking outside
    window.addEventListener('click', (event) => {
        if (event.target === uploadModal) {
            uploadModal.style.display = 'none';
        }
        if (event.target === confirmModal) {
            confirmModal.style.display = 'none';
        }
    });

    // File input change
    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            fileName.textContent = file.name;
            selectedFile.style.display = 'block';
        } else {
            selectedFile.style.display = 'none';
        }
    });

    // Drag and drop functionality
    uploadArea.addEventListener('dragover', (event) => {
        event.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (event) => {
        event.preventDefault();
        uploadArea.classList.remove('dragover');

        if (event.dataTransfer.files.length > 0) {
            fileInput.files = event.dataTransfer.files;
            const file = event.dataTransfer.files[0];
            fileName.textContent = file.name;
            selectedFile.style.display = 'block';
        }
    });

    // Browse files button
    uploadArea.querySelector('.btn').addEventListener('click', () => {
        fileInput.click();
    });

    // Submit upload form - FIXED: properly handle the form submission
    uploadForm.addEventListener('submit', (event) => {
        event.preventDefault();
        console.log('Upload form submitted');

        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            console.log('Selected file:', file.name, 'Size:', file.size, 'Type:', file.type);
            uploadFileToServer(file);
        } else {
            console.warn('No file selected for upload');
            showNotification('Please select a file to upload', 'error');
        }
    });

    // Confirm delete button
    confirmDelete.addEventListener('click', () => {
        const fileId = confirmDelete.dataset.fileId;
        const fileName = confirmDelete.dataset.fileName;

        deleteFile(fileId, fileName);
        confirmModal.style.display = 'none';
    });

    // Cancel delete button
    cancelDelete.addEventListener('click', () => {
        confirmModal.style.display = 'none';
    });

    // Search button
    searchBtn.addEventListener('click', () => {
        const query = searchInput.value.trim();
        if (query) {
            searchFiles(query);
        } else {
            loadFiles();
        }
    });

    // Search input enter key
    searchInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            searchBtn.click();
        }
    });

    // Logout button
    logoutBtn.addEventListener('click', (event) => {
        event.preventDefault();
        logoutUser();
    });

    // Initialize the dashboard
    async function initDashboard() {
        await verifyToken();
        await loadStorageInfo();
        await loadFiles();
    }
    initDashboard();
});