/* global PDFLib */

/* ========== HELPERS: DOM / STATUS / TOAST / DOWNLOAD / SANITIZE ========== */
const el = (id) => document.getElementById(id);

const toastTitle = el("toastTitle");
const toastBody = el("toastBody");
const statusDot = el("statusDot");
const statusText = el("statusText");

function setStatus(title, body, mode = "ready") {
  toastTitle.textContent = title;
  toastBody.textContent = body;
  statusText.textContent = title;

  const map = {
    ready: { bg: "rgba(68,209,255,0.75)", ring: "rgba(68,209,255,0.16)" },
    busy: { bg: "rgba(255,199,0,0.85)", ring: "rgba(255,199,0,0.14)" },
    ok:   { bg: "rgba(0,220,160,0.85)", ring: "rgba(0,220,160,0.14)" },
    err:  { bg: "rgba(255,90,90,0.90)", ring: "rgba(255,90,90,0.14)" }
  };

  const s = map[mode] || map.ready;
  statusDot.style.background = s.bg;
  statusDot.style.boxShadow = `0 0 0 3px ${s.ring}`;
}

function sanitizeBaseName(name) {
  const clean = (name || "").trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
  return clean || "output";
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
}

function pad3(n) {
  return String(n).padStart(3, "0");
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function setLoading(btn, on, labelWhenOff) {
  if (!btn) return;
  if (on) {
    btn.classList.add("loading");
    btn.disabled = true;
    btn.dataset.prev = btn.textContent;
    btn.textContent = "Working";
  } else {
    btn.classList.remove("loading");
    btn.disabled = false;
    btn.textContent = labelWhenOff || btn.dataset.prev || "Run";
  }
}

/* ========== THEME: LIGHT / DARK TOGGLE ========== */
const themeToggle = el("themeToggle");

function applyTheme(theme) {
  if (theme === "light") document.documentElement.setAttribute("data-theme", "light");
  else document.documentElement.removeAttribute("data-theme");
  try { localStorage.setItem("cybrTheme", theme); } catch (_) {}
}

(function initTheme() {
  let t = "dark";
  try { t = localStorage.getItem("cybrTheme") || "dark"; } catch (_) {}
  applyTheme(t === "light" ? "light" : "dark");
})();

themeToggle.addEventListener("click", () => {
  const isLight = document.documentElement.getAttribute("data-theme") === "light";
  applyTheme(isLight ? "dark" : "light");
  setStatus("Ready", "Theme updated.", "ok");
});

/* ========== HELP DRAWERS: OPEN / CLOSE ========== */
function closeAllHelp() {
  document.querySelectorAll(".help").forEach((h) => h.hidden = true);
}

document.querySelectorAll(".help-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const id = btn.getAttribute("data-help");
    const panelHelp = el(id);
    if (!panelHelp) return;

    const nowHidden = !panelHelp.hidden;
    closeAllHelp();
    panelHelp.hidden = nowHidden; // toggle
  });
});

/* ========== TOOL SWITCHING: SIDEBAR NAV + PANELS ========== */
const tools = ["home", "splitRanges", "merge", "extract", "delete", "rotate", "reorder", "splitN", "img2pdf"];

function setTool(id) {
  closeAllHelp();
  for (const t of tools) {
    const nav = el(`nav-${t}`);
    const panel = el(`panel-${t}`);
    if (nav) nav.classList.toggle("active", t === id);
    if (panel) panel.classList.toggle("active", t === id);
  }
  try { localStorage.setItem("cybrTool", id); } catch (_) {}
  setStatus("Ready", `Tool: ${id}`, "ready");
}

for (const t of tools) {
  const nav = el(`nav-${t}`);
  if (nav) nav.addEventListener("click", () => setTool(t));
}

(function initTool() {
  let saved = "home";
  try { saved = localStorage.getItem("cybrTool") || "home"; } catch (_) {}
  setTool(tools.includes(saved) ? saved : "home");
})();

/* ========== HOME: TILE NAV + OPEN LAST ========== */
document.querySelectorAll("[data-go]").forEach((b) => {
  b.addEventListener("click", () => setTool(b.getAttribute("data-go")));
});

