import { store } from '../store';
import {
  BUILDING_TYPES,
  DRAWING_TYPES,
  EXPECTED_DRAWINGS,
  newId,
  type BuildingType,
  type DrawingPage,
  type DrawingType,
} from '../types';
import { arrayBufferToBase64, loadPdf, renderThumbnail } from '../pdf';

export function renderStep0(container: HTMLElement, onChange: () => void): void {
  container.innerHTML = `
    <h2>案件を作る・図面を取り込む</h2>
    <div class="panel">
      <h3>案件情報</h3>
      <div class="field-row">
        <div class="field">
          <label>建物種別</label>
          <select id="buildingType">
            <option value="">選択してください</option>
            ${BUILDING_TYPES.map((t) => `<option value="${t}">${t}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>階数</label>
          <input type="number" id="floors" min="1" step="1">
        </div>
        <div class="field">
          <label>延床面積(m&sup2;)</label>
          <input type="number" id="floorArea" min="0" step="0.1">
        </div>
      </div>
    </div>

    <div class="panel">
      <h3>図面取込</h3>
      <label class="btn copper filelabel">
        📄 PDFを追加
        <input type="file" id="pdfInput" accept="application/pdf" multiple>
      </label>
      <p class="small-note" style="margin-top:8px;">複数ファイルを一度に選択できます。読み込むと各ページの一覧が下に追加されます。</p>
      <div class="page-grid" id="pageGrid" style="margin-top:14px;"></div>
    </div>

    <div class="panel" id="missingPanel" style="display:none;">
      <h3>この建物種別で通常あるはずの図面</h3>
      <div class="missing-list" id="missingList"></div>
    </div>
  `;

  const buildingTypeSel = container.querySelector<HTMLSelectElement>('#buildingType')!;
  const floorsInput = container.querySelector<HTMLInputElement>('#floors')!;
  const floorAreaInput = container.querySelector<HTMLInputElement>('#floorArea')!;
  buildingTypeSel.value = store.project.info.buildingType ?? '';
  floorsInput.value = store.project.info.floors != null ? String(store.project.info.floors) : '';
  floorAreaInput.value = store.project.info.floorAreaM2 != null ? String(store.project.info.floorAreaM2) : '';

  buildingTypeSel.addEventListener('change', () => {
    store.project.info.buildingType = (buildingTypeSel.value || null) as BuildingType | null;
    renderMissingPanel();
    onChange();
  });
  floorsInput.addEventListener('input', () => {
    store.project.info.floors = floorsInput.value ? Number(floorsInput.value) : null;
  });
  floorAreaInput.addEventListener('input', () => {
    store.project.info.floorAreaM2 = floorAreaInput.value ? Number(floorAreaInput.value) : null;
  });

  const pdfInput = container.querySelector<HTMLInputElement>('#pdfInput')!;
  pdfInput.addEventListener('change', async () => {
    const files = Array.from(pdfInput.files ?? []);
    for (const file of files) {
      const buf = await file.arrayBuffer();
      const fileId = newId('file');
      const base64 = arrayBufferToBase64(buf);
      store.project.files.push({ id: fileId, name: file.name, dataBase64: base64 });
      const doc = await loadPdf(buf.slice(0));
      for (let i = 1; i <= doc.numPages; i++) {
        const thumb = await renderThumbnail(doc, i);
        const page: DrawingPage = {
          id: newId('page'),
          fileName: file.name,
          pageNumberInFile: i,
          fileId,
          drawingType: null,
          rotation: 0,
          thumbnailDataUrl: thumb,
        };
        store.project.pages.push(page);
      }
    }
    pdfInput.value = '';
    renderPageGrid();
    renderMissingPanel();
    onChange();
  });

  function renderPageGrid(): void {
    const grid = container.querySelector<HTMLDivElement>('#pageGrid')!;
    grid.innerHTML =
      store.project.pages
        .map(
          (pg, idx) => `
      <div class="page-card ${pg.drawingType ? '' : 'untagged'}" data-idx="${idx}">
        <img src="${pg.thumbnailDataUrl ?? ''}" alt="">
        <div class="fname">${pg.fileName} p.${pg.pageNumberInFile}</div>
        <select class="drawingTypeSelect" data-idx="${idx}">
          <option value="">未設定</option>
          ${DRAWING_TYPES.map((t) => `<option value="${t}" ${pg.drawingType === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>
    `,
        )
        .join('') || '<p class="small-note">まだ図面が取り込まれていません。</p>';

    grid.querySelectorAll<HTMLSelectElement>('.drawingTypeSelect').forEach((sel) => {
      sel.addEventListener('change', () => {
        const idx = Number(sel.dataset.idx);
        store.project.pages[idx].drawingType = (sel.value || null) as DrawingType | null;
        sel.closest('.page-card')!.classList.toggle('untagged', !sel.value);
        renderMissingPanel();
        onChange();
      });
    });
  }

  function renderMissingPanel(): void {
    const panel = container.querySelector<HTMLDivElement>('#missingPanel')!;
    const bt = store.project.info.buildingType;
    if (!bt || !EXPECTED_DRAWINGS[bt].length) {
      panel.style.display = 'none';
      return;
    }
    panel.style.display = '';
    const list = container.querySelector<HTMLDivElement>('#missingList')!;
    const presentTypes = new Set(store.project.pages.map((p) => p.drawingType).filter((t): t is DrawingType => t !== null));
    list.innerHTML = EXPECTED_DRAWINGS[bt]
      .map((dt) => {
        const present = presentTypes.has(dt);
        const note = store.project.missingDrawings.find((m) => m.drawingType === dt);
        const confirmed = note?.confirmedAbsent ?? false;
        const cls = present ? 'present' : confirmed ? 'absent-confirmed' : 'pending';
        const statusText = present ? '✓ 取込済み' : confirmed ? '無いことを確認済み' : '未確認';
        return `<div class="missing-row ${cls}">
        <span class="name">${dt}</span>
        <span class="small-note">${statusText}</span>
        ${
          present
            ? ''
            : `<label style="display:flex;align-items:center;gap:4px;">
          <input type="checkbox" class="absentCheck" data-type="${dt}" ${confirmed ? 'checked' : ''}> 無い
        </label>`
        }
      </div>`;
      })
      .join('');

    list.querySelectorAll<HTMLInputElement>('.absentCheck').forEach((cb) => {
      cb.addEventListener('change', () => {
        const dt = cb.dataset.type as DrawingType;
        const existing = store.project.missingDrawings.find((m) => m.drawingType === dt);
        if (existing) existing.confirmedAbsent = cb.checked;
        else store.project.missingDrawings.push({ drawingType: dt, confirmedAbsent: cb.checked });
        renderMissingPanel();
        onChange();
      });
    });
  }

  renderPageGrid();
  renderMissingPanel();
}
