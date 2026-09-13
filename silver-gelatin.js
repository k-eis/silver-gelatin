// ── Silver Gelatin エフェクトエンジン（k-eis DESIGN FILTER 006・Tone Prism(005)に続く公開作品）
// 白黒写真だけが持つ、伝統的な暗室の語彙を扱う8系統のパラメータ:
// 01 FILTER       → 撮影時の色フィルター（赤・黄・緑・オレンジ）。空の濃淡や肌の質感が変わる
// 02 TONAL CURVE  → 階調構造（BLACK/SHADOW/MIDTONE/HIGHLIGHT/WHITEの5点カーブ）
// 03 PAPER GRADE  → 印画紙のコントラスト（軟調0号〜硬調5号相当）
// 04 GRAIN        → フィルムの粒子
// 05 DETAIL       → 解像感（アンシャープマスク）
// 06 TONE         → 調色（セピア・セレニウム・シアノタイプ）
// 07 DODGE&BURN   → 覆い焼き・焼き込み（中心を明るく、周辺を暗く）
// 08 LIGHT LEAK   → 光線引き込み（白の滲み。PATTERN:円形/上下左右のグラデーション、POSITION、RANGEを調整可能）
//
// CAMERA・FILM STOCK・PAPER TYPEは独立した3つの軸で、それぞれ掛け合わせて使える
//   CAMERA     → FILTER/TONAL CURVE(HIGHLIGHT・WHITE)/DETAIL/PAPER GRADE/DODGE&BURN/LIGHT LEAKを担当
//                Leica M Monochrom / Ricoh GR / Canon 7 Dream Lens / Nikon FM2 / Holga
//   FILM STOCK → TONAL CURVE(BLACK・SHADOW・MIDTONE)/GRAIN(量・粒の大きさ)を担当
//                Kodak Tri-X 400 / Ilford HP5 Plus / Ilford Delta 100
//   PAPER TYPE → PAPER GRADE/GRAIN/TONE/DODGE&BURNを、印画紙の"仕上げ"として最後に乗せる
//                Fiber Base / Lith Print
//
// パッチ（CAMERA/FILM STOCK/PAPER TYPE）切替時は自動でCOMPARE MODEが働き、
// 旧設定→新設定を2秒ずつ交互表示する（連打時は前の表示を即キャンセル）

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const outputCanvas = document.getElementById('outputCanvas');
const canvasBadge = document.getElementById('canvasBadge');
const ctx = outputCanvas.getContext('2d');

const filterStrengthSlider = document.getElementById('filterStrength');
const tcBlackSlider = document.getElementById('tcBlack');
const tcShadowSlider = document.getElementById('tcShadow');
const tcMidtoneSlider = document.getElementById('tcMidtone');
const tcHighlightSlider = document.getElementById('tcHighlight');
const tcWhiteSlider = document.getElementById('tcWhite');
const paperGradeSlider = document.getElementById('paperGrade');
const grainSlider = document.getElementById('grain');
const detailSlider = document.getElementById('detail');
const toneStrengthSlider = document.getElementById('toneStrength');
const dodgeBurnSlider = document.getElementById('dodgeBurn');
const lightLeakSlider = document.getElementById('lightLeak');
const lightLeakPosXSlider = document.getElementById('lightLeakPosX');
const lightLeakPosYSlider = document.getElementById('lightLeakPosY');
const lightLeakRangeSlider = document.getElementById('lightLeakRange');
const lightLeakPatternBtns = document.querySelectorAll('#lightLeakPatternGrid .select-btn');

const filterStrengthVal = document.getElementById('filterStrengthVal');
const tcBlackVal = document.getElementById('tcBlackVal');
const tcShadowVal = document.getElementById('tcShadowVal');
const tcMidtoneVal = document.getElementById('tcMidtoneVal');
const tcHighlightVal = document.getElementById('tcHighlightVal');
const tcWhiteVal = document.getElementById('tcWhiteVal');
const paperGradeVal = document.getElementById('paperGradeVal');
const grainVal = document.getElementById('grainVal');
const detailVal = document.getElementById('detailVal');
const toneStrengthVal = document.getElementById('toneStrengthVal');
const dodgeBurnVal = document.getElementById('dodgeBurnVal');
const lightLeakVal = document.getElementById('lightLeakVal');
const lightLeakPosXVal = document.getElementById('lightLeakPosXVal');
const lightLeakPosYVal = document.getElementById('lightLeakPosYVal');
const lightLeakRangeVal = document.getElementById('lightLeakRangeVal');

const filterBtns = document.querySelectorAll('#filterGrid .select-btn');
const toneBtns = document.querySelectorAll('#toneGrid .select-btn');
const freeModeToggle = document.getElementById('freeModeToggle');
const compareModeToggle = document.getElementById('compareModeToggle');
const cameraBtns = document.querySelectorAll('#cameraGrid .select-btn');
const filmBtns = document.querySelectorAll('#filmGrid .select-btn');
const paperTypeBtns = document.querySelectorAll('#paperTypeGrid .select-btn');

const downloadBtn = document.getElementById('downloadBtn');
const resetBtn = document.getElementById('resetBtn');

