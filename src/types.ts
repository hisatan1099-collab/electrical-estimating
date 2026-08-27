// データ構造(要件定義v2 5章)に対応する型定義。
// MVP(ステップ 0・1・2・5・6・10)で使うフィールドを中心に、後続ステップ用のフィールドも
// あらかじめ用意しておく(v1/v2で埋める)。

export type BuildingType = '住宅' | '店舗' | '事務所' | '倉庫' | '福祉' | 'その他';

export const BUILDING_TYPES: BuildingType[] = ['住宅', '店舗', '事務所', '倉庫', '福祉', 'その他'];

export const DRAWING_TYPES = [
  '図面リスト',
  '特記仕様書',
  '系統図',
  '盤図',
  '器具表・機器リスト',
  '結線図',
  '電灯平面',
  'コンセント平面',
  '動力平面',
  '弱電平面',
  '防災平面',
  'その他',
] as const;
export type DrawingType = (typeof DRAWING_TYPES)[number];

// 建物種別ごとに「通常あるはずの図面」を提示するための対応表。
export const EXPECTED_DRAWINGS: Record<BuildingType, DrawingType[]> = {
  住宅: ['電灯平面', 'コンセント平面', '弱電平面', '系統図', '盤図', '器具表・機器リスト'],
  店舗: [
    '特記仕様書', '電灯平面', 'コンセント平面', '動力平面', '弱電平面', '防災平面',
    '系統図', '盤図', '器具表・機器リスト', '結線図',
  ],
  事務所: [
    '特記仕様書', '電灯平面', 'コンセント平面', '動力平面', '弱電平面', '防災平面',
    '系統図', '盤図', '器具表・機器リスト', '結線図',
  ],
  倉庫: [
    '特記仕様書', '電灯平面', 'コンセント平面', '動力平面', '防災平面',
    '系統図', '盤図', '器具表・機器リスト',
  ],
  福祉: [
    '特記仕様書', '電灯平面', 'コンセント平面', '動力平面', '弱電平面', '防災平面',
    '系統図', '盤図', '器具表・機器リスト', '結線図',
  ],
  その他: [],
};

// 縮尺設定の対象になる「平面図」種別。
export const PLAN_DRAWING_TYPES: DrawingType[] = ['電灯平面', 'コンセント平面', '動力平面', '弱電平面', '防災平面'];

// ステップ5: 平面図の拾い出しは、この順番で1種類ずつ進める(固定)。
export const PICKUP_CATEGORIES = [
  '機器',
  '照明',
  'スイッチ',
  'コンセント',
  '動力機器',
  '弱電・防災',
  '貫通・スリーブ・配管',
] as const;
export type PickupCategory = (typeof PICKUP_CATEGORIES)[number];

export interface ScaleCheck {
  /** 検算に使った2点間の実寸入力値(mm) */
  actualMm: number;
  /** 既に設定済みの縮尺で算出した2点間の距離(mm) */
  measuredMm: number;
  /** 誤差(%)。0に近いほど良い。 */
  errorPercent: number;
}

export interface DrawingPage {
  id: string;
  fileName: string;
  /** このページのPDFデータ(元ファイル内でのページ番号、1始まり) */
  pageNumberInFile: number;
  /** 元PDFファイルのバイト列を保持するファイルID(state.filesに対応) */
  fileId: string;
  drawingType: DrawingType | null;
  rotation: 0 | 90 | 180 | 270;
  /** サムネイル画像(data URL)。表示用にキャッシュ。 */
  thumbnailDataUrl?: string;
  /** 縮尺(mm/px)。2点クリック+実寸入力から算出。 */
  scaleMmPerPx?: number;
  /** 別の寸法線での検算結果(直近1回分)。 */
  scaleCheck?: ScaleCheck | null;
}

export interface StoredFile {
  id: string;
  name: string;
  /** ArrayBufferをBase64化して保存(案件ファイルのJSON化のため) */
  dataBase64: string;
}

export interface MissingDrawingNote {
  drawingType: DrawingType;
  /** true = 提出図面に無いことを確認済み */
  confirmedAbsent: boolean;
}

export interface ProjectInfo {
  name: string;
  buildingType: BuildingType | null;
  floors: number | null;
  floorAreaM2: number | null;
}

