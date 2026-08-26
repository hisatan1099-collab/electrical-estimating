import { store } from '../store';
import { newId, type WireListEntry } from '../types';

export function renderStep4(container: HTMLElement, onChange: () => void): void {
  container.innerHTML = `
    <h2>一覧図があれば先に登録(結線図・ケーブルリスト)</h2>
    <p class="small-note" style="margin-top:-10px;margin-bottom:16px;">一覧になっている図は、平面図から数えるより確実です。ただし1行が器具1台とは限らないので、ステップ8で台数と比べます。</p>

    <div class="panel">
      <h3>結線図・ケーブルリスト <span class="small-note">行番号・部材・名称・ケーブル種別・長さ・接地・3路などを登録します</span></h3>
      <label style="display:flex;align-items:center;gap:6px;font-size:12.5px;margin-bottom:12px;">
        <input type="checkbox" id="noWireList"> この案件には結線図・ケーブルリストが無い
      </label>
      <div id="wireListTable"></div>
      <div class="field-row" style="margin-top:8px;" id="addRow">
        <div class="field"><label>行番号</label><input type="text" id="newRowNo" placeholder="例: 1" style="width:70px;"></div>
        <div class="field"><label>部材</label><input type="text" id="newMaterial" placeholder="例: 分電盤→L-1"></div>
        <div class="field"><label>名称</label><input type="text" id="newName" placeholder="例: 一般照明"></div>
        <div class="field"><label>ケーブル種別</label><input type="text" id="newCableType" placeholder="例: VVF1.6-2C"></div>
        <div class="field"><label>長さ(m)</label><input type="number" id="newLength" min="0" step="0.1" placeholder="例: 12.5"></div>
        <div class="field">
          <label style="display:flex;align-items:center;gap:4px;"><input type="checkbox" id="newIsPrefab"> プレハブ(セット一式)</label>
        </div>
        <div class="field">
          <label style="display:flex;align-items:center;gap:4px;"><input type="checkbox" id="newGrounded"> 接地</label>
        </div>
        <div class="field">
          <label style="display:flex;align-items:center;gap:4px;"><input type="checkbox" id="newThreeWay"> 3路</label>
        </div>
        <div class="field" style="justify-content:flex-end;"><button class="btn copper" id="addWireEntry">＋追加</button></div>
      </div>
    </div>
  `;

  const noListCheckbox = container.querySelector<HTMLInputElement>('#noWireList')!;
  noListCheckbox.checked = store.project.noWireList;
  const addRow = container.querySelector<HTMLDivElement>('#addRow')!;
  function syncAddRowVisibility(): void {
    addRow.style.display = noListCheckbox.checked ? 'none' : '';
  }
  syncAddRowVisibility();
  noListCheckbox.addEventListener('change', () => {
    store.project.noWireList = noListCheckbox.checked;
    syncAddRowVisibility();
    onChange();
  });

  const prefabCheckbox = container.querySelector<HTMLInputElement>('#newIsPrefab')!;
  const lengthInput = container.querySelector<HTMLInputElement>('#newLength')!;
  prefabCheckbox.addEventListener('change', () => {
    lengthInput.disabled = prefabCheckbox.checked;
    if (prefabCheckbox.checked) lengthInput.value = '';
  });

  function renderTable(): void {
    const el = container.querySelector<HTMLDivElement>('#wireListTable')!;
    if (!store.project.wireListEntries.length) {
      el.innerHTML = '<p class="small-note">まだ登録されていません。</p>';
      return;
    }
    el.innerHTML = `
      <table class="data-table circuit-table">
        <thead><tr>
          <th>行番号</th><th>部材</th><th>名称</th><th>ケーブル種別</th><th>長さ(m)</th><th>プレハブ</th><th>接地</th><th>3路</th><th></th>
        </tr></thead>
        <tbody>
          ${store.project.wireListEntries
            .map(
              (w) => `<tr data-id="${w.id}">
              <td><input class="wField" data-id="${w.id}" data-field="rowNo" value="${escapeAttr(w.rowNo)}" style="width:50px;"></td>
              <td><input class="wField" data-id="${w.id}" data-field="material" value="${escapeAttr(w.material)}" style="width:110px;"></td>
              <td><input class="wField" data-id="${w.id}" data-field="name" value="${escapeAttr(w.name)}" style="width:110px;"></td>
              <td><input class="wField" data-id="${w.id}" data-field="cableType" value="${escapeAttr(w.cableType)}" style="width:100px;"></td>
              <td>${
                w.isPrefab
                  ? '<span class="small-note">(セット一式)</span>'
                  : `<input class="wLength" data-id="${w.id}" type="number" min="0" step="0.1" value="${w.lengthM ?? ''}" style="width:70px;">`
              }</td>
              <td style="text-align:center;"><input type="checkbox" class="wPrefab" data-id="${w.id}" ${w.isPrefab ? 'checked' : ''}></td>
              <td style="text-align:center;"><input type="checkbox" class="wGrounded" data-id="${w.id}" ${w.grounded ? 'checked' : ''}></td>
              <td style="text-align:center;"><input type="checkbox" class="wThreeWay" data-id="${w.id}" ${w.threeWay ? 'checked' : ''}></td>
              <td><button class="btn danger delWire" data-id="${w.id}">✕</button></td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    `;

    el.querySelectorAll<HTMLInputElement>('.wField').forEach((input) => {
      input.addEventListener('input', () => {
        const w = store.project.wireListEntries.find((x) => x.id === input.dataset.id);
        if (w) (w as unknown as Record<string, string>)[input.dataset.field!] = input.value;
      });
      input.addEventListener('change', onChange);
    });
    el.querySelectorAll<HTMLInputElement>('.wLength').forEach((input) => {
      input.addEventListener('input', () => {
        const w = store.project.wireListEntries.find((x) => x.id === input.dataset.id);
        if (w) w.lengthM = input.value ? Number(input.value) : null;
      });
      input.addEventListener('change', onChange);
    });
    el.querySelectorAll<HTMLInputElement>('.wPrefab').forEach((cb) => {
      cb.addEventListener('change', () => {
        const w = store.project.wireListEntries.find((x) => x.id === cb.dataset.id);
        if (w) {
          w.isPrefab = cb.checked;
          if (w.isPrefab) w.lengthM = null;
        }
        renderTable();
        onChange();
      });
    });
    el.querySelectorAll<HTMLInputElement>('.wGrounded').forEach((cb) => {
      cb.addEventListener('change', () => {
        const w = store.project.wireListEntries.find((x) => x.id === cb.dataset.id);
        if (w) w.grounded = cb.checked;
        onChange();
      });
    });
    el.querySelectorAll<HTMLInputElement>('.wThreeWay').forEach((cb) => {
      cb.addEventListener('change', () => {
        const w = store.project.wireListEntries.find((x) => x.id === cb.dataset.id);
        if (w) w.threeWay = cb.checked;
        onChange();
      });
    });
    el.querySelectorAll<HTMLButtonElement>('.delWire').forEach((btn) => {
      btn.addEventListener('click', () => {
        store.project.wireListEntries = store.project.wireListEntries.filter((w) => w.id !== btn.dataset.id);
        renderTable();
        onChange();
      });
    });
  }

  container.querySelector<HTMLButtonElement>('#addWireEntry')!.addEventListener('click', () => {
    const material = getVal(container, '#newMaterial');
    const name = getVal(container, '#newName');
    if (!material && !name) return;
    const isPrefab = prefabCheckbox.checked;
    const entry: WireListEntry = {
      id: newId('wirelist'),
      rowNo: getVal(container, '#newRowNo'),
      material,
      name,
      cableType: getVal(container, '#newCableType'),
      lengthM: isPrefab ? null : lengthInput.value ? Number(lengthInput.value) : null,
      isPrefab,
      grounded: container.querySelector<HTMLInputElement>('#newGrounded')!.checked,
      threeWay: container.querySelector<HTMLInputElement>('#newThreeWay')!.checked,
      note: '',
    };
    store.project.wireListEntries.push(entry);
    ['#newRowNo', '#newMaterial', '#newName', '#newCableType', '#newLength'].forEach((sel) => {
      (container.querySelector<HTMLInputElement>(sel)!).value = '';
    });
    ['#newIsPrefab', '#newGrounded', '#newThreeWay'].forEach((sel) => {
      (container.querySelector<HTMLInputElement>(sel)!).checked = false;
    });
    lengthInput.disabled = false;
    renderTable();
    onChange();
  });

  renderTable();
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
