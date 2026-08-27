import { store } from '../store';
import { newId, type CircuitEntry, type CircuitKind, type TraceType, type WireTrace } from '../types';
import { base64ToArrayBuffer, loadPdf, renderPageToCanvas } from '../pdf';
import { showToast } from '../ui';

const PALETTE = ['#4fd1e8', '#d98a4e', '#6fd68a', '#e85d5d', '#c9a6ff', '#f2d24b', '#5fb8ff', '#ff9ecb'];
const SCALE = 1.5;
const KIND_PRIORITY: Record<CircuitKind, number> = { 幹線: 0, 動力: 1, 専用: 2, 一般: 3 };
const TRACE_TYPES: TraceType[] = ['配線', '電線管', 'ケーブルラック'];
const RISER_PRESETS: { label: string; amount: number }[] = [
  { label: '+階高(3.0m)', amount: 3.0 },
  { label: '+天井高(2.4m)', amount: 2.4 },
  { label: '+出だし(0.3m)', amount: 0.3 },
];

export function renderStep6(container: HTMLElement, onChange: () => void): void {
  const planPages = store.project.pages.filter((p) => p.drawingType && ['電灯平面', 'コンセント平面', '動力平面', '弱電平面', '防災平面'].includes(p.drawingType));

  let currentPageId = planPages[0]?.id ?? null;
  let selectedCircuitId: string | null = sortedCircuits()[0]?.id ?? null;
  let mode: 'trace' | 'direct' | 'unsure' = 'trace';
  let currentTraceType: TraceType = '配線';
  let draftPoints: { x: number; y: number }[] = [];
  let mouseX = 0;
  let mouseY = 0;
  let pdfDocCache: { pageId: string; doc: Awaited<ReturnType<typeof loadPdf>> } | null = null;

  function sortedCircuits(): CircuitEntry[] {
    return [...store.project.circuits].sort((a, b) => {
      const pa = KIND_PRIORITY[a.kind];
      const pb = KIND_PRIORITY[b.kind];
      if (pa !== pb) return pa - pb;
      return a.circuitNo.localeCompare(b.circuitNo, 'ja');
    });
  }

  function circuitColor(id: string | null): string {
    if (!id) return '#8ba1b7';
    const idx = store.project.circuits.findIndex((c) => c.id === id);
    return idx >= 0 ? PALETTE[idx % PALETTE.length] : '#8ba1b7';
  }

  function boardName(boardId: string): string {
    return store.project.boards.find((b) => b.id === boardId)?.name ?? '(未設定)';
  }

  function pathLengthPx(points: { x: number; y: number }[]): number {
    let sum = 0;
    for (let i = 1; i < points.length; i++) sum += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    return sum;
  }

  function pxToM(px: number, pageId: string | null): number {
    const page = store.project.pages.find((p) => p.id === pageId);
    const mmPerPx = page?.scaleMmPerPx ?? 0;
    return (px * mmPerPx) / 1000;
  }

  function traceTotalM(t: WireTrace): number {
    return (t.baseLenM + t.riserM) * (1 + t.extraPercent / 100);
  }

  function totalLengthForCircuit(id: string): number {
    const circuit = store.project.circuits.find((c) => c.id === id);
    if (!circuit) return 0;
    if (circuit.directLengthM != null) return circuit.directLengthM;
    return store.project.wireTraces.filter((t) => t.circuitId === id).reduce((sum, t) => sum + traceTotalM(t), 0);
  }

  container.innerHTML = `
    <h2>配線をなぞる</h2>
    <p class="small-note" style="margin-top:-10px;margin-bottom:16px;">回路ごとに平面図の配線をなぞって長さを拾います。配線が重なる場所は、回路ごとに別々になぞってください(自動でまとめたり、重複として消したりはしません)。</p>

    <div class="panel">
      <div class="field-row" style="align-items:flex-end;">
        <div class="field">
          <label>対象ページ</label>
          <select id="pageSelect">
            ${planPages.map((p) => `<option value="${p.id}">${escapeHtml(p.fileName)} p.${p.pageNumberInFile} (${p.drawingType})</option>`).join('')}
          </select>
        </div>
      </div>
      ${!planPages.length ? '<p class="small-note">平面図としてタグ付けされたページがありません。ステップ0を確認してください。</p>' : ''}
    </div>

    <div class="pickup-layout">
      <div class="pickup-side" style="width:340px;">
        <div class="panel">
          <h3>回路一覧 <span class="small-note">(幹線→動力→専用→一般の順)</span></h3>
          <div id="circuitList"></div>
        </div>
        <div class="panel" id="traceEditPanel"></div>
      </div>
      <div class="pickup-canvas-wrap" id="canvasWrap">
        <canvas id="traceCanvas"></canvas>
      </div>
    </div>
  `;

  const pageSelect = container.querySelector<HTMLSelectElement>('#pageSelect')!;
  if (currentPageId) pageSelect.value = currentPageId;
  pageSelect.addEventListener('change', () => {
    currentPageId = pageSelect.value;
    draftPoints = [];
    renderBase();
  });

  const canvas = container.querySelector<HTMLCanvasElement>('#traceCanvas')!;
  const baseCanvas = document.createElement('canvas');

  // ---------- circuit list ----------
  function renderCircuitList(): void {
    const el = container.querySelector<HTMLDivElement>('#circuitList')!;
    const list = sortedCircuits();
    if (!list.length) {
      el.innerHTML = '<p class="small-note">回路がまだ登録されていません。ステップ2を確認してください。</p>';
      return;
    }
    el.innerHTML = list
      .map((c) => {
        const total = totalLengthForCircuit(c.id);
        const statusColor = c.traceStatus === '要確認' ? 'var(--danger)' : c.traceStatus ? 'var(--ok)' : 'var(--text-lo)';
        const statusText = c.traceStatus ?? '未着手';
        return `<div class="pickup-part-row ${c.id === selectedCircuitId ? 'selected' : ''}" data-id="${c.id}">
          <span class="swatch" style="background:${circuitColor(c.id)}"></span>
          <span class="name">${escapeHtml(c.kind)} ${escapeHtml(c.circuitNo)} ${escapeHtml(c.circuitName)}<br><span class="small-note">${escapeHtml(boardName(c.boardId))}</span></span>
          <span class="count" style="color:${statusColor};text-align:right;">${statusText}${total > 0 ? `<br>${total.toFixed(1)}m` : ''}</span>
        </div>`;
      })
      .join('');
    el.querySelectorAll<HTMLDivElement>('.pickup-part-row').forEach((row) => {
      row.addEventListener('click', () => {
        selectedCircuitId = row.dataset.id!;
        draftPoints = [];
        renderCircuitList();
        renderEditPanel();
        renderBase();
      });
    });
  }

  // ---------- edit panel ----------
  function renderEditPanel(): void {
    const panel = container.querySelector<HTMLDivElement>('#traceEditPanel')!;
    const circuit = store.project.circuits.find((c) => c.id === selectedCircuitId);
    if (!circuit) {
      panel.innerHTML = '';
      return;
    }
    panel.innerHTML = `
      <h3>${escapeHtml(circuit.kind)} ${escapeHtml(circuit.circuitNo)} ${escapeHtml(circuit.circuitName)}</h3>
      <div class="field-row">
        <button class="btn ${mode === 'trace' ? 'copper' : ''}" id="modeTrace">なぞる</button>
        <button class="btn ${mode === 'direct' ? 'copper' : ''}" id="modeDirect">直接入力</button>
        <button class="btn ${mode === 'unsure' ? 'copper' : ''}" id="modeUnsure">要確認</button>
      </div>
      <div id="modeBody"></div>
    `;
    panel.querySelector<HTMLButtonElement>('#modeTrace')!.addEventListener('click', () => {
      mode = 'trace';
      draftPoints = [];
      renderEditPanel();
      redrawOverlay();
    });
    panel.querySelector<HTMLButtonElement>('#modeDirect')!.addEventListener('click', () => {
      mode = 'direct';
      draftPoints = [];
      renderEditPanel();
      redrawOverlay();
    });
    panel.querySelector<HTMLButtonElement>('#modeUnsure')!.addEventListener('click', () => {
      mode = 'unsure';
      draftPoints = [];
      renderEditPanel();
      redrawOverlay();
    });

    const body = panel.querySelector<HTMLDivElement>('#modeBody')!;
    if (mode === 'trace') {
      renderTraceModeBody(body, circuit);
    } else if (mode === 'direct') {
      renderDirectModeBody(body, circuit);
    } else {
      renderUnsureModeBody(body, circuit);
    }
  }

  function renderTraceModeBody(body: HTMLDivElement, circuit: CircuitEntry): void {
    const traces = store.project.wireTraces.filter((t) => t.circuitId === circuit.id);
    const draftLen = draftPoints.length >= 2 ? pxToM(pathLengthPx(draftPoints), currentPageId) : 0;
    body.innerHTML = `
      <div class="field-row">
        <div class="field"><label>種別</label>
          <select id="traceTypeSelect">${TRACE_TYPES.map((t) => `<option value="${t}" ${t === currentTraceType ? 'selected' : ''}>${t}</option>`).join('')}</select>
        </div>
      </div>
      <p class="small-note">キャンバス上をクリックして点を置いてください(点: ${draftPoints.length}個 / 現在の長さ 約${draftLen.toFixed(1)}m)。</p>
      <div class="field-row">
        <button class="btn copper" id="finishTrace" ${draftPoints.length < 2 ? 'disabled' : ''}>このなぞりを確定</button>
        <button class="btn danger" id="cancelDraft" ${draftPoints.length === 0 ? 'disabled' : ''}>取消</button>
      </div>
      <h3 style="margin-top:14px;">この回路のなぞり(${traces.length}件)</h3>
      ${traces.length ? traces.map((t) => traceRowHtml(t)).join('') : '<p class="small-note">まだありません。</p>'}
      <p class="small-note" style="margin-top:8px;">合計: ${totalLengthForCircuit(circuit.id).toFixed(1)} m</p>
    `;

    body.querySelector<HTMLSelectElement>('#traceTypeSelect')!.addEventListener('change', (e) => {
      currentTraceType = (e.target as HTMLSelectElement).value as TraceType;
    });
    body.querySelector<HTMLButtonElement>('#finishTrace')!.addEventListener('click', () => {
      const page = store.project.pages.find((p) => p.id === currentPageId);
      if (!page?.scaleMmPerPx) {
        showToast('この図面の縮尺が未設定です。ステップ1で設定してください。');
        return;
      }
      if (!currentPageId || draftPoints.length < 2) return;
      const trace: WireTrace = {
        id: newId('trace'),
        circuitId: circuit.id,
        pageId: currentPageId,
        traceType: currentTraceType,
        points: [...draftPoints],
        baseLenM: pxToM(pathLengthPx(draftPoints), currentPageId),
        riserM: 0,
        extraPercent: 0,
        note: '',
      };
      store.project.wireTraces.push(trace);
      circuit.traceStatus = 'トレース済み';
      draftPoints = [];
      renderBase();
      renderCircuitList();
      renderEditPanel();
      onChange();
    });
    body.querySelector<HTMLButtonElement>('#cancelDraft')!.addEventListener('click', () => {
      draftPoints = [];
      renderEditPanel();
      redrawOverlay();
    });
    body.querySelectorAll<HTMLButtonElement>('.delTrace').forEach((btn) => {
      btn.addEventListener('click', () => deleteTrace(btn.dataset.id!));
    });
    body.querySelectorAll<HTMLButtonElement>('.addRiser').forEach((btn) => {
      btn.addEventListener('click', () => {
        const t = store.project.wireTraces.find((x) => x.id === btn.dataset.id);
        if (!t) return;
        t.riserM += Number(btn.dataset.amount);
        renderEditPanel();
        renderCircuitList();
        onChange();
      });
    });
    body.querySelectorAll<HTMLInputElement>('.riserInput').forEach((inp) => {
      inp.addEventListener('change', () => {
        const t = store.project.wireTraces.find((x) => x.id === inp.dataset.id);
        if (!t) return;
        t.riserM = Number(inp.value) || 0;
        renderEditPanel();
        renderCircuitList();
        onChange();
      });
    });
    body.querySelectorAll<HTMLInputElement>('.extraInput').forEach((inp) => {
      inp.addEventListener('change', () => {
        const t = store.project.wireTraces.find((x) => x.id === inp.dataset.id);
        if (!t) return;
        t.extraPercent = Math.max(0, Number(inp.value) || 0);
        renderEditPanel();
        renderCircuitList();
        onChange();
      });
    });
  }

  function traceRowHtml(t: WireTrace): string {
    const total = traceTotalM(t);
    const page = store.project.pages.find((p) => p.id === t.pageId);
    return `<div class="missing-row" style="flex-wrap:wrap;align-items:flex-start;border-bottom:1px solid var(--grid-line);padding-bottom:8px;margin-bottom:8px;">
      <span class="name">${escapeHtml(t.traceType)}${page ? ` <span class="small-note">(${escapeHtml(page.fileName)} p.${page.pageNumberInFile})</span>` : ''}<br>
        <span class="small-note">${t.baseLenM.toFixed(1)}m + 立上り${t.riserM.toFixed(1)}m を ${t.extraPercent}%増し = <b style="color:var(--cyan);">${total.toFixed(1)}m</b></span>
      </span>
      <button class="btn danger delTrace" data-id="${t.id}">✕</button>
      <div class="field-row" style="width:100%;margin-top:6px;gap:6px;">
        ${RISER_PRESETS.map((r) => `<button class="btn addRiser" data-id="${t.id}" data-amount="${r.amount}">${r.label}</button>`).join('')}
      </div>
      <div class="field-row" style="width:100%;margin-top:6px;">
        <div class="field"><label>立上り・引下げ等(m)</label><input type="number" step="0.1" class="riserInput" data-id="${t.id}" value="${t.riserM}" style="width:90px;"></div>
        <div class="field"><label>余長率(%)</label><input type="number" step="1" min="0" class="extraInput" data-id="${t.id}" value="${t.extraPercent}" style="width:70px;"></div>
      </div>
    </div>`;
  }

  function deleteTrace(id: string): void {
    const trace = store.project.wireTraces.find((t) => t.id === id);
    if (!trace) return;
    store.project.wireTraces = store.project.wireTraces.filter((t) => t.id !== id);
    const circuit = store.project.circuits.find((c) => c.id === trace.circuitId);
    if (circuit) {
      const remaining = store.project.wireTraces.filter((t) => t.circuitId === circuit.id);
      if (remaining.length > 0) circuit.traceStatus = 'トレース済み';
      else if (circuit.directLengthM == null) circuit.traceStatus = null;
    }
    renderBase();
    renderCircuitList();
    renderEditPanel();
    onChange();
  }

  function renderDirectModeBody(body: HTMLDivElement, circuit: CircuitEntry): void {
    body.innerHTML = `
      <p class="small-note">図面に長さがそのまま記載されている場合は、なぞらずにここへ直接入力してください。</p>
      <div class="field"><label>長さ(m)</label><input type="number" step="0.1" min="0" id="directLenInput" value="${circuit.directLengthM ?? ''}"></div>
      <div class="field"><label>出典ページ</label>
        <select id="directSourcePage">
          <option value="">(未選択)</option>
          ${store.project.pages.map((p) => `<option value="${p.id}" ${p.id === circuit.directLengthSourcePageId ? 'selected' : ''}>${escapeHtml(p.fileName)} p.${p.pageNumberInFile}${p.drawingType ? ` (${p.drawingType})` : ''}</option>`).join('')}
        </select>
      </div>
    `;
    body.querySelector<HTMLInputElement>('#directLenInput')!.addEventListener('change', (e) => {
      const v = (e.target as HTMLInputElement).value;
      circuit.directLengthM = v ? Number(v) : null;
      circuit.traceStatus = circuit.directLengthM != null ? '長さ入力済み' : store.project.wireTraces.some((t) => t.circuitId === circuit.id) ? 'トレース済み' : null;
      renderCircuitList();
      onChange();
    });
    body.querySelector<HTMLSelectElement>('#directSourcePage')!.addEventListener('change', (e) => {
      circuit.directLengthSourcePageId = (e.target as HTMLSelectElement).value || null;
      onChange();
    });
  }

  function renderUnsureModeBody(body: HTMLDivElement, circuit: CircuitEntry): void {
    body.innerHTML = `
      <p class="small-note">配線が図面から特定できない、判断に迷う等の場合はこちらにチェックしてください。あとで見返せるように一覧に「要確認」で表示されます。</p>
      <label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" id="unsureCheck" ${circuit.traceStatus === '要確認' ? 'checked' : ''}> この回路は要確認にする</label>
    `;
    body.querySelector<HTMLInputElement>('#unsureCheck')!.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      if (checked) {
        circuit.traceStatus = '要確認';
      } else if (circuit.directLengthM != null) {
        circuit.traceStatus = '長さ入力済み';
      } else if (store.project.wireTraces.some((t) => t.circuitId === circuit.id)) {
        circuit.traceStatus = 'トレース済み';
      } else {
        circuit.traceStatus = null;
      }
      renderCircuitList();
      onChange();
    });
  }

  // ---------- canvas ----------
  async function renderBase(): Promise<void> {
    if (!currentPageId) return;
    const page = store.project.pages.find((p) => p.id === currentPageId);
    if (!page) return;
    const file = store.project.files.find((f) => f.id === page.fileId);
    if (!file) return;
    if (!pdfDocCache || pdfDocCache.pageId !== currentPageId) {
      const buf = base64ToArrayBuffer(file.dataBase64);
      const doc = await loadPdf(buf);
      pdfDocCache = { pageId: currentPageId, doc };
    }
    await renderPageToCanvas(pdfDocCache.doc, page.pageNumberInFile, baseCanvas, SCALE);
    const bctx = baseCanvas.getContext('2d')!;
    store.project.wireTraces
      .filter((t) => t.pageId === currentPageId)
      .forEach((t) => {
        const isSelected = t.circuitId === selectedCircuitId;
        bctx.save();
        bctx.strokeStyle = circuitColor(t.circuitId);
        bctx.lineWidth = isSelected ? 3.5 : 2;
        bctx.globalAlpha = isSelected ? 1 : 0.55;
        bctx.beginPath();
        t.points.forEach((pt, i) => (i === 0 ? bctx.moveTo(pt.x, pt.y) : bctx.lineTo(pt.x, pt.y)));
        bctx.stroke();
        bctx.globalAlpha = 1;
        t.points.forEach((pt) => {
          bctx.beginPath();
          bctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
          bctx.fillStyle = circuitColor(t.circuitId);
          bctx.fill();
        });
        bctx.restore();
      });
    canvas.width = baseCanvas.width;
    canvas.height = baseCanvas.height;
    redrawOverlay();
  }

  function redrawOverlay(): void {
    if (!canvas.width || !canvas.height) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(baseCanvas, 0, 0);
    if (mode === 'trace' && draftPoints.length && selectedCircuitId) {
      ctx.save();
      ctx.strokeStyle = circuitColor(selectedCircuitId);
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      draftPoints.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
      ctx.lineTo(mouseX, mouseY);
      ctx.stroke();
      ctx.setLineDash([]);
      draftPoints.forEach((pt) => {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = circuitColor(selectedCircuitId);
        ctx.fill();
      });
      ctx.restore();
    }
  }

  canvas.addEventListener('click', (e) => {
    if (!currentPageId || mode !== 'trace') return;
    if (!selectedCircuitId) {
      showToast('先に左の回路一覧から回路を選択してください。');
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    draftPoints.push({ x, y });
    redrawOverlay();
    renderEditPanel();
  });
  canvas.addEventListener('mousemove', (e) => {
    if (mode !== 'trace' || !draftPoints.length) return;
    const rect = canvas.getBoundingClientRect();
    mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
    mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);
    redrawOverlay();
  });

  renderCircuitList();
  renderEditPanel();
  renderBase();
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