el("homeGoLast").addEventListener("click", () => {
  let saved = "splitRanges";
  try { saved = localStorage.getItem("cybrLastNonHome") || "splitRanges"; } catch (_) {}
  setTool(tools.includes(saved) ? saved : "splitRanges");
});

/* ========== PWA INSTALL: OPTIONAL CALLOUT WHEN SUPPORTED ========== */
let deferredPrompt = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;

  const dismissed = (() => {
    try { return localStorage.getItem("cybrInstallDismissed") === "1"; } catch (_) { return false; }
  })();

  if (!dismissed) el("installCallout").hidden = false;
});

window.addEventListener("appinstalled", () => {
  deferredPrompt = null;
  el("installCallout").hidden = true;
  try { localStorage.setItem("cybrInstallDismissed", "1"); } catch (_) {}
  setStatus("Done", "App installed.", "ok");
});

el("installDismissBtn").addEventListener("click", () => {
  el("installCallout").hidden = true;
  try { localStorage.setItem("cybrInstallDismissed", "1"); } catch (_) {}
});

el("installBtn").addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  deferredPrompt = null;

  if (choice && choice.outcome === "accepted") {
    el("installCallout").hidden = true;
    try { localStorage.setItem("cybrInstallDismissed", "1"); } catch (_) {}
  }
});

/* ========== PARSERS: RANGES + PAGE LISTS ========== */
function parseTokens(text) {
  return (text || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function expandPageList(text, pageCount, { sort = false } = {}) {
  const tokens = parseTokens(text);
  if (!tokens.length) throw new Error("Enter at least one page or range.");

  const pages = [];
  for (const t of tokens) {
    const m1 = t.match(/^(\d+)$/);
    if (m1) {
      pages.push(Number(m1[1]));
      continue;
    }

    const m2 = t.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m2) {
      const a = Number(m2[1]);
      const b = Number(m2[2]);
      if (a > b) throw new Error(`Invalid range: ${t}`);
      for (let p = a; p <= b; p++) pages.push(p);
      continue;
    }

    throw new Error(`Not recognised: ${t}`);
  }

  for (const p of pages) {
    if (p < 1 || p > pageCount) throw new Error(`Out of range: ${p}`);
  }

  if (sort) pages.sort((a, b) => a - b);
  return pages;
}

function parseRangeItems(text, pageCount, keepOrder) {
  const tokens = parseTokens(text);
  if (!tokens.length) throw new Error("Enter at least one range item.");

  const items = tokens.map((token) => {
    const single = token.match(/^(\d+)$/);
    if (single) {
      const p = Number(single[1]);
      return { token, start: p, end: p };
    }
    const range = token.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) return { token, start: Number(range[1]), end: Number(range[2]) };
    throw new Error(`Range not recognised: ${token}`);
  });

  for (const it of items) {
    if (it.start < 1 || it.end > pageCount) throw new Error(`Out of range: ${it.token}`);
    if (it.start > it.end) throw new Error(`Invalid range: ${it.token}`);
  }

  if (!keepOrder) items.sort((a, b) => a.start - b.start);
  return items;
}

/* ========== UI HELPERS: DROP ZONES + LIST RENDERERS ========== */
function wireDropZone({ dropId, inputId, onFiles }) {
  const drop = el(dropId);
  const input = el(inputId);

  input.addEventListener("change", () => onFiles(input.files));

  drop.addEventListener("dragover", (e) => {
    e.preventDefault();
    drop.classList.add("dragover");
  });

  drop.addEventListener("dragleave", () => drop.classList.remove("dragover"));

  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("dragover");
    onFiles(e.dataTransfer.files);

    try {
      const dt = new DataTransfer();
      Array.from(e.dataTransfer.files || []).forEach((f) => dt.items.add(f));
      input.files = dt.files;
    } catch (_) {}
  });

  drop.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") input.click();
  });

  return { drop, input };
}

