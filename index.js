const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QR = require('qrcode');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const multer = require('multer');
require('dotenv').config();

// Resolve a sensible Chromium/Chrome executable path per-OS
function resolveBrowserExecutablePath() {
    // If user provided an explicit path, respect it
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        return process.env.PUPPETEER_EXECUTABLE_PATH;
    }
    const platform = process.platform;
    if (platform === 'linux') {
        // Default path inside our Docker image
        return '/usr/bin/chromium-browser';
    }
    if (platform === 'win32') {
        const candidates = [
            // Chrome
            'C:/Program Files/Google/Chrome/Application/chrome.exe',
            'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
            // Edge (Puppeteer can drive Chromium-based Edge too)
            'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
            'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
        ];
        for (const p of candidates) {
            try { if (fs.existsSync(p)) return p; } catch (_) {}
        }
        return null; // Let Puppeteer try its default (may fail with puppeteer-core)
    }
    if (platform === 'darwin') {
        const candidates = [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
        ];
        for (const p of candidates) {
            try { if (fs.existsSync(p)) return p; } catch (_) {}
        }
        return null;
    }
    return null;
}
const RESOLVED_BROWSER_PATH = resolveBrowserExecutablePath();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors({
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST", "DELETE"]
}));
app.use(express.json());
app.use(express.static('public'));

// Multipart/form-data upload (memory storage)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        // 16MB default max size; adjust if you need larger media
        fileSize: 16 * 1024 * 1024
    }
});

// Clean up common Chromium/Puppeteer temp profile lock files (container-safe)
try {
    const tmpDir = '/tmp';
    const candidates = [
        // Puppeteer temp profiles
        'puppeteer_dev_profile-',
        'puppeteer-',
        // Chromium leftover locks
        '.org.chromium.',
        'SingletonLock',
        'SingletonCookie',
        'SingletonSocket'
    ];
    const entries = fs.readdirSync(tmpDir);
    for (const entry of entries) {
        if (candidates.some(prefix => entry.startsWith(prefix))) {
            const target = path.join(tmpDir, entry);
            try { fs.removeSync(target); } catch (_) { /* ignore */ }
        }
    }
} catch (e) {
    console.warn('Chromium temp cleanup warning:', e.message);
}

// Ensure dedicated Chrome user data directory exists and is clean of locks
const CHROME_USER_DATA_DIR = path.join(__dirname, 'chrome-data');
try {
    fs.ensureDirSync(CHROME_USER_DATA_DIR);
    const lockFiles = [
        'SingletonLock',
        'SingletonCookie',
        'SingletonSocket',
        'LOCK',
    ];
    for (const name of lockFiles) {
        const p = path.join(CHROME_USER_DATA_DIR, name);
        try { if (fs.existsSync(p)) fs.removeSync(p); } catch (_) { /* ignore */ }
    }
    // Also purge any org.chromium.* remnants
    try {
        const entries = fs.readdirSync(CHROME_USER_DATA_DIR);
        for (const entry of entries) {
            if (entry.startsWith('.org.chromium.')) {
                try { fs.removeSync(path.join(CHROME_USER_DATA_DIR, entry)); } catch (_) { /* ignore */ }
            }
        }
    } catch (_) {}
} catch (e) {
    console.warn('Chrome user-data dir init warning:', e.message);
}

// WhatsApp client configuration
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: process.env.WHATSAPP_CLIENT_ID || "whatsapp-qr-scanner"
    }),
    puppeteer: {
        headless: true,
        executablePath: RESOLVED_BROWSER_PATH || undefined,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--password-store=basic',
            '--use-mock-keychain',
            `--user-data-dir=${CHROME_USER_DATA_DIR}`,
            '--profile-directory=Default'
        ]
    }
});

// Global variables
let isClientReady = false;
let currentQR = null;
let currentQrPng = null;
let isInitializing = false;
let reinitTimeout = null;

// Master key configuration
const MASTER_KEY = process.env.MASTER_KEY || 'default_master_key_change_this';