let currentFilter = 'none';
let currentTone = 'none';
let currentGrainSize = 1; // FILM STOCKの粒の大きさ（1=最も細かい/デジタル的、大きいほど粗い有機的な粒に）
let currentLeakPattern = 'circular'; // LIGHT LEAKの形状（circular/top/bottom/left/right）
let currentCameraKey = 'none';
let currentFilmKey = 'none';
let currentPaperTypeKey = 'standard';
let compareTimers = [];
let originalImage = null;
let originalImageData = null;
let previewImageData = null;
let isDragging = false;

// ── フィルターの重み（伝統的な白黒撮影フィルター。赤/黄/緑/オレンジ）
const FILTER_WEIGHTS = {
  none:   [0.299, 0.587, 0.114],
  yellow: [0.35, 0.55, 0.10],
  orange: [0.50, 0.40, 0.10],
  red:    [0.70, 0.20, 0.10],
  green:  [0.20, 0.70, 0.10],
};

// ── 調色の色味（セピア・セレニウム・シアノタイプ）
const TONE_COLORS = {
  none:     null,
  sepia:    [112, 66, 20],   // 暖かい琥珀色
  selenium: [60, 30, 70],    // 冷たい紫がかった色
  cyano:    [10, 50, 110],   // 青写真のような青
};

// ── ファイル読み込み
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) loadFile(file);
});
fileInput.addEventListener('change', (e) => { if (e.target.files[0]) loadFile(e.target.files[0]); });

function loadFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      originalImage = img;
      setupCanvas(img);
      applySilverGelatin();
      dropZone.style.display = 'none';
      canvasBadge.style.display = 'block';
      outputCanvas.style.display = 'block';
      downloadBtn.disabled = false;
      resetBtn.disabled = false;
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function setupCanvas(img) {
  const MAX_W = 900;
  let w = img.width, h = img.height;
  if (w > MAX_W) { h = h * (MAX_W / w); w = MAX_W; }
  outputCanvas.width = w;
  outputCanvas.height = h;
  ctx.drawImage(img, 0, 0, w, h);
  originalImageData = ctx.getImageData(0, 0, w, h);

  const PREVIEW_MAX_W = 320;
  const pScale = Math.min(1, PREVIEW_MAX_W / w);
  const pw = Math.max(1, Math.round(w * pScale));
  const ph = Math.max(1, Math.round(h * pScale));
  const pCanvas = document.createElement('canvas');
  pCanvas.width = pw; pCanvas.height = ph;
  const pCtx = pCanvas.getContext('2d');
  pCtx.drawImage(img, 0, 0, pw, ph);
  previewImageData = pCtx.getImageData(0, 0, pw, ph);
}

let driftRAF = null;
function requestApply() {
  if (driftRAF) cancelAnimationFrame(driftRAF);
  driftRAF = requestAnimationFrame(() => {
    driftRAF = null;
    if (isDragging) {
      applySilverGelatin(true);
    } else {
      canvasBadge.textContent = '処理中… PROCESSING';
      canvasBadge.style.display = 'block';
      setTimeout(() => {
        applySilverGelatin(false);
        canvasBadge.textContent = 'PREVIEW';
      }, 10);
    }
  });
}

// ── TONAL CURVE：BLACK/SHADOW/MIDTONE/HIGHLIGHT/WHITEの5点をCatmull-Romで滑らかに繋ぎ、
//    輝度0〜255に対応する256エントリのルックアップテーブルを作る
function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (
    (2 * p1) +
    (-p0 + p2) * t +
    (2*p0 - 5*p1 + 4*p2 - p3) * t2 +
    (-p0 + 3*p1 - 3*p2 + p3) * t3
  );
}

function buildToneCurveLUT(black, shadow, midtone, highlight, white) {
  const anchorsX = [0, 64, 128, 191, 255];
  const amp = [50, 60, 70, 60, 50]; // 中間ほど大きく動く、両端は控えめ
  const vals = [black, shadow, midtone, highlight, white];
  const anchorsY = vals.map((v, i) => {
    const y = anchorsX[i] + (v - 50) / 50 * amp[i];
    return Math.max(0, Math.min(255, y));
  });

  const n = anchorsX.length;
  const extY = [anchorsY[0], ...anchorsY, anchorsY[n - 1]];

  const lut = new Uint8ClampedArray(256);
  let seg = 0;
  for (let x = 0; x <= 255; x++) {
    while (seg < n - 2 && x > anchorsX[seg + 1]) seg++;
    const x0 = anchorsX[seg], x1 = anchorsX[seg + 1];
    const t = (x1 - x0) === 0 ? 0 : (x - x0) / (x1 - x0);
    lut[x] = catmullRom(extY[seg], extY[seg + 1], extY[seg + 2], extY[seg + 3], t);
  }
  return lut;
}

