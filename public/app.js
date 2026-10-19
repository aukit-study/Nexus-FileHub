document.addEventListener('DOMContentLoaded', () => {
    const $ = (selector) => document.querySelector(selector);
    const fileBrowser = $('#file-browser');
    const fileInput = $('#file-input');
    const dropZone = $('#drop-zone');
    const progress = $('#upload-progress');
    const progressFill = $('#progress-fill');
    const progressStatus = $('#progress-status');
    const progressPercent = $('#progress-percent');
    const modal = $('#preview-modal');
    const modalBody = $('#preview-body');
    const folderModal = $('#folder-modal');
    const shareModal = $('#share-modal');
    let allFiles = [];
    let currentFolder = '';
    let currentView = 'dashboard';
    const folderHistory = [];

    $('#refresh-btn').addEventListener('click', fetchFiles);
    $('#search-input').addEventListener('input', () => { showExplorer(); renderFiles(); });
    $('#sort-select').addEventListener('change', renderFiles);
    $('#top-upload').addEventListener('click', openUpload);
    $('#dashboard-upload').addEventListener('click', openUpload);
    $('#overview-nav').addEventListener('click', showDashboard);
    $('#view-all-files').addEventListener('click', () => navigateTo(''));
    $('#upload-nav').addEventListener('click', openUpload);
    $('#root-nav').addEventListener('click', () => navigateTo(''));
    $('#back-btn').addEventListener('click', goBack);
    $('#up-btn').addEventListener('click', goUp);
    $('#hide-upload').addEventListener('click', () => $('#upload-panel').classList.toggle('collapsed'));
    $('#new-folder').addEventListener('click', openFolderDialog);
    $('#folder-form').addEventListener('submit', createFolder);
    $('#cancel-folder').addEventListener('click', closeFolderDialog);
    folderModal.addEventListener('click', event => { if (event.target === folderModal) closeFolderDialog(); });
    $('#share-button').addEventListener('click', openShareDialog);
    $('#close-share').addEventListener('click', closeShareDialog);
    shareModal.addEventListener('click', event => { if (event.target === shareModal) closeShareDialog(); });
    $('#share-content').addEventListener('change', event => {
        if (event.target.id === 'share-ip') loadShare(event.target.value);
    });
    $('#share-content').addEventListener('click', event => {
        if (event.target.closest('#copy-share-url')) copyShareUrl();
    });
    $('#breadcrumbs').addEventListener('click', event => {
        const button = event.target.closest('[data-folder]');
        if (!button) return;
        navigateTo(button.dataset.folder);
    });
    $('#folder-tree').addEventListener('click', event => {
        const button = event.target.closest('[data-folder]');
        if (button) navigateTo(button.dataset.folder);
    });
    $('#dashboard-recent').addEventListener('click', event => {
        const button = event.target.closest('[data-location]');
        if (!button) return;
        const filePath = button.dataset.location;
        const parent = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : '';
        navigateTo(parent);
    });
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileInput.click(); } });
    fileInput.addEventListener('change', (event) => { handleUpload(event.target.files); fileInput.value = ''; });
    ['dragenter', 'dragover'].forEach(name => dropZone.addEventListener(name, event => { event.preventDefault(); dropZone.classList.add('dragover'); }));
    ['dragleave', 'drop'].forEach(name => dropZone.addEventListener(name, event => { event.preventDefault(); dropZone.classList.remove('dragover'); }));
    dropZone.addEventListener('drop', event => handleUpload(event.dataTransfer.files));
    $('#close-modal').addEventListener('click', closePreview);
    modal.addEventListener('click', event => { if (event.target === modal) closePreview(); });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') { closePreview(); closeFolderDialog(); closeShareDialog(); }
    });

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    }

    function formatBytes(bytes) {
        if (!bytes) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
        return `${(bytes / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`;
    }

    function toast(message, type = '') {
        const node = document.createElement('div');
        node.className = `toast ${type}`;
        node.textContent = message;
        $('#toast-region').append(node);
        window.setTimeout(() => node.remove(), 3600);
    }

    function openUpload() {
        showExplorer();
        $('#upload-panel').classList.remove('collapsed');
        $('#upload-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        fileInput.click();
    }

    function navigateTo(path, remember = true) {
        const wasDashboard = currentView === 'dashboard';
        showExplorer();
        if (path === currentFolder) {
            if (wasDashboard) {
                $('#search-input').value = '';
                renderFiles();
            }
            return;
        }
        if (remember) folderHistory.push(currentFolder);
        currentFolder = path;
        $('#search-input').value = '';
        renderFiles();
    }

    function goBack() {
        if (!folderHistory.length) return goUp();
        currentFolder = folderHistory.pop();
        $('#search-input').value = '';
        renderFiles();
    }

    function goUp() {
        if (!currentFolder) return;
        const parent = currentFolder.includes('/') ? currentFolder.slice(0, currentFolder.lastIndexOf('/')) : '';
        navigateTo(parent);
    }

    function showDashboard() {
        currentView = 'dashboard';
        $('#overview-view').hidden = false;
        $('#explorer-view').hidden = true;
        $('#overview-nav').classList.add('active');
        $('#root-nav').classList.remove('active');
        renderBreadcrumbs();
    }

    function showExplorer() {
        currentView = 'explorer';
        $('#overview-view').hidden = true;
        $('#explorer-view').hidden = false;
        $('#overview-nav').classList.remove('active');
        $('#root-nav').classList.toggle('active', !currentFolder);
        renderBreadcrumbs();
    }

    async function fetchFiles() {
        fileBrowser.innerHTML = '<div class="loading"><i class="ri-loader-4-line spin"></i> กำลังโหลดไฟล์…</div>';
        try {
            const response = await fetch('/api/files');
            if (!response.ok) throw new Error('โหลดรายการไฟล์ไม่สำเร็จ');
            allFiles = await response.json();
            renderFolderTree();
            $('#list-description').textContent = `มีไฟล์ ${allFiles.filter(item => item.type === 'file').length} รายการในคลัง`;
            $('#file-count').textContent = allFiles.filter(item => item.type === 'file').length.toLocaleString('th-TH');
            $('#folder-count').textContent = allFiles.filter(item => item.type === 'directory').length.toLocaleString('th-TH');
            $('#storage-used').textContent = formatBytes(allFiles.reduce((total, item) => total + (item.size || 0), 0));
            renderDashboard();
            renderFiles();
        } catch (error) {
            fileBrowser.innerHTML = `<div class="empty-state"><i class="ri-error-warning-line"></i>${escapeHtml(error.message)}</div>`;
        }
    }

    function renderFiles() {
        renderFolderTree();
        const query = $('#search-input').value.trim().toLocaleLowerCase();
        const sort = $('#sort-select').value;
        const files = allFiles.filter(item => {
            const parent = item.path.includes('/') ? item.path.slice(0, item.path.lastIndexOf('/')) : '';
            return parent === currentFolder && `${item.name} ${item.path}`.toLocaleLowerCase().includes(query);
        });
        renderBreadcrumbs();
        $('#upload-target').textContent = currentFolder || 'คลังไฟล์หลัก';
        $('#folder-modal-location').textContent = `ใน ${currentFolder || 'คลังไฟล์หลัก'}`;
        $('#list-description').textContent = currentFolder ? `โฟลเดอร์ ${currentFolder}` : 'รายการที่จัดเก็บบนเซิร์ฟเวอร์';
        $('#folder-heading').textContent = currentFolder ? currentFolder.split('/').pop() : 'ไฟล์และโฟลเดอร์';
        $('#location-hint').textContent = currentFolder ? `ตำแหน่งปัจจุบัน: ${currentFolder}` : 'ตำแหน่งปัจจุบัน: คลังไฟล์หลัก';
        $('#back-btn').disabled = !folderHistory.length && !currentFolder;
        $('#up-btn').disabled = !currentFolder;
        $('#root-nav').classList.toggle('active', currentView === 'explorer' && !currentFolder);
        files.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
            if (sort === 'size') return (b.size || 0) - (a.size || 0);
            if (sort === 'type') return (a.name.split('.').pop() || '').localeCompare(b.name.split('.').pop() || '', 'th');
            return a.name.localeCompare(b.name, 'th', { numeric: true, sensitivity: 'base' });
        });
        if (!files.length) {
            fileBrowser.innerHTML = `<div class="empty-state"><i class="ri-folder-open-line"></i>${query ? 'ไม่พบไฟล์ที่ตรงกับคำค้นหา' : 'ยังไม่มีไฟล์ในคลัง ลองอัปโหลดไฟล์แรกของคุณ'}</div>`;
            return;
        }
        fileBrowser.innerHTML = files.map(item => {
            const name = escapeHtml(item.name);
            const itemPath = escapeHtml(item.path);
            const encodedPath = encodeURIComponent(item.path);
            const ext = item.name.includes('.') ? item.name.split('.').pop().toLowerCase() : '';
            if (item.type === 'directory') {
                return `<article class="file-item"><button type="button" class="item-main folder-entry" data-action="enter" data-path="${itemPath}" aria-label="เปิดโฟลเดอร์ ${name}"><span class="file-icon folder"><i class="ri-folder-5-fill"></i></span><span class="file-info"><span class="file-name">${name}</span><span class="file-path">${itemPath}</span></span><i class="ri-arrow-right-s-line folder-chevron"></i></button><span class="file-size">โฟลเดอร์</span><div class="file-actions"><button class="action-btn delete" data-action="delete" data-path="${itemPath}" title="ลบโฟลเดอร์" aria-label="ลบ ${name}"><i class="ri-delete-bin-line"></i></button></div></article>`;
            }
            const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext);
            const isVideo = ['mp4', 'mov', 'webm', 'ogg'].includes(ext);
            const iconClass = isImage ? 'image' : isVideo ? 'video' : 'file';
            const icon = isImage ? 'ri-image-2-line' : isVideo ? 'ri-video-line' : 'ri-file-3-line';
            const preview = isImage || isVideo ? `<button class="action-btn" data-action="preview" data-path="${itemPath}" data-name="${name}" data-type="${ext}" title="ดูตัวอย่าง" aria-label="ดูตัวอย่าง ${name}"><i class="ri-eye-line"></i></button>` : '';
            return `<article class="file-item"><div class="item-main"><span class="file-icon ${iconClass}"><i class="${icon}"></i></span><div class="file-info"><div class="file-name" title="${name}">${name}</div><div class="file-path">${itemPath}</div></div></div><span class="file-size">${formatBytes(item.size)}</span><div class="file-actions">${preview}<a class="download-btn" href="/api/download?path=${encodedPath}" title="ดาวน์โหลด" aria-label="ดาวน์โหลด ${name}"><i class="ri-download-2-line"></i></a><button class="action-btn delete" data-action="delete" data-path="${itemPath}" title="ลบไฟล์" aria-label="ลบ ${name}"><i class="ri-delete-bin-line"></i></button></div></article>`;
        }).join('');
    }

    function renderDashboard() {
        const files = allFiles.filter(item => item.type === 'file');
        const folders = allFiles.filter(item => item.type === 'directory');
        const totalSize = files.reduce((total, file) => total + (file.size || 0), 0);
        $('#dashboard-files').textContent = files.length.toLocaleString('th-TH');
        $('#dashboard-folders').textContent = folders.length.toLocaleString('th-TH');
        $('#dashboard-storage').textContent = formatBytes(totalSize);

        const groups = [
            { key: 'images', label: 'รูปภาพ', icon: 'ri-image-2-line', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'] },
            { key: 'videos', label: 'วิดีโอ', icon: 'ri-video-line', extensions: ['mp4', 'mov', 'webm', 'ogg', 'mkv'] },
            { key: 'documents', label: 'เอกสาร', icon: 'ri-file-text-line', extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv'] },
            { key: 'others', label: 'ไฟล์อื่น ๆ', icon: 'ri-file-3-line', extensions: [] }
        ];
        const grouped = groups.map(group => ({
            ...group,
            count: files.filter(file => {
                const ext = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : '';
                const known = groups.slice(0, 3).some(candidate => candidate.extensions.includes(ext));
                return group.key === 'others' ? !known : group.extensions.includes(ext);
            }).length
        }));
        const maxCount = Math.max(files.length, 1);
        $('#dashboard-types').innerHTML = grouped.map(group => `<div class="type-row"><div class="type-label"><span class="type-icon ${group.key}"><i class="${group.icon}"></i></span><span>${group.label}</span><strong>${group.count.toLocaleString('th-TH')}</strong></div><div class="type-track"><span class="type-bar ${group.key}" style="width:${Math.round(group.count / maxCount * 100)}%"></span></div></div>`).join('');

        const recentFiles = [...files].sort((a, b) => new Date(b.modifiedAt || 0) - new Date(a.modifiedAt || 0)).slice(0, 6);
        if (!recentFiles.length) {
            $('#dashboard-recent').innerHTML = '<div class="dashboard-empty"><i class="ri-inbox-2-line"></i><span>ยังไม่มีไฟล์ในคลัง</span></div>';
            return;
        }
        $('#dashboard-recent').innerHTML = recentFiles.map(file => {
            const ext = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : '';
            const image = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext);
            const video = ['mp4', 'mov', 'webm', 'ogg', 'mkv'].includes(ext);
            const icon = image ? 'ri-image-2-line' : video ? 'ri-video-line' : 'ri-file-3-line';
            const groupClass = image ? 'images' : video ? 'videos' : 'others';
            const modified = file.modifiedAt ? new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(file.modifiedAt)) : '—';
            return `<button class="recent-file" type="button" data-location="${escapeHtml(file.path)}" title="เปิดตำแหน่งไฟล์"><span class="recent-icon ${groupClass}"><i class="${icon}"></i></span><span class="recent-info"><strong>${escapeHtml(file.name)}</strong><small>${escapeHtml(file.path)}</small></span><span class="recent-date">${escapeHtml(modified)}</span><span class="recent-size">${formatBytes(file.size)}</span></button>`;
        }).join('');
    }

    function renderFolderTree() {
        const folders = allFiles.filter(item => item.type === 'directory').sort((a, b) => a.path.localeCompare(b.path, 'th', { numeric: true }));
        if (!folders.length) {
            $('#folder-tree').innerHTML = '<div class="tree-empty">ยังไม่มีโฟลเดอร์</div>';
            return;
        }
        $('#folder-tree').innerHTML = folders.map(folder => {
            const depth = folder.path.split('/').length - 1;
            const path = escapeHtml(folder.path);
            const name = escapeHtml(folder.name);
            const active = currentFolder === folder.path ? ' active' : '';
            return `<button class="tree-item${active}" style="--tree-depth:${depth}" type="button" data-folder="${path}" title="${path}"><i class="ri-folder-3-fill"></i><span>${name}</span></button>`;
        }).join('');
    }

    fileBrowser.addEventListener('click', async event => {
        const button = event.target.closest('[data-action]');
        if (!button) return;
        const path = button.dataset.path;
        if (button.dataset.action === 'enter') {
            navigateTo(path);
            return;
        }
        if (button.dataset.action === 'preview') return openPreview(path, button.dataset.name, button.dataset.type);
        if (!window.confirm(`ต้องการลบ “${path}” ใช่หรือไม่?`)) return;
        try {
            const response = await fetch(`/api/files?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'ลบรายการไม่สำเร็จ');
            toast('ลบรายการเรียบร้อยแล้ว', 'success');
            fetchFiles();
        } catch (error) { toast(error.message, 'error'); }
    });

    function openFolderDialog() {
        $('#folder-error').textContent = '';
        $('#new-folder-name').value = '';
        folderModal.classList.add('active');
        $('#new-folder-name').focus();
    }

    function closeFolderDialog() {
        folderModal.classList.remove('active');
    }

    function openShareDialog() {
        shareModal.classList.add('active');
        loadShare();
    }

    function closeShareDialog() {
        shareModal.classList.remove('active');
    }

    async function loadShare(ip = '') {
        const content = $('#share-content');
        content.innerHTML = '<div class="share-loading"><i class="ri-loader-4-line spin"></i> กำลังเตรียม QR code…</div>';
        try {
            const response = await fetch(`/api/share${ip ? `?ip=${encodeURIComponent(ip)}` : ''}`);
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'สร้าง QR code ไม่สำเร็จ');
            const options = result.addresses.map(address => `<option value="${escapeHtml(address)}" ${address === result.ip ? 'selected' : ''}>${escapeHtml(address)}</option>`).join('');
            content.innerHTML = `<div class="share-layout"><div class="share-qr-wrap"><img class="share-qr" src="${result.qrCode}" alt="QR code สำหรับเปิด Nexus FileHub ที่ ${escapeHtml(result.url)}"></div><div class="share-details"><label for="share-ip">เลือกเครือข่าย</label><select id="share-ip">${options}</select><label for="share-url">ลิงก์สำหรับเปิด</label><div class="share-url-row"><input id="share-url" type="text" readonly value="${escapeHtml(result.url)}"><button class="primary-btn" id="copy-share-url" type="button" title="คัดลอกลิงก์"><i class="ri-file-copy-line"></i></button></div><span class="share-tip"><i class="ri-wifi-line"></i> อุปกรณ์ที่สแกนต้องเชื่อมต่อ Wi-Fi/LAN วงเดียวกัน</span></div></div>`;
        } catch (error) {
            content.innerHTML = `<div class="share-error"><i class="ri-error-warning-line"></i><span>${escapeHtml(error.message)}</span><small>ตรวจสอบว่าเครื่องเชื่อมต่อ Wi-Fi/LAN และเปิดเซิร์ฟเวอร์อยู่</small></div>`;
        }
    }

    async function copyShareUrl() {
        const input = $('#share-url');
        if (!input) return;
        try {
            if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(input.value);
            else {
                input.focus();
                input.select();
                document.execCommand('copy');
            }
            toast('คัดลอกลิงก์แล้ว', 'success');
        } catch (_) {
            input.focus();
            input.select();
            toast('เลือกลิงก์แล้ว กด Ctrl+C เพื่อคัดลอก', 'error');
        }
    }

    async function createFolder(event) {
        event.preventDefault();
        const name = $('#new-folder-name').value.trim();
        if (!name) {
            $('#folder-error').textContent = 'กรุณากรอกชื่อโฟลเดอร์';
            $('#new-folder-name').focus();
            return;
        }
        try {
            const folderPath = currentFolder ? `${currentFolder}/${name}` : name;
            const response = await fetch('/api/folders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: folderPath }) });
            const result = await response.json();
            if (!response.ok) {
                $('#folder-error').textContent = result.error || 'สร้างโฟลเดอร์ไม่สำเร็จ';
                return;
            }
            closeFolderDialog();
            toast('สร้างโฟลเดอร์เรียบร้อยแล้ว', 'success');
            fetchFiles();
        } catch (error) { $('#folder-error').textContent = error.message; }
    }

    function renderBreadcrumbs() {
        if (currentView === 'dashboard') {
            $('#breadcrumbs').innerHTML = '<strong aria-current="page"><i class="ri-dashboard-3-line"></i> ภาพรวม</strong>';
            $('#back-btn').disabled = true;
            $('#up-btn').disabled = true;
            return;
        }
        const parts = currentFolder ? currentFolder.split('/') : [];
        const crumbItems = [{ label: 'คลังไฟล์หลัก', path: '' }];
        let path = '';
        parts.forEach(part => {
            path = path ? `${path}/${part}` : part;
            crumbItems.push({ label: part, path });
        });
        $('#breadcrumbs').innerHTML = crumbItems.map((item, index) => {
            const isCurrent = index === crumbItems.length - 1;
            const content = isCurrent
                ? `<strong aria-current="page">${escapeHtml(item.label)}</strong>`
                : `<button type="button" data-folder="${escapeHtml(item.path)}">${escapeHtml(item.label)}</button>`;
            return `${index ? '<i class="ri-arrow-right-s-line"></i>' : ''}${content}`;
        }).join('');
    }

    function handleUpload(fileList) {
        const files = Array.from(fileList || []);
        if (!files.length) return;
        const formData = new FormData();
        if (currentFolder) formData.append('folderName', currentFolder);
        files.forEach(file => formData.append('files', file));
        progress.classList.add('active');
        progressFill.style.width = '0%';
        progressStatus.textContent = `กำลังเตรียมอัปโหลด ${files.length} ไฟล์`;
        progressPercent.textContent = '0%';
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/upload');
        xhr.upload.onprogress = event => {
            if (!event.lengthComputable) return;
            const percent = Math.round(event.loaded / event.total * 100);
            progressFill.style.width = `${percent}%`;
            progressStatus.textContent = `กำลังอัปโหลด ${files.length} ไฟล์`;
            progressPercent.textContent = `${percent}%`;
        };
        xhr.onload = () => {
            let result = {};
            try { result = JSON.parse(xhr.responseText); } catch (_) { /* Keep a useful fallback message. */ }
            if (xhr.status >= 200 && xhr.status < 300) {
                progressFill.style.width = '100%';
                progressStatus.textContent = result.message || 'อัปโหลดสำเร็จ';
                progressPercent.textContent = '100%';
                toast(result.message || 'อัปโหลดสำเร็จ', 'success');
                fetchFiles();
                window.setTimeout(() => progress.classList.remove('active'), 2400);
            } else {
                progressStatus.textContent = result.error || `อัปโหลดไม่สำเร็จ (${xhr.status})`;
                toast(progressStatus.textContent, 'error');
            }
        };
        xhr.onerror = () => { progressStatus.textContent = 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ'; toast(progressStatus.textContent, 'error'); };
        xhr.send(formData);
    }

    function openPreview(path, name, ext) {
        $('#preview-title').textContent = name;
        const url = `/uploads/${path.split('/').map(encodeURIComponent).join('/')}`;
        if (['mp4', 'mov', 'webm', 'ogg'].includes(ext)) {
            const video = document.createElement('video');
            video.controls = true;
            video.autoplay = true;
            video.src = url;
            modalBody.replaceChildren(video);
        } else {
            const image = document.createElement('img');
            image.src = url;
            image.alt = name;
            modalBody.replaceChildren(image);
        }
        modal.classList.add('active');
        $('#close-modal').focus();
    }

    function closePreview() {
        modal.classList.remove('active');
        modalBody.replaceChildren();
    }

    fetchFiles();
});
