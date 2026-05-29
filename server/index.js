/**
 * CareSync Express API Server
 * Full feature server: auth, medications, dose logs, settings, medical history.
 */
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execPromise = promisify(exec);
import {
  createUser, getUserByEmail, listUsers,
  getMedicationsByUser, addMedication,
  logDose, getDoseLogs, countDoses,
  saveSettings, loadSettings,
  addMedicalHistory, getMedicalHistory, getMedicalHistoryFile, deleteMedicalRecord,
} from './db.js';

const app = express();
const PORT = process.env.PORT || 3001;

async function convertDocumentToMarkdown(fileBuffer, originalName) {
  const tempDir = path.join(__dirname, 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const ext = path.extname(originalName) || '.txt';
  const tempFileName = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}${ext}`;
  const tempFilePath = path.join(tempDir, tempFileName);

  try {
    fs.writeFileSync(tempFilePath, fileBuffer);
    const { stdout, stderr } = await execPromise(`python -m markitdown "${tempFilePath}"`);
    if (stderr && stderr.trim()) {
      console.warn('[Markitdown Warning/Error]:', stderr);
    }
    return stdout;
  } catch (err) {
    console.error('[Markitdown Execution Failed]:', err);
    throw new Error(`Failed to convert document: ${err.message}`);
  } finally {
    try {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    } catch (e) {
      console.error('[Markitdown Cleanup Failed]:', e);
    }
  }
}

// ──── Middleware ────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '50mb' })); // allow large file payloads
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ──── Health Check ─────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ──── Signup ───────────────────────────────────────────────────
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { fullName, email, password } = req.body;
    if (!fullName?.trim() || !email?.trim() || !password?.trim())
      return res.status(400).json({ error: 'All fields are required.' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });

    const existing = getUserByEmail(email.trim().toLowerCase());
    if (existing)
      return res.status(409).json({ error: 'An account with this email already exists.' });

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);
    const result = createUser({ fullName: fullName.trim(), email: email.trim().toLowerCase(), password: hashedPassword });

    console.log(`✅ New user created: ${email} (ID: ${result.lastInsertRowid})`);
    res.status(201).json({
      message: 'Account created successfully.',
      user: { id: result.lastInsertRowid, fullName: fullName.trim(), email: email.trim().toLowerCase() },
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ──── Login ────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email?.trim() || !password?.trim())
      return res.status(400).json({ error: 'Email and password are required.' });

    const user = getUserByEmail(email.trim().toLowerCase());
    if (!user)
      return res.status(401).json({ error: 'No account found with this email. Please sign up first.' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(401).json({ error: 'Incorrect password. Please try again.' });

    console.log(`🔑 User logged in: ${email}`);
    res.json({
      message: 'Login successful.',
      user: { id: user.id, fullName: user.full_name, email: user.email, createdAt: user.created_at },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ──── Medications ──────────────────────────────────────────────
app.get('/api/medications/:userId', (req, res) => {
  try {
    res.json(getMedicationsByUser(req.params.userId));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

app.post('/api/medications', (req, res) => {
  try {
    const { userId, name, dosage, frequency, timeOfDay, reason } = req.body;
    if (!userId || !name) return res.status(400).json({ error: 'userId and name are required' });
    const result = addMedication({ userId, name, dosage, frequency, timeOfDay, reason });
    res.status(201).json({ id: result.lastInsertRowid, message: 'Medication added successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ──── Dose Logs (Weekly Progress) ─────────────────────────────
app.post('/api/dose-logs', (req, res) => {
  try {
    const { userId, medName, weekKey } = req.body;
    if (!userId || !medName || !weekKey)
      return res.status(400).json({ error: 'userId, medName, and weekKey are required.' });
    const result = logDose(userId, medName, weekKey);
    res.status(201).json({ id: result.lastInsertRowid, message: 'Dose logged.' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

app.get('/api/dose-logs/:userId/:weekKey', (req, res) => {
  try {
    const { userId, weekKey } = req.params;
    const logs = getDoseLogs(userId, weekKey);
    const countResult = countDoses(userId, weekKey);
    res.json({ logs, count: countResult.count });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ──── User Settings ────────────────────────────────────────────
app.get('/api/settings/:userId', (req, res) => {
  try {
    const settings = loadSettings(req.params.userId);
    res.json(settings || {});
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

app.post('/api/settings', (req, res) => {
  try {
    const s = req.body;
    if (!s.userId) return res.status(400).json({ error: 'userId is required.' });
    saveSettings({
      userId: s.userId,
      theme: s.theme ?? 'light',
      notificationsEnabled: s.notificationsEnabled ?? 1,
      notificationSound: s.notificationSound ?? 1,
      dataEncryption: s.dataEncryption ?? 1,
      twoFactorAuth: s.twoFactorAuth ?? 0,
      autoLogoutMins: s.autoLogoutMins ?? 30,
      aiModel: s.aiModel ?? 'gemini-2.0-flash',
      language: s.language ?? 'en',
      fontSize: s.fontSize ?? 'medium',
      compactMode: s.compactMode ?? 0,
      shareAnalytics: s.shareAnalytics ?? 0,
    });
    res.json({ message: 'Settings saved.' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ──── Medical History ──────────────────────────────────────────
app.get('/api/medical-history/:userId', (req, res) => {
  try {
    const records = getMedicalHistory(req.params.userId);
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

app.post('/api/medical-history', async (req, res) => {
  try {
    const { userId, title, category, content, fileName, fileType, fileData, notes } = req.body;
    if (!userId || !title) return res.status(400).json({ error: 'userId and title are required.' });

    let finalContent = content;
    const buffer = fileData ? Buffer.from(fileData, 'base64') : null;

    // If no text content is provided, but a document file is attached, run markitdown to generate content
    if (!finalContent && buffer && fileName) {
      const ext = path.extname(fileName).toLowerCase();
      const documentExtensions = ['.pdf', '.docx', '.xlsx', '.pptx', '.txt', '.csv', '.doc', '.xls', '.ppt'];
      if (documentExtensions.includes(ext)) {
        try {
          console.log(`[Server] Parsing uploaded file: ${fileName} via markitdown...`);
          finalContent = await convertDocumentToMarkdown(buffer, fileName);
          console.log(`[Server] File parsing complete. Converted length: ${finalContent.length}`);
        } catch (convErr) {
          console.error('[Server] Failed to auto-parse file to markdown:', convErr);
        }
      }
    }

    const result = addMedicalHistory({
      userId, title, category: category || 'general',
      content: finalContent || null,
      fileName: fileName || null,
      fileType: fileType || null,
      fileData: buffer,
      isEncrypted: 1, // flag as encrypted in future
      notes: notes || null,
    });
    res.status(201).json({ id: result.lastInsertRowid, message: 'Record saved.' });
  } catch (err) {
    console.error('Medical history save error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Endpoint to convert general chat attachments to Markdown
app.post('/api/convert-document', async (req, res) => {
  try {
    const { fileName, fileType, fileData } = req.body;
    if (!fileData) {
      return res.status(400).json({ error: 'fileData is required.' });
    }
    const buffer = Buffer.from(fileData, 'base64');
    const markdown = await convertDocumentToMarkdown(buffer, fileName || 'document.txt');
    res.json({ markdown });
  } catch (err) {
    console.error('Document conversion route error:', err);
    res.status(500).json({ error: err.message || 'Internal server error.' });
  }
});

// Download a file from medical history
app.get('/api/medical-history/:userId/file/:id', (req, res) => {
  try {
    const { userId, id } = req.params;
    const record = getMedicalHistoryFile(id, userId);
    if (!record || !record.file_data)
      return res.status(404).json({ error: 'File not found.' });
    res.setHeader('Content-Type', record.file_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${record.file_name || 'download'}"`);
    res.send(record.file_data);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

app.delete('/api/medical-history/:userId/:id', (req, res) => {
  try {
    const { userId, id } = req.params;
    deleteMedicalRecord(id, userId);
    res.json({ message: 'Record deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ──── Serve Frontend (Production) ─────────────────────────────
const distPath = path.join(__dirname, '..', 'dist');

console.log(`[Server] Static files path: ${distPath}`);
if (fs.existsSync(distPath)) {
  console.log(`[Server] Serving static files from: ${distPath}`);
  app.use(express.static(distPath));
  // Catch-all middleware to serve the frontend
  app.use((req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(distPath, 'index.html'));
    } else {
      res.status(404).json({ error: 'API route not found' });
    }
  });
} else {
  console.warn(`[Server] Warning: dist/ folder not found at ${distPath}. If this is development, ignore this.`);
}

// ──── Start Server ─────────────────────────────────────────────
try {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 CareSync API server running on port ${PORT}`);
    console.log(`📦 Database path: server/caresync.db`);
    console.log(`📋 API and Static serving ready\n`);
  });
} catch (err) {
  console.error('[Server] Failed to start server:', err);
  process.exit(1);
}