// ── CAMERA：センサー・JPEGエンジンの個性（FILTER/TONAL CURVEのHIGHLIGHT・WHITE/DETAIL/PAPER GRADE/DODGE&BURN）
// ── FILM STOCK：フィルム乳剤の個性（TONAL CURVEのBLACK・SHADOW・MIDTONE/GRAINの量と粒の大きさ）
// カメラとフィルムは別々のパラメータ群を担当するので、掛け合わせて使える
const CAMERAS = {
  none: {
    filter: 'none', filterStrength: 70,
    tc: { highlight: 50, white: 50 },
    detail: 25, paperGrade: 50, dodgeBurn: 25, lightLeak: 0
  },
  // Leica M Monochrom：カラーフィルターアレイのない専用センサー。撮って出しは黒が浅め・
  // ハイライトが飛びやすく"おとなしい"（後処理で生きる）のが実機レビューでの評価
  leicaMMono: {
    filter: 'yellow', filterStrength: 20,
    tc: { highlight: 44, white: 45 },
    detail: 65, paperGrade: 48, dodgeBurn: 10, lightLeak: 0
  },
  // Ricoh GR：シャドウを潰しハイライトで魅せる"ハイコントラスト白黒"設定が定番。
  // シャープネス・クラリティ・周辺減光（Shading）を強めに焼き込むスナップシューター的な硬さ
  ricohGR: {
    filter: 'red', filterStrength: 20,
    tc: { highlight: 52, white: 50 },
    detail: 55, paperGrade: 55, dodgeBurn: 42, lightLeak: 0
  },
  // Canon 7 + 50mm f/0.95「ドリームレンズ」：開放時は球面収差由来のもや・コントラスト低下と
  // グロウが持ち味だが、複数のレビューで「中心はきちんとシャープ」と一貫していたため、
  // 解像感そのものは大きく削らず、もや・低コントラスト・強めの周辺減光で個性を表現
  dreamLens: {
    filter: 'none', filterStrength: 0,
    tc: { highlight: 45, white: 44 },
    detail: 42, paperGrade: 48, dodgeBurn: 45, lightLeak: 0
  },
  // Nikon FM2 + Nikkor 50mm：突出した個性がないことこそが個性の、標準35mm一眼レフ。
  // 中心・周辺ともに高いシャープネス、素直な階調が実機レビューで一貫していた
  fm2: {
    filter: 'yellow', filterStrength: 25,
    tc: { highlight: 50, white: 50 },
    detail: 45, paperGrade: 50, dodgeBurn: 15, lightLeak: 0
  },
  // Holga：プラスチックのメニスカスレンズによる、画面全体が均一に甘いソフトフォーカス。
  // Dream Lensとは違い"中心も含めて総崩れ"、トンネル状の強い周辺減光が特徴。
  // LIGHT LEAKもHolgaだけの個性として持たせるが、実機では「たまに起きる」不意打ち的な現象で
  // 毎回強く出るものではないため、控えめな強さ・やや黄味寄りの色に調整
  holga: {
    filter: 'none', filterStrength: 0,
    tc: { highlight: 54, white: 52 },
    detail: 3, paperGrade: 58, dodgeBurn: 80, lightLeak: 12
  }
};

const FILM_STOCKS = {
  none: {
    tc: { black: 50, shadow: 50, midtone: 50 },
    grain: 20, grainSize: 1
  },
  // Kodak Tri-X 400：豊かな黒、コントラストの強い中間調、独特の有機的な粒状感
  triX400: {
    tc: { black: 48, shadow: 42, midtone: 54 },
    grain: 55, grainSize: 1.8
  },
  // Ilford HP5 Plus：Tri-Xより中間調で控えめ、黒の締まりも穏やかで、粒はやや細かいが
  // Tri-Xほどキレのある解像感ではない、柔らかい印象の乳剤
  hp5Plus: {
    tc: { black: 53, shadow: 55, midtone: 50 },
    grain: 35, grainSize: 1.4
  },
  // Ilford Delta 100：モダンなT粒子（Core-Shell）で極めて微粒子・高解像、
  // 黒は締まりつつディテールを残す、クリーンな乳剤
  delta100: {
    tc: { black: 46, shadow: 48, midtone: 50 },
    grain: 15, grainSize: 1
  }
};

// ── COMPARE MODE：パッチ切替時に旧設定→新設定を2秒ずつ交互表示する。連打時は前の表示を即キャンセル
function clearCompareTimers() {
  compareTimers.forEach(id => clearTimeout(id));
  compareTimers = [];
}

function getAllParams() {
  return {
    filter: currentFilter, filterStrength: filterStrengthSlider.value,
    tcBlack: tcBlackSlider.value, tcShadow: tcShadowSlider.value, tcMidtone: tcMidtoneSlider.value,
    tcHighlight: tcHighlightSlider.value, tcWhite: tcWhiteSlider.value,
    paperGrade: paperGradeSlider.value, grain: grainSlider.value, grainSize: currentGrainSize,
    detail: detailSlider.value,
    tone: currentTone, toneStrength: toneStrengthSlider.value,
    dodgeBurn: dodgeBurnSlider.value, lightLeak: lightLeakSlider.value
  };
}

// ── 共通ヘルパー：スライダーと表示ラベルを1行で更新する（Optical Lineageで使った書き方を移植）
function setSlider(slider, valEl, value, display) {
  slider.value = value;
  valEl.textContent = (display !== undefined) ? display : value + '%';
}
function paperGradeLabel(pg) {
  return pg===50 ? '中間（2号相当）' : (pg<50 ? `軟調-${50-pg}` : `硬調+${pg-50}`);
}

