// window.alert/confirm/promptはTauriの埋め込みWebViewで挙動が不安定なことがあるため、
// アプリ全体でこちらの自前実装を使う。

export function showToast(message: string): void {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = message;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

export function askConfirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-box confirm-box">
        <p>${escapeHtml(message)}</p>
        <div class="mini-dialog-actions">
          <button class="btn" id="confirmCancel">キャンセル</button>
          <button class="btn danger" id="confirmOk">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#confirmCancel')!.addEventListener('click', () => {
      overlay.remove();
      resolve(false);
    });
    overlay.querySelector('#confirmOk')!.addEventListener('click', () => {
      overlay.remove();
      resolve(true);
    });
  });
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
