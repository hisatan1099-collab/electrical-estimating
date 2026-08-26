export function renderPlaceholder(container: HTMLElement, stepLabel: string): void {
  container.innerHTML = `
    <div class="placeholder-step">
      <h2>${stepLabel}</h2>
      <p class="small-note">このステップはまだ実装されていません。次の開発フェーズで追加されます。</p>
    </div>
  `;
}
