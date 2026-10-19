const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const os = require('os');
const QRCode = require('qrcode');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const UPLOAD_ROOT = path.resolve(__dirname, 'uploads');

function getLanIPv4Addresses() {
    const addresses = Object.values(os.networkInterfaces()).flatMap(interfaces => interfaces || [])
        .filter(info => !info.internal && (info.family === 'IPv4' || info.family === 4))
        .map(info => info.address)
        .filter(address => {
            const octets = address.split('.').map(Number);
            return octets[0] === 10 ||
                (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
                (octets[0] === 192 && octets[1] === 168);
        });
    return [...new Set(addresses)];
}

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

function getUploadDirectory(req) {
    const folderName = typeof req.body?.folderName === 'string' ? req.body.folderName : '';
    return resolveUploadPath(folderName);
}

function uniqueFileName(directory, originalName) {
    if (typeof directory !== 'string') throw new Error('Upload destination is unavailable.');
    const sourceName = typeof originalName === 'string' && originalName.length ? originalName : 'uploaded-file';
    const safeName = path.basename(sourceName).replace(/[<>:"|?*\x00-\x1f]/g, '_') || 'file';
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
            const destination = getUploadDirectory(req);
            fs.mkdirSync(destination, { recursive: true });
            callback(null, destination);
        } catch (error) {
            callback(error);
        }
    },
    filename(req, file, callback) {
        try {
            const destination = getUploadDirectory(req);
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
                    results.push({ name, path: relativePath, type: 'file', size: stat.size, modifiedAt: stat.mtime.toISOString() });
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

app.get('/api/share', async (req, res) => {
    try {
        const addresses = getLanIPv4Addresses();
        if (!addresses.length) return res.status(503).json({ error: 'ไม่พบ IPv4 ในเครือข่าย LAN' });
        const requestedIp = typeof req.query.ip === 'string' ? req.query.ip : '';
        if (requestedIp && !addresses.includes(requestedIp)) {
            return res.status(400).json({ error: 'ไม่พบ IP นี้ในรายการเครือข่ายของเครื่อง' });
        }
        const ip = requestedIp || addresses[0];
        const url = `http://${ip}:${PORT}/`;
        const qrCode = await QRCode.toDataURL(url, {
            errorCorrectionLevel: 'M',
            margin: 2,
            width: 260,
            color: { dark: '#182235', light: '#ffffff' }
        });
        res.json({ addresses, ip, url, qrCode });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'สร้าง QR code ไม่สำเร็จ' });
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

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://localhost:${PORT}`);
    const addresses = getLanIPv4Addresses();
    if (addresses.length) addresses.forEach(address => console.log(`LAN access: http://${address}:${PORT}`));
    else console.log('No private LAN IPv4 address found.');
});