function setAllParams(p) {
  currentFilter = p.filter;
  filterBtns.forEach(b => b.classList.toggle('active', b.dataset.filter === p.filter));
  setSlider(filterStrengthSlider, filterStrengthVal, p.filterStrength);

  setSlider(tcBlackSlider, tcBlackVal, p.tcBlack);
  setSlider(tcShadowSlider, tcShadowVal, p.tcShadow);
  setSlider(tcMidtoneSlider, tcMidtoneVal, p.tcMidtone);
  setSlider(tcHighlightSlider, tcHighlightVal, p.tcHighlight);
  setSlider(tcWhiteSlider, tcWhiteVal, p.tcWhite);

  setSlider(paperGradeSlider, paperGradeVal, p.paperGrade, paperGradeLabel(parseInt(p.paperGrade)));

  setSlider(grainSlider, grainVal, p.grain);
  currentGrainSize = p.grainSize;

  setSlider(detailSlider, detailVal, p.detail);

  currentTone = p.tone;
  toneBtns.forEach(b => b.classList.toggle('active', b.dataset.tone === p.tone));
  setSlider(toneStrengthSlider, toneStrengthVal, p.toneStrength);

  setSlider(dodgeBurnSlider, dodgeBurnVal, p.dodgeBurn);
  setSlider(lightLeakSlider, lightLeakVal, p.lightLeak);
}

function runCompare(oldParams, newParams) {
  clearCompareTimers();
  if (!originalImageData) {
    setAllParams(newParams);
    return;
  }

  // まず新設定を即座に反映（体感速度優先）
  setAllParams(newParams);
  canvasBadge.style.display = 'none';
  applySilverGelatin(false);

  if (!compareModeToggle.checked) return; // OFF：ここで終了、比較演出はなし

  // ON：0.5秒後から、変更前後を2秒ずつ・計10往復交互表示してから新設定に落ち着く
  const maxCycles = 10;
  let cycle = 0;

  function showOld() {
    setAllParams(oldParams);
    canvasBadge.textContent = 'BEFORE';
    canvasBadge.style.display = 'block';
    applySilverGelatin(false);
    const t = setTimeout(showNew, 2000);
    compareTimers.push(t);
  }
  function showNew() {
    setAllParams(newParams);
    canvasBadge.textContent = 'AFTER';
    canvasBadge.style.display = 'block';
    applySilverGelatin(false);
    cycle++;
    if (cycle < maxCycles) {
      const t = setTimeout(showOld, 2000);
      compareTimers.push(t);
    } else {
      const t = setTimeout(() => { canvasBadge.style.display = 'none'; }, 500);
      compareTimers.push(t);
    }
  }

  const t0 = setTimeout(showOld, 500);
  compareTimers.push(t0);
}

function applyCameraFieldsOnly(c) {
  currentFilter = c.filter;
  filterBtns.forEach(b => b.classList.toggle('active', b.dataset.filter === c.filter));
  setSlider(filterStrengthSlider, filterStrengthVal, c.filterStrength);

  setSlider(tcHighlightSlider, tcHighlightVal, c.tc.highlight);
  setSlider(tcWhiteSlider, tcWhiteVal, c.tc.white);

  setSlider(detailSlider, detailVal, c.detail);

  setSlider(paperGradeSlider, paperGradeVal, c.paperGrade, paperGradeLabel(c.paperGrade));

  setSlider(dodgeBurnSlider, dodgeBurnVal, c.dodgeBurn);
  setSlider(lightLeakSlider, lightLeakVal, c.lightLeak);
}

function applyFilmFieldsOnly(f) {
  setSlider(tcBlackSlider, tcBlackVal, f.tc.black);
  setSlider(tcShadowSlider, tcShadowVal, f.tc.shadow);
  setSlider(tcMidtoneSlider, tcMidtoneVal, f.tc.midtone);

  setSlider(grainSlider, grainVal, f.grain);
  currentGrainSize = f.grainSize;
}

function applyPaperFieldsOnly(p) {
  const film = FILM_STOCKS[currentFilmKey] || FILM_STOCKS.none;
  const camera = CAMERAS[currentCameraKey] || CAMERAS.none;

  if (p.paperGrade !== undefined) {
    setSlider(paperGradeSlider, paperGradeVal, p.paperGrade, paperGradeLabel(p.paperGrade));
  }

  if (p.grain !== undefined) { setSlider(grainSlider, grainVal, p.grain); }
  else { setSlider(grainSlider, grainVal, film.grain); }

  if (p.grainSize !== undefined) { currentGrainSize = p.grainSize; }
  else { currentGrainSize = film.grainSize; }

  if (p.tone !== undefined) {
    currentTone = p.tone;
    toneBtns.forEach(b => b.classList.toggle('active', b.dataset.tone === p.tone));
  } else {
    currentTone = 'none';
    toneBtns.forEach(b => b.classList.toggle('active', b.dataset.tone === 'none'));
  }

  if (p.toneStrength !== undefined) { setSlider(toneStrengthSlider, toneStrengthVal, p.toneStrength); }
  else { setSlider(toneStrengthSlider, toneStrengthVal, 0); }

  if (p.dodgeBurn !== undefined) { setSlider(dodgeBurnSlider, dodgeBurnVal, p.dodgeBurn); }
  else { setSlider(dodgeBurnSlider, dodgeBurnVal, camera.dodgeBurn); }
}