export interface Project {
  info: ProjectInfo;
  files: StoredFile[];
  pages: DrawingPage[];
  missingDrawings: MissingDrawingNote[];
  createdAt: string;
  updatedAt: string;

  // ---- ステップ1以降(v1で拡充) ----
  legends: LegendEntry[];
  notes: NoteEntry[];
  /** 「支給品・別途」に該当するものがこの案件にあるか(注記から確認した結果)。 */
  suppliedOrExcluded: 'あり' | 'なし' | null;

  // ---- ステップ2 ----
  circuits: CircuitEntry[];
  boards: BoardEntry[];
  receivingInfo: ReceivingInfo;

  // ---- ステップ3 ----
  correctCounts: CorrectCountEntry[];
  /** 器具表・機器リストがこの案件に無いことを確認済み */
  noFixtureList: boolean;

  // ---- ステップ4 ----
  wireListEntries: WireListEntry[];
  /** 結線図・ケーブルリストがこの案件に無いことを確認済み */
  noWireList: boolean;

  // ---- ステップ5 ----
  pickupParts: PickupPart[];
  pickupMarkers: PickupMarker[];
  roomRects: RoomRect[];
  categoryProgress: CategoryProgress[];

  // ---- ステップ6 ----
  wireTraces: WireTrace[];
}

export interface LegendEntry {
  id: string;
  symbolLabel: string;
  materialName: string;
  category: string;
  layer: string;
  /** ステップ5の拾い出しカテゴリのどれに対応するか(0件チェックに使う)。未設定ならnull。 */
  pickupCategory: PickupCategory | null;
}

export type NoteCategory = '配線方式' | '支給品・別途' | '壁仕様' | '参照図面';

export interface NoteEntry {
  id: string;
  pageId: string | null;
  text: string;
  categories: NoteCategory[];
}

export type CircuitKind = '一般' | '専用' | '動力' | '幹線';

export interface CircuitEntry {
  id: string;
  boardId: string;
  circuitNo: string;
  circuitName: string;
  floor: string;
  voltage: string;
  breakerCapacity: string;
  kind: CircuitKind;
  wiringMethod: string;
  lengthNoted: '記載あり' | '記載なし' | null;
  traceStatus: 'トレース済み' | '長さ入力済み' | '要確認' | null;
  /** 図面に長さが直接記載されている場合の直接入力値(m)。traceStatus='長さ入力済み'の根拠。 */
  directLengthM: number | null;
  /** 直接入力値の出典ページ(pages[].id)。どの図面のどこに書いてあったかを追える。 */
  directLengthSourcePageId: string | null;
}

export type BoardType = '分電盤' | '動力盤' | '制御盤' | '情報分電盤';

export interface BoardEntry {
  id: string;
  name: string;
  type: BoardType;
}

export interface ReceivingInfo {
  method: '低圧' | '高圧' | null;
  hasWattHourMeter: boolean;
  mainBreaker: string;
  /** 非住宅のみ:幹線ケーブル種別 */
  mainCableType: string;
  /** 非住宅のみ:ケーブルラック・電線管の有無 */
  cableRackOrConduit: 'あり' | 'なし' | '不明' | null;
}

export type SupplyCategory = '本工事' | '支給品' | '別途工事';
export const SUPPLY_CATEGORIES: SupplyCategory[] = ['本工事', '支給品', '別途工事'];

/**
 * 設計者が確定させた"正解"の数量(器具表・機器リスト、または平面図の室名枠から)。
 * ステップ5で拾った数と自動照合するための基準値になる。
 */
export interface CorrectCountEntry {
  id: string;
  symbolLabel: string;
  materialName: string;
  floor: string;
  room: string;
  quantity: number;
  /** 仕様(W数・型番など) */
  spec: string;
  supplyCategory: SupplyCategory;
  /** 常識チェックで検出された食い違いの理由。無ければnull。 */
  flagReason: string | null;
}

interface CommonSenseRule {
  nameKeyword: string;
  specPattern: RegExp;
  reason: string;
}

const COMMON_SENSE_RULES: CommonSenseRule[] = [
  { nameKeyword: 'ペンダント', specPattern: /1灯/, reason: 'ペンダントで「1灯」相当は仕様と数が食い違っている可能性があります' },
  { nameKeyword: '階段', specPattern: /3灯|三灯/, reason: '階段灯で「3灯」は仕様と数が食い違っている可能性があります' },
];

