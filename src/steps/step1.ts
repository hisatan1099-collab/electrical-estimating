import { store } from '../store';
import {
  newId,
  PICKUP_CATEGORIES,
  PLAN_DRAWING_TYPES,
  type LegendEntry,
  type NoteCategory,
  type NoteEntry,
  type PickupCategory,
} from '../types';
import { openScaleCalibrationModal } from '../scaleCalibration';

const NOTE_CATEGORIES: NoteCategory[] = ['配線方式', '支給品・別途', '壁仕様', '参照図面'];

export function renderStep1(container: HTMLElement, onChange: () => void): void {
  container.innerHTML = `
    <h2>読む準備(凡例・注記・縮尺)</h2>
    <p class="small-note" style="margin-top:-10px;margin-bottom:16px;">記号の意味と注記を先に読むと、後で数え間違いが減ります。「別途」「支給品」は積算に入れないものなので必ず確認します。</p>

    <div class="panel">
      <h3>凡例登録 <span class="small-note">記号ごとに部材名・分類・レイヤーを登録します</span></h3>
      <div id="legendList"></div>
      <div class="field-row" style="margin-top:8px;">
        <div class="field"><label>記号</label><input type="text" id="newSymbolLabel" placeholder="例: ●"></div>
        <div class="field"><label>部材名</label><input type="text" id="newMaterialName" placeholder="例: 一般照明"></div>
        <div class="field"><label>分類</label><input type="text" id="newCategory" placeholder="例: 照明"></div>
        <div class="field"><label>レイヤー</label><input type="text" id="newLayer" placeholder="例: 電灯回路"></div>
        <div class="field">
          <label>拾い出し分類 <span class="small-note">(ステップ5用・任意)</span></label>
          <select id="newPickupCategory">
            <option value="">未設定</option>
            ${PICKUP_CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join('')}
          </select>
        </div>
        <div class="field" style="justify-content:flex-end;"><button class="btn copper" id="addLegend">＋追加</button></div>
      </div>
    </div>

    <div class="panel">
      <h3>注記登録 <span class="small-note">注記の文章を転記し、該当する分類にチェックを付けます</span></h3>
      <div id="noteList"></div>
      <div class="field-row" style="margin-top:8px;align-items:flex-end;">
        <div class="field" style="flex:1;min-width:280px;"><label>注記の文章</label><textarea id="newNoteText" rows="2" placeholder="注記をそのまま転記(コピペまたは手入力)"></textarea></div>
        <div class="field"><button class="btn copper" id="addNote">＋追加</button></div>
      </div>
      <div class="field-row" style="margin-top:14px;">
        <div class="field">
          <label>この案件に「支給品・別途」に該当するものはありますか?</label>
          <select id="suppliedOrExcluded">
            <option value="">未回答</option>
            <option value="あり">あり</option>
            <option value="なし">なし</option>
          </select>
        </div>
      </div>
    </div>

    <div class="panel">
      <h3>縮尺設定 <span class="small-note">平面図ページごとに、2点クリック→実寸入力で設定します</span></h3>
      <div id="scaleList"></div>
    </div>
  `;

  // ---------- legend ----------
  function renderLegendList(): void {
    const el = container.querySelector<HTMLDivElement>('#legendList')!;
    if (!store.project.legends.length) {
      el.innerHTML = '<p class="small-note">まだ凡例が登録されていません。</p>';
      return;
    }
    el.innerHTML = `
      <table class="data-table">
        <thead><tr><th>記号</th><th>部材名</th><th>分類</th><th>レイヤー</th><th>拾い出し分類</th><th></th></tr></thead>
        <tbody>
          ${store.project.legends
            .map(
              (l) => `<tr data-id="${l.id}">
              <td>${escapeHtml(l.symbolLabel)}</td>
              <td>${escapeHtml(l.materialName)}</td>
              <td>${escapeHtml(l.category)}</td>
              <td>${escapeHtml(l.layer)}</td>
              <td>
                <select class="legendPickupCategory" data-id="${l.id}">
                  <option value="">未設定</option>
                  ${PICKUP_CATEGORIES.map((c) => `<option value="${c}" ${c === l.pickupCategory ? 'selected' : ''}>${c}</option>`).join('')}
                </select>
              </td>
              <td><button class="btn danger delLegend" data-id="${l.id}">✕</button></td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    `;
    el.querySelectorAll<HTMLSelectElement>('.legendPickupCategory').forEach((sel) => {
      sel.addEventListener('change', () => {
        const l = store.project.legends.find((x) => x.id === sel.dataset.id);
        if (l) l.pickupCategory = (sel.value || null) as PickupCategory | null;
        onChange();
      });
    });
    el.querySelectorAll<HTMLButtonElement>('.delLegend').forEach((btn) => {
      btn.addEventListener('click', () => {
        store.project.legends = store.project.legends.filter((l) => l.id !== btn.dataset.id);
        renderLegendList();
        onChange();
      });
    });
  }

  container.querySelector<HTMLButtonElement>('#addLegend')!.addEventListener('click', () => {
    const symbolLabel = getVal(container, '#newSymbolLabel');
    const materialName = getVal(container, '#newMaterialName');
    if (!materialName) return;
    const pickupCategorySel = container.querySelector<HTMLSelectElement>('#newPickupCategory')!;
    const entry: LegendEntry = {
      id: newId('legend'),
      symbolLabel,
      materialName,
      category: getVal(container, '#newCategory'),
      layer: getVal(container, '#newLayer'),
      pickupCategory: (pickupCategorySel.value || null) as PickupCategory | null,
    };
    store.project.legends.push(entry);
    ['#newSymbolLabel', '#newMaterialName', '#newCategory', '#newLayer'].forEach((sel) => {
      (container.querySelector<HTMLInputElement>(sel)!).value = '';
    });
    pickupCategorySel.value = '';
    renderLegendList();
    onChange();
  });

  // ---------- notes ----------
  function renderNoteList(): void {
    const el = container.querySelector<HTMLDivElement>('#noteList')!;
    if (!store.project.notes.length) {
      el.innerHTML = '<p class="small-note">まだ注記が登録されていません。</p>';
      return;
    }
    el.innerHTML = store.project.notes
      .map(
        (n) => `<div class="note-row" data-id="${n.id}">
        <div class="note-text">${escapeHtml(n.text)}</div>
        <div class="note-cats">
          ${NOTE_CATEGORIES.map(
            (c) => `<label><input type="checkbox" class="noteCat" data-id="${n.id}" data-cat="${c}" ${n.categories.includes(c) ? 'checked' : ''}> ${c}</label>`,
          ).join('')}
          <button class="btn danger delNote" data-id="${n.id}" style="margin-left:auto;">✕</button>
        </div>
      </div>`,
      )
      .join('');
    el.querySelectorAll<HTMLInputElement>('.noteCat').forEach((cb) => {
      cb.addEventListener('change', () => {
        const note = store.project.notes.find((n) => n.id === cb.dataset.id);
        if (!note) return;
        const cat = cb.dataset.cat as NoteCategory;
        if (cb.checked) {
          if (!note.categories.includes(cat)) note.categories.push(cat);
        } else {
          note.categories = note.categories.filter((c) => c !== cat);
        }
        onChange();
      });
    });
    el.querySelectorAll<HTMLButtonElement>('.delNote').forEach((btn) => {
      btn.addEventListener('click', () => {
        store.project.notes = store.project.notes.filter((n) => n.id !== btn.dataset.id);
        renderNoteList();
        onChange();
      });
    });
  }

  container.querySelector<HTMLButtonElement>('#addNote')!.addEventListener('click', () => {
    const textarea = container.querySelector<HTMLTextAreaElement>('#newNoteText')!;
    const text = textarea.value.trim();
    if (!text) return;
    const entry: NoteEntry = { id: newId('note'), pageId: null, text, categories: [] };
    store.project.notes.push(entry);
    textarea.value = '';
    renderNoteList();
    onChange();
  });

  const suppliedSel = container.querySelector<HTMLSelectElement>('#suppliedOrExcluded')!;
  suppliedSel.value = store.project.suppliedOrExcluded ?? '';
  suppliedSel.addEventListener('change', () => {
    store.project.suppliedOrExcluded = (suppliedSel.value || null) as 'あり' | 'なし' | null;
    onChange();
  });

  // ---------- scale ----------
  function renderScaleList(): void {
    const el = container.querySelector<HTMLDivElement>('#scaleList')!;
    const planPages = store.project.pages.filter((p) => p.drawingType && PLAN_DRAWING_TYPES.includes(p.drawingType));
    if (!planPages.length) {
      el.innerHTML = '<p class="small-note">平面図(電灯・コンセント・動力・弱電・防災)としてタグ付けされたページがありません。ステップ0で図面種別を確認してください。</p>';
      return;
    }
    el.innerHTML = planPages
      .map((p) => {
        const status = p.scaleMmPerPx
          ? `<span style="color:var(--ok);">設定済み(${p.scaleMmPerPx.toFixed(4)} mm/px)${p.scaleCheck ? ` / 検算誤差 ${p.scaleCheck.errorPercent.toFixed(1)}%` : ''}</span>`
          : '<span style="color:var(--danger);">未設定</span>';
        return `<div class="missing-row">
          <span class="name">${escapeHtml(p.fileName)} p.${p.pageNumberInFile} (${p.drawingType})</span>
          <span class="small-note">${status}</span>
          <button class="btn copper setScale" data-id="${p.id}">${p.scaleMmPerPx ? '再設定/検算' : '設定する'}</button>
        </div>`;
      })
      .join('');
    el.querySelectorAll<HTMLButtonElement>('.setScale').forEach((btn) => {
      btn.addEventListener('click', () => {
        const page = store.project.pages.find((p) => p.id === btn.dataset.id);
        if (!page) return;
        openScaleCalibrationModal(page, () => {
          renderScaleList();
          onChange();
        });
      });
    });
  }

  renderLegendList();
  renderNoteList();
  renderScaleList();
}

function getVal(container: HTMLElement, sel: string): string {
  return (container.querySelector<HTMLInputElement>(sel)?.value ?? '').trim();
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
