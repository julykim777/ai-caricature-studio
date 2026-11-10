/* =========================================================
 * AI 캐리커처 스튜디오 - 프론트엔드
 *
 * 백엔드 API (server.js):
 *   POST  /api/transform   (multipart/form-data)
 *     - image : 업로드한 이미지 파일 (전송 전 최대 1536px JPEG 로 축소)
 *     - style : 스타일 id (예: "caricature")
 *   응답(JSON)
 *     - 성공: { "image": "data:image/png;base64,...", "mock": false }
 *     - 실패: { "error": "오류 메시지" }  (HTTP 4xx/5xx)
 *
 *   서버 없이 화면만 확인하려면 CONFIG.USE_MOCK 을 true 로 바꾸세요.
 * ========================================================= */

const CONFIG = {
  USE_MOCK: false,                 // true: 서버 없이 브라우저에서 필터로 흉내만 냅니다.
  API_URL: '/api/transform',
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 사용자가 고를 수 있는 원본 크기 한도
  UPLOAD_MAX_SIDE: 1536,           // 서버로 보내기 전 긴 변 최대 픽셀
  ACCEPTED_TYPES: ['image/png', 'image/jpeg', 'image/webp'],
};

// id 는 백엔드에서 스타일별 프롬프트를 고를 때 사용합니다.
const STYLES = [
  { id: 'caricature',  emoji: '🎭', name: '캐리커처',     desc: '특징을 과장한 유쾌한 그림' },
  { id: 'anime',       emoji: '✨', name: '애니메이션',   desc: '선명한 선과 셀 채색' },
  { id: 'movie-poster',emoji: '🎬', name: '영화 포스터',  desc: '드라마틱한 조명과 타이틀' },
  { id: '3d-cartoon',  emoji: '🧸', name: '3D 캐릭터',    desc: '부드러운 3D 애니메이션풍' },
  { id: 'watercolor',  emoji: '🎨', name: '수채화',       desc: '번지는 붓 터치와 맑은 색감' },
  { id: 'pop-art',     emoji: '💥', name: '팝아트',       desc: '강렬한 원색과 망점 효과' },
];

// ---------- 상태 ----------
const state = {
  file: null,
  originalUrl: null,
  resultUrl: null,
  styleId: STYLES[0].id,
  loading: false,
};

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const el = {
  modeBadge: $('modeBadge'),
  dropzone: $('dropzone'), fileInput: $('fileInput'),
  dropEmpty: $('dropEmpty'), dropPreview: $('dropPreview'),
  thumb: $('thumb'), fileName: $('fileName'), fileSize: $('fileSize'), removeBtn: $('removeBtn'),
  styleGrid: $('styleGrid'),
  generateBtn: $('generateBtn'), status: $('status'),
  resultPanel: $('resultPanel'),
  originalImg: $('originalImg'), resultImg: $('resultImg'), resultCaption: $('resultCaption'),
  sideView: $('sideView'), sliderView: $('sliderView'),
  compareBefore: $('compareBefore'), compareAfter: $('compareAfter'),
  compareBeforeWrap: $('compareBeforeWrap'), compareHandle: $('compareHandle'), compareRange: $('compareRange'),
  downloadBtn: $('downloadBtn'), retryBtn: $('retryBtn'),
};

// ---------- 초기화 ----------
el.modeBadge.hidden = !CONFIG.USE_MOCK;
renderStyles();
bindUpload();
bindCompare();
el.generateBtn.addEventListener('click', handleGenerate);
el.downloadBtn.addEventListener('click', handleDownload);
el.retryBtn.addEventListener('click', () => {
  el.styleGrid.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

// ---------- 스타일 선택 ----------
function renderStyles() {
  el.styleGrid.innerHTML = '';
  STYLES.forEach((s) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'style-card';
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', String(s.id === state.styleId));
    btn.dataset.id = s.id;
    btn.innerHTML = `
      <span class="style-emoji" aria-hidden="true">${s.emoji}</span>
      <span class="style-name">${s.name}</span>
      <span class="style-desc">${s.desc}</span>`;
    btn.addEventListener('click', () => selectStyle(s.id));
    el.styleGrid.appendChild(btn);
  });
}

function selectStyle(id) {
  state.styleId = id;
  el.styleGrid.querySelectorAll('.style-card').forEach((c) => {
    c.setAttribute('aria-checked', String(c.dataset.id === id));
  });
}

// ---------- 업로드 ----------
function bindUpload() {
  el.fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) setFile(file);
  });

  el.dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.fileInput.click(); }
  });

  ['dragenter', 'dragover'].forEach((type) =>
    el.dropzone.addEventListener(type, (e) => { e.preventDefault(); el.dropzone.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach((type) =>
    el.dropzone.addEventListener(type, (e) => { e.preventDefault(); el.dropzone.classList.remove('dragover'); }));
  el.dropzone.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files[0];
    if (file) setFile(file);
  });

  el.removeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    el.fileInput.value = '';
    el.fileInput.click();
  });
}

function setFile(file) {
  if (!CONFIG.ACCEPTED_TYPES.includes(file.type)) {
    return showStatus('JPG, PNG, WEBP 형식의 이미지만 업로드할 수 있어요.', true);
  }
  if (file.size > CONFIG.MAX_FILE_SIZE) {
    return showStatus('파일이 너무 커요. 10MB 이하의 이미지를 올려 주세요.', true);
  }

  if (state.originalUrl) URL.revokeObjectURL(state.originalUrl);
  state.file = file;
  state.originalUrl = URL.createObjectURL(file);

  el.thumb.src = state.originalUrl;
  el.fileName.textContent = file.name;
  el.fileSize.textContent = formatBytes(file.size);
  el.dropEmpty.hidden = true;
  el.dropPreview.hidden = false;
  el.generateBtn.disabled = false;
  showStatus('');
}

