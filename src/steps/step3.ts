import { store } from '../store';
import { checkCommonSense, newId, SUPPLY_CATEGORIES, type CorrectCountEntry, type SupplyCategory } from '../types';

export function renderStep3(container: HTMLElement, onChange: () => void): void {
  container.innerHTML = `
    <h2>設計者の数を登録する(器具表・機器リスト)</h2>
    <p class="small-note" style="margin-top:-10px;margin-bottom:16px;">ここで入れた台数が、後で平面図を数えた結果と自動で比較されます。合わなければどちらかが間違っています。</p>

    <div class="panel">
      <h3>器具表・機器リスト <span class="small-note">記号・名称・台数・仕様・支給区分を登録します(室名枠がある場合は階・室も入れます)</span></h3>
      <label style="display:flex;align-items:center;gap:6px;font-size:12.5px;margin-bottom:12px;">
        <input type="checkbox" id="noFixtureList"> この案件には器具表・機器リストが無い
      </label>
      <div id="countList"></div>
      <div class="field-row" style="margin-top:8px;" id="addRow">
        <div class="field"><label>記号</label><input type="text" id="newSymbolLabel" placeholder="例: ●"></div>
        <div class="field"><label>部材名</label><input type="text" id="newMaterialName" placeholder="例: ペンダント"></div>
        <div class="field"><label>階</label><input type="text" id="newFloor" placeholder="例: 1F"></div>
        <div class="field"><label>室</label><input type="text" id="newRoom" placeholder="例: ホール"></div>
        <div class="field"><label>台数</label><input type="number" id="newQuantity" min="0" step="1" value="1"></div>
        <div class="field"><label>仕様</label><input type="text" id="newSpec" placeholder="例: 40W相当/1灯"></div>
        <div class="field">
          <label>支給区分</label>
          <select id="newSupplyCategory">${SUPPLY_CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join('')}</select>
        </div>
        <div class="field" style="justify-content:flex-end;"><button class="btn copper" id="addCount">＋追加</button></div>
      </div>
    </div>
  `;

  const noListCheckbox = container.querySelector<HTMLInputElement>('#noFixtureList')!;
  noListCheckbox.checked = store.project.noFixtureList;
  const addRow = container.querySelector<HTMLDivElement>('#addRow')!;
  function syncAddRowVisibility(): void {
    addRow.style.display = noListCheckbox.checked ? 'none' : '';
  }
  syncAddRowVisibility();
  noListCheckbox.addEventListener('change', () => {
    store.project.noFixtureList = noListCheckbox.checked;
    syncAddRowVisibility();
    onChange();
  });

  function renderCountList(): void {
    const el = container.querySelector<HTMLDivElement>('#countList')!;
    if (!store.project.correctCounts.length) {
      el.innerHTML = '<p class="small-note">まだ登録されていません。</p>';
      return;
    }
    el.innerHTML = `
      <table class="data-table circuit-table">
        <thead><tr><th>記号</th><th>部材名</th><th>階</th><th>室</th><th>台数</th><th>仕様</th><th>支給区分</th><th></th></tr></thead>
        <tbody>
          ${store.project.correctCounts
            .map(
              (c) => `<tr data-id="${c.id}" class="${c.flagReason ? 'flagged-row' : ''}">
              <td><input class="ccField" data-id="${c.id}" data-field="symbolLabel" value="${escapeAttr(c.symbolLabel)}" style="width:50px;"></td>
              <td><input class="ccField" data-id="${c.id}" data-field="materialName" value="${escapeAttr(c.materialName)}" style="width:110px;"></td>
              <td><input class="ccField" data-id="${c.id}" data-field="floor" value="${escapeAttr(c.floor)}" style="width:50px;"></td>
              <td><input class="ccField" data-id="${c.id}" data-field="room" value="${escapeAttr(c.room)}" style="width:80px;"></td>
              <td><input class="ccField ccQuantity" data-id="${c.id}" type="number" min="0" step="1" value="${c.quantity}" style="width:55px;"></td>
              <td><input class="ccField" data-id="${c.id}" data-field="spec" value="${escapeAttr(c.spec)}" style="width:110px;"></td>
              <td><select class="ccSupply" data-id="${c.id}">${SUPPLY_CATEGORIES.map((s) => `<option value="${s}" ${s === c.supplyCategory ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
              <td><button class="btn danger delCount" data-id="${c.id}">✕</button></td>
            </tr>
            ${c.flagReason ? `<tr class="flag-note-row"><td colspan="8" class="small-note flag-note">⚠ ${escapeHtml(c.flagReason)}</td></tr>` : ''}`,
            )
            .join('')}
        </tbody>
      </table>
    `;

    function refreshFlag(c: CorrectCountEntry): void {
      c.flagReason = checkCommonSense(c.materialName, c.spec);
    }

    el.querySelectorAll<HTMLInputElement>('.ccField').forEach((input) => {
      input.addEventListener('input', () => {
        const c = store.project.correctCounts.find((x) => x.id === input.dataset.id);
        if (!c) return;
        if (input.classList.contains('ccQuantity')) {
          c.quantity = Number(input.value) || 0;
        } else {
          (c as unknown as Record<string, string>)[input.dataset.field!] = input.value;
        }
      });
      input.addEventListener('change', () => {
        const c = store.project.correctCounts.find((x) => x.id === input.dataset.id);
        if (!c) return;
        refreshFlag(c);
        renderCountList();
        onChange();
      });
    });
    el.querySelectorAll<HTMLSelectElement>('.ccSupply').forEach((sel) => {
      sel.addEventListener('change', () => {
        const c = store.project.correctCounts.find((x) => x.id === sel.dataset.id);
        if (c) c.supplyCategory = sel.value as SupplyCategory;
        onChange();
      });
    });
    el.querySelectorAll<HTMLButtonElement>('.delCount').forEach((btn) => {
      btn.addEventListener('click', () => {
        store.project.correctCounts = store.project.correctCounts.filter((c) => c.id !== btn.dataset.id);
        renderCountList();
        onChange();
      });
    });
  }

  container.querySelector<HTMLButtonElement>('#addCount')!.addEventListener('click', () => {
    const materialName = getVal(container, '#newMaterialName');
    if (!materialName) return;
    const spec = getVal(container, '#newSpec');
    const entry: CorrectCountEntry = {
      id: newId('count'),
      symbolLabel: getVal(container, '#newSymbolLabel'),
      materialName,
      floor: getVal(container, '#newFloor'),
      room: getVal(container, '#newRoom'),
      quantity: Number(getVal(container, '#newQuantity')) || 0,
      spec,
      supplyCategory: (container.querySelector<HTMLSelectElement>('#newSupplyCategory')!.value || '本工事') as SupplyCategory,
      flagReason: checkCommonSense(materialName, spec),
    };
    store.project.correctCounts.push(entry);
    ['#newSymbolLabel', '#newMaterialName', '#newFloor', '#newRoom', '#newSpec'].forEach((sel) => {
      (container.querySelector<HTMLInputElement>(sel)!).value = '';
    });
    (container.querySelector<HTMLInputElement>('#newQuantity')!).value = '1';
    renderCountList();
    onChange();
  });

  renderCountList();
}

function getVal(container: HTMLElement, sel: string): string {
  return (container.querySelector<HTMLInputElement>(sel)?.value ?? '').trim();
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;');
}