// Base URL configuration
const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

// API key management
const API_KEYS_FILE = path.join(__dirname, 'api-keys.json');

function loadApiKeys() {
    try {
        if (fs.existsSync(API_KEYS_FILE)) {
            return JSON.parse(fs.readFileSync(API_KEYS_FILE, 'utf8'));
        }
        return {};
    } catch (error) {
        console.error('Error loading API keys:', error);
        return {};
    }
}

function saveApiKeys(apiKeys) {
    try {
        fs.writeFileSync(API_KEYS_FILE, JSON.stringify(apiKeys, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving API keys:', error);
        return false;
    }
}

function generateApiKey() {
    return 'wk_' + Math.random().toString(36).substr(2, 9) + '_' + Math.random().toString(36).substr(2, 9);
}

function validateApiKey(apiKey) {
    const apiKeys = loadApiKeys();
    return apiKeys[apiKey] && apiKeys[apiKey].active === true;
}

// Middleware to validate API key
function requireApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;
    
    if (!apiKey) {
        return res.status(401).json({ error: 'API key is required' });
    }
    
    if (!validateApiKey(apiKey)) {
        return res.status(401).json({ error: 'Invalid API key' });
    }
    
    // Update last used timestamp (only if more than 1 minute has passed)
    const apiKeys = loadApiKeys();
    if (apiKeys[apiKey]) {
        const now = new Date();
        const lastUsed = apiKeys[apiKey].lastUsed ? new Date(apiKeys[apiKey].lastUsed) : new Date(0);
        const timeDiff = now - lastUsed;
        
        // Only update if more than 1 minute has passed (to reduce file writes)
        if (timeDiff > 60000) {
            apiKeys[apiKey].lastUsed = now.toISOString();
            saveApiKeys(apiKeys);
        }
    }
    
    next();
}

function scheduleReinitialize(delayMs = 2000, reason = 'unknown') {
    if (reinitTimeout) {
        return;
    }
    console.log(`Scheduling client reinitialization in ${delayMs}ms (reason: ${reason})`);
    io.emit('reinitializing', { message: 'Reconnecting to WhatsApp...', reason });
    reinitTimeout = setTimeout(async () => {
        reinitTimeout = null;
        if (isInitializing) {
            return;
        }
        try {
            isInitializing = true;
            await client.initialize();
        } catch (error) {
            console.error('Error during initialize:', error);
            // try again with backoff
            scheduleReinitialize(Math.min(delayMs * 2, 30000), 'initialize_error');
        } finally {
            isInitializing = false;
        }
    }, delayMs);
}

// WhatsApp client events
client.on('qr', (qr) => {
    console.log('QR Code received, scan with your WhatsApp app');
    qrcode.generate(qr, { small: true });
    currentQR = qr;
    // keep latest QR available for reconnects
    // Generate PNG data URL server-side for robust browser display
    QR.toDataURL(qr, { width: 256, margin: 2 }, (err, url) => {
        if (err) {
            console.error('Failed to generate PNG QR:', err.message);
            currentQrPng = null;
            io.emit('qr', { text: qr });
            return;
        }
        currentQrPng = url;
        io.emit('qr', { text: qr, png: url });
    });
});

client.on('ready', () => {
    console.log('WhatsApp client is ready!');
    isClientReady = true;
    currentQR = null;
    io.emit('ready', { message: 'WhatsApp client is ready!' });
});

client.on('authenticated', () => {
    console.log('WhatsApp client authenticated');
    io.emit('authenticated', { message: 'WhatsApp client authenticated' });
});

client.on('auth_failure', (msg) => {
    console.error('Authentication failed:', msg);
    io.emit('auth_failure', { message: 'Authentication failed: ' + msg });
});

client.on('disconnected', (reason) => {
    console.log('WhatsApp client disconnected:', reason);
    isClientReady = false;
    currentQR = null;
    
    // Instead of showing error, reinitialize to show QR code again
    console.log('Session timed out. Reinitializing to show QR code...');
    io.emit('session_timeout', { message: 'Session timed out. Please scan QR code again.' });
    scheduleReinitialize(2000, 'disconnected');
});

// API Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Get configuration endpoint
app.get('/api/config', (req, res) => {
    res.json({
        baseUrl: BASE_URL,
        corsOrigin: process.env.CORS_ORIGIN || "*"
    });
});

// Generate API key endpoint
app.post('/api/generate-key', (req, res) => {
    const { masterKey } = req.body;
    
    if (!masterKey) {
        return res.status(400).json({ error: 'Master key is required' });
    }
    
    if (masterKey !== MASTER_KEY) {
        return res.status(401).json({ error: 'Invalid master key' });
    }
    
    try {
        const apiKey = generateApiKey();
        const apiKeys = loadApiKeys();
        
        apiKeys[apiKey] = {
            active: true,
            created: new Date().toISOString(),
            lastUsed: null
        };
        
        if (saveApiKeys(apiKeys)) {
            res.json({ 
                success: true, 
                apiKey: apiKey,
                message: 'API key generated successfully' 
            });
        } else {
            res.status(500).json({ error: 'Failed to save API key' });
        }
    } catch (error) {
        console.error('Error generating API key:', error);
        res.status(500).json({ error: 'Failed to generate API key: ' + error.message });
    }
});

app.get('/api/status', requireApiKey, (req, res) => {
    res.json({
        ready: isClientReady,
        qr: currentQR,
        qrPng: currentQrPng
    });
});

app.post('/api/send-message', requireApiKey, upload.single('media'), async (req, res) => {
    if (!isClientReady) {
        return res.status(400).json({ error: 'WhatsApp client is not ready' });
    }

    // Support both JSON and multipart/form-data
    const number = req.body.number;
    const message = req.body.message;

    if (!number || !message) {
        return res.status(400).json({ error: 'Number and message are required' });
    }

    try {
        // Format number (remove any non-digit characters and add country code if needed)
        const cleanNumber = number.replace(/\D/g, '');
        const chatId = cleanNumber.includes('@c.us') ? cleanNumber : `${cleanNumber}@c.us`;

        // Build media from either uploaded file (multipart) or JSON body
        const hasUpload = !!req.file;
        const bodyMedia = req.body.media ? (() => {
            try { return typeof req.body.media === 'string' ? JSON.parse(req.body.media) : req.body.media; } catch (_) { return null; }
        })() : null;

        if (hasUpload) {
            const file = req.file;
            const base64 = file.buffer.toString('base64');
            const mediaMessage = new MessageMedia(file.mimetype, base64, file.originalname);
            await client.sendMessage(chatId, mediaMessage, { caption: message });
        } else if (bodyMedia && bodyMedia.data && bodyMedia.mimetype) {
            const mediaMessage = new MessageMedia(bodyMedia.mimetype, bodyMedia.data, bodyMedia.filename || 'file');
            await client.sendMessage(chatId, mediaMessage, { caption: message });
        } else {
            await client.sendMessage(chatId, message);
        }

        res.json({ success: true, message: 'Message sent successfully' });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ error: 'Failed to send message: ' + error.message });
    }
});

