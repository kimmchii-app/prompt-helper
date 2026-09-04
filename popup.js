'use strict';

const $ = (id) => document.getElementById(id);

const input = $('input');
const statusEl = $('status');
const countEl = $('count');
const clearBtn = $('clear');
const swapBtn = $('swap');

const tabTranslate = $('tabTranslate');
const tabPrompt = $('tabPrompt');

const translateOut = $('translateOut');
const output = $('output');
const copyBtn = $('copy');

const promptOpts = $('promptOpts');
const promptOut = $('promptOut');
const styleChips = $('styleChips');
const posOut = $('posOut');
const negOut = $('negOut');
const negPane = $('negPane');
const posLen = $('posLen');
const copyPos = $('copyPos');
const copyNeg = $('copyNeg');
const optQuality = $('optQuality');
const optWeight = $('optWeight');
const optNeg = $('optNeg');

const historyWrap = $('historyWrap');
const historyList = $('history');
const clearHistoryBtn = $('clearHistory');

const MAX_CHARS = 5000;
const DEBOUNCE_MS = 550;
const HISTORY_MAX = 3;

let mode = 'translate';        // 'translate' | 'prompt'
let reversed = false;          // 翻譯模式：false = 中→英
let style = 'photo';           // 提示詞風格
let timer = null;
let seq = 0;
let controller = null;
let lastEn = '';               // 最近一次英文翻譯結果
let lastPos = '';
let lastNeg = '';
let historyItems = [];

/* ================= 風格模板 ================= */

const PRESETS = {
  photo: {
    label: '寫實',
    pos: ['photorealistic', 'sharp focus', '85mm lens', 'shallow depth of field',
          'natural lighting', 'ultra detailed skin texture', 'raw photo'],
    neg: ['cartoon', 'anime', 'illustration', 'painting', '3d render', 'cgi', 'plastic skin']
  },
  anime: {
    label: '動漫',
    pos: ['anime style', 'anime key visual', 'clean lineart', 'cel shading',
          'vibrant colors', 'detailed eyes', 'studio quality'],
    neg: ['photorealistic', 'realistic skin texture', '3d render', 'western cartoon']
  },
  illust: {
    label: '插畫',
    pos: ['digital illustration', 'concept art', 'matte painting',
          'dramatic composition', 'intricate details', 'rich color palette'],
    neg: ['photo', 'photorealistic', 'flat shading', 'low detail']
  },
  render3d: {
    label: '3D',
    pos: ['3d render', 'octane render', 'unreal engine 5', 'subsurface scattering',
          'global illumination', 'ray tracing', 'studio lighting'],
    neg: ['2d', 'flat', 'sketch', 'anime', 'painting']
  },
  paint: {
    label: '水彩',
    pos: ['watercolor painting', 'traditional media', 'soft color washes',
          'textured paper', 'delicate brush strokes', 'loose linework'],
    neg: ['3d render', 'photorealistic', 'digital art', 'hard edges', 'oversaturated']
  },
  cinema: {
    label: '電影',
    pos: ['cinematic still', 'film grain', 'anamorphic lens flare',
          'dramatic rim lighting', 'moody atmosphere', 'color graded', 'wide shot'],
    neg: ['cartoon', 'flat lighting', 'oversaturated', 'snapshot']
  },
  none: { label: '無風格', pos: [], neg: [] }
};

const QUALITY_TAGS = ['masterpiece', 'best quality', 'ultra detailed', 'high resolution'];

const BASE_NEG = [
  'lowres', 'worst quality', 'low quality', 'jpeg artifacts', 'blurry',
  'bad anatomy', 'bad hands', 'extra fingers', 'missing fingers', 'extra limbs',
  'deformed', 'mutated', 'disfigured', 'poorly drawn face',
  'watermark', 'signature', 'text', 'username', 'cropped', 'out of frame'
];

/* ================= 翻譯核心 ================= */

function joinSentences(data) {
  if (typeof data === 'string') return data;
  if (!Array.isArray(data)) return '';
  if (Array.isArray(data[0])) {
    return data[0].map((seg) => (Array.isArray(seg) ? seg[0] : seg) || '').join('');
  }
  return data.filter((s) => typeof s === 'string').join('');
}

async function callEndpoint(url, signal) {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return joinSentences(await res.json());
}

