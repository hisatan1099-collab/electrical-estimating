import type { Project } from '../types';
import { renderPlaceholder } from './placeholder';
import { renderStep0 } from './step0';

export interface StepDef {
  id: number;
  label: string;
  /** container内にこのステップのUIを描画する。onChangeはデータ変更のたびに呼ぶ(ナビ更新用)。 */
  render: (container: HTMLElement, onChange: () => void) => void;
  /** 「次へ進む条件」を満たしているか */
  isComplete: (p: Project) => boolean;
}

export const STEPS: StepDef[] = [
  {
    id: 0,
    label: 'ステップ0: 案件・図面取込',
    render: renderStep0,
    isComplete: (p) => p.pages.length > 0 && p.pages.every((pg) => pg.drawingType !== null),
  },
  { id: 1, label: 'ステップ1: 読む準備', render: (c) => renderPlaceholder(c, 'ステップ1: 読む準備(凡例・注記・縮尺)'), isComplete: () => false },
  { id: 2, label: 'ステップ2: 骨格確定', render: (c) => renderPlaceholder(c, 'ステップ2: 骨格を確定する(受電・幹線・盤・回路)'), isComplete: () => false },
  { id: 3, label: 'ステップ3: 器具表登録', render: (c) => renderPlaceholder(c, 'ステップ3: 設計者の数を登録する(器具表・機器リスト)'), isComplete: () => false },
  { id: 4, label: 'ステップ4: 一覧図登録', render: (c) => renderPlaceholder(c, 'ステップ4: 一覧図があれば先に登録'), isComplete: () => false },
  { id: 5, label: 'ステップ5: 平面図で拾う', render: (c) => renderPlaceholder(c, 'ステップ5: 平面図で拾う'), isComplete: () => false },
  { id: 6, label: 'ステップ6: 配線をなぞる', render: (c) => renderPlaceholder(c, 'ステップ6: 配線をなぞる'), isComplete: () => false },
  { id: 7, label: 'ステップ7: 一式項目', render: (c) => renderPlaceholder(c, 'ステップ7: 図面に無いものを入れる'), isComplete: () => false },
  { id: 8, label: 'ステップ8: 検算', render: (c) => renderPlaceholder(c, 'ステップ8: 検算(自動突き合わせ)'), isComplete: () => false },
  { id: 9, label: 'ステップ9: 積算', render: (c) => renderPlaceholder(c, 'ステップ9: 積算(単価・施工費)'), isComplete: () => false },
  { id: 10, label: 'ステップ10: 出力', render: (c) => renderPlaceholder(c, 'ステップ10: 出力'), isComplete: () => false },
];