app.post('/api/send-broadcast', requireApiKey, async (req, res) => {
    if (!isClientReady) {
        return res.status(400).json({ error: 'WhatsApp client is not ready' });
    }

    const { numbers, message, media } = req.body;

    if (!numbers || !Array.isArray(numbers) || numbers.length === 0) {
        return res.status(400).json({ error: 'Numbers array is required' });
    }

    if (!message) {
        return res.status(400).json({ error: 'Message is required' });
    }

    try {
        const results = [];
        
        for (const number of numbers) {
            try {
                const cleanNumber = number.replace(/\D/g, '');
                const chatId = cleanNumber.includes('@c.us') ? cleanNumber : `${cleanNumber}@c.us`;

                if (media) {
                    const mediaMessage = new MessageMedia(media.mimetype, media.data, media.filename);
                    await client.sendMessage(chatId, mediaMessage, { caption: message });
                } else {
                    await client.sendMessage(chatId, message);
                }

                results.push({ number, status: 'success' });
            } catch (error) {
                results.push({ number, status: 'error', error: error.message });
            }
        }

        res.json({ success: true, results });
    } catch (error) {
        console.error('Error sending broadcast:', error);
        res.status(500).json({ error: 'Failed to send broadcast: ' + error.message });
    }
});

app.get('/api/contacts', requireApiKey, async (req, res) => {
    if (!isClientReady) {
        return res.status(400).json({ error: 'WhatsApp client is not ready' });
    }

    try {
        const contacts = await client.getContacts();
        res.json(contacts);
    } catch (error) {
        console.error('Error getting contacts:', error);
        res.status(500).json({ error: 'Failed to get contacts: ' + error.message });
    }
});

