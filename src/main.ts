import './styles.css';
import { store } from './store';
import { STEPS } from './steps';
import { emptyProject, type Project } from './types';
import { askConfirm, showToast } from './ui';

let currentStepId = 0;

const app = document.getElementById('app')!;
app.innerHTML = `
  <div class="shell">
    <div class="topbar">
      <div class="brand">拾い出し<span>・積算アシスト</span></div>
      <input type="text" id="projectName" class="project-name-input" placeholder="案件名を入力">
      <div class="spacer"></div>
      <button class="btn" id="btnNew">新規案件</button>
      <button class="btn" id="btnSave">💾 保存</button>
      <label class="btn copper filelabel">
        📂 開く
        <input type="file" id="openInput" accept="application/json">
      </label>
    </div>
    <div class="stepnav" id="stepNav"></div>
    <div class="stepcontent" id="stepContent"></div>
  </div>
`;

const projectNameInput = document.getElementById('projectName') as HTMLInputElement;
projectNameInput.addEventListener('input', () => {
  store.project.info.name = projectNameInput.value;
});

function maxNavigableIndex(project: Project): number {
  const firstIncomplete = STEPS.findIndex((s) => !s.isComplete(project));
  return firstIncomplete === -1 ? STEPS.length - 1 : firstIncomplete;
}

function renderNav(): void {
  const nav = document.getElementById('stepNav')!;
  const maxIdx = maxNavigableIndex(store.project);
  nav.innerHTML = STEPS.map((s, idx) => {
    const locked = idx > maxIdx;
    const done = s.isComplete(store.project);
    const active = idx === currentStepId;
    const cls = ['step-pill'];
    if (active) cls.push('active');
    if (locked) cls.push('locked');
    if (done) cls.push('done');
    return `<button class="${cls.join(' ')}" data-step="${idx}" ${locked ? 'disabled' : ''}>
      <span class="step-num">${done ? '✓' : idx}</span><span class="step-label">${s.label.replace(/^ステップ\d+:\s*/, '')}</span>
    </button>`;
  }).join('');
  nav.querySelectorAll<HTMLButtonElement>('.step-pill').forEach((btn) => {
    btn.onclick = () => {
      const idx = Number(btn.dataset.step);
      goToStep(idx);
    };
  });
  projectNameInput.value = store.project.info.name;
}

function goToStep(idx: number): void {
  const maxIdx = maxNavigableIndex(store.project);
  if (idx > maxIdx) return;
  currentStepId = idx;
  renderNav();
  const container = document.getElementById('stepContent')!;
  STEPS[idx].render(container, renderNav);
}

document.getElementById('btnNew')!.addEventListener('click', async () => {
  const ok = await askConfirm('新規案件を作成します。現在の内容は保存していない場合失われます。よろしいですか?');
  if (!ok) return;
  store.reset();
  currentStepId = 0;
  goToStep(0);
});

document.getElementById('btnSave')!.addEventListener('click', () => {
  const json = JSON.stringify(store.project, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const name = store.project.info.name || '無題案件';
  a.download = `${name}.eecase.json`;
  a.click();
});

document.getElementById('openInput')!.addEventListener('change', async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text) as Project;
    store.replaceProject({ ...emptyProject(), ...data });
    currentStepId = 0;
    goToStep(0);
  } catch (err) {
    showToast('案件ファイルの読み込みに失敗しました。');
    console.error(err);
  } finally {
    input.value = '';
  }
});

goToStep(0);