// ── STANDARD MODE（FREE MODE OFF）：各パッチは自分の担当範囲だけ更新。
// ただしCAMERAの「Original」だけは特別で、押すと全軸がオリジナル画像の状態に戻る。
// FREE MODE：普段は自分の担当範囲だけ更新（他軸の手動調整は保持）。
// ただし"すでに選ばれているパッチ"をもう一度押すと、他の2軸をニュートラルに戻した上で
// そのパッチだけを効かせる（＝そのパッチだけを選んだ状態に全体をリセット）
function applyCamera(key) {
  const c = CAMERAS[key];
  if (!c) return;
  const oldParams = getAllParams();
  const wasActive = (key === currentCameraKey);

  if (!freeModeToggle.checked) {
    if (key === 'none') {
      currentCameraKey = 'none'; currentFilmKey = 'none'; currentPaperTypeKey = 'standard';
      applyFullSnapFields();
    } else {
      currentCameraKey = key;
      applyCameraFieldsOnly(c);
    }
  } else {
    if (wasActive) {
      currentCameraKey = key; currentFilmKey = 'none'; currentPaperTypeKey = 'standard';
      applyFullSnapFields();
    } else {
      currentCameraKey = key;
      applyCameraFieldsOnly(c);
    }
  }

  runCompare(oldParams, getAllParams());
}

function applyFilm(key) {
  const f = FILM_STOCKS[key];
  if (!f) return;
  const oldParams = getAllParams();
  const wasActive = (key === currentFilmKey);

  if (!freeModeToggle.checked) {
    currentFilmKey = key;
    applyFilmFieldsOnly(f);
  } else {
    if (wasActive) {
      currentFilmKey = key; currentCameraKey = 'none'; currentPaperTypeKey = 'standard';
      applyFullSnapFields();
    } else {
      currentFilmKey = key;
      applyFilmFieldsOnly(f);
    }
  }

  runCompare(oldParams, getAllParams());
}

// ── PAPER TYPE：印画紙そのものの個性。TONAL CURVEはCAMERA/FILM STOCKが担当済みなので触らず、
// PAPER GRADE（コントラスト）・GRAIN・TONE・DODGE&BURNだけを、指定されたフィールドがある時だけ上書きする
// （＝暗室の最終工程として、カメラ/フィルムの設定の上から"仕上げ"を乗せるイメージ）。
// フィールドを指定しないpaper typeは、そこを触らず"今選ばれているCAMERA/FILM STOCKの値"に戻す
// （Lith Printで上書きしたgrain/tone/dodgeBurnが標準やFiber Baseに切り替えても残り続けるのを防ぐため）
const PAPER_TYPES = {
  standard: { paperGrade: 50 },
  // Fiber Base：深い黒・豊かな階調分離が持ち味の高級印画紙
  fiberBase: { paperGrade: 58 },
  // Lith Print：infectious developmentという現象で、ハイライト〜中間調は柔らかく暖色、
  // シャドウだけ冷たく粒子が荒くコントラストが強い、という明暗で質感が分裂する特殊技法。
  // TONEは全体に均一にしかかけられないので「ハイライトだけ暖色」は簡略化して弱めのSepiaで近似
  lith: { paperGrade: 88, grain: 70, grainSize: 2.2, tone: 'sepia', toneStrength: 30, dodgeBurn: 45 }
};

// ── FREE MODEがOFF（デフォルト）の時、CAMERAの「Original」やFREE MODEでの
// ダブルクリック的リセットで使う。CAMERA/FILM STOCK/PAPER TYPEの現在選択中3つをまとめて再適用する
function applyFullSnapFields() {
  const c = CAMERAS[currentCameraKey] || CAMERAS.none;
  const f = FILM_STOCKS[currentFilmKey] || FILM_STOCKS.none;
  const p = PAPER_TYPES[currentPaperTypeKey] || PAPER_TYPES.standard;

  applyCameraFieldsOnly(c);
  applyFilmFieldsOnly(f);
  applyPaperFieldsOnly(p);
}

function applyPaperType(key) {
  const p = PAPER_TYPES[key];
  if (!p) return;
  const oldParams = getAllParams();
  const wasActive = (key === currentPaperTypeKey);

  if (!freeModeToggle.checked) {
    currentPaperTypeKey = key;
    applyPaperFieldsOnly(p);
  } else {
    if (wasActive) {
      currentPaperTypeKey = key; currentCameraKey = 'none'; currentFilmKey = 'none';
      applyFullSnapFields();
    } else {
      currentPaperTypeKey = key;
      applyPaperFieldsOnly(p);
    }
  }

  runCompare(oldParams, getAllParams());
}

cameraBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    cameraBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    applyCamera(btn.dataset.camera);
  });
});

filmBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    filmBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    applyFilm(btn.dataset.film);
  });
});

paperTypeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    paperTypeBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    applyPaperType(btn.dataset.paperType);
  });
});