// ---------- 변환 ----------
async function handleGenerate() {
  if (!state.file || state.loading) return;
  const style = STYLES.find((s) => s.id === state.styleId);

  setLoading(true);
  const started = Date.now();
  const tick = () => {
    const sec = Math.floor((Date.now() - started) / 1000);
    showStatus(`AI가 '${style.name}' 스타일로 그리는 중이에요… ${sec}초 (보통 20초~1분 정도 걸려요)`);
  };
  tick();
  const timer = setInterval(tick, 1000);

  try {
    const { image, mock } = CONFIG.USE_MOCK
      ? { image: await mockTransform(state.file, style.id), mock: true }
      : await requestTransform(state.file, style.id);

    state.resultUrl = image;
    el.modeBadge.hidden = !mock;
    showResult(style);
    showStatus(mock
      ? '데모 결과예요. OpenAI API를 연결하면 실제 AI 변환 결과가 표시됩니다.'
      : '변환이 완료됐어요!');
  } catch (err) {
    console.error(err);
    showStatus(err.message || '변환 중 오류가 발생했어요. 다시 시도해 주세요.', true);
  } finally {
    clearInterval(timer);
    setLoading(false);
  }
}

/** 백엔드 호출 → { image, mock } */
async function requestTransform(file, styleId) {
  const upload = await shrinkForUpload(file);
  const form = new FormData();
  form.append('image', upload, upload.name);
  form.append('style', styleId);

  let res;
  try {
    res = await fetch(CONFIG.API_URL, { method: 'POST', body: form });
  } catch {
    throw new Error('서버에 연결할 수 없어요. 서버가 실행 중인지 확인해 주세요.');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `변환에 실패했어요. (오류 코드 ${res.status})`);
  if (!data.image) throw new Error('서버 응답에 이미지가 없어요.');
  return { image: data.image, mock: Boolean(data.mock) };
}

/** 업로드 용량을 줄이기 위해 긴 변을 UPLOAD_MAX_SIDE 이하의 JPEG 로 변환합니다. */
async function shrinkForUpload(file) {
  const img = await loadImage(state.originalUrl);
  const scale = Math.min(1, CONFIG.UPLOAD_MAX_SIDE / Math.max(img.width, img.height));
  if (scale === 1 && file.size <= 2 * 1024 * 1024) return file; // 이미 충분히 작으면 그대로

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // 투명 PNG 배경 처리
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
  const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
  return new File([blob], name, { type: 'image/jpeg' });
}

/** 데모용: 캔버스 필터로 스타일을 흉내 냅니다. */
async function mockTransform(file, styleId) {
  await new Promise((r) => setTimeout(r, 1200)); // 로딩 상태 확인용 지연

  const img = await loadImage(state.originalUrl);
  const max = 1024;
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');

  const filters = {
    'caricature':   'contrast(1.4) saturate(1.5)',
    'anime':        'saturate(1.8) contrast(1.2) brightness(1.05)',
    'movie-poster': 'contrast(1.35) saturate(.8) sepia(.25)',
    '3d-cartoon':   'saturate(1.4) brightness(1.1) blur(.6px)',
    'watercolor':   'saturate(1.2) brightness(1.12) blur(1.2px)',
    'pop-art':      'saturate(3) contrast(1.6)',
  };
  ctx.filter = filters[styleId] || 'none';
  ctx.drawImage(img, 0, 0, w, h);
  ctx.filter = 'none';

  if (styleId === 'movie-poster') {
    const g = ctx.createLinearGradient(0, h * 0.55, 0, h);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,.85)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = `800 ${Math.round(w / 11)}px system-ui, sans-serif`;
    ctx.fillText('THE STAR', w / 2, h * 0.9);
  }

  return canvas.toDataURL('image/png');
}

// ---------- 결과 표시 ----------
function showResult(style) {
  el.originalImg.src = state.originalUrl;
  el.resultImg.src = state.resultUrl;
  el.compareBefore.src = state.originalUrl;
  el.compareAfter.src = state.resultUrl;
  el.resultCaption.textContent = `변환 결과 · ${style.name}`;
  el.resultPanel.hidden = false;
  el.resultPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function bindCompare() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
      const slider = tab.dataset.view === 'slider';
      el.sideView.hidden = slider;
      el.sliderView.hidden = !slider;
    });
  });

  el.compareRange.addEventListener('input', (e) => {
    const v = e.target.value;
    el.compareBeforeWrap.style.clipPath = `inset(0 ${100 - v}% 0 0)`;
    el.compareHandle.style.left = `${v}%`;
  });
}

// ---------- 다운로드 ----------
function handleDownload() {
  if (!state.resultUrl) return;
  const base = (state.file?.name || 'image').replace(/\.[^.]+$/, '');
  // 실제 이미지 형식(data:image/jpeg;...)에 맞는 확장자를 붙입니다.
  const mime = state.resultUrl.match(/^data:image\/(\w+)/)?.[1] || 'png';
  const ext = mime === 'jpeg' ? 'jpg' : mime;
  const a = document.createElement('a');
  a.href = state.resultUrl;
  a.download = `${base}_${state.styleId}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ---------- 유틸 ----------
function setLoading(on) {
  state.loading = on;
  el.generateBtn.classList.toggle('loading', on);
  el.generateBtn.disabled = on || !state.file;
  el.generateBtn.querySelector('.btn-label').textContent = on ? '변환 중…' : '이미지 변환하기';
  el.styleGrid.querySelectorAll('button').forEach((b) => (b.disabled = on));
}

function showStatus(msg, isError = false) {
  el.status.textContent = msg;
  el.status.classList.toggle('error', isError);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지를 불러오지 못했어요.'));
    img.src = src;
  });
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
