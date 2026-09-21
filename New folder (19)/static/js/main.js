// ==============================================================================
// HANDWRITTEN ESSAY OCR - CLIENT-SIDE INTERACTIVITY
// ==============================================================================

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const loadingBox = document.getElementById('loadingBox');
const loadingTitle = document.getElementById('loadingTitle');
const loadingSubtitle = document.getElementById('loadingSubtitle');
const resultsSection = document.getElementById('resultsSection');

const statLines = document.getElementById('statLines');
const statWords = document.getElementById('statWords');
const statChars = document.getElementById('statChars');
const statTime = document.getElementById('statTime');
const detectedCountBadge = document.getElementById('detectedCountBadge');

const overlayImage = document.getElementById('overlayImage');
const transcriptionText = document.getElementById('transcriptionText');
const linesContainer = document.getElementById('linesContainer');

const tabFullText = document.getElementById('tabFullText');
const tabLineByLine = document.getElementById('tabLineByLine');

let currentFilename = "essay_transcription.txt";
let progressInterval = null;

// --- Drag & Drop Handlers ---
dropzone.addEventListener('click', () => fileInput.click());

['dragenter', 'dragover'].forEach(event => {
  dropzone.addEventListener(event, (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
});

['dragleave', 'drop'].forEach(event => {
  dropzone.addEventListener(event, (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
  });
});

dropzone.addEventListener('drop', (e) => {
  if (e.dataTransfer.files.length > 0) {
    const file = e.dataTransfer.files[0];
    uploadFile(file);
  }
});

fileInput.addEventListener('change', () => {
  if (fileInput.files.length > 0) {
    const file = fileInput.files[0];
    uploadFile(file);
  }
});

// --- Upload Process ---
function getSelectedSpeedMode() {
  const selected = document.querySelector('input[name="speedMode"]:checked');
  return selected ? selected.value : 'gpu_beam';
}

function uploadFile(file) {
  const formData = new FormData();
  formData.append('image', file);
  formData.append('speed_mode', getSelectedSpeedMode());
  currentFilename = file.name.replace(/\.[^/.]+$/, "") + "_transcription.txt";
  sendTranscriptionRequest(formData);
}

// --- Quick Test Samples ---
function testSample(sampleName) {
  const formData = new FormData();
  formData.append('sample', sampleName);
  formData.append('speed_mode', getSelectedSpeedMode());
  currentFilename = sampleName.replace(/\.[^/.]+$/, "") + "_transcription.txt";
  sendTranscriptionRequest(formData);
}

// Check hardware status on load
fetch('/api/status')
  .then(res => res.json())
  .then(data => {
    const badge = document.getElementById('modelStatusBadge');
    if (badge && data.device_name) {
      badge.innerHTML = `<span class="pulse-dot" style="${data.is_cuda ? 'background: #6366f1; box-shadow: 0 0 10px #6366f1;' : ''}"></span><span>${data.is_cuda ? '⚡ ' : '💻 '}${data.device_name}</span>`;
    }
  })
  .catch(() => {});

// --- Backend Request & Progress Animation ---
function sendTranscriptionRequest(formData) {
  showLoading();
  startProgressMessages();

  fetch('/api/transcribe', {
    method: 'POST',
    body: formData
  })
  .then(res => {
    if (!res.ok) throw new Error(`Server returned error ${res.status}`);
    return res.json();
  })
  .then(data => {
    hideLoading();
    if (data.success) {
      renderResults(data);
    } else {
      alert("Error: " + (data.error || "Failed to transcribe document."));
    }
  })
  .catch(err => {
    hideLoading();
    alert("Connection Error: " + err.message);
  });
}

function startProgressMessages() {
  const steps = [
    { title: "Analyzing Essay Image...", subtitle: "Executing YOLO Line Detection (imgsz=1024)" },
    { title: "Segmenting Text Lines...", subtitle: "Applying IoU NMS & Centroid-based reading order" },
    { title: "Normalizing Strokes...", subtitle: "Adaptive padding & CLAHE contrast enhancement" },
    { title: "Transcribing with TrOCR...", subtitle: "Running VisionEncoderDecoder model with beam search" },
    { title: "Finalizing Output...", subtitle: "Formatting transcribed text & generating visual overlay" }
  ];

  let currentStep = 0;
  loadingTitle.textContent = steps[0].title;
  loadingSubtitle.textContent = steps[0].subtitle;

  if (progressInterval) clearInterval(progressInterval);
  progressInterval = setInterval(() => {
    currentStep = (currentStep + 1) % steps.length;
    loadingTitle.textContent = steps[currentStep].title;
    loadingSubtitle.textContent = steps[currentStep].subtitle;
  }, 1800);
}

function showLoading() {
  dropzone.style.display = 'none';
  loadingBox.style.display = 'block';
  resultsSection.style.display = 'none';
}

function hideLoading() {
  if (progressInterval) clearInterval(progressInterval);
  loadingBox.style.display = 'none';
  dropzone.style.display = 'block';
}

// --- Render Results ---
function renderResults(data) {
  // Update Stats
  statLines.textContent = data.stats.line_count;
  statWords.textContent = data.stats.word_count;
  statChars.textContent = data.stats.char_count;
  statTime.textContent = data.stats.time_seconds + "s";
  detectedCountBadge.textContent = `${data.stats.line_count} Lines Segmented`;

  // Update Visual Overlay Image
  overlayImage.src = data.overlay_image;

  // Update Full Text Area
  transcriptionText.value = data.full_text;

  // Update Line-by-Line Cards
  linesContainer.innerHTML = "";
  if (data.lines && data.lines.length > 0) {
    data.lines.forEach(item => {
      const card = document.createElement('div');
      card.className = 'line-card';
      card.innerHTML = `
        <div class="line-card-header">
          <span class="line-num-badge">Line ${item.line_num}</span>
          <img src="${item.crop_thumb}" class="line-crop-preview" alt="Line ${item.line_num} Crop">
        </div>
        <div class="line-text-content">${escapeHtml(item.text)}</div>
      `;
      linesContainer.appendChild(card);
    });
  }

  // Display Results Section with smooth scroll
  resultsSection.style.display = 'block';
  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// --- Tabs Switching ---
function switchTab(mode) {
  if (mode === 'full') {
    tabFullText.classList.add('active');
    tabLineByLine.classList.remove('active');
    transcriptionText.style.display = 'block';
    linesContainer.style.display = 'none';
  } else {
    tabLineByLine.classList.add('active');
    tabFullText.classList.remove('active');
    transcriptionText.style.display = 'none';
    linesContainer.style.display = 'flex';
  }
}

// --- Copy & Download Actions ---
function copyTranscription() {
  const text = transcriptionText.value;
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    alert("Transcribed text copied to clipboard!");
  }).catch(() => {
    transcriptionText.select();
    document.execCommand('copy');
    alert("Transcribed text copied!");
  });
}

function downloadTxt() {
  const text = transcriptionText.value;
  if (!text) return;
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = currentFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeHtml(string) {
  const entityMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return String(string).replace(/[&<>"']/g, function (s) {
    return entityMap[s];
  });
}