// ── 決定論的な擬似ランダム（GRAINに使用）
function pseudoRandom2D(x, y) {
  const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

// ── スライディングウィンドウのボックスブラー（半径によらず高速）
function boxBlur(data, w, h, radius) {
  if (radius < 1) return data.slice();
  const r = Math.max(1, Math.round(radius));
  const temp = new Float32Array(data.length);
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    let sr=0, sg=0, sb=0, sa=0;
    for (let k = -r; k <= r; k++) {
      const sx = k < 0 ? 0 : (k >= w ? w - 1 : k);
      const i = row + sx*4;
      sr += data[i]; sg += data[i+1]; sb += data[i+2]; sa += data[i+3];
    }
    const count = 2*r + 1;
    temp[row] = sr/count; temp[row+1] = sg/count; temp[row+2] = sb/count; temp[row+3] = sa/count;
    for (let x = 1; x < w; x++) {
      const addX = (x+r) >= w ? w-1 : x+r;
      const remX = (x-1-r) < 0 ? 0 : x-1-r;
      const ai = row + addX*4, ri = row + remX*4;
      sr += data[ai] - data[ri]; sg += data[ai+1] - data[ri+1]; sb += data[ai+2] - data[ri+2]; sa += data[ai+3] - data[ri+3];
      const oi = row + x*4;
      temp[oi] = sr/count; temp[oi+1] = sg/count; temp[oi+2] = sb/count; temp[oi+3] = sa/count;
    }
  }
  for (let x = 0; x < w; x++) {
    let sr=0, sg=0, sb=0, sa=0;
    for (let k = -r; k <= r; k++) {
      const sy = k < 0 ? 0 : (k >= h ? h - 1 : k);
      const i = (sy*w+x)*4;
      sr += temp[i]; sg += temp[i+1]; sb += temp[i+2]; sa += temp[i+3];
    }
    const count = 2*r + 1;
    let oi = x*4;
    out[oi] = sr/count; out[oi+1] = sg/count; out[oi+2] = sb/count; out[oi+3] = sa/count;
    for (let y = 1; y < h; y++) {
      const addY = (y+r) >= h ? h-1 : y+r;
      const remY = (y-1-r) < 0 ? 0 : y-1-r;
      const ai = (addY*w+x)*4, ri = (remY*w+x)*4;
      sr += temp[ai] - temp[ri]; sg += temp[ai+1] - temp[ri+1]; sb += temp[ai+2] - temp[ri+2]; sa += temp[ai+3] - temp[ri+3];
      oi = (y*w+x)*4;
      out[oi] = sr/count; out[oi+1] = sg/count; out[oi+2] = sb/count; out[oi+3] = sa/count;
    }
  }
  return out;
}