// Get all groups
app.get('/api/groups', requireApiKey, async (req, res) => {
    if (!isClientReady) {
        return res.status(400).json({ error: 'WhatsApp client is not ready' });
    }

    try {
        const chats = await client.getChats();
        const groupChats = chats.filter(chat => chat.isGroup);
        
        const formattedGroups = groupChats.map(group => ({
            id: group.id._serialized || group.id,
            name: group.name || group.subject || 'Unknown Group',
            subject: group.subject,
            isGroup: group.isGroup,
            participants: group.participants ? group.participants.length : 0,
            unreadCount: group.unreadCount || 0
        }));

        res.json(formattedGroups);
    } catch (error) {
        console.error('Error getting groups:', error);
        res.status(500).json({ error: 'Failed to get groups: ' + error.message });
    }
});

// Send message to group
app.post('/api/send-group-message', requireApiKey, async (req, res) => {
    if (!isClientReady) {
        return res.status(400).json({ error: 'WhatsApp client is not ready' });
    }

    const { groupId, message, media } = req.body;

    if (!groupId || !message) {
        return res.status(400).json({ error: 'Group ID and message are required' });
    }

    try {
        const chatId = groupId.includes('@g.us') ? groupId : `${groupId}@g.us`;

        if (media) {
            const mediaMessage = new MessageMedia(media.mimetype, media.data, media.filename);
            await client.sendMessage(chatId, mediaMessage, { caption: message });
        } else {
            await client.sendMessage(chatId, message);
        }

        res.json({ success: true, message: 'Group message sent successfully' });
    } catch (error) {
        console.error('Error sending group message:', error);
        res.status(500).json({ error: 'Failed to send group message: ' + error.message });
    }
});

// Get client info
app.get('/api/client-info', requireApiKey, async (req, res) => {
    if (!isClientReady) {
        return res.status(400).json({ error: 'WhatsApp client is not ready' });
    }

    try {
        const info = await client.info;
        
        // Get profile picture - simplified approach
        let profilePicture = null;
        try {
            // Convert wid to string if it's not already
            const widString = info.wid ? info.wid.toString() : '';
            if (widString) {
                // Try to get profile picture with timeout
                const profilePicPromise = client.getProfilePicUrl(widString);
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Profile picture timeout')), 5000)
                );
                
                const profilePicUrl = await Promise.race([profilePicPromise, timeoutPromise]);
                if (profilePicUrl && typeof profilePicUrl === 'string' && profilePicUrl.length > 0) {
                    console.log('Profile picture URL found:', profilePicUrl);
                    profilePicture = profilePicUrl;
                } else {
                    console.log('No profile picture URL returned or empty string');
                }
            }
        } catch (picError) {
            console.log('Profile picture not available (this is normal):', picError.message);
            // This is expected for many users, so we don't treat it as an error
        }

        // Format WhatsApp ID for better display
        console.log('Raw info.wid:', info.wid);
        console.log('Type of info.wid:', typeof info.wid);
        
        let formattedWid = '';
        if (info.wid) {
            if (typeof info.wid === 'string') {
                formattedWid = info.wid.replace('@c.us', '');
            } else if (info.wid._serialized) {
                // If it's an object with _serialized property
                formattedWid = info.wid._serialized.replace('@c.us', '');
            } else if (info.wid.user) {
                // If it's an object with user property
                formattedWid = info.wid.user;
            } else {
                // Fallback: convert to string and clean up
                formattedWid = info.wid.toString().replace('@c.us', '');
            }
        }
        
        console.log('Formatted WID:', formattedWid);
        
        res.json({
            wid: formattedWid,
            fullWid: info.wid,
            pushname: info.pushname,
            platform: info.platform,
            profilePicture: profilePicture,
            connected: true
        });
    } catch (error) {
        console.error('Error getting client info:', error);
        res.status(500).json({ error: 'Failed to get client info: ' + error.message });
    }
});