/** 名称と仕様の簡単な語句一致チェック。食い違いがあれば理由文字列を返す。 */
export function checkCommonSense(materialName: string, spec: string): string | null {
  for (const rule of COMMON_SENSE_RULES) {
    if (materialName.includes(rule.nameKeyword) && rule.specPattern.test(spec)) {
      return rule.reason;
    }
  }
  return null;
}

/**
 * 結線図・ケーブルリストの1行。平面図より先に、部材を1つずつ並べた図があるなら
 * それを使う(ステップ4)。プレハブ配線(ユニットケーブル等)は長さを持たず、
 * セット一式の発注仕様として扱う。
 */
export interface WireListEntry {
  id: string;
  rowNo: string;
  material: string;
  name: string;
  cableType: string;
  /** プレハブ(セット一式)扱いの場合はnull */
  lengthM: number | null;
  isPrefab: boolean;
  grounded: boolean;
  threeWay: boolean;
  note: string;
}

/**
 * ステップ5で拾う「部材」。カテゴリ内で選んでクリック→マーカーを置く対象。
 * legendIdが設定されているものは、ステップ1の凡例から自動生成された部材で、
 * カテゴリ完了時の0件チェック対象になる。ユーザーが自由に追加した部材は
 * legendId=nullで、0件チェック対象にはならない。
 */
export interface PickupPart {
  id: string;
  category: PickupCategory;
  name: string;
  color: string;
  legendId: string | null;
}

export interface PickupMarker {
  id: string;
  pageId: string;
  partId: string;
  x: number;
  y: number;
  roomId: string | null;
  /** 口数 */
  gangCount: number | null;
  grounded: boolean;
  waterproof: boolean;
  threeWay: boolean;
  needsCheckReason: string | null;
}

export interface RoomRect {
  id: string;
  pageId: string;
  floor: string;
  room: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type CategoryStatus = '未着手' | '完了' | '該当なし';

export interface ZeroCountDecision {
  legendId: string;
  decision: '該当なし' | '見落とし';
}

export interface CategoryProgress {
  category: PickupCategory;
  status: CategoryStatus;
  zeroCountDecisions: ZeroCountDecision[];
}

export function defaultCategoryProgress(): CategoryProgress[] {
  return PICKUP_CATEGORIES.map((category) => ({ category, status: '未着手' as CategoryStatus, zeroCountDecisions: [] }));
}

export type TraceType = '配線' | '電線管' | 'ケーブルラック';

/**
 * ステップ6: 1回路につき1本のなぞり線(平面図上の折れ線)。
 * 配線が重なる箇所では、回路ごとに別々のWireTraceとして同じ座標付近を
 * 何度もなぞることになる想定(意図的に非統合・非重複除去)。
 * 回路一覧側で色分け表示することで、重なっていても区別できるようにする。
 */
export interface WireTrace {
  id: string;
  circuitId: string;
  pageId: string;
  traceType: TraceType;
  /** キャンバス座標(px, SCALE=1.5基準)の折れ線の頂点列。 */
  points: { x: number; y: number }[];
  /** 折れ線から縮尺換算した実長(m)。 */
  baseLenM: number;
  /** 立上り・引下げなど、平面上には現れない加算長(m)。+階高/+天井高/+出だしのプリセットボタンで積み増す。 */
  riserM: number;
  /** 余長率(%)。0〜。 */
  extraPercent: number;
  note: string;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(prefix: string): string {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function emptyProject(): Project {
  const t = nowIso();
  return {
    info: { name: '', buildingType: null, floors: null, floorAreaM2: null },
    files: [],
    pages: [],
    missingDrawings: [],
    createdAt: t,
    updatedAt: t,
    legends: [],
    notes: [],
    suppliedOrExcluded: null,
    circuits: [],
    boards: [],
    receivingInfo: { method: null, hasWattHourMeter: false, mainBreaker: '', mainCableType: '', cableRackOrConduit: null },
    correctCounts: [],
    noFixtureList: false,
    wireListEntries: [],
    noWireList: false,
    pickupParts: [],
    pickupMarkers: [],
    roomRects: [],
    categoryProgress: defaultCategoryProgress(),
    wireTraces: [],
  };
}
