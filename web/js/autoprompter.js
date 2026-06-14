import { chainCallback, addMiddleClickPan, addWheelPassthrough, rectHitTest, cursorForBboxMode } from './utility.js';
const { app } = window.comfyAPI.app;

const HANDLE = 8;            // hit radius (canvas px) for corners/edges
const MAX_ELEM_COLORS = 5;   // Ideogram 4 per-element palette cap
const MAX_STYLE_COLORS = 16; // Ideogram 4 style palette cap
const DEFAULT_LOCAL_MODEL = "huihui-ai/Huihui-Qwen3-VL-4B-Instruct-abliterated";
const DEFAULT_OLLAMA_HOST = "http://localhost:11434";
// Popular local vision LLMs offered as a dropdown. The field still accepts ANY Hugging
// Face vision model id — these are just convenient, known-loadable starting points.
const LOCAL_MODEL_PRESETS = [
  "huihui-ai/Huihui-Qwen3-VL-4B-Instruct-abliterated",
  "huihui-ai/Huihui-Qwen3-VL-8B-Instruct-abliterated",
  "Qwen/Qwen3-VL-2B-Instruct",
  "Qwen/Qwen3-VL-4B-Instruct",
  "Qwen/Qwen3-VL-8B-Instruct",
  "Qwen/Qwen2.5-VL-3B-Instruct",
  "Qwen/Qwen2.5-VL-7B-Instruct",
  "google/gemma-3-4b-it",
  "google/gemma-3-12b-it",
  "OpenGVLab/InternVL3-2B-hf",
  "OpenGVLab/InternVL3-8B-hf",
  "mistralai/Mistral-Small-3.1-24B-Instruct-2503",
];
let copiedBox = null;        // internal clipboard for copy/paste of regions (shared across nodes)

// Black or white, whichever contrasts better with the given hex background.
function textOn(hex) {
  const h = (hex || "").replace("#", "");
  if (h.length < 6) return "#000";
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 140 ? "#000" : "#fff";
}

// Premium monochrome theme: pure-black surfaces, white text, white/outlined controls.
function injectStyle() {
  if (document.getElementById("ideoap-style")) return;
  const s = document.createElement("style");
  s.id = "ideoap-style";
  s.textContent = `
    .ideoap-wrap { display:flex; flex-direction:column; overflow:hidden; position:relative; pointer-events:auto; gap:6px; background:#000; padding:2px; border-radius:6px; }
    .ideoap-canvas { cursor:crosshair; display:block; width:100%; height:auto; flex:0 0 auto; background:#000; border:1px solid #1c1c1c; border-radius:6px; outline:none; }
    .ideoap-ai { display:flex; flex-direction:column; gap:7px; padding:9px; background:#050505; border:1px solid #1f1f1f; border-radius:6px; }
    .ideoap-bar { display:flex; align-items:center; gap:7px; font:11px ui-sans-serif,system-ui,sans-serif; color:#cfcfcf; user-select:none; padding:0 2px; flex:0 0 auto; flex-wrap:wrap; }
    .ideoap-panel { display:flex; flex-direction:column; gap:6px; padding:8px; background:#070707; border:1px solid #1f1f1f; border-radius:6px; font:11px ui-sans-serif,system-ui,sans-serif; color:#dcdcdc; flex:0 0 auto; }
    .ideoap-row { display:flex; align-items:center; gap:7px; flex-wrap:wrap; }
    .ideoap-lbl { color:#8a8a8a; font:10px ui-sans-serif,system-ui,sans-serif; letter-spacing:.04em; text-transform:uppercase; }
    .ideoap-btn { background:transparent; border:1px solid #3a3a3a; border-radius:5px; color:#e6e6e6; font:11px ui-sans-serif,system-ui,sans-serif; cursor:pointer; padding:3px 10px; line-height:16px; white-space:nowrap; flex-shrink:0; transition:background .12s,color .12s,border-color .12s; }
    .ideoap-btn:hover { background:#fff; color:#000; border-color:#fff; }
    .ideoap-btn.active { background:#fff; color:#000; border-color:#fff; }
    .ideoap-btn:disabled { opacity:.4; cursor:default; background:transparent; color:#888; border-color:#2a2a2a; }
    .ideoap-btn.primary { background:#fff; color:#000; border-color:#fff; font-weight:600; }
    .ideoap-btn.primary:hover { background:#dcdcdc; border-color:#dcdcdc; }
    .ideoap-area, .ideoap-input { width:100%; box-sizing:border-box; background:#000; border:1px solid #2c2c2c; border-radius:5px; color:#f0f0f0; font:12px ui-monospace,monospace; padding:6px 8px; resize:vertical; }
    .ideoap-area { min-height:34px; }
    .ideoap-area:focus, .ideoap-input:focus { border-color:#fff; outline:none; }
    .ideoap-input { resize:none; }
    .ideoap-select { background:#000; border:1px solid #2c2c2c; border-radius:5px; color:#f0f0f0; font:11px ui-sans-serif,system-ui,sans-serif; padding:3px 6px; flex:1; min-width:80px; }
    .ideoap-drop { flex:1; min-width:120px; display:flex; align-items:center; justify-content:center; gap:8px; min-height:40px; border:1px dashed #333; border-radius:5px; color:#7a7a7a; font:11px ui-sans-serif,system-ui,sans-serif; cursor:pointer; padding:4px; text-align:center; transition:border-color .12s,color .12s; }
    .ideoap-drop:hover, .ideoap-drop.drag { border-color:#fff; color:#ccc; }
    .ideoap-thumb { height:40px; width:auto; max-width:80px; border-radius:4px; border:1px solid #2c2c2c; object-fit:cover; }
    .ideoap-status { font:11px ui-sans-serif,system-ui,sans-serif; color:#8a8a8a; min-height:14px; flex:1; }
    .ideoap-status.err { color:#ff6b6b; }
    .ideoap-sw { width:20px; height:20px; border:1px solid #444; border-radius:4px; cursor:pointer; flex-shrink:0; position:relative; }
    .ideoap-sw input { position:absolute; opacity:0; width:0; height:0; pointer-events:none; }
    .ideoap-inline { position:absolute; box-sizing:border-box; background:rgba(0,0,0,0.94); border:1px solid #fff; border-radius:4px; color:#fff; font:13px ui-monospace,monospace; padding:4px 5px; resize:none; outline:none; z-index:10; }
    .ideoap-toggle { display:flex; align-items:center; gap:5px; color:#9a9a9a; font:10px ui-sans-serif,system-ui,sans-serif; cursor:pointer; user-select:none; }
    .ideoap-spin { width:11px; height:11px; border:2px solid #444; border-top-color:#fff; border-radius:50%; display:inline-block; animation:ideoap-rot .7s linear infinite; vertical-align:-1px; }
    @keyframes ideoap-rot { to { transform:rotate(360deg); } }
  `;
  document.head.appendChild(s);
}

