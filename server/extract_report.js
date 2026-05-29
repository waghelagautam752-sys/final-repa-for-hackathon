import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, 'caresync.db');

const db = new Database(DB_PATH);

try {
  // Query the most recently uploaded medical history item with a file attachment
  const row = db.prepare(`
    SELECT id, title, file_name, file_type, file_data, content
    FROM medical_history
    WHERE file_data IS NOT NULL
    ORDER BY id DESC
    LIMIT 1
  `).get();

  if (!row) {
    console.log('❌ No report files found in the medical_history database.');
    process.exit(0);
  }

  console.log(`\n📋 Found Latest Report: "${row.title}" (ID: ${row.id})`);
  console.log(`📄 Filename: ${row.file_name} (${row.file_type})`);
  console.log(`✍️ Current Content: "${row.content ? row.content.substring(0, 100) + '...' : 'None'}"`);

  // Write blob to temporary file on disk
  const ext = path.extname(row.file_name) || '.png';
  const outPath = path.join(__dirname, `extracted_report${ext}`);
  fs.writeFileSync(outPath, row.file_data);

  console.log(`\n💾 Binary report successfully extracted and saved to:`);
  console.log(`🔗 file://${outPath}`);
  console.log(`\nReady for analysis! Run your view_file tool on this path to see it.\n`);

} catch (err) {
  console.error('❌ Failed to extract report:', err);
}
db.close();
