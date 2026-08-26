import { store } from '../store';
import { newId, type BoardEntry, type BoardType, type CircuitEntry, type CircuitKind } from '../types';
import { showToast } from '../ui';

const BOARD_TYPES: BoardType[] = ['分電盤', '動力盤', '制御盤', '情報分電盤'];
const CIRCUIT_KINDS: CircuitKind[] = ['一般', '専用', '動力', '幹線'];

export function renderStep2(container: HTMLElement, onChange: () => void): void {
  const isHousing = store.project.info.buildingType === '住宅';

  container.innerHTML = `
    <h2>骨格を確定する(受電・幹線・盤・回路)</h2>
    <p class="small-note" style="margin-top:-10px;margin-bottom:16px;">盤図は設計者が回路を数えた表です。ここを台帳にすると、後で平面図に出てくる番号が全部この台帳と対応します。</p>

    <div class="panel">
      <h3>受電</h3>
      <div class="field-row">
        <div class="field">
          <label>受電方式</label>
          <select id="receivingMethod">
            <option value="">未設定</option>
            <option value="低圧">低圧</option>
            <option value="高圧">高圧</option>
          </select>
        </div>
        <div class="field">
          <label>電力量計</label>
          <select id="hasWattHourMeter">
            <option value="false">なし</option>
            <option value="true">あり</option>
          </select>
        </div>
        <div class="field">
          <label>主幹ブレーカ</label>
          <input type="text" id="mainBreaker" placeholder="例: 60A">
        </div>
        ${
          isHousing
            ? ''
            : `
        <div class="field">
          <label>幹線ケーブル種別</label>
          <input type="text" id="mainCableType" placeholder="例: CV38sq×3C">
        </div>
        <div class="field">
          <label>ケーブルラック・電線管</label>
          <select id="cableRackOrConduit">
            <option value="">未回答</option>
            <option value="あり">あり</option>
            <option value="なし">なし</option>
            <option value="不明">不明</option>
          </select>
        </div>`
        }
      </div>
    </div>

    <div class="panel">
      <h3>盤 <span class="small-note">面数と種類を登録します</span></h3>
      <div id="boardList"></div>
      <div class="field-row" style="margin-top:8px;">
        <div class="field"><label>盤名</label><input type="text" id="newBoardName" placeholder="例: 分電盤1"></div>
        <div class="field">
          <label>種類</label>
          <select id="newBoardType">${BOARD_TYPES.map((t) => `<option value="${t}">${t}</option>`).join('')}</select>
        </div>
        <div class="field" style="justify-content:flex-end;"><button class="btn copper" id="addBoard">＋追加</button></div>
      </div>
    </div>

    <div class="panel">
      <h3>回路台帳 <span class="small-note">系統図・盤図を見ながら回路を1行ずつ登録します</span></h3>
      <div id="circuitList"></div>
      <button class="btn copper" id="addCircuit" style="margin-top:8px;">＋回路を追加</button>
    </div>
  `;

  // ---------- receiving info ----------
  const ri = store.project.receivingInfo;
  const methodSel = container.querySelector<HTMLSelectElement>('#receivingMethod')!;
  methodSel.value = ri.method ?? '';
  methodSel.addEventListener('change', () => {
    ri.method = (methodSel.value || null) as '低圧' | '高圧' | null;
    onChange();
  });

  const meterSel = container.querySelector<HTMLSelectElement>('#hasWattHourMeter')!;
  meterSel.value = String(ri.hasWattHourMeter);
  meterSel.addEventListener('change', () => {
    ri.hasWattHourMeter = meterSel.value === 'true';
    onChange();
  });

  const breakerInput = container.querySelector<HTMLInputElement>('#mainBreaker')!;
  breakerInput.value = ri.mainBreaker;
  breakerInput.addEventListener('input', () => {
    ri.mainBreaker = breakerInput.value;
  });

  if (!isHousing) {
    const cableTypeInput = container.querySelector<HTMLInputElement>('#mainCableType')!;
    cableTypeInput.value = ri.mainCableType;
    cableTypeInput.addEventListener('input', () => {
      ri.mainCableType = cableTypeInput.value;
    });
    const rackSel = container.querySelector<HTMLSelectElement>('#cableRackOrConduit')!;
    rackSel.value = ri.cableRackOrConduit ?? '';
    rackSel.addEventListener('change', () => {
      ri.cableRackOrConduit = (rackSel.value || null) as 'あり' | 'なし' | '不明' | null;
      onChange();
    });
  }

  // ---------- boards ----------
  function renderBoardList(): void {
    const el = container.querySelector<HTMLDivElement>('#boardList')!;
    if (!store.project.boards.length) {
      el.innerHTML = '<p class="small-note">まだ盤が登録されていません。</p>';
      return;
    }
    el.innerHTML = `
      <table class="data-table">
        <thead><tr><th>盤名</th><th>種類</th><th></th></tr></thead>
        <tbody>
          ${store.project.boards
            .map(
              (b) => `<tr>
              <td>${escapeHtml(b.name)}</td>
              <td>${escapeHtml(b.type)}</td>
              <td><button class="btn danger delBoard" data-id="${b.id}">✕</button></td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    `;
    el.querySelectorAll<HTMLButtonElement>('.delBoard').forEach((btn) => {
      btn.addEventListener('click', () => {
        const boardId = btn.dataset.id!;
        if (store.project.circuits.some((c) => c.boardId === boardId)) {
          showToast('この盤に紐づく回路があるため削除できません。先に回路を削除するか、盤を変更してください。');
          return;
        }
        store.project.boards = store.project.boards.filter((b) => b.id !== boardId);
        renderBoardList();
        renderCircuitList();
        onChange();
      });
    });
  }

  container.querySelector<HTMLButtonElement>('#addBoard')!.addEventListener('click', () => {
    const nameInput = container.querySelector<HTMLInputElement>('#newBoardName')!;
    const typeSel = container.querySelector<HTMLSelectElement>('#newBoardType')!;
    const name = nameInput.value.trim();
    if (!name) return;
    const entry: BoardEntry = { id: newId('board'), name, type: typeSel.value as BoardType };
    store.project.boards.push(entry);
    nameInput.value = '';
    renderBoardList();
    renderCircuitList();
    onChange();
  });

  // ---------- circuits ----------
  function renderCircuitList(): void {
    const el = container.querySelector<HTMLDivElement>('#circuitList')!;
    if (!store.project.circuits.length) {
      el.innerHTML = '<p class="small-note">まだ回路が登録されていません。</p>';
      return;
    }
    const boardOptions = (selected: string) =>
      store.project.boards.map((b) => `<option value="${b.id}" ${b.id === selected ? 'selected' : ''}>${escapeHtml(b.name)}</option>`).join('');

    el.innerHTML = `
      <table class="data-table circuit-table">
        <thead><tr>
          <th>盤</th><th>回路番号</th><th>回路名</th><th>階</th><th>電圧</th><th>容量</th><th>種別</th><th>配線方式</th><th>長さ記載</th><th></th>
        </tr></thead>
        <tbody>
          ${store.project.circuits
            .map(
              (c) => `<tr data-id="${c.id}">
              <td><select class="cBoard" data-id="${c.id}"><option value="">未設定</option>${boardOptions(c.boardId)}</select></td>
              <td><input class="cField" data-id="${c.id}" data-field="circuitNo" value="${escapeHtml(c.circuitNo)}" style="width:70px;"></td>
              <td><input class="cField" data-id="${c.id}" data-field="circuitName" value="${escapeHtml(c.circuitName)}" style="width:110px;"></td>
              <td><input class="cField" data-id="${c.id}" data-field="floor" value="${escapeHtml(c.floor)}" style="width:50px;"></td>
              <td><input class="cField" data-id="${c.id}" data-field="voltage" value="${escapeHtml(c.voltage)}" style="width:60px;"></td>
              <td><input class="cField" data-id="${c.id}" data-field="breakerCapacity" value="${escapeHtml(c.breakerCapacity)}" style="width:60px;"></td>
              <td><select class="cKind" data-id="${c.id}">${CIRCUIT_KINDS.map((k) => `<option value="${k}" ${k === c.kind ? 'selected' : ''}>${k}</option>`).join('')}</select></td>
              <td><input class="cField" data-id="${c.id}" data-field="wiringMethod" value="${escapeHtml(c.wiringMethod)}" style="width:90px;"></td>
              <td>
                ${
                  c.kind === '専用' || c.kind === '動力'
                    ? `<select class="cLengthNoted" data-id="${c.id}">
                        <option value="" ${!c.lengthNoted ? 'selected' : ''}>未回答</option>
                        <option value="記載あり" ${c.lengthNoted === '記載あり' ? 'selected' : ''}>記載あり</option>
                        <option value="記載なし" ${c.lengthNoted === '記載なし' ? 'selected' : ''}>記載なし</option>
                      </select>`
                    : '<span class="small-note">(不要)</span>'
                }
              </td>
              <td><button class="btn danger delCircuit" data-id="${c.id}">✕</button></td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    `;

    el.querySelectorAll<HTMLSelectElement>('.cBoard').forEach((sel) => {
      sel.addEventListener('change', () => {
        const c = store.project.circuits.find((x) => x.id === sel.dataset.id);
        if (c) c.boardId = sel.value;
        onChange();
      });
    });
    el.querySelectorAll<HTMLInputElement>('.cField').forEach((input) => {
      input.addEventListener('input', () => {
        const c = store.project.circuits.find((x) => x.id === input.dataset.id);
        if (c) (c as unknown as Record<string, string>)[input.dataset.field!] = input.value;
      });
    });
    el.querySelectorAll<HTMLSelectElement>('.cKind').forEach((sel) => {
      sel.addEventListener('change', () => {
        const c = store.project.circuits.find((x) => x.id === sel.dataset.id);
        if (c) c.kind = sel.value as CircuitKind;
        renderCircuitList();
        onChange();
      });
    });
    el.querySelectorAll<HTMLSelectElement>('.cLengthNoted').forEach((sel) => {
      sel.addEventListener('change', () => {
        const c = store.project.circuits.find((x) => x.id === sel.dataset.id);
        if (c) c.lengthNoted = (sel.value || null) as '記載あり' | '記載なし' | null;
        onChange();
      });
    });
    el.querySelectorAll<HTMLButtonElement>('.delCircuit').forEach((btn) => {
      btn.addEventListener('click', () => {
        store.project.circuits = store.project.circuits.filter((c) => c.id !== btn.dataset.id);
        renderCircuitList();
        onChange();
      });
    });
  }

  container.querySelector<HTMLButtonElement>('#addCircuit')!.addEventListener('click', () => {
    const entry: CircuitEntry = {
      id: newId('circuit'),
      boardId: store.project.boards[0]?.id ?? '',
      circuitNo: '',
      circuitName: '',
      floor: '',
      voltage: '',
      breakerCapacity: '',
      kind: '一般',
      wiringMethod: '',
      lengthNoted: null,
      traceStatus: null,
    };
    store.project.circuits.push(entry);
    renderCircuitList();
    onChange();
  });

  renderBoardList();
  renderCircuitList();
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