async function loadPdfSingle(file, fileInfoEl) {
  if (!file) return null;
  fileInfoEl.textContent = "Loading…";

  const arr = await file.arrayBuffer();
  const bytes = new Uint8Array(arr);
  const doc = await PDFLib.PDFDocument.load(bytes);
  const pageCount = doc.getPageCount();
  fileInfoEl.textContent = `${file.name} loaded, ${pageCount} page(s).`;

  return { bytes, pageCount, nameNoExt: (file.name || "input").replace(/\.pdf$/i, "") };
}

function formatBytes(n) {
  if (!Number.isFinite(n)) return "";
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

function renderFileList({ ulEl, emptyEl, files, onUp, onDown, onRemove }) {
  ulEl.innerHTML = "";
  emptyEl.style.display = files.length ? "none" : "block";

  files.forEach((f, idx) => {
    const li = document.createElement("li");
    li.className = "li";

    const left = document.createElement("div");
    left.className = "li-left";

    const name = document.createElement("div");
    name.className = "li-name";
    name.textContent = `${idx + 1}. ${f.name}`;

    const sub = document.createElement("div");
    sub.className = "li-sub";
    sub.textContent = formatBytes(f.size);

    left.appendChild(name);
    left.appendChild(sub);

    const actions = document.createElement("div");
    actions.className = "li-actions";

    const up = document.createElement("button");
    up.type = "button";
    up.className = "btn ghost";
    up.textContent = "Up";
    up.disabled = idx === 0;
    up.addEventListener("click", () => onUp(idx));

    const down = document.createElement("button");
    down.type = "button";
    down.className = "btn ghost";
    down.textContent = "Down";
    down.disabled = idx === files.length - 1;
    down.addEventListener("click", () => onDown(idx));

    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "btn danger";
    rm.textContent = "Remove";
    rm.addEventListener("click", () => onRemove(idx));

    actions.appendChild(up);
    actions.appendChild(down);
    actions.appendChild(rm);

    li.appendChild(left);
    li.appendChild(actions);
    ulEl.appendChild(li);
  });
}

/* ========== TRACK LAST TOOL EXCLUDING HOME ========== */
const originalSetTool = setTool;
function setToolTracked(id) {
  if (id !== "home") {
    try { localStorage.setItem("cybrLastNonHome", id); } catch (_) {}
  }
  originalSetTool(id);
}
// Replace handler references by overwriting global name
// eslint-disable-next-line no-global-assign
setTool = setToolTracked;

/* ========== TOOL: SPLIT RANGES ========== */
(function initSplitRanges() {
  const fileInfo = el("sr_fileInfo");
  const baseName = el("sr_baseName");
  const ranges = el("sr_ranges");
  const keepOrder = el("sr_keepOrder");
  const btnRun = el("sr_btnRun");
  const btnClear = el("sr_btnClear");

  let state = null;

  wireDropZone({
    dropId: "sr_dropZone",
    inputId: "sr_pdfFile",
    onFiles: async (files) => {
      try {
        setStatus("Busy", "Loading PDF…", "busy");
        state = await loadPdfSingle(files && files[0], fileInfo);
        btnRun.disabled = !state;
        setStatus("Ready", "PDF loaded.", "ok");
      } catch (e) {
        state = null;
        btnRun.disabled = true;
        setStatus("Error", "Failed to load PDF.", "err");
      }
    }
  });

  btnClear.addEventListener("click", () => {
    el("sr_pdfFile").value = "";
    state = null;
    fileInfo.textContent = "No file loaded.";
    baseName.value = "CYBR-Split";
    ranges.value = "1-3, 5, 7-10";
    keepOrder.checked = true;
    btnRun.disabled = true;
    setStatus("Ready", "Cleared.", "ready");
  });

  btnRun.addEventListener("click", async () => {
    if (!state) return setStatus("Error", "Add a PDF first.", "err");

    const base = sanitizeBaseName(baseName.value || state.nameNoExt);

    setLoading(btnRun, true, "Split");
    btnClear.disabled = true;
    setStatus("Busy", "Splitting…", "busy");

    try {
      const items = parseRangeItems(ranges.value, state.pageCount, keepOrder.checked);
      const srcDoc = await PDFLib.PDFDocument.load(state.bytes);

      for (const it of items) {
        const outDoc = await PDFLib.PDFDocument.create();
        const indices = [];
        for (let i = it.start - 1; i <= it.end - 1; i++) indices.push(i);

        const copied = await outDoc.copyPages(srcDoc, indices);
        copied.forEach((p) => outDoc.addPage(p));

        const bytes = await outDoc.save();
        const filename = (it.start === it.end)
          ? `${base}_p${pad3(it.start)}.pdf`
          : `${base}_p${pad3(it.start)}-${pad3(it.end)}.pdf`;

        downloadBlob(new Blob([bytes], { type: "application/pdf" }), filename);
        await delay(180);
      }

      setStatus("Done", "Split files downloaded.", "ok");
    } catch (e) {
      setStatus("Error", e.message || "Split failed.", "err");
    } finally {
      setLoading(btnRun, false, "Split");
      btnClear.disabled = false;
    }
  });

  btnRun.disabled = true;
})();

/* ========== TOOL: MERGE ========== */
(function initMerge() {
  const baseName = el("m_baseName");
  const ul = el("m_list");
  const empty = el("m_empty");
  const btnRun = el("m_btnRun");
  const btnClear = el("m_btnClear");

  let files = [];

  function addFiles(fileList) {
    const incoming = Array.from(fileList || []).filter((f) => /pdf$/i.test(f.name));
    if (!incoming.length) return;

    const key = (f) => `${f.name}__${f.size}__${f.lastModified}`;
    const existing = new Set(files.map(key));

    for (const f of incoming) {
      if (!existing.has(key(f))) files.push(f);
    }
    render();
  }

  function render() {
    renderFileList({
      ulEl: ul,
      emptyEl: empty,
      files,
      onUp: (idx) => { [files[idx - 1], files[idx]] = [files[idx], files[idx - 1]]; render(); },
      onDown: (idx) => { [files[idx + 1], files[idx]] = [files[idx], files[idx + 1]]; render(); },
      onRemove: (idx) => { files.splice(idx, 1); render(); }
    });
  }

  wireDropZone({
    dropId: "m_dropZone",
    inputId: "m_files",
    onFiles: (fileList) => {
      addFiles(fileList);
      setStatus("Ready", "Files updated.", "ok");
    }
  });

  btnClear.addEventListener("click", () => {
    el("m_files").value = "";
    files = [];
    baseName.value = "CYBR-Merge";
    render();
    setStatus("Ready", "Cleared.", "ready");
  });

  btnRun.addEventListener("click", async () => {
    if (!files.length) return setStatus("Error", "Add PDFs to merge.", "err");

    setLoading(btnRun, true, "Merge");
    btnClear.disabled = true;
    setStatus("Busy", "Merging…", "busy");

    try {
      const merged = await PDFLib.PDFDocument.create();

      for (const f of files) {
        const ab = await f.arrayBuffer();
        const pdf = await PDFLib.PDFDocument.load(ab);
        const pages = await merged.copyPages(pdf, pdf.getPageIndices());
        pages.forEach((p) => merged.addPage(p));
      }

      const outBytes = await merged.save();
      const base = sanitizeBaseName(baseName.value || "CYBR-Merge");
      downloadBlob(new Blob([outBytes], { type: "application/pdf" }), `${base}.pdf`);

      setStatus("Done", "Merged file downloaded.", "ok");
    } catch (e) {
      setStatus("Error", e.message || "Merge failed.", "err");
    } finally {
      setLoading(btnRun, false, "Merge");
      btnClear.disabled = false;
    }
  });

  render();
})();

/* ========== TOOL: EXTRACT ========== */
(function initExtract() {
  const fileInfo = el("ex_fileInfo");
  const baseName = el("ex_baseName");
  const pagesBox = el("ex_pages");
  const btnRun = el("ex_btnRun");
  const btnClear = el("ex_btnClear");

  let state = null;

  wireDropZone({
    dropId: "ex_dropZone",
    inputId: "ex_pdfFile",
    onFiles: async (files) => {
      try {
        setStatus("Busy", "Loading PDF…", "busy");
        state = await loadPdfSingle(files && files[0], fileInfo);
        btnRun.disabled = !state;
        setStatus("Ready", "PDF loaded.", "ok");
      } catch (e) {
        state = null;
        btnRun.disabled = true;
        setStatus("Error", "Failed to load PDF.", "err");
      }
    }
  });

  btnClear.addEventListener("click", () => {
    el("ex_pdfFile").value = "";
    state = null;
    fileInfo.textContent = "No file loaded.";
    baseName.value = "CYBR-Extract";
    pagesBox.value = "1, 3, 5-8";
    btnRun.disabled = true;
    setStatus("Ready", "Cleared.", "ready");
  });

  btnRun.addEventListener("click", async () => {
    if (!state) return setStatus("Error", "Add a PDF first.", "err");

    setLoading(btnRun, true, "Extract");
    btnClear.disabled = true;
    setStatus("Busy", "Extracting…", "busy");

    try {
      const pages = expandPageList(pagesBox.value, state.pageCount, { sort: false });
      const src = await PDFLib.PDFDocument.load(state.bytes);
      const out = await PDFLib.PDFDocument.create();

      const copied = await out.copyPages(src, pages.map((p) => p - 1));
      copied.forEach((p) => out.addPage(p));

      const outBytes = await out.save();
      const base = sanitizeBaseName(baseName.value || "CYBR-Extract");
      downloadBlob(new Blob([outBytes], { type: "application/pdf" }), `${base}.pdf`);

      setStatus("Done", "Extracted file downloaded.", "ok");
    } catch (e) {
      setStatus("Error", e.message || "Extract failed.", "err");
    } finally {
      setLoading(btnRun, false, "Extract");
      btnClear.disabled = false;
    }
  });

  btnRun.disabled = true;
})();

/* ========== TOOL: DELETE ========== */
(function initDelete() {
  const fileInfo = el("del_fileInfo");
  const baseName = el("del_baseName");
  const pagesBox = el("del_pages");
  const btnRun = el("del_btnRun");
  const btnClear = el("del_btnClear");

  let state = null;

  wireDropZone({
    dropId: "del_dropZone",
    inputId: "del_pdfFile",
    onFiles: async (files) => {
      try {
        setStatus("Busy", "Loading PDF…", "busy");
        state = await loadPdfSingle(files && files[0], fileInfo);
        btnRun.disabled = !state;
        setStatus("Ready", "PDF loaded.", "ok");
      } catch (e) {
        state = null;
        btnRun.disabled = true;
        setStatus("Error", "Failed to load PDF.", "err");
      }
    }
  });

  btnClear.addEventListener("click", () => {
    el("del_pdfFile").value = "";
    state = null;
    fileInfo.textContent = "No file loaded.";
    baseName.value = "CYBR-Delete";
    pagesBox.value = "2, 4-6";
    btnRun.disabled = true;
    setStatus("Ready", "Cleared.", "ready");
  });

  btnRun.addEventListener("click", async () => {
    if (!state) return setStatus("Error", "Add a PDF first.", "err");

    setLoading(btnRun, true, "Delete");
    btnClear.disabled = true;
    setStatus("Busy", "Deleting pages…", "busy");

    try {
      const delPages = new Set(expandPageList(pagesBox.value, state.pageCount, { sort: false }));
      const keep = [];
      for (let p = 1; p <= state.pageCount; p++) if (!delPages.has(p)) keep.push(p);
      if (!keep.length) throw new Error("Delete list removes all pages.");

      const src = await PDFLib.PDFDocument.load(state.bytes);
      const out = await PDFLib.PDFDocument.create();

      const copied = await out.copyPages(src, keep.map((p) => p - 1));
      copied.forEach((p) => out.addPage(p));

      const outBytes = await out.save();
      const base = sanitizeBaseName(baseName.value || "CYBR-Delete");
      downloadBlob(new Blob([outBytes], { type: "application/pdf" }), `${base}.pdf`);

      setStatus("Done", "Cleaned file downloaded.", "ok");
    } catch (e) {
      setStatus("Error", e.message || "Delete failed.", "err");
    } finally {
      setLoading(btnRun, false, "Delete");
      btnClear.disabled = false;
    }
  });

  btnRun.disabled = true;
})();

/* ========== TOOL: ROTATE ========== */
(function initRotate() {
  const fileInfo = el("rot_fileInfo");
  const baseName = el("rot_baseName");
  const degrees = el("rot_degrees");
  const all = el("rot_all");
  const pagesWrap = el("rot_pagesWrap");
  const pagesBox = el("rot_pages");
  const btnRun = el("rot_btnRun");
  const btnClear = el("rot_btnClear");

  let state = null;

  function syncPagesBox() {
    pagesWrap.style.display = all.checked ? "none" : "block";
  }
  all.addEventListener("change", syncPagesBox);
  syncPagesBox();

  wireDropZone({
    dropId: "rot_dropZone",
    inputId: "rot_pdfFile",
    onFiles: async (files) => {
      try {
        setStatus("Busy", "Loading PDF…", "busy");
        state = await loadPdfSingle(files && files[0], fileInfo);
        btnRun.disabled = !state;
        setStatus("Ready", "PDF loaded.", "ok");
      } catch (e) {
        state = null;
        btnRun.disabled = true;
        setStatus("Error", "Failed to load PDF.", "err");
      }
    }
  });

  btnClear.addEventListener("click", () => {
    el("rot_pdfFile").value = "";
    state = null;
    fileInfo.textContent = "No file loaded.";
    baseName.value = "CYBR-Rotate";
    degrees.value = "90";
    all.checked = true;
    pagesBox.value = "1, 3, 5-8";
    syncPagesBox();
    btnRun.disabled = true;
    setStatus("Ready", "Cleared.", "ready");
  });

  btnRun.addEventListener("click", async () => {
    if (!state) return setStatus("Error", "Add a PDF first.", "err");

    setLoading(btnRun, true, "Rotate");
    btnClear.disabled = true;
    setStatus("Busy", "Rotating…", "busy");

    try {
      const deg = Number(degrees.value);
      const targets = all.checked
        ? Array.from({ length: state.pageCount }, (_, i) => i + 1)
        : expandPageList(pagesBox.value, state.pageCount, { sort: false });

      const targetSet = new Set(targets);

      const doc = await PDFLib.PDFDocument.load(state.bytes);
      const out = await PDFLib.PDFDocument.create();

      const copied = await out.copyPages(doc, doc.getPageIndices());
      copied.forEach((page, idx) => {
        const pageNum = idx + 1;
        if (targetSet.has(pageNum)) {
          const current = page.getRotation().angle || 0;
          page.setRotation(PDFLib.degrees((current + deg) % 360));
        }
        out.addPage(page);
      });

      const outBytes = await out.save();
      const base = sanitizeBaseName(baseName.value || "CYBR-Rotate");
      downloadBlob(new Blob([outBytes], { type: "application/pdf" }), `${base}.pdf`);

      setStatus("Done", "Rotated file downloaded.", "ok");
    } catch (e) {
      setStatus("Error", e.message || "Rotate failed.", "err");
    } finally {
      setLoading(btnRun, false, "Rotate");
      btnClear.disabled = false;
    }
  });

  btnRun.disabled = true;
})();

/* ========== TOOL: REORDER ========== */
(function initReorder() {
  const fileInfo = el("re_fileInfo");
  const baseName = el("re_baseName");
  const orderBox = el("re_order");
  const btnRun = el("re_btnRun");
  const btnClear = el("re_btnClear");

  let state = null;

  wireDropZone({
    dropId: "re_dropZone",
    inputId: "re_pdfFile",
    onFiles: async (files) => {
      try {
        setStatus("Busy", "Loading PDF…", "busy");
        state = await loadPdfSingle(files && files[0], fileInfo);
        btnRun.disabled = !state;
        setStatus("Ready", "PDF loaded.", "ok");
      } catch (e) {
        state = null;
        btnRun.disabled = true;
        setStatus("Error", "Failed to load PDF.", "err");
      }
    }
  });

  btnClear.addEventListener("click", () => {
    el("re_pdfFile").value = "";
    state = null;
    fileInfo.textContent = "No file loaded.";
    baseName.value = "CYBR-Reorder";
    orderBox.value = "3,1,2,4-10";
    btnRun.disabled = true;
    setStatus("Ready", "Cleared.", "ready");
  });

  btnRun.addEventListener("click", async () => {
    if (!state) return setStatus("Error", "Add a PDF first.", "err");

    setLoading(btnRun, true, "Reorder");
    btnClear.disabled = true;
    setStatus("Busy", "Reordering…", "busy");

    try {
      const pages = expandPageList(orderBox.value, state.pageCount, { sort: false });
      const src = await PDFLib.PDFDocument.load(state.bytes);
      const out = await PDFLib.PDFDocument.create();

      const copied = await out.copyPages(src, pages.map((p) => p - 1));
      copied.forEach((p) => out.addPage(p));

      const outBytes = await out.save();
      const base = sanitizeBaseName(baseName.value || "CYBR-Reorder");
      downloadBlob(new Blob([outBytes], { type: "application/pdf" }), `${base}.pdf`);

      setStatus("Done", "Reordered file downloaded.", "ok");
    } catch (e) {
      setStatus("Error", e.message || "Reorder failed.", "err");
    } finally {
      setLoading(btnRun, false, "Reorder");
      btnClear.disabled = false;
    }
  });

  btnRun.disabled = true;
})();

/* ========== TOOL: SPLIT EVERY N ========== */
(function initSplitN() {
  const fileInfo = el("sn_fileInfo");
  const baseName = el("sn_baseName");
  const nBox = el("sn_n");
  const btnRun = el("sn_btnRun");
  const btnClear = el("sn_btnClear");

  let state = null;

  wireDropZone({
    dropId: "sn_dropZone",
    inputId: "sn_pdfFile",
    onFiles: async (files) => {
      try {
        setStatus("Busy", "Loading PDF…", "busy");
        state = await loadPdfSingle(files && files[0], fileInfo);
        btnRun.disabled = !state;
        setStatus("Ready", "PDF loaded.", "ok");
      } catch (e) {
        state = null;
        btnRun.disabled = true;
        setStatus("Error", "Failed to load PDF.", "err");
      }
    }
  });

  btnClear.addEventListener("click", () => {
    el("sn_pdfFile").value = "";
    state = null;
    fileInfo.textContent = "No file loaded.";
    baseName.value = "CYBR-BatchSplit";
    nBox.value = 5;
    btnRun.disabled = true;
    setStatus("Ready", "Cleared.", "ready");
  });

  btnRun.addEventListener("click", async () => {
    if (!state) return setStatus("Error", "Add a PDF first.", "err");

    const n = Number(nBox.value);
    if (!Number.isFinite(n) || n < 1) return setStatus("Error", "Pages per file must be 1 or more.", "err");

    setLoading(btnRun, true, "Split");
    btnClear.disabled = true;
    setStatus("Busy", "Splitting…", "busy");

    try {
      const base = sanitizeBaseName(baseName.value || "CYBR-BatchSplit");
      const src = await PDFLib.PDFDocument.load(state.bytes);

      let start = 1;
      while (start <= state.pageCount) {
        const end = Math.min(start + n - 1, state.pageCount);

        const out = await PDFLib.PDFDocument.create();
        const indices = [];
        for (let p = start; p <= end; p++) indices.push(p - 1);

        const copied = await out.copyPages(src, indices);
        copied.forEach((p) => out.addPage(p));

        const outBytes = await out.save();
        const filename = `${base}_p${pad3(start)}-${pad3(end)}.pdf`;
        downloadBlob(new Blob([outBytes], { type: "application/pdf" }), filename);
        await delay(160);

        start = end + 1;
      }

      setStatus("Done", "Batch split files downloaded.", "ok");
    } catch (e) {
      setStatus("Error", e.message || "Split failed.", "err");
    } finally {
      setLoading(btnRun, false, "Split");
      btnClear.disabled = false;
    }
  });

  btnRun.disabled = true;
})();

/* ========== TOOL: IMAGES TO PDF ========== */
(function initImgToPdf() {
  const baseName = el("i_baseName");
  const pageSize = el("i_pageSize");
  const marginMm = el("i_margin");
  const ul = el("i_list");
  const empty = el("i_empty");
  const btnRun = el("i_btnRun");
  const btnClear = el("i_btnClear");

  let files = [];

  function addFiles(fileList) {
    const incoming = Array.from(fileList || []).filter((f) => {
      const n = (f.name || "").toLowerCase();
      return n.endsWith(".jpg") || n.endsWith(".jpeg") || n.endsWith(".png");
    });
    if (!incoming.length) return;

    const key = (f) => `${f.name}__${f.size}__${f.lastModified}`;
    const existing = new Set(files.map(key));
    for (const f of incoming) if (!existing.has(key(f))) files.push(f);

    render();
  }

  function render() {
    renderFileList({
      ulEl: ul,
      emptyEl: empty,
      files,
      onUp: (idx) => { [files[idx - 1], files[idx]] = [files[idx], files[idx - 1]]; render(); },
      onDown: (idx) => { [files[idx + 1], files[idx]] = [files[idx], files[idx + 1]]; render(); },
      onRemove: (idx) => { files.splice(idx, 1); render(); }
    });
  }

  wireDropZone({
    dropId: "i_dropZone",
    inputId: "i_files",
    onFiles: (fileList) => {
      addFiles(fileList);
      setStatus("Ready", "Images updated.", "ok");
    }
  });

  btnClear.addEventListener("click", () => {
    el("i_files").value = "";
    files = [];
    baseName.value = "CYBR-ImagesToPDF";
    pageSize.value = "A4P";
    marginMm.value = 10;
    render();
    setStatus("Ready", "Cleared.", "ready");
  });

  function mmToPt(mm) {
    return (mm * 72) / 25.4;
  }

  function getA4(mode) {
    const A4P = { w: 595.28, h: 841.89 };
    return (mode === "A4L") ? { w: A4P.h, h: A4P.w } : A4P;
  }

  btnRun.addEventListener("click", async () => {
    if (!files.length) return setStatus("Error", "Add images first.", "err");

    setLoading(btnRun, true, "Create PDF");
    btnClear.disabled = true;
    setStatus("Busy", "Building PDF…", "busy");

    try {
      const doc = await PDFLib.PDFDocument.create();
      const base = sanitizeBaseName(baseName.value || "CYBR-ImagesToPDF");
      const mode = pageSize.value;
      const margin = Math.max(0, Number(marginMm.value || 0));
      const marginPt = mmToPt(margin);

      for (const f of files) {
        const bytes = new Uint8Array(await f.arrayBuffer());
        const lower = (f.name || "").toLowerCase();

        let img;
        if (lower.endsWith(".png")) img = await doc.embedPng(bytes);
        else img = await doc.embedJpg(bytes);

        const imgW = img.width;
        const imgH = img.height;

        if (mode === "FIT") {
          const page = doc.addPage([imgW, imgH]);
          page.drawImage(img, { x: 0, y: 0, width: imgW, height: imgH });
        } else {
          const { w, h } = getA4(mode);
          const page = doc.addPage([w, h]);

          const maxW = Math.max(1, w - marginPt * 2);
          const maxH = Math.max(1, h - marginPt * 2);

          const scale = Math.min(maxW / imgW, maxH / imgH);
          const drawW = imgW * scale;
          const drawH = imgH * scale;

          const x = (w - drawW) / 2;
          const y = (h - drawH) / 2;

          page.drawImage(img, { x, y, width: drawW, height: drawH });
        }

        await delay(10);
      }

      const outBytes = await doc.save();
      downloadBlob(new Blob([outBytes], { type: "application/pdf" }), `${base}.pdf`);

      setStatus("Done", "Images PDF downloaded.", "ok");
    } catch (e) {
      setStatus("Error", e.message || "Create PDF failed.", "err");
    } finally {
      setLoading(btnRun, false, "Create PDF");
      btnClear.disabled = false;
    }
  });

  render();
})();

/* ========== STARTUP MESSAGE ========== */
setStatus("Ready", "Select a tool on the left.", "ready");
