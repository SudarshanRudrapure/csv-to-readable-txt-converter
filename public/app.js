// State
let parsedHeaders = [];
let parsedRows    = [];
let selectedCols  = new Set();
let convertedText = '';

// DOM refs
const dropZone      = document.getElementById('dropZone');
const fileInput     = document.getElementById('fileInput');
const uploadSection = document.getElementById('uploadSection');
const configSection = document.getElementById('configSection');
const resultSection = document.getElementById('resultSection');
const errorBar      = document.getElementById('errorBar');
const loader        = document.getElementById('loader');

// Drag & Drop
dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) uploadFile(file);
});

fileInput.addEventListener('change', e => {
  if (e.target.files[0]) uploadFile(e.target.files[0]);
});

// Upload file to server
async function uploadFile(file) {
  showError('');

  const ext = file.name.split('.').pop().toLowerCase();
  if (ext !== 'csv' && ext !== 'txt') {
    showError('Please upload a .csv or .txt file.');
    return;
  }

  showLoader(true);

  const formData = new FormData();
  formData.append('csvFile', file);

  try {
    const res  = await fetch('/upload', { method: 'POST', body: formData });
    const data = await res.json();

    if (!res.ok) {
      showError(data.error || 'Upload failed.');
      showLoader(false);
      return;
    }

    parsedHeaders = data.headers;
    parsedRows    = data.rows;

    const baseName = data.filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
    document.getElementById('reportTitle').value = baseName;
    document.getElementById('outFilename').value = baseName.replace(/\s+/g, '_') + '_readable';

    buildColumnChips(parsedHeaders);

    uploadSection.style.display = 'none';
    configSection.style.display = 'block';
    setStep(2);

  } catch (err) {
    showError('Server error. Make sure the server is running.');
  } finally {
    showLoader(false);
  }
}

// Build column toggle chips
function buildColumnChips(headers) {
  selectedCols = new Set(headers);
  const container = document.getElementById('colChips');
  container.innerHTML = '';

  headers.forEach(col => {
    const chip = document.createElement('span');
    chip.className   = 'col-chip active';
    chip.textContent = col;
    chip.dataset.col = col;

    chip.addEventListener('click', () => {
      if (selectedCols.has(col)) {
        selectedCols.delete(col);
        chip.classList.remove('active');
      } else {
        selectedCols.add(col);
        chip.classList.add('active');
      }
    });

    container.appendChild(chip);
  });
}

// Convert: send to server, get TXT back
async function doConvert() {
  if (selectedCols.size === 0) {
    showError('Please select at least one column.');
    return;
  }

  showError('');
  showLoader(true);
  document.getElementById('btnConvert').disabled = true;

  const payload = {
    rows:      parsedRows,
    cols:      [...selectedCols],
    title:     document.getElementById('reportTitle').value || 'Data Report',
    maxLen:    parseInt(document.getElementById('maxLen').value),
    stripHtml: document.getElementById('stripHtml').value === 'true'
  };

  try {
    const res = await fetch('/convert', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      showError(err.error || 'Conversion failed.');
      return;
    }

    convertedText = await res.text();

    const recordCount = (convertedText.match(/^ RECORD #\d+/gm) || []).length;

    document.getElementById('statsRow').innerHTML = `
      <div class="stat-pill">Records: <b>${recordCount}</b></div>
      <div class="stat-pill">Columns: <b>${payload.cols.length}</b></div>
      <div class="stat-pill">Size: <b>${formatSize(new Blob([convertedText]).size)}</b></div>
    `;

    const lines = convertedText.split('\n');
    document.getElementById('previewArea').textContent =
      lines.slice(0, 60).join('\n') + (lines.length > 60 ? '\n...' : '');

    configSection.style.display = 'none';
    resultSection.style.display = 'block';
    setStep(3);

  } catch (err) {
    showError('Server error during conversion.');
  } finally {
    showLoader(false);
    document.getElementById('btnConvert').disabled = false;
  }
}


// Download TXT
function downloadFile() {
  if (!convertedText) return;

  const filename = (document.getElementById('outFilename').value || 'output_readable') + '.txt';
  const blob = new Blob([convertedText], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);

  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}


// Reset everything
function resetAll() {
  parsedHeaders = [];
  parsedRows    = [];
  selectedCols  = new Set();
  convertedText = '';

  fileInput.value = '';
  showError('');

  uploadSection.style.display = 'block';
  configSection.style.display = 'none';
  resultSection.style.display = 'none';
  setStep(1);
}


// Helpers
function setStep(n) {
  [1, 2, 3].forEach(i => {
    document.getElementById('step' + i).classList.toggle('active', i <= n);
  });
}

function showError(msg) {
  if (msg) {
    errorBar.textContent   = '⚠ ' + msg;
    errorBar.style.display = 'block';
  } else {
    errorBar.style.display = 'none';
  }
}

function showLoader(show) {
  loader.style.display = show ? 'flex' : 'none';
}

function formatSize(bytes) {
  if (bytes < 1024)        return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}