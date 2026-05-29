import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, 'caresync.db');

const db = new Database(DB_PATH);

const args = process.argv.slice(2);
const recordId = args[0];
const summaryText = args.slice(1).join(' ');

if (!recordId || !summaryText) {
  console.log('❌ Usage: node server/update_report_summary.js <record_id> <summary_text>');
  process.exit(1);
}

try {
  const result = db.prepare(`
    UPDATE medical_history
    SET content = ?
    WHERE id = ?
  `).run(summaryText, recordId);

  if (result.changes > 0) {
    console.log(`\n✅ Success! Updated summary for report ID: ${recordId}`);
    console.log(`📝 Summary saved:\n\n${summaryText}\n`);
  } else {
    console.log(`❌ Failed: No report row found with ID: ${recordId}`);
  }

} catch (err) {
  console.error('❌ Failed to update database:', err);
}
db.close();
