const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

const app    = express();
const PORT   = 3000;

// Multer: store uploads in /uploads folder
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.csv' || ext === '.txt') cb(null, true);
    else cb(new Error('Only .csv or .txt files are allowed'));
  }
});

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));

// POST /upload — parse CSV and return JSON
app.post('/upload', upload.single('csvFile'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  const filePath = req.file.path;
  const content  = fs.readFileSync(filePath, 'utf-8');

  // Auto-skip SharePoint schema row
  let lines = content.split(/\r?\n/);
  if (lines[0] && (lines[0].includes('ListSchema') || lines[0].includes('schemaXml'))) {
    lines = lines.slice(1);
  }

  const nonEmpty = lines.filter(l => l.trim());
  if (nonEmpty.length < 2) {
    fs.unlinkSync(filePath);
    return res.status(400).json({ error: 'File appears empty or invalid.' });
  }

  // Parse header
  const headers = parseCSVLine(nonEmpty[0]).map(h => h.trim().replace(/^"|"$/g, ''));

  // Parse data rows
  const rows = [];
  for (let i = 1; i < nonEmpty.length; i++) {
    const cols = parseCSVLine(nonEmpty[i]);
    const row  = {};
    headers.forEach((h, idx) => {
      row[h] = (cols[idx] || '').trim().replace(/^"|"$/g, '');
    });
    rows.push(row);
  }

  // Only return columns that have at least some data
  const activeCols = headers.filter(h =>
    h && rows.some(r => r[h] && r[h].trim())
  );

  fs.unlinkSync(filePath);
  res.json({ headers: activeCols, rows, filename: req.file.originalname });
});

// POST /convert — generate readable TXT
app.post('/convert', express.json({ limit: '20mb' }), (req, res) => {
  const { rows, cols, title, maxLen, stripHtml } = req.body;

  if (!rows || !cols || cols.length === 0) {
    return res.status(400).json({ error: 'Missing data or columns.' });
  }

  function clean(val) {
    if (!val) return '';
    if (stripHtml) {
      val = val.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      val = val
        .replace(/&#39;/g,  "'")
        .replace(/&amp;/g,  '&')
        .replace(/&lt;/g,   '<')
        .replace(/&gt;/g,   '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/&quot;/g, '"');
    }
    if (val.length > maxLen) val = val.substring(0, maxLen) + '...';
    return val;
  }

  const sep  = '═'.repeat(72);
  const dash = '─'.repeat(50);
  const out  = [];

  out.push(sep);
  out.push(` ${(title || 'Data Report').toUpperCase()}`);
  out.push(` Generated: ${new Date().toLocaleString()}`);
  out.push(sep);

  let count = 0;
  rows.forEach(row => {
    const hasData = cols.some(c => row[c] && row[c].trim());
    if (!hasData) return;
    count++;
    out.push('');
    out.push(` RECORD #${count}`);
    out.push(dash);
    cols.forEach(col => {
      const val = clean(row[col] || '');
      if (val) out.push(`  ${col.padEnd(26)}: ${val}`);
    });
  });

  out.push('');
  out.push(sep);
  out.push(` Total Records: ${count}`);
  out.push(sep);

  const output = out.join('\n');

  const outName = (title || 'output').replace(/\s+/g, '_') + '_readable.txt';
  res.setHeader('Content-Disposition', `attachment; filename="${outName}"`);
  res.setHeader('Content-Type', 'text/plain');
  res.send(output);
});

// CSV line parser
function parseCSVLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === ',' && !inQ) {
      result.push(cur); cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur);
  return result;
}

// Start server
app.listen(PORT, () => {
  console.log(`\n✅ Server running at http://localhost:${PORT}\n`);
});