async function translate(text, source, target, signal) {
  const q = encodeURIComponent(text);
  const urls = [
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${source}&tl=${target}&dt=t&dj=0&q=${q}`,
    `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${source}&tl=${target}&q=${q}`
  ];
  let firstError = null;
  for (const url of urls) {
    try {
      const out = await callEndpoint(url, signal);
      if (out) return out;
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      firstError = firstError || err;
    }
  }
  throw firstError || new Error('翻譯失敗');
}

/* ================= 提示詞組裝 ================= */

// 把英文句子拆成提示詞常用的逗號片語
function toClauses(text) {
  return text
    .replace(/\s+/g, ' ')
    .split(/[.;!?]+|,\s*and\s+|\s+and\s+|、|，|,/g)
    .map((s) => s
      .trim()
      .replace(/^(there (is|are)|it is|this is|the (image|picture|photo) (shows|is of)|a (picture|photo|image) of)\s+/i, '')
      .replace(/[.\s]+$/, '')
    )
    .filter((s) => s.length > 1);
}

function dedupe(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const key = item.toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item.trim());
  }
  return out;
}

function buildPrompt(englishText) {
  const preset = PRESETS[style] || PRESETS.none;
  const clauses = toClauses(englishText);

  if (optWeight.checked && clauses.length) {
    clauses[0] = `(${clauses[0]}:1.3)`;
  }

  const positive = dedupe([
    ...(optQuality.checked ? QUALITY_TAGS : []),
    ...clauses,
    ...preset.pos
  ]).join(', ');

  const negative = dedupe([...BASE_NEG, ...preset.neg]).join(', ');
  return { positive, negative };
}

/* ================= UI ================= */

function setStatus(msg, kind) {
  statusEl.textContent = msg || '';
  statusEl.className = 'status' + (kind ? ' ' + kind : '');
}

function updateCount() {
  const n = input.value.length;
  countEl.textContent = n + ' 字' + (n > MAX_CHARS ? `（超過 ${MAX_CHARS}，只翻前段）` : '');
}

function applyMode() {
  const isPrompt = mode === 'prompt';
  tabTranslate.classList.toggle('active', !isPrompt);
  tabPrompt.classList.toggle('active', isPrompt);
  translateOut.hidden = isPrompt;
  promptOut.hidden = !isPrompt;
  promptOpts.hidden = !isPrompt;
  swapBtn.hidden = isPrompt;
  input.placeholder = isPrompt
    ? '用中文描述畫面… 例如：黃昏的東京巷弄，霓虹燈倒映在濕掉的柏油路上'
    : (reversed ? '輸入或貼上英文…' : '輸入或貼上中文… 片語、長句都可以');
  swapBtn.textContent = reversed ? '英 → 中 ⇄' : '中 → 英 ⇄';
  renderHistory(null);
}

function renderChips() {
  styleChips.innerHTML = '';
  for (const [key, preset] of Object.entries(PRESETS)) {
    const b = document.createElement('button');
    b.className = 'chip' + (key === style ? ' on' : '');
    b.textContent = preset.label;
    b.addEventListener('click', async () => {
      style = key;
      await chrome.storage.local.set({ style });
      renderChips();
      if (lastEn) renderPrompt(lastEn);
    });
    styleChips.appendChild(b);
  }
}

function renderPrompt(englishText) {
  const { positive, negative } = buildPrompt(englishText);
  lastPos = positive;
  lastNeg = negative;
  posOut.textContent = positive;
  negOut.textContent = negative;
  posLen.textContent = positive ? positive.split(', ').length + ' 個標籤' : '';
  negPane.hidden = !optNeg.checked;
  copyPos.disabled = !positive;
  copyNeg.disabled = !negative;
}

async function run(immediate) {
  clearTimeout(timer);
  const raw = input.value.trim();

  if (!raw) {
    output.textContent = '';
    posOut.textContent = '';
    negOut.textContent = '';
    posLen.textContent = '';
    lastEn = lastPos = lastNeg = '';
    copyBtn.disabled = copyPos.disabled = copyNeg.disabled = true;
    setStatus('');
    return;
  }

  const text = raw.slice(0, MAX_CHARS);
  // 提示詞模式一律翻成英文
  const source = mode === 'prompt' ? 'auto' : (reversed ? 'en' : 'zh-TW');
  const target = mode === 'prompt' ? 'en' : (reversed ? 'zh-TW' : 'en');

  const my = ++seq;
  if (controller) controller.abort();
  controller = new AbortController();

  (mode === 'prompt' ? posOut : output).classList.add('loading');
  setStatus(mode === 'prompt' ? '產生中…' : '翻譯中…');

  try {
    const result = await translate(text, source, target, controller.signal);
    if (my !== seq) return;

    output.classList.remove('loading');
    posOut.classList.remove('loading');
    setStatus('');

    if (mode === 'prompt') {
      lastEn = result;
      renderPrompt(result);
      saveHistory(text, lastPos);
      if (immediate) copyToClipboard(lastPos);
    } else {
      output.textContent = result;
      lastEn = result;
      copyBtn.disabled = false;
      saveHistory(text, result);
      if (immediate) copyToClipboard(result);
    }
  } catch (err) {
    if (err.name === 'AbortError' || my !== seq) return;
    output.classList.remove('loading');
    posOut.classList.remove('loading');
    setStatus('翻譯失敗，請再試一次', 'err');
  }
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(() => run(false), DEBOUNCE_MS);
}

async function copyToClipboard(text) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    setStatus('已複製', 'ok');
    setTimeout(() => { if (statusEl.textContent === '已複製') setStatus(''); }, 1400);
  } catch {
    setStatus('無法複製，請手動選取', 'err');
  }
}

/* ================= 歷史紀錄 ================= */

function renderHistory(items) {
  if (items) historyItems = items;
  historyList.innerHTML = '';
  if (mode === 'prompt' || !historyItems.length) { historyWrap.hidden = true; return; }
  historyWrap.hidden = false;
  items = historyItems;
  for (const item of items) {
    const li = document.createElement('li');
    li.title = '點一下填回輸入框';
    const zh = document.createElement('span');
    zh.className = 'zh';
    zh.textContent = item.src;
    const en = document.createElement('span');
    en.className = 'en';
    en.textContent = item.out;
    li.append(zh, en);
    li.addEventListener('click', () => {
      input.value = item.src;
      updateCount();
      input.focus();
      run(false);
    });
    historyList.appendChild(li);
  }
}

async function saveHistory(src, out) {
  const { history = [] } = await chrome.storage.local.get('history');
  const next = [{ src, out, t: Date.now() }, ...history.filter((h) => h.src !== src)].slice(0, HISTORY_MAX);
  await chrome.storage.local.set({ history: next });
  renderHistory(next);
}

/* ================= 事件 ================= */

input.addEventListener('input', () => { updateCount(); schedule(); });

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    run(true);
  }
});

for (const tab of [tabTranslate, tabPrompt]) {
  tab.addEventListener('click', async () => {
    mode = tab.dataset.mode;
    await chrome.storage.local.set({ mode });
    applyMode();
    input.focus();
    if (input.value.trim()) run(false);
  });
}

copyBtn.addEventListener('click', () => copyToClipboard(lastEn));
copyPos.addEventListener('click', () => copyToClipboard(lastPos));
copyNeg.addEventListener('click', () => copyToClipboard(lastNeg));

for (const box of [optQuality, optWeight, optNeg]) {
  box.addEventListener('change', async () => {
    await chrome.storage.local.set({
      optQuality: optQuality.checked,
      optWeight: optWeight.checked,
      optNeg: optNeg.checked
    });
    if (lastEn) renderPrompt(lastEn);
  });
}

clearBtn.addEventListener('click', () => {
  input.value = '';
  output.textContent = '';
  posOut.textContent = '';
  negOut.textContent = '';
  posLen.textContent = '';
  lastEn = lastPos = lastNeg = '';
  copyBtn.disabled = copyPos.disabled = copyNeg.disabled = true;
  updateCount();
  setStatus('');
  input.focus();
});

swapBtn.addEventListener('click', async () => {
  reversed = !reversed;
  await chrome.storage.local.set({ reversed });
  applyMode();
  if (input.value.trim()) run(false);
});

clearHistoryBtn.addEventListener('click', async () => {
  await chrome.storage.local.set({ history: [] });
  renderHistory([]);
});

window.addEventListener('blur', () => {
  chrome.storage.local.set({ draft: input.value });
});

/* ================= 啟動 ================= */

(async function init() {
  const saved = await chrome.storage.local.get([
    'history', 'reversed', 'draft', 'mode', 'style', 'optQuality', 'optWeight', 'optNeg'
  ]);

  mode = saved.mode === 'prompt' ? 'prompt' : 'translate';
  reversed = !!saved.reversed;
  style = PRESETS[saved.style] ? saved.style : 'photo';
  optQuality.checked = saved.optQuality !== false;
  optWeight.checked = !!saved.optWeight;
  optNeg.checked = saved.optNeg !== false;

  applyMode();
  renderChips();
  negPane.hidden = !optNeg.checked;

  if (saved.draft) { input.value = saved.draft; run(false); }
  updateCount();
  renderHistory(saved.history || []);
  input.focus();
})();
