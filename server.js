const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const UPLOAD_ROOT = path.resolve(__dirname, 'uploads');

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_ROOT));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function resolveUploadPath(relativePath = '') {
    if (typeof relativePath !== 'string' || relativePath.includes('\0')) {
        throw new Error('Invalid path.');
    }
    const normalized = relativePath.replace(/[\\/]+/g, path.sep);
    if (path.isAbsolute(normalized) || /^[a-z]:/i.test(normalized)) {
        throw new Error('Absolute paths are not allowed.');
    }
    const resolved = path.resolve(UPLOAD_ROOT, normalized);
    if (resolved !== UPLOAD_ROOT && !resolved.startsWith(`${UPLOAD_ROOT}${path.sep}`)) {
        throw new Error('Path is outside the upload directory.');
    }
    return resolved;
}

function uniqueFileName(directory, originalName) {
    const safeName = path.basename(originalName).replace(/[<>:"|?*\x00-\x1f]/g, '_') || 'file';
    const extension = path.extname(safeName);
    const base = path.basename(safeName, extension);
    let candidate = safeName;
    let suffix = 1;
    while (fs.existsSync(path.join(directory, candidate))) {
        candidate = `${base} (${suffix})${extension}`;
        suffix += 1;
    }
    return candidate;
}

const storage = multer.diskStorage({
    destination(req, file, callback) {
        try {
            const destination = resolveUploadPath(req.body.folderName || '');
            fs.mkdirSync(destination, { recursive: true });
            callback(null, destination);
        } catch (error) {
            callback(error);
        }
    },
    filename(req, file, callback) {
        try {
            const destination = resolveUploadPath(req.body.folderName || '');
            callback(null, uniqueFileName(destination, file.originalname));
        } catch (error) {
            callback(error);
        }
    }
});
const upload = multer({
    storage,
    limits: { files: 50, fileSize: 1024 * 1024 * 1024 }
});

app.post('/api/upload', (req, res) => {
    upload.array('files')(req, res, error => {
        if (error) {
            const status = error instanceof multer.MulterError ? 400 : 400;
            return res.status(status).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'ไฟล์มีขนาดใหญ่เกิน 1 GB' : error.message });
        }
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'กรุณาเลือกไฟล์ที่ต้องการอัปโหลด' });
        }
        res.json({
            success: true,
            message: `อัปโหลดสำเร็จ ${req.files.length} ไฟล์`,
            files: req.files.map(file => file.filename),
            folder: req.body.folderName || ''
        });
    });
});

app.get('/api/files', (req, res) => {
    try {
        fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
        const results = [];
        function walk(directory) {
            for (const name of fs.readdirSync(directory)) {
                const absolutePath = path.join(directory, name);
                const stat = fs.statSync(absolutePath);
                const relativePath = path.relative(UPLOAD_ROOT, absolutePath).split(path.sep).join('/');
                if (stat.isDirectory()) {
                    results.push({ name, path: relativePath, type: 'directory' });
                    walk(absolutePath);
                } else {
                    results.push({ name, path: relativePath, type: 'file', size: stat.size });
                }
            }
        }
        walk(UPLOAD_ROOT);
        res.json(results);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'ไม่สามารถอ่านรายการไฟล์ได้' });
    }
});

app.post('/api/folders', (req, res) => {
    try {
        const folderPath = resolveUploadPath(req.body.path);
        if (folderPath === UPLOAD_ROOT) return res.status(400).json({ error: 'กรุณาระบุชื่อโฟลเดอร์' });
        if (fs.existsSync(folderPath)) return res.status(409).json({ error: 'มีไฟล์หรือโฟลเดอร์ชื่อนี้อยู่แล้ว' });
        fs.mkdirSync(folderPath, { recursive: true });
        res.status(201).json({ success: true, path: path.relative(UPLOAD_ROOT, folderPath).split(path.sep).join('/') });
    } catch (error) {
        res.status(400).json({ error: error.message || 'สร้างโฟลเดอร์ไม่สำเร็จ' });
    }
});

app.get('/api/download', (req, res) => {
    try {
        const filePath = resolveUploadPath(req.query.path);
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) return res.download(filePath);
        res.status(404).json({ error: 'ไม่พบไฟล์ที่ต้องการ' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.delete('/api/files', (req, res) => {
    try {
        const targetPath = resolveUploadPath(req.query.path);
        if (targetPath === UPLOAD_ROOT) return res.status(403).json({ error: 'ไม่สามารถลบโฟลเดอร์หลักได้' });
        if (!fs.existsSync(targetPath)) return res.status(404).json({ error: 'ไม่พบไฟล์หรือโฟลเดอร์นี้' });
        const stat = fs.statSync(targetPath);
        if (stat.isDirectory()) fs.rmSync(targetPath, { recursive: true, force: true });
        else fs.unlinkSync(targetPath);
        res.json({ success: true, message: 'ลบรายการเรียบร้อยแล้ว' });
    } catch (error) {
        res.status(400).json({ error: error.message || 'ลบรายการไม่สำเร็จ' });
    }
});

app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
