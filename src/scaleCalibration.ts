import { store } from './store';
import { base64ToArrayBuffer, loadPdf, renderPageToCanvas } from './pdf';
import type { DrawingPage } from './types';

interface Point {
  x: number;
  y: number;
}

/** window.prompt/alertはTauriのWebView実装によって挙動が不安定なため、
 *  自前の小さな入力ダイアログ・通知を使う。 */
function askMm(clientX: number, clientY: number, label: string): Promise<number | null> {
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.className = 'mini-dialog';
    box.style.left = Math.min(clientX, window.innerWidth - 240) + 'px';
    box.style.top = Math.min(clientY, window.innerHeight - 120) + 'px';
    box.innerHTML = `
      <div class="mini-dialog-label">${label}</div>
      <input type="number" id="miniDialogInput" placeholder="実寸(mm)" autofocus>
      <div class="mini-dialog-actions">
        <button class="btn danger" id="miniDialogCancel">取消</button>
        <button class="btn copper" id="miniDialogOk">設定</button>
      </div>
    `;
    document.body.appendChild(box);
    const input = box.querySelector<HTMLInputElement>('#miniDialogInput')!;
    input.focus();
    const cleanup = (result: number | null) => {
      box.remove();
      resolve(result);
    };
    box.querySelector('#miniDialogCancel')!.addEventListener('click', () => cleanup(null));
    box.querySelector('#miniDialogOk')!.addEventListener('click', () => {
      const v = parseFloat(input.value);
      cleanup(v > 0 ? v : null);
    });
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') (box.querySelector('#miniDialogOk') as HTMLButtonElement).click();
      if (ev.key === 'Escape') cleanup(null);
    });
  });
}

function showToast(message: string): void {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = message;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

/** 平面図ページの縮尺を、2点クリック+実寸入力で設定するモーダルを開く。 */
export function openScaleCalibrationModal(page: DrawingPage, onDone: () => void): void {
  const file = store.project.files.find((f) => f.id === page.fileId);
  if (!file) {
    showToast('元のPDFファイルが見つかりませんでした。');
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box scale-modal">
      <div class="modal-header">
        <h3>縮尺設定: ${page.fileName} p.${page.pageNumberInFile}</h3>
        <button class="btn" id="scaleModalClose">✕ 閉じる</button>
      </div>
      <p class="small-note" id="scaleHint">図面上で、実寸が分かっている寸法線の両端をクリックしてください。</p>
      <div class="scale-canvas-wrap" id="scaleCanvasWrap">
        <canvas id="scaleCanvas"></canvas>
      </div>
      <div class="scale-status" id="scaleStatus"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const canvas = overlay.querySelector<HTMLCanvasElement>('#scaleCanvas')!;
  const hint = overlay.querySelector<HTMLParagraphElement>('#scaleHint')!;
  const statusEl = overlay.querySelector<HTMLDivElement>('#scaleStatus')!;
  const closeBtn = overlay.querySelector<HTMLButtonElement>('#scaleModalClose')!;
  closeBtn.onclick = () => {
    overlay.remove();
    onDone();
  };

  let clickPoints: Point[] = [];
  let mode: 'primary' | 'check' = page.scaleMmPerPx ? 'check' : 'primary';
  let doc: Awaited<ReturnType<typeof loadPdf>> | null = null;

  function updateStatus(): void {
    const parts: string[] = [];
    parts.push(page.scaleMmPerPx ? `縮尺: ${page.scaleMmPerPx.toFixed(4)} mm/px` : '縮尺: 未設定');
    if (page.scaleCheck) {
      parts.push(`検算誤差: ${page.scaleCheck.errorPercent.toFixed(1)}%`);
    }
    statusEl.textContent = parts.join(' ／ ');
  }

  function updateHint(): void {
    hint.textContent =
      mode === 'primary'
        ? '実寸が分かっている寸法線の両端を2回クリックしてください(縮尺の基準になります)。'
        : '検算用に、別の寸法線の両端を2回クリックしてください。';
  }

  async function rerenderPage(): Promise<void> {
    if (!doc) return;
    await renderPageToCanvas(doc, page.pageNumberInFile, canvas, 1.5);
    const ctx = canvas.getContext('2d')!;
    clickPoints.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#d98a4e';
      ctx.fill();
    });
  }

  (async () => {
    const buf = base64ToArrayBuffer(file.dataBase64);
    doc = await loadPdf(buf);
    await rerenderPage();
    updateStatus();
    updateHint();
  })();

  canvas.addEventListener('click', async (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    clickPoints.push({ x, y });
    await rerenderPage();
    if (clickPoints.length === 2) {
      const pxDist = Math.hypot(clickPoints[1].x - clickPoints[0].x, clickPoints[1].y - clickPoints[0].y);
      const label = mode === 'primary' ? 'この2点間の実寸を入力' : '検算: この2点間の実寸を入力';
      const realMm = await askMm(e.clientX, e.clientY, label);
      clickPoints = [];
      await rerenderPage();
      if (!realMm) {
        showToast('入力がキャンセルされました。');
        return;
      }
      if (mode === 'primary') {
        page.scaleMmPerPx = realMm / pxDist;
        page.scaleCheck = null;
        mode = 'check';
      } else {
        const scale = page.scaleMmPerPx ?? 1;
        const measuredMm = pxDist * scale;
        const errorPercent = ((measuredMm - realMm) / realMm) * 100;
        page.scaleCheck = { actualMm: realMm, measuredMm, errorPercent };
      }
      updateStatus();
      updateHint();
      store.update(() => {});
      onDone();
    }
  });
}