function applySilverGelatin(preview) {
  if (!originalImageData) return;

  const useData = (preview && previewImageData) ? previewImageData : originalImageData;
  const w = useData.width, h = useData.height;
  const radiusScale = preview ? (w / outputCanvas.width) : 1;

  const filterStrength = parseInt(filterStrengthSlider.value) / 100;
  const paperGrade = (parseInt(paperGradeSlider.value) - 50) / 50; // -1(軟調)〜0〜+1(硬調)
  const grain = parseInt(grainSlider.value) / 100;
  const detail = parseInt(detailSlider.value) / 100;
  const toneStrength = parseInt(toneStrengthSlider.value) / 100;
  const dodgeBurn = parseInt(dodgeBurnSlider.value) / 100;

  const toneCurveLUT = buildToneCurveLUT(
    parseInt(tcBlackSlider.value),
    parseInt(tcShadowSlider.value),
    parseInt(tcMidtoneSlider.value),
    parseInt(tcHighlightSlider.value),
    parseInt(tcWhiteSlider.value)
  );

  const src = useData.data;
  let out = new Uint8ClampedArray(src.length);

  // ── STEP 1: FILTER（色被り除去フィルターに基づく輝度変換）+ PAPER GRADE（コントラストカーブ）
  const neutralW = FILTER_WEIGHTS.none;
  const filterW = FILTER_WEIGHTS[currentFilter] || neutralW;
  const wr = neutralW[0] + (filterW[0]-neutralW[0])*filterStrength;
  const wg = neutralW[1] + (filterW[1]-neutralW[1])*filterStrength;
  const wb = neutralW[2] + (filterW[2]-neutralW[2])*filterStrength;
  const gradeFactor = 1 + paperGrade * 1.6;

  for (let i = 0; i < src.length; i += 4) {
    let gray = src[i]*wr + src[i+1]*wg + src[i+2]*wb;
    gray = toneCurveLUT[Math.max(0, Math.min(255, Math.round(gray)))];
    gray = 128 + (gray - 128) * gradeFactor;
    gray = Math.max(0, Math.min(255, gray));
    out[i] = out[i+1] = out[i+2] = gray; out[i+3] = src[i+3];
  }

  // ── STEP 2: DETAIL（アンシャープマスク）
  if (detail > 0.01) {
    const blurred = boxBlur(out, w, h, 1.4 * Math.max(radiusScale, 0.35));
    const next = new Uint8ClampedArray(out.length);
    const amount = detail * 1.2;
    for (let i = 0; i < out.length; i += 4) {
      const v = out[i] + (out[i] - blurred[i]) * amount;
      next[i] = next[i+1] = next[i+2] = v; next[i+3] = out[i+3];
    }
    out = next;
  }

  // ── STEP 3: GRAIN（フィルム粒子。FILM STOCKのgrainSizeで粒の粗さも変える）
  if (grain > 0.01) {
    const seedOff = 6000;
    const gsize = Math.max(1, currentGrainSize);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y*w+x)*4;
        const gx = Math.floor(x / gsize), gy = Math.floor(y / gsize);
        const n = (pseudoRandom2D(gx+seedOff, gy+seedOff) - 0.5) * 2;
        const noise = n * grain * 28;
        const v = out[i] + noise;
        out[i] = out[i+1] = out[i+2] = v;
      }
    }
  }

  // ── STEP 4: DODGE & BURN（中心を明るく覆い焼き、周辺を暗く焼き込む）
  if (dodgeBurn > 0.01) {
    const cx = w/2, cy = h/2, maxDist = Math.sqrt(cx*cx+cy*cy);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const d = Math.sqrt((x-cx)*(x-cx)+(y-cy)*(y-cy)) / maxDist;
        const i = (y*w+x)*4;
        let v = out[i];
        if (d < 0.35) {
          v = v + (0.35 - d) * dodgeBurn * 60; // 中心：覆い焼きで明るく
        } else {
          v = v - Math.max(0, d - 0.5) * dodgeBurn * 90; // 周辺：焼き込みで暗く
        }
        v = Math.max(0, Math.min(255, v));
        out[i] = out[i+1] = out[i+2] = v;
      }
    }
  }

  // ── STEP 5: TONE（調色。セピア・セレニウム・シアノタイプ）
  const toneColor = TONE_COLORS[currentTone];
  if (toneColor && toneStrength > 0.01) {
    for (let i = 0; i < out.length; i += 4) {
      const gray = out[i] / 255;
      const tr = toneColor[0] * gray;
      const tg = toneColor[1] * gray;
      const tb = toneColor[2] * gray;
      out[i]   = out[i]   * (1-toneStrength) + tr * toneStrength;
      out[i+1] = out[i+1] * (1-toneStrength) + tg * toneStrength;
      out[i+2] = out[i+2] * (1-toneStrength) + tb * toneStrength;
    }
  }

  // ── STEP 6: LIGHT LEAK（光線引き込み。パターン・位置・範囲は調整可能、決定論的）
  const lightLeak = parseInt(lightLeakSlider.value) / 100;
  if (lightLeak > 0.01) {
    const leakColor = [255, 255, 255];
    const range = Math.max(0.05, parseInt(lightLeakRangeSlider.value) / 100);

    if (currentLeakPattern === 'circular') {
      const lx = w * (parseInt(lightLeakPosXSlider.value) / 100);
      const ly = h * (parseInt(lightLeakPosYSlider.value) / 100);
      const maxDist = Math.sqrt(w*w + h*h) * range;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const dx = x - lx, dy = y - ly;
          const dist = Math.sqrt(dx*dx + dy*dy) / maxDist;
          const wgt = Math.max(0, 1 - dist);
          if (wgt <= 0) continue;
          const amt = wgt * wgt * wgt * lightLeak;
          const i = (y*w+x)*4;
          out[i]   = out[i]   * (1-amt) + leakColor[0] * amt;
          out[i+1] = out[i+1] * (1-amt) + leakColor[1] * amt;
          out[i+2] = out[i+2] * (1-amt) + leakColor[2] * amt;
        }
      }
    } else {
      // 上/下/左/右からの方向性のあるグラデーション
      const span = (currentLeakPattern === 'top' || currentLeakPattern === 'bottom')
        ? Math.max(4, h * range)
        : Math.max(4, w * range);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let d;
          if (currentLeakPattern === 'top') d = y;
          else if (currentLeakPattern === 'bottom') d = (h - 1 - y);
          else if (currentLeakPattern === 'left') d = x;
          else d = (w - 1 - x); // right
          const wgt = Math.max(0, 1 - d / span);
          if (wgt <= 0) continue;
          const amt = wgt * wgt * lightLeak;
          const i = (y*w+x)*4;
          out[i]   = out[i]   * (1-amt) + leakColor[0] * amt;
          out[i+1] = out[i+1] * (1-amt) + leakColor[1] * amt;
          out[i+2] = out[i+2] * (1-amt) + leakColor[2] * amt;
        }
      }
    }
  }

  const resultData = new ImageData(out, w, h);

  if (preview && previewImageData) {
    let tempCanvas = applySilverGelatin._tempCanvas;
    if (!tempCanvas) { tempCanvas = document.createElement('canvas'); applySilverGelatin._tempCanvas = tempCanvas; }
    tempCanvas.width = w; tempCanvas.height = h;
    tempCanvas.getContext('2d').putImageData(resultData, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(tempCanvas, 0, 0, w, h, 0, 0, outputCanvas.width, outputCanvas.height);
  } else {
    ctx.putImageData(resultData, 0, 0);
  }
}