app.registerExtension({
  name: "Ideogram.Autoprompter",

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData?.name !== "Ideogram4Autoprompter") return;
    injectStyle();

    chainCallback(nodeType.prototype, "onNodeCreated", function () {
      const node = this;
      const findW = (n) => node.widgets?.find((w) => w.name === n);
      const elementsWidget = findW("elements_data");
      const stylePaletteWidget = findW("style_palette_data");
      const aiStateWidget = findW("ai_state");
      const wWidget = findW("width"), hWidget = findW("height");

      // Hide the data widgets while keeping them serializable.
      function hideDataWidgets() {
        for (const w of [elementsWidget, stylePaletteWidget, aiStateWidget]) {
          if (!w) continue;
          w.hidden = true;
          w.computeSize = () => [0, -4];
        }
        for (const name of ["elements_data", "style_palette_data", "ai_state"]) {
          const i = node.inputs?.findIndex((inp) => inp.name === name);
          if (i != null && i !== -1) node.removeInput(i);
        }
      }
      hideDataWidgets();

      node._boxes = [];        // {x,y,w,h normalized 0-1, type, text, desc, palette[]}
      node._stylePalette = []; // global style color palette (hex[])
      node._activeIdx = -1;
      node._drawing = false;
      node._dragMode = null;
      node._dragStartN = null;
      node._boxAtStart = null;
      node._hoverTitle = null;
      node._hoverBox = null;
      node._focused = false;
      node._selected = false;
      node._areaH = node._areaH || {};
      node._areaObservers = [];
      // AI state (serialized to ai_state, minus the API key) + transient image/key.
      node._ai = { backend: "local", idea: "", local_model: DEFAULT_LOCAL_MODEL,
        gemini_model: "", unload_after: true, four_bit: false, density: "normal", attn: "auto",
        ollama_host: DEFAULT_OLLAMA_HOST, ollama_model: "", openrouter_model: "", think: false };
      node._apiKey = "";       // session only — never serialized
      node._orKey = "";        // OpenRouter key — session only, never serialized
      node._image = null;      // { b64, url } — session only
      node._gening = false;

      // ── DOM ──
      const wrap = document.createElement("div");
      wrap.className = "ideoap-wrap";

      // AI bar (top)
      const aiBar = document.createElement("div");
      aiBar.className = "ideoap-ai";

      // backend toggle
      const backendRow = document.createElement("div");
      backendRow.className = "ideoap-row";
      const backendLbl = document.createElement("span"); backendLbl.className = "ideoap-lbl"; backendLbl.textContent = "Engine";
      backendRow.appendChild(backendLbl);
      const localBtn = document.createElement("button"); localBtn.className = "ideoap-btn"; localBtn.textContent = "Local";
      localBtn.title = "Transformers (HF auto-download). Most compatible, but slower.";
      const ollamaBtn = document.createElement("button"); ollamaBtn.className = "ideoap-btn"; ollamaBtn.textContent = "Ollama";
      ollamaBtn.title = "Ollama (llama.cpp / GGUF) — fastest on most GPUs. Needs `ollama serve` running.";
      const gemBtn = document.createElement("button"); gemBtn.className = "ideoap-btn"; gemBtn.textContent = "Gemini";
      const orBtn = document.createElement("button"); orBtn.className = "ideoap-btn"; orBtn.textContent = "OpenRouter";
      orBtn.title = "OpenRouter — one key, hundreds of hosted vision models (GPT-4o, Claude, Gemini, Qwen-VL…).";
      backendRow.appendChild(localBtn); backendRow.appendChild(ollamaBtn); backendRow.appendChild(gemBtn); backendRow.appendChild(orBtn);
      // detail / object-density segmented control
      const densSpacer = document.createElement("span"); densSpacer.style.flex = "1"; backendRow.appendChild(densSpacer);
      const densLbl = document.createElement("span"); densLbl.className = "ideoap-lbl"; densLbl.textContent = "Detail";
      backendRow.appendChild(densLbl);
      const densNormalBtn = document.createElement("button"); densNormalBtn.className = "ideoap-btn"; densNormalBtn.textContent = "Normal";
      densNormalBtn.title = "Default decomposition (system prompt as-is).";
      const densHighBtn = document.createElement("button"); densHighBtn.className = "ideoap-btn"; densHighBtn.textContent = "High";
      densHighBtn.title = "Aggressive decomposition: one bbox per distinct object (e.g. table and vase become two).";
      backendRow.appendChild(densNormalBtn); backendRow.appendChild(densHighBtn);
      aiBar.appendChild(backendRow);

      // idea
      const ideaTa = document.createElement("textarea");
      ideaTa.className = "ideoap-area";
      ideaTa.placeholder = "Describe the image you want… (or drop a reference image)";
      ideaTa.style.minHeight = "46px";
      aiBar.appendChild(ideaTa);

      // image drop + generate row
      const genRow = document.createElement("div");
      genRow.className = "ideoap-row";
      const drop = document.createElement("div");
      drop.className = "ideoap-drop";
      drop.textContent = "+ reference image (optional)";
      const fileInput = document.createElement("input");
      fileInput.type = "file"; fileInput.accept = "image/*"; fileInput.style.display = "none";
      const generateBtn = document.createElement("button");
      generateBtn.className = "ideoap-btn primary"; generateBtn.textContent = "Generate";
      genRow.appendChild(drop); genRow.appendChild(fileInput); genRow.appendChild(generateBtn);
      aiBar.appendChild(genRow);

      // gemini-only row (api key + fetch + model)
      const gemRow = document.createElement("div");
      gemRow.className = "ideoap-row";
      const keyInput = document.createElement("input");
      keyInput.className = "ideoap-input"; keyInput.type = "password";
      keyInput.placeholder = "Gemini API key"; keyInput.style.flex = "1"; keyInput.style.minWidth = "120px";
      const fetchBtn = document.createElement("button"); fetchBtn.className = "ideoap-btn"; fetchBtn.textContent = "Fetch models";
      const modelSelect = document.createElement("select"); modelSelect.className = "ideoap-select";
      const ph = document.createElement("option"); ph.value = ""; ph.textContent = "— models —"; modelSelect.appendChild(ph);
      gemRow.appendChild(keyInput); gemRow.appendChild(fetchBtn); gemRow.appendChild(modelSelect);
      aiBar.appendChild(gemRow);

      // key hint — shown only while the Gemini key box is empty
      const keyHint = document.createElement("div");
      keyHint.className = "ideoap-status";
      keyHint.style.cssText = "color:#8a8a8a; font:11px ui-sans-serif,system-ui,sans-serif;";
      keyHint.innerHTML = 'Get a free API key from <a href="https://aistudio.google.com/" target="_blank" rel="noopener" style="color:#fff; text-decoration:underline;">aistudio.google.com</a>';
      aiBar.appendChild(keyHint);

      // ollama row (host + fetch + model select)
      const ollamaRow = document.createElement("div");
      ollamaRow.className = "ideoap-row";
      const hostInput = document.createElement("input");
      hostInput.className = "ideoap-input";
      hostInput.placeholder = DEFAULT_OLLAMA_HOST; hostInput.value = DEFAULT_OLLAMA_HOST;
      hostInput.style.flex = "1"; hostInput.style.minWidth = "120px";
      hostInput.title = "Ollama server URL.";
      const ollamaFetchBtn = document.createElement("button"); ollamaFetchBtn.className = "ideoap-btn"; ollamaFetchBtn.textContent = "Fetch models";
      const ollamaSelect = document.createElement("select"); ollamaSelect.className = "ideoap-select";
      const oph = document.createElement("option"); oph.value = ""; oph.textContent = "— models —"; ollamaSelect.appendChild(oph);
      ollamaRow.appendChild(hostInput); ollamaRow.appendChild(ollamaFetchBtn); ollamaRow.appendChild(ollamaSelect);
      aiBar.appendChild(ollamaRow);

      const ollamaHint = document.createElement("div");
      ollamaHint.className = "ideoap-status";
      ollamaHint.style.cssText = "color:#8a8a8a; font:11px ui-sans-serif,system-ui,sans-serif;";
      ollamaHint.innerHTML = 'Fastest engine. Start it with <span style="color:#fff;">ollama serve</span> and pull a vision model, e.g. <span style="color:#fff;">ollama pull qwen2.5vl</span>.';
      aiBar.appendChild(ollamaHint);

      // openrouter row (api key + fetch + model select)
      const orRow = document.createElement("div");
      orRow.className = "ideoap-row";
      const orKeyInput = document.createElement("input");
      orKeyInput.className = "ideoap-input"; orKeyInput.type = "password";
      orKeyInput.placeholder = "OpenRouter API key"; orKeyInput.style.flex = "1"; orKeyInput.style.minWidth = "120px";
      const orFetchBtn = document.createElement("button"); orFetchBtn.className = "ideoap-btn"; orFetchBtn.textContent = "Fetch models";
      const orSelect = document.createElement("select"); orSelect.className = "ideoap-select";
      const orph = document.createElement("option"); orph.value = ""; orph.textContent = "— models —"; orSelect.appendChild(orph);
      orRow.appendChild(orKeyInput); orRow.appendChild(orFetchBtn); orRow.appendChild(orSelect);
      aiBar.appendChild(orRow);

      const orHint = document.createElement("div");
      orHint.className = "ideoap-status";
      orHint.style.cssText = "color:#8a8a8a; font:11px ui-sans-serif,system-ui,sans-serif;";
      orHint.innerHTML = 'Get a key from <a href="https://openrouter.ai/keys" target="_blank" rel="noopener" style="color:#fff; text-decoration:underline;">openrouter.ai/keys</a>. Fetch lists vision-capable models only.';
      aiBar.appendChild(orHint);

      // local-only row (model id + 4-bit)
      const localRow = document.createElement("div");
      localRow.className = "ideoap-row";
      const localModelInput = document.createElement("input");
      localModelInput.className = "ideoap-input"; localModelInput.value = DEFAULT_LOCAL_MODEL;
      localModelInput.style.flex = "1"; localModelInput.style.minWidth = "140px";
      localModelInput.title = "Hugging Face id of any local vision LLM (Qwen-VL, Gemma 3, InternVL, …). Pick a preset or type your own.";
      const localModelList = document.createElement("datalist");
      localModelList.id = "ideoap-local-models-" + (node.id != null ? node.id : Math.random().toString(36).slice(2));
      for (const m of LOCAL_MODEL_PRESETS) {
        const opt = document.createElement("option"); opt.value = m; localModelList.appendChild(opt);
      }
      localModelInput.setAttribute("list", localModelList.id);
      const attnSelect = document.createElement("select");
      attnSelect.className = "ideoap-select";
      attnSelect.style.flex = "0 0 auto"; attnSelect.style.minWidth = "92px";
      attnSelect.title = "Attention kernel. Auto picks Flash-Attention 2 if installed, else SDPA (fast PyTorch fused attention). SDPA forces SDPA; Eager is the slow reference path.";
      for (const [val, label] of [["auto", "Attn: Auto"], ["flash_attention_2", "Attn: Flash"], ["sdpa", "Attn: SDPA"], ["eager", "Attn: Eager"]]) {
        const opt = document.createElement("option"); opt.value = val; opt.textContent = label; attnSelect.appendChild(opt);
      }
      const fourBitWrap = document.createElement("label"); fourBitWrap.className = "ideoap-toggle";
      const fourBit = document.createElement("input"); fourBit.type = "checkbox";
      fourBitWrap.appendChild(fourBit); fourBitWrap.appendChild(document.createTextNode("4-bit"));
      localRow.appendChild(localModelInput); localRow.appendChild(localModelList);
      localRow.appendChild(attnSelect); localRow.appendChild(fourBitWrap);
      aiBar.appendChild(localRow);

      // status + settings row
      const statusRow = document.createElement("div");
      statusRow.className = "ideoap-row";
      const status = document.createElement("div"); status.className = "ideoap-status";
      const unloadWrap = document.createElement("label"); unloadWrap.className = "ideoap-toggle";
      unloadWrap.title = "Free the model right after generating. Local: drops it from VRAM. Ollama: sends keep_alive 0 so it unloads instantly instead of idling for 5 minutes.";
      const unloadCb = document.createElement("input"); unloadCb.type = "checkbox"; unloadCb.checked = true;
      unloadWrap.appendChild(unloadCb); unloadWrap.appendChild(document.createTextNode("unload after"));
      const thinkWrap = document.createElement("label"); thinkWrap.className = "ideoap-toggle";
      thinkWrap.title = "Let the model reason before answering. Off is faster and more reliable for JSON; turn on only for models that need it.";
      const thinkCb = document.createElement("input"); thinkCb.type = "checkbox"; thinkCb.checked = false;
      thinkWrap.appendChild(thinkCb); thinkWrap.appendChild(document.createTextNode("think"));
      statusRow.appendChild(status); statusRow.appendChild(thinkWrap); statusRow.appendChild(unloadWrap);
      aiBar.appendChild(statusRow);

      // editor toolbar
      const bar = document.createElement("div");
      bar.className = "ideoap-bar";
      const hint = document.createElement("span");
      hint.style.flex = "1";
      const copyBtn = document.createElement("button");
      copyBtn.className = "ideoap-btn"; copyBtn.textContent = "Copy";
      copyBtn.title = "Copy the current caption JSON to the clipboard";
      const importBtn = document.createElement("button");
      importBtn.className = "ideoap-btn"; importBtn.textContent = "Paste";
      importBtn.title = "Parse a caption JSON (clipboard, else prompt) and populate the node";
      const clearBtn = document.createElement("button");
      clearBtn.className = "ideoap-btn"; clearBtn.textContent = "Clear all";
      const tokenSpan = document.createElement("span");
      tokenSpan.style.cssText = "color:#666; white-space:nowrap;";
      tokenSpan.title = "Rough token estimate (~chars/4) of the caption prompt — not exact";
      bar.appendChild(hint); bar.appendChild(tokenSpan); bar.appendChild(copyBtn); bar.appendChild(importBtn); bar.appendChild(clearBtn);

      // style palette row
      const styleBar = document.createElement("div");
      styleBar.className = "ideoap-bar";
      const styleLbl = document.createElement("span"); styleLbl.className = "ideoap-lbl"; styleLbl.textContent = "Style colors";
      styleBar.appendChild(styleLbl);

      const canvasEl = document.createElement("canvas");
      canvasEl.className = "ideoap-canvas";
      canvasEl.tabIndex = 0;
      canvasEl.title = "Drag to draw · click to select · alt-click overlap · dbl-click edit · " +
        "Del remove · Ctrl/Cmd+C/V/D copy/paste/duplicate";
      const ctx = canvasEl.getContext("2d");
      addWheelPassthrough(wrap);
      addMiddleClickPan(canvasEl);

      const panel = document.createElement("div");
      panel.className = "ideoap-panel";

      wrap.appendChild(aiBar);
      wrap.appendChild(bar); wrap.appendChild(styleBar); wrap.appendChild(canvasEl); wrap.appendChild(panel);

      const TOOLBAR_H = 22;
      node._widgetHeight = 480;
      node.ideoEditor = node.addDOMWidget("ideo_editor", "Ideogram4Autoprompter", wrap, {
        serialize: false, hideOnZoom: false,
        getMinHeight: () => node._widgetHeight,
      });
      node.resizable = true;

      // ── canvas sizing ──
      function setCanvasSize(w, h) {
        canvasEl.style.aspectRatio = `${w} / ${h}`;
        if (node.graph) node.graph.setDirtyCanvas(true, true);
      }
      function syncCanvasToDims() {
        const w = wWidget ? wWidget.value : 1024, h = hWidget ? hWidget.value : 1024;
        setCanvasSize(Math.max(1, w), Math.max(1, h));
        drawCanvas();
      }
      function recalcWidgetHeight() {
        const contentH = panel.offsetTop + panel.offsetHeight;
        if (contentH > 0) {
          node._widgetHeight = contentH + 10;
        } else {
          const ratio = (hWidget?.value || 1) / (wWidget?.value || 1);
          node._widgetHeight = Math.round(Math.max(100, node.size[0] - 30) * ratio) + TOOLBAR_H + 220;
        }
      }
      function fitNode() {
        recalcWidgetHeight();
        const minH = node.computeSize()[1];
        if (node.size[1] < minH) node.setSize([node.size[0], minH]);
      }

      // ── geometry helpers ──
      function logW() { return canvasEl.offsetWidth || 1; }
      function logH() { return canvasEl.offsetHeight || 1; }
      function toPx(b) {
        const W = logW(), H = logH();
        return { x1: b.x * W, y1: b.y * H, x2: (b.x + b.w) * W, y2: (b.y + b.h) * H };
      }
      function mouseN(e) {
        const r = canvasEl.getBoundingClientRect();
        return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
      }
      function clamp01(v) { return Math.max(0, Math.min(1, v)); }
      function wrapLines(text, maxW) {
        const lines = [];
        for (const para of text.split("\n")) {
          let line = "";
          for (const word of para.split(/\s+/)) {
            if (!word) continue;
            const test = line ? line + " " + word : word;
            if (line && ctx.measureText(test).width > maxW) { lines.push(line); line = word; }
            else line = test;
          }
          lines.push(line);
        }
        return lines;
      }
      function normalizeBox(b) {
        let x = b.x, y = b.y, w = b.w, h = b.h;
        if (w < 0) { x += w; w = -w; }
        if (h < 0) { y += h; h = -h; }
        x = clamp01(x); y = clamp01(y);
        w = Math.min(w, 1 - x); h = Math.min(h, 1 - y);
        return { ...b, x, y, w: Math.max(0, w), h: Math.max(0, h) };
      }
      function boxesAt(mN) {
        const rx = HANDLE / logW(), ry = HANDLE / logH();
        const res = [];
        for (let i = node._boxes.length - 1; i >= 0; i--) {
          const b = node._boxes[i];
          const mode = rectHitTestN(mN.x, mN.y, b.x, b.y, b.x + b.w, b.y + b.h, rx, ry);
          if (mode) res.push({ index: i, mode });
        }
        const ai = res.findIndex((c) => c.index === node._activeIdx);
        if (ai > 0) res.unshift(res.splice(ai, 1)[0]);
        return res;
      }
      function hitTest(mN) {
        const cands = boxesAt(mN);
        if (!cands.length) return null;
        return cands.find((c) => c.index === node._activeIdx && c.mode !== "move") || cands[0];
      }
      function tagRects() {
        ctx.font = "bold 11px ui-monospace,monospace";
        const W = logW(), H = logH(), h = 14;
        const placed = [], rects = [];
        const hits = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
        for (let i = 0; i < node._boxes.length; i++) {
          const b = node._boxes[i];
          const x1 = b.x * W, y1 = b.y * H, x2 = (b.x + b.w) * W, y2 = (b.y + b.h) * H;
          const tag = String(i + 1).padStart(2, "0");
          const w = ctx.measureText(tag).width + 8;
          let pick = [x1, y1];
          for (const [cx, cy] of [[x1, y1], [x2 - w, y1], [x2 - w, y2 - h], [x1, y2 - h]]) {
            if (!placed.some((p) => hits({ x: cx, y: cy, w, h }, p))) { pick = [cx, cy]; break; }
          }
          const r = { x: pick[0], y: pick[1], w, h, tag };
          placed.push(r); rects[i] = r;
        }
        return rects;
      }
      function titleAt(mN) {
        const px = mN.x * logW(), py = mN.y * logH();
        const rects = tagRects();
        for (let i = node._boxes.length - 1; i >= 0; i--) {
          const r = rects[i];
          if (r && px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return i;
        }
        return null;
      }
      function pickForSelection(mN, cycle) {
        const cands = boxesAt(mN);
        if (!cands.length) return null;
        const ah = cands.find((c) => c.index === node._activeIdx && c.mode !== "move");
        if (ah && !cycle) return ah;
        const ti = titleAt(mN);
        if (ti !== null && !cycle) return { index: ti, mode: "move" };
        if (cycle && cands.length > 1) {
          const pos = cands.findIndex((c) => c.index === node._activeIdx);
          return cands[(pos + 1) % cands.length];
        }
        return cands.find((c) => c.index === node._activeIdx && c.mode !== "move") || cands[0];
      }
      function rectHitTestN(mx, my, x1, y1, x2, y2, rx, ry) {
        const h = (cx, cy) => Math.abs(mx - cx) < rx && Math.abs(my - cy) < ry;
        if (h(x1, y1)) return "resize-tl";
        if (h(x2, y1)) return "resize-tr";
        if (h(x1, y2)) return "resize-bl";
        if (h(x2, y2)) return "resize-br";
        if (mx >= x1 && mx <= x2 && Math.abs(my - y1) < ry) return "resize-t";
        if (mx >= x1 && mx <= x2 && Math.abs(my - y2) < ry) return "resize-b";
        if (my >= y1 && my <= y2 && Math.abs(mx - x1) < rx) return "resize-l";
        if (my >= y1 && my <= y2 && Math.abs(mx - x2) < rx) return "resize-r";
        if (mx >= x1 && mx <= x2 && my >= y1 && my <= y2) return "move";
        return null;
      }
      function applyDrag(mode, start, dN) {
        let { x, y, w, h } = start;
        const dx = dN.x, dy = dN.y;
        switch (mode) {
          case "move": x += dx; y += dy; x = clamp01(Math.min(x, 1 - w)); y = clamp01(Math.min(y, 1 - h)); break;
          case "draw":
          case "resize-br": w += dx; h += dy; break;
          case "resize-tl": x += dx; y += dy; w -= dx; h -= dy; break;
          case "resize-tr": y += dy; w += dx; h -= dy; break;
          case "resize-bl": x += dx; w -= dx; h += dy; break;
          case "resize-t": y += dy; h -= dy; break;
          case "resize-b": h += dy; break;
          case "resize-l": x += dx; w -= dx; break;
          case "resize-r": w += dx; break;
        }
        return mode === "move" ? { ...start, x, y } : normalizeBox({ ...start, x, y, w, h });
      }

      // ── drawing ──
      let _rafPending = false;
      function drawCanvas() {
        if (_rafPending) return;
        _rafPending = true;
        requestAnimationFrame(() => { _rafPending = false; _draw(); });
      }
      function _draw() {
        const W = logW(), H = logH(), d = window.devicePixelRatio || 1;
        const bw = Math.round(W * d), bh = Math.round(H * d);
        if (canvasEl.width !== bw || canvasEl.height !== bh) { canvasEl.width = bw; canvasEl.height = bh; }
        ctx.setTransform(d, 0, 0, d, 0, 0);
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
        const aIdx = (node._focused || node._selected) ? node._activeIdx : -1;
        const order = node._boxes.map((_, i) => i).filter((i) => i !== aIdx);
        if (aIdx >= 0 && aIdx < node._boxes.length) order.push(aIdx);
        const tagR = tagRects();
        for (const i of order) {
          const b = node._boxes[i], active = i === aIdx;
          const pal = (b.palette || []).filter(Boolean);
          const col = pal.length ? pal[0] : "#9a9a9a";       // box accent = first palette color, else grey
          const { x1, y1, x2, y2 } = toPx(b);
          const w = x2 - x1, h = y2 - y1;
          const hovered = i === node._hoverBox || active;
          if (active) { ctx.fillStyle = "rgba(0,0,0,0.9)"; ctx.fillRect(x1, y1, w, h); }
          ctx.fillStyle = col + (hovered ? "33" : "1f");
          ctx.fillRect(x1, y1, w, h);
          if (b.nobbox) ctx.setLineDash([6, 4]);
          const lw = active ? 2 : (hovered ? 1.5 : 1);
          ctx.strokeStyle = col; ctx.lineWidth = lw;
          ctx.strokeRect(x1 + lw / 2, y1 + lw / 2, w - lw, h - lw);
          ctx.setLineDash([]);
          if (pal.length) {
            const sw = w / pal.length, n = pal.length, sh = 7;
            for (let p = 0; p < n; p++) {
              const sx = x1 + Math.round(p * sw);
              ctx.fillStyle = pal[p];
              ctx.fillRect(sx, y1, x1 + Math.round((p + 1) * sw) - sx, sh);
            }
          }
          ctx.save();
          ctx.beginPath(); ctx.rect(x1, y1, w, h); ctx.clip();
          let body = b.desc || "";
          if (b.type === "text" && b.text) body = `"${b.text}"` + (body ? " — " + body : "");
          if (body) {
            ctx.font = "12px ui-monospace,monospace";
            ctx.fillStyle = "#e6e6e6";
            const pad = 4, lh = 14;
            let ty = y1 + 15 + 12;
            for (const line of wrapLines(body, w - pad * 2)) {
              if (ty > y1 + h) break;
              ctx.fillText(line, x1 + pad, ty);
              ty += lh;
            }
          }
          const tr = tagR[i];
          const tagBg = col;
          ctx.font = "bold 11px ui-monospace,monospace";
          ctx.fillStyle = tagBg;
          ctx.fillRect(tr.x, tr.y, tr.w, 14);
          if (i === node._hoverTitle) {
            ctx.fillStyle = "rgba(255,255,255,0.3)"; ctx.fillRect(tr.x, tr.y, tr.w, 14);
            ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.strokeRect(tr.x + 0.5, tr.y + 0.5, tr.w - 1, 13);
          }
          ctx.fillStyle = textOn(tagBg);
          ctx.fillText(tr.tag, tr.x + 4, tr.y + 11);
          ctx.restore();
        }
      }

      // ── serialization ──
      function serialize() {
        if (elementsWidget) elementsWidget.value = node._boxes.length ? JSON.stringify(node._boxes) : "";
        if (stylePaletteWidget) stylePaletteWidget.value = node._stylePalette.length ? JSON.stringify(node._stylePalette) : "";
      }
      function serializeAi() {
        if (aiStateWidget) aiStateWidget.value = JSON.stringify(node._ai);   // never includes the API key
      }
      function commit() { serialize(); renderPanel(); drawCanvas(); updateTokens(); }

      function removeBox(i) {
        node._boxes.splice(i, 1);
        if (node._boxes.length === 0) node._activeIdx = -1;
        else if (i <= node._activeIdx) node._activeIdx = Math.max(0, node._activeIdx - 1);
      }

      // ── pointer interaction ──
      canvasEl.addEventListener("mousedown", (e) => {
        if (e.button === 2) {
          e.preventDefault();
          const hit = hitTest(mouseN(e));
          if (hit) removeBox(hit.index);
          else if (node._activeIdx >= 0) removeBox(node._activeIdx);
          commit(); fitNode();
          return;
        }
        if (e.button !== 0) return;
        canvasEl.focus();
        node._hoverTitle = null; node._hoverBox = null;
        const mN = mouseN(e);
        const hit = pickForSelection(mN, e.altKey);
        if (hit) {
          node._activeIdx = hit.index;
          node._dragMode = hit.mode;
          node._boxAtStart = { ...node._boxes[hit.index] };
        } else {
          node._dragMode = "draw";
          const nb = { x: mN.x, y: mN.y, w: 0, h: 0, type: "obj", text: "", desc: "", palette: [] };
          node._boxes.push(nb);
          node._activeIdx = node._boxes.length - 1;
          node._boxAtStart = { ...nb };
        }
        node._drawing = true;
        node._dragStartN = mN;
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
        e.preventDefault(); e.stopPropagation();
        drawCanvas();
      });
      canvasEl.addEventListener("mousemove", (e) => {
        if (node._drawing) return;
        const mN = mouseN(e);
        const ti = titleAt(mN);
        const hit = hitTest(mN);
        const hb = ti != null ? ti : (hit ? hit.index : null);
        if (ti !== node._hoverTitle || hb !== node._hoverBox) {
          node._hoverTitle = ti; node._hoverBox = hb; drawCanvas();
        }
        canvasEl.style.cursor = ti != null ? "pointer" : (hit ? (cursorForBboxMode(hit.mode) || "crosshair") : "crosshair");
      });
      canvasEl.addEventListener("mouseleave", () => {
        if (node._hoverTitle !== null || node._hoverBox !== null) {
          node._hoverTitle = null; node._hoverBox = null; drawCanvas();
        }
      });

      // ── inline description editing ──
      let inlineTa = null;
      function closeInlineEditor() { if (inlineTa) { inlineTa.remove(); inlineTa = null; } }
      function openInlineEditor(idx) {
        closeInlineEditor();
        const b = node._boxes[idx];
        if (!b) return;
        node._activeIdx = idx;
        const dw = canvasEl.offsetWidth, dh = canvasEl.offsetHeight;
        const ox = canvasEl.offsetLeft, oy = canvasEl.offsetTop;
        const w = Math.min(dw, Math.max(70, b.w * dw));
        const h = Math.min(dh, Math.max(42, b.h * dh));
        const left = Math.max(ox, Math.min(ox + b.x * dw, ox + dw - w));
        const top = Math.max(oy, Math.min(oy + b.y * dh, oy + dh - h));
        const ta = document.createElement("textarea");
        ta.className = "ideoap-inline";
        ta.value = b.desc || "";
        ta.style.left = left + "px"; ta.style.top = top + "px";
        ta.style.width = w + "px"; ta.style.height = h + "px";
        ta.style.borderColor = (b.palette || []).find(Boolean) || "#fff";
        stopProp(ta);
        wrap.appendChild(ta);
        inlineTa = ta;
        ta.focus(); ta.select();
        const orig = b.desc || "";
        let cancelled = false;
        ta.addEventListener("input", () => { b.desc = ta.value; drawCanvas(); updateTokens(); });
        ta.addEventListener("keydown", (e) => {
          e.stopPropagation();
          if (e.key === "Escape") { cancelled = true; b.desc = orig; ta.blur(); }
          else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) ta.blur();
        });
        ta.addEventListener("blur", () => {
          if (!cancelled) b.desc = ta.value;
          closeInlineEditor(); commit();
        });
      }
      canvasEl.addEventListener("dblclick", (e) => {
        e.preventDefault(); e.stopPropagation();
        const cands = boxesAt(mouseN(e));
        const target = cands.find((c) => c.index === node._activeIdx) || cands[0];
        if (target) openInlineEditor(target.index);
      });

      function pasteBox() {
        if (!copiedBox) return;
        const nb = JSON.parse(JSON.stringify(copiedBox));
        nb.x = Math.max(0, Math.min(clamp01(nb.x + 0.03), 1 - nb.w));
        nb.y = Math.max(0, Math.min(clamp01(nb.y + 0.03), 1 - nb.h));
        delete nb.nobbox;
        node._boxes.push(nb);
        node._activeIdx = node._boxes.length - 1;
        commit(); fitNode();
      }
      canvasEl.addEventListener("keydown", (e) => {
        if (node._drawing) return;
        const ctrl = e.ctrlKey || e.metaKey;
        if ((e.key === "Delete" || e.key === "Backspace") && node._activeIdx >= 0) {
          e.preventDefault(); e.stopPropagation();
          removeBox(node._activeIdx); commit(); fitNode();
        } else if (ctrl && e.key === "c" && node._activeIdx >= 0) {
          e.preventDefault(); e.stopPropagation();
          copiedBox = JSON.parse(JSON.stringify(node._boxes[node._activeIdx]));
        } else if (ctrl && e.key === "v" && copiedBox) {
          e.preventDefault(); e.stopPropagation();
          pasteBox();
        } else if (ctrl && e.key === "d" && node._activeIdx >= 0) {
          e.preventDefault(); e.stopPropagation();
          copiedBox = JSON.parse(JSON.stringify(node._boxes[node._activeIdx]));
          pasteBox();
        }
      });

      function onMove(e) {
        if (!node._drawing) return;
        const mN = mouseN(e);
        const dN = { x: mN.x - node._dragStartN.x, y: mN.y - node._dragStartN.y };
        const nb = applyDrag(node._dragMode, node._boxAtStart, dN);
        delete nb.nobbox;
        node._boxes[node._activeIdx] = nb;
        drawCanvas();
      }
      function onUp() {
        if (!node._drawing) return;
        node._drawing = false;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        const b = node._boxes[node._activeIdx];
        if (b && (b.w < 0.005 || b.h < 0.005) && node._dragMode === "draw") removeBox(node._activeIdx);
        commit();
      }
      canvasEl.addEventListener("contextmenu", (e) => e.preventDefault());
      clearBtn.addEventListener("mousedown", (e) => e.stopPropagation());
      clearBtn.addEventListener("click", () => {
        closeInlineEditor();
        node._boxes = []; node._activeIdx = -1; node._stylePalette = [];
        commit(); rebuildStylePalette(); fitNode();
      });

      // ── build caption JSON (mirrors Python key order) ──
      function pyJson(v, lvl = 0) {
        if (v === null) return "null";
        if (typeof v === "number" || typeof v === "boolean") return String(v);
        if (typeof v === "string") return JSON.stringify(v);
        const pad = "    ".repeat(lvl + 1), end = "    ".repeat(lvl);
        if (Array.isArray(v)) {
          if (!v.length) return "[]";
          if (v.every((x) => x === null || typeof x !== "object"))
            return "[" + v.map((x) => pyJson(x, lvl)).join(", ") + "]";
          return "[\n" + v.map((x) => pad + pyJson(x, lvl + 1)).join(",\n") + "\n" + end + "]";
        }
        const keys = Object.keys(v);
        if (!keys.length) return "{}";
        return "{\n" + keys.map((k) => pad + JSON.stringify(k) + ": " + pyJson(v[k], lvl + 1)).join(",\n") + "\n" + end + "}";
      }
      function getW(name) { const w = findW(name); return w ? w.value : ""; }
      function cleanPalette(arr) { return (arr || []).filter((c) => c).map((c) => c.toUpperCase()); }
      function normBboxJS(b) {
        const c = (v) => Math.max(0, Math.min(1000, Math.round(v * 1000)));
        let ymin = c(b.y), xmin = c(b.x), ymax = c(b.y + b.h), xmax = c(b.x + b.w);
        if (ymin > ymax) [ymin, ymax] = [ymax, ymin];
        if (xmin > xmax) [xmin, xmax] = [xmax, xmin];
        return [ymin, xmin, ymax, xmax];
      }
      function buildCaption() {
        const cap = {};
        if ((getW("high_level_description") || "").trim()) cap.high_level_description = getW("high_level_description");
        const styleW = findW("style");
        const kind = styleW ? styleW.value : "none";
        if (kind !== "none") {
          const sd = { aesthetics: getW("aesthetics"), lighting: getW("lighting") };
          if (kind === "photo") { sd.photo = getW("style.photo") || ""; sd.medium = getW("medium"); }
          else { sd.medium = getW("medium"); sd.art_style = getW("style.art_style") || ""; }
          const pal = cleanPalette(node._stylePalette);
          if (pal.length) sd.color_palette = pal;
          cap.style_description = sd;
        }
        const elements = node._boxes.map((b) => {
          const etype = b.type === "text" ? "text" : "obj";
          const el = { type: etype };
          if (!b.nobbox) el.bbox = normBboxJS(b);
          if (etype === "text") el.text = b.text || "";
          el.desc = b.desc || "";
          const pal = cleanPalette(b.palette).slice(0, MAX_ELEM_COLORS);
          if (pal.length) el.color_palette = pal;
          return el;
        });
        cap.compositional_deconstruction = { background: getW("background"), elements };
        return pyJson(cap);
      }
      function updateTokens() {
        tokenSpan.textContent = "~" + Math.ceil(buildCaption().length / 4) + " tok";
      }
      async function doCopy() {
        const txt = buildCaption();
        try { await navigator.clipboard.writeText(txt); copyBtn.textContent = "Copied"; setTimeout(() => (copyBtn.textContent = "Copy"), 900); }
        catch (e) { window.prompt("Copy the caption JSON:", txt); }
      }
      copyBtn.addEventListener("mousedown", (e) => e.stopPropagation());
      copyBtn.addEventListener("click", doCopy);

      // ── import a caption JSON and populate the node ──
      function setWidgetVal(name, val) {
        const w = findW(name);
        if (w) { w.value = val; w.callback?.(val); }
      }
      function bboxElemToBox(el, idx) {
        if (!el || typeof el !== "object") return null;
        const box = { type: el.type === "text" ? "text" : "obj",
          text: el.text || "", desc: el.desc || "",
          palette: Array.isArray(el.color_palette) ? el.color_palette.slice() : [] };
        const bb = el.bbox;
        if (Array.isArray(bb) && bb.length === 4) {
          const [ymin, xmin, ymax, xmax] = bb;
          box.x = xmin / 1000; box.y = ymin / 1000; box.w = (xmax - xmin) / 1000; box.h = (ymax - ymin) / 1000;
        } else {
          const k = (idx || 0) % 6;
          box.x = 0.03 + k * 0.035; box.y = 0.03 + k * 0.035; box.w = 0.22; box.h = 0.14;
          box.nobbox = true;
        }
        return box;
      }
      function applyCaption(cap) {
        const cd = (cap && cap.compositional_deconstruction) || {};
        const els = Array.isArray(cd.elements) ? cd.elements : [];
        node._boxes = els.map((el, i) => bboxElemToBox(el, i)).filter(Boolean);
        node._activeIdx = node._boxes.length ? 0 : -1;
        setWidgetVal("high_level_description", cap.high_level_description || "");
        setWidgetVal("background", cd.background || "");
        const sd = cap.style_description || {};
        let kind = "none";
        if (typeof sd.photo === "string") kind = "photo";
        else if (typeof sd.art_style === "string") kind = "art_style";
        const styleW = findW("style");
        if (styleW) styleW.value = kind;
        if (kind === "photo") setWidgetVal("style.photo", sd.photo || "");
        else if (kind === "art_style") setWidgetVal("style.art_style", sd.art_style || "");
        setWidgetVal("aesthetics", sd.aesthetics || "");
        setWidgetVal("lighting", sd.lighting || "");
        setWidgetVal("medium", sd.medium || "");
        node._stylePalette = Array.isArray(sd.color_palette) ? sd.color_palette.slice() : [];
      }
      function tryParseCaption(t) {
        if (!t) return null;
        try { const o = JSON.parse(t); return (o && typeof o === "object" && o.compositional_deconstruction) ? o : null; }
        catch (e) { return null; }
      }
      async function doImport() {
        let cap = null, txt = "";
        try { txt = (await navigator.clipboard.readText() || "").trim(); cap = tryParseCaption(txt); } catch (e) {}
        if (!cap) { txt = (window.prompt("Paste Ideogram 4 caption JSON:", "") || "").trim(); cap = tryParseCaption(txt); }
        if (!cap) { if (txt) alert("Not a valid Ideogram 4 caption JSON (needs 'compositional_deconstruction')."); return; }
        closeInlineEditor();
        applyCaption(cap);
        syncCanvasToDims(); commit(); rebuildStylePalette(); fitNode();
      }
      importBtn.addEventListener("mousedown", (e) => e.stopPropagation());
      importBtn.addEventListener("click", doImport);

      // ── AI: backend toggle, image, generation ──
      function refreshKeyHint() {
        // Show the "get a free key" line only in Gemini mode while the key box is empty.
        keyHint.style.display = (node._ai.backend === "gemini" && !node._apiKey) ? "" : "none";
      }
      function refreshBackendUI() {
        const b = node._ai.backend;
        const isGem = b === "gemini", isOllama = b === "ollama", isLocal = b === "local", isOr = b === "openrouter";
        localBtn.classList.toggle("active", isLocal);
        ollamaBtn.classList.toggle("active", isOllama);
        gemBtn.classList.toggle("active", isGem);
        orBtn.classList.toggle("active", isOr);
        gemRow.style.display = isGem ? "" : "none";
        ollamaRow.style.display = isOllama ? "" : "none";
        ollamaHint.style.display = isOllama ? "" : "none";
        orRow.style.display = isOr ? "" : "none";
        orHint.style.display = isOr ? "" : "none";
        localRow.style.display = isLocal ? "" : "none";
        // unload-after applies to local (free VRAM) and ollama (keep_alive:0); think to both
        unloadWrap.style.display = (isLocal || isOllama) ? "" : "none";
        thinkWrap.style.display = (isGem || isOr) ? "none" : "";
        refreshKeyHint();
        requestAnimationFrame(fitNode);
      }
      function setBackend(b) { node._ai.backend = b; serializeAi(); refreshBackendUI(); }
      localBtn.addEventListener("mousedown", (e) => e.stopPropagation());
      ollamaBtn.addEventListener("mousedown", (e) => e.stopPropagation());
      gemBtn.addEventListener("mousedown", (e) => e.stopPropagation());
      orBtn.addEventListener("mousedown", (e) => e.stopPropagation());
      localBtn.addEventListener("click", () => setBackend("local"));
      ollamaBtn.addEventListener("click", () => setBackend("ollama"));
      gemBtn.addEventListener("click", () => setBackend("gemini"));
      orBtn.addEventListener("click", () => setBackend("openrouter"));

      function refreshDensityUI() {
        const high = node._ai.density === "high";
        densHighBtn.classList.toggle("active", high);
        densNormalBtn.classList.toggle("active", !high);
      }
      function setDensity(d) { node._ai.density = d; serializeAi(); refreshDensityUI(); }
      densNormalBtn.addEventListener("mousedown", (e) => e.stopPropagation());
      densHighBtn.addEventListener("mousedown", (e) => e.stopPropagation());
      densNormalBtn.addEventListener("click", () => setDensity("normal"));
      densHighBtn.addEventListener("click", () => setDensity("high"));

      stopProp(ideaTa);
      ideaTa.addEventListener("input", () => { node._ai.idea = ideaTa.value; serializeAi(); });
      stopProp(keyInput);
      keyInput.addEventListener("input", () => { node._apiKey = keyInput.value; refreshKeyHint(); });   // not serialized
      stopProp(localModelInput);
      localModelInput.addEventListener("input", () => { node._ai.local_model = localModelInput.value; serializeAi(); });
      stopProp(modelSelect);
      modelSelect.addEventListener("change", () => { node._ai.gemini_model = modelSelect.value; serializeAi(); });
      stopProp(attnSelect);
      attnSelect.addEventListener("change", () => { node._ai.attn = attnSelect.value; serializeAi(); });
      stopProp(fourBit);
      fourBit.addEventListener("change", () => { node._ai.four_bit = fourBit.checked; serializeAi(); });
      stopProp(unloadCb);
      unloadCb.addEventListener("change", () => { node._ai.unload_after = unloadCb.checked; serializeAi(); });
      stopProp(hostInput);
      hostInput.addEventListener("input", () => { node._ai.ollama_host = hostInput.value; serializeAi(); });
      stopProp(ollamaSelect);
      ollamaSelect.addEventListener("change", () => { node._ai.ollama_model = ollamaSelect.value; serializeAi(); });
      stopProp(orKeyInput);
      orKeyInput.addEventListener("input", () => { node._orKey = orKeyInput.value; });   // not serialized
      stopProp(orSelect);
      orSelect.addEventListener("change", () => { node._ai.openrouter_model = orSelect.value; serializeAi(); });
      stopProp(thinkCb);
      thinkCb.addEventListener("change", () => { node._ai.think = thinkCb.checked; serializeAi(); });

      function setImageFromFile(file) {
        if (!file || !file.type.startsWith("image/")) return;
        const reader = new FileReader();
        reader.onload = () => {
          node._image = { b64: reader.result, url: reader.result };
          drop.innerHTML = "";
          const img = document.createElement("img");
          img.className = "ideoap-thumb"; img.src = reader.result;
          const rm = document.createElement("button");
          rm.className = "ideoap-btn"; rm.textContent = "✕"; rm.title = "Remove image";
          rm.addEventListener("click", (e) => { e.stopPropagation(); clearImage(); });
          drop.appendChild(img); drop.appendChild(rm);
          fitNode();
        };
        reader.readAsDataURL(file);
      }
      function clearImage() {
        node._image = null;
        drop.innerHTML = ""; drop.textContent = "+ reference image (optional)";
        fileInput.value = "";
        fitNode();
      }
      stopProp(drop);
      drop.addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", () => setImageFromFile(fileInput.files?.[0]));
      drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("drag"); });
      drop.addEventListener("dragleave", () => drop.classList.remove("drag"));
      drop.addEventListener("drop", (e) => {
        e.preventDefault(); e.stopPropagation(); drop.classList.remove("drag");
        setImageFromFile(e.dataTransfer?.files?.[0]);
      });

      function setStatus(msg, isErr, busy) {
        status.classList.toggle("err", !!isErr);
        status.innerHTML = (busy ? '<span class="ideoap-spin"></span> ' : "") + (msg || "");
      }
      function setGenBusy(busy) {
        node._gening = busy;
        generateBtn.disabled = busy;
        generateBtn.textContent = busy ? "Generating…" : "Generate";
      }
      async function pollStatus() {
        try {
          const r = await fetch("/ideogram_autoprompter/local/status");
          if (!r.ok) return;
          const s = await r.json();
          const label = { downloading: "Downloading model…", loading: "Loading model…",
            generating: "Generating caption…", ready: "Generating caption…", idle: "" }[s.stage] || s.stage;
          if (node._gening && label) setStatus(label + (s.detail ? " " + s.detail : ""), false, true);
        } catch (e) {}
      }

      stopProp(fetchBtn);
      fetchBtn.addEventListener("mousedown", (e) => e.stopPropagation());
      fetchBtn.addEventListener("click", async () => {
        if (!node._apiKey) { setStatus("Enter a Gemini API key first.", true); return; }
        fetchBtn.disabled = true; setStatus("Fetching models…", false, true);
        try {
          const r = await fetch("/ideogram_autoprompter/gemini/models", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ api_key: node._apiKey }),
          });
          const data = await r.json();
          if (!r.ok || data.error) throw new Error(data.error || ("HTTP " + r.status));
          modelSelect.innerHTML = "";
          for (const m of data.models) {
            const o = document.createElement("option");
            o.value = m.id; o.textContent = m.display_name || m.id;
            modelSelect.appendChild(o);
          }
          if (node._ai.gemini_model) modelSelect.value = node._ai.gemini_model;
          if (!modelSelect.value && modelSelect.options.length) {
            modelSelect.selectedIndex = 0; node._ai.gemini_model = modelSelect.value; serializeAi();
          }
          setStatus(data.models.length + " models loaded.");
        } catch (e) { setStatus("Error: " + e.message, true); }
        finally { fetchBtn.disabled = false; }
      });

      stopProp(ollamaFetchBtn);
      ollamaFetchBtn.addEventListener("mousedown", (e) => e.stopPropagation());
      ollamaFetchBtn.addEventListener("click", async () => {
        ollamaFetchBtn.disabled = true; setStatus("Fetching Ollama models…", false, true);
        try {
          const r = await fetch("/ideogram_autoprompter/ollama/models", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ host: node._ai.ollama_host || DEFAULT_OLLAMA_HOST }),
          });
          const data = await r.json();
          if (!r.ok || data.error) throw new Error(data.error || ("HTTP " + r.status));
          ollamaSelect.innerHTML = "";
          for (const m of data.models) {
            const o = document.createElement("option");
            o.value = m.id; o.textContent = m.display_name || m.id;
            ollamaSelect.appendChild(o);
          }
          if (node._ai.ollama_model) ollamaSelect.value = node._ai.ollama_model;
          if (!ollamaSelect.value && ollamaSelect.options.length) {
            ollamaSelect.selectedIndex = 0; node._ai.ollama_model = ollamaSelect.value; serializeAi();
          }
          setStatus(data.models.length + " models loaded.");
        } catch (e) { setStatus("Error: " + e.message, true); }
        finally { ollamaFetchBtn.disabled = false; }
      });

      stopProp(orFetchBtn);
      orFetchBtn.addEventListener("mousedown", (e) => e.stopPropagation());
      orFetchBtn.addEventListener("click", async () => {
        if (!node._orKey) { setStatus("Enter an OpenRouter API key first.", true); return; }
        orFetchBtn.disabled = true; setStatus("Fetching OpenRouter models…", false, true);
        try {
          const r = await fetch("/ideogram_autoprompter/openrouter/models", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ api_key: node._orKey }),
          });
          const data = await r.json();
          if (!r.ok || data.error) throw new Error(data.error || ("HTTP " + r.status));
          orSelect.innerHTML = "";
          for (const m of data.models) {
            const o = document.createElement("option");
            o.value = m.id; o.textContent = m.display_name || m.id;
            orSelect.appendChild(o);
          }
          if (node._ai.openrouter_model) orSelect.value = node._ai.openrouter_model;
          if (!orSelect.value && orSelect.options.length) {
            orSelect.selectedIndex = 0; node._ai.openrouter_model = orSelect.value; serializeAi();
          }
          setStatus(data.models.length + " vision models loaded.");
        } catch (e) { setStatus("Error: " + e.message, true); }
        finally { orFetchBtn.disabled = false; }
      });

      generateBtn.addEventListener("mousedown", (e) => e.stopPropagation());
      generateBtn.addEventListener("click", async () => {
        if (node._gening) return;
        if (!ideaTa.value.trim() && !node._image) { setStatus("Enter an idea or add an image.", true); return; }
        const backend = node._ai.backend;
        if (backend === "gemini" && (!node._apiKey || !modelSelect.value)) {
          setStatus("Set an API key and fetch/select a model.", true); return;
        }
        if (backend === "ollama" && !ollamaSelect.value) {
          setStatus("Fetch and select an Ollama model.", true); return;
        }
        if (backend === "openrouter" && (!node._orKey || !orSelect.value)) {
          setStatus("Set an OpenRouter key and fetch/select a model.", true); return;
        }
        setGenBusy(true); setStatus("Starting…", false, true);
        let poll = backend === "local" ? setInterval(pollStatus, 1200) : null;
        try {
          const model = backend === "gemini" ? modelSelect.value
            : backend === "ollama" ? ollamaSelect.value
            : backend === "openrouter" ? orSelect.value
            : localModelInput.value.trim();
          const payload = {
            backend, idea: ideaTa.value,
            image_b64: node._image ? node._image.b64 : null,
            model,
            api_key: backend === "openrouter" ? (node._orKey || "") : (node._apiKey || ""),
            host: node._ai.ollama_host || DEFAULT_OLLAMA_HOST,
            four_bit: node._ai.four_bit, unload_after: node._ai.unload_after,
            density: node._ai.density, attn: node._ai.attn, think: node._ai.think,
          };
          const r = await fetch("/ideogram_autoprompter/generate", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const data = await r.json();
          if (!r.ok || data.error) throw new Error(data.error || ("HTTP " + r.status));
          closeInlineEditor();
          applyCaption(data.caption);
          syncCanvasToDims(); commit(); rebuildStylePalette(); fitNode();
          setStatus("Caption applied — edit anything on the canvas.");
        } catch (e) {
          setStatus("Error: " + e.message, true);
        } finally {
          if (poll) clearInterval(poll);
          setGenBusy(false);
        }
      });

      // ── property panel ──
      function stopProp(el) {
        for (const ev of ["mousedown", "pointerdown", "wheel"]) el.addEventListener(ev, (e) => e.stopPropagation());
      }
      function buildSwatchRow(container, arr, max, onEdit, onStruct) {
        arr.forEach((hex, i) => {
          const sw = document.createElement("div");
          sw.className = "ideoap-sw";
          sw.style.background = hex;
          sw.title = "Click to edit · right-click to remove";
          const inp = document.createElement("input");
          inp.type = "color"; inp.value = hex;
          stopProp(sw);
          sw.addEventListener("click", () => inp.click());
          sw.addEventListener("contextmenu", (e) => { e.preventDefault(); e.stopPropagation(); arr.splice(i, 1); onStruct(); });
          inp.addEventListener("input", () => { arr[i] = inp.value; sw.style.background = inp.value; onEdit(); });
          sw.appendChild(inp);
          container.appendChild(sw);
        });
        if (arr.length < max) {
          const add = document.createElement("button");
          add.className = "ideoap-btn"; add.textContent = "+";
          stopProp(add);
          add.addEventListener("click", () => { arr.push("#ffffff"); onStruct(); });
          container.appendChild(add);
        }
      }
      function rebuildStylePalette() {
        while (styleBar.children.length > 1) styleBar.removeChild(styleBar.lastChild);
        buildSwatchRow(styleBar, node._stylePalette, MAX_STYLE_COLORS,
          () => { serialize(); drawCanvas(); },
          () => { serialize(); drawCanvas(); rebuildStylePalette(); fitNode(); });
      }
      function makeArea(field, value, placeholder, onInput, defaultH) {
        const ta = document.createElement("textarea");
        ta.className = "ideoap-area";
        ta.placeholder = placeholder;
        ta.value = value || "";
        const h = node._areaH[field] || defaultH;
        if (h) ta.style.height = h + "px";
        stopProp(ta);
        ta.addEventListener("input", onInput);
        const ro = new ResizeObserver(() => {
          if (ta.offsetHeight > 0) { node._areaH[field] = ta.offsetHeight; fitNode(); }
        });
        ro.observe(ta);
        node._areaObservers.push(ro);
        return ta;
      }
      function renderPanel() {
        for (const ro of node._areaObservers) ro.disconnect();
        node._areaObservers = [];
        panel.innerHTML = "";
        const b = node._boxes[node._activeIdx];
        if (!b) {
          hint.textContent = "Drag on the canvas to add a region";
          const p = document.createElement("div");
          p.style.color = "#777";
          p.textContent = node._boxes.length ? "Click a region to edit it." : "No regions yet — generate or draw one.";
          panel.appendChild(p);
          requestAnimationFrame(fitNode);
          return;
        }
        const col = (b.palette || []).find(Boolean) || "#ddd";
        hint.innerHTML = `Editing <b style="color:${col}">region ${node._activeIdx + 1}</b> · dbl-click to edit · alt-click overlap · right-click/del to remove`;
        const typeRow = document.createElement("div");
        typeRow.className = "ideoap-row";
        const lbl = document.createElement("span"); lbl.className = "ideoap-lbl"; lbl.textContent = "type"; typeRow.appendChild(lbl);
        for (const t of ["obj", "text"]) {
          const btn = document.createElement("button");
          btn.className = "ideoap-btn" + (b.type === t ? " active" : "");
          btn.textContent = t;
          stopProp(btn);
          btn.addEventListener("click", () => { b.type = t; commit(); });
          typeRow.appendChild(btn);
        }
        panel.appendChild(typeRow);
        if (b.type === "text") {
          panel.appendChild(makeArea("text", b.text, "text to render (verbatim)",
            function () { b.text = this.value; serialize(); drawCanvas(); updateTokens(); }));
        }
        panel.appendChild(makeArea("desc", b.desc, "description of this region",
          function () { b.desc = this.value; serialize(); drawCanvas(); updateTokens(); }, 110));
        const palRow = document.createElement("div");
        palRow.className = "ideoap-row";
        const pl = document.createElement("span"); pl.className = "ideoap-lbl"; pl.textContent = "colors"; palRow.appendChild(pl);
        b.palette = b.palette || [];
        buildSwatchRow(palRow, b.palette, MAX_ELEM_COLORS,
          () => { serialize(); drawCanvas(); }, commit);
        panel.appendChild(palRow);
        requestAnimationFrame(fitNode);
      }

      // ── widget callbacks ──
      for (const w of [wWidget, hWidget]) {
        if (!w) continue;
        chainCallback(w, "callback", () => { syncCanvasToDims(); drawCanvas(); fitNode(); });
      }
      for (const name of ["background", "high_level_description", "aesthetics", "lighting", "medium", "style"]) {
        const w = findW(name);
        if (w) chainCallback(w, "callback", () => updateTokens());
      }

      // ── keep canvas + getMinHeight in sync while resized ──
      let _resizing = false;
      chainCallback(node, "onResize", function () {
        if (_resizing) return;
        _resizing = true;
        recalcWidgetHeight();
        const minH = node.computeSize()[1];
        if (node.size[1] < minH) node.size[1] = minH;
        drawCanvas();
        _resizing = false;
      });

      wrap.addEventListener("focusin", () => { if (!node._focused) { node._focused = true; drawCanvas(); } });
      wrap.addEventListener("focusout", (e) => {
        if (!wrap.contains(e.relatedTarget)) { node._focused = false; drawCanvas(); }
      });
      chainCallback(node, "onSelected", function () { node._selected = true; drawCanvas(); });
      chainCallback(node, "onDeselected", function () { node._selected = false; drawCanvas(); });
      chainCallback(node, "onRemoved", function () {
        closeInlineEditor();
        for (const ro of node._areaObservers) ro.disconnect();
        node._areaObservers = [];
      });

      // Sync the AI DOM controls from node._ai (after load or init).
      function syncAiUI() {
        ideaTa.value = node._ai.idea || "";
        localModelInput.value = node._ai.local_model || DEFAULT_LOCAL_MODEL;
        attnSelect.value = node._ai.attn || "auto";
        fourBit.checked = !!node._ai.four_bit;
        unloadCb.checked = node._ai.unload_after !== false;
        hostInput.value = node._ai.ollama_host || DEFAULT_OLLAMA_HOST;
        thinkCb.checked = !!node._ai.think;
        if (node._ai.gemini_model) {
          const exists = Array.from(modelSelect.options).some((o) => o.value === node._ai.gemini_model);
          if (!exists) {
            const o = document.createElement("option");
            o.value = node._ai.gemini_model; o.textContent = node._ai.gemini_model;
            modelSelect.appendChild(o);
          }
          modelSelect.value = node._ai.gemini_model;
        }
        if (node._ai.ollama_model) {
          const exists = Array.from(ollamaSelect.options).some((o) => o.value === node._ai.ollama_model);
          if (!exists) {
            const o = document.createElement("option");
            o.value = node._ai.ollama_model; o.textContent = node._ai.ollama_model;
            ollamaSelect.appendChild(o);
          }
          ollamaSelect.value = node._ai.ollama_model;
        }
        if (node._ai.openrouter_model) {
          const exists = Array.from(orSelect.options).some((o) => o.value === node._ai.openrouter_model);
          if (!exists) {
            const o = document.createElement("option");
            o.value = node._ai.openrouter_model; o.textContent = node._ai.openrouter_model;
            orSelect.appendChild(o);
          }
          orSelect.value = node._ai.openrouter_model;
        }
        refreshDensityUI();
        refreshBackendUI();
      }

      // ── restore on load ──
      chainCallback(node, "onConfigure", function () {
        if (elementsWidget?.value) {
          try {
            const parsed = JSON.parse(elementsWidget.value);
            if (Array.isArray(parsed)) {
              node._boxes = parsed.filter((b) => b && typeof b.x === "number");
              node._activeIdx = node._boxes.length ? 0 : -1;
            }
          } catch (e) {}
        }
        if (stylePaletteWidget?.value) {
          try {
            const sp = JSON.parse(stylePaletteWidget.value);
            if (Array.isArray(sp)) node._stylePalette = sp.filter((c) => typeof c === "string");
          } catch (e) {}
        }
        if (aiStateWidget?.value) {
          try {
            const a = JSON.parse(aiStateWidget.value);
            if (a && typeof a === "object") node._ai = Object.assign(node._ai, a);
          } catch (e) {}
        }
        hideDataWidgets();
        syncCanvasToDims();
        rebuildStylePalette();
        syncAiUI();
        renderPanel();
        drawCanvas();
        updateTokens();
        requestAnimationFrame(fitNode);
      });

      // initial layout
      setTimeout(() => {
        hideDataWidgets();
        if (node.size[0] < 400) node.setSize([400, node.size[1]]);
        syncCanvasToDims();
        rebuildStylePalette();
        syncAiUI();
        renderPanel();
        drawCanvas();
        updateTokens();
        fitNode();
      }, 0);
    });
  },
});