// Test profile picture endpoint
app.get('/api/test-profile-pic', requireApiKey, async (req, res) => {
    if (!isClientReady) {
        return res.status(400).json({ error: 'WhatsApp client is not ready' });
    }

    try {
        const info = await client.info;
        console.log('Client info:', info);
        
        const widString = info.wid ? info.wid.toString() : '';
        let profilePicUrl = null;
        
        if (widString) {
            try {
                profilePicUrl = await client.getProfilePicUrl(widString);
                console.log('Profile picture URL:', profilePicUrl);
            } catch (picError) {
                console.log('Error getting profile picture:', picError.message);
            }
        }
        
        res.json({
            wid: widString,
            pushname: info.pushname,
            profilePicUrl: profilePicUrl
        });
    } catch (error) {
        console.error('Error testing profile picture:', error);
        res.status(500).json({ error: 'Failed to test profile picture: ' + error.message });
    }
});

// Webhook management
let webhookUrl = null;

// Set webhook URL
app.post('/api/webhook', requireApiKey, (req, res) => {
    const { url } = req.body;
    webhookUrl = url;
    console.log('Webhook URL set:', webhookUrl);
    res.json({ success: true, message: 'Webhook URL set successfully' });
});

// Get webhook URL
app.get('/api/webhook', requireApiKey, (req, res) => {
    res.json({ webhookUrl });
});

// Delete webhook
app.delete('/api/webhook', requireApiKey, (req, res) => {
    webhookUrl = null;
    console.log('Webhook URL deleted');
    res.json({ success: true, message: 'Webhook URL removed' });
});

// Logout/disconnect
app.post('/api/logout', requireApiKey, async (req, res) => {
    try {
        if (isClientReady) {
            await client.destroy();
            isClientReady = false;
            currentQR = null;
            console.log('WhatsApp client logged out');
        }
        
        // Clear session data to force fresh QR code
        try {
            const sessionPath = path.join(__dirname, '.wwebjs_auth', 'session-whatsapp-qr-scanner');
            const cachePath = path.join(__dirname, '.wwebjs_cache');
            
            if (fs.existsSync(sessionPath)) {
                fs.removeSync(sessionPath);
                console.log('Session data cleared successfully');
            }
            
            if (fs.existsSync(cachePath)) {
                fs.removeSync(cachePath);
                console.log('Cache data cleared successfully');
            }
        } catch (clearError) {
            console.error('Error clearing session data:', clearError);
        }
        
        // Reinitialize client to show QR code again
        setTimeout(() => {
            client.initialize();
        }, 2000);
        
        res.json({ success: true, message: 'Logged out successfully. QR code will appear shortly.' });
    } catch (error) {
        console.error('Error during logout:', error);
        res.status(500).json({ error: 'Failed to logout: ' + error.message });
    }
});

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('Client connected');
    
    // Send current status to newly connected client
    socket.emit('status', {
        ready: isClientReady,
        qr: currentQR,
        qrPng: currentQrPng
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on ${BASE_URL}`);
    console.log('Starting WhatsApp client...');
    client.initialize();
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down...');
    client.destroy();
    server.close();
    process.exit(0);
});