// ── UIイベント
const allSliders = [filterStrengthSlider, tcBlackSlider, tcShadowSlider, tcMidtoneSlider, tcHighlightSlider, tcWhiteSlider, paperGradeSlider, grainSlider, detailSlider, toneStrengthSlider, dodgeBurnSlider, lightLeakSlider, lightLeakPosXSlider, lightLeakPosYSlider, lightLeakRangeSlider];
allSliders.forEach(slider => {
  slider.addEventListener('pointerdown', () => { isDragging = true; });
  slider.addEventListener('touchstart', () => { isDragging = true; }, { passive: true });
});
function endDrag() {
  if (!isDragging) return;
  isDragging = false;
  requestApply();
}
allSliders.forEach(slider => {
  slider.addEventListener('pointerup', endDrag);
  slider.addEventListener('touchend', endDrag);
  slider.addEventListener('change', endDrag);
});
window.addEventListener('pointerup', () => { if (isDragging) endDrag(); });
window.addEventListener('touchend', () => { if (isDragging) endDrag(); });

filterStrengthSlider.addEventListener('input', () => { filterStrengthVal.textContent = filterStrengthSlider.value + '%'; requestApply(); });
tcBlackSlider.addEventListener('input', () => { tcBlackVal.textContent = tcBlackSlider.value + '%'; requestApply(); });
tcShadowSlider.addEventListener('input', () => { tcShadowVal.textContent = tcShadowSlider.value + '%'; requestApply(); });
tcMidtoneSlider.addEventListener('input', () => { tcMidtoneVal.textContent = tcMidtoneSlider.value + '%'; requestApply(); });
tcHighlightSlider.addEventListener('input', () => { tcHighlightVal.textContent = tcHighlightSlider.value + '%'; requestApply(); });
tcWhiteSlider.addEventListener('input', () => { tcWhiteVal.textContent = tcWhiteSlider.value + '%'; requestApply(); });
paperGradeSlider.addEventListener('input', () => {
  const v = parseInt(paperGradeSlider.value);
  paperGradeVal.textContent = v===50 ? '中間（2号相当）' : (v<50 ? `軟調-${50-v}` : `硬調+${v-50}`);
  requestApply();
});
grainSlider.addEventListener('input', () => { grainVal.textContent = grainSlider.value + '%'; requestApply(); });
detailSlider.addEventListener('input', () => { detailVal.textContent = detailSlider.value + '%'; requestApply(); });
toneStrengthSlider.addEventListener('input', () => { toneStrengthVal.textContent = toneStrengthSlider.value + '%'; requestApply(); });
dodgeBurnSlider.addEventListener('input', () => { dodgeBurnVal.textContent = dodgeBurnSlider.value + '%'; requestApply(); });
lightLeakSlider.addEventListener('input', () => { lightLeakVal.textContent = lightLeakSlider.value + '%'; requestApply(); });
lightLeakPosXSlider.addEventListener('input', () => { lightLeakPosXVal.textContent = lightLeakPosXSlider.value + '%'; requestApply(); });
lightLeakPosYSlider.addEventListener('input', () => { lightLeakPosYVal.textContent = lightLeakPosYSlider.value + '%'; requestApply(); });
lightLeakRangeSlider.addEventListener('input', () => { lightLeakRangeVal.textContent = lightLeakRangeSlider.value + '%'; requestApply(); });
lightLeakPatternBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    lightLeakPatternBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentLeakPattern = btn.dataset.leakPattern;
    requestApply();
  });
});

filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    currentFilter = btn.dataset.filter;
    filterBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    requestApply();
  });
});
toneBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    currentTone = btn.dataset.tone;
    toneBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    requestApply();
  });
});

// ── 保存（iOS対応：オーバーレイ方式）
downloadBtn.addEventListener('click', () => {
  try {
    const dataUrl = outputCanvas.toDataURL('image/png');
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isIOS) {
      showSaveOverlay(dataUrl);
    } else {
      const link = document.createElement('a');
      link.download = 'silver-gelatin.png';
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  } catch (err) {
    console.error('PNG保存に失敗しました:', err);
    alert('画像の保存に失敗しました。ブラウザを再読み込みしてもう一度お試しください。');
  }
});

function showSaveOverlay(dataUrl) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `position: fixed; inset: 0; z-index: 9999; background: rgba(10,10,10,0.96);
    display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; box-sizing: border-box;`;
  const img = document.createElement('img');
  img.src = dataUrl;
  img.style.cssText = 'max-width: 100%; max-height: 75vh; border-radius: 2px;';
  const hint = document.createElement('p');
  hint.innerHTML = '画像を長押しして「写真に保存」を選んでください<br><span style="color:#888; font-size:11px;">Press and hold the image, then tap "Save to Photos"</span>';
  hint.style.cssText = 'color: #ccc; font-family: sans-serif; font-size: 13px; margin-top: 16px; text-align: center; line-height: 1.6;';
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '閉じる / Close';
  closeBtn.style.cssText = `margin-top: 20px; padding: 10px 24px; background: transparent; color: white; border: 1px solid #666; border-radius: 2px; font-family: sans-serif; font-size: 13px; cursor: pointer;`;
  closeBtn.addEventListener('click', () => overlay.remove());
  overlay.appendChild(img); overlay.appendChild(hint); overlay.appendChild(closeBtn);
  document.body.appendChild(overlay);
}

resetBtn.addEventListener('click', () => {
  originalImage = null;
  originalImageData = null;
  outputCanvas.style.display = 'none';
  canvasBadge.style.display = 'none';
  dropZone.style.display = 'flex';
  downloadBtn.disabled = true;
  resetBtn.disabled = true;
  fileInput.value = '';
});
