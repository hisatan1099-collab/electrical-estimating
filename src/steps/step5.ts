import { store } from '../store';
import {
  newId,
  PICKUP_CATEGORIES,
  type CategoryProgress,
  type PickupCategory,
  type PickupMarker,
  type PickupPart,
} from '../types';
import { base64ToArrayBuffer, loadPdf, renderPageToCanvas } from '../pdf';
import { askConfirm, showToast } from '../ui';

const PALETTE = ['#4fd1e8', '#d98a4e', '#6fd68a', '#e85d5d', '#c9a6ff', '#f2d24b', '#5fb8ff', '#ff9ecb'];
const SCALE = 1.5;

const CATEGORY_GUIDES: Partial<Record<PickupCategory, string>> = {
  '貫通・スリーブ・配管': '外壁の外周をなぞって、高さ・径の表記を全部拾ってください。見落としやすいので、外周を一周する意識で確認します。',
};

export function renderStep5(container: HTMLElement, onChange: () => void): void {
  const planPages = store.project.pages.filter((p) => p.drawingType && ['電灯平面', 'コンセント平面', '動力平面', '弱電平面', '防災平面'].includes(p.drawingType));

  let currentPageId = planPages[0]?.id ?? null;
  let currentCategory: PickupCategory = firstIncompleteCategory();
  let selectedPartId: string | null = null;
  let selectedMarkerId: string | null = null;
  let roomMode = false;
  let roomClickPoints: { x: number; y: number }[] = [];
  let pdfDocCache: { pageId: string; doc: Awaited<ReturnType<typeof loadPdf>> } | null = null;

  function firstIncompleteCategory(): PickupCategory {
    const next = store.project.categoryProgress.find((c) => c.status === '未着手');
    return next ? next.category : PICKUP_CATEGORIES[0];
  }

  container.innerHTML = `
    <h2>平面図で拾う(レイヤー順に1種類ずつ)</h2>
    <p class="small-note" style="margin-top:-10px;margin-bottom:16px;">一度に全部数えず、1種類ずつ数えます。終わるたびに、登録した記号で0個のものが出ます。本当に無いか、見落としか確認してください。</p>

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

    <div class="category-tabs" id="categoryTabs"></div>
    <p class="small-note category-guide" id="categoryGuide" style="display:none;"></p>

    <div class="pickup-layout">
      <div class="pickup-side">
        <div class="panel">
          <h3>部材 <span class="small-note" id="partListLabel"></span></h3>
          <div id="partList"></div>
          <div class="add-row" style="margin-top:8px;display:flex;gap:6px;">
            <input type="text" id="newPartName" placeholder="部材を追加(自由入力)">
            <button class="btn copper" id="addPart">＋追加</button>
          </div>
        </div>
        <div class="panel">
          <h3>室 <span class="small-note">矩形を登録すると、中のマーカーに室名が自動で付きます</span></h3>
          <div id="roomList"></div>
          <button class="btn" id="toggleRoomMode" style="margin-top:8px;">室を登録</button>
        </div>
        <div class="panel" id="markerEditPanel" style="display:none;"></div>
        <div class="panel">
          <button class="btn copper" id="completeCategory" style="width:100%;">✓ このカテゴリを完了</button>
          <button class="btn" id="naCategory" style="width:100%;margin-top:8px;">このカテゴリは該当なし</button>
        </div>
      </div>
      <div class="pickup-canvas-wrap" id="pickupCanvasWrap">
        <canvas id="pickupCanvas"></canvas>
      </div>
    </div>
  `;

  const pageSelect = container.querySelector<HTMLSelectElement>('#pageSelect')!;
  if (currentPageId) pageSelect.value = currentPageId;
  pageSelect.addEventListener('change', () => {
    currentPageId = pageSelect.value;
    selectedMarkerId = null;
    renderCanvas();
    renderMarkerEditPanel();
  });

  const canvas = container.querySelector<HTMLCanvasElement>('#pickupCanvas')!;

  function ensurePickupPartsForCategory(category: PickupCategory): void {
    let nextColorIdx = store.project.pickupParts.length;
    store.project.legends
      .filter((l) => l.pickupCategory === category)
      .forEach((l) => {
        const exists = store.project.pickupParts.some((p) => p.legendId === l.id);
        if (!exists) {
          store.project.pickupParts.push({
            id: newId('pickuppart'),
            category,
            name: l.materialName,
            color: PALETTE[nextColorIdx % PALETTE.length],
            legendId: l.id,
          });
          nextColorIdx++;
        }
      });
  }

  function markerCount(partId: string): number {
    return store.project.pickupMarkers.filter((m) => m.partId === partId).length;
  }

  // ---------- category tabs ----------
  function renderCategoryTabs(): void {
    const tabs = container.querySelector<HTMLDivElement>('#categoryTabs')!;
    tabs.innerHTML = PICKUP_CATEGORIES.map((cat) => {
      const progress = store.project.categoryProgress.find((c) => c.category === cat)!;
      const cls = ['category-tab'];
      if (cat === currentCategory) cls.push('active');
      if (progress.status === '完了') cls.push('done');
      if (progress.status === '該当なし') cls.push('na');
      const icon = progress.status === '完了' ? '✓' : progress.status === '該当なし' ? '−' : '';
      return `<button class="${cls.join(' ')}" data-cat="${cat}">${icon ? `<b>${icon}</b> ` : ''}${cat}</button>`;
    }).join('');
    tabs.querySelectorAll<HTMLButtonElement>('.category-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        currentCategory = btn.dataset.cat as PickupCategory;
        selectedPartId = null;
        selectedMarkerId = null;
        ensurePickupPartsForCategory(currentCategory);
        renderAll();
      });
    });
    const guide = container.querySelector<HTMLParagraphElement>('#categoryGuide')!;
    const guideText = CATEGORY_GUIDES[currentCategory];
    if (guideText) {
      guide.style.display = '';
      guide.textContent = '📐 ' + guideText;
    } else {
      guide.style.display = 'none';
    }
  }

  // ---------- part list ----------
  function renderPartList(): void {
    const el = container.querySelector<HTMLDivElement>('#partList')!;
    const parts = store.project.pickupParts.filter((p) => p.category === currentCategory);
    container.querySelector('#partListLabel')!.textContent = `(${currentCategory})`;
    if (!parts.length) {
      el.innerHTML = '<p class="small-note">この分類の部材がまだありません。下から追加するか、ステップ1の凡例で拾い出し分類を設定してください。</p>';
      return;
    }
    el.innerHTML = parts
      .map((p) => {
        const count = markerCount(p.id);
        return `<div class="pickup-part-row ${p.id === selectedPartId ? 'selected' : ''}" data-id="${p.id}">
          <span class="swatch" style="background:${p.color}"></span>
          <span class="name">${escapeHtml(p.name)}${p.legendId ? ' <span class=\"small-note\">(凡例)</span>' : ''}</span>
          <span class="count">${count}</span>
        </div>`;
      })
      .join('');
    el.querySelectorAll<HTMLDivElement>('.pickup-part-row').forEach((row) => {
      row.addEventListener('click', () => {
        selectedPartId = row.dataset.id!;
        selectedMarkerId = null;
        roomMode = false;
        renderPartList();
        renderMarkerEditPanel();
      });
    });
  }

  container.querySelector<HTMLButtonElement>('#addPart')!.addEventListener('click', () => {
    const input = container.querySelector<HTMLInputElement>('#newPartName')!;
    const name = input.value.trim();
    if (!name) return;
    const part: PickupPart = {
      id: newId('pickuppart'),
      category: currentCategory,
      name,
      color: PALETTE[store.project.pickupParts.length % PALETTE.length],
      legendId: null,
    };
    store.project.pickupParts.push(part);
    input.value = '';
    selectedPartId = part.id;
    renderPartList();
    onChange();
  });

  // ---------- rooms ----------
  function renderRoomList(): void {
    const el = container.querySelector<HTMLDivElement>('#roomList')!;
    const rooms = store.project.roomRects.filter((r) => r.pageId === currentPageId);
    if (!rooms.length) {
      el.innerHTML = '<p class="small-note">まだ室が登録されていません。</p>';
      return;
    }
    el.innerHTML = rooms
      .map((r) => `<div class="missing-row"><span class="name">${escapeHtml(r.floor)} ${escapeHtml(r.room)}</span><button class="btn danger delRoom" data-id="${r.id}">✕</button></div>`)
      .join('');
    el.querySelectorAll<HTMLButtonElement>('.delRoom').forEach((btn) => {
      btn.addEventListener('click', () => {
        store.project.roomRects = store.project.roomRects.filter((r) => r.id !== btn.dataset.id);
        store.project.pickupMarkers.forEach((m) => {
          if (m.roomId === btn.dataset.id) m.roomId = null;
        });
        renderRoomList();
        renderCanvas();
        onChange();
      });
    });
  }

  container.querySelector<HTMLButtonElement>('#toggleRoomMode')!.addEventListener('click', (e) => {
    roomMode = !roomMode;
    roomClickPoints = [];
    selectedPartId = null;
    (e.target as HTMLButtonElement).classList.toggle('active', roomMode);
    renderPartList();
  });

  // ---------- canvas ----------
  async function renderCanvas(): Promise<void> {
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
    await renderPageToCanvas(pdfDocCache.doc, page.pageNumberInFile, canvas, SCALE);
    const ctx = canvas.getContext('2d')!;

    // room rectangles
    store.project.roomRects
      .filter((r) => r.pageId === currentPageId)
      .forEach((r) => {
        ctx.save();
        ctx.strokeStyle = '#8ba1b7';
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 1.5;
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        ctx.setLineDash([]);
        ctx.fillStyle = '#8ba1b7';
        ctx.font = '11px sans-serif';
        ctx.fillText(`${r.floor} ${r.room}`, r.x + 4, r.y + 14);
        ctx.restore();
      });

    // markers
    store.project.pickupMarkers
      .filter((m) => m.pageId === currentPageId)
      .forEach((m) => {
        const part = store.project.pickupParts.find((p) => p.id === m.partId);
        if (!part) return;
        const isCurrent = part.category === currentCategory;
        ctx.save();
        ctx.globalAlpha = isCurrent ? 1 : 0.25;
        ctx.beginPath();
        ctx.arc(m.x, m.y, 8, 0, Math.PI * 2);
        ctx.fillStyle = part.color + '55';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = part.color;
        ctx.stroke();
        if (m.needsCheckReason) {
          ctx.strokeStyle = '#e85d5d';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(m.x, m.y, 11, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (isCurrent && m.id === selectedMarkerId) {
          ctx.setLineDash([4, 3]);
          ctx.strokeStyle = '#4fd1e8';
          ctx.beginPath();
          ctx.arc(m.x, m.y, 13, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.restore();
      });

    // in-progress room rectangle
    if (roomMode && roomClickPoints.length === 1) {
      ctx.save();
      ctx.fillStyle = '#d98a4e';
      ctx.beginPath();
      ctx.arc(roomClickPoints[0].x, roomClickPoints[0].y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  canvas.addEventListener('click', async (e) => {
    if (!currentPageId) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);

    if (roomMode) {
      roomClickPoints.push({ x, y });
      if (roomClickPoints.length === 2) {
        const [p1, p2] = roomClickPoints;
        roomClickPoints = [];
        const rx = Math.min(p1.x, p2.x);
        const ry = Math.min(p1.y, p2.y);
        const rw = Math.abs(p2.x - p1.x);
        const rh = Math.abs(p2.y - p1.y);
        if (rw < 5 || rh < 5) {
          showToast('矩形が小さすぎます。もう一度2点をクリックしてください。');
          renderCanvas();
          return;
        }
        const result = await askRoomInfo(e.clientX, e.clientY);
        if (result) {
          store.project.roomRects.push({ id: newId('room'), pageId: currentPageId, floor: result.floor, room: result.room, x: rx, y: ry, w: rw, h: rh });
          renderRoomList();
          onChange();
        }
      }
      renderCanvas();
      return;
    }

    // hit test existing markers of the CURRENT category first
    const hit = store.project.pickupMarkers.find((m) => {
      if (m.pageId !== currentPageId) return false;
      const part = store.project.pickupParts.find((p) => p.id === m.partId);
      if (!part || part.category !== currentCategory) return false;
      return Math.hypot(m.x - x, m.y - y) < 10;
    });
    if (hit) {
      selectedMarkerId = hit.id;
      renderCanvas();
      renderMarkerEditPanel();
      return;
    }

    if (!selectedPartId) {
      showToast('先に左の部材を選択してください。');
      return;
    }
    const room = store.project.roomRects.find((r) => r.pageId === currentPageId && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
    const marker: PickupMarker = {
      id: newId('marker'),
      pageId: currentPageId,
      partId: selectedPartId,
      x,
      y,
      roomId: room?.id ?? null,
      gangCount: null,
      grounded: false,
      waterproof: false,
      threeWay: false,
      needsCheckReason: null,
    };
    store.project.pickupMarkers.push(marker);
    renderCanvas();
    renderPartList();
    onChange();
  });

  function askRoomInfo(clientX: number, clientY: number): Promise<{ floor: string; room: string } | null> {
    return new Promise((resolve) => {
      const box = document.createElement('div');
      box.className = 'mini-dialog';
      box.style.left = Math.min(clientX, window.innerWidth - 240) + 'px';
      box.style.top = Math.min(clientY, window.innerHeight - 160) + 'px';
      box.innerHTML = `
        <div class="mini-dialog-label">室の情報</div>
        <input type="text" id="roomFloorInput" placeholder="階(例: 1F)">
        <input type="text" id="roomNameInput" placeholder="室名(例: ホール)">
        <div class="mini-dialog-actions">
          <button class="btn danger" id="roomCancel">取消</button>
          <button class="btn copper" id="roomOk">登録</button>
        </div>
      `;
      document.body.appendChild(box);
      const floorInput = box.querySelector<HTMLInputElement>('#roomFloorInput')!;
      const nameInput = box.querySelector<HTMLInputElement>('#roomNameInput')!;
      floorInput.focus();
      const cleanup = (result: { floor: string; room: string } | null) => {
        box.remove();
        resolve(result);
      };
      box.querySelector('#roomCancel')!.addEventListener('click', () => cleanup(null));
      box.querySelector('#roomOk')!.addEventListener('click', () => {
        const room = nameInput.value.trim();
        if (!room) {
          cleanup(null);
          return;
        }
        cleanup({ floor: floorInput.value.trim(), room });
      });
    });
  }

  // ---------- marker edit panel ----------
  function renderMarkerEditPanel(): void {
    const panel = container.querySelector<HTMLDivElement>('#markerEditPanel')!;
    if (!selectedMarkerId) {
      panel.style.display = 'none';
      return;
    }
    const marker = store.project.pickupMarkers.find((m) => m.id === selectedMarkerId);
    if (!marker) {
      panel.style.display = 'none';
      return;
    }
    panel.style.display = '';
    const room = store.project.roomRects.find((r) => r.id === marker.roomId);
    panel.innerHTML = `
      <h3>マーカー編集</h3>
      <div class="field"><label>室</label><span class="small-note">${room ? escapeHtml(room.floor + ' ' + room.room) : '(未割当)'}</span></div>
      <div class="field-row" style="margin-top:8px;">
        <div class="field"><label>口数</label><input type="number" id="mGangCount" min="0" step="1" value="${marker.gangCount ?? ''}" style="width:70px;"></div>
      </div>
      <div class="field-row">
        <label style="display:flex;align-items:center;gap:4px;"><input type="checkbox" id="mGrounded" ${marker.grounded ? 'checked' : ''}> 接地</label>
        <label style="display:flex;align-items:center;gap:4px;"><input type="checkbox" id="mWaterproof" ${marker.waterproof ? 'checked' : ''}> 防水</label>
        <label style="display:flex;align-items:center;gap:4px;"><input type="checkbox" id="mThreeWay" ${marker.threeWay ? 'checked' : ''}> 3路</label>
      </div>
      <div class="field"><label>要確認理由</label><input type="text" id="mNeedsCheck" value="${escapeAttr(marker.needsCheckReason ?? '')}" placeholder="無ければ空欄"></div>
      <button class="btn danger" id="deleteMarker" style="margin-top:10px;width:100%;">✕ このマーカーを削除</button>
    `;
    panel.querySelector<HTMLInputElement>('#mGangCount')!.addEventListener('input', (e) => {
      const v = (e.target as HTMLInputElement).value;
      marker.gangCount = v ? Number(v) : null;
    });
    panel.querySelector<HTMLInputElement>('#mGrounded')!.addEventListener('change', (e) => {
      marker.grounded = (e.target as HTMLInputElement).checked;
      onChange();
    });
    panel.querySelector<HTMLInputElement>('#mWaterproof')!.addEventListener('change', (e) => {
      marker.waterproof = (e.target as HTMLInputElement).checked;
      onChange();
    });
    panel.querySelector<HTMLInputElement>('#mThreeWay')!.addEventListener('change', (e) => {
      marker.threeWay = (e.target as HTMLInputElement).checked;
      onChange();
    });
    panel.querySelector<HTMLInputElement>('#mNeedsCheck')!.addEventListener('change', (e) => {
      const v = (e.target as HTMLInputElement).value.trim();
      marker.needsCheckReason = v || null;
      renderCanvas();
      onChange();
    });
    panel.querySelector<HTMLButtonElement>('#deleteMarker')!.addEventListener('click', () => {
      store.project.pickupMarkers = store.project.pickupMarkers.filter((m) => m.id !== selectedMarkerId);
      selectedMarkerId = null;
      renderCanvas();
      renderPartList();
      renderMarkerEditPanel();
      onChange();
    });
  }

  // ---------- category completion ----------
  function getProgress(category: PickupCategory): CategoryProgress {
    return store.project.categoryProgress.find((c) => c.category === category)!;
  }

  container.querySelector<HTMLButtonElement>('#completeCategory')!.addEventListener('click', async () => {
    const zeroCountParts = store.project.pickupParts.filter(
      (p) => p.category === currentCategory && p.legendId !== null && markerCount(p.id) === 0,
    );
    const progress = getProgress(currentCategory);
    const undecided = zeroCountParts.filter((p) => !progress.zeroCountDecisions.some((d) => d.legendId === p.legendId));
    if (undecided.length) {
      await openZeroCountModal(undecided, progress);
      onChange();
      return;
    }
    progress.status = '完了';
    renderCategoryTabs();
    onChange();
    showToast(`「${currentCategory}」を完了にしました。`);
  });

  container.querySelector<HTMLButtonElement>('#naCategory')!.addEventListener('click', async () => {
    const ok = await askConfirm(`「${currentCategory}」を丸ごと「該当なし」にします。よろしいですか?`);
    if (!ok) return;
    getProgress(currentCategory).status = '該当なし';
    renderCategoryTabs();
    onChange();
  });

  function openZeroCountModal(parts: PickupPart[], progress: CategoryProgress): Promise<void> {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal-box zero-count-modal">
          <div class="modal-header"><h3>凡例登録済みで0個のまま</h3></div>
          <p class="small-note">本当に無いか、見落としかを確認してください。すべて回答すると「完了」にできます。</p>
          <div id="zeroCountRows"></div>
        </div>
      `;
      document.body.appendChild(overlay);
      const rowsEl = overlay.querySelector<HTMLDivElement>('#zeroCountRows')!;
      function renderRows(): void {
        rowsEl.innerHTML = parts
          .map(
            (p) => `<div class="missing-row" data-legend="${p.legendId}">
            <span class="name">${escapeHtml(p.name)}</span>
            <button class="btn" data-legend="${p.legendId}" data-decision="該当なし">該当なし</button>
            <button class="btn danger" data-legend="${p.legendId}" data-decision="見落とし">見落とし</button>
          </div>`,
          )
          .join('');
        rowsEl.querySelectorAll<HTMLButtonElement>('button[data-decision]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const legendId = btn.dataset.legend!;
            progress.zeroCountDecisions.push({ legendId, decision: btn.dataset.decision as '該当なし' | '見落とし' });
            parts = parts.filter((p) => p.legendId !== legendId);
            if (!parts.length) {
              overlay.remove();
              const allDecided = store.project.pickupParts
                .filter((pp) => pp.category === currentCategory && pp.legendId !== null && markerCount(pp.id) === 0)
                .every((pp) => progress.zeroCountDecisions.some((d) => d.legendId === pp.legendId));
              if (allDecided) {
                progress.status = '完了';
                renderCategoryTabs();
                showToast(`「${currentCategory}」を完了にしました。`);
              }
              resolve();
              return;
            }
            renderRows();
          });
        });
      }
      renderRows();
    });
  }

  function renderAll(): void {
    renderCategoryTabs();
    renderPartList();
    renderRoomList();
    renderMarkerEditPanel();
    renderCanvas();
  }

  ensurePickupPartsForCategory(currentCategory);
  renderAll();
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;');
}
