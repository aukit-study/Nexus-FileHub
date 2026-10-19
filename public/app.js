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
    let allFiles = [];

    $('#refresh-btn').addEventListener('click', fetchFiles);
    $('#search-input').addEventListener('input', renderFiles);
    $('#sort-select').addEventListener('change', renderFiles);
    $('#top-upload').addEventListener('click', () => { $('#upload-panel').scrollIntoView({ behavior: 'smooth' }); fileInput.click(); });
    $('#upload-nav').addEventListener('click', () => { $('#upload-panel').scrollIntoView({ behavior: 'smooth' }); fileInput.click(); });
    $('#hide-upload').addEventListener('click', () => $('#upload-panel').classList.toggle('collapsed'));
    $('#new-folder').addEventListener('click', createFolder);
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileInput.click(); } });
    fileInput.addEventListener('change', (event) => { handleUpload(event.target.files); fileInput.value = ''; });
    ['dragenter', 'dragover'].forEach(name => dropZone.addEventListener(name, event => { event.preventDefault(); dropZone.classList.add('dragover'); }));
    ['dragleave', 'drop'].forEach(name => dropZone.addEventListener(name, event => { event.preventDefault(); dropZone.classList.remove('dragover'); }));
    dropZone.addEventListener('drop', event => handleUpload(event.dataTransfer.files));
    $('#close-modal').addEventListener('click', closePreview);
    modal.addEventListener('click', event => { if (event.target === modal) closePreview(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closePreview(); });

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

    async function fetchFiles() {
        fileBrowser.innerHTML = '<div class="loading"><i class="ri-loader-4-line spin"></i> กำลังโหลดไฟล์…</div>';
        try {
            const response = await fetch('/api/files');
            if (!response.ok) throw new Error('โหลดรายการไฟล์ไม่สำเร็จ');
            allFiles = await response.json();
            $('#list-description').textContent = `มีไฟล์ ${allFiles.filter(item => item.type === 'file').length} รายการในคลัง`;
            $('#file-count').textContent = allFiles.filter(item => item.type === 'file').length.toLocaleString('th-TH');
            $('#folder-count').textContent = allFiles.filter(item => item.type === 'directory').length.toLocaleString('th-TH');
            $('#storage-used').textContent = formatBytes(allFiles.reduce((total, item) => total + (item.size || 0), 0));
            renderFiles();
        } catch (error) {
            fileBrowser.innerHTML = `<div class="empty-state"><i class="ri-error-warning-line"></i>${escapeHtml(error.message)}</div>`;
        }
    }

    function renderFiles() {
        const query = $('#search-input').value.trim().toLocaleLowerCase();
        const sort = $('#sort-select').value;
        const files = allFiles.filter(item => `${item.name} ${item.path}`.toLocaleLowerCase().includes(query));
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
                return `<article class="file-item"><div class="item-main"><span class="file-icon folder"><i class="ri-folder-5-fill"></i></span><div class="file-info"><div class="file-name">${name}</div><div class="file-path">${itemPath}</div></div></div><span class="file-size">โฟลเดอร์</span><div class="file-actions"><button class="action-btn delete" data-action="delete" data-path="${itemPath}" title="ลบโฟลเดอร์" aria-label="ลบ ${name}"><i class="ri-delete-bin-line"></i></button></div></article>`;
            }
            const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext);
            const isVideo = ['mp4', 'mov', 'webm', 'ogg'].includes(ext);
            const iconClass = isImage ? 'image' : isVideo ? 'video' : 'file';
            const icon = isImage ? 'ri-image-2-line' : isVideo ? 'ri-video-line' : 'ri-file-3-line';
            const preview = isImage || isVideo ? `<button class="action-btn" data-action="preview" data-path="${itemPath}" data-name="${name}" data-type="${ext}" title="ดูตัวอย่าง" aria-label="ดูตัวอย่าง ${name}"><i class="ri-eye-line"></i></button>` : '';
            return `<article class="file-item"><div class="item-main"><span class="file-icon ${iconClass}"><i class="${icon}"></i></span><div class="file-info"><div class="file-name" title="${name}">${name}</div><div class="file-path">${itemPath}</div></div></div><span class="file-size">${formatBytes(item.size)}</span><div class="file-actions">${preview}<a class="download-btn" href="/api/download?path=${encodedPath}" title="ดาวน์โหลด" aria-label="ดาวน์โหลด ${name}"><i class="ri-download-2-line"></i></a><button class="action-btn delete" data-action="delete" data-path="${itemPath}" title="ลบไฟล์" aria-label="ลบ ${name}"><i class="ri-delete-bin-line"></i></button></div></article>`;
        }).join('');
    }

    fileBrowser.addEventListener('click', async event => {
        const button = event.target.closest('[data-action]');
        if (!button) return;
        const path = button.dataset.path;
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

    async function createFolder() {
        const name = window.prompt('ตั้งชื่อโฟลเดอร์ใหม่');
        if (name === null) return;
        if (!name.trim()) return toast('กรุณาระบุชื่อโฟลเดอร์', 'error');
        try {
            const response = await fetch('/api/folders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: name.trim() }) });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'สร้างโฟลเดอร์ไม่สำเร็จ');
            toast('สร้างโฟลเดอร์เรียบร้อยแล้ว', 'success');
            fetchFiles();
        } catch (error) { toast(error.message, 'error'); }
    }

    function handleUpload(fileList) {
        const files = Array.from(fileList || []);
        if (!files.length) return;
        const formData = new FormData();
        const destination = $('#folder-name').value.trim();
        if (destination) formData.append('folderName', destination);
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
