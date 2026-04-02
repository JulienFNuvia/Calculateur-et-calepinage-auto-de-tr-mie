// Accepte virgule et point comme séparateur décimal
function parseNum(v) { return parseFloat(String(v == null ? '' : v).trim().replace(',', '.')); }

// Affiche un input HTML flottant sur un <text> SVG pour éditer une côte
function openCoteInput(textEl, valueMm, onCommit) {
  if (document.getElementById('_cote-input')) return;
  const rect = textEl.getBoundingClientRect();
  const inp  = document.createElement('input');
  inp.id     = '_cote-input';
  inp.type   = 'text';
  inp.value  = Math.round(valueMm);
  inp.style.cssText = [
    'position:fixed',
    `left:${rect.left + rect.width / 2 - 36}px`,
    `top:${rect.top - 2}px`,
    'width:72px',
    `height:${Math.max(20, rect.height + 4)}px`,
    'font-size:13px',
    "font-family:Bahnschrift,'Trebuchet MS',sans-serif",
    'color:#e05818',
    'background:#fffaf6',
    'border:2px solid #e05818',
    'border-radius:3px',
    'text-align:center',
    'padding:0 4px',
    'z-index:9999',
    'box-sizing:border-box',
    'outline:none',
  ].join(';');
  document.body.appendChild(inp);
  inp.select();
  const commit = () => {
    const n = parseNum(inp.value);
    if (document.body.contains(inp)) inp.remove();
    if (Number.isFinite(n) && n >= 0) onCommit(n);
  };
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { if (document.body.contains(inp)) inp.remove(); }
  });
}

function makePlanSpecial(label) {
  return {
    label,
    surface: {
      width: 1500, height: 1500, gridStep: 500, showGrid: true,
      profondeur: 200, niveau: null, hasBottom: false,
      positionPreset: 'custom',
      offsetX: 0, offsetY: 0, offsetZ: 0,
      inclinaisonX: 0,   // deg — tilt autour de l'axe X (largeur)
      inclinaisonZ: 0,   // deg — tilt autour de l'axe Z (longueur)
      rotation: 0,       // rad — rotation autour de Y
      maillageFerraillage: 'moyen',
      debouchantZ4: false,
      rendementForce: false,
      rendementForceVal: 5,
      displayIntersections: true, displaySolid: false,
      lastDiameter: 200, lastRecouvrement: 10,
      smartAdaptiveDiam: false, smartDiameters: '50;100;150;200;250;300;350;400;500',
      smartRemoveOverlap: false, smartOverlapPct: 80, smartMinArea: 100, smartMaxOverlap: 30,
    },
    zones: [], holes: [],
    planSpecial: true,
  };
}

function makeCouche(label) {
  return {
    label,
    surface: {
      nature: 'rectangulaire',  // 'rectangulaire' | 'circulaire'
      diametre: 1500,           // mm — utilisé quand nature === 'circulaire'
      width: 1500,
      height: 1500,
      gridStep: 500,
      showGrid: true,
      hasBottom: false,
      positionPreset: "center",
      niveau: 0,
      profondeur: 200,
      offsetX: 0,
      offsetZ: 0,
      rotation: 0,
      displayIntersections: true,
      displaySolid: false,
      maillageFerraillage: "moyen",
      debouchantZ4: false,
      rendementForce: false,
      rendementForceVal: 5,
      lastDiameter: 200,
      lastRecouvrement: 10,
      smartAdaptiveDiam: false,
      smartDiameters: "50;100;150;200;250;300;350;400;500",
      smartRemoveOverlap: false,
      smartOverlapPct: 80,
      smartMinArea: 100,
      smartMaxOverlap: 30,
    },
    zones: [],
    holes: [],
  };
}

const state = {
  couches: [makeCouche("Couche 1")],
  activeCoucheIndex: 0,
  plansSpeciaux: [],
  activePsIndex: 0,
  editMode: 'couche',   // 'couche' | 'planSpecial'
  selectedZoneIndex: null,
  selectedHoleIndex: null,
  bloc: { width: 5000, depth: 3500, height: 300, niveau: 0, visible: true },
};

function ac() {
  if (state.editMode === 'planSpecial' && state.plansSpeciaux.length > 0) {
    return state.plansSpeciaux[state.activePsIndex] || state.plansSpeciaux[0];
  }
  return state.couches[state.activeCoucheIndex];
}

// ── 3D view state ──────────────────────────────────────────────────────────────
const view3d = {
  azimuth: -Math.PI / 5,
  tilt: Math.PI / 3,
  zoom: 1,
  panX: 0,
  panY: 0,
  drag: { active: false, lastX: 0, lastY: 0, type: "" },
};

// ── 3D visibility filters ───────────────────────────────────────────────
const view3dFilters = { interdites: true, souszones: true, decoupes: true, labels: true };
const view2dFilters = { interdites: true, souszones: true, decoupes: true, labels: true };
let layerOrder2d = ['interdites', 'souszones', 'decoupes', 'manuels', 'carottages']; // index 0 = priorité haute (dessiné en dernier)

// ── 3D clipping planes (fraction 0–1 of world bounding box) ─────────────────
const view3dClip = { x: false, xVal: 1, y: false, yVal: 1, z: false, zVal: 1 };

// ── Gizmo ─────────────────────────────────────────────────────────────────────
const measureState = { active: false, pts: [] };

const gizmo = { mode: null }; // "translate" | "rotate" | null
let _r3dInfo = { scale: 1, sinA: 0, cosA: 1, sinT: 1, cosT: 0 };

const ui = {
  surfaceForm: document.getElementById("surface-form"),
  holeForm:       document.getElementById("hole-form"),
  holeProfondeur: document.getElementById("hole-profondeur"),
  autoForm: document.getElementById("auto-form"),
  autoDiameter: document.getElementById("auto-diameter"),
  autoRecouvrement: document.getElementById("auto-recouvrement"),
  autoPeripheral: document.getElementById("auto-peripheral"),
  autoResult: document.getElementById("auto-result"),
  holesCount: document.getElementById("holes-count"),
  holesEmpty: document.getElementById("holes-empty"),
  psCount:    document.getElementById("ps-count"),
  width: document.getElementById("surface-width"),
  height: document.getElementById("surface-height"),
  surfaceNature:   document.getElementById("surface-nature"),
  surfaceDiametre: document.getElementById("surface-diametre"),
  gridStep: document.getElementById("grid-step"),
  surfaceHasBottom: document.getElementById("surface-has-bottom"),
  surfaceMaillage: document.getElementById("surface-maillage"),
  surfaceDebouchantZ4: document.getElementById("surface-debouchant-z4"),
  surfaceRendForceEn:   document.getElementById("surface-rend-force-en"),
  surfaceRendForceVal:  document.getElementById("surface-rend-force-val"),
  label: document.getElementById("hole-label"),
  x: document.getElementById("hole-x"),
  y: document.getElementById("hole-y"),
  diameter: document.getElementById("hole-diameter"),
  maillage: document.getElementById("hole-maillage"),
  status: document.getElementById("status"),
  holesBody: document.getElementById("holes-body"),
  svg: document.getElementById("plan-svg"),
  caption: document.getElementById("surface-caption"),
  saveBtn:     document.getElementById("btn-save"),
  loadInput:   document.getElementById("load-input"),
  exportSwBtn: document.getElementById("btn-export-sw"),
  exportAcadBtn: document.getElementById("btn-export-acad"),
  smartAdaptiveDiam:  document.getElementById("smart-adaptive-diam"),
  smartDiameters:     document.getElementById("smart-diameters"),
  smartRemoveOverlap: document.getElementById("smart-remove-overlap"),
  smartOverlapPct:    document.getElementById("smart-overlap-pct"),
  smartMinArea:       document.getElementById("smart-min-area"),
  smartMaxOverlap:    document.getElementById("smart-max-overlap"),
  clearBtn:    document.getElementById("btn-clear"),
  zoneForm: document.getElementById("zone-form"),
  zoneType: document.getElementById("zone-type"),
  zoneLabel: document.getElementById("zone-label"),
  zoneX: document.getElementById("zone-x"),
  zoneY: document.getElementById("zone-y"),
  zoneW: document.getElementById("zone-w"),
  zoneH: document.getElementById("zone-h"),
  zoneDiameter: document.getElementById("zone-diameter"),
  zoneRecouvrement: document.getElementById("zone-recouvrement"),

  zoneProfondeur: document.getElementById("zone-profondeur"),
  surfaceNiveau: document.getElementById("surface-niveau"),
  surfaceProfondeur: document.getElementById("surface-profondeur"),
  surfacePositionPreset: document.getElementById("surface-position-preset"),
  surfaceOffsetX: document.getElementById("surface-offset-x"),
  surfaceOffsetZ: document.getElementById("surface-offset-z"),
  surfaceRotation: document.getElementById("surface-rotation"),
  souzoneDiameterLabel: document.getElementById("souszone-diameter-label"),
  souzoneRecouvrementLabel: document.getElementById("souszone-recouvrement-label"),
  souzoneSmartLabel:        document.getElementById("souszone-smart-label"),
  souzoneSmartDiamsLabel:   document.getElementById("souszone-smart-diams-label"),
  souzoneSmartAreaLabel:    document.getElementById("souszone-smart-area-label"),
  souzoneSmartOverlapLabel: document.getElementById("souszone-smart-overlap-label"),
  souzonePontLabel:         document.getElementById("souszone-pont-label"),
  souzoneRendForceLabel:    document.getElementById("souszone-rend-force-label"),
  szRendForceEn:            document.getElementById("sz-rend-force-en"),
  szRendForceVal:           document.getElementById("sz-rend-force-val"),
  zonePont:                 document.getElementById("zone-pont"),
  zoneSmartDiam:            document.getElementById("zone-smart-diam"),
  zoneSmartDiameters:       document.getElementById("zone-smart-diameters"),
  zoneSmartMinArea:         document.getElementById("zone-smart-min-area"),
  zoneSmartMaxOverlap:      document.getElementById("zone-smart-max-overlap"),
  zonesCount: document.getElementById("zones-count"),
  zonesBody: document.getElementById("zones-body"),
  zonesEmpty: document.getElementById("zones-empty"),
  couchesBody: document.getElementById("couches-body"),
};

function computePresetOffsets(preset, surfaceW, surfaceH, blocW, blocD) {
  const maxX = Math.max(0, blocW - surfaceW);
  const maxZ = Math.max(0, blocD - surfaceH);
  const xMap = {
    left: 0,
    center: maxX / 2,
    right: maxX,
  };
  const zMap = {
    top: 0,
    middle: maxZ / 2,
    bottom: maxZ,
  };
  const [zKey, xKey] = String(preset || "center").split("-");
  const ox = xMap[xKey] ?? xMap.center;
  const oz = zMap[zKey] ?? zMap.middle;
  return { offsetX: Math.round(ox * 10) / 10, offsetZ: Math.round(oz * 10) / 10 };
}

function applyCouchePresetOffsets(couche, force = false) {
  const preset = couche.surface.positionPreset || "center";
  if (!force && preset === "custom") return;
  const { offsetX, offsetZ } = computePresetOffsets(
    preset,
    couche.surface.width,
    couche.surface.height,
    state.bloc.width,
    state.bloc.depth
  );
  couche.surface.offsetX = offsetX;
  couche.surface.offsetZ = offsetZ;
}

function applyAllCouchePresetOffsets() {
  state.couches.forEach(applyCouchePresetOffsets);
}

const SVG_NS = "http://www.w3.org/2000/svg";

function setStatus(message, isError = false) {
  ui.status.textContent = message;
  ui.status.style.color = isError ? "#9a1e32" : "#26445d";
}

function fitTransform(width, height) {
  const margin = 50;
  const vbWidth = 1000;
  const vbHeight = 700;
  const usableW = vbWidth - margin * 2;
  const usableH = vbHeight - margin * 2;
  const scale = Math.min(usableW / width, usableH / height);

  return {
    scale,
    offsetX: (vbWidth - width * scale) / 2,
    offsetY: (vbHeight - height * scale) / 2,
  };
}

function mmToView(x, y, transform) {
  return {
    x: transform.offsetX + x * transform.scale,
    y: transform.offsetY + y * transform.scale,
  };
}

function createSvg(tag, attrs) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([key, value]) => {
    node.setAttribute(key, String(value));
  });
  return node;
}

function drawGrid(group, transform) {
  const { width, height, gridStep } = ac().surface;
  if (!ac().surface.showGrid || gridStep <= 0) {
    return;
  }

  for (let x = 0; x <= width; x += gridStep) {
    const p1 = mmToView(x, 0, transform);
    const p2 = mmToView(x, height, transform);
    group.appendChild(
      createSvg("line", {
        x1: p1.x,
        y1: p1.y,
        x2: p2.x,
        y2: p2.y,
        stroke: "#d3dde7",
        "stroke-width": 1,
      })
    );
  }

  for (let y = 0; y <= height; y += gridStep) {
    const p1 = mmToView(0, y, transform);
    const p2 = mmToView(width, y, transform);
    group.appendChild(
      createSvg("line", {
        x1: p1.x,
        y1: p1.y,
        x2: p2.x,
        y2: p2.y,
        stroke: "#d3dde7",
        "stroke-width": 1,
      })
    );
  }
}

function renderPlan() {
  const { width, height } = ac().surface;
  const _s = ac().surface;
  const _isCirc = _s.nature === 'circulaire';
  const _cap = ((_s.niveau !== null && _s.niveau !== undefined && _s.niveau !== '') ? ' - ' + _s.niveau + ' mm' : '') + (_s.profondeur ? ' (' + _s.profondeur + ' mm)' : '');
  if (_isCirc) {
    ui.caption.textContent = 'Couche circulaire : Ø ' + (_s.diametre ?? width) + ' mm' + _cap;
  } else {
    ui.caption.textContent = 'Surface : ' + width + ' x ' + height + ' mm' + _cap;
  }

  ui.svg.innerHTML = "";
  const transform = fitTransform(width, height);

  // Motif hachuré pour les zones d'exclusion (rouge) et sous-zones (vert)
  const defs = createSvg("defs", {});
  const hatchPat = createSvg("pattern", {
    id: "zone-hatch",
    patternUnits: "userSpaceOnUse",
    width: 14,
    height: 14,
    patternTransform: "rotate(45)",
  });
  hatchPat.appendChild(createSvg("line", {
    x1: 0, y1: 0, x2: 0, y2: 14,
    stroke: "#b03030",
    "stroke-width": 1,
    opacity: 0.5,
  }));
  defs.appendChild(hatchPat);
  const souzonePat = createSvg("pattern", {
    id: "souszone-hatch",
    patternUnits: "userSpaceOnUse",
    width: 14,
    height: 14,
    patternTransform: "rotate(45)",
  });
  souzonePat.appendChild(createSvg("line", {
    x1: 0, y1: 0, x2: 0, y2: 14,
    stroke: "#207040",
    "stroke-width": 1,
    opacity: 0.5,
  }));
  defs.appendChild(souzonePat);
  const decoupePat = createSvg("pattern", { id: "decoupe-hatch", patternUnits: "userSpaceOnUse", width: 10, height: 10 });
  decoupePat.appendChild(createSvg("line", { x1: 0, y1: 5, x2: 10, y2: 5, stroke: "#3a4070", "stroke-width": 1.5, opacity: 0.6 }));
  decoupePat.appendChild(createSvg("line", { x1: 5, y1: 0, x2: 5, y2: 10, stroke: "#3a4070", "stroke-width": 1.5, opacity: 0.6 }));
  defs.appendChild(decoupePat);
  ui.svg.appendChild(defs);

  const gridGroup = createSvg("g", {});
  drawGrid(gridGroup, transform);
  ui.svg.appendChild(gridGroup);

  const topLeft = mmToView(0, 0, transform);
  let _circClipParams = null;
  if (_isCirc) {
    const _cx = topLeft.x + (width / 2) * transform.scale;
    const _cy = topLeft.y + (height / 2) * transform.scale;
    const _rC = (width / 2) * transform.scale;
    _circClipParams = { cx: _cx, cy: _cy, rCirc: _rC };
    const _clipPath = createSvg('clipPath', { id: 'surf-circ-clip' });
    _clipPath.appendChild(createSvg('circle', { cx: _cx, cy: _cy, r: _rC }));
    defs.appendChild(_clipPath);
    gridGroup.setAttribute('clip-path', 'url(#surf-circ-clip)');
    ui.svg.appendChild(createSvg('circle', { cx: _cx, cy: _cy, r: _rC, fill: '#fbfdff', stroke: 'none' }));
  } else {
    const rect = createSvg("rect", {
      x: topLeft.x,
      y: topLeft.y,
      width: width * transform.scale,
      height: height * transform.scale,
      fill: "#fbfdff",
      stroke: "#1e455f",
      "stroke-width": 2,
    });
    ui.svg.appendChild(rect);
  }

  // ── Dessin des calques dans l'ordre de priorité ──────────────────────────
  // layerOrder2d[0] = priorité max = dessiné en DERNIER (z-order le plus haut).
  // Les cercles de carottages ont pointer-events:none → les zones restent cliquables.
  const HS = 9; // taille poignée px viewBox

  // Côtes de localisation (distances zone ↔ bords de la surface) – tracées quand la zone est sélectionnée
  const drawCotes = (zone) => {
    const { width: SW, height: SH } = ac().surface;
    const surTL = mmToView(0, 0, transform);
    const surBR = mmToView(SW, SH, transform);
    const zTL2  = mmToView(zone.x, zone.y, transform);
    const zBR2  = mmToView(zone.x + zone.w, zone.y + zone.h, transform);
    const CC  = "#e05818"; // couleur côtes
    const CO  = 34;        // décalage px hors surface pour la ligne de cote
    const TK  = 5;         // demi-longueur des tirets d'extrémité
    const FS  = 13;        // font-size texte
    const FF  = "Bahnschrift,Trebuchet MS,sans-serif";
    const cg  = createSvg("g", { "pointer-events": "none" });

    // Cote horizontale : entre x1v et x2v, ligne placée à yRef - CO
    const addH = (x1v, x2v, yRef, valueMm, onCommit) => {
      if (valueMm <= 0) return;
      const yD = yRef - CO;
      // lignes d'attache
      cg.appendChild(createSvg("line", { x1: x1v, y1: yRef, x2: x1v, y2: yD - TK, stroke: CC, "stroke-width": 0.8, "stroke-dasharray": "3 2", opacity: 0.75 }));
      cg.appendChild(createSvg("line", { x1: x2v, y1: yRef, x2: x2v, y2: yD - TK, stroke: CC, "stroke-width": 0.8, "stroke-dasharray": "3 2", opacity: 0.75 }));
      // ligne de cote
      cg.appendChild(createSvg("line", { x1: x1v, y1: yD, x2: x2v, y2: yD, stroke: CC, "stroke-width": 1.2 }));
      // tirets
      cg.appendChild(createSvg("line", { x1: x1v, y1: yD - TK, x2: x1v, y2: yD + TK, stroke: CC, "stroke-width": 1.5 }));
      cg.appendChild(createSvg("line", { x1: x2v, y1: yD - TK, x2: x2v, y2: yD + TK, stroke: CC, "stroke-width": 1.5 }));
      // valeur cliquable
      const tx = createSvg("text", { x: (x1v + x2v) / 2, y: yD - TK - 3, "text-anchor": "middle", "font-size": FS, fill: CC, "font-family": FF, "pointer-events": "all", cursor: "pointer" });
      tx.textContent = Math.round(valueMm) + " mm";
      tx.setAttribute("data-role", "cote");
      tx.addEventListener("click", (e) => { e.stopPropagation(); openCoteInput(tx, valueMm, onCommit); });
      cg.appendChild(tx);
    };

    // Cote verticale : entre y1v et y2v, ligne placée à xRef - CO
    const addV = (y1v, y2v, xRef, valueMm, onCommit) => {
      if (valueMm <= 0) return;
      const xD  = xRef - CO;
      const midY = (y1v + y2v) / 2;
      // lignes d'attache
      cg.appendChild(createSvg("line", { x1: xRef, y1: y1v, x2: xD - TK, y2: y1v, stroke: CC, "stroke-width": 0.8, "stroke-dasharray": "3 2", opacity: 0.75 }));
      cg.appendChild(createSvg("line", { x1: xRef, y1: y2v, x2: xD - TK, y2: y2v, stroke: CC, "stroke-width": 0.8, "stroke-dasharray": "3 2", opacity: 0.75 }));
      // ligne de cote
      cg.appendChild(createSvg("line", { x1: xD, y1: y1v, x2: xD, y2: y2v, stroke: CC, "stroke-width": 1.2 }));
      // tirets
      cg.appendChild(createSvg("line", { x1: xD - TK, y1: y1v, x2: xD + TK, y2: y1v, stroke: CC, "stroke-width": 1.5 }));
      cg.appendChild(createSvg("line", { x1: xD - TK, y1: y2v, x2: xD + TK, y2: y2v, stroke: CC, "stroke-width": 1.5 }));
      // valeur pivotée cliquable
      const tx = createSvg("text", { x: xD - TK - 3, y: midY, "text-anchor": "middle", "dominant-baseline": "middle", "font-size": FS, fill: CC, "font-family": FF, transform: `rotate(-90,${xD - TK - 3},${midY})`, "pointer-events": "all", cursor: "pointer" });
      tx.textContent = Math.round(valueMm) + " mm";
      tx.setAttribute("data-role", "cote");
      tx.addEventListener("click", (e) => { e.stopPropagation(); openCoteInput(tx, valueMm, onCommit); });
      cg.appendChild(tx);
    };

    // x- (gauche) : éditer déplace la zone vers la droite
    addH(surTL.x, zTL2.x, surTL.y, zone.x, (v) => {
      zone.x = Math.max(0, Math.min(Math.round(v), SW - zone.w));
      renderPlan(); runAutoLayout(); render3D();
    });
    // x+ (droite) : éditer déplace la zone depuis la droite
    addH(zBR2.x, surBR.x, surTL.y, SW - zone.x - zone.w, (v) => {
      zone.x = Math.max(0, Math.min(Math.round(SW - v - zone.w), SW - zone.w));
      renderPlan(); runAutoLayout(); render3D();
    });
    // y- (haut) : éditer déplace la zone vers le bas
    addV(surTL.y, zTL2.y, surTL.x, zone.y, (v) => {
      zone.y = Math.max(0, Math.min(Math.round(v), SH - zone.h));
      renderPlan(); runAutoLayout(); render3D();
    });
    // y+ (bas) : éditer déplace la zone depuis le bas
    addV(zBR2.y, surBR.y, surTL.x, SH - zone.y - zone.h, (v) => {
      zone.y = Math.max(0, Math.min(Math.round(SH - v - zone.h), SH - zone.h));
      renderPlan(); runAutoLayout(); render3D();
    });

    ui.svg.appendChild(cg);
  };

  const drawZone = (zone, zoneIndex) => {
    const isSouszone = zone.type === "souszone";
    const isDecoupe  = zone.type === "decoupe";
    const isSelected = state.selectedZoneIndex === zoneIndex;
    const zTL = mmToView(zone.x, zone.y, transform);
    const zW  = zone.w * transform.scale;
    const zH  = zone.h * transform.scale;
    const zoneFill   = isDecoupe ? "url(#decoupe-hatch)" : isSouszone ? "url(#souszone-hatch)" : "url(#zone-hatch)";
    const zoneStroke = isDecoupe
      ? (isSelected ? "#2a3070" : "#3a4090")
      : isSouszone
        ? (isSelected ? "#1a7040" : "#207040")
        : (isSelected ? "#e05818" : "#b03030");
    const zoneLabelColor = isDecoupe ? "#1a1a7a" : "#7a1a1a";
    const g = createSvg("g", { "data-zone-idx": String(zoneIndex) });
    g.appendChild(createSvg("rect", {
      x: zTL.x, y: zTL.y, width: zW, height: zH,
      fill: zoneFill,
      stroke: zoneStroke,
      "stroke-width": isSelected ? 2.5 : 2,
      "stroke-dasharray": isSelected ? "8 3" : "none",
      "pointer-events": "all",
      "data-role": "move",
      cursor: "grab",
    }));
    if (view2dFilters.labels) {
      const cy = zTL.y + zH / 2;
      if (zone.label) {
        const lbl = createSvg("text", {
          x: zTL.x + zW / 2, y: cy - 7,
          fill: zoneLabelColor, "font-size": 11,
          "text-anchor": "middle", "dominant-baseline": "middle",
          "font-family": "Bahnschrift, Trebuchet MS, sans-serif",
          "font-weight": "bold", "pointer-events": "none",
        });
        lbl.textContent = zone.label;
        g.appendChild(lbl);
      }
      const dim = createSvg("text", {
        x: zTL.x + zW / 2, y: cy + (zone.label ? 7 : 0),
        fill: zoneLabelColor, "font-size": 11,
        "text-anchor": "middle", "dominant-baseline": "middle",
        "font-family": "Bahnschrift, Trebuchet MS, sans-serif",
        "pointer-events": "none",
      });
      dim.textContent = Math.round(zone.w) + " \u00d7 " + Math.round(zone.h) + " mm";
      g.appendChild(dim);
    }
    if (isSelected) {
      [
        { id: "nw", x: zTL.x,          y: zTL.y,          cursor: "nw-resize" },
        { id: "n",  x: zTL.x + zW / 2, y: zTL.y,          cursor: "n-resize"  },
        { id: "ne", x: zTL.x + zW,     y: zTL.y,          cursor: "ne-resize" },
        { id: "e",  x: zTL.x + zW,     y: zTL.y + zH / 2, cursor: "e-resize"  },
        { id: "se", x: zTL.x + zW,     y: zTL.y + zH,     cursor: "se-resize" },
        { id: "s",  x: zTL.x + zW / 2, y: zTL.y + zH,     cursor: "s-resize"  },
        { id: "sw", x: zTL.x,          y: zTL.y + zH,     cursor: "sw-resize" },
        { id: "w",  x: zTL.x,          y: zTL.y + zH / 2, cursor: "w-resize"  },
      ].forEach((h) => {
        g.appendChild(createSvg("rect", {
          x: h.x - HS / 2, y: h.y - HS / 2, width: HS, height: HS,
          fill: "#fff", stroke: "#e05818", "stroke-width": 1.5,
          cursor: h.cursor, "data-role": "resize", "data-handle": h.id,
        }));
      });
    }
    ui.svg.appendChild(g);
    if (isSelected) drawCotes(zone);
  };

  // Dessiner en ordre inverse : index 0 = dernier dessiné = z-order max
  for (let li = layerOrder2d.length - 1; li >= 0; li--) {
    const layer = layerOrder2d[li];
    if (layer === 'interdites' && view2dFilters.interdites) {
      ac().zones.forEach((z, i) => { if (z.type === 'exclusion') drawZone(z, i); });
    } else if (layer === 'souszones' && view2dFilters.souszones) {
      ac().zones.forEach((z, i) => { if (z.type === 'souszone') drawZone(z, i); });
    } else if (layer === 'decoupes' && view2dFilters.decoupes) {
      ac().zones.forEach((z, i) => { if (z.type === 'decoupe') drawZone(z, i); });
    } else if (layer === 'carottages') {
      ac().holes.forEach((hole) => {
        if (hole.manual) return;
        const center = mmToView(hole.x, hole.y, transform);
        const radius = (hole.diameter / 2) * transform.scale;
        ui.svg.appendChild(createSvg("circle", {
          cx: center.x, cy: center.y, r: radius,
          fill:   "rgba(31, 77, 180, 0.2)",
          stroke: "#1a50c8",
          "stroke-width": 2,
          "pointer-events": "none",
        }));
      });
    } else if (layer === 'manuels') {
      ac().holes.forEach((hole, hi) => {
        if (!hole.manual) return;
        const center = mmToView(hole.x, hole.y, transform);
        const radius = (hole.diameter / 2) * transform.scale;
        const isSel = state.selectedHoleIndex === hi;
        ui.svg.appendChild(createSvg("circle", {
          cx: center.x, cy: center.y, r: radius,
          fill:   "rgba(230, 120, 20, 0.25)",
          stroke: isSel ? "#b04000" : "#e07010",
          "stroke-width": isSel ? 3 : 2,
          "stroke-dasharray": isSel ? "6 2" : "none",
          "pointer-events": "all",
          cursor: "grab",
          "data-hole-idx": String(hi),
          "data-role": "move-hole",
        }));
        if (isSel) {
          // Côtes position carottage manuel
          const { width: SW, height: SH } = ac().surface;
          const surTL = mmToView(0, 0, transform);
          const surBR = mmToView(SW, SH, transform);
          const CC = "#e07010"; const CO = 34; const TK = 5; const FS = 13;
          const FF = "Bahnschrift,Trebuchet MS,sans-serif";
          const cg = createSvg("g", { "pointer-events": "none" });
          const addH = (x1v, x2v, yRef, val, onCommit) => {
            if (val <= 0) return;
            const yD = yRef - CO;
            cg.appendChild(createSvg("line", { x1: x1v, y1: yRef, x2: x1v, y2: yD - TK, stroke: CC, "stroke-width": 0.8, "stroke-dasharray": "3 2", opacity: 0.75 }));
            cg.appendChild(createSvg("line", { x1: x2v, y1: yRef, x2: x2v, y2: yD - TK, stroke: CC, "stroke-width": 0.8, "stroke-dasharray": "3 2", opacity: 0.75 }));
            cg.appendChild(createSvg("line", { x1: x1v, y1: yD, x2: x2v, y2: yD, stroke: CC, "stroke-width": 1.2 }));
            cg.appendChild(createSvg("line", { x1: x1v, y1: yD - TK, x2: x1v, y2: yD + TK, stroke: CC, "stroke-width": 1.5 }));
            cg.appendChild(createSvg("line", { x1: x2v, y1: yD - TK, x2: x2v, y2: yD + TK, stroke: CC, "stroke-width": 1.5 }));
            const tx = createSvg("text", { x: (x1v + x2v) / 2, y: yD - TK - 3, "text-anchor": "middle", "font-size": FS, fill: CC, "font-family": FF, "pointer-events": "all", cursor: "pointer" });
            tx.textContent = Math.round(val) + " mm";
            tx.setAttribute("data-role", "cote");
            tx.addEventListener("click", (e) => { e.stopPropagation(); openCoteInput(tx, val, onCommit); });
            cg.appendChild(tx);
          };
          const addV = (y1v, y2v, xRef, val, onCommit) => {
            if (val <= 0) return;
            const xD = xRef - CO; const midY = (y1v + y2v) / 2;
            cg.appendChild(createSvg("line", { x1: xRef, y1: y1v, x2: xD - TK, y2: y1v, stroke: CC, "stroke-width": 0.8, "stroke-dasharray": "3 2", opacity: 0.75 }));
            cg.appendChild(createSvg("line", { x1: xRef, y1: y2v, x2: xD - TK, y2: y2v, stroke: CC, "stroke-width": 0.8, "stroke-dasharray": "3 2", opacity: 0.75 }));
            cg.appendChild(createSvg("line", { x1: xD, y1: y1v, x2: xD, y2: y2v, stroke: CC, "stroke-width": 1.2 }));
            cg.appendChild(createSvg("line", { x1: xD - TK, y1: y1v, x2: xD + TK, y2: y1v, stroke: CC, "stroke-width": 1.5 }));
            cg.appendChild(createSvg("line", { x1: xD - TK, y1: y2v, x2: xD + TK, y2: y2v, stroke: CC, "stroke-width": 1.5 }));
            const tx = createSvg("text", { x: xD - TK - 3, y: midY, "text-anchor": "middle", "dominant-baseline": "middle", "font-size": FS, fill: CC, "font-family": FF, transform: `rotate(-90,${xD - TK - 3},${midY})`, "pointer-events": "all", cursor: "pointer" });
            tx.textContent = Math.round(val) + " mm";
            tx.setAttribute("data-role", "cote");
            tx.addEventListener("click", (e) => { e.stopPropagation(); openCoteInput(tx, val, onCommit); });
            cg.appendChild(tx);
          };
          addH(surTL.x, center.x, surTL.y, hole.x, (v) => {
            hole.x = Math.round(Math.max(0, Math.min(v, SW)));
            renderTable(); renderPlan();
          });
          addH(center.x, surBR.x, surTL.y, SW - hole.x, (v) => {
            hole.x = Math.round(Math.max(0, Math.min(SW - v, SW)));
            renderTable(); renderPlan();
          });
          addV(surTL.y, center.y, surTL.x, hole.y, (v) => {
            hole.y = Math.round(Math.max(0, Math.min(v, SH)));
            renderTable(); renderPlan();
          });
          addV(center.y, surBR.y, surTL.x, SH - hole.y, (v) => {
            hole.y = Math.round(Math.max(0, Math.min(SH - v, SH)));
            renderTable(); renderPlan();
          });
          ui.svg.appendChild(cg);
        }
      });
    }
  }
  // ── Outil mesure
  if (measureState.active) _drawMeasureLayer(transform);

  // ── Clip circulaire — conteneur final (masque l'extérieur du disque) ────────
  if (_circClipParams) {
    const { cx, cy, rCirc } = _circClipParams;
    const grp = createSvg('g', { 'clip-path': 'url(#surf-circ-clip)' });
    const toMove = [...ui.svg.childNodes].filter(n => n.tagName !== 'defs');
    for (const n of toMove) grp.appendChild(n);
    ui.svg.appendChild(grp);
    ui.svg.appendChild(createSvg('circle', { cx, cy, r: rCirc, fill: 'none', stroke: '#1e455f', 'stroke-width': 2 }));
  }
}
function _updateSwEstimate() {
  const el = document.getElementById('sw-time-estimate-text');
  if (!el) return;
  const totalHoles = state.couches.reduce((s, c) => s + c.holes.length, 0)
                   + state.plansSpeciaux.reduce((s, ps) => s + (ps.holes ? ps.holes.length : 0), 0);
  if (totalHoles === 0) {
    el.textContent = 'Aucun carottage — rien à générer.';
    return;
  }
  const totalSec = Math.round(1.5 * totalHoles);
  let dur;
  if (totalSec < 60) {
    dur = `~${totalSec} s`;
  } else {
    const m = Math.floor(totalSec / 60), s = totalSec % 60;
    dur = s > 0 ? `~${m} min ${s} s` : `~${m} min`;
  }
  el.innerHTML = `Temps de génération SolidWorks estimé&nbsp;: <strong>${dur}</strong> <span style="color:#6b8099">(${totalHoles} carottage${totalHoles > 1 ? 's' : ''} × 1,5 s)</span>`;
}

// ── Outil mesure 2D ────────────────────────────────────────────

// Intersections géométriques entre deux cercles (arrondi 0.1 mm)
function _circleIntersections(h1, h2) {
  const rx = h2.x - h1.x, ry = h2.y - h1.y;
  const d = Math.sqrt(rx * rx + ry * ry);
  const r1 = h1.diameter / 2, r2 = h2.diameter / 2;
  if (d > r1 + r2 + 1e-6 || d < Math.abs(r1 - r2) - 1e-6 || d < 1e-6) return [];
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h2val = r1 * r1 - a * a;
  if (h2val < 0) return [];
  const hh = Math.sqrt(h2val);
  const mx = h1.x + a * rx / d, my = h1.y + a * ry / d;
  const rd = v => Math.round(v * 10) / 10;
  if (hh < 1e-6) return [{ x: rd(mx), y: rd(my) }];
  return [
    { x: rd(mx + hh * ry / d), y: rd(my - hh * rx / d) },
    { x: rd(mx - hh * ry / d), y: rd(my + hh * rx / d) },
  ];
}

function _measurePtMatch(p, x, y) {
  return Math.abs(p.x - x) < 0.15 && Math.abs(p.y - y) < 0.15;
}

function _drawMeasureLayer(transform) {
  const s = ac().surface;
  const step = (s.showGrid && s.gridStep > 0) ? s.gridStep : 500;
  const W = s.width || s.diametre || 1500;
  const H = s.height || s.diametre || 1500;
  const FF = "Bahnschrift,Trebuchet MS,sans-serif";
  const g = createSvg('g', { id: 'measure-layer' });

  const addDot = (px, py, isCirc) => {
    const sel = measureState.pts.some(p => _measurePtMatch(p, px, py));
    const v = mmToView(px, py, transform);
    const dot = createSvg('circle', {
      cx: v.x, cy: v.y,
      r: sel ? 7 : (isCirc ? 5 : 4),
      fill: sel ? '#e05818' : (isCirc ? '#fffbe8' : '#fff'),
      stroke: sel ? '#b03010' : (isCirc ? '#c07800' : '#1a50c8'),
      'stroke-width': sel ? 2 : 1.5,
      cursor: 'pointer', opacity: 0.92,
    });
    g.appendChild(dot);
  };

  // Points de grille (bleus)
  for (let mx = 0; mx <= W; mx += step) {
    for (let my = 0; my <= H; my += step) {
      addDot(mx, my, false);
    }
  }

  // Intersections cercle-cercle (oranges)
  const holes = ac().holes;
  const seen = new Set();
  for (let i = 0; i < holes.length - 1; i++) {
    for (let j = i + 1; j < holes.length; j++) {
      for (const p of _circleIntersections(holes[i], holes[j])) {
        const key = p.x + ',' + p.y;
        if (seen.has(key)) continue;
        seen.add(key);
        addDot(p.x, p.y, true);
      }
    }
  }

  // Ligne + annotation entre les 2 points sélectionnés
  if (measureState.pts.length === 2) {
    const [p1, p2] = measureState.pts;
    const v1 = mmToView(p1.x, p1.y, transform);
    const v2 = mmToView(p2.x, p2.y, transform);
    const dx = Math.abs(p2.x - p1.x), dy = Math.abs(p2.y - p1.y);
    const dist = Math.round(Math.sqrt(dx * dx + dy * dy));
    g.appendChild(createSvg('line', { x1: v1.x, y1: v1.y, x2: v2.x, y2: v2.y, stroke: '#e05818', 'stroke-width': 1.8, 'stroke-dasharray': '5 3', 'pointer-events': 'none' }));
    if (dx > 0.5 && dy > 0.5) {
      g.appendChild(createSvg('line', { x1: v1.x, y1: v1.y, x2: v2.x, y2: v1.y, stroke: '#1a50c8', 'stroke-width': 0.9, 'stroke-dasharray': '3 2', opacity: 0.6, 'pointer-events': 'none' }));
      g.appendChild(createSvg('line', { x1: v2.x, y1: v1.y, x2: v2.x, y2: v2.y, stroke: '#1a50c8', 'stroke-width': 0.9, 'stroke-dasharray': '3 2', opacity: 0.6, 'pointer-events': 'none' }));
    }
    const cx = (v1.x + v2.x) / 2, cy = (v1.y + v2.y) / 2;
    const lbl = dist > 0 ? dist + ' mm' : '0';
    g.appendChild(createSvg('rect', { x: cx - 48, y: cy - 13, width: 96, height: 26, fill: '#fffbe8', stroke: '#e05818', 'stroke-width': 0.8, rx: 3, 'pointer-events': 'none' }));
    const txt = createSvg('text', { x: cx, y: cy + 1, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': 17, fill: '#c04010', 'font-family': FF, 'font-weight': 'bold', 'pointer-events': 'none' });
    txt.textContent = lbl;
    g.appendChild(txt);
  }

  ui.svg.appendChild(g);
}

function _updateMeasureResult() {
  const el = document.getElementById('measure-result');
  if (!el) return;
  const pts = measureState.pts;
  if (pts.length === 0) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  el.style.display = 'block';
  if (pts.length === 1) {
    el.innerHTML = '<b>Point 1 :</b> X\u00a0=\u00a0' + Math.round(pts[0].x) + '\u00a0mm, Y\u00a0=\u00a0' + Math.round(pts[0].y) + '\u00a0mm<br><span style="color:#6b8099">Cliquez un 2e point pour mesurer</span>';
    return;
  }
  const dx = Math.abs(pts[1].x - pts[0].x);
  const dy = Math.abs(pts[1].y - pts[0].y);
  const dist = Math.round(Math.sqrt(dx * dx + dy * dy));
  el.innerHTML = '<b>Distance :</b> <span style="font-size:1.05em;color:#e05818">' + dist + '\u00a0mm</span><br>' +
    '\u0394X\u00a0=\u00a0' + Math.round(dx) + '\u00a0mm\u2002|\u2002\u0394Y\u00a0=\u00a0' + Math.round(dy) + '\u00a0mm';
}
function _measureClick(x, y) {
  const idx = measureState.pts.findIndex(p => _measurePtMatch(p, x, y));
  if (idx >= 0) { measureState.pts.splice(idx, 1); }
  else if (measureState.pts.length < 2) { measureState.pts.push({ x, y }); }
  else { measureState.pts = [{ x, y }]; }
  _updateMeasureResult();
  renderPlan();
}
function renderTable() {
  ui.holesBody.innerHTML = "";

  const count = ac().holes.length;
  ui.holesCount.textContent = count;
  ui.holesCount.hidden = count === 0;
  ui.holesEmpty.hidden = count > 0;

  _updateSwEstimate();

  ac().holes.forEach((hole, index) => {
    const tr = document.createElement("tr");

    const makeEditable = (field, value, type = "text") => {
      const td = document.createElement("td");
      td.contentEditable = "true";
      td.textContent = value;
      td.addEventListener("blur", () => {
        const raw = td.textContent.trim();
        if (type === "number") {
          const n = Number(raw);
          if (!Number.isFinite(n)) { td.textContent = hole[field]; return; }
          hole[field] = n;
        } else {
          hole[field] = raw || hole[field];
        }
        renderPlan();
        render3D();
      });
      td.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); td.blur(); } });
      return td;
    };

    const maillageOptions = ["faible", "moyen", "dense"];
    const tdMaillage = document.createElement("td");
    const sel = document.createElement("select");
    sel.className = "table-select";
    maillageOptions.forEach(opt => {
      const o = document.createElement("option");
      o.value = opt; o.textContent = opt.charAt(0).toUpperCase() + opt.slice(1);
      if ((hole.maillageFerraillage || "moyen") === opt) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener("change", () => {
      hole.maillageFerraillage = sel.value;
    });
    tdMaillage.appendChild(sel);

    const tdDel = document.createElement("td");
    const btn = document.createElement("button");
    btn.dataset.remove = index;
    btn.title = "Supprimer";
    btn.textContent = "Suppr.";
    tdDel.appendChild(btn);

    tr.appendChild(makeEditable("label", hole.label, "text"));
    tr.appendChild(makeEditable("x", hole.x, "number"));
    tr.appendChild(makeEditable("y", hole.y, "number"));
    tr.appendChild(makeEditable("diameter", hole.diameter, "number"));

    // Profondeur spécifique (null = idem couche)
    const defaultProf = ac().surface.profondeur || 200;
    const hasSpecificProf = hole.profondeur != null;
    const tdProf = document.createElement("td");
    tdProf.contentEditable = "true";
    tdProf.textContent = hasSpecificProf ? hole.profondeur : defaultProf;
    tdProf.title = hasSpecificProf ? "Profondeur spécifique" : "Profondeur de la couche (par défaut)";
    tdProf.style.color = hasSpecificProf ? "" : "#aaa";
    tdProf.style.fontStyle = hasSpecificProf ? "" : "italic";
    tdProf.addEventListener("focus", () => {
      // Vider le champ si c'est la valeur par défaut, pour permettre la saisie propre
      if (!hole.profondeur) tdProf.textContent = "";
    });
    tdProf.addEventListener("blur", () => {
      const raw = tdProf.textContent.trim();
      if (raw === "" || Number(raw) === defaultProf) {
        hole.profondeur = null;
        tdProf.textContent = defaultProf;
        tdProf.style.color = "#aaa";
        tdProf.style.fontStyle = "italic";
        tdProf.title = "Profondeur de la couche (par défaut)";
      } else {
        const n = Number(raw);
        if (!Number.isFinite(n) || n <= 0) {
          tdProf.textContent = hole.profondeur ?? defaultProf;
          return;
        }
        hole.profondeur = n;
        tdProf.style.color = "";
        tdProf.style.fontStyle = "";
        tdProf.title = "Profondeur spécifique";
      }
    });
    tdProf.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); tdProf.blur(); } });
    tr.appendChild(tdProf);

    tr.appendChild(tdMaillage);
    tr.appendChild(tdDel);

    ui.holesBody.appendChild(tr);
  });
}

function isHoleInsideSurface(hole) {
  const r = hole.diameter / 2;
  if (ac().surface.nature === 'circulaire') {
    const R = (ac().surface.diametre || ac().surface.width) / 2;
    const dx = hole.x - R, dy = hole.y - R;
    return Math.sqrt(dx * dx + dy * dy) + r <= R + 1e-6;
  }
  return (
    hole.x - r >= 0 &&
    hole.x + r <= ac().surface.width &&
    hole.y - r >= 0 &&
    hole.y + r <= ac().surface.height
  );
}

function findOverlap(hole) {
  return ac().holes.find((existing) => {
    const dx = existing.x - hole.x;
    const dy = existing.y - hole.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance < existing.diameter / 2 + hole.diameter / 2;
  });
}

function holeIntersectsZone(hole) {
  const r = hole.diameter / 2;
  // Seules les zones d'exclusion bloquent l'ajout manuel
  return ac().zones.filter(z => z.type !== 'souszone').some((z) => {
    const closestX = Math.max(z.x, Math.min(hole.x, z.x + z.w));
    const closestY = Math.max(z.y, Math.min(hole.y, z.y + z.h));
    const dx = hole.x - closestX;
    const dy = hole.y - closestY;
    return dx * dx + dy * dy < r * r;
  });
}

/**
 * Fusionne des intervalles triés [lo, hi].
 */
function mergeIntervals(intervals) {
  intervals.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const iv of intervals) {
    if (merged.length === 0 || iv[0] >= merged[merged.length - 1][1]) {
      merged.push([...iv]);
    } else {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], iv[1]);
    }
  }
  return merged;
}

/**
 * Découpe [axisMin, axisMax] en segments libres en retirant les intervalles bloqués.
 */
function freeSegments(axisMin, axisMax, blocked) {
  const merged = mergeIntervals(blocked);
  const segs = [];
  let cursor = axisMin;
  for (const [bStart, bEnd] of merged) {
    const segEnd = Math.min(bStart, axisMax);
    if (segEnd > cursor + 1e-6) segs.push([cursor, segEnd]);
    cursor = Math.max(cursor, bEnd);
  }
  if (cursor < axisMax - 1e-6) segs.push([cursor, axisMax]);
  if (segs.length === 0) segs.push([axisMin, axisMax]);
  return segs;
}

/**
 * Place n_seg carottages uniformément dans un segment [segStart, segEnd].
 * Si un seul, il est centré.
 */
function layoutSegment(segStart, segEnd, entraxeVoulu, fixedCoord, isX, diameter, holes) {
  const segSpan = segEnd - segStart;
  if (segSpan < -1e-6) return;
  const n_seg = segSpan < entraxeVoulu - 1e-6 ? 1 : Math.floor(segSpan / entraxeVoulu) + 1;
  const entraxeSeg = n_seg > 1 ? segSpan / (n_seg - 1) : null;
  for (let i = 0; i < n_seg; i++) {
    const coord = n_seg === 1 ? (segStart + segEnd) / 2 : segStart + i * entraxeSeg;
    holes.push({
      label: `C${holes.length + 1}`,
      x: Math.round((isX ? coord : fixedCoord) * 10) / 10,
      y: Math.round((isX ? fixedCoord : coord) * 10) / 10,
      diameter,
    });
  }
}

/**
 * Calepinage automatique.
 *
 * Rangées Y : grille globale uniforme (r → height-r, entraxe constant).
 * Colonnes X : pour chaque rangée, on calcule les intervalles X bloqués
 *   par les zones (en tenant compte du rayon du cercle, y compris aux coins),
 *   puis on place des cercles uniformément dans chaque segment libre.
 *
 * Résultat : couverture maximale, pas de trou, cercles tangents aux bords
 * de surface et aux bords de zones.
 */
function autoLayout(diameter, recouvrementVoulu, peripheralOnly = false) {
  const { width, height } = ac().surface;
  const r = diameter / 2;

  if (diameter > width || diameter > height) {
    return { error: "Le diamètre est supérieur à l'une des dimensions de la surface." };
  }

  const entraxeVoulu = diameter - recouvrementVoulu;
  if (entraxeVoulu <= 0) {
    return { error: "Recouvrement supérieur ou égal au diamètre : entraxe nul ou négatif." };
  }

  // --- Grille Y par breakpoints ---
  // Breakpoints garantis : r, height-r, + rangées tangentes haut/bas de chaque zone.
  // On ne fusionne PAS les breakpoints proches : chaque zone doit toujours avoir
  // sa rangée tangente, même si deux zones sont voisines en Y.
  const yBreakpointSet = new Set([r, height - r]);
  for (const z of ac().zones) {
    // Zone pont : pour les sous-zones avec pont > 0, les breakpoints utilisent les bords effectifs (rétrécis)
    let zy = z.y, zh = z.h;
    if (z.type === 'souszone' && z.pont > 0) {
      const py = z.h * z.pont / 100;
      zy = z.y + py;
      zh = z.h - 2 * py;
      if (zh <= 0) continue;
    }
    const yA = zy - r;
    const yB = zy + zh + r;
    if (yA > r - 1e-6 && yA < height - r + 1e-6) yBreakpointSet.add(Math.max(r, yA));
    if (yB > r - 1e-6 && yB < height - r + 1e-6) yBreakpointSet.add(Math.min(height - r, yB));
  }
  const bps = [...yBreakpointSet].sort((a, b) => a - b);

  // Pour chaque intervalle [bps[k], bps[k+1]], ajouter des rangées uniformes
  // avec Math.ceil pour garantir que l'entraxe réel ≤ entraxeVoulu.
  // Si le span < entraxeVoulu, aucune rangée intermédiaire (les deux extrémités suffisent).
  const yPositions = [];
  for (let k = 0; k < bps.length - 1; k++) {
    yPositions.push(bps[k]);
    const span = bps[k + 1] - bps[k];
    if (span > entraxeVoulu + 1e-6) {
      const n_gaps = Math.ceil(span / entraxeVoulu);
      const step = span / n_gaps;
      for (let m = 1; m < n_gaps; m++) yPositions.push(bps[k] + m * step);
    }
  }
  yPositions.push(bps[bps.length - 1]);

  // Recouvrement net indicatif (grille globale sans zones)
  const spanY = height - diameter;
  const n_y = spanY < 1e-6 ? 1 : Math.floor(spanY / entraxeVoulu) + 1;
  const eY = n_y > 1 ? spanY / (n_y - 1) : 0;
  const recouvrementNetY = n_y > 1 ? Math.round((diameter - eY) * 10) / 10 : null;

  const holes = [];
  const firstY = yPositions[0];
  const lastY  = yPositions[yPositions.length - 1];

  // Utiliser les zones de la couche active
  for (const y of yPositions) {
    const isEdgeRow = !peripheralOnly || y === firstY || y === lastY;

    const blocked = [];
    for (const z of ac().zones) {
      // Zone pont : rétrécir le rectangle de blocage pour les sous-zones avec pont > 0
      let zx = z.x, zy = z.y, zw = z.w, zh = z.h;
      if (z.type === 'souszone' && z.pont > 0) {
        const px = z.w * z.pont / 100;
        const py = z.h * z.pont / 100;
        zx += px; zw -= 2 * px;
        zy += py; zh -= 2 * py;
        if (zw <= 0 || zh <= 0) continue; // pont absorbe toute la zone : aucun blocage
      }
      let xHalf;
      if (y >= zy && y <= zy + zh) {
        // y est dans la bande verticale de la zone
        xHalf = r;
      } else {
        const dy = y < zy ? zy - y : y - (zy + zh);
        if (dy >= r) continue; // zone trop loin, pas d'interférence
        xHalf = Math.sqrt(r * r - dy * dy);
      }
      blocked.push([zx - xHalf, zx + zw + xHalf]);
    }

    // Fusionner les intervalles bloqués
    blocked.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const iv of blocked) {
      if (merged.length === 0 || iv[0] >= merged[merged.length - 1][1]) {
        merged.push([...iv]);
      } else {
        merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], iv[1]);
      }
    }

    // Segments X libres dans [r, width - r]
    const xStart = r;
    const xEnd   = width - r;
    const segments = [];
    let cursor = xStart;
    for (const [bStart, bEnd] of merged) {
      const segEnd = Math.min(bStart, xEnd);
      if (segEnd > cursor + 1e-6) segments.push([cursor, segEnd]);
      cursor = Math.max(cursor, bEnd);
    }
    if (cursor < xEnd - 1e-6) segments.push([cursor, xEnd]);

    // Placer les cercles dans chaque segment libre
    for (const [segStart, segEnd] of segments) {
      const segSpan = segEnd - segStart;
      if (segSpan < -1e-6) continue;
      const n_seg = segSpan < 1e-6 ? 1
        : Math.ceil(segSpan / entraxeVoulu) + 1;
      const eSeg = n_seg > 1 ? segSpan / (n_seg - 1) : 0;
      for (let i = 0; i < n_seg; i++) {
        if (!isEdgeRow && i > 0 && i < n_seg - 1) continue;
        const x = n_seg === 1 ? (segStart + segEnd) / 2 : segStart + i * eSeg;
        holes.push({
          label: `C${holes.length + 1}`,
          x: Math.round(x * 10) / 10,
          y: Math.round(y * 10) / 10,
          diameter,
        });
      }
    }
  }

  // Zones bloquantes (exclusion + découpe) pour filtrage dans les sous-zones
  const exclusionZones = ac().zones.filter(z => z.type === 'exclusion' || z.type === 'decoupe');

  // Vérifie si un trou (x, y, r) chevauche une zone bloquante
  const collidesExclusion = (x, y, r) => exclusionZones.some(ez => {
    const cx = Math.max(ez.x, Math.min(x, ez.x + ez.w));
    const cy = Math.max(ez.y, Math.min(y, ez.y + ez.h));
    const dx = x - cx, dy = y - cy;
    return dx * dx + dy * dy < r * r;
  });

  // Sous-zones : calepinage indépendant dans chaque sous-zone
  for (const z of ac().zones) {
    if (z.type !== "souszone") continue;
    const szDiam = z.diameter;
    const szR = szDiam / 2;
    const szEntraxe = szDiam - z.recouvrement;
    if (!szDiam || szEntraxe <= 0 || szDiam > z.w || szDiam > z.h) continue;

    const szSpanX = z.w - szDiam;
    const szSpanY = z.h - szDiam;
    const szGapsX = szSpanX < 1e-6 ? 0 : Math.ceil(szSpanX / szEntraxe);
    const szGapsY = szSpanY < 1e-6 ? 0 : Math.ceil(szSpanY / szEntraxe);
    const szEX = szGapsX > 0 ? szSpanX / szGapsX : 0;
    const szEY = szGapsY > 0 ? szSpanY / szGapsY : 0;
    const nX = szGapsX + 1;
    const nY = szGapsY + 1;
    const prefix = z.label ? z.label + "-" : "SZ";
    let szCount = 0;
    for (let j = 0; j < nY; j++) {
      const szEdgeRow = !peripheralOnly || j === 0 || j === nY - 1;
      const y = z.y + szR + j * szEY;
      for (let i = 0; i < nX; i++) {
        if (!szEdgeRow && i > 0 && i < nX - 1) continue;
        const x = z.x + szR + i * szEX;
        // Exclure si le trou chevauche une zone d'exclusion
        if (collidesExclusion(x, y, szR)) continue;
        szCount++;
        holes.push({
          label: `${prefix}${szCount}`,
          x: Math.round(x * 10) / 10,
          y: Math.round(y * 10) / 10,
          diameter: szDiam,
          fromSouszone: true,
          rendForce:    !!z.rendementForce,
          rendForceVal: z.rendementForceVal || 5,
          profondeur: (z.profondeur != null && z.profondeur > 0) ? z.profondeur : null,
        });
      }
    }

    // Calepinage intelligent dans la sous-zone
    if (z.smartDiam) {
      const szAllowed = (z.smartDiameters || "50;100;150;200")
        .split(';').map(Number).filter(n => n > 0 && n < szDiam);
      if (szAllowed.length > 0) {
        const szSurface = { width: z.w, height: z.h };
        // Trous déjà placés dans cette sous-zone, en coordonnées relatives
        const szBase = holes
          .filter(h => h.fromSouszone)
          .slice(-szCount)
          .map(h => ({ ...h, x: h.x - z.x, y: h.y - z.y }));
        const extra = applyAdaptiveDiameter(
          szBase, szDiam, szAllowed, szSurface, [],
          z.smartMinArea ?? 100,
          (z.smartMaxOverlap ?? 30) / 100
        );
        // Ajouter uniquement les nouveaux trous (après szBase)
        for (let ei = szBase.length; ei < extra.length; ei++) {
          const eh = extra[ei];
          holes.push({
            label: `${prefix}S${ei - szBase.length + 1}`,
            x: Math.round((eh.x + z.x) * 10) / 10,
            y: Math.round((eh.y + z.y) * 10) / 10,
            diameter: eh.diameter,
            fromSouszone: true,
            rendForce:    !!z.rendementForce,
            rendForceVal: z.rendementForceVal || 5,
            profondeur: (z.profondeur != null && z.profondeur > 0) ? z.profondeur : null,
          });
        }
      }
    }
  }

  return { totalHoles: holes.length, recouvrementNetY, holes };
}

// ── Basculer la visibilité des champs selon la nature de la couche ───────────
function _updateNatureUI(nature) {
  const isCirc = nature === 'circulaire';
  const wW = document.getElementById('surface-width-wrap');
  const wH = document.getElementById('surface-height-wrap');
  const wD = document.getElementById('surface-diametre-wrap');
  if (wW) wW.hidden = isCirc;
  if (wH) wH.hidden = isCirc;
  if (wD) wD.hidden = !isCirc;
}

function applySurfaceFromForm() {
  const nature = ui.surfaceNature?.value || 'rectangulaire';
  ac().surface.nature = nature;
  _updateNatureUI(nature);

  let width, height;
  if (nature === 'circulaire') {
    const diam = Number(ui.surfaceDiametre?.value);
    if (!Number.isFinite(diam) || diam <= 0) {
      setStatus('Diamètre de couche circulaire invalide.', true);
      return false;
    }
    width = diam; height = diam;
    ac().surface.diametre = diam;
  } else {
    width = Number(ui.width.value);
    height = Number(ui.height.value);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      setStatus("Dimensions de surface invalides.", true);
      return false;
    }
  }
  const gridStep = Number(ui.gridStep.value);

  ac().surface.width = width;
  ac().surface.height = height;
  ac().surface.gridStep = Number.isFinite(gridStep) ? Math.max(0, gridStep) : 0;
  ac().surface.showGrid = true;
  ac().surface.hasBottom = !!ui.surfaceHasBottom?.checked;
  ac().surface.maillageFerraillage = ui.surfaceMaillage?.value || "moyen";
  ac().surface.debouchantZ4 = !!ui.surfaceDebouchantZ4?.checked;
  ac().surface.rendementForce    = !!ui.surfaceRendForceEn?.checked;
  ac().surface.rendementForceVal = Number(ui.surfaceRendForceVal?.value) || 5;
  ac().surface.positionPreset = ui.surfacePositionPreset?.value || "center";
  ac().surface.niveau = ui.surfaceNiveau.value.trim() !== '' ? Number(ui.surfaceNiveau.value) : null;
  const prof = Number(ui.surfaceProfondeur.value);
  ac().surface.profondeur = Number.isFinite(prof) && prof > 0 ? prof : null;
  if (state.editMode === 'planSpecial' || ac().surface.positionPreset === "custom") {
    ac().surface.offsetX = Number(ui.surfaceOffsetX?.value) || 0;
    ac().surface.offsetZ = Number(ui.surfaceOffsetZ?.value) || 0;
  } else {
    applyCouchePresetOffsets(ac(), true);
    if (ui.surfaceOffsetX) ui.surfaceOffsetX.value = String(ac().surface.offsetX ?? 0);
    if (ui.surfaceOffsetZ) ui.surfaceOffsetZ.value = String(ac().surface.offsetZ ?? 0);
  }
  ac().surface.rotation = (Number(ui.surfaceRotation?.value) || 0) * (Math.PI / 180);
  // Champs spécifiques plan spécial
  if (state.editMode === 'planSpecial') {
    ac().surface.inclinaisonX = Number(document.getElementById('ps-surf-inclinX')?.value) || 0;
    ac().surface.inclinaisonZ = Number(document.getElementById('ps-surf-inclinZ')?.value) || 0;
    ac().surface.offsetY      = Number(document.getElementById('ps-surf-offsetY')?.value) || 0;
    renderPlansSpeciaux();
    render3D();
  } else {
    renderCouches();
  }

  renderPlan();
  setStatus("Surface mise à jour.");
  return true;
}

function addHoleFromForm() {
  const rawProf = parseNum(ui.holeProfondeur?.value);
  const hole = {
    label: ui.label.value.trim() || `C${ac().holes.length + 1}`,
    x: Math.round(parseNum(ui.x.value)),
    y: Math.round(parseNum(ui.y.value)),
    diameter: parseNum(ui.diameter.value),
    maillageFerraillage: ui.maillage?.value || "moyen",
    profondeur: (Number.isFinite(rawProf) && rawProf > 0) ? rawProf : null,
    manual: true,
  };

  if (
    !Number.isFinite(hole.x) ||
    !Number.isFinite(hole.y) ||
    !Number.isFinite(hole.diameter) ||
    hole.diameter <= 0
  ) {
    setStatus("Paramètres de carottage invalides.", true);
    return;
  }

  if (!isHoleInsideSurface(hole)) {
    setStatus("Le carottage sort de la surface.", true);
    return;
  }

  ac().holes.push(hole);
  renderTable();
  renderPlan();
  setStatus(`Carottage ${hole.label} ajouté.`);
  ui.holeForm.reset();
  ui.diameter.value = "200";
  if (ui.holeProfondeur) ui.holeProfondeur.value = "";
}

// ── Sauvegarde / Chargement complet de la trémie ────────────────────────────
function saveState() {
  const payload = {
    version: 1,
    savedAt: new Date().toISOString(),
    bloc: state.bloc,
    couches: state.couches,
    activeCoucheIndex: state.activeCoucheIndex,
    plansSpeciaux: state.plansSpeciaux,
    delaisState: { startDate: delaisState.startDate, antecedentOverrides: delaisState.antecedentOverrides, customTasks: delaisState.customTasks, _nextCTId: delaisState._nextCTId },
    coutsState: { TU: { ...coutsState.TU }, TA: { ...coutsState.TA } },
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const ts = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', 'h');
  link.download = `tremie-save_${ts}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus('Sauvegarde téléchargée.');
}

function _syncBlocForm() {
  const b = state.bloc;
  const f = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  f('bloc-width',  b.width);
  f('bloc-depth',  b.depth);
  f('bloc-height', b.height);
  f('bloc-niveau', b.niveau ?? 0);
  const vis = document.getElementById('bloc-visible');
  if (vis) vis.checked = !!b.visible;
}

// ── Migration des sauvegardes anciennes ─────────────────────────────────────
// Complète les champs absents sans écraser les valeurs existantes.
function _migrateSurface(s) {
  if (s.nature            == null) s.nature            = 'rectangulaire';
  if (s.diametre          == null) s.diametre          = s.width || 1500;
  if (s.debouchantZ4      == null) s.debouchantZ4      = false;
  if (s.rendementForce    == null) s.rendementForce    = false;
  if (s.rendementForceVal == null) s.rendementForceVal = 5;
}
function _migrateZone(z) {
  if (z.type === 'souszone') {
    if (z.rendementForce    == null) z.rendementForce    = false;
    if (z.rendementForceVal == null) z.rendementForceVal = 5;
  }
}
function _migrateLoadedState() {
  for (const couche of state.couches) {
    _migrateSurface(couche.surface);
    for (const z of (couche.zones || [])) _migrateZone(z);
  }
  for (const ps of (state.plansSpeciaux || [])) {
    _migrateSurface(ps.surface);
    for (const z of (ps.zones || [])) _migrateZone(z);
  }
}

function loadState(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    let data;
    try { data = JSON.parse(e.target.result); } catch { setStatus('Fichier invalide (JSON malformé).', true); return; }
    if (!data.couches || !Array.isArray(data.couches) || !data.bloc) {
      setStatus('Fichier invalide : structure inattendue.', true);
      return;
    }
    // Restore state
    state.couches = data.couches;
    state.bloc    = data.bloc;
    state.activeCoucheIndex = Math.min(data.activeCoucheIndex ?? 0, data.couches.length - 1);
    state.plansSpeciaux = data.plansSpeciaux || [];
    if (data.delaisState) Object.assign(delaisState, data.delaisState);
    if (data.coutsState) { if (data.coutsState.TU) Object.assign(coutsState.TU, data.coutsState.TU); if (data.coutsState.TA) Object.assign(coutsState.TA, data.coutsState.TA); }
    state.activePsIndex = 0;
    state.editMode = 'couche';
    state.selectedZoneIndex = null;
    // Migration : complète les champs manquants pour la compatibilité ascendante
    _migrateLoadedState();
    // Sync all UI
    _syncBlocForm();
    syncFormsToCouche();
    renderCouches();
    renderZones();
    renderTable();
    renderPlan();
    renderPlansSpeciaux();
    setStatus(`Sauvegarde chargée : ${state.couches.length} couche(s), fichier "${file.name}".${ state.plansSpeciaux.length ? ' ' + state.plansSpeciaux.length + ' plan(s) spécial/spéciaux.' : '' }`);
  };
  reader.readAsText(file);
}

function exportAsJson() {
  const payload = {
    generatedAt: new Date().toISOString(),
    couches: state.couches,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "calepinage-carottages.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus("Export JSON généré.");
}

// ── Export SolidWorks (.swp) ──────────────────────────────────────────────────
// ── Rectangle BSP subtraction helper (kept for potential reuse) ─────────────
function subtractZoneFromRects(rects, ex) {
  const result = [];
  for (const r of rects) {
    const ix1 = Math.max(r.x1, ex.x1), ix2 = Math.min(r.x2, ex.x2);
    const iz1 = Math.max(r.z1, ex.z1), iz2 = Math.min(r.z2, ex.z2);
    if (ix2 <= ix1 || iz2 <= iz1) { result.push(r); continue; }
    if (r.z1 < iz1) result.push({ x1: r.x1, z1: r.z1, x2: r.x2, z2: iz1 });
    if (iz2 < r.z2) result.push({ x1: r.x1, z1: iz2,  x2: r.x2, z2: r.z2 });
    if (r.x1 < ix1) result.push({ x1: r.x1, z1: iz1,  x2: ix1,  z2: iz2  });
    if (ix2 < r.x2) result.push({ x1: ix2,  z1: iz1,  x2: r.x2, z2: iz2  });
  }
  return result;
}

// ── Fusion de rectangles axe-alignés par compression de coordonnées + scanline ──
// Produit le nombre minimal de rectangles sans approximation.
function mergeRects(rects) {
  if (rects.length === 0) return [];
  const xs = [...new Set(rects.flatMap(r => [r.x1, r.x2]))].sort((a, b) => a - b);
  const zs = [...new Set(rects.flatMap(r => [r.z1, r.z2]))].sort((a, b) => a - b);
  const cols = xs.length - 1, rows = zs.length - 1;
  if (cols <= 0 || rows <= 0) return rects;

  // Cellule [ri,ci] couverte si elle est incluse dans au moins un rectangle source
  const grid = new Uint8Array(rows * cols);
  for (const r of rects) {
    const c0 = xs.indexOf(r.x1), c1 = xs.indexOf(r.x2);
    const r0 = zs.indexOf(r.z1), r1 = zs.indexOf(r.z2);
    for (let ri = r0; ri < r1; ri++)
      for (let ci = c0; ci < c1; ci++)
        grid[ri * cols + ci] = 1;
  }

  // Scanline : prolonger les runs identiques vers le bas
  const result = [];
  const prevRuns = new Map();
  for (let ri = 0; ri < rows; ri++) {
    const runs = [];
    let start = -1;
    for (let ci = 0; ci <= cols; ci++) {
      const occ = ci < cols && grid[ri * cols + ci];
      if (occ && start === -1) start = ci;
      else if (!occ && start !== -1) { runs.push([start, ci]); start = -1; }
    }
    const currentRuns = new Map();
    const usedPrev = new Set();
    for (const [c0, c1] of runs) {
      const key = `${c0},${c1}`;
      if (prevRuns.has(key)) {
        const p = prevRuns.get(key);
        currentRuns.set(key, { x1: p.x1, z1: p.z1, x2: p.x2, z2: zs[ri + 1] });
        usedPrev.add(key);
      } else {
        currentRuns.set(key, { x1: xs[c0], z1: zs[ri], x2: xs[c1], z2: zs[ri + 1] });
      }
    }
    for (const [key, rect] of prevRuns) if (!usedPrev.has(key)) result.push(rect);
    prevRuns.clear();
    for (const [k, v] of currentRuns) prevRuns.set(k, v);
  }
  for (const rect of prevRuns.values()) result.push(rect);
  return result;
}

// ── Rectangles "parois aplanies" : un rectangle par carottage, zones interdites soustraites exactement ──
// 1. Chaque carottage → carré diamètre × diamètre (emprise de la fraise)
// 2. Chaque zone interdite est soustraite exactement (BSP) → les zones interdites ne sont jamais touchées
// 3. Les rectangles résultants sont fusionnés pour minimiser le nombre d'opérations SolidWorks
function holesGridRects(holes, exclusionZones) {
  if (holes.length === 0) return [];

  // Un rectangle par carottage (emprise carrée = diamètre × diamètre)
  let rects = holes.map(h => ({
    x1: h.wx - h.diameter / 2,
    z1: h.wz - h.diameter / 2,
    x2: h.wx + h.diameter / 2,
    z2: h.wz + h.diameter / 2,
  }));

  // Soustraction exacte de chaque zone interdite
  for (const ex of exclusionZones) {
    rects = subtractZoneFromRects(rects, ex);
  }

  // Fusion des rectangles adjacents/chevauchants → minimum d'opérations
  return mergeRects(rects);
}

function exportSolidWorks(options = {}) {  const aplanies = options.aplanies || new Set();
  const totalHoles = state.couches.reduce((s, c) => s + c.holes.length, 0);
  if (totalHoles === 0) { setStatus("Aucun carottage a exporter.", true); return; }
  const coucheHoles = totalHoles;
  if (coucheHoles > 0 && !state.bloc.visible) { setStatus("Activez d'abord la dalle béton (onglet Vue 3D) pour exporter les couches.", true); return; }

  const bloc = state.bloc;

  // ── Recalcul des élévations absolues (identique à render3D) ─────────────────
  const GAP = 400;  // mm, même valeur que render3D
  let elev = 0;
  const coucheData = state.couches
    .filter(c => c.holes.length > 0)
    .map(c => {
      const s = c.surface;
      const prof = s.profondeur || 200;
      const hasNiv = (s.niveau !== null && s.niveau !== undefined && s.niveau !== '');
      const y1 = hasNiv ? Number(s.niveau) : elev + prof;
      const y0 = y1 - prof;
      if (!hasNiv) elev += prof + GAP;

      const rot = s.rotation || 0;
      const cosR = Math.cos(rot), sinR = Math.sin(rot);
      const ocx = (s.offsetX || 0) + s.width / 2;
      const ocz = (s.offsetZ || 0) + s.height / 2;

      const holes = c.holes.map(h => {
        const lx = h.x - s.width / 2, lz = h.y - s.height / 2;
        return {
          label:      h.label,
          wx:         ocx + lx * cosR - lz * sinR,
          wz:         ocz + lx * sinR + lz * cosR,
          diameter:   h.diameter,
          maillage:   h.maillageFerraillage || 'moyen',
          profondeur: (h.profondeur != null && h.profondeur > 0) ? h.profondeur : null,
        };
      });

      return {
        label:    c.label,
        y0, y1, prof, hasNiv,
        maillage: s.maillageFerraillage || 'moyen',
        debZ4:    !!s.debouchantZ4,
        holes,
        // Exclusion zones converted to world AABB (for "parois aplanies" decomposition)
        exclusionZones: (c.zones || [])
          .filter(z => z.type === 'exclusion')
          .map(z => {
            const corners = [
              [z.x,        z.y       ], [z.x + z.w, z.y       ],
              [z.x + z.w,  z.y + z.h ], [z.x,       z.y + z.h ],
            ].map(([lx, lz]) => {
              const clx = lx - s.width / 2, clz = lz - s.height / 2;
              return { wx: ocx + clx * cosR - clz * sinR, wz: ocz + clx * sinR + clz * cosR };
            });
            return {
              x1: Math.min(...corners.map(p => p.wx)), x2: Math.max(...corners.map(p => p.wx)),
              z1: Math.min(...corners.map(p => p.wz)), z2: Math.max(...corners.map(p => p.wz)),
            };
          }),
        decoupeZones: (c.zones || [])
          .filter(z => z.type === 'decoupe')
          .map(z => {
            const corners = [
              [z.x,        z.y       ], [z.x + z.w, z.y       ],
              [z.x + z.w,  z.y + z.h ], [z.x,       z.y + z.h ],
            ].map(([lx, lz]) => {
              const clx = lx - s.width / 2, clz = lz - s.height / 2;
              return { wx: ocx + clx * cosR - clz * sinR, wz: ocz + clx * sinR + clz * cosR };
            });
            return {
              label: z.label || 'Decoupe',
              profondeur: (z.profondeur != null && z.profondeur > 0) ? z.profondeur : null,
              x1: Math.min(...corners.map(p => p.wx)), x2: Math.max(...corners.map(p => p.wx)),
              z1: Math.min(...corners.map(p => p.wz)), z2: Math.max(...corners.map(p => p.wz)),
            };
          }),
      };
    });

  // ── Generation VBA (ANSI-safe: zero accent in generated .swb text) ──────────
  // All dimensions in metres (SolidWorks internal unit)
  // Axis mapping: X_SW = X_app, Z_SW = Z_app, Y_SW = elevation
  const m = v => (v / 1000).toFixed(7);
  const safe = s => String(s).replace(/[^A-Za-z0-9_-]/g, '_');
  const lines = [];
  const L = s => lines.push(s);

  // ── Header (comments only, no executable code) ───────────────────────────
  L(`' ================================================================`);
  L(`' SolidWorks Basic Macro - Calepinage Carottages Tremie`);
  L(`' Generated : ${new Date().toISOString()}`);
  L(`' Layers : ${coucheData.length}   Holes : ${totalHoles}`);
  L(`' Run via: Tools > Macros > Run > select this .swb file`);
  L(`' ================================================================`);
  L(``);

  // ── Sub main MUST come before any Function in SolidWorks Basic ───────────
  const blocVisible = state.bloc.visible;
  const BW = blocVisible ? m(bloc.width)  : m(1000);
  const BD = blocVisible ? m(bloc.depth)  : m(1000);
  const BH = blocVisible ? m(bloc.height) : m(200);
  const BNY = blocVisible ? m(bloc.niveau) : m(0);

  // SW coordinate system: Top Plane = XZ (Y is vertical/up).
  const blocNiveauNonZero = blocVisible && Number(bloc.niveau) !== 0;

  L(`Sub main()`);
  L(`    Dim swApp      As Object`);
  L(`    Dim swDoc      As Object`);
  L(`    Dim swFeat     As Object`);
  L(`    Dim swMark     As Object`);
  L(`    Dim tpl        As String`);
  L(`    Dim planName   As String`);
  L(`    Dim planRef    As Object`);
  L(`    Dim bOk        As Boolean`);
  L(`    Set swMark = Nothing`);
  L(``);
  L(`    MsgBox "Appuyez sur OK pour continuer...", vbInformation`);
  L(``);
  L(`    Set swApp = Application.SldWorks`);
  L(`    If swApp Is Nothing Then MsgBox "Cannot access SolidWorks API.", vbCritical : Exit Sub`);
  L(``);
  L(`    tpl = swApp.GetDocumentTemplate(1, "", 0, 0.0, 0.0)`);
  L(`    ' 1 = swDocPART (swDocumentTypes_e), returns the default part template path`);
  L(`    Set swDoc = swApp.NewDocument(tpl, 0, 0, 0)`);
  L(`    If swDoc Is Nothing Then MsgBox "Failed to create new document. Check default part template.", vbCritical : Exit Sub`);
  L(``);
  L(`    ' Find the actual name of the top horizontal plane (language-dependent)`);
  L(`    planName = GetTopPlaneName(swDoc)`);
  L(`    If planName = "" Then MsgBox "Top plane not found. Rename to: Top Plane / Plan de dessus / Dessus", vbCritical : Exit Sub`);
  L(``);

  if (blocNiveauNonZero) {
    L(`    ' Bloc top is at elevation ${bloc.niveau}mm: offset the top plane by ${BNY}m`);
    L(`    bOk = swDoc.Extension.SelectByID2(planName, "PLANE", 0.0, 0.0, 0.0, False, 0, swMark, 0)`);
    L(`    If Not bOk Then MsgBox "Cannot select top plane for offset.", vbCritical : Exit Sub`);
    const absBNY   = (Math.abs(Number(bloc.niveau)) / 1000).toFixed(7);
    const bFlipBNY  = Number(bloc.niveau) < 0 ? 264 : 8;  // 8=Distance, 264=Distance|OptionFlip(256)
    L(`    Set planRef = swDoc.FeatureManager.InsertRefPlane(${bFlipBNY}, ${absBNY}, 0, 0.0, 0, 0.0)`);
    L(`    If planRef Is Nothing Then MsgBox "InsertRefPlane BlocTop failed", vbCritical : Exit Sub`);
    L(`    planRef.Name = "Bloc-Top"`);
    L(`    swDoc.ClearSelection2 True`);
    L(`    swDoc.EditRebuild3`);
    L(`    planName = "Bloc-Top"`);
    L(``);
  }

  if (blocVisible) {
    L(`    ' ---- Sketch bloc footprint: rect (0,0,0) to (W,D,0) ----`);
    L(`    bOk = swDoc.Extension.SelectByID2(planName, "PLANE", 0.0, 0.0, 0.0, False, 0, swMark, 0)`);
    L(`    If Not bOk Then MsgBox "Cannot select plane for block sketch.", vbCritical : Exit Sub`);
    L(`    swDoc.SketchManager.InsertSketch True`);
    L(`    Call swDoc.SketchManager.CreateCornerRectangle(0.0, 0.0, 0.0, ${BW}, ${BD}, 0.0)`);
    L(`    swDoc.ClearSelection2 True`);
    L(`    swDoc.SketchManager.InsertSketch True`);
    L(`    ' Dir=True -> extrude in -Y direction (downward), Blind by ${bloc.height}mm`);
    L(`    Set swFeat = swDoc.FeatureManager.FeatureExtrusion3(True, False, True, 0, 0, ${BH}, 0.0, False, False, False, False, 0.0, 0.0, False, False, False, False, True, False, True, 0, 0.0, False)`);
    L(`    If swFeat Is Nothing Then MsgBox "Block extrusion failed.", vbCritical : Exit Sub`);
    L(`    swFeat.Name = "Bloc-Beton"`);
    L(``);
  }

  // ── Phase 1: create ALL offset reference planes BEFORE cutting any hole ──────
  // Only when the user explicitly set a niveau different from bloc.niveau
  const offsetLayers = coucheData.filter(cd =>
    cd.hasNiv && Math.abs((cd.y1 - bloc.niveau) / 1000) > 1e-6
  );
  if (offsetLayers.length > 0) {
    L(`    ' ==== Phase 1: create offset reference planes ====`);
    for (const cd of offsetLayers) {
      const absOffsetM  = Math.abs((cd.y1 - bloc.niveau) / 1000).toFixed(7);
      const bFlipStr    = (cd.y1 - bloc.niveau) < 0 ? 264 : 8;  // 8=Distance, 264=Distance|OptionFlip(256)
      const planSafeName = `Plan-${safe(cd.label)}`;
      L(`    ' Offset plane for ${safe(cd.label)}: ${cd.y1 - bloc.niveau}mm from bloc top`);
      L(`    bOk = swDoc.Extension.SelectByID2(planName, "PLANE", 0.0, 0.0, 0.0, False, 0, swMark, 0)`);
      L(`    If Not bOk Then MsgBox "Cannot select top plane for ${safe(cd.label)}", vbCritical : Exit Sub`);
      L(`    Set planRef = swDoc.FeatureManager.InsertRefPlane(${bFlipStr}, ${absOffsetM}, 0, 0.0, 0, 0.0)`);
      L(`    If planRef Is Nothing Then MsgBox "InsertRefPlane failed ${safe(cd.label)}", vbCritical : Exit Sub`);
      L(`    planRef.Name = "${planSafeName}"`);
      L(`    swDoc.ClearSelection2 True`);
      L(`    swDoc.EditRebuild3`);
      L(``);
    }
    L(``);
  }

  // ── Phase 2: cut all holes — one Call per hole (avoids Sub size limit) ────────
  L(`    ' ==== Phase 2: cut all holes ====`);
  for (const cd of coucheData) {
    const profm        = m(cd.prof);
    const layerOffset  = (cd.y1 - bloc.niveau) / 1000;
    const hasLayerOffset = cd.hasNiv && Math.abs(layerOffset) > 1e-6;
    const pArg  = hasLayerOffset ? `"Plan-${safe(cd.label)}"` : 'planName';

    L(`    ' ---- Layer ${safe(cd.label)}: ${cd.holes.length} hole(s), depth=${cd.prof}mm ----`);

    if (aplanies.has(cd.label)) {
      // Parois aplanies : grouper par profondeur effective, rectangles fusionnés + trous individuels
      const byDepth = new Map();
      for (const h of cd.holes) {
        const depth = (h.profondeur != null) ? h.profondeur : cd.prof;
        if (!byDepth.has(depth)) byDepth.set(depth, []);
        byDepth.get(depth).push(h);
      }
      let rectIdx = 0;
      for (const [depth, groupHoles] of byDepth) {
        const gprofm = m(depth);
        // Rectangles fusionnés pour ce groupe de profondeur
        const rects = holesGridRects(groupHoles, cd.exclusionZones);
        rects.forEach(r => {
          rectIdx++;
          const rz1 = ((bloc.depth - r.z2) / 1000).toFixed(7);
          const rz2 = ((bloc.depth - r.z1) / 1000).toFixed(7);
          L(`    Call CutRect(swDoc, swMark, ${pArg}, ${m(r.x1)}, ${rz1}, ${m(r.x2)}, ${rz2}, ${gprofm}, "${safe(cd.label)}_${rectIdx}")`);
        });
        // Trous individuels (découpe circulaire) pour ce groupe
        for (const h of groupHoles) {
          const cx = m(h.wx);
          const cz = ((bloc.depth - h.wz) / 1000).toFixed(7);
          const r  = m(h.diameter / 2);
          L(`    Call CutHole(swDoc, swMark, ${pArg}, ${cx}, ${cz}, ${r}, ${gprofm}, "${safe(h.label)}")`);
        }
      }
    } else {
      for (const h of cd.holes) {
        const cx = m(h.wx);
        const cz = ((bloc.depth - h.wz) / 1000).toFixed(7);
        const r  = m(h.diameter / 2);
        const hprofm = (h.profondeur != null) ? m(h.profondeur) : profm;
        L(`    Call CutHole(swDoc, swMark, ${pArg}, ${cx}, ${cz}, ${r}, ${hprofm}, "${safe(h.label)}")`);
      }
    }
    // Découpes à la disqueuse — profondeur = zone.profondeur si renseignée, sinon profondeur de la couche
    if (cd.decoupeZones.length > 0) {
      L(`    ' Rebuild avant découpes (necessaire apres les trous)`);
      L(`    swDoc.EditRebuild3`);
      let dIdx = 0;
      for (const dz of cd.decoupeZones) {
        dIdx++;
        const TOL = 5e-4; // 0.5mm expansion to avoid tangent edges (same fix as CutHole radius)
        const dx1 = (dz.x1 / 1000 - TOL).toFixed(7);
        const dx2 = (dz.x2 / 1000 + TOL).toFixed(7);
        const rz1 = ((bloc.depth - dz.z2) / 1000 - TOL).toFixed(7);
        const rz2 = ((bloc.depth - dz.z1) / 1000 + TOL).toFixed(7);
        const dzProfm = dz.profondeur != null ? m(dz.profondeur) : profm;
        L(`    Call CutRect(swDoc, swMark, ${pArg}, ${dx1}, ${rz1}, ${dx2}, ${rz2}, ${dzProfm}, "${safe(cd.label)}_D${dIdx}")`)
        L(`    swDoc.EditRebuild3`);
      }
    }
    L(``);
  }

  // ── Phase 3: Plans spéciaux — ignorés pour le moment (pas encore supportés)
  // TODO: implémenter l'export des plans spéciaux inclinés

  L(`    swDoc.ViewZoomtofit2`);
  L(`    swDoc.ShowNamedView2 "*Isometric", 7`);
  L(`    swDoc.GraphicsRedraw2`);
  L(`    MsgBox "Done! ${totalHoles} hole(s) in ${coucheData.length} layer(s).", vbInformation`);
  L(`End Sub`);
  L(``);
  L(`' ── Helper: cut one circular hole ─────────────────────────────────────────`);
  L(`Sub CutHole(swD As Object, swMk As Object, pName As String, cx As Double, cz As Double, r As Double, d As Double, hName As String)`);
  L(`    Dim bOk    As Boolean`);
  L(`    Dim swFeat As Object`);
  L(`    bOk = swD.Extension.SelectByID2(pName, "PLANE", 0.0, 0.0, 0.0, False, 0, swMk, 0)`);
  L(`    If Not bOk Then MsgBox "Cannot select plane: " & hName, vbCritical : Exit Sub`);
  L(`    swD.SketchManager.InsertSketch True`);
  L(`    swD.SketchManager.AddToDB = True`);
  L(`    Call swD.SketchManager.CreateCircleByRadius(cx, cz, 0.0, r + 5E-4)`);
  L(`    swD.SketchManager.AddToDB = False`);
  L(`    swD.ClearSelection2 True`);
  L(`    swD.SketchManager.InsertSketch True`);
  L(`    Set swFeat = swD.FeatureManager.FeatureCut4(True, False, False, 0, 0, d, 0.01, False, False, False, False, 1.74532925199433E-02, 1.74532925199433E-02, False, False, False, False, False, True, True, True, True, False, 0, 0, False, False)`);
  L(`    If swFeat Is Nothing Then MsgBox "Cut failed: " & hName, vbExclamation`);
  L(`    If Not swFeat Is Nothing Then swFeat.Name = "Cut-" & hName`);
  L(`End Sub`);
  L(``);
  L(`' ── Helper: cut one rectangular pocket (parois aplanies) ──────────────────`);
  L(`Sub CutRect(swD As Object, swMk As Object, pName As String, x1 As Double, z1 As Double, x2 As Double, z2 As Double, d As Double, rName As String)`);
  L(`    Dim bOk    As Boolean`);
  L(`    Dim swFeat As Object`);
  L(`    bOk = swD.Extension.SelectByID2(pName, "PLANE", 0.0, 0.0, 0.0, False, 0, swMk, 0)`);
  L(`    If Not bOk Then MsgBox "Cannot select plane: " & rName, vbCritical : Exit Sub`);
  L(`    swD.SketchManager.InsertSketch True`);
  L(`    swD.SketchManager.AddToDB = True`);
  L(`    Call swD.SketchManager.CreateCornerRectangle(x1, z1, 0.0, x2, z2, 0.0)`);
  L(`    swD.SketchManager.AddToDB = False`);
  L(`    swD.ClearSelection2 True`);
  L(`    swD.SketchManager.InsertSketch True`);
  L(`    Set swFeat = swD.FeatureManager.FeatureCut4(True, False, False, 0, 0, d, 0.01, False, False, False, False, 1.74532925199433E-02, 1.74532925199433E-02, False, False, False, False, False, True, True, True, True, False, 0, 0, False, False)`);
  L(`    If swFeat Is Nothing Then MsgBox "Rect cut failed: " & rName, vbExclamation`);
  L(`    If Not swFeat Is Nothing Then swFeat.Name = "Aplani-" & rName`);
  L(`End Sub`);
  L(``);
  L(`' ── Plan special: cree un plan incline par offset Y puis rotations X et Z ──`);
  L(`Sub CreatePlanSpecial(swD As Object, swMk As Object, pName As String, offY As Double, angX As Double, angZ As Double)`);
  L(`    ' 3 points monde definissant le plan incline (en metres) :`);
  L(`    '  axe local X  = (cosZ,  sinZ,  0)              => P1`);
  L(`    '  axe local Z  = (sinX*sinZ, -sinX*cosZ, cosX)  => P2`);
  L(`    Dim x0 As Double, y0 As Double, z0 As Double`);
  L(`    Dim x1 As Double, y1 As Double, z1 As Double`);
  L(`    Dim x2 As Double, y2 As Double, z2 As Double`);
  L(`    x0 = 0.0 : y0 = offY : z0 = 0.0`);
  L(`    x1 = Cos(angZ)           : y1 = offY + Sin(angZ)           : z1 = 0.0`);
  L(`    x2 = Sin(angX)*Sin(angZ) : y2 = offY - Sin(angX)*Cos(angZ) : z2 = Cos(angX)`);
  L(`    ' 1. Creer esquisse 3D avec les 3 points`);
  L(`    swD.Insert3DSketch`);
  L(`    swD.SketchManager.AddToDB = True`);
  L(`    Call swD.SketchManager.CreatePoint(x0, y0, z0)`);
  L(`    Call swD.SketchManager.CreatePoint(x1, y1, z1)`);
  L(`    Call swD.SketchManager.CreatePoint(x2, y2, z2)`);
  L(`    swD.SketchManager.AddToDB = False`);
  L(`    swD.SketchManager.InsertSketch True`);
  L(`    swD.EditRebuild3`);
  L(`    ' 2. Recuperer les points via l arbre des features (references fraiches apres cloture)`);
  L(`    Dim skFeat As Object : Set skFeat = swD.FeatureByPositionReverse(0)`);
  L(`    Dim sk3D   As Object : Set sk3D   = skFeat.GetSpecificFeature2()`);
  L(`    Dim vPts   As Variant : vPts = sk3D.GetSketchPoints2()`);
  L(`    ' 3. Selectionner les 3 points avec les marques swRefPlaneSelectMark_e : FirstRef=1, SecondRef=4, ThirdRef=16`);
  L(`    Dim selMgr  As Object : Set selMgr = swD.SelectionManager`);
  L(`    Dim selData As Object : Set selData = selMgr.CreateSelectData`);
  L(`    swD.ClearSelection2 True`);
  L(`    selData.Mark = 1  : vPts(0).Select4 False, selData`);
  L(`    selData.Mark = 4  : vPts(1).Select4 True,  selData`);
  L(`    selData.Mark = 16 : vPts(2).Select4 True,  selData`);
  L(`    ' 4. Plan de reference par 3 points coincidents`);
  L(`    '    swRefPlaneReferenceConstraint_Coincident = 16`);
  L(`    Dim planRef As Object`);
  L(`    Set planRef = swD.FeatureManager.InsertRefPlane(16, 0, 16, 0, 16, 0)`);
  L(`    If Not planRef Is Nothing Then`);
  L(`        planRef.Name = pName`);
  L(`    Else`);
  L(`        MsgBox "Erreur creation plan " & pName & Chr(10) & _`);
  L(`               "SelectCount=" & swD.SelectionManager.GetSelectedObjectCount2(-1) & Chr(10) & _`);
  L(`               "P0=(" & x0 & "," & y0 & "," & z0 & ")" & Chr(10) & _`);
  L(`               "P1=(" & x1 & "," & y1 & "," & z1 & ")" & Chr(10) & _`);
  L(`               "P2=(" & x2 & "," & y2 & "," & z2 & ")", vbExclamation`);
  L(`    End If`);
  L(`    swD.ClearSelection2 True`);
  L(`    swD.EditRebuild3`);
  L(`End Sub`);
  L(``);
  L(`' ── Cut a circular hole on a plan special (local U/V coordinates) ──────────`);
  L(`Sub CutHolePlan(swD As Object, swMk As Object, pName As String, cu As Double, cv As Double, r As Double, d As Double, hName As String)`);
  L(`    Dim bOk    As Boolean`);
  L(`    Dim swFeat As Object`);
  L(`    bOk = swD.Extension.SelectByID2(pName, "PLANE", 0.0, 0.0, 0.0, False, 0, swMk, 0)`);
  L(`    If Not bOk Then MsgBox "CutHolePlan: cannot select plane " & pName & " for " & hName, vbCritical : Exit Sub`);
  L(`    swD.SketchManager.InsertSketch True`);
  L(`    swD.SketchManager.AddToDB = True`);
  L(`    Call swD.SketchManager.CreateCircleByRadius(cu, cv, 0.0, r + 5E-4)`);
  L(`    swD.SketchManager.AddToDB = False`);
  L(`    swD.ClearSelection2 True`);
  L(`    swD.SketchManager.InsertSketch True`);
  L(`    Set swFeat = swD.FeatureManager.FeatureCut4(True, False, False, 0, 0, d, 0.01, False, False, False, False, 1.74532925199433E-02, 1.74532925199433E-02, False, False, False, False, False, True, True, True, True, False, 0, 0, False, False)`);
  L(`    If swFeat Is Nothing Then MsgBox "CutHolePlan failed: " & hName, vbExclamation`);
  L(`    If Not swFeat Is Nothing Then swFeat.Name = "Cut-" & hName`);
  L(`End Sub`);
  L(``);
  L(`' ── Cut a rectangle on a plan special (local U/V coordinates) ──────────────`);
  L(`Sub CutRectPlan(swD As Object, swMk As Object, pName As String, u1 As Double, v1 As Double, u2 As Double, v2 As Double, d As Double, rName As String)`);
  L(`    Dim bOk    As Boolean`);
  L(`    Dim swFeat As Object`);
  L(`    bOk = swD.Extension.SelectByID2(pName, "PLANE", 0.0, 0.0, 0.0, False, 0, swMk, 0)`);
  L(`    If Not bOk Then MsgBox "CutRectPlan: cannot select plane " & pName & " for " & rName, vbCritical : Exit Sub`);
  L(`    swD.SketchManager.InsertSketch True`);
  L(`    swD.SketchManager.AddToDB = True`);
  L(`    Call swD.SketchManager.CreateCornerRectangle(u1, v1, 0.0, u2, v2, 0.0)`);
  L(`    swD.SketchManager.AddToDB = False`);
  L(`    swD.ClearSelection2 True`);
  L(`    swD.SketchManager.InsertSketch True`);
  L(`    Set swFeat = swD.FeatureManager.FeatureCut4(True, False, False, 0, 0, d, 0.01, False, False, False, False, 1.74532925199433E-02, 1.74532925199433E-02, False, False, False, False, False, True, True, True, True, False, 0, 0, False, False)`);
  L(`    If swFeat Is Nothing Then MsgBox "CutRectPlan failed: " & rName, vbExclamation`);
  L(`    If Not swFeat Is Nothing Then swFeat.Name = "Decoupe-" & rName`);
  L(`End Sub`);
  L(``);
  L(`' Returns the display name of the top horizontal plane (language-dependent)`);
  L(`Function GetTopPlaneName(swD As Object) As String`);
  L(`    Dim names(3) As String`);
  L(`    Dim i        As Integer`);
  L(`    Dim mk       As Object`);
  L(`    Set mk = Nothing`);
  L(`    names(0) = "Top Plane"`);
  L(`    names(1) = "Plan de dessus"`);
  L(`    names(2) = "Dessus"`);
  L(`    names(3) = "Oben"`);
  L(`    GetTopPlaneName = ""`);
  L(`    For i = 0 To 3`);
  L(`        If swD.Extension.SelectByID2(names(i), "PLANE", 0.0, 0.0, 0.0, False, 0, mk, 0) Then`);
  L(`            swD.ClearSelection2 True`);
  L(`            GetTopPlaneName = names(i)`);
  L(`            Exit Function`);
  L(`        End If`);
  L(`    Next i`);
  L(`End Function`);

  // Download .swb
  const macroText = lines.join('\r\n');
  const blob = new Blob([macroText], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'calepinage-carottages.swb';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus(`Macro SolidWorks exportee - ${totalHoles} carottage(s), ${coucheData.length} couche(s).`);
}

ui.surfaceForm.addEventListener("input", () => {
  applySurfaceFromForm();
});
ui.surfaceForm.addEventListener("change", () => {
  applySurfaceFromForm();
});
// Activer/désactiver l'input valeur rendement forcé selon la case
ui.surfaceRendForceEn?.addEventListener("change", () => {
  if (ui.surfaceRendForceVal) ui.surfaceRendForceVal.disabled = !ui.surfaceRendForceEn.checked;
});
// Idem pour sous-zone
ui.szRendForceEn?.addEventListener("change", () => {
  if (ui.szRendForceVal) ui.szRendForceVal.disabled = !ui.szRendForceEn.checked;
});

// ── Calepinage intelligent ────────────────────────────────────────────────────

// Sauvegarde les paramètres smart dans la couche active
function saveSmartParams() {
  const s = ac().surface;
  s.smartAdaptiveDiam  = !!ui.smartAdaptiveDiam?.checked;
  s.smartDiameters     = ui.smartDiameters?.value.trim() || "50;100;150;200;250;300;350;400;500";
  s.smartRemoveOverlap = !!ui.smartRemoveOverlap?.checked;
  s.smartOverlapPct    = Number(ui.smartOverlapPct?.value) || 80;
  s.smartMinArea       = Number(ui.smartMinArea?.value) ?? 100;
  s.smartMaxOverlap    = Number(ui.smartMaxOverlap?.value) || 30;
}

// Adapte les trous dont le diamètre dépasse l'espace disponible autour d'eux
// → essaie les diamètres autorisés par ordre décroissant
// Ajoute des trous dans les zones exiguës (où le diamètre de base ne rentre pas
// mais un diamètre plus petit le peut). Ne touche PAS aux trous déjà placés.
function applyAdaptiveDiameter(holes, baseDiameter, allowedDiams, surface, allZones, minArea, maxOverlapFrac) {
  const smallerDiams = allowedDiams
    .filter(d => d < baseDiameter && d > 0)
    .sort((a, b) => b - a); // décroissant : on essaie le plus grand d'abord

  if (smallerDiams.length === 0) return holes;

  const exclusionZones = allZones.filter(z => z.type === 'exclusion');

  // Collision entre un cercle (cx,cy,r) et un rectangle de zone
  const circleCollidesRect = (cx, cy, r, z) => {
    const nx = Math.max(z.x, Math.min(cx, z.x + z.w));
    const ny = Math.max(z.y, Math.min(cy, z.y + z.h));
    const dx = cx - nx, dy = cy - ny;
    return dx * dx + dy * dy < r * r - 1e-6;
  };

  // Une position est "exiguë" si le diamètre de base NE PEUT PAS y être placé
  const isTight = (cx, cy) => {
    const br = baseDiameter / 2;
    if (cx < br - 1e-6 || cx > surface.width  - br + 1e-6) return true;
    if (cy < br - 1e-6 || cy > surface.height - br + 1e-6) return true;
    if (allZones.some(z => {
      // Zone pont : utiliser les bords effectifs pour les sous-zones avec pont > 0
      if (z.type === 'souszone' && z.pont > 0) {
        const px = z.w * z.pont / 100, py = z.h * z.pont / 100;
        const ez = { x: z.x + px, y: z.y + py, w: z.w - 2*px, h: z.h - 2*py };
        if (ez.w <= 0 || ez.h <= 0) return false;
        return circleCollidesRect(cx, cy, br, ez);
      }
      return circleCollidesRect(cx, cy, br, z);
    })) return true;
    // Exigu si trop près d'un carottage existant : détection conservative à 10% de recouvrement
    const refRec = baseDiameter * 0.10;
    for (const h of holes) {
      const minDist = br + h.diameter / 2 - refRec;
      const dx = cx - h.x, dy = cy - h.y;
      if (dx * dx + dy * dy < minDist * minDist - 1e-6) return true;
    }
    return false;
  };

  // -- Pré-analyse : composantes connexes des poches inter-carottages --
  // Une cellule est "poche" si le grand diamètre ne peut PAS y être placé à cause
  // de la proximité d'un carottage déjà existant (= l'espace entre deux carottages).
  // Le BFS mesure l'aire de chaque poche pour le filtre smartMinArea.
  const isTightByHoles = (cx, cy) => {
    if (cx < 0 || cx > surface.width || cy < 0 || cy > surface.height) return false;
    const br = baseDiameter / 2;
    for (const h of holes) {
      // Détection conservative à 10% du grand diamètre
      const refRec = baseDiameter * 0.10;
      const minDist = br + h.diameter / 2 - refRec;
      const dx = cx - h.x, dy = cy - h.y;
      if (dx * dx + dy * dy < minDist * minDist - 1e-6) return true;
    }
    return false;
  };

  const probeStep = Math.max(smallerDiams[smallerDiams.length - 1] / 2, 5);
  const gCols = Math.ceil(surface.width  / probeStep) + 1;
  const gRows = Math.ceil(surface.height / probeStep) + 1;
  const grid  = new Int32Array(gCols * gRows); // 0 = libre, -1 = poche, >0 = id composante
  const gKey  = (c, r) => r * gCols + c;

  for (let ri = 0; ri < gRows; ri++)
    for (let ci = 0; ci < gCols; ci++)
      grid[gKey(ci, ri)] = isTightByHoles(ci * probeStep, ri * probeStep) ? -1 : 0;

  // BFS : regroupe les cellules de poche en composantes connexes
  let nextId = 1;
  const compArea = new Map(); // id → surface estimée (mm²)
  const dirs4 = [[-1,0],[1,0],[0,-1],[0,1]];
  for (let ri = 0; ri < gRows; ri++) {
    for (let ci = 0; ci < gCols; ci++) {
      if (grid[gKey(ci, ri)] !== -1) continue;
      const id = nextId++;
      const q  = [[ci, ri]];
      grid[gKey(ci, ri)] = id;
      let cnt = 0;
      while (q.length) {
        const [qc, qr] = q.pop();
        cnt++;
        for (const [dc, dr] of dirs4) {
          const nc = qc + dc, nr = qr + dr;
          if (nc < 0 || nc >= gCols || nr < 0 || nr >= gRows) continue;
          if (grid[gKey(nc, nr)] !== -1) continue;
          grid[gKey(nc, nr)] = id;
          q.push([nc, nr]);
        }
      }
      compArea.set(id, cnt * probeStep * probeStep);
    }
  }

  // Retourne l'id de composante pour une position (x,y)
  // Retourne 0 si la position n'est pas dans une poche inter-carottages
  const getCompId = (x, y) => {
    const ci = Math.min(gCols - 1, Math.max(0, Math.round(x / probeStep)));
    const ri = Math.min(gRows - 1, Math.max(0, Math.round(y / probeStep)));
    return grid[gKey(ci, ri)];
  };

  const result = [...holes];

  // Vérifie si un petit trou à (cx,cy,r) est placeable.
  const collidesAny = (cx, cy, r, recMax) => {
    if (cx < r - 1e-6 || cx > surface.width  - r + 1e-6) return true;
    if (cy < r - 1e-6 || cy > surface.height - r + 1e-6) return true;
    if (exclusionZones.some(z => circleCollidesRect(cx, cy, r, z))) return true;
    if (allZones.filter(z => z.type !== 'exclusion').some(z => {
      // Zone pont : utiliser les bords effectifs pour les sous-zones avec pont > 0
      if (z.type === 'souszone' && z.pont > 0) {
        const px = z.w * z.pont / 100, py = z.h * z.pont / 100;
        const ez = { x: z.x + px, y: z.y + py, w: z.w - 2*px, h: z.h - 2*py };
        if (ez.w <= 0 || ez.h <= 0) return false;
        return circleCollidesRect(cx, cy, r, ez);
      }
      return circleCollidesRect(cx, cy, r, z);
    })) return true;
    for (const h of result) {
      const minDist = r + h.diameter / 2 - recMax;
      const dx = cx - h.x, dy = cy - h.y;
      if (dx * dx + dy * dy < minDist * minDist - 1e-6) return true;
    }
    return false;
  };

  for (const d of smallerDiams) {
    const r = d / 2;
    // Recouvrement permissif configurable (maxOverlapFrac) pour la détection de collision
    const recMax = d * maxOverlapFrac;
    // Pas de scan basé sur le recouvrement max pour une grille dense
    const step   = Math.max(d - recMax, d / 3);

    for (let y = r; y <= surface.height - r + 1e-6; y += step) {
      for (let x = r; x <= surface.width - r + 1e-6; x += step) {
        if (!isTight(x, y)) continue;
        // Filtrage par surface minimale de la poche inter-carottages
        // cid == 0 → pas une poche inter-carottages (bord, zone obstacle) → pas filtré
        // cid >  0 → poche entre carottages → filtré si aire < minArea
        if (minArea > 0) {
          const cid = getCompId(x, y);
          if (cid > 0 && (compArea.get(cid) ?? 0) < minArea) continue;
        }
        if (collidesAny(x, y, r, recMax)) continue;
        result.push({
          label:    `C${result.length + 1}`,
          x:        Math.round(x * 10) / 10,
          y:        Math.round(y * 10) / 10,
          diameter: d,
        });
      }
    }
  }

  return result;
}

// Supprime les trous dont la superposition dépasse le seuil
// overlpPct : 0–100, ex. 80 = si un trou couvre >80% d'un autre → le plus petit est retiré
function removeOverlappingHoles(holes, overlapPct) {
  const threshold = overlapPct / 100;
  const keep = new Array(holes.length).fill(true);
  for (let i = 0; i < holes.length; i++) {
    if (!keep[i]) continue;
    for (let j = i + 1; j < holes.length; j++) {
      if (!keep[j]) continue;
      const hi = holes[i], hj = holes[j];
      const ri = hi.diameter / 2, rj = hj.diameter / 2;
      const dx = hi.x - hj.x, dy = hi.y - hj.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= ri + rj) continue; // pas de chevauchement

      // Aire d'intersection de deux cercles
      let overlap = 0;
      if (dist <= Math.abs(ri - rj)) {
        // entièrement inclus
        overlap = Math.PI * Math.min(ri, rj) ** 2;
      } else if (isFinite(dist) && dist > 0) {
        const r1 = ri, r2 = rj;
        const clamp = v => Math.max(-1, Math.min(1, isFinite(v) ? v : 0));
        const a1 = 2 * Math.acos(clamp((dist * dist + r1 * r1 - r2 * r2) / (2 * dist * r1)));
        const a2 = 2 * Math.acos(clamp((dist * dist + r2 * r2 - r1 * r1) / (2 * dist * r2)));
        overlap = 0.5 * r1 * r1 * (a1 - Math.sin(a1)) + 0.5 * r2 * r2 * (a2 - Math.sin(a2));
      }
      const smallArea = Math.PI * Math.min(ri, rj) ** 2;
      if (overlap / smallArea > threshold) {
        // Supprimer le plus petit (ou j si diamètres égaux)
        if (ri <= rj) keep[i] = false;
        else          keep[j] = false;
      }
    }
  }
  return holes.filter((_, idx) => keep[idx]);
}

// ── Calepinage concentrique pour couche circulaire ───────────────────────────
function autoLayoutCirc(diameter, recouvrementVoulu, peripheralOnly = false) {
  const R = (ac().surface.diametre || ac().surface.width) / 2;
  const r = diameter / 2;
  if (r > R) return { error: 'Le diam\u00e8tre du carottage d\u00e9passe celui de la couche circulaire.' };
  const entraxe = diameter - recouvrementVoulu;
  if (entraxe <= 0) return { error: 'Recouvrement sup\u00e9rieur ou \u00e9gal au diam\u00e8tre : entraxe nul ou n\u00e9gatif.' };
  const cx = R, cy = R;

  // Helper : collision cercle (hx, hy, hr) avec zone rectangulaire (avec gestion du pont)
  const circleCollidesZone = (hx, hy, hr, z) => {
    let zx = z.x, zy = z.y, zw = z.w, zh = z.h;
    if (z.type === 'souszone' && z.pont > 0) {
      const px = z.w * z.pont / 100, py = z.h * z.pont / 100;
      zx += px; zw -= 2 * px;
      zy += py; zh -= 2 * py;
      if (zw <= 0 || zh <= 0) return false;
    }
    const nx = Math.max(zx, Math.min(hx, zx + zw));
    const ny = Math.max(zy, Math.min(hy, zy + zh));
    const dx = hx - nx, dy = hy - ny;
    return dx * dx + dy * dy < hr * hr;
  };

  const zones = ac().zones;
  // Zones qui bloquent le calepinage principal (toutes sauf les sous-zones)
  const blockingZones = zones.filter(z => z.type !== 'souszone');
  const isBlocked = (hx, hy) => blockingZones.some(z => circleCollidesZone(hx, hy, r, z));

  // Anneaux concentriques : distribution uniforme entre centre et bord.
  // On calcule d'abord le nombre d'anneaux (round), puis on les espace
  // régulièrement sur [outerR/n, 2*outerR/n, ..., outerR].
  // Cela évite l'artefact de l'ancienne approche (step fixe + bord forcé)
  // qui créait un écart variable — parfois très faible — avant l'anneau bord.
  const outerR = R - r;
  const ringRadii = [];
  if (outerR > 1e-6) {
    const nRings = Math.max(1, Math.round(outerR / entraxe));
    for (let k = 1; k <= nRings; k++) ringRadii.push(outerR * k / nRings);
  }

  const holes = [];
  // Carottage central (supprimé si périphérie seulement)
  if (!peripheralOnly && !isBlocked(cx, cy)) {
    holes.push({ label: 'C1', x: Math.round(cx * 10) / 10, y: Math.round(cy * 10) / 10, diameter });
  }
  // Anneaux : en mode périphérie, on ne garde que le dernier (bord)
  const ringsToPlace = peripheralOnly ? ringRadii.slice(-1) : ringRadii;
  for (const ringR of ringsToPlace) {
    // Math.round pour un espacement circonférentiel homogène sur tous les anneaux
    const N = Math.max(1, Math.round(2 * Math.PI * ringR / entraxe));
    const step = (2 * Math.PI) / N;
    for (let i = 0; i < N; i++) {
      const ang = i * step;
      const hx = cx + ringR * Math.cos(ang);
      const hy = cy + ringR * Math.sin(ang);
      if (isBlocked(hx, hy)) continue;
      holes.push({
        label: `C${holes.length + 1}`,
        x: Math.round(hx * 10) / 10,
        y: Math.round(hy * 10) / 10,
        diameter,
      });
    }
  }

  // \u2500\u2500 Sous-zones : calepinage ind\u00e9pendant (m\u00eame logique que pour les couches rectangulaires) \u2500\u2500
  const exclusionZones = zones.filter(z => z.type === 'exclusion' || z.type === 'decoupe');
  const collidesExclusion = (x, y, hr) => exclusionZones.some(z => circleCollidesZone(x, y, hr, z));

  for (const z of zones) {
    if (z.type !== 'souszone') continue;
    const szDiam = z.diameter;
    const szR = szDiam / 2;
    const szEntraxe = szDiam - z.recouvrement;
    if (!szDiam || szEntraxe <= 0 || szDiam > z.w || szDiam > z.h) continue;

    const szSpanX = z.w - szDiam;
    const szSpanY = z.h - szDiam;
    const szGapsX = szSpanX < 1e-6 ? 0 : Math.ceil(szSpanX / szEntraxe);
    const szGapsY = szSpanY < 1e-6 ? 0 : Math.ceil(szSpanY / szEntraxe);
    const szEX = szGapsX > 0 ? szSpanX / szGapsX : 0;
    const szEY = szGapsY > 0 ? szSpanY / szGapsY : 0;
    const nX = szGapsX + 1;
    const nY = szGapsY + 1;
    const prefix = z.label ? z.label + '-' : 'SZ';
    let szCount = 0;
    for (let j = 0; j < nY; j++) {
      const y = z.y + szR + j * szEY;
      for (let i = 0; i < nX; i++) {
        const x = z.x + szR + i * szEX;
        if (collidesExclusion(x, y, szR)) continue;
        szCount++;
        holes.push({
          label: `${prefix}${szCount}`,
          x: Math.round(x * 10) / 10,
          y: Math.round(y * 10) / 10,
          diameter: szDiam,
          fromSouszone: true,
          rendForce:    !!z.rendementForce,
          rendForceVal: z.rendementForceVal || 5,
          profondeur: (z.profondeur != null && z.profondeur > 0) ? z.profondeur : null,
        });
      }
    }

    // Calepinage intelligent dans la sous-zone
    if (z.smartDiam) {
      const szAllowed = (z.smartDiameters || '50;100;150;200')
        .split(';').map(Number).filter(n => n > 0 && n < szDiam);
      if (szAllowed.length > 0) {
        const szSurface = { width: z.w, height: z.h };
        const szBase = holes
          .filter(h => h.fromSouszone)
          .slice(-szCount)
          .map(h => ({ ...h, x: h.x - z.x, y: h.y - z.y }));
        const extra = applyAdaptiveDiameter(
          szBase, szDiam, szAllowed, szSurface, [],
          z.smartMinArea ?? 100,
          (z.smartMaxOverlap ?? 30) / 100
        );
        for (let ei = szBase.length; ei < extra.length; ei++) {
          const eh = extra[ei];
          holes.push({
            label: `${prefix}S${ei - szBase.length + 1}`,
            x: Math.round((eh.x + z.x) * 10) / 10,
            y: Math.round((eh.y + z.y) * 10) / 10,
            diameter: eh.diameter,
            fromSouszone: true,
            rendForce:    !!z.rendementForce,
            rendForceVal: z.rendementForceVal || 5,
            profondeur: (z.profondeur != null && z.profondeur > 0) ? z.profondeur : null,
          });
        }
      }
    }
  }

  return { totalHoles: holes.length, holes };
}

function runAutoLayout() {
  const diameter = Number(ui.autoDiameter.value);
  const recouvrementVoulu = Number(ui.autoRecouvrement.value);

  if (!Number.isFinite(diameter) || diameter <= 0 || !Number.isFinite(recouvrementVoulu)) {
    return;
  }

  ac().surface.lastDiameter = diameter;
  ac().surface.lastRecouvrement = recouvrementVoulu;

  // ── Calepinage circulaire ──────────────────────────────────────────────────
  // ── Calepinage circulaire ──────────────────────────────────────────────────────────
  if (ac().surface.nature === 'circulaire') {
    const peripheralOnly = !!ui.autoPeripheral?.checked;
    const result = autoLayoutCirc(diameter, recouvrementVoulu, peripheralOnly);
    if (result.error) { setStatus(result.error, true); ui.autoResult.hidden = true; return; }
    const manualHoles = ac().holes.filter(h => h.manual === true);
    ac().holes = result.holes;

    // ── Calepinage intelligent (même logique que couches rectangulaires) ──
    saveSmartParams();
    const surf = ac().surface;
    const diametre = surf.diametre || surf.width;
    if (surf.smartAdaptiveDiam) {
      const allowed = surf.smartDiameters
        .split(';').map(Number).filter(n => n > 0 && n < diameter);
      if (allowed.length > 0) {
        const surfXY = { width: diametre, height: diametre };
        ac().holes = applyAdaptiveDiameter(
          ac().holes, diameter, allowed, surfXY, ac().zones,
          surf.smartMinArea ?? 100,
          (surf.smartMaxOverlap ?? 30) / 100
        );
        // Filtrer les trous qui seraient tombes hors du disque (coins du bounding box)
        ac().holes = ac().holes.filter(h => isHoleInsideSurface(h));
      }
    }
    if (surf.smartRemoveOverlap) {
      ac().holes = removeOverlappingHoles(ac().holes, surf.smartOverlapPct);
    }

    ac().holes = ac().holes.concat(manualHoles);
    const placed = ac().holes.filter(h => !h.manual).length;
    const circMode = peripheralOnly ? 'anneau périphérique' : 'calepinage concentrique';
    ui.autoResult.innerHTML = `<div class="result-stats"><span><strong>${placed}</strong>&nbsp;carottages (${circMode})</span></div>`;
    ui.autoResult.hidden = false;
    renderTable(); renderPlan();
    setStatus(`Calepinage circulaire : ${placed} carottage(s) placé(s).`);
    return;
  }

  // ── Calepinage rectangulaire ───────────────────────────────────────────────
  const peripheralOnly = !!ui.autoPeripheral?.checked;
  const result = autoLayout(diameter, recouvrementVoulu, peripheralOnly);

  if (result.error) {
    setStatus(result.error, true);
    ui.autoResult.hidden = true;
    return;
  }

  // Conserver les carottages manuels (sans fromSouszone)
  const manualHoles = ac().holes.filter(h => h.manual === true);
  ac().holes = result.holes;

  // ── Calepinage intelligent ──────────────────────────────────────────────────
  saveSmartParams();
  const surf = ac().surface;
  const exclusionZones = ac().zones.filter(z => z.type === 'exclusion');

  if (surf.smartAdaptiveDiam) {
    const allowed = surf.smartDiameters
      .split(';').map(Number).filter(n => n > 0 && n < diameter);
    if (allowed.length > 0) {
      const surfXY = { width: surf.width, height: surf.height };
      ac().holes = applyAdaptiveDiameter(
        ac().holes, diameter, allowed, surfXY, ac().zones,
        surf.smartMinArea ?? 100,
        (surf.smartMaxOverlap ?? 30) / 100
      );
    }
  }

  if (surf.smartRemoveOverlap) {
    ac().holes = removeOverlappingHoles(ac().holes, surf.smartOverlapPct);
  }

  // Réintégrer les carottages manuels
  ac().holes = ac().holes.concat(manualHoles);
  // ───────────────────────────────────────────────────────────────────────────

  const fmtRec = (val, label) => {
    if (val === null) return `${label}&nbsp;: &mdash;`;
    const sign = val >= 0 ? "+" : "";
    return `${label}&nbsp;: ${sign}${val}&nbsp;mm`;
  };

  const entraxeVoulu = diameter - recouvrementVoulu;
  const spanX = ac().surface.width - diameter;
  const n_x_glob = spanX < entraxeVoulu ? 1 : Math.floor(spanX / entraxeVoulu) + 1;
  const entraxeNetX_glob = n_x_glob > 1 ? spanX / (n_x_glob - 1) : null;
  const recouvrementNetX_glob = entraxeNetX_glob !== null
    ? Math.round((diameter - entraxeNetX_glob) * 10) / 10
    : null;
  const xLine = ac().zones.length > 0
    ? `<span>X&nbsp;: adapté par zone</span>`
    : `<span>${n_x_glob}&nbsp;col.</span><span>${fmtRec(recouvrementNetX_glob, "Rec. X")}</span>`;

  const spanY = ac().surface.height - diameter;
  const n_y_glob = spanY < entraxeVoulu - 1e-6 ? 1 : Math.floor(spanY / entraxeVoulu) + 1;
  const yLine = ac().zones.length > 0
    ? `<span>Y&nbsp;: adapté par zone</span>`
    : `<span>${n_y_glob}&nbsp;lig.</span><span>${fmtRec(result.recouvrementNetY, "Rec. Y")}</span>`;

  ui.autoResult.innerHTML = `
    <div class="result-stats">
      <span><strong>${result.totalHoles}</strong>&nbsp;carottages</span>
      ${yLine}
      ${xLine}
    </div>
  `;
  ui.autoResult.hidden = false;

  renderTable();
  renderPlan();
  setStatus(`Calepinage automatique : ${result.totalHoles} carottage(s) placé(s).`);
}

let _autoDebounce = null;
ui.autoForm.addEventListener("input", () => {
  clearTimeout(_autoDebounce);
  _autoDebounce = setTimeout(runAutoLayout, 300);
});
ui.autoForm.addEventListener("change", () => {
  clearTimeout(_autoDebounce);
  _autoDebounce = setTimeout(runAutoLayout, 300);
});

// Listeners sur les champs "Calepinage intelligent" (hors auto-form)
[ui.smartAdaptiveDiam, ui.smartDiameters, ui.smartRemoveOverlap, ui.smartOverlapPct, ui.smartMinArea, ui.smartMaxOverlap]
  .forEach(el => {
    if (!el) return;
    el.addEventListener("input",  () => { clearTimeout(_autoDebounce); _autoDebounce = setTimeout(runAutoLayout, 300); });
    el.addEventListener("change", () => { clearTimeout(_autoDebounce); _autoDebounce = setTimeout(runAutoLayout, 300); });
  });

document.getElementById("btn-force-refresh")?.addEventListener("click", () => {
  applySurfaceFromForm();
  runAutoLayout();
  renderZones();
  renderTable();
  render3D();
  setStatus("Actualisation forcée.");
});

ui.holeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addHoleFromForm();
});

ui.holesBody.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) {
    return;
  }

  const index = Number(target.dataset.remove);
  if (Number.isInteger(index) && index >= 0) {
    const removed = ac().holes.splice(index, 1)[0];
    renderTable();
    renderPlan();
    setStatus(`Carottage ${removed.label} supprimé.`);
  }
});

ui.saveBtn?.addEventListener("click", saveState);
ui.loadInput?.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) { loadState(file); e.target.value = ""; }
});
ui.exportSwBtn?.addEventListener("click", openSwExportModal);

// ── Export AutoCAD 2D ───────────────────────────────────────────────────────
function _generateAcadScript(coucheIndex) {
  const c = state.couches[coucheIndex];
  if (!c) return '';
  const s = c.surface;
  const lines = [];

  // Rectangle de la couche (origine 0,0 → largeur × hauteur)
  lines.push(`rectangle 0,0 ${s.width},${s.height}`);

  // Rectangles des zones d'exclusion
  for (const z of (c.zones || [])) {
    if (z.type === 'exclusion') {
      lines.push(`rectangle ${z.x},${z.y} ${z.x + z.w},${z.y + z.h}`);
    }
  }

  // Cercles des carottages : centre + rayon
  for (const h of c.holes) {
    const r = Math.round(h.diameter / 2);
    lines.push(`cercle ${h.x},${h.y} ${r}`);
  }

  return lines.join('\n');
}

function _openAcadModal() {
  const sel = document.getElementById('acad-couche-select');
  const preview = document.getElementById('acad-preview');
  const overlay = document.getElementById('modal-acad-overlay');
  if (!sel || !preview || !overlay) return;

  const couches = state.couches;
  if (!couches.length) {
    sel.innerHTML = '<option value="">— Aucune couche —</option>';
    preview.textContent = 'Créez d\'abord des couches avec des carottages dans l\'Éditeur 2D.';
    overlay.hidden = false;
    document.getElementById('modal-acad-cancel').onclick = () => { overlay.hidden = true; };
    return;
  }

  // Remplir le select (afficher toutes les couches, indiquer celles sans trous)
  sel.innerHTML = couches
    .map((c, i) => {
      const n = c.holes.length;
      const lbl = c.label || `Couche ${i + 1}`;
      return `<option value="${i}">${lbl} — ${n} carottage${n !== 1 ? 's' : ''}${n === 0 ? ' (vide)' : ''}</option>`;
    })
    .join('');

  const refresh = () => {
    const script = _generateAcadScript(parseInt(sel.value));
    preview.textContent = script || '— Cette couche ne contient aucun carottage —';
  };
  sel.onchange = refresh;
  refresh();

  overlay.hidden = false;

  document.getElementById('modal-acad-cancel').onclick = () => { overlay.hidden = true; };
  document.getElementById('modal-acad-copy').onclick = () => {
    const script = _generateAcadScript(parseInt(sel.value));
    if (!script) return;
    const copyBtn = document.getElementById('modal-acad-copy');
    navigator.clipboard.writeText(script).then(() => {
      const orig = copyBtn.innerHTML;
      copyBtn.innerHTML = '✅ Copié !';
      copyBtn.disabled = true;
      setTimeout(() => { copyBtn.innerHTML = orig; copyBtn.disabled = false; }, 2000);
    }).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = script;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    });
  };
  document.getElementById('modal-acad-download').onclick = () => {
    const script = _generateAcadScript(parseInt(sel.value));
    if (!script) return;
    const ci = parseInt(sel.value);
    const label = (state.couches[ci]?.label || `couche-${ci + 1}`)
      .toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-_]/g, '');
    const blob = new Blob([script], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `autocad-${label}.scr`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
}

ui.exportAcadBtn?.addEventListener('click', _openAcadModal);

function openSwExportModal() {
  const psHoles = state.plansSpeciaux.reduce((s, ps) => s + (ps.holes ? ps.holes.length : 0), 0);
  const totalHoles = state.couches.reduce((s, c) => s + c.holes.length, 0) + psHoles;
  if (totalHoles === 0) { setStatus("Aucun carottage à exporter. Ajoutez des carottages sur une couche ou un plan spécial.", true); return; }
  if (!state.bloc.visible && state.couches.reduce((s, c) => s + c.holes.length, 0) > 0) { setStatus("Activez d'abord la dalle béton (onglet Vue 3D).", true); return; }

  const bloc = state.bloc;
  const GAP = 400;
  let elev = 0;
  const rows = state.couches.filter(c => c.holes.length > 0).map(c => {
    const s = c.surface;
    const prof = s.profondeur || 200;
    const hasNiv = s.niveau !== null && s.niveau !== undefined && s.niveau !== '';
    const y1 = hasNiv ? Number(s.niveau) : elev + prof;
    if (!hasNiv) elev += prof + GAP;
    const niv = hasNiv ? `${Number(s.niveau)} mm` : `auto (${Math.round(y1)} mm)`;
    const labelEsc = c.label.replace(/"/g, '&quot;');
    return `<tr>
      <td><strong>${c.label}</strong></td>
      <td style="text-align:center">${c.holes.length}</td>
      <td style="text-align:center">${prof} mm</td>
      <td style="text-align:center">${niv}</td>
      <td style="text-align:center">
        <label style="cursor:pointer;user-select:none">
          <input type="checkbox" class="sw-aplani-check" data-label="${labelEsc}">
          <span style="font-size:0.8rem;color:#2d4a5e">Aplanies</span>
        </label>
      </td>
    </tr>`;
  }).join('');

  const psRows = state.plansSpeciaux.filter(ps => ps.holes && ps.holes.length > 0).map(ps => {
    const prof = ps.surface.profondeur || 200;
    const ix = ps.surface.inclinaisonX || 0, iz = ps.surface.inclinaisonZ || 0;
    return `<tr style="background:rgba(192,96,16,0.06)">
      <td><strong>📐 ${ps.label}</strong></td>
      <td style="text-align:center">${ps.holes.length}</td>
      <td style="text-align:center">${prof} mm</td>
      <td style="text-align:center">↕${ix}° ↔${iz}°</td>
      <td style="text-align:center;color:#6b8099;font-size:0.8rem">Plan incliné</td>
    </tr>`;
  }).join('');

  const allRows = rows + psRows;

  document.getElementById('modal-sw-body').innerHTML = `
    ${state.bloc.visible ? `<p>Dalle : <strong>${bloc.width} × ${bloc.height} × ${bloc.depth} mm</strong>  —  niveau top : <strong>${bloc.niveau ?? 0} mm</strong></p>` : `<p style="color:#b05020">⚠ Dalle béton non activée — seuls les plans spéciaux seront exportés.</p>`}
    <table class="modal-sw-table">
      <thead><tr><th>Couche / Plan</th><th>Carottages</th><th>Profondeur</th><th>Altitude / Incl.</th><th>Option</th></tr></thead>
      <tbody>${allRows}</tbody>
    </table>
    <p style="margin:12px 0 0;font-weight:700">Total : ${totalHoles} carottage(s)</p>
    <p style="margin:4px 0 0;color:#6b8099;font-size:0.82rem">La macro <code>.swb</code> sera téléchargée après confirmation.</p>`;

  const overlay = document.getElementById('modal-sw-overlay');
  overlay.hidden = false;
}

document.getElementById('modal-sw-cancel')?.addEventListener('click', () => {
  document.getElementById('modal-sw-overlay').hidden = true;
});
document.getElementById('modal-sw-confirm')?.addEventListener('click', () => {
  const aplanies = new Set();
  document.querySelectorAll('.sw-aplani-check').forEach(cb => {
    if (cb.checked) aplanies.add(cb.dataset.label);
  });
  document.getElementById('modal-sw-overlay').hidden = true;
  exportSolidWorks({ aplanies });
});
document.getElementById('modal-sw-overlay')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) e.currentTarget.hidden = true;
});

ui.clearBtn.addEventListener("click", () => {
  ac().holes = [];
  renderTable();
  renderPlan();
  setStatus("Tous les carottages ont été supprimés.");
});

function renderZones() {
  ui.zonesBody.innerHTML = "";
  const count = ac().zones.length;
  ui.zonesCount.textContent = count;
  ui.zonesCount.hidden = count === 0;
  ui.zonesEmpty.hidden = count > 0;
  ac().zones.forEach((zone, index) => {
    const typeLabel = zone.type === "decoupe" ? "Découpe" : zone.type === "souszone" ? "Sous-zone" : "Exclusion";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${zone.label || "—"}</td>
      <td>${typeLabel}</td>
      <td>${zone.profondeur != null ? zone.profondeur : "—"}</td>
      <td>${zone.x}</td>
      <td>${zone.y}</td>
      <td>${zone.w}</td>
      <td>${zone.h}</td>
      <td style="white-space:nowrap">
        <button data-edit-zone="${index}" title="Éditer">Éditer</button>
        <button data-remove-zone="${index}" title="Supprimer">Suppr.</button>
      </td>
    `;
    ui.zonesBody.appendChild(tr);
  });
}

// Afficher/masquer les champs sous-zone selon le type sélectionné
ui.zoneType.addEventListener("change", () => {
  const isSouszone = ui.zoneType.value === "souszone";
  ui.souzoneDiameterLabel.hidden    = !isSouszone;
  ui.souzoneRecouvrementLabel.hidden = !isSouszone;
  ui.souzoneSmartLabel.hidden        = !isSouszone;
  ui.souzoneSmartDiamsLabel.hidden   = !isSouszone;
  ui.souzoneSmartAreaLabel.hidden    = !isSouszone;
  ui.souzoneSmartOverlapLabel.hidden = !isSouszone;
  ui.souzonePontLabel.hidden         = !isSouszone;
  if (ui.souzoneRendForceLabel) ui.souzoneRendForceLabel.hidden = !isSouszone;
});

ui.zoneForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const type = ui.zoneType.value;
  const zProf = parseNum(ui.zoneProfondeur.value);
  const zone = {
    type,
    label: ui.zoneLabel.value.trim(),
    x: parseNum(ui.zoneX.value),
    y: parseNum(ui.zoneY.value),
    w: parseNum(ui.zoneW.value),
    h: parseNum(ui.zoneH.value),
    profondeur: Number.isFinite(zProf) && zProf > 0 ? zProf : null,
  };
  if (type === "souszone") {
    zone.diameter     = parseNum(ui.zoneDiameter.value);
    zone.recouvrement = parseNum(ui.zoneRecouvrement.value);
    zone.smartDiam         = !!ui.zoneSmartDiam?.checked;
    zone.smartDiameters    = ui.zoneSmartDiameters?.value.trim() || "50;100;150;200";
    zone.smartMinArea      = Number(ui.zoneSmartMinArea?.value) ?? 100;
    zone.smartMaxOverlap   = Number(ui.zoneSmartMaxOverlap?.value) || 30;
    zone.pont              = Math.min(49, Math.max(0, Number(ui.zonePont?.value) || 0));
    zone.rendementForce    = !!ui.szRendForceEn?.checked;
    zone.rendementForceVal = Number(ui.szRendForceVal?.value) || 5;
    if (!Number.isFinite(zone.diameter) || zone.diameter <= 0 ||
        !Number.isFinite(zone.recouvrement)) {
      setStatus("Paramètres de sous-zone invalides.", true);
      return;
    }
  }
  if (
    !Number.isFinite(zone.x) || !Number.isFinite(zone.y) ||
    !Number.isFinite(zone.w) || !Number.isFinite(zone.h) ||
    zone.w <= 0 || zone.h <= 0
  ) {
    setStatus("Paramètres de zone invalides.", true);
    return;
  }
  if (_editingZoneIndex !== null) {
    ac().zones[_editingZoneIndex] = zone;
    _editingZoneIndex = null;
    document.querySelector("#zone-form button[type='submit']").textContent = "Ajouter la zone";
    setStatus(`Zone "${zone.label || "sans nom"}" modifiée.`);
  } else {
    ac().zones.push(zone);
    setStatus(`Zone "${zone.label || "sans nom"}" ajoutée.`);
  }
  renderZones();
  renderPlan();
  // Si sous-zone modifiée/ajoutée, recalculer le calepinage complet
  if (zone.type === "souszone") {
    runAutoLayout();
  }
  render3D();
  ui.zoneForm.reset();
  ui.zoneType.value = "exclusion";
  ui.souzoneDiameterLabel.hidden    = true;
  ui.souzoneRecouvrementLabel.hidden = true;
  ui.souzoneSmartLabel.hidden        = true;
  ui.souzoneSmartDiamsLabel.hidden   = true;
  ui.souzoneSmartAreaLabel.hidden    = true;
  ui.souzoneSmartOverlapLabel.hidden = true;
  ui.souzonePontLabel.hidden         = true;
  if (ui.souzoneRendForceLabel) ui.souzoneRendForceLabel.hidden = true;
  ui.zoneW.value = "500";
  ui.zoneH.value = "500";
  ui.zoneProfondeur.value = "";

});

// Index de la zone en cours d'édition (null = création)
let _editingZoneIndex = null;

// Bascule vers un onglet interne (tab-btn / tab-panel)
function activateTab(tabName) {
  document.querySelectorAll(".tab-btn").forEach((b) => {
    const isTarget = b.dataset.tab === tabName;
    b.classList.toggle("active", isTarget);
    b.setAttribute("aria-selected", isTarget ? "true" : "false");
  });
  document.querySelectorAll(".tab-panel").forEach((p) => { p.hidden = true; });
  const panel = document.getElementById(`tab-${tabName}`);
  if (panel) panel.hidden = false;
}

// Ouvre le formulaire d'édition pour la zone d'index idx
function openZoneEdit(idx) {
  const z = ac().zones[idx];
  if (!z) return;
  _editingZoneIndex = idx;
  ui.zoneType.value       = z.type;
  ui.zoneLabel.value      = z.label || "";
  ui.zoneX.value          = z.x;
  ui.zoneY.value          = z.y;
  ui.zoneW.value          = z.w;
  ui.zoneH.value          = z.h;

  ui.zoneProfondeur.value = z.profondeur != null ? z.profondeur : "";
  const isSouszone = z.type === "souszone";
  ui.souzoneDiameterLabel.hidden     = !isSouszone;
  ui.souzoneRecouvrementLabel.hidden = !isSouszone;
  ui.souzoneSmartLabel.hidden        = !isSouszone;
  ui.souzoneSmartDiamsLabel.hidden   = !isSouszone;
  ui.souzoneSmartAreaLabel.hidden    = !isSouszone;
  ui.souzoneSmartOverlapLabel.hidden = !isSouszone;
  ui.souzonePontLabel.hidden         = !isSouszone;
  if (ui.souzoneRendForceLabel) ui.souzoneRendForceLabel.hidden = !isSouszone;
  if (isSouszone) {
    ui.zoneDiameter.value   = z.diameter || "";
    ui.zoneRecouvrement.value = z.recouvrement ?? "";
    if (ui.zoneSmartDiam)       ui.zoneSmartDiam.checked     = !!z.smartDiam;
    if (ui.zoneSmartDiameters)  ui.zoneSmartDiameters.value  = z.smartDiameters ?? "50;100;150;200";
    if (ui.zoneSmartMinArea)    ui.zoneSmartMinArea.value    = z.smartMinArea ?? 100;
    if (ui.zoneSmartMaxOverlap) ui.zoneSmartMaxOverlap.value = z.smartMaxOverlap ?? 30;
    if (ui.zonePont)            ui.zonePont.value            = z.pont ?? 0;
    if (ui.szRendForceEn)  ui.szRendForceEn.checked  = !!z.rendementForce;
    if (ui.szRendForceVal) {
      ui.szRendForceVal.value    = z.rendementForceVal ?? 5;
      ui.szRendForceVal.disabled = !z.rendementForce;
    }
  }
  document.querySelector("#zone-form button[type='submit']").textContent = "Valider la modification";
  activateTab("zones");
  ui.zoneForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

document.getElementById("zones-body").addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;

  // Supprimer
  const removeIdx = Number(target.dataset.removeZone);
  if (Number.isInteger(removeIdx) && target.dataset.removeZone !== undefined) {
    const removed = ac().zones.splice(removeIdx, 1)[0];
    if (_editingZoneIndex === removeIdx) {
      _editingZoneIndex = null;
      document.querySelector("#zone-form button[type='submit']").textContent = "Ajouter la zone";
      ui.zoneForm.reset();
      ui.zoneType.value = "exclusion";
      ui.souzoneDiameterLabel.hidden = true;
      ui.souzoneRecouvrementLabel.hidden = true;
      if (ui.souzoneRendForceLabel) ui.souzoneRendForceLabel.hidden = true;
      ui.zoneW.value = "500"; ui.zoneH.value = "500";
    }
    renderZones(); renderPlan();
    // Recalculer le calepinage si c'était une zone d'exclusion ou une sous-zone
    if (removed.type === 'exclusion' || removed.type === 'souszone') {
      runAutoLayout();
      render3D();
    }
    setStatus(`Zone "${removed.label || "sans nom"}" supprimée.`);
    return;
  }

  // Éditer : repopuler le formulaire
  const editIdx = Number(target.dataset.editZone);
  if (Number.isInteger(editIdx) && target.dataset.editZone !== undefined) {
    openZoneEdit(editIdx);
  }
});

// ── Gestion des couches ──────────────────────────────────────────────────────
function renderCouches() {
  ui.couchesBody.innerHTML = "";
  state.couches.forEach((couche, idx) => {
    const btn = document.createElement("button");
    btn.className = "couche-btn" + (idx === state.activeCoucheIndex ? " active" : "");
    btn.dataset.coucheIdx = idx;
    btn.title = (couche.surface.niveau !== null && couche.surface.niveau !== undefined && couche.surface.niveau !== '')
      ? `Niveau : ${couche.surface.niveau} mm${couche.surface.profondeur ? " — " + couche.surface.profondeur + " mm" : ""}`
      : couche.label;

    const labelSpan = document.createElement("span");
    labelSpan.textContent = couche.label;
    labelSpan.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      const newLabel = prompt("Renommer la couche :", couche.label);
      if (newLabel && newLabel.trim()) {
        couche.label = newLabel.trim();
        renderCouches();
      }
    });
    btn.appendChild(labelSpan);

    if (state.couches.length > 1) {
      const del = document.createElement("button");
      del.className = "couche-delete";
      del.title = "Supprimer cette couche";
      del.textContent = "✕";
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!confirm(`Supprimer "${couche.label}" et tous ses carottages ?`)) return;
        state.couches.splice(idx, 1);
        if (state.activeCoucheIndex >= state.couches.length) {
          state.activeCoucheIndex = state.couches.length - 1;
        }
        state.selectedZoneIndex = null;
        syncFormsToCouche();
        renderCouches();
        renderZones();
        renderTable();
        renderPlan();
      });
      btn.appendChild(del);
    }

    btn.addEventListener("click", () => {
      if (idx === state.activeCoucheIndex) return;
      state.activeCoucheIndex = idx;
      state.selectedZoneIndex = null;
      syncFormsToCouche();
      renderCouches();
      renderZones();
      renderTable();
      renderPlan();
    });

    const filtersDiv = document.createElement("div");
    filtersDiv.className = "couche-filters";
    const filterDefs = [
      { key: "displayIntersections", label: "Restants d'intersections", def: true  },
      { key: "displaySolid",         label: "Dalle béton équivalente",    def: false },
    ];
    for (const { key, label, def } of filterDefs) {
      if (couche.surface[key] === undefined) couche.surface[key] = def;
      const fLbl = document.createElement("label");
      fLbl.className = "couche-filter-item";
      const chk = document.createElement("input");
      chk.type = "checkbox";
      chk.checked = !!couche.surface[key];
      chk.addEventListener("change", (e) => {
        couche.surface[key] = e.target.checked;
        render3D();
      });
      fLbl.addEventListener("click", e => e.stopPropagation());
      fLbl.appendChild(chk);
      fLbl.appendChild(document.createTextNode("\u00a0" + label));
      filtersDiv.appendChild(fLbl);
    }

    const wrapper = document.createElement("div");
    wrapper.className = "couche-row";
    wrapper.appendChild(btn);
    wrapper.appendChild(filtersDiv);
    ui.couchesBody.appendChild(wrapper);
  });
}

function syncFormsToCouche() {
  const s = ac().surface;
  ui.width.value = s.width;
  ui.height.value = s.height;
  ui.gridStep.value = s.gridStep;
  if (ui.showGrid) ui.showGrid.checked = s.showGrid;
  if (ui.surfaceHasBottom) ui.surfaceHasBottom.checked = !!s.hasBottom;
  if (ui.surfaceMaillage) ui.surfaceMaillage.value = s.maillageFerraillage || "moyen";
  if (ui.surfaceDebouchantZ4) ui.surfaceDebouchantZ4.checked = !!s.debouchantZ4;
  if (ui.surfaceRendForceEn)  ui.surfaceRendForceEn.checked  = !!s.rendementForce;
  if (ui.surfaceRendForceVal) {
    ui.surfaceRendForceVal.value    = s.rendementForceVal ?? 5;
    ui.surfaceRendForceVal.disabled = !s.rendementForce;
  }
  if (ui.surfacePositionPreset) ui.surfacePositionPreset.value = s.positionPreset || "center";
  if (ui.surfaceOffsetX) ui.surfaceOffsetX.value = String(s.offsetX ?? 0);
  if (ui.surfaceOffsetZ) ui.surfaceOffsetZ.value = String(s.offsetZ ?? 0);
  if (ui.surfaceRotation) ui.surfaceRotation.value = String(Math.round(((s.rotation || 0) * 180 / Math.PI) * 100) / 100);
  ui.surfaceNiveau.value = (s.niveau !== null && s.niveau !== undefined && s.niveau !== '') ? s.niveau : '';
  ui.surfaceProfondeur.value = s.profondeur ?? "";
  if (ui.autoDiameter)     ui.autoDiameter.value     = s.lastDiameter     ?? 200;
  if (ui.autoRecouvrement) ui.autoRecouvrement.value = s.lastRecouvrement ?? 10;
  if (ui.autoPeripheral)   ui.autoPeripheral.checked  = !!s.lastPeripheral;
  if (ui.smartAdaptiveDiam)  ui.smartAdaptiveDiam.checked  = !!s.smartAdaptiveDiam;
  if (ui.smartDiameters)     ui.smartDiameters.value       = s.smartDiameters ?? "50;100;150;200;250;300;350;400;500";
  if (ui.smartRemoveOverlap) ui.smartRemoveOverlap.checked = !!s.smartRemoveOverlap;
  if (ui.smartOverlapPct)    ui.smartOverlapPct.value      = s.smartOverlapPct ?? 80;
  if (ui.smartMinArea)       ui.smartMinArea.value          = s.smartMinArea ?? 100;
  if (ui.smartMaxOverlap)    ui.smartMaxOverlap.value       = s.smartMaxOverlap ?? 30;
  ui.autoResult.hidden = true;
  // Nature circulaire
  if (ui.surfaceNature)   ui.surfaceNature.value   = s.nature   || 'rectangulaire';
  if (ui.surfaceDiametre) ui.surfaceDiametre.value = s.diametre ?? 1500;
  _updateNatureUI(s.nature || 'rectangulaire');
  // Champs plan spécial
  const psCtrl = document.getElementById('ps-surface-controls');
  if (psCtrl) {
    psCtrl.hidden = state.editMode !== 'planSpecial';
    if (state.editMode === 'planSpecial') {
      const ps = ac().surface;
      const elIX = document.getElementById('ps-surf-inclinX');
      const elIZ = document.getElementById('ps-surf-inclinZ');
      const elOY = document.getElementById('ps-surf-offsetY');
      if (elIX) elIX.value = ps.inclinaisonX ?? 0;
      if (elIZ) elIZ.value = ps.inclinaisonZ ?? 0;
      if (elOY) elOY.value = ps.offsetY ?? 0;
    }
  }
}

ui.surfacePositionPreset?.addEventListener("change", () => {
  const preset = ui.surfacePositionPreset.value || "center";
  ac().surface.positionPreset = preset;
  if (preset === "custom") return;
  applyCouchePresetOffsets(ac(), true);
  if (ui.surfaceOffsetX) ui.surfaceOffsetX.value = String(ac().surface.offsetX ?? 0);
  if (ui.surfaceOffsetZ) ui.surfaceOffsetZ.value = String(ac().surface.offsetZ ?? 0);
});

function switchPresetToCustomOnManualOffset() {
  if (!ui.surfacePositionPreset) return;
  if (ui.surfacePositionPreset.value !== "custom") {
    ui.surfacePositionPreset.value = "custom";
  }
}

ui.surfaceOffsetX?.addEventListener("input", switchPresetToCustomOnManualOffset);
ui.surfaceOffsetZ?.addEventListener("input", switchPresetToCustomOnManualOffset);

document.getElementById("btn-add-couche").addEventListener("click", () => {
  const n = state.couches.length + 1;
  state.couches.push(makeCouche(`Couche ${n}`));
  applyCouchePresetOffsets(state.couches[state.couches.length - 1]);
  state.activeCoucheIndex = state.couches.length - 1;
  state.selectedZoneIndex = null;
  syncFormsToCouche();
  renderCouches();
  renderZones();
  renderTable();
  renderPlan();
  setStatus(`Couche ${n} ajoutée.`);
});

// ── Gizmo interactif pour les zones ─────────────────────────────────────────
const drag = {
  active: false,
  type: null,       // 'move' | 'resize' | 'move-hole'
  zoneIndex: -1,
  holeIndex: -1,
  handle: null,
  originSvgX: 0,
  originSvgY: 0,
  originClientX: 0,
  originClientY: 0,
  moved: false,
  originZone: null,
  originHole: null,
};

function eventToSvgCoords(event) {
  const pt = ui.svg.createSVGPoint();
  pt.x = event.clientX;
  pt.y = event.clientY;
  return pt.matrixTransform(ui.svg.getScreenCTM().inverse());
}

ui.svg.addEventListener("mousedown", (event) => {
  if (measureState.active) {
    // Mode mesure : snap mousedown (plus fiable que click en SVG)
    const _s2 = ac().surface;
    const _W2 = _s2.width || _s2.diametre || 1500;
    const _H2 = _s2.height || _s2.diametre || 1500;
    const _tf2 = fitTransform(_W2, _H2);
    const _sv2 = eventToSvgCoords(event);
    const _mmX = (_sv2.x - _tf2.offsetX) / _tf2.scale;
    const _mmY = (_sv2.y - _tf2.offsetY) / _tf2.scale;
    const _step2 = (_s2.showGrid && _s2.gridStep > 0) ? _s2.gridStep : 500;
    const _snaps = [];
    for (let _mx = 0; _mx <= _W2; _mx += _step2)
      for (let _my = 0; _my <= _H2; _my += _step2)
        _snaps.push({ x: _mx, y: _my });
    const _holes2 = ac().holes;
    const _seen2 = new Set();
    for (let _i = 0; _i < _holes2.length - 1; _i++)
      for (let _j = _i + 1; _j < _holes2.length; _j++)
        for (const _p2 of _circleIntersections(_holes2[_i], _holes2[_j])) {
          const _k = _p2.x + ',' + _p2.y;
          if (!_seen2.has(_k)) { _seen2.add(_k); _snaps.push(_p2); }
        }
    const _thr = 30;
    let _best = null, _bestD2 = _thr * _thr;
    for (const _p of _snaps) {
      const _vp = mmToView(_p.x, _p.y, _tf2);
      const _d2 = (_vp.x - _sv2.x) ** 2 + (_vp.y - _sv2.y) ** 2;
      if (_d2 < _bestD2) { _bestD2 = _d2; _best = _p; }
    }
    if (_best) _measureClick(_best.x, _best.y);
    return;
  }
  // Clic sur une côte éditable → ne pas désélectionner
  if (event.target.closest('[data-role="cote"]')) return;
  // ── Carottage manuel cliqué ──────────────────────────────────────────────
  const holeEl = event.target.closest("[data-hole-idx]");
  if (holeEl) {
    event.preventDefault();
    const hi = Number(holeEl.dataset.holeIdx);
    state.selectedHoleIndex = hi;
    state.selectedZoneIndex = null;
    const svgPt = eventToSvgCoords(event);
    drag.active = true;
    drag.moved  = false;
    drag.holeIndex = hi;
    drag.zoneIndex = -1;
    drag.originSvgX = svgPt.x;
    drag.originSvgY = svgPt.y;
    drag.originClientX = event.clientX;
    drag.originClientY = event.clientY;
    drag.originHole = { ...ac().holes[hi] };
    drag.type = "move-hole";
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
    renderPlan();
    return;
  }

  const zoneGroup = event.target.closest("[data-zone-idx]");
  if (!zoneGroup) {
    if (state.selectedZoneIndex !== null || state.selectedHoleIndex !== null) {
      state.selectedZoneIndex = null;
      state.selectedHoleIndex = null;
      renderPlan();
    }
    return;
  }
  event.preventDefault();

  const zoneIndex = Number(zoneGroup.dataset.zoneIdx);
  state.selectedZoneIndex = zoneIndex;
  state.selectedHoleIndex = null;

  const svgPt = eventToSvgCoords(event);
  drag.active = true;
  drag.moved  = false;   // réinitialisé à chaque mousedown
  drag.zoneIndex = zoneIndex;
  drag.originSvgX = svgPt.x;
  drag.originSvgY = svgPt.y;
  drag.originClientX = event.clientX;  // pixels écran pour détecter le clic
  drag.originClientY = event.clientY;
  drag.originZone = { ...ac().zones[zoneIndex] };
  drag.type = event.target.dataset.role === "resize" ? "resize" : "move";
  drag.handle = event.target.dataset.handle ?? null;

  document.body.style.userSelect = "none";
  if (drag.type === "move") document.body.style.cursor = "grabbing";

  renderPlan();
});

document.addEventListener("mousemove", (event) => {
  if (!drag.active) return;
  event.preventDefault();

  const t = fitTransform(ac().surface.width, ac().surface.height);
  const svgPt = eventToSvgCoords(event);
  const dxMm = (svgPt.x - drag.originSvgX) / t.scale;
  const dyMm = (svgPt.y - drag.originSvgY) / t.scale;

  // Marquer comme déplacement si on a bougé de plus de 5px écran
  if (!drag.moved) {
    const dx = event.clientX - drag.originClientX;
    const dy = event.clientY - drag.originClientY;
    if (dx * dx + dy * dy > 25) drag.moved = true;
  }

  // ── Drag carottage manuel ──────────────────────────────────────────────
  if (drag.type === "move-hole") {
    const hole = ac().holes[drag.holeIndex];
    const o = drag.originHole;
    const r = o.diameter / 2;
    const { width, height } = ac().surface;
    hole.x = Math.round(Math.max(r, Math.min(o.x + dxMm, width  - r)));
    hole.y = Math.round(Math.max(r, Math.min(o.y + dyMm, height - r)));
    renderPlan();
    return;
  }

  const zone = ac().zones[drag.zoneIndex];
  const o = drag.originZone;
  const { width, height } = ac().surface;
  const minSize = 10;

  if (drag.type === "move") {
    zone.x = Math.round(Math.max(0, Math.min(o.x + dxMm, width  - o.w)) * 10) / 10;
    zone.y = Math.round(Math.max(0, Math.min(o.y + dyMm, height - o.h)) * 10) / 10;
  } else {
    const h = drag.handle;
    if (h.includes("e")) {
      zone.w = Math.round(Math.max(minSize, Math.min(o.w + dxMm, width  - zone.x)) * 10) / 10;
    }
    if (h.includes("s")) {
      zone.h = Math.round(Math.max(minSize, Math.min(o.h + dyMm, height - zone.y)) * 10) / 10;
    }
    if (h.includes("w")) {
      const newX = Math.max(0, Math.min(o.x + dxMm, o.x + o.w - minSize));
      zone.x = Math.round(newX * 10) / 10;
      zone.w = Math.round((o.x + o.w - zone.x) * 10) / 10;
    }
    if (h.includes("n")) {
      const newY = Math.max(0, Math.min(o.y + dyMm, o.y + o.h - minSize));
      zone.y = Math.round(newY * 10) / 10;
      zone.h = Math.round((o.y + o.h - zone.y) * 10) / 10;
    }
  }

  renderPlan();
});

document.addEventListener("mouseup", () => {
  if (!drag.active) return;
  const wasClick = !drag.moved;

  // ── Fin drag carottage manuel ────────────────────────────────────────────
  if (drag.type === "move-hole") {
    drag.active = false;
    drag.type = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    renderTable();
    renderPlan();
    return;
  }

  const zoneIndex = drag.zoneIndex;
  drag.active = false;
  drag.type = null;
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
  renderZones();
  runAutoLayout();
  render3D();
  // Clic simple sur une zone (sans déplacement) → ouvrir le formulaire d'édition
  if (wasClick && zoneIndex != null && zoneIndex >= 0) openZoneEdit(zoneIndex);
});

// ── Tab switching ─────────────────────────────────────────────────────────────
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const targetTab = btn.dataset.tab;
    activateTab(targetTab);
    // Quitter l'onglet Zones (ou n'importe quel onglet) → fermer le formulaire d'édition en cours
    if (_editingZoneIndex !== null && targetTab !== "zones") {
      _editingZoneIndex = null;
      document.querySelector("#zone-form button[type='submit']").textContent = "Ajouter la zone";
    }
  });
});

applySurfaceFromForm();
renderTable();
renderZones();
renderCouches();

// ── Bloc béton global ─────────────────────────────────────────────────────────
function _applyBlocAndRefresh() {
  const vW = Number(document.getElementById("bloc-width")?.value);
  const vD = Number(document.getElementById("bloc-depth")?.value);
  const vH = Number(document.getElementById("bloc-height")?.value);
  const vN = Number(document.getElementById("bloc-niveau")?.value);
  if (vW >= 100) state.bloc.width   = vW;
  if (vD >= 100) state.bloc.depth   = vD;
  if (vH >= 10)  state.bloc.height  = vH;
  if (!isNaN(vN)) state.bloc.niveau = vN;
  state.bloc.visible = document.getElementById("bloc-visible")?.checked ?? true;
  applyAllCouchePresetOffsets();
  renderPlan();
  if (!document.getElementById("main-tab-3d")?.hidden) render3D();
}

// Appliquer au submit (bouton) ET en direct sur chaque champ
document.getElementById("bloc-form")?.addEventListener("submit", (e) => {
  e.preventDefault();
  _applyBlocAndRefresh();
});
["bloc-width", "bloc-depth", "bloc-height", "bloc-niveau"].forEach(id => {
  document.getElementById(id)?.addEventListener("input", _applyBlocAndRefresh);
});
document.getElementById("bloc-visible")?.addEventListener("change", _applyBlocAndRefresh);

// ── Vue 3D ────────────────────────────────────────────────────────────────────

function project3D(wx, wy, wz) {
  const cosA = Math.cos(view3d.azimuth), sinA = Math.sin(view3d.azimuth);
  const cosT = Math.cos(view3d.tilt),    sinT = Math.sin(view3d.tilt);
  const rx = wx * cosA + wz * sinA;
  const rz = -wx * sinA + wz * cosA;
  return [rx, -(wy * cosT - rz * sinT)];
}

function render3D() {
  let canvas = document.getElementById("canvas-3d");
  if (!canvas || !canvas.offsetParent) return;
  const dpr = window.devicePixelRatio || 1;
  const cw = canvas.clientWidth, ch = canvas.clientHeight;
  if (cw === 0 || ch === 0) return;
  canvas.width = Math.round(cw * dpr);
  canvas.height = Math.round(ch * dpr);
  let ctx = canvas.getContext("2d");
  // Si le canvas a un contexte WebGL résiduel, on le remplace par un neuf
  if (!ctx) {
    const fresh = document.createElement("canvas");
    fresh.id = "canvas-3d";
    fresh.className = canvas.className;
    canvas.parentNode.replaceChild(fresh, canvas);
    canvas = fresh;
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    ctx = canvas.getContext("2d");
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#eef1f5";
  ctx.fillRect(0, 0, cw, ch);

  if (state.couches.length === 0) {
    ctx.fillStyle = "#4a5a6b";
    ctx.font = "16px Bahnschrift, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Aucune couche définie", cw / 2, ch / 2);
    return;
  }

  // Palette béton : tons gris-pierre réalistes, légèrement teintés par couche
  const PALETTE = [
    { top: "#b0b8b5", side: "#818984", front: "#636b68", stroke: "#4a504e", tint: "rgba(26,138,126,0.18)" },
    { top: "#b8b0a8", side: "#888078", front: "#6a6258", stroke: "#504840", tint: "rgba(232,133,74,0.18)" },
    { top: "#aab0ba", side: "#7c8290", front: "#606870", stroke: "#484e55", tint: "rgba(45,100,153,0.18)" },
    { top: "#b8aeac", side: "#887e7c", front: "#6a6260", stroke: "#504848", tint: "rgba(159,56,64,0.18)" },
    { top: "#b0acb8", side: "#807c88", front: "#626068", stroke: "#4a4850", tint: "rgba(109,94,128,0.18)" },
    { top: "#acb8b0", side: "#7c8880", front: "#606a62", stroke: "#484e48", tint: "rgba(62,158,68,0.18)" },
  ];

  const GAP = 400;
  let elevation = 0;
  const slabs = state.couches.map((c, i) => {
    const d = c.surface.profondeur || 200;
    // Si un niveau absolu est défini (mm), y1 = -niveau (axe Y vers le haut en world space)
    // Sinon empilement automatique
    const hasNiveau = (c.surface.niveau !== null && c.surface.niveau !== undefined && c.surface.niveau !== '');
    const y1 = hasNiveau ? Number(c.surface.niveau) : elevation + d;
    const y0 = y1 - d;
    if (!hasNiveau) elevation += d + GAP;
    return {
      couche: c,
      idx: i,
      y0,
      y1,
      W: c.surface.width,
      H: c.surface.height,
      X: c.surface.offsetX || 0,
      Z: c.surface.offsetZ || 0,
      pal: PALETTE[i % PALETTE.length],
    };
  });

  // Scale stable : basé sur la bbox monde réelle (bloc + couches offsetées)
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  for (const s of slabs) {
    const sRot = s.couche.surface.rotation || 0;
    const sCX = s.X + s.W / 2, sCZ = s.Z + s.H / 2;
    const cR2 = Math.cos(sRot), sR2 = Math.sin(sRot);
    for (const [wx, wz] of [[s.X, s.Z],[s.X+s.W, s.Z],[s.X+s.W, s.Z+s.H],[s.X, s.Z+s.H]]) {
      const dx = wx - sCX, dz = wz - sCZ;
      const rx = sCX + dx*cR2 - dz*sR2, rz = sCZ + dx*sR2 + dz*cR2;
      minX = Math.min(minX, rx); maxX = Math.max(maxX, rx);
      minZ = Math.min(minZ, rz); maxZ = Math.max(maxZ, rz);
    }
    minY = Math.min(minY, s.y0); maxY = Math.max(maxY, s.y1);
  }
  // Inclure les plans spéciaux dans la bounding box
  for (const ps of state.plansSpeciaux) {
    const W = ps.surface.width, H = ps.surface.height;
    const IX = (ps.surface.inclinaisonX||0)*Math.PI/180, IZ = (ps.surface.inclinaisonZ||0)*Math.PI/180;
    const ROT = ps.surface.rotation||0;
    const OX=(ps.surface.offsetX||0)+W/2, OY=ps.surface.offsetY||0, OZ=(ps.surface.offsetZ||0)+H/2;
    const cIX=Math.cos(IX),sIX=Math.sin(IX),cIZ=Math.cos(IZ),sIZ=Math.sin(IZ),cR=Math.cos(ROT),sR=Math.sin(ROT);
    for (const [lx,lz] of [[-W/2,-H/2],[W/2,-H/2],[W/2,H/2],[-W/2,H/2]]) {
      const py=-lz*sIX,pz=lz*cIX;
      const rx=lx*cIZ-py*sIZ,ry=lx*sIZ+py*cIZ,rz=pz;
      const wx=cR*rx+sR*rz+OX, wy=ry+OY, wz=-sR*rx+cR*rz+OZ;
      minX=Math.min(minX,wx); maxX=Math.max(maxX,wx);
      minY=Math.min(minY,wy); maxY=Math.max(maxY,wy);
      minZ=Math.min(minZ,wz); maxZ=Math.max(maxZ,wz);
    }
  }
  if (state.bloc.visible) {
    minX = Math.min(minX, 0);
    maxX = Math.max(maxX, state.bloc.width);
    minY = Math.min(minY, state.bloc.niveau - state.bloc.height);
    maxY = Math.max(maxY, state.bloc.niveau);
    minZ = Math.min(minZ, 0);
    maxZ = Math.max(maxZ, state.bloc.depth);
  }
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const spanZ = Math.max(1, maxZ - minZ);
  const sceneR = 0.5 * Math.sqrt(spanX * spanX + spanY * spanY + spanZ * spanZ);
  const margin = 60;
  const scale = 0.45 * Math.min(cw - 2 * margin, ch - 2 * margin) / (sceneR || 1) * view3d.zoom;

  // Centre le modèle sur son milieu monde projeté
  const [pcx, pcy] = project3D((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
  const ox = cw / 2 - pcx * scale + view3d.panX;
  const oy = ch / 2 - pcy * scale + view3d.panY;

  function scr(wx, wy, wz) {
    const [px, py] = project3D(wx, wy, wz);
    return [px * scale + ox, py * scale + oy];
  }

  function drawFace(pts, fill, stroke, lw = 1) {
    ctx.beginPath();
    ctx.moveTo(...pts[0]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(...pts[i]);
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke();
  }

  // Enveloppe convexe 2D (Andrew's monotone chain) — pour la silhouette projetée de chaque dalle
  function convexHull2D(pts) {
    const p = pts.slice().sort((a, b) => a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]);
    const cross = (O, A, B) => (A[0]-O[0])*(B[1]-O[1]) - (A[1]-O[1])*(B[0]-O[0]);
    const lower = [], upper = [];
    for (const pt of p) {
      while (lower.length >= 2 && cross(lower[lower.length-2], lower[lower.length-1], pt) <= 0) lower.pop();
      lower.push(pt);
    }
    for (let i = p.length-1; i >= 0; i--) {
      const pt = p[i];
      while (upper.length >= 2 && cross(upper[upper.length-2], upper[upper.length-1], pt) <= 0) upper.pop();
      upper.push(pt);
    }
    lower.pop(); upper.pop();
    return lower.concat(upper);
  }

  const sinA = Math.sin(view3d.azimuth), cosA = Math.cos(view3d.azimuth);
  const sinT = Math.sin(view3d.tilt), cosT = Math.cos(view3d.tilt);
  _r3dInfo = { scale, sinA, cosA, sinT, cosT };

  // ── Pre-compute cylinder strip geometry (shared across all cylinders) ─────
  // Ajustement adaptatif pour garder des performances fluides quand il y a beaucoup de carottages.
  const totalHoles3D = slabs.reduce((sum, s) => sum + s.couche.holes.length, 0);
  const CYL_N = totalHoles3D > 900 ? 8 : totalHoles3D > 450 ? 12 : totalHoles3D > 200 ? 16 : 24;
  const TWO_PI_N = (2 * Math.PI) / CYL_N;

  // Strip order: back-to-front (same for every cylinder since orientation is identical)
  const stripOrder = Array.from({ length: CYL_N }, (_, i) => i).sort((ia, ib) =>
    Math.sin((ib + 0.5) * TWO_PI_N - view3d.azimuth) - Math.sin((ia + 0.5) * TWO_PI_N - view3d.azimuth)
  );

  // Fill style par strip (calculé une fois par frame)
  const cylStripFill = new Array(CYL_N);
  for (let i = 0; i < CYL_N; i++) {
    const aMid = (i + 0.5) * TWO_PI_N;
    const nX = Math.cos(aMid), nZ = Math.sin(aMid);
    const diffuse = nX * cosA + nZ * sinA;
    const light = 0.35 + 0.65 * Math.max(0, diffuse);
    const ir = Math.round(20 * light), ig = Math.round(60 * light), ib = Math.round(105 * light);
    cylStripFill[i] = `rgba(${ir},${ig},${ib},0.95)`;
  }

  // ── Pré-calcul géométrie de chaque couche ──────────────────────────────────
  const ARC_STEPS = 10;
  const slabGeoms = slabs.map(slab => {
    const { W, H, X, Z, y0, y1, pal } = slab;
    // ── Rotation axe Y ────────────────────────────────────────────────
    const rot = slab.couche.surface.rotation || 0;
    const slabCX = X + W / 2, slabCZ = Z + H / 2;
    const cosRot = Math.cos(rot), sinRot = Math.sin(rot);
    function rotW(wx, wz) {
      if (rot === 0) return [wx, wz];
      const dx = wx - slabCX, dz = wz - slabCZ;
      return [slabCX + dx * cosRot - dz * sinRot, slabCZ + dx * sinRot + dz * cosRot];
    }
    function sR(wx, wy, wz) { const [rx, rz] = rotW(wx, wz); return scr(rx, wy, rz); }
    const a = sR(X,    y1, Z),     b = sR(X+W, y1, Z),
          c = sR(X+W,  y1, Z+H),   d = sR(X,   y1, Z+H);
    const e = sR(X,    y0, Z),     f = sR(X+W, y0, Z),
          g = sR(X+W,  y0, Z+H),   h = sR(X,   y0, Z+H);
    const holes = slab.couche.holes;
    const cylGeom = holes.map(hole => {
      const hr = hole.diameter / 2;
      const topPts = new Array(CYL_N), botPts = new Array(CYL_N);
      for (let i = 0; i < CYL_N; i++) {
        const ang = i * TWO_PI_N;
        const px = X + hole.x + hr * Math.cos(ang), pz = Z + hole.y + hr * Math.sin(ang);
        topPts[i] = sR(px, y1, pz);
        botPts[i] = sR(px, y0, pz);
      }
      return { topPts, botPts };
    });
    const hull = convexHull2D([a,b,c,d,e,f,g,h]);

    // Arc punches (ouvertures cylindriques sur les bords)
    const frontPunches = [], backPunches = [], leftPunches = [], rightPunches = [];
    for (const hole of holes) {
      const cx = hole.x, cz = hole.y, r = hole.diameter / 2;
      if (cz < r) {
        const ratio = Math.min(1, cz / r);
        const a0 = -Math.asin(ratio), a1 = -(Math.PI - Math.asin(ratio));
        const topArc = [], botArc = [];
        for (let k = 0; k <= ARC_STEPS; k++) {
          const ang = a0 + (a1 - a0) * k / ARC_STEPS;
          topArc.push(sR(X + cx + r*Math.cos(ang), y1, Z + cz + r*Math.sin(ang)));
          botArc.push(sR(X + cx + r*Math.cos(ang), y0, Z + cz + r*Math.sin(ang)));
        }
        frontPunches.push([...topArc, ...botArc.slice().reverse()]);
      }
      if (cz > H - r) {
        const ratio = Math.max(-1, Math.min(1, (cz - H) / r));
        const a0 = Math.asin(ratio), a1 = Math.PI - Math.asin(ratio);
        const topArc = [], botArc = [];
        for (let k = 0; k <= ARC_STEPS; k++) {
          const ang = a0 + (a1 - a0) * k / ARC_STEPS;
          topArc.push(sR(X + cx + r*Math.cos(ang), y1, Z + cz + r*Math.sin(ang)));
          botArc.push(sR(X + cx + r*Math.cos(ang), y0, Z + cz + r*Math.sin(ang)));
        }
        backPunches.push([...topArc, ...botArc.slice().reverse()]);
      }
      if (cx < r) {
        const ratio = Math.max(-1, Math.min(1, cx / r));
        const a0 = Math.PI - Math.acos(ratio), a1 = Math.PI + Math.acos(ratio);
        const topArc = [], botArc = [];
        for (let k = 0; k <= ARC_STEPS; k++) {
          const ang = a0 + (a1 - a0) * k / ARC_STEPS;
          topArc.push(sR(X + cx + r*Math.cos(ang), y1, Z + cz + r*Math.sin(ang)));
          botArc.push(sR(X + cx + r*Math.cos(ang), y0, Z + cz + r*Math.sin(ang)));
        }
        leftPunches.push([...topArc, ...botArc.slice().reverse()]);
      }
      if (cx > W - r) {
        const ratio = Math.max(-1, Math.min(1, (cx - W) / r));
        const a0 = -Math.acos(ratio), a1 = Math.acos(ratio);
        const topArc = [], botArc = [];
        for (let k = 0; k <= ARC_STEPS; k++) {
          const ang = a0 + (a1 - a0) * k / ARC_STEPS;
          topArc.push(sR(X + cx + r*Math.cos(ang), y1, Z + cz + r*Math.sin(ang)));
          botArc.push(sR(X + cx + r*Math.cos(ang), y0, Z + cz + r*Math.sin(ang)));
        }
        rightPunches.push([...topArc, ...botArc.slice().reverse()]);
      }
    }

    const rzOf = (wx, wz) => { const [rx, rz] = rotW(wx, wz); return -rx * sinA + rz * cosA; };
    const yMid = (y0 + y1) / 2;
    const lateralFaces = [
      { pts: [b,c,g,f], punches: rightPunches,  fill: pal.side,  rz: rzOf(X + W,     Z + H / 2) },
      { pts: [d,a,e,h], punches: leftPunches,   fill: pal.side,  rz: rzOf(X,         Z + H / 2) },
      { pts: [a,b,f,e], punches: frontPunches,  fill: pal.front, rz: rzOf(X + W / 2, Z) },
      { pts: [c,d,h,g], punches: backPunches,   fill: pal.front, rz: rzOf(X + W / 2, Z + H) },
    ].map(face => ({ ...face, depth: -yMid * sinT + face.rz * cosT }));
    lateralFaces.sort((fa, fb) => fb.depth - fa.depth);

    // Top layer (béton dessus + trous cylindres)
    const topLayer = document.createElement('canvas');
    topLayer.width = canvas.width; topLayer.height = canvas.height;
    const tlc = topLayer.getContext('2d');
    tlc.setTransform(dpr, 0, 0, dpr, 0, 0);
    tlc.beginPath(); tlc.moveTo(...a); tlc.lineTo(...b); tlc.lineTo(...c); tlc.lineTo(...d); tlc.closePath();
    tlc.fillStyle = pal.top; tlc.fill();
    tlc.strokeStyle = pal.stroke; tlc.lineWidth = 2; tlc.stroke();
    tlc.beginPath(); tlc.moveTo(...a); tlc.lineTo(...b); tlc.lineTo(...c); tlc.lineTo(...d); tlc.closePath();
    tlc.fillStyle = pal.tint; tlc.fill();
    if (cylGeom.length > 0) {
      tlc.globalCompositeOperation = 'destination-out';
      tlc.beginPath();
      for (const { topPts } of cylGeom) {
        tlc.moveTo(...topPts[0]);
        for (let i = 1; i < CYL_N; i++) tlc.lineTo(...topPts[i]);
        tlc.closePath();
      }
      tlc.fillStyle = 'rgba(0,0,0,1)'; tlc.fill();
      tlc.globalCompositeOperation = 'source-over';
    }

    // Face inférieure optionnelle (fond de couche côté inférieur)
    const bottomFace = slab.couche.surface.hasBottom
      ? (() => {
          const rz = rzOf(X + W / 2, Z + H / 2);
          return { pts: [e, f, g, h], fill: pal.front, stroke: pal.stroke, rz, depth: -y0 * sinT + rz * cosT };
        })()
      : null;

    return { slab, W, H, X, Z, y0, y1, pal, a,b,c,d,e,f,g,h, holes, cylGeom, hull, lateralFaces, topLayer, bottomFace, rotW };
  });

  // Tri profondeur des couches (loin → proche) pour les passes rendues "par couche".
  // Clé de profondeur orthographique: z_cam = y*sin(tilt) + rz*cos(tilt),
  // avec rz = -x*sin(azimuth) + z*cos(azimuth).
  // On prend le centre volumique de la couche pour un ordre stable et cohérent avec la caméra.
  function slabDepthKey(sg) {
    const xMid = sg.X + sg.W / 2;
    const zMid = sg.Z + sg.H / 2;
    const yMid = (sg.y0 + sg.y1) / 2;
    const rzMid = -xMid * sinA + zMid * cosA;
    return -yMid * sinT + rzMid * cosT;
  }
  const slabOrderBackToFront = slabGeoms.slice().sort((sa, sb) => slabDepthKey(sb) - slabDepthKey(sa));

  // ── Pré-calcul géométrie du bloc béton global ──────────────────────────────
  let blocGeom = null;
  if (state.bloc.visible) {
    const B = state.bloc;
    const BW = B.width, BD = B.depth, BH = B.height, BX = 0, BZ = 0;
    const by1 = B.niveau, by0 = by1 - BH;
    const ba  = scr(BX,    by1, BZ),      bb  = scr(BX+BW, by1, BZ);
    const bbc = scr(BX+BW, by1, BZ+BD),   bbd = scr(BX,    by1, BZ+BD);
    const be  = scr(BX,    by0, BZ),       bf  = scr(BX+BW, by0, BZ);
    const bg  = scr(BX+BW, by0, BZ+BD),   bh  = scr(BX,    by0, BZ+BD);
    const bStroke = "#3e4644";
    const bYMid = (by0 + by1) / 2;
    const bFaces = [
      { pts: [bb,bbc,bg,bf],   rz: -BW*sinA + (BD/2)*cosA, fill: "#6d7572", stroke: bStroke },
      { pts: [bbd,ba,be,bh],   rz:              (BD/2)*cosA, fill: "#6d7572", stroke: bStroke },
      { pts: [ba,bb,bf,be],    rz: -(BW/2)*sinA,             fill: "#575f5c", stroke: bStroke },
      { pts: [bbc,bbd,bh,bg],  rz: -(BW/2)*sinA + BD*cosA,  fill: "#575f5c", stroke: bStroke },
    ].map(face => ({ ...face, depth: -bYMid * sinT + face.rz * cosT }));
    bFaces.sort((fa, fb) => fb.depth - fa.depth);

    // Top layer bloc (avec trouées pour les couches)
    const blocLayer = document.createElement('canvas');
    blocLayer.width = canvas.width; blocLayer.height = canvas.height;
    const btc = blocLayer.getContext('2d');
    btc.setTransform(dpr, 0, 0, dpr, 0, 0);
    btc.beginPath(); btc.moveTo(...ba); btc.lineTo(...bb); btc.lineTo(...bbc); btc.lineTo(...bbd); btc.closePath();
    btc.fillStyle = "#9ea8a4"; btc.fill();
    btc.strokeStyle = bStroke; btc.lineWidth = 2; btc.stroke();
    btc.globalCompositeOperation = 'destination-out';
    for (const sg of slabGeoms) {
      const corners = [
        sg.rotW(sg.X,        sg.Z),
        sg.rotW(sg.X + sg.W, sg.Z),
        sg.rotW(sg.X + sg.W, sg.Z + sg.H),
        sg.rotW(sg.X,        sg.Z + sg.H),
      ];
      btc.beginPath();
      btc.moveTo(...scr(corners[0][0], by1, corners[0][1]));
      for (let k = 1; k < 4; k++) btc.lineTo(...scr(corners[k][0], by1, corners[k][1]));
      btc.closePath();
      btc.fillStyle = 'rgba(0,0,0,1)'; btc.fill();
    }
    btc.globalCompositeOperation = 'source-over';
    blocGeom = { bFaces, blocLayer, bStroke };
  }

  // ── Rendu en deux passes ──────────────────────────────────────────────────
  // Passe A (toutes couches dos→face) : faces latérales + face inf + redan + strips
  // Passe B (toutes couches dos→face) : face supérieure (béton restant + zones + labels)
  //
  // Cet ordre garantit :
  //   - intra-couche : le béton supérieur couvre ses propres strips
  //   - inter-couches : le béton sup d'une couche basse est au-dessus
  //     du redan d'une couche haute (passe B entière après passe A entière)

  // ── Application des coupes 3D ───────────────────────────────────────────────
  // Principe : un plan-monde (ex. wx = Cx) ne projette PAS en demi-plan screen-space
  // pour une projection orthographique quelconque.  La méthode correcte est de projeter
  // la bounding-box AABB clippée (un convexe 3D) → sa projection est convexe et ses
  // sommets sont exactement les 8 coins projetés.  Résultat stable quelle que soit la
  // rotation caméra.
  ctx.save();
  if (view3dClip.x || view3dClip.y || view3dClip.z) {
    const cxMax = view3dClip.x ? minX + view3dClip.xVal * spanX : maxX;
    const cyMax = view3dClip.y ? minY + view3dClip.yVal * spanY : maxY;
    const czMax = view3dClip.z ? minZ + view3dClip.zVal * spanZ : maxZ;
    const clipCorners = [];
    for (const wx of [minX, cxMax]) for (const wy of [minY, cyMax]) for (const wz of [minZ, czMax])
      clipCorners.push(scr(wx, wy, wz));
    const clipHull = convexHull2D(clipCorners);
    if (clipHull.length >= 3) {
      ctx.beginPath();
      ctx.moveTo(...clipHull[0]);
      for (let i = 1; i < clipHull.length; i++) ctx.lineTo(...clipHull[i]);
      ctx.closePath();
      ctx.clip();
    }
  }

  // Faces du bloc en premier
  if (blocGeom) {
    for (const face of blocGeom.bFaces) {
      drawFace(face.pts, face.fill, face.stroke, 2);
    }
  }

  // ── Boucle unique par couche (dos→face) : faces latérales → fond → redan → strips → top ──
  for (const sg of slabOrderBackToFront) {
    const { slab, a, b, c, d, e, f, g, h, holes, cylGeom, hull, y0, y1, W, H, X, Z, rotW, pal } = sg;
    const showI = slab.couche.surface.displayIntersections !== false;

    // 1. Faces latérales (toujours visibles)
    for (const face of sg.lateralFaces) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(...hull[0]);
        for (let i = 1; i < hull.length; i++) ctx.lineTo(...hull[i]);
        ctx.closePath();
        ctx.clip();
        ctx.beginPath();
        ctx.moveTo(...face.pts[0]); ctx.lineTo(...face.pts[1]);
        ctx.lineTo(...face.pts[2]); ctx.lineTo(...face.pts[3]);
        ctx.closePath();
        for (const poly of face.punches) {
          ctx.moveTo(...poly[0]);
          for (let k = 1; k < poly.length; k++) ctx.lineTo(...poly[k]);
          ctx.closePath();
        }
        ctx.fillStyle = face.fill;
        ctx.fill('evenodd');
        ctx.strokeStyle = pal.stroke;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }

    // 2. Face inférieure
    if (sg.bottomFace && showI) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(...hull[0]);
      for (let i = 1; i < hull.length; i++) ctx.lineTo(...hull[i]);
      ctx.closePath();
      ctx.clip();
      drawFace(sg.bottomFace.pts, sg.bottomFace.fill, sg.bottomFace.stroke, 2);
      ctx.restore();
    }

    // 3. Redan — fond visible dans la zone de surplomb
    const hasRedanContext = slabGeoms.some(other => other !== sg && other.y1 >= y0 - 1);
    if (showI && !slab.couche.surface.hasBottom && hasRedanContext) {
      const rdCv = document.createElement('canvas');
      rdCv.width = canvas.width; rdCv.height = canvas.height;
      const rdc = rdCv.getContext('2d');
      rdc.setTransform(dpr, 0, 0, dpr, 0, 0);
      rdc.beginPath();
      rdc.moveTo(...e); rdc.lineTo(...f); rdc.lineTo(...g); rdc.lineTo(...h);
      rdc.closePath();
      rdc.fillStyle = pal.front; rdc.fill();
      rdc.strokeStyle = pal.stroke; rdc.lineWidth = 1.5; rdc.stroke();
      rdc.globalCompositeOperation = 'destination-out';
      for (const other of slabGeoms) {
        if (other === sg) continue;
        if (other.y1 < y0 - 1) continue;
        const oc = [
          other.rotW(other.X,          other.Z),
          other.rotW(other.X + other.W, other.Z),
          other.rotW(other.X + other.W, other.Z + other.H),
          other.rotW(other.X,          other.Z + other.H),
        ].map(([rx, rz]) => scr(rx, y0, rz));
        rdc.beginPath();
        rdc.moveTo(...oc[0]); rdc.lineTo(...oc[1]); rdc.lineTo(...oc[2]); rdc.lineTo(...oc[3]);
        rdc.closePath();
        rdc.fillStyle = 'rgba(0,0,0,1)'; rdc.fill();
      }
      rdc.globalCompositeOperation = 'source-over';
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(...hull[0]);
      for (let i = 1; i < hull.length; i++) ctx.lineTo(...hull[i]);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(rdCv, 0, 0, cw, ch);
      ctx.restore();
    }

    // 4. Strips des cylindres
    if (showI && holes.length) {
      const radii = holes.map(h => h.diameter / 2);
      for (const si of stripOrder) {
        const sj = (si + 1) % CYL_N;
        const aMid = (si + 0.5) * TWO_PI_N;
        for (let ci = 0; ci < holes.length; ci++) {
          const mxLocal = holes[ci].x + radii[ci] * Math.cos(aMid);
          const mzLocal = holes[ci].y + radii[ci] * Math.sin(aMid);
          let overlapped = false;
          for (let cj = 0; cj < holes.length; cj++) {
            if (cj === ci) continue;
            const dx = mxLocal - holes[cj].x, dz = mzLocal - holes[cj].y;
            if (dx * dx + dz * dz < radii[cj] * radii[cj]) { overlapped = true; break; }
          }
          if (overlapped) continue;
          const { topPts, botPts } = cylGeom[ci];
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(...hull[0]);
          for (let i = 1; i < hull.length; i++) ctx.lineTo(...hull[i]);
          ctx.closePath();
          ctx.clip();
          ctx.beginPath();
          ctx.moveTo(...topPts[si]); ctx.lineTo(...topPts[sj]);
          ctx.lineTo(...botPts[sj]); ctx.lineTo(...botPts[si]);
          ctx.closePath();
          ctx.fillStyle = cylStripFill[si];
          ctx.fill();
          ctx.restore();
        }
      }
    }

    // 5. Face supérieure (béton restant + zones + labels)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(...hull[0]);
    for (let i = 1; i < hull.length; i++) ctx.lineTo(...hull[i]);
    ctx.closePath();
    ctx.clip();
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(...a); ctx.lineTo(...b); ctx.lineTo(...c); ctx.lineTo(...d);
    ctx.closePath();
    ctx.clip();
    if (showI) ctx.drawImage(sg.topLayer, 0, 0, cw, ch);
    const exclQ = [], szQ = [], dcQ = [];
    const sRtopP = (wx, wz) => { const [rx, rz] = rotW(wx, wz); return scr(rx, y1, rz); };
    for (const zone of slab.couche.zones) {
      const q = [
        sRtopP(X + zone.x,          Z + zone.y),
        sRtopP(X + zone.x + zone.w, Z + zone.y),
        sRtopP(X + zone.x + zone.w, Z + zone.y + zone.h),
        sRtopP(X + zone.x,          Z + zone.y + zone.h),
      ];
      if (zone.type === "exclusion") exclQ.push(q);
      else if (zone.type === "decoupe") dcQ.push(q);
      else szQ.push(q);
    }
    const batchQP = (quads, fill, stroke) => {
      if (!quads.length) return;
      ctx.beginPath();
      for (const q of quads) { ctx.moveTo(...q[0]); ctx.lineTo(...q[1]); ctx.lineTo(...q[2]); ctx.lineTo(...q[3]); ctx.closePath(); }
      ctx.fillStyle = fill; ctx.fill();
      ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke();
    };
    if (view3dFilters.interdites) batchQP(exclQ, "rgba(166,40,63,0.35)", "#a6283f");
    if (view3dFilters.souszones)  batchQP(szQ,   "rgba(15,109,99,0.3)",  "#0f6d63");
    if (view3dFilters.decoupes && dcQ.length) {
      // Effacer le béton dans les zones découpe (béton enlevé = vide)
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      for (const q of dcQ) { ctx.moveTo(...q[0]); ctx.lineTo(...q[1]); ctx.lineTo(...q[2]); ctx.lineTo(...q[3]); ctx.closePath(); }
      ctx.fillStyle = '#000';
      ctx.fill();
      ctx.restore();
      // Remplir avec un fond sombre simulant le vide
      ctx.save();
      ctx.beginPath();
      for (const q of dcQ) { ctx.moveTo(...q[0]); ctx.lineTo(...q[1]); ctx.lineTo(...q[2]); ctx.lineTo(...q[3]); ctx.closePath(); }
      ctx.fillStyle = 'rgba(18,15,24,0.92)';
      ctx.fill();
      ctx.strokeStyle = '#5a60b8'; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
    }
    if (holes.length > 0 && showI) {
      ctx.beginPath();
      for (const { topPts } of cylGeom) {
        ctx.moveTo(...topPts[0]);
        for (let i = 1; i < CYL_N; i++) ctx.lineTo(...topPts[i]);
        ctx.closePath();
      }
      ctx.fillStyle = "rgba(31,77,115,0.06)"; ctx.fill();
    }
    if (view3dFilters.labels) {
      const lc = scr(X + W / 2, y1, Z + H / 2);
      const fs = Math.max(11, Math.min(32, scale * 300));
      ctx.font = `bold ${fs}px Bahnschrift, Trebuchet MS, sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const lbl = (slab.couche.surface.niveau !== null && slab.couche.surface.niveau !== undefined && slab.couche.surface.niveau !== '')
        ? `${slab.couche.label} · ${slab.couche.surface.niveau} mm`
        : slab.couche.label;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillText(lbl, lc[0], lc[1]);
    }
    ctx.restore();
    ctx.restore();

    // 6. Bloc béton équivalent (volume plein semi-transparent)
    if (slab.couche.surface.displaySolid) {
      const rzSolid = (wx, wz) => { const [rx, rz] = rotW(wx, wz); return -rx * sinA + rz * cosA; };
      const yMidS = (y0 + y1) / 2;
      const solidFaces = [
        { pts: [b,c,g,f], fill: pal.side,  depth: -yMidS * sinT + rzSolid(X + W,     Z + H / 2) },
        { pts: [d,a,e,h], fill: pal.side,  depth: -yMidS * sinT + rzSolid(X,         Z + H / 2) },
        { pts: [a,b,f,e], fill: pal.front, depth: -yMidS * sinT + rzSolid(X + W / 2, Z) },
        { pts: [c,d,h,g], fill: pal.front, depth: -yMidS * sinT + rzSolid(X + W / 2, Z + H) },
      ];
      solidFaces.sort((fa, fb) => fb.depth - fa.depth);
      for (const face of solidFaces) {
        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.beginPath();
        ctx.moveTo(...face.pts[0]); ctx.lineTo(...face.pts[1]);
        ctx.lineTo(...face.pts[2]); ctx.lineTo(...face.pts[3]);
        ctx.closePath();
        ctx.fillStyle = face.fill;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = pal.stroke;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      }
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.moveTo(...a); ctx.lineTo(...b); ctx.lineTo(...c); ctx.lineTo(...d);
      ctx.closePath();
      ctx.fillStyle = pal.top;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = pal.stroke;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }
  }

  // Top du bloc (avec trouées couches) — toujours au-dessus de tout
  if (blocGeom) ctx.drawImage(blocGeom.blocLayer, 0, 0, cw, ch);

  // ── Plans spéciaux — rendus comme dalles inclinées au-dessus de tout ─────
  for (const ps of state.plansSpeciaux) {
    const W = ps.surface.width, H = ps.surface.height;
    const IX  = (ps.surface.inclinaisonX || 0) * Math.PI / 180;
    const IZ  = (ps.surface.inclinaisonZ || 0) * Math.PI / 180;
    const ROT = ps.surface.rotation || 0;
    const OX  = (ps.surface.offsetX || 0) + W / 2;
    const OY  =  ps.surface.offsetY || 0;
    const OZ  = (ps.surface.offsetZ || 0) + H / 2;
    const cosIX = Math.cos(IX), sinIX = Math.sin(IX);
    const cosIZ = Math.cos(IZ), sinIZ = Math.sin(IZ);
    const cosROT = Math.cos(ROT), sinROT = Math.sin(ROT);
    // Projette un point local (lx, lz centré) en screen coords
    const psPt = (lx, lz) => {
      const py = -lz * sinIX,            pz = lz * cosIX;
      const rx = lx * cosIZ - py * sinIZ, ry = lx * sinIZ + py * cosIZ, rz = pz;
      const wx = cosROT * rx + sinROT * rz + OX;
      const wy = ry + OY;
      const wz = -sinROT * rx + cosROT * rz + OZ;
      return scr(wx, wy, wz);
    };
    const corners = [psPt(-W/2,-H/2), psPt(W/2,-H/2), psPt(W/2,H/2), psPt(-W/2,H/2)];
    const isActive = state.editMode === 'planSpecial' && state.plansSpeciaux.indexOf(ps) === state.activePsIndex;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(...corners[0]); ctx.lineTo(...corners[1]); ctx.lineTo(...corners[2]); ctx.lineTo(...corners[3]);
    ctx.closePath();
    ctx.fillStyle = isActive ? 'rgba(192,96,16,0.22)' : 'rgba(192,96,16,0.12)';
    ctx.fill();
    ctx.strokeStyle = isActive ? '#c06010' : '#a05008';
    ctx.lineWidth = isActive ? 2.5 : 1.5;
    ctx.setLineDash(isActive ? [] : [6, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    // Carottages sur le plan spécial
    if (ps.holes && ps.holes.length > 0) {
      const N_CIR = 16;
      for (const hole of ps.holes) {
        const hr = hole.diameter / 2;
        const hlx = hole.x - W / 2;
        const hlz = hole.y - H / 2;
        ctx.beginPath();
        for (let i = 0; i <= N_CIR; i++) {
          const ang = (i / N_CIR) * 2 * Math.PI;
          const [sx, sy] = psPt(hlx + hr * Math.cos(ang), hlz + hr * Math.sin(ang));
          if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
        }
        ctx.closePath();
        ctx.fillStyle   = hole.manual ? 'rgba(230,120,20,0.45)' : 'rgba(31,77,180,0.45)';
        ctx.strokeStyle = hole.manual ? '#e07010' : '#1a50c8';
        ctx.lineWidth   = 1.5;
        ctx.fill();
        ctx.stroke();
      }
    }
    // Label
    const cx = (corners[0][0]+corners[1][0]+corners[2][0]+corners[3][0])/4;
    const cy = (corners[0][1]+corners[1][1]+corners[2][1]+corners[3][1])/4;
    ctx.font = `bold ${Math.max(11, Math.min(20, scale*250))}px Bahnschrift, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = isActive ? '#c06010' : '#7a4008';
    ctx.fillText(ps.label, cx, cy);
    ctx.restore();
  }

  ctx.restore(); // fin coupes 3D
}

function setup3DInteraction() {
  const canvas = document.getElementById("canvas-3d");
  if (!canvas) return;

  document.getElementById("btn-3d-reset")?.addEventListener("click", () => {
    view3d.azimuth = -Math.PI / 5;
    view3d.tilt = Math.PI / 3;
    view3d.zoom = 1;
    view3d.panX = 0;
    view3d.panY = 0;
    render3D();
  });

  canvas.addEventListener("mousedown", (e) => {
    view3d.drag.active = true;
    view3d.drag.lastX = e.clientX;
    view3d.drag.lastY = e.clientY;
    if (gizmo.mode) {
      view3d.drag.type = gizmo.mode === "rotate" ? "rotate-couche" : "translate";
    } else {
      view3d.drag.type = e.button === 2 || e.shiftKey ? "pan" : "rotate";
    }
    e.preventDefault();
  });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  document.addEventListener("mousemove", (e) => {
    if (!view3d.drag.active) return;
    const dx = e.clientX - view3d.drag.lastX;
    const dy = e.clientY - view3d.drag.lastY;
    view3d.drag.lastX = e.clientX;
    view3d.drag.lastY = e.clientY;
    if (view3d.drag.type === "translate") {
      const c = ac();
      if (e.shiftKey) {
        // Déplacement vertical (niveau)
        const dNiv = -dy / (Math.max(0.05, Math.abs(_r3dInfo.cosT)) * _r3dInfo.scale);
        const cur = (c.surface.niveau !== null && c.surface.niveau !== undefined && c.surface.niveau !== '') ? Number(c.surface.niveau) : 0;
        c.surface.niveau = Math.round((cur + dNiv) * 10) / 10;
        document.getElementById("surface-niveau").value = c.surface.niveau;
      } else {
        // Déplacement horizontal XZ (déprojection orthographique)
        const { scale, sinA, cosA, sinT } = _r3dInfo;
        const sT = Math.max(0.1, Math.abs(sinT));
        c.surface.offsetX = Math.round(((c.surface.offsetX || 0) + (dx * cosA + dy * sinA / sT) / scale) * 10) / 10;
        c.surface.offsetZ = Math.round(((c.surface.offsetZ || 0) + (dx * sinA - dy * cosA / sT) / scale) * 10) / 10;
        c.surface.positionPreset = "custom";
        document.getElementById("surface-offset-x").value = c.surface.offsetX;
        document.getElementById("surface-offset-z").value = c.surface.offsetZ;
        document.getElementById("surface-position-preset").value = "custom";
      }
      renderPlan(); render3D();
    } else if (view3d.drag.type === "rotate-couche") {
      ac().surface.rotation = (ac().surface.rotation || 0) + dx * 0.01;
      if (ui.surfaceRotation) ui.surfaceRotation.value = String(Math.round((ac().surface.rotation * 180 / Math.PI) * 100) / 100);
      renderPlan(); render3D();
    } else if (view3d.drag.type === "rotate") {
      view3d.azimuth += dx * 0.008;
      view3d.tilt = Math.max(0.05, Math.min(Math.PI * 0.85, view3d.tilt + dy * 0.008));
      render3D();
    } else {
      view3d.panX += dx;
      view3d.panY += dy;
      render3D();
    }
  });

  document.addEventListener("mouseup", () => { view3d.drag.active = false; });

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    view3d.zoom *= e.deltaY > 0 ? 0.92 : 1.09;
    view3d.zoom = Math.max(0.1, Math.min(20, view3d.zoom));
    render3D();
  }, { passive: false });

  window.addEventListener("resize", () => {
    if (!document.getElementById("main-tab-3d")?.hidden) render3D();
  });
}

setup3DInteraction();

// ── Gizmo boutons ─────────────────────────────────────────────────────────────
["gizmo-translate", "gizmo-rotate"].forEach(id => {
  document.getElementById(id)?.addEventListener("click", () => {
    const key = id.replace("gizmo-", "");
    gizmo.mode = (gizmo.mode === key) ? null : key;
    document.getElementById("gizmo-translate")?.classList.toggle("gizmo-btn--active", gizmo.mode === "translate");
    document.getElementById("gizmo-rotate")?.classList.toggle("gizmo-btn--active", gizmo.mode === "rotate");
    const c3d = document.getElementById("canvas-3d");
    if (c3d) c3d.style.cursor = gizmo.mode === "translate" ? "move" : gizmo.mode === "rotate" ? "crosshair" : "grab";
    const hint = document.getElementById("gizmo-hint");
    if (hint) hint.textContent = gizmo.mode === "translate" ? "Glisser\u00a0: XZ \u00b7 Maj+glisser\u00a0: vertical (Y)" : gizmo.mode === "rotate" ? "Glisser horizontalement\u00a0: rotation axe vertical" : "";
  });
});

// ── Navigation principale ─────────────────────────────────────────────────────
document.querySelectorAll(".main-nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".main-nav-btn").forEach((b) => {
      b.classList.remove("active");
      b.setAttribute("aria-selected", "false");
    });
    document.querySelectorAll(".main-tab-panel").forEach((p) => { p.hidden = true; });
    btn.classList.add("active");
    btn.setAttribute("aria-selected", "true");
    const tab = btn.dataset.mainTab;
    document.getElementById(`main-tab-${tab}`).hidden = false;
    document.getElementById("editor-controls").hidden = (tab !== "2d" && tab !== "3d");
    if (tab === "3d")       render3D();
    if (tab === "synthese") renderSynthese();
    if (tab === "params")   renderParams();
    if (tab === "couts")    renderCouts();
    if (tab === "delais")   renderDelais();
    if (tab === "devlog")   renderDevlog();
  });
});

// ── Filtres 3D — listeners sur les checkboxes du panneau légende ──────────────
["filter-interdites", "filter-souszones", "filter-labels"].forEach((id) => {
  document.getElementById(id)?.addEventListener("change", (e) => {
    view3dFilters[id.replace("filter-", "")] = e.target.checked;
    render3D();
  });
});

["filter2d-interdites", "filter2d-souszones", "filter2d-decoupes", "filter2d-labels"].forEach((id) => {
  document.getElementById(id)?.addEventListener("change", (e) => {
    view2dFilters[id.replace("filter2d-", "")] = e.target.checked;
    renderPlan();
  });
});

document.getElementById('btn-measure-tool')?.addEventListener('click', () => {
  measureState.active = !measureState.active;
  measureState.pts = [];
  const btn = document.getElementById('btn-measure-tool');
  if (btn) {
    btn.style.background = measureState.active ? '#1a50c8' : '';
    btn.style.color      = measureState.active ? '#fff'    : '';
    btn.style.fontWeight = measureState.active ? 'bold'    : '';
  }
  const el = document.getElementById('measure-result');
  if (el) el.style.display = 'none';
  renderPlan();
});

// Clic SVG en mode mesure : gere par mousedown (stopPropagation seulement)
ui.svg?.addEventListener('click', (e) => {
  if (measureState.active) e.stopPropagation();
});

function renderLayerOrder() {
  const list = document.getElementById("layer-order-list");
  if (!list) return;
  layerOrder2d.forEach(key => {
    const item = list.querySelector(`[data-layer="${key}"]`);
    if (item) list.appendChild(item);
  });
}

{
  let _dragLayerKey = null;
  const layerList = document.getElementById("layer-order-list");

  layerList?.addEventListener("dragstart", (e) => {
    const item = e.target.closest(".layer-order-item");
    if (!item) return;
    _dragLayerKey = item.dataset.layer;
    e.dataTransfer.effectAllowed = "move";
    requestAnimationFrame(() => item.classList.add("dragging"));
  });

  layerList?.addEventListener("dragend", () => {
    document.querySelectorAll(".layer-order-item").forEach(el => {
      el.classList.remove("dragging", "drag-over");
    });
    _dragLayerKey = null;
  });

  layerList?.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const item = e.target.closest(".layer-order-item");
    document.querySelectorAll(".layer-order-item").forEach(el => el.classList.remove("drag-over"));
    if (item && item.dataset.layer !== _dragLayerKey) item.classList.add("drag-over");
  });

  layerList?.addEventListener("dragleave", (e) => {
    if (!layerList.contains(e.relatedTarget)) {
      document.querySelectorAll(".layer-order-item").forEach(el => el.classList.remove("drag-over"));
    }
  });

  layerList?.addEventListener("drop", (e) => {
    e.preventDefault();
    const target = e.target.closest(".layer-order-item");
    if (!target || !_dragLayerKey || target.dataset.layer === _dragLayerKey) return;
    const fromIdx = layerOrder2d.indexOf(_dragLayerKey);
    const toIdx   = layerOrder2d.indexOf(target.dataset.layer);
    if (fromIdx === -1 || toIdx === -1) return;
    layerOrder2d.splice(fromIdx, 1);
    layerOrder2d.splice(toIdx, 0, _dragLayerKey);
    document.querySelectorAll(".layer-order-item").forEach(el => el.classList.remove("drag-over", "dragging"));
    renderLayerOrder();
    renderPlan();
  });
}

// ── Coupes 3D — listeners checkboxes + sliders ───────────────────────────────
["x", "y", "z"].forEach(axis => {
  const enEl = document.getElementById(`clip-${axis}-en`);
  const slEl = document.getElementById(`clip-${axis}`);
  enEl?.addEventListener("change", () => {
    view3dClip[axis] = enEl.checked;
    if (slEl) slEl.disabled = !enEl.checked;
    render3D();
  });
  slEl?.addEventListener("input", () => {
    view3dClip[`${axis}Val`] = Number(slEl.value);
    render3D();
  });
});

// ── Plans spéciaux — fonctions de gestion ────────────────────────────────────

function renderPlansSpeciaux() {
  const list  = document.getElementById('ps-list');
  const empty = document.getElementById('ps-empty');
  if (!list || !empty) return;
  list.innerHTML = '';
  const count = state.plansSpeciaux.length;
  empty.hidden = count > 0;
  if (ui.psCount) { ui.psCount.textContent = count; ui.psCount.hidden = count === 0; }
  state.plansSpeciaux.forEach((ps, idx) => {
    const isActive = state.editMode === 'planSpecial' && state.activePsIndex === idx;
    const li = document.createElement('li');
    li.style.cssText = `display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;margin-bottom:4px;background:${isActive ? 'rgba(192,96,16,0.1)' : 'rgba(31,77,115,0.05)'};border:1px solid ${isActive ? '#c06010' : '#c8d8e8'}`;
    li.innerHTML = `
      <span style="flex:1;font-weight:${isActive ? 700 : 400};color:${isActive ? '#c06010' : '#1f3447'};font-size:0.9rem">
        ${ps.label}
        <small style="color:#6b8099;font-weight:400;margin-left:6px">${ps.surface.width}×${ps.surface.height} mm | ↕${ps.surface.inclinaisonX}° ↔${ps.surface.inclinaisonZ}°</small>
      </span>
      <button class="btn" style="font-size:0.75rem;padding:3px 8px" data-ps-edit="${idx}">${isActive ? '✓ Actif' : 'Éditer'}</button>
      <button class="btn btn-danger" style="font-size:0.75rem;padding:3px 8px" data-ps-delete="${idx}">✕</button>
    `;
    list.appendChild(li);
  });
}

function enterPlanSpecialMode(idx) {
  state.editMode = 'planSpecial';
  state.activePsIndex = idx;
  state.selectedZoneIndex = null;
  state.selectedHoleIndex = null;
  const ps = state.plansSpeciaux[idx];
  const bar = document.getElementById('ps-active-bar');
  if (bar) bar.hidden = false;
  const lbl = document.getElementById('ps-active-label');
  if (lbl) lbl.textContent = `Plan spécial : ${ps.label}`;
  document.querySelector('.couches-bar')?.style.setProperty('display', 'none');
  syncFormsToCouche();
  renderZones();
  renderTable();
  renderPlan();
  renderPlansSpeciaux();
  activateTab('params');
}

function exitPlanSpecialMode() {
  state.editMode = 'couche';
  state.selectedZoneIndex = null;
  state.selectedHoleIndex = null;
  document.getElementById('ps-active-bar')?.toggleAttribute('hidden', true);
  document.querySelector('.couches-bar')?.style.removeProperty('display');
  syncFormsToCouche();
  renderCouches();
  renderZones();
  renderTable();
  renderPlan();
  renderPlansSpeciaux();
  activateTab('params');
}

// PS form — ajout d'un nouveau plan spécial
document.getElementById('ps-form')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const label = document.getElementById('ps-label')?.value.trim() || `Plan ${state.plansSpeciaux.length + 1}`;
  const ps = makePlanSpecial(label);
  ps.surface.width        = Number(document.getElementById('ps-width')?.value)  || 1500;
  ps.surface.height       = Number(document.getElementById('ps-height')?.value) || 1500;
  ps.surface.profondeur   = Number(document.getElementById('ps-profondeur')?.value) || 200;
  ps.surface.inclinaisonX = Number(document.getElementById('ps-inclinaisonX')?.value) || 0;
  ps.surface.inclinaisonZ = Number(document.getElementById('ps-inclinaisonZ')?.value) || 0;
  ps.surface.offsetX      = Number(document.getElementById('ps-offset-x')?.value) || 0;
  ps.surface.offsetY      = Number(document.getElementById('ps-offset-y')?.value) || 0;
  ps.surface.offsetZ      = Number(document.getElementById('ps-offset-z')?.value) || 0;
  state.plansSpeciaux.push(ps);
  renderPlansSpeciaux();
  render3D();
  setStatus(`Plan spécial "${label}" ajouté.`);
  e.target.reset();
});

// PS list — délégation de clics (éditer / supprimer)
document.getElementById('ps-list')?.addEventListener('click', (e) => {
  const editBtn = e.target.closest('[data-ps-edit]');
  if (editBtn) {
    enterPlanSpecialMode(Number(editBtn.dataset.psEdit));
    return;
  }
  const delBtn = e.target.closest('[data-ps-delete]');
  if (delBtn) {
    const idx = Number(delBtn.dataset.psDelete);
    const ps = state.plansSpeciaux[idx];
    if (!confirm(`Supprimer le plan spécial "${ps.label}" et tous ses carottages ?`)) return;
    state.plansSpeciaux.splice(idx, 1);
    if (state.editMode === 'planSpecial' && state.activePsIndex === idx) exitPlanSpecialMode();
    else if (state.editMode === 'planSpecial' && state.activePsIndex > idx) state.activePsIndex--;
    renderPlansSpeciaux();
    render3D();
    setStatus(`Plan spécial "${ps.label}" supprimé.`);
  }
});

// Bouton "Retour aux couches"
document.getElementById('btn-exit-ps')?.addEventListener('click', exitPlanSpecialMode);

// ── Initialisation — afficher la liste des plans spéciaux au démarrage ───────
renderPlansSpeciaux();


// ══════════════════════════════════════════════════════════════════════════════
// ── SYNTHÈSE PROJET ───────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

const SYNTH_LS_KEY = 'synthese_params';

const syntheseState = {
  rendTableId:       null,   // ID du tableau de rendement sélectionné
  facteurCorrectif:  100,    // % appliqué sur le rendement de la table
  heuresParJour:     8,      // heures de travail effectif / jour
  tPause:            0.1,    // h — pause entre carottages
  tExtraction:       0.1,    // h — extraction de la carotte
  tInstallation:     1,      // h — installation carotteuse (1× / couche)
  tRepli:            1,      // h — repli carotteuse (1× / couche)
  tFaconnage:        0,      // h — façonnage
  tAutres:           0,      // h — autres temps unitaires
};

function synthLoadFromLS() {
  try {
    const s = localStorage.getItem(SYNTH_LS_KEY);
    if (s) Object.assign(syntheseState, JSON.parse(s));
  } catch (_) {}
}

function synthSaveToLS() {
  try { localStorage.setItem(SYNTH_LS_KEY, JSON.stringify(syntheseState)); } catch (_) {}
}

// ── Interpolation linéaire dans un tableau de rendement ─────────────────────
// Renvoie le rendement en h/m (interpolé entre les deux diamètres encadrants)
function rendLookup(table, diameter, maillage, isZ4) {
  if (!table?.lignes?.length) return null;
  const prefix = isZ4 ? 'Z4' : 'horsZ4';
  const colId  = `${prefix}_${maillage}`;
  const rows   = [...table.lignes].sort((a, b) => a.diametre - b.diametre);
  if (diameter <= rows[0].diametre)                  return rows[0][colId] ?? null;
  if (diameter >= rows[rows.length - 1].diametre)    return rows[rows.length - 1][colId] ?? null;
  for (let i = 0; i < rows.length - 1; i++) {
    if (diameter >= rows[i].diametre && diameter <= rows[i + 1].diametre) {
      const lo = rows[i], hi = rows[i + 1];
      const t  = (diameter - lo.diametre) / (hi.diametre - lo.diametre);
      return (lo[colId] ?? 0) + t * ((hi[colId] ?? 0) - (lo[colId] ?? 0));
    }
  }
  return null;
}

// ── Masse d'une carotte — densité béton 2 300 kg/m³ ─────────────────────────
function masseCarotte(diamMm, profMm) {
  return Math.PI / 4 * (diamMm / 1000) ** 2 * (profMm / 1000) * 2300;
}

// ── Formatage numérique sécurisé ─────────────────────────────────────────────
function _sfmt(v, dec = 2) {
  return (v == null || isNaN(v)) ? '—' : Number(v).toFixed(dec);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── MODULE DÉLAIS / GANTT ─────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// Convertit un objet Date en chaîne YYYY-MM-DD en heure locale (évite le décalage UTC de toISOString)
function _localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

const delaisState = {
  startDate: _localDateStr(new Date()),
  antecedentOverrides: {}, // taskId -> antecedentId | '' ('' = project start)
  customTasks: [],         // [{id, label, dureeJours, antecedentId}]
  _nextCTId: 0,
};

// ── Calcul de Pâques (algorithme grégorien anonyme) ──────────────────────────
function _easterDate(y) {
  const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4;
  const f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30;
  const i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
  const mo=Math.floor((h+l-7*m+114)/31),da=((h+l-7*m+114)%31)+1;
  return new Date(y,mo-1,da);
}

// ── Jours fériés français pour une plage d'années ────────────────────────────
function _frHolidays(y1, y2) {
  const s = new Set();
  const addD = (d, n=0) => { const x=new Date(d); x.setDate(x.getDate()+n); return _localDateStr(x); };
  for (let y=y1; y<=y2; y++) {
    ['01-01','05-01','05-08','07-14','08-15','11-01','11-11','12-25'].forEach(d => s.add(`${y}-${d}`));
    const e = _easterDate(y);
    [1, 39, 50].forEach(n => s.add(addD(e, n))); // Lundi Pâques, Ascension, Pentecôte
  }
  return s;
}

function _isWorkday(dateStr, holidays) {
  const dow = new Date(dateStr + 'T00:00:00').getDay();
  return dow !== 0 && dow !== 6 && !holidays.has(dateStr);
}

function _firstWorkday(dateStr, holidays) {
  let d = new Date(dateStr + 'T00:00:00'), s = _localDateStr(d);
  while (!_isWorkday(s, holidays)) { d.setDate(d.getDate()+1); s = _localDateStr(d); }
  return s;
}

// Ajoute n jours ouvrés à une date (la date de départ compte pour 1)
function _addWorkdays(startStr, n, holidays) {
  if (n <= 0) return startStr;
  let d = new Date(startStr + 'T00:00:00'), rem = n - 1;
  while (rem > 0) { d.setDate(d.getDate()+1); if (_isWorkday(_localDateStr(d), holidays)) rem--; }
  return _localDateStr(d);
}

// Premier jour ouvré strictement APRÈS la date donnée
function _nextWorkday(dateStr, holidays) {
  let d = new Date(dateStr + 'T00:00:00'); d.setDate(d.getDate()+1);
  let s = _localDateStr(d);
  while (!_isWorkday(s, holidays)) { d.setDate(d.getDate()+1); s = _localDateStr(d); }
  return s;
}

// Tableau de tous les jours ouvrés dans [startStr, endStr]
function _workdayRange(startStr, endStr, holidays) {
  const days = [];
  let d = new Date(startStr + 'T00:00:00');
  const end = new Date(endStr + 'T00:00:00');
  while (d <= end) { const s=_localDateStr(d); if (_isWorkday(s,holidays)) days.push(s); d.setDate(d.getDate()+1); }
  return days;
}

// ── Temps global d'une couche (h) — réplique _computeBloc de renderSynthese ──
function _computeCoucheH(couche) {
  const p = syntheseState;
  const s = couche.surface;
  const activeTable = rendState.tables.find(t => t.id === p.rendTableId) || rendState.tables[0] || null;
  const fc = s.rendementForce ? (s.rendementForceVal || 5) : null;
  const holes = couche.holes;
  if (!holes.length) return 0;
  let totalTpsBrut = 0, totalCount = 0;
  const byGroup = new Map();
  for (const hole of holes) {
    const prof = hole.profondeur != null ? hole.profondeur : (s.profondeur || 200);
    const rendH = (hole.rendForce && hole.rendForceVal > 0) ? hole.rendForceVal : null;
    const eff = rendH ?? fc;
    const key = `${hole.diameter}|${eff ?? ''}`;
    if (!byGroup.has(key)) byGroup.set(key, {diam: hole.diameter, count: 0, profTotale: 0, rendOverride: eff});
    const g = byGroup.get(key); g.count++; g.profTotale += prof;
  }
  for (const [, g] of byGroup) {
    const rendRaw = rendLookup(activeTable, g.diam, s.maillageFerraillage || 'moyen', !!s.debouchantZ4);
    let rend = rendRaw != null ? rendRaw * (p.facteurCorrectif / 100) : null;
    if (g.rendOverride != null) rend = g.rendOverride;
    totalTpsBrut += rend != null ? (g.profTotale / 1000) * rend : 0;
    totalCount += g.count;
  }
  return totalTpsBrut + p.tInstallation + p.tRepli + (p.tPause + p.tExtraction) * totalCount;
}

// ── Liste plate de toutes les tâches (couches + custom) ──────────────────────
function _getAllGanttTasks() {
  const tasks = [];
  state.couches.forEach((c, i) => tasks.push({id:`c-${i}`, label: c.label||`Couche ${i+1}`, dureeH: _computeCoucheH(c), type:'couche'}));
  delaisState.customTasks.forEach(ct => tasks.push({id:ct.id, label:ct.label, dureeH:ct.dureeJours*(syntheseState.heuresParJour||8), type:'custom', ctRef:ct}));
  return tasks;
}

// ── Calcul du planning (dates de début/fin par tâche) ────────────────────────
function _buildGanttSchedule() {
  const hj = Math.max(0.5, syntheseState.heuresParJour || 8);
  const now = new Date();
  const holidays = _frHolidays(now.getFullYear()-1, now.getFullYear()+3);
  const projStart = _firstWorkday(delaisState.startDate || _localDateStr(now), holidays);
  const tasks = _getAllGanttTasks();

  // Antécédents
  const antMap = {};
  tasks.forEach((t, i) => {
    const ov = delaisState.antecedentOverrides[t.id];
    if (ov !== undefined) { antMap[t.id] = ov || null; }
    else if (t.type === 'custom' && t.ctRef?.antecedentId !== undefined) { antMap[t.id] = t.ctRef.antecedentId || null; }
    else { antMap[t.id] = i > 0 ? tasks[i-1].id : null; }
  });

  // Dates par résolution récursive (protection contre les cycles)
  const startOf = {}, endOf = {}, computing = new Set();
  function getEnd(id) {
    if (endOf[id] !== undefined) return endOf[id];
    if (computing.has(id)) { endOf[id]=projStart; startOf[id]=projStart; return projStart; }
    computing.add(id);
    const task = tasks.find(t => t.id === id);
    if (!task) { computing.delete(id); return projStart; }
    const ante = antMap[id];
    const ts = ante ? _nextWorkday(getEnd(ante), holidays) : projStart;
    const durDays = Math.max(1, Math.ceil(task.dureeH / hj));
    startOf[id] = ts;
    endOf[id] = _addWorkdays(ts, durDays, holidays);
    computing.delete(id);
    return endOf[id];
  }
  tasks.forEach(t => getEnd(t.id));
  return {tasks, startOf, endOf, holidays, projStart, hj};
}

function _ganttMonthLabel(ym) {
  const [y, m] = ym.split('-');
  return ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'][parseInt(m)-1] + ' ' + y;
}

// ── Statistiques matière d'une couche (gestion des recouvrements) ─────────────
// Retourne : { totalAreaMm2, removedAreaMm2, intactAreaMm2, removedMassKg, intactMassKg }
// Utilise un échantillonnage grille pour calculer l'union des empreintes de carottes.
function _computeCoucheMaterialStats(entity) {
  const s       = entity.surface;
  const holes   = entity.holes || [];
  const W       = s.width    || 1500;
  const H       = s.height   || 1500;
  const defProf = s.profondeur || 200;
  const DENSITY = 2300;
  const totalAreaMm2 = W * H;

  if (holes.length === 0) {
    return {
      totalAreaMm2, removedAreaMm2: 0, intactAreaMm2: totalAreaMm2,
      removedMassKg: 0, intactMassKg: (totalAreaMm2 / 1e6) * (defProf / 1e3) * DENSITY
    };
  }

  const circles = holes.map(h => ({
    cx: h.x, cy: h.y, r2: (h.diameter / 2) ** 2,
    prof: h.profondeur != null ? h.profondeur : defProf
  }));

  const step = Math.max(5, Math.min(20, Math.round(Math.min(W, H) / 200)));
  let removedCells = 0, removedVolMm3 = 0;

  for (let gy = step / 2; gy < H; gy += step) {
    for (let gx = step / 2; gx < W; gx += step) {
      let maxProf = 0;
      for (const c of circles) {
        const dx = gx - c.cx, dy = gy - c.cy;
        if (dx * dx + dy * dy <= c.r2 && c.prof > maxProf) maxProf = c.prof;
      }
      if (maxProf > 0) {
        removedCells++;
        removedVolMm3 += step * step * maxProf;
      }
    }
  }

  const gridCols = Math.ceil(W / step);
  const gridRows = Math.ceil(H / step);
  const removedAreaMm2 = Math.min(totalAreaMm2, (removedCells / (gridCols * gridRows)) * totalAreaMm2);
  const intactAreaMm2  = totalAreaMm2 - removedAreaMm2;
  const removedMassKg  = (removedVolMm3 / 1e9) * DENSITY;
  const intactMassKg   = (intactAreaMm2 / 1e6) * (defProf / 1e3) * DENSITY;

  return { totalAreaMm2, removedAreaMm2, intactAreaMm2, removedMassKg, intactMassKg };
}

// ── Masse totale d'une couche (kg) ────────────────────────────────────────────
function _computeCoucheMasse(couche) {
  return _computeCoucheMaterialStats(couche).removedMassKg;
}

// ── Graduation automatique d'un axe Y ────────────────────────────────────────
function _niceRange(maxVal) {
  if (maxVal <= 0) return { max: 1, ticks: [0, 1] };
  const mag = Math.pow(10, Math.floor(Math.log10(maxVal)));
  let step = mag;
  if (maxVal / step > 5) step *= 2;
  if (maxVal / step > 5) step *= 2.5;
  if (maxVal / step > 5) step *= 2;
  const max = Math.ceil(maxVal / step) * step;
  const ticks = [];
  for (let t = 0; t <= max + step * 0.001; t += step) ticks.push(t);
  return { max, ticks };
}

// ── Graphique courbe SVG (jours ouvrés en abscisse) ───────────────────────────
function _renderLineChart(days, values, todayStr, color, unitLabel) {
  const n = days.length;
  if (n === 0) return '<p style="padding:16px;color:#6b8099;font-size:0.82rem">Aucune donnée à afficher.</p>';
  const LP=60, RP=16, TP=16, BP=28, IH=150;
  const CHT_DAY_W = Math.max(8, Math.min(32, Math.round(860 / n)));
  const IW = n * CHT_DAY_W;
  const svgW = LP + IW + RP, svgH = TP + IH + BP;
  const maxVal = Math.max(...values, 1);
  const { max: yMax, ticks: yTicks } = _niceRange(maxVal);
  const px = i => LP + i * CHT_DAY_W;
  const py = v => TP + IH - Math.round(v / yMax * IH);
  const fmtY = v => v >= 10000 ? Math.round(v/1000)+'t' : v >= 1000 ? (Math.round(v/100)/10)+'t' : Math.round(v);

  let g = '';
  // Y grid + labels
  yTicks.forEach(t => {
    const y = py(t);
    g += `<line x1="${LP}" y1="${y}" x2="${LP+IW}" y2="${y}" stroke="${t===0?'#c8d8e8':'#e8eff6'}" stroke-width="${t===0?1.5:0.7}"/>`
       + `<text x="${LP-5}" y="${y+3.5}" font-size="9.5" fill="#8899aa" text-anchor="end">${fmtY(t)}</text>`;
  });

  // X grid + labels (lundis seulement)
  days.forEach((d, i) => {
    if (new Date(d+'T00:00:00').getDay() !== 1) return;
    const x = px(i);
    g += `<line x1="${x}" y1="${TP}" x2="${x}" y2="${TP+IH}" stroke="#e8eff6" stroke-width="0.8"/>`
       + `<text x="${x}" y="${TP+IH+18}" font-size="8.5" fill="#8899aa" text-anchor="middle">${d.slice(5).replace('-','/')}</text>`;
  });

  // Marqueur aujourd'hui
  const ti = days.indexOf(todayStr);
  if (ti >= 0) g += `<line x1="${px(ti)}" y1="${TP}" x2="${px(ti)}" y2="${TP+IH}" stroke="#e04030" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.7"/>`;

  // Aire + courbe
  const pts = values.map((v,i) => `${px(i)},${py(v)}`).join(' ');
  const area = `${px(0)},${py(0)} ${pts} ${px(n-1)},${py(0)}`;
  g += `<polygon points="${area}" fill="${color}" opacity="0.13"/>`
     + `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;

  // Axes + label unité
  g += `<line x1="${LP}" y1="${TP}" x2="${LP}" y2="${TP+IH}" stroke="#b0c4d8" stroke-width="1.5"/>`
     + `<line x1="${LP}" y1="${TP+IH}" x2="${LP+IW}" y2="${TP+IH}" stroke="#b0c4d8" stroke-width="1.5"/>`
     + `<text x="${LP}" y="${TP-4}" font-size="9" fill="#8899aa">${unitLabel}</text>`;

  return `<div style="overflow-x:auto"><svg width="${svgW}" height="${svgH}" style="display:block;min-width:${Math.min(svgW,360)}px">${g}</svg></div>`;
}

// ── Rendu principal de l'onglet Délais ───────────────────────────────────────
function renderDelais() {
  const host = document.getElementById('delais-host');
  if (!host) return;
  const {tasks, startOf, endOf, holidays, projStart, hj} = _buildGanttSchedule();
  const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  if (tasks.length === 0) {
    host.innerHTML = `<div class="panel" style="padding:40px;text-align:center;color:#6b8099">Aucune couche définie. Créez d'abord des couches dans l'Éditeur 2D.</div>`;
    return;
  }

  const allEnds = tasks.map(t => endOf[t.id]).filter(Boolean).sort();
  const projEnd = allEnds.at(-1);
  const workdays = _workdayRange(projStart, projEnd, holidays);
  const DAY_W=52, ROW_H=64, HDR_MO=22, HDR_DAY=20, SIDEBAR_W=258;
  const headerH = HDR_MO + HDR_DAY;
  const totalW = workdays.length * DAY_W;
  const totalH = tasks.length * ROW_H;
  const dayIdx = {}; workdays.forEach((d,i) => dayIdx[d]=i);

  // Groupes de mois pour l'entête
  const months=[]; let cur=null,cs=0,cc=0;
  workdays.forEach((d,i) => {
    const mo=d.slice(0,7);
    if (mo!==cur) { if(cur) months.push({label:_ganttMonthLabel(cur),start:cs,count:cc}); cur=mo;cs=i;cc=1; } else cc++;
  });
  if (cur) months.push({label:_ganttMonthLabel(cur),start:cs,count:cc});

  // SVG : fond + grille + barres + flèches + marqueur aujourd'hui
  let svg = `<rect width="${totalW}" height="${totalH}" fill="#fafcfe"/>`;
  workdays.forEach((d,i) => {
    const isMon = new Date(d+'T00:00:00').getDay()===1;
    svg += `<line x1="${i*DAY_W}" y1="0" x2="${i*DAY_W}" y2="${totalH}" stroke="${isMon?'#c0d0e0':'#e4ecf4'}" stroke-width="${isMon?1:0.5}"/>`;
  });
  tasks.forEach((_,i) => svg += `<line x1="0" y1="${i*ROW_H}" x2="${totalW}" y2="${i*ROW_H}" stroke="#dde8f0" stroke-width="0.5"/>`);

  const todayStr = _localDateStr(new Date());
  if (dayIdx[todayStr]!==undefined) {
    const tx = dayIdx[todayStr]*DAY_W + DAY_W/2;
    svg += `<line x1="${tx}" y1="0" x2="${tx}" y2="${totalH}" stroke="#e04030" stroke-width="2" stroke-dasharray="5,3" opacity="0.75"/>`;
  }

  const BAR_COLORS = ['#1a6fa8','#1a8a6a','#6a42a8','#a85a1a','#2a9ab8','#387838'];
  tasks.forEach((t,i) => {
    const sd=startOf[t.id], ed=endOf[t.id];
    if (!sd || dayIdx[sd]===undefined) return;
    const xi=dayIdx[sd], xj=dayIdx[ed]!==undefined?dayIdx[ed]:xi;
    const x1=xi*DAY_W+2, x2=(xj+1)*DAY_W-2, y=i*ROW_H+12, bh=ROW_H-24;
    const col = t.type==='custom' ? '#c86010' : BAR_COLORS[i%BAR_COLORS.length];
    const durD = xj-xi+1;
    svg += `<rect x="${x1}" y="${y}" width="${x2-x1}" height="${bh}" rx="4" fill="${col}" opacity="0.88"/>`;
    if (x2-x1>38) svg += `<text x="${x1+6}" y="${y+bh/2+4}" font-size="11" fill="white" font-family="sans-serif" font-weight="600">${durD}j</text>`;
    // Flèche vers tâche suivante (si dépendante)
    const nextT = tasks[i+1];
    if (nextT && (delaisState.antecedentOverrides[nextT.id]===undefined || delaisState.antecedentOverrides[nextT.id]===t.id)) {
      const nsd = startOf[nextT.id];
      if (nsd && dayIdx[nsd]!==undefined) {
        const ax=(xj+1)*DAY_W-2, ay=i*ROW_H+ROW_H/2, bx=dayIdx[nsd]*DAY_W+2, by=(i+1)*ROW_H+ROW_H/2;
        if (ax<=bx) svg += `<polyline points="${ax},${ay} ${ax+4},${ay} ${ax+4},${by} ${bx},${by}" fill="none" stroke="#8899aa" stroke-width="1.2" stroke-dasharray="3,2" marker-end="url(#arr)"/>`;
      }
    }
  });
  svg = `<defs><marker id="arr" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#8899aa"/></marker></defs>` + svg;

  // Entête mois
  const moHtml = months.map(m =>
    `<div style="position:absolute;left:${m.start*DAY_W}px;width:${m.count*DAY_W-1}px;height:${HDR_MO}px;line-height:${HDR_MO}px;font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#405060;overflow:hidden;padding-left:6px;user-select:none;border-right:2px solid #b0c0d0">${m.label}</div>`
  ).join('');

  // Entête jours
  const dayHtml = workdays.map((d,i) => {
    const dn = parseInt(d.slice(8,10));
    const isMon = new Date(d+'T00:00:00').getDay()===1;
    return `<div style="position:absolute;left:${i*DAY_W}px;width:${DAY_W}px;height:${HDR_DAY}px;line-height:${HDR_DAY}px;font-size:0.68rem;text-align:center;color:#6b8099;user-select:none;border-right:1px solid ${isMon?'#b0c0d0':'#dde8f0'}">${dn}</div>`;
  }).join('');

  // Lignes de la sidebar
  const anteOptions = (curAnte, taskId) => {
    let o = `<option value=""${!curAnte?'selected':''}>— Début projet —</option>`;
    tasks.forEach(t => { if(t.id!==taskId) o+=`<option value="${t.id}"${curAnte===t.id?' selected':''}>${esc(t.label)}</option>`; });
    return o;
  };

  const sidebarRows = tasks.map((t,i) => {
    const ov = delaisState.antecedentOverrides[t.id];
    const defAnte = t.type==='custom'&&t.ctRef?.antecedentId!==undefined ? t.ctRef.antecedentId : (i>0?tasks[i-1].id:null);
    const curAnte = ov!==undefined ? (ov||'') : (defAnte||'');
    const sd=startOf[t.id]||'', ed=endOf[t.id]||'';
    const durD = sd&&ed&&dayIdx[sd]!==undefined&&dayIdx[ed]!==undefined ? dayIdx[ed]-dayIdx[sd]+1 : 0;
    return `<div class="gantt-sr" style="height:${ROW_H}px">
      <div class="gantt-sr-label" title="${esc(t.label)}">${esc(t.label)}</div>
      <div class="gantt-sr-meta">${durD}j &bull; ${sd.slice(5).replace('-','/')} → ${ed.slice(5).replace('-','/')}</div>
      <div style="display:flex;align-items:center;gap:4px">
        <select class="gantt-ante" data-tid="${t.id}" style="font-size:0.67rem;padding:1px 3px;border:1px solid #c8d8e8;border-radius:4px;color:#405060;flex:1;min-width:0">${anteOptions(curAnte,t.id)}</select>
        ${t.type==='custom'?`<button class="gantt-del-ct" data-ctid="${t.id}" title="Supprimer" style="font-size:0.75rem;color:#b02020;background:none;border:none;cursor:pointer;padding:0 4px;flex-shrink:0">✕</button>`:''}
      </div>
    </div>`;
  }).join('');

  const ctAnteOpts = `<option value="">— Début projet —</option>` + tasks.map(t=>`<option value="${t.id}">${esc(t.label)}</option>`).join('');

  // ── Données pour les graphiques de production de déchets ──────────────────
  const dailyKgMap = {};
  tasks.forEach(t => {
    if (t.type !== 'couche') return;
    const ci = parseInt(t.id.slice(2));
    const couche = state.couches[ci];
    if (!couche || !couche.holes.length) return;
    const masse = _computeCoucheMasse(couche);
    const sd = startOf[t.id], ed = endOf[t.id];
    if (!sd || !ed) return;
    const cDays = _workdayRange(sd, ed, holidays);
    if (!cDays.length) return;
    const kpd = masse / cDays.length;
    cDays.forEach(d => { dailyKgMap[d] = (dailyKgMap[d] || 0) + kpd; });
  });
  const chartTodayStr = _localDateStr(new Date());
  const dailyVals = workdays.map(d => dailyKgMap[d] || 0);
  let cumAcc = 0;
  const cumVals = dailyVals.map(v => (cumAcc += v));
  const totalMasseTxt = cumAcc >= 1000 ? `${(cumAcc/1000).toFixed(2)} t` : `${Math.round(cumAcc)} kg`;
  const chartsHtml = `<div class="panel" style="margin-top:12px;padding:16px 20px;overflow-x:auto">
    <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:14px">
      <span style="font-size:0.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#6b8099">Production de déchets estimée</span>
      <span style="font-size:0.82rem;color:#405060">Total : <strong>${totalMasseTxt}</strong></span>
    </div>
    <div style="display:flex;flex-direction:column;gap:20px">
      <div>
        <div style="font-size:0.8rem;font-weight:600;color:#405060;margin-bottom:6px">Journalière (kg/j)</div>
        ${_renderLineChart(workdays, dailyVals, chartTodayStr, '#1a6fa8', 'kg')}
      </div>
      <div>
        <div style="font-size:0.8rem;font-weight:600;color:#405060;margin-bottom:6px">Cumulée (kg)</div>
        ${_renderLineChart(workdays, cumVals, chartTodayStr, '#1a8a6a', 'kg cumulés')}
      </div>
    </div>
  </div>`;

  host.innerHTML = `<div class="delais-root">
  <div class="panel delais-settings">
    <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap">
      <label style="font-size:0.88rem;color:#405060;font-weight:600;display:flex;align-items:center;gap:8px">
        Date de début
        <input type="date" id="delais-start" value="${delaisState.startDate}" style="padding:4px 8px;border:1px solid #c8d8e8;border-radius:6px;font-size:0.88rem">
      </label>
      <span style="font-size:0.82rem;color:#6b8099">Durée/jour : <strong>${hj}h</strong> (modifiable dans Synthèse projet)</span>
      <span style="font-size:0.82rem;color:#6b8099;display:flex;align-items:center;gap:5px"><span style="display:inline-block;width:18px;border-top:2px dashed #e04030"></span> Aujourd'hui &nbsp;·&nbsp; Week-ends &amp; jours fériés FR exclus</span>
    </div>
  </div>

  <div style="display:flex;margin-top:10px;border:1px solid #c8d8e8;border-radius:8px;overflow:hidden;background:#fff">
    <!-- Sidebar -->
    <div style="width:${SIDEBAR_W}px;flex-shrink:0;border-right:2px solid #c8d8e8">
      <div style="height:${headerH}px;background:#f4f8fb;border-bottom:2px solid #c8d8e8;display:flex;align-items:flex-end;padding:0 10px 5px">
        <span style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#405060">Tâche &amp; antécédent</span>
      </div>
      ${sidebarRows}
    </div>
    <!-- Chart -->
    <div style="overflow-x:auto;flex:1">
      <div style="position:relative;width:${totalW}px;height:${HDR_MO}px;background:#f4f8fb;border-bottom:1px solid #c8d8e8">${moHtml}</div>
      <div style="position:relative;width:${totalW}px;height:${HDR_DAY}px;background:#f4f8fb;border-bottom:2px solid #c8d8e8">${dayHtml}</div>
      <svg width="${totalW}" height="${totalH}" style="display:block">${svg}</svg>
    </div>
  </div>

  <div class="panel" style="margin-top:12px;padding:16px 20px;overflow-x:auto">
    <div style="font-size:0.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#6b8099;margin-bottom:12px">Ajouter une tâche personnalisée</div>
    <form id="delais-ct-form" style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
      <label style="font-size:0.85rem;color:#405060;display:flex;flex-direction:column;gap:4px;flex:2;min-width:140px">
        Libellé
        <input type="text" id="ct-label" placeholder="Rebouchage, Évacuation…" style="padding:6px 8px;border:1px solid #c8d8e8;border-radius:6px;font-size:0.88rem">
      </label>
      <label style="font-size:0.85rem;color:#405060;display:flex;flex-direction:column;gap:4px;min-width:100px">
        Durée (jours ouvrés)
        <input type="number" id="ct-duree" min="0.5" step="0.5" value="1" style="padding:6px 8px;border:1px solid #c8d8e8;border-radius:6px;font-size:0.88rem">
      </label>
      <label style="font-size:0.85rem;color:#405060;display:flex;flex-direction:column;gap:4px;flex:2;min-width:160px">
        Antécédent
        <select id="ct-ante" style="padding:6px 8px;border:1px solid #c8d8e8;border-radius:6px;font-size:0.88rem">${ctAnteOpts}</select>
      </label>
      <button type="submit" class="btn btn-accent" style="align-self:flex-end;padding:7px 16px">+ Ajouter</button>
    </form>
  </div>
  ${chartsHtml}
</div>`;

  // ── Événements ────────────────────────────────────────────────────────────
  document.getElementById('delais-start')?.addEventListener('change', e => { delaisState.startDate = e.target.value; renderDelais(); });
  document.querySelectorAll('.gantt-ante').forEach(sel => sel.addEventListener('change', e => {
    delaisState.antecedentOverrides[e.target.dataset.tid] = e.target.value || ''; renderDelais();
  }));
  document.querySelectorAll('.gantt-del-ct').forEach(btn => btn.addEventListener('click', e => {
    const id = e.currentTarget.dataset.ctid;
    delaisState.customTasks = delaisState.customTasks.filter(c => c.id!==id);
    delete delaisState.antecedentOverrides[id];
    renderDelais();
  }));
  document.getElementById('delais-ct-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const label = (document.getElementById('ct-label')?.value||'').trim();
    if (!label) return;
    const dureeJ = parseFloat(document.getElementById('ct-duree')?.value)||1;
    const ante = document.getElementById('ct-ante')?.value||'';
    const id = `ct-${delaisState._nextCTId++}`;
    delaisState.customTasks.push({id, label, dureeJours:dureeJ, antecedentId:ante});
    if (ante) delaisState.antecedentOverrides[id] = ante;
    e.target.reset(); document.getElementById('ct-duree').value='1';
    renderDelais();
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── MODULE COÛTS ──────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

const coutsState = {
  TU: { nbMO: '', thm: '', travail: '', aleas: '0', fg: '', mb: '' },
  TA: { nbMO: '', thm: '', travail: '', aleas: '0', fg: '', mb: '' },
};

// Nombre de jours ouvrés par type depuis le planning Gantt (TU = hors Z4, TA = Z4)
function _computeCoutsJours() {
  if (!state.couches.length) return { tuJ: 0, taJ: 0 };
  try {
    const { tasks, startOf, endOf, holidays } = _buildGanttSchedule();
    let tuJ = 0, taJ = 0;
    tasks.forEach(t => {
      if (t.type !== 'couche') return;
      const ci = parseInt(t.id.slice(2));
      const couche = state.couches[ci];
      if (!couche) return;
      const sd = startOf[t.id], ed = endOf[t.id];
      if (!sd || !ed) return;
      const days = _workdayRange(sd, ed, holidays).length;
      if (couche.surface?.debouchantZ4) taJ += days; else tuJ += days;
    });
    return { tuJ, taJ };
  } catch (e) { return { tuJ: 0, taJ: 0 }; }
}

function renderCouts() {
  const host = document.getElementById('couts-host');
  if (!host) return;
  const hj = syntheseState.heuresParJour || 8;
  const { tuJ, taJ } = _computeCoutsJours();
  const num = v => (v === '' || v == null) ? null : parseFloat(v);
  function add2(a, b) { return (a == null && b == null) ? null : (a ?? 0) + (b ?? 0); }
  const eur = v => v == null
    ? '\u2013\u00a0\u20ac'
    : v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '\u00a0\u20ac';
  const INCOHERENT = '⚠\u00a0Incohérent'; // FG + MB ≥ 100 %

  const computeRow = (key, nbJ) => {
    const r = coutsState[key];
    const nbMO = num(r.nbMO), thm = num(r.thm);
    const trav = num(r.travail) ?? hj;
    const aleas = num(r.aleas) ?? 0;
    const nbJTot = nbJ + aleas;
    const fg = num(r.fg), mb = num(r.mb);
    const coutsMO = (nbMO != null && thm != null) ? nbMO * thm * trav * nbJTot : null;
    let coutRevient = null, incoherent = false;
    if (coutsMO != null && fg != null) {
      const fgD = fg / 100, mbD = (mb ?? 0) / 100;
      const denom = 1 - fgD / (1 - mbD);
      if (Math.abs(denom) < 1e-9 || denom < 0) incoherent = true;
      else coutRevient = coutsMO / denom;
    }
    let prixVente = null;
    if (coutRevient != null && mb != null) {
      const mbD = mb / 100;
      if (mbD < 1) prixVente = coutRevient / (1 - mbD);
    }
    return { nbJ, aleas, nbJTot, coutsMO, coutRevient, prixVente, incoherent };
  };

  const tuD = computeRow('TU', tuJ);
  const taD = computeRow('TA', taJ);
  const totAleas = (num(coutsState.TU.aleas) ?? 0) + (num(coutsState.TA.aleas) ?? 0);
  const totJTot  = tuJ + taJ + totAleas;
  const totMO = add2(tuD.coutsMO, taD.coutsMO);
  const totCR = add2(tuD.coutRevient, taD.coutRevient);
  const totPV = add2(tuD.prixVente, taD.prixVente);

  const inpF = (key, field, ph, step) => {
    const v = coutsState[key][field];
    const vAttr = v !== '' ? `value="${v}"` : `placeholder="${ph ?? ''}"`;
    return `<input type="number" class="couts-inp" data-key="${key}" data-field="${field}" ${vAttr} step="${step || 'any'}" min="0" style="width:100%;box-sizing:border-box;border:none;background:transparent;text-align:right;font-size:0.84rem;font-family:inherit;padding:2px 0">`;
  };

  const incoherentCell = `<td class="couts-td couts-incoherent" colspan="1" title="FG\u00a0+\u00a0MB\u00a0\u2265\u00a0100\u00a0%\u00a0: impossible">${INCOHERENT}</td>`;

  const mkRow = (label, key, nbJ, d, cls) =>
    `<tr class="${cls}">
      <td class="couts-td couts-lbl">${label}</td>
      <td class="couts-td couts-edit">${inpF(key, 'nbMO', '', '1')}</td>
      <td class="couts-td couts-edit">${inpF(key, 'thm', '', '0.01')}</td>
      <td class="couts-td couts-edit">${inpF(key, 'travail', hj, '0.5')}</td>
      <td class="couts-td couts-val">${nbJ}</td>
      <td class="couts-td couts-edit">${inpF(key, 'aleas', '0', '1')}</td>
      <td class="couts-td couts-val">${d.nbJTot}</td>
      <td class="couts-td couts-val">${eur(d.coutsMO)}</td>
      <td class="couts-td couts-edit">${inpF(key, 'fg', '', '0.1')}</td>
      ${d.incoherent ? incoherentCell : `<td class="couts-td couts-val">${eur(d.coutRevient)}</td>`}
      <td class="couts-td couts-edit">${inpF(key, 'mb', '', '0.1')}</td>
      ${d.incoherent ? incoherentCell : `<td class="couts-td couts-val">${eur(d.prixVente)}</td>`}
    </tr>`;

  host.innerHTML =
    `<div class="couts-root"><div class="panel" style="padding:0;overflow-x:auto;margin-bottom:0">
    <table class="couts-table">
      <thead><tr>
        <th class="couts-th">Type de tenue</th>
        <th class="couts-th">Nb MO (u)</th>
        <th class="couts-th">THM (\u20ac/h)</th>
        <th class="couts-th">Travail (h/j)</th>
        <th class="couts-th">Nb jours</th>
        <th class="couts-th">Nb jours al\u00e9as</th>
        <th class="couts-th">Nb jours totaux</th>
        <th class="couts-th">Co\u00fbts MO</th>
        <th class="couts-th">FG (%)</th>
        <th class="couts-th">Co\u00fbts de revient (\u20ac)</th>
        <th class="couts-th">MB (%)</th>
        <th class="couts-th">Co\u00fbts de vente</th>
      </tr></thead>
      <tbody>
        ${mkRow('TU', 'TU', tuJ, tuD, 'couts-row-tu')}
        ${mkRow('TA', 'TA', taJ, taD, 'couts-row-ta')}
        <tr class="couts-row-tot">
          <td class="couts-td couts-lbl">TU+TA</td>
          <td class="couts-td"></td><td class="couts-td"></td><td class="couts-td"></td>
          <td class="couts-td couts-val">${tuJ + taJ}</td>
          <td class="couts-td couts-val">${totAleas}</td>
          <td class="couts-td couts-val">${totJTot}</td>
          <td class="couts-td couts-val couts-strong">${eur(totMO)}</td>
          <td class="couts-td"></td>
          <td class="couts-td couts-val couts-strong">${eur(totCR)}</td>
          <td class="couts-td"></td>
          <td class="couts-td couts-val couts-strong">${eur(totPV)}</td>
        </tr>
      </tbody>
    </table>
  </div></div>`;

  host.querySelectorAll('.couts-inp').forEach(el => el.addEventListener('change', e => {
    coutsState[e.target.dataset.key][e.target.dataset.field] = e.target.value;
    renderCouts();
  }));
}


// ── Rendu de l'onglet Paramètres de calcul ───────────────────────────────────
function renderParams() {
  const host = document.getElementById('params-host');
  if (!host) return;

  const p = syntheseState;

  // Tableau de rendement actif
  const activeRendTable =
    rendState.tables.find(t => t.id === p.rendTableId) ||
    rendState.tables[0] || null;
  if (activeRendTable) p.rendTableId = activeRendTable.id;

  const _rendEsc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  host.innerHTML = `
    <div class="synth-root" style="max-width:860px">
      <div class="panel synth-params-panel">
        <div class="synth-section-title">Paramètres de calcul</div>
        <div class="synth-params-grid">

          <div class="synth-param-group synth-param-span2">
            <label class="synth-label">Tableau de rendements utilisé</label>
            <select id="params-rend-table" class="synth-select">
              ${rendState.tables.length === 0
                ? '<option value="">— aucun tableau disponible —</option>'
                : rendState.tables.map(t =>
                    `<option value="${_rendEsc(t.id)}" ${t.id === activeRendTable?.id ? 'selected' : ''}>${_rendEsc(t.nom)}</option>`
                  ).join('')}
            </select>
          </div>

          <div class="synth-param-group">
            <label class="synth-label">Facteur correctif rendement (%)</label>
            <input type="number" id="params-facteur" class="synth-input" min="1" max="500" step="1" value="${p.facteurCorrectif}" />
          </div>

          <div class="synth-param-group">
            <label class="synth-label">Heures de travail effectif / jour</label>
            <input type="number" id="params-h-jour" class="synth-input" min="0.1" max="24" step="0.5" value="${p.heuresParJour}" />
          </div>

          <div class="synth-param-sep synth-param-span3"></div>

          <div class="synth-param-group">
            <label class="synth-label">Pause entre carottages (h)</label>
            <input type="number" id="params-t-pause" class="synth-input" min="0" step="0.05" value="${p.tPause}" />
          </div>
          <div class="synth-param-group">
            <label class="synth-label">Extraction de la carotte (h)</label>
            <input type="number" id="params-t-extraction" class="synth-input" min="0" step="0.05" value="${p.tExtraction}" />
          </div>
          <div class="synth-param-group">
            <label class="synth-label">Façonnage (h)</label>
            <input type="number" id="params-t-faconnage" class="synth-input" min="0" step="0.1" value="${p.tFaconnage}" />
          </div>
          <div class="synth-param-group">
            <label class="synth-label">Installation carotteuse — 1× par entité (h)</label>
            <input type="number" id="params-t-install" class="synth-input" min="0" step="0.5" value="${p.tInstallation}" />
          </div>
          <div class="synth-param-group">
            <label class="synth-label">Repli carotteuse — 1× par entité (h)</label>
            <input type="number" id="params-t-repli" class="synth-input" min="0" step="0.5" value="${p.tRepli}" />
          </div>
          <div class="synth-param-group">
            <label class="synth-label">Autres (h)</label>
            <input type="number" id="params-t-autres" class="synth-input" min="0" step="0.1" value="${p.tAutres}" />
          </div>

        </div>
        <p class="synth-formula-note">
          Temps brut = Prof. totale (m) &times; Rendement (h/m)
          &nbsp;&nbsp;&bull;&nbsp;&nbsp;
          Temps global = Tps brut + (pause + extraction) &times; nb carottages + installation + repli + façonnage + autres
        </p>
      </div>
    </div>
  `;

  // ── Événements ────────────────────────────────────────────────────────────
  document.getElementById('params-rend-table')?.addEventListener('change', e => {
    syntheseState.rendTableId = e.target.value; synthSaveToLS(); renderSynthese(); renderParams();
  });
  const _bindNum = (id, key, min = 0) => {
    document.getElementById(id)?.addEventListener('change', e => {
      const v = parseFloat(e.target.value);
      if (!isNaN(v) && v >= min) { syntheseState[key] = v; synthSaveToLS(); renderSynthese(); }
    });
  };
  _bindNum('params-facteur',       'facteurCorrectif', 1);
  _bindNum('params-h-jour',        'heuresParJour', 0.1);
  _bindNum('params-t-pause',       'tPause');
  _bindNum('params-t-extraction',  'tExtraction');
  _bindNum('params-t-install',     'tInstallation');
  _bindNum('params-t-repli',       'tRepli');
  _bindNum('params-t-faconnage',   'tFaconnage');
  _bindNum('params-t-autres',      'tAutres');
}


// ── Snapshot ISO 3D (offscreen canvas) ───────────────────────────────────────
function _captureISO3D(snapW, snapH) {
  snapW = snapW || 520; snapH = snapH || 320;
  const realCanvas = document.getElementById('canvas-3d');
  // Absolute-positioned off-screen div so offsetParent is non-null
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:' + snapW + 'px;height:' + snapH + 'px;overflow:hidden;pointer-events:none';
  const cv = document.createElement('canvas');
  cv.style.cssText = 'width:' + snapW + 'px;height:' + snapH + 'px;display:block';
  cv.id = 'canvas-3d';
  wrapper.appendChild(cv);
  if (realCanvas) realCanvas.removeAttribute('id');
  document.body.appendChild(wrapper);
  const savedAz = view3d.azimuth, savedTilt = view3d.tilt, savedZoom = view3d.zoom;
  const savedPanX = view3d.panX, savedPanY = view3d.panY;
  view3d.azimuth = -Math.PI / 5;
  view3d.tilt = Math.PI / 3;
  view3d.zoom = 1;
  view3d.panX = 0;
  view3d.panY = 0;
  let dataURL = null;
  try { render3D(); dataURL = cv.toDataURL('image/png'); } catch(e) {}
  view3d.azimuth = savedAz; view3d.tilt = savedTilt; view3d.zoom = savedZoom;
  view3d.panX = savedPanX; view3d.panY = savedPanY;
  cv.removeAttribute('id');
  if (realCanvas) realCanvas.id = 'canvas-3d';
  document.body.removeChild(wrapper);
  return dataURL;
}

// ── SVG miniature 2D d'une couche ─────────────────────────────────────────────
function _synthLayerSVG(couche) {
  const s = couche.surface;
  const isCirc = s.nature === 'circulaire';
  const W = isCirc ? (s.diametre != null ? s.diametre : s.width) : s.width;
  const H = isCirc ? W : s.height;
  if (!W || !H) return '';
  const PAD = 12, SW = 220, SH = 160;
  const sc = Math.min((SW - PAD*2) / W, (SH - PAD*2) / H);
  const ox = (SW - W*sc) / 2, oy = (SH - H*sc) / 2;
  const mx = v => (ox + v*sc).toFixed(2);
  const my = v => (oy + v*sc).toFixed(2);
  const uid = Math.random().toString(36).slice(2, 8);
  let inner = '';
  if (isCirc) {
    const cx = (ox + W/2*sc).toFixed(2), cy = (oy + H/2*sc).toFixed(2), r = (W/2*sc).toFixed(2);
    inner += `<defs><clipPath id="sc${uid}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath></defs>`;
    inner += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#f0f6fb" stroke="#1e455f" stroke-width="2"/>`;
    const gholes = couche.holes.map(h => {
      const hr = Math.max(2, h.diameter/2*sc).toFixed(2);
      return `<circle cx="${mx(h.x)}" cy="${my(h.y)}" r="${hr}" fill="rgba(31,77,180,0.4)" stroke="#1a50c8" stroke-width="1"/>`;
    }).join('');
    inner += `<g clip-path="url(#sc${uid})">${gholes}</g>`;
    inner += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#1e455f" stroke-width="2"/>`;
  } else {
    inner += `<rect x="${ox.toFixed(2)}" y="${oy.toFixed(2)}" width="${(W*sc).toFixed(2)}" height="${(H*sc).toFixed(2)}" fill="#f0f6fb" stroke="#1e455f" stroke-width="2"/>`;
    (couche.zones || []).forEach(z => {
      const zfill = z.type==='decoupe' ? 'rgba(58,64,144,0.15)' : z.type==='souszone' ? 'rgba(32,112,64,0.18)' : 'rgba(176,48,48,0.18)';
      const zstroke = z.type==='decoupe' ? '#3a4090' : z.type==='souszone' ? '#207040' : '#b03030';
      inner += `<rect x="${mx(z.x)}" y="${my(z.y)}" width="${(z.w*sc).toFixed(2)}" height="${(z.h*sc).toFixed(2)}" fill="${zfill}" stroke="${zstroke}" stroke-width="1.5" stroke-dasharray="4 2"/>`;
    });
    couche.holes.forEach(h => {
      const hr = Math.max(2, h.diameter/2*sc).toFixed(2);
      inner += `<circle cx="${mx(h.x)}" cy="${my(h.y)}" r="${hr}" fill="rgba(31,77,180,0.4)" stroke="#1a50c8" stroke-width="1"/>`;
    });
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SW}" height="${SH}" viewBox="0 0 ${SW} ${SH}" style="background:#fff;border-radius:6px;border:1px solid #c8d8e8">${inner}</svg>`;
}

// ── Gantt miniature lecture seule ──────────────────────────────────────────────
function _buildMiniGanttHtml() {
  try {
    const {tasks, startOf, endOf, holidays, projStart} = _buildGanttSchedule();
    if (!tasks.length) return '<p class="synth-empty-msg" style="padding:12px">Aucun planning défini.</p>';
    const allEnds = tasks.map(t => endOf[t.id]).filter(Boolean).sort();
    const projEnd = allEnds.at(-1);
    const workdays = _workdayRange(projStart, projEnd, holidays);
    if (!workdays.length) return '<p class="synth-empty-msg" style="padding:12px">Aucun jour ouvré calculé.</p>';
    const DAY_W = Math.max(6, Math.min(28, Math.round(760 / workdays.length)));
    const ROW_H = 28;
    const totalW = workdays.length * DAY_W;
    const totalH = tasks.length * ROW_H;
    const dayIdx = {}; workdays.forEach((d, i) => dayIdx[d] = i);
    // Month labels
    const months = []; let cur = null, cs = 0, cc = 0;
    workdays.forEach((d, i) => {
      const mo = d.slice(0, 7);
      if (mo !== cur) { if (cur) months.push({mo: cur, s: cs, c: cc}); cur = mo; cs = i; cc = 1; } else cc++;
    });
    if (cur) months.push({mo: cur, s: cs, c: cc});
    const MO_LABELS = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'];
    const moHtml = months.map(m => {
      const mo = parseInt(m.mo.split('-')[1]) - 1;
      const yr = m.mo.split('-')[0].slice(2);
      return `<div style="position:absolute;left:${m.s*DAY_W}px;width:${m.c*DAY_W}px;height:20px;line-height:20px;font-size:0.62rem;font-weight:700;text-transform:uppercase;color:#405060;overflow:hidden;padding-left:4px;border-right:1px solid #c0d0e0;box-sizing:border-box">${MO_LABELS[mo]} ${yr}</div>`;
    }).join('');
    const BAR_COLORS = ['#1a6fa8','#1a8a6a','#6a42a8','#a85a1a','#2a9ab8','#387838'];
    const todayStr = _localDateStr(new Date());
    const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    let bars = `<rect width="${totalW}" height="${totalH}" fill="#fafcfe"/>`;
    // Grid lines for Mondays
    workdays.forEach((d, i) => {
      if (new Date(d + 'T00:00:00').getDay() === 1) {
        bars += `<line x1="${i*DAY_W}" y1="0" x2="${i*DAY_W}" y2="${totalH}" stroke="#c8d8e8" stroke-width="0.5"/>`;
      }
    });
    if (dayIdx[todayStr] !== undefined) {
      const tx = dayIdx[todayStr]*DAY_W + DAY_W/2;
      bars += `<line x1="${tx}" y1="0" x2="${tx}" y2="${totalH}" stroke="#e04030" stroke-width="1.5" stroke-dasharray="4 2" opacity="0.75"/>`;
    }
    tasks.forEach((t, i) => {
      const sd = startOf[t.id], ed = endOf[t.id];
      if (!sd || dayIdx[sd] === undefined) return;
      const xi = dayIdx[sd], xj = dayIdx[ed] !== undefined ? dayIdx[ed] : xi;
      const x1 = xi*DAY_W+1, bw = Math.max(2, (xj-xi+1)*DAY_W-2), y = i*ROW_H+4, bh = ROW_H-8;
      const col = t.type === 'custom' ? '#c86010' : BAR_COLORS[i % BAR_COLORS.length];
      bars += `<rect x="${x1}" y="${y}" width="${bw}" height="${bh}" rx="3" fill="${col}" opacity="0.88"/>`;
      if (bw > 60) bars += `<text x="${x1+5}" y="${y+bh/2+4}" font-size="9" fill="white" font-family="sans-serif" font-weight="600">${esc(t.label)}</text>`;
    });
    return `<div style="overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:6px;border:1px solid #c8d8e8;margin-top:10px">
      <div style="position:relative;width:${totalW}px;height:20px;background:#f4f8fb;border-bottom:1px solid #c8d8e8;overflow:hidden">${moHtml}</div>
      <svg width="${totalW}" height="${totalH}" style="display:block">${bars}</svg>
    </div>`;
  } catch(e) {
    return '<p class="synth-empty-msg" style="padding:12px">Erreur planning.</p>';
  }
}

// ── Graphiques déchets pour la synthèse ───────────────────────────────────────
function _buildDechetChartsHtml() {
  try {
    const {tasks, startOf, endOf, holidays, projStart} = _buildGanttSchedule();
    if (!tasks.length) return '';
    const allEnds = tasks.map(t => endOf[t.id]).filter(Boolean).sort();
    const projEnd = allEnds.at(-1);
    const workdays = _workdayRange(projStart, projEnd, holidays);
    if (!workdays.length) return '';
    const dailyKgMap = {};
    tasks.forEach(t => {
      if (t.type !== 'couche') return;
      const ci = parseInt(t.id.slice(2));
      const couche = state.couches[ci];
      if (!couche || !couche.holes.length) return;
      const masse = _computeCoucheMasse(couche);
      const sd = startOf[t.id], ed = endOf[t.id];
      if (!sd || !ed) return;
      const cDays = _workdayRange(sd, ed, holidays);
      if (!cDays.length) return;
      const kpd = masse / cDays.length;
      cDays.forEach(d => { dailyKgMap[d] = (dailyKgMap[d] || 0) + kpd; });
    });
    const todayStr = _localDateStr(new Date());
    const dailyVals = workdays.map(d => dailyKgMap[d] || 0);
    let cumAcc = 0;
    const cumVals = dailyVals.map(v => (cumAcc += v));
    const totalMasseTxt = cumAcc >= 1000 ? `${(cumAcc/1000).toFixed(2)}\u00a0t` : `${Math.round(cumAcc)}\u00a0kg`;
    return `<div style="margin-top:10px">
      <div style="font-size:0.82rem;color:#405060;margin-bottom:12px">Total\u00a0: <strong>${totalMasseTxt}</strong></div>
      <div style="display:flex;flex-direction:column;gap:20px">
        <div>
          <div style="font-size:0.78rem;font-weight:600;color:#405060;margin-bottom:6px">Journalière (kg/j)</div>
          ${_renderLineChart(workdays, dailyVals, todayStr, '#1a6fa8', 'kg')}
        </div>
        <div>
          <div style="font-size:0.78rem;font-weight:600;color:#405060;margin-bottom:6px">Cumulée (kg)</div>
          ${_renderLineChart(workdays, cumVals, todayStr, '#1a8a6a', 'kg cumulés')}
        </div>
      </div>
    </div>`;
  } catch(e) {
    return '<p class="synth-empty-msg" style="padding:12px">Erreur graphiques déchets.</p>';
  }
}

// ── Rendu principal de l'onglet Synthèse ─────────────────────────────────────
function renderSynthese() {
  const host = document.getElementById('synth-host');
  if (!host) return;

  const p = syntheseState;

  // Tableau de rendement actif
  const activeRendTable =
    rendState.tables.find(t => t.id === p.rendTableId) ||
    rendState.tables[0] || null;
  if (activeRendTable) p.rendTableId = activeRendTable.id;

  // Rendement forcé (null = non activé) — maintenant par couche, passé en paramètre

  // ── helper : groupe les trous par diamètre et calcule les stats ────────────
  function _computeBloc(holes, maillage, isZ4, profDefault, fcOverride) {
    const fcGlob = (fcOverride != null && fcOverride > 0) ? fcOverride : null;
    // Grouper par (diamètre + rendOverride) pour séparer les overrides par sous-zone
    const byGroup = new Map();
    for (const hole of holes) {
      const diam = hole.diameter;
      const prof = hole.profondeur != null ? hole.profondeur : profDefault;
      // Priorité : override par trou (sous-zone) > override couche > null (table)
      const rendHole = (hole.rendForce && hole.rendForceVal > 0) ? hole.rendForceVal : null;
      const effOverride = rendHole ?? fcGlob;
      const key = `${diam}|${effOverride ?? ''}`;
      if (!byGroup.has(key)) byGroup.set(key, { diam, count: 0, profTotale: 0, rendOverride: effOverride });
      const g = byGroup.get(key);
      g.count++;
      g.profTotale += prof;
    }
    let totalCount = 0, totalProfM = 0, totalTpsBrut = 0, totalMasse = 0;
    const rows = [];
    for (const [, g] of [...byGroup].sort((a, b) => a[1].diam - b[1].diam || (a[1].rendOverride ?? 0) - (b[1].rendOverride ?? 0))) {
      const rendRaw = rendLookup(activeRendTable, g.diam, maillage, isZ4);
      let   rend    = rendRaw != null ? rendRaw * (p.facteurCorrectif / 100) : null;
      if (g.rendOverride != null) rend = g.rendOverride;
      const profTotM = g.profTotale / 1000;
      const tpsBrut  = rend != null ? profTotM * rend : null;  // h = m × h/m
      const masse    = masseCarotte(g.diam, g.profTotale / g.count) * g.count;
      totalCount   += g.count;
      totalProfM   += profTotM;
      if (tpsBrut != null) totalTpsBrut += tpsBrut;
      totalMasse   += masse;
      rows.push({ diam: g.diam, count: g.count,
                  profUnitMm: Math.round(g.profTotale / g.count),
                  profTotM, rendRaw, rend, tpsBrut, masse });
    }
    const tpsUnit = p.tPause + p.tExtraction;
    const tpsGlob = totalTpsBrut + p.tInstallation + p.tRepli + tpsUnit * totalCount;
    return { totalCount, totalProfM, totalTpsBrut, tpsGlob, totalMasse, rows };
  }

  // ── helper : HTML du tableau de détail par diamètre ───────────────────────
  function _detailHtml(bloc, materialStats) {
    if (bloc.totalCount === 0)
      return '<p class="synth-empty-msg">Aucun carottage dans cette entité.</p>';
    const trs = bloc.rows.map(r => `
      <tr>
        <td>${r.diam}</td>
        <td>${r.count}</td>
        <td>${r.profUnitMm}</td>
        <td>${_sfmt(r.profTotM, 3)}&nbsp;m</td>
        <td>${r.rendRaw != null ? _sfmt(r.rendRaw) + '&nbsp;h/m' : '<em class="synth-na">hors plage</em>'}</td>
        <td>${r.rend    != null ? _sfmt(r.rend)    + '&nbsp;h/m' : '—'}</td>
        <td>${r.tpsBrut != null ? _sfmt(r.tpsBrut) + '&nbsp;h'   : '—'}</td>
        <td>${_sfmt(r.masse / r.count, 1)}&nbsp;kg</td>
        <td>${_sfmt(r.masse, 0)}&nbsp;kg</td>
      </tr>`).join('');
    const joures = p.heuresParJour > 0 ? bloc.tpsGlob / p.heuresParJour : null;
    return `
      <div class="synth-table-wrap">
        <table class="synth-table">
          <thead><tr>
            <th>Ø&nbsp;(mm)</th>
            <th>Nb</th>
            <th>P.&nbsp;unit.&nbsp;(mm)</th>
            <th>P.&nbsp;totale</th>
            <th>Rend.&nbsp;table</th>
            <th>Rend.&nbsp;corr.</th>
            <th>Tps&nbsp;brut</th>
            <th>Masse&nbsp;unit.</th>
            <th>Masse&nbsp;tot.</th>
          </tr></thead>
          <tbody>${trs}</tbody>
        </table>
      </div>
      <div class="synth-couche-total">
        <span>Total&nbsp;: <strong>${bloc.totalCount}</strong> carottages</span>
        <span>Prof.&nbsp;totale&nbsp;: <strong>${_sfmt(bloc.totalProfM, 3)}&nbsp;m</strong></span>
        <span>Temps&nbsp;brut&nbsp;: <strong>${_sfmt(bloc.totalTpsBrut)}&nbsp;h</strong></span>
        <span>Temps&nbsp;global&nbsp;: <strong>${_sfmt(bloc.tpsGlob)}&nbsp;h</strong></span>
        ${joures != null ? `<span>Durée&nbsp;: <strong>${_sfmt(joures, 1)}&nbsp;j</strong></span>` : ''}
        <span>Masse&nbsp;carottes&nbsp;: <strong>${_sfmt(bloc.totalMasse, 0)}&nbsp;kg</strong></span>
        ${materialStats ? `<span>Masse&nbsp;carottée&nbsp;réelle&nbsp;: <strong>${_sfmt(materialStats.removedMassKg, 0)}&nbsp;kg</strong></span>
        <span>Béton&nbsp;intact&nbsp;: <strong>${_sfmt(materialStats.intactMassKg, 0)}&nbsp;kg</strong></span>` : ''}
      </div>`;
  }

  // ── Calcul couche par couche ───────────────────────────────────────────────
  let grandCount = 0, grandProfM = 0, grandTpsBrut = 0, grandTpsGlob = 0, grandMasse = 0;
  let grandMasseRetiree = 0, grandMasseIntacte = 0;

  const coucheCards = state.couches.map(couche => {
    const s    = couche.surface;
    const fc   = s.rendementForce ? (s.rendementForceVal || 5) : null;
    const bloc = _computeBloc(
      couche.holes,
      s.maillageFerraillage || 'moyen',
      !!s.debouchantZ4,
      s.profondeur || 200,
      fc
    );
    const matStats = _computeCoucheMaterialStats(couche);
    grandCount        += bloc.totalCount;
    grandProfM        += bloc.totalProfM;
    grandTpsBrut      += bloc.totalTpsBrut;
    grandTpsGlob      += bloc.tpsGlob;
    grandMasse        += bloc.totalMasse;
    grandMasseRetiree += matStats.removedMassKg;
    grandMasseIntacte += matStats.intactMassKg;
    const mail = (s.maillageFerraillage || 'moyen');
    return `
      <div class="panel synth-couche-card">
        <div class="synth-couche-header">
          <span class="synth-couche-name">${_rendEsc(couche.label)}</span>
          <span class="synth-badge">
            ${s.width}&times;${s.height}&nbsp;mm
            &nbsp;|&nbsp; Prof.&nbsp;${s.profondeur || 200}&nbsp;mm
            &nbsp;|&nbsp; ${mail.charAt(0).toUpperCase() + mail.slice(1)}
            &nbsp;|&nbsp; Zone&nbsp;4&nbsp;:&nbsp;${s.debouchantZ4 ? '<strong>Oui</strong>' : 'Non'}
          </span>
        </div>
        ${_detailHtml(bloc, matStats)}
      </div>`;
  });

  const psCards = state.plansSpeciaux.map(ps => {
    const s    = ps.surface;
    const fc   = s.rendementForce ? (s.rendementForceVal || 5) : null;
    const bloc = _computeBloc(
      ps.holes || [],
      s.maillageFerraillage || 'moyen',
      !!s.debouchantZ4,
      s.profondeur || 200,
      fc
    );
    const matStats = _computeCoucheMaterialStats(ps);
    grandCount        += bloc.totalCount;
    grandProfM        += bloc.totalProfM;
    grandTpsBrut      += bloc.totalTpsBrut;
    grandTpsGlob      += bloc.tpsGlob;
    grandMasse        += bloc.totalMasse;
    grandMasseRetiree += matStats.removedMassKg;
    grandMasseIntacte += matStats.intactMassKg;
    const mail = (s.maillageFerraillage || 'moyen');
    return `
      <div class="panel synth-couche-card synth-ps-card">
        <div class="synth-couche-header">
          <span class="synth-couche-name">Plan spécial — ${_rendEsc(ps.label)}</span>
          <span class="synth-badge">
            ${s.width}&times;${s.height}&nbsp;mm
            &nbsp;|&nbsp; Prof.&nbsp;${s.profondeur || 200}&nbsp;mm
            &nbsp;|&nbsp; IX&nbsp;${s.inclinaisonX || 0}° IZ&nbsp;${s.inclinaisonZ || 0}°
            &nbsp;|&nbsp; ${mail.charAt(0).toUpperCase() + mail.slice(1)}
            &nbsp;|&nbsp; Zone&nbsp;4&nbsp;:&nbsp;${s.debouchantZ4 ? '<strong>Oui</strong>' : 'Non'}
          </span>
        </div>
        ${_detailHtml(bloc, matStats)}
      </div>`;
  });

  const joursGlobal = p.heuresParJour > 0 ? (grandTpsGlob + p.tFaconnage + p.tAutres) / p.heuresParJour : null;
  const grandTpsGlobTotal = grandTpsGlob + p.tFaconnage + p.tAutres;

  // ── Assembler le HTML ──────────────────────────────────────────────────────
  // ── Snapshots vues modèle ─────────────────────────────────────────────────────────────────────
  const _iso3dUrl = _captureISO3D(520, 320);
  const _layerViews = state.couches.map((c, ci) => {
    const lbl = String(c.label || ('Couche ' + (ci + 1))).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const svg = _synthLayerSVG(c);
    return svg ? `<div style="text-align:center"><div style="font-size:0.7rem;color:#405060;margin-bottom:3px;font-weight:600;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${lbl}</div>${svg}</div>` : '';
  }).filter(Boolean).join('');

  host.innerHTML = `
    <div class="synth-root">

      <!-- Vues du modèle -->
      <div class="panel" style="margin-bottom:16px">
        <div class="synth-section-title">Vues du modèle</div>
        <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start">
          <div>
            <div style="font-size:0.75rem;font-weight:700;color:#6b8099;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Vue ISO 3D</div>
            ${_iso3dUrl ? `<img src="${_iso3dUrl}" width="520" height="320" style="border-radius:8px;border:1px solid #c8d8e8;display:block;background:#1a2a3a;object-fit:contain">` : '<p class="synth-empty-msg">Vue 3D non disponible.</p>'}
          </div>
          ${_layerViews ? `<div style="flex:1;min-width:220px"><div style="font-size:0.75rem;font-weight:700;color:#6b8099;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Plans 2D par couche</div><div style="display:flex;flex-wrap:wrap;gap:12px">${_layerViews}</div></div>` : ''}
        </div>
      </div>

      <!-- Résumé global -->
      <div class="panel synth-global-panel">
        <div class="synth-section-title">Résumé global</div>
        <div class="synth-kpi-row">
          <div class="synth-kpi"><div class="synth-kpi-val">${grandCount}</div><div class="synth-kpi-lbl">Carottages</div></div>
          <div class="synth-kpi"><div class="synth-kpi-val">${_sfmt(grandProfM, 2)}&nbsp;m</div><div class="synth-kpi-lbl">Profondeur totale</div></div>
          <div class="synth-kpi"><div class="synth-kpi-val">${_sfmt(grandTpsBrut, 1)}&nbsp;h</div><div class="synth-kpi-lbl">Temps brut</div></div>
          <div class="synth-kpi"><div class="synth-kpi-val">${_sfmt(grandTpsGlobTotal, 1)}&nbsp;h</div><div class="synth-kpi-lbl">Temps global</div></div>
          <div class="synth-kpi"><div class="synth-kpi-val">${joursGlobal != null ? _sfmt(joursGlobal, 1) + '&nbsp;j' : '—'}</div><div class="synth-kpi-lbl">Durée estimée</div></div>
          <div class="synth-kpi"><div class="synth-kpi-val">${_sfmt(grandMasseRetiree, 0)}&nbsp;kg</div><div class="synth-kpi-lbl">Masse carottée réelle</div></div>
          <div class="synth-kpi"><div class="synth-kpi-val">${_sfmt(grandMasseIntacte, 0)}&nbsp;kg</div><div class="synth-kpi-lbl">Béton intact</div></div>
        </div>
      </div>

      <!-- Détail par couche / plan spécial -->
      <div class="synth-couches-list">
        ${[...coucheCards, ...psCards].join('') ||
          '<p class="synth-empty-msg" style="padding:24px">Aucune couche définie.</p>'}
      </div>

    </div>
  `;

  // ── Événements des champs paramètres ──────────────────────────────────────

  // ── Panneaux résumé lecture seule : Planning / Coûts / Production déchets ──
  (() => {
    const root = host.querySelector('.synth-root');
    if (!root) return;
    const num2 = v => (v === '' || v == null) ? null : parseFloat(v);
    const add2 = (a, b) => (a == null && b == null) ? null : (a ?? 0) + (b ?? 0);
    const eur  = v => v == null
      ? '—'
      : v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '\u00a0€';
    const fmtDate = s => s ? new Date(s + 'T00:00:00').toLocaleDateString('fr-FR') : '—';

    // ── Planning ──
    let planHtml;
    try {
      const { endOf, projStart } = _buildGanttSchedule();
      const allEnds = Object.values(endOf).filter(Boolean).sort();
      const projEnd = allEnds.at(-1) || projStart;
      const { tuJ, taJ } = _computeCoutsJours();
      planHtml = `
        <div class="synth-kpi-row">
          <div class="synth-kpi"><div class="synth-kpi-val">${fmtDate(projStart)}</div><div class="synth-kpi-lbl">Début</div></div>
          <div class="synth-kpi"><div class="synth-kpi-val">${fmtDate(projEnd)}</div><div class="synth-kpi-lbl">Fin</div></div>
          <div class="synth-kpi"><div class="synth-kpi-val">${tuJ}\u00a0j</div><div class="synth-kpi-lbl">Jours TU</div></div>
          <div class="synth-kpi"><div class="synth-kpi-val">${taJ}\u00a0j</div><div class="synth-kpi-lbl">Jours TA</div></div>
          <div class="synth-kpi"><div class="synth-kpi-val">${tuJ + taJ}\u00a0j</div><div class="synth-kpi-lbl">Total jours ouvrés</div></div>
        </div>`;
    } catch (e) {
      planHtml = '<p class="synth-empty-msg" style="padding:12px">Aucun planning défini.</p>';
    }

    // ── Coûts ──
    let coutsHtml;
    try {
      const hj2 = syntheseState.heuresParJour || 8;
      const { tuJ, taJ } = _computeCoutsJours();
      const computeRowS = (key, nbJ) => {
        const r = coutsState[key];
        const nbMO = num2(r.nbMO), thm = num2(r.thm);
        const trav = num2(r.travail) ?? hj2;
        const aleas = num2(r.aleas) ?? 0;
        const fg = num2(r.fg), mb = num2(r.mb);
        const coutsMO = (nbMO != null && thm != null) ? nbMO * thm * trav * (nbJ + aleas) : null;
        let coutRevient = null;
        if (coutsMO != null && fg != null) {
          const fgD = fg / 100, mbD = (mb ?? 0) / 100;
          const denom = 1 - fgD / (1 - mbD);
          if (Math.abs(denom) >= 1e-9 && denom > 0) coutRevient = coutsMO / denom;
        }
        let prixVente = null;
        if (coutRevient != null && mb != null && mb / 100 < 1) prixVente = coutRevient / (1 - mb / 100);
        return { coutsMO, coutRevient, prixVente };
      };
      const tuD = computeRowS('TU', tuJ);
      const taD = computeRowS('TA', taJ);
      coutsHtml = `
        <div class="synth-kpi-row">
          <div class="synth-kpi"><div class="synth-kpi-val">${eur(tuD.coutsMO)}</div><div class="synth-kpi-lbl">Coûts MO (TU)</div></div>
          <div class="synth-kpi"><div class="synth-kpi-val">${eur(taD.coutsMO)}</div><div class="synth-kpi-lbl">Coûts MO (TA)</div></div>
          <div class="synth-kpi"><div class="synth-kpi-val">${eur(add2(tuD.coutsMO, taD.coutsMO))}</div><div class="synth-kpi-lbl">Total Coûts MO</div></div>
          <div class="synth-kpi"><div class="synth-kpi-val">${eur(add2(tuD.coutRevient, taD.coutRevient))}</div><div class="synth-kpi-lbl">Coût de revient</div></div>
          <div class="synth-kpi"><div class="synth-kpi-val">${eur(add2(tuD.prixVente, taD.prixVente))}</div><div class="synth-kpi-lbl">Prix de vente</div></div>
        </div>`;
    } catch (e) {
      coutsHtml = '<p class="synth-empty-msg" style="padding:12px">Aucune donnée de coûts.</p>';
    }

    // ── Production de déchets ──
    let dechetHtml;
    try {
      let totalRetire = 0, totalIntact = 0;
      state.couches.forEach(c => {
        const ms = _computeCoucheMaterialStats(c);
        totalRetire += ms.removedMassKg;
        totalIntact += ms.intactMassKg;
      });
      const masseStr  = totalRetire >= 1000 ? `${(totalRetire / 1000).toFixed(2)}\u00a0t` : `${Math.round(totalRetire)}\u00a0kg`;
      const masseTStr = `${(totalRetire / 1000).toFixed(3)}\u00a0t`;
      const intactStr = totalIntact >= 1000 ? `${(totalIntact / 1000).toFixed(2)}\u00a0t` : `${Math.round(totalIntact)}\u00a0kg`;
      dechetHtml = `
        <div class="synth-kpi-row">
          <div class="synth-kpi"><div class="synth-kpi-val">${masseStr}</div><div class="synth-kpi-lbl">Masse carottée réelle</div></div>
          <div class="synth-kpi"><div class="synth-kpi-val">${masseTStr}</div><div class="synth-kpi-lbl">En tonnes</div></div>
          <div class="synth-kpi"><div class="synth-kpi-val">${intactStr}</div><div class="synth-kpi-lbl">Béton intact restant</div></div>
        </div>`;
    } catch (e) {
      dechetHtml = '<p class="synth-empty-msg" style="padding:12px">Aucune donnée de masse.</p>';
    }

    root.insertAdjacentHTML('beforeend', `
      <div class="panel synth-global-panel" style="margin-top:16px">
        <div class="synth-section-title">🗓 Planning</div>
        ${planHtml}
        ${_buildMiniGanttHtml()}
      </div>
      <div class="panel synth-global-panel" style="margin-top:16px">
        <div class="synth-section-title">💰 Coûts</div>
        ${coutsHtml}
      </div>
      <div class="panel synth-global-panel" style="margin-top:16px">
        <div class="synth-section-title">♻️ Production de déchets</div>
        ${dechetHtml}
        ${_buildDechetChartsHtml()}
      </div>
    `);
  })();
}

// ── Rendu de l'onglet Devlog ──────────────────────────────────────────────────
async function renderDevlog() {
  const host = document.getElementById('devlog-host');
  if (!host) return;
  host.innerHTML = '<p style="padding:32px;color:#6b8099">Chargement du devlog…</p>';
  try {
    const resp = await fetch('./devlog.md?_=' + Date.now());
    if (!resp.ok) throw new Error('Fichier devlog.md introuvable (code ' + resp.status + ')');
    const txt = await resp.text();
    host.innerHTML = '<div class="devlog-root">' + _mdToHtml(txt) + '</div>';
  } catch (e) {
    host.innerHTML = '<p style="padding:32px;color:#c0392b">' + e.message + '</p>';
  }
}

// ── Convertisseur Markdown → HTML (basique) ───────────────────────────────────
function _mdToHtml(md) {
  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const lines = md.split('\n');
  const out = [];
  let inUl = false, inCode = false, codeBuf = [];
  for (let i = 0; i < lines.length; i++) {
    let l = lines[i];
    if (l.startsWith('```')) {
      if (!inCode) { inCode = true; codeBuf = []; continue; }
      else { inCode = false; out.push('<pre class="devlog-pre"><code>' + esc(codeBuf.join('\n')) + '</code></pre>'); continue; }
    }
    if (inCode) { codeBuf.push(l); continue; }
    if (inUl && !l.startsWith('- ')) { out.push('</ul>'); inUl = false; }
    if (l.startsWith('## '))      { out.push('<h2 class="devlog-h2">' + esc(l.slice(3)) + '</h2>'); }
    else if (l.startsWith('### ')){ out.push('<h3 class="devlog-h3">' + esc(l.slice(4)) + '</h3>'); }
    else if (l.startsWith('# '))  { out.push('<h1 class="devlog-h1">' + esc(l.slice(2)) + '</h1>'); }
    else if (l.startsWith('---')) { out.push('<hr class="devlog-hr">'); }
    else if (l.startsWith('- '))  {
      if (!inUl) { out.push('<ul class="devlog-ul">'); inUl = true; }
      out.push('<li>' + _mdInline(l.slice(2)) + '</li>');
    }
    else if (l.trim() === '')     { out.push('<br>'); }
    else                          { out.push('<p class="devlog-p">' + _mdInline(l) + '</p>'); }
  }
  if (inUl) out.push('</ul>');
  return out.join('\n');
}

function _mdInline(s) {
  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="devlog-code">$1</code>');
}

synthLoadFromLS();


// ══════════════════════════════════════════════════════════════════════════════
// ── TABLEAUX DE RENDEMENT ─────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

const REND_LS_PREFIX   = 'rend_tbl_';
const REND_LS_ORDER_KEY = 'rend_tbl_ORDER';

const rendState = {
  tables: [],
  activeId: null,
  templateData: null,   // données brutes des fichiers template (jamais modifié)
  templateIds: new Set(), // IDs provenant du template (non supprimables)
};

// ── Utilitaires ──────────────────────────────────────────────────────────────
function _rendNewId() { return 'rdt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function _rendEsc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── Persistance locale (une clé par tableau) ────────────────────────────────
function rendSaveToLocalStorage() {
  try {
    for (const tbl of rendState.tables) {
      localStorage.setItem(REND_LS_PREFIX + tbl.id, JSON.stringify(tbl));
    }
    localStorage.setItem(REND_LS_ORDER_KEY, JSON.stringify({
      activeId: rendState.activeId,
      userIds:  rendState.tables.filter(t => !rendState.templateIds.has(t.id)).map(t => t.id),
    }));
  } catch (_) { /* quota exceeded — silencieux */ }
}

// ── Export rendements.json ───────────────────────────────────────────────────
function rendExportJson() {
  const payload = {
    version: 1,
    savedAt: new Date().toISOString(),
    tables: rendState.tables,
    activeId: rendState.activeId,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'rendements.json';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  setStatus('Tableaux de rendement exportés → rendements.json');
}

// ── Import rendements.json ───────────────────────────────────────────────────
function rendImportJson(file) {
  const reader = new FileReader();
  reader.onload = e => {
    let data;
    try { data = JSON.parse(e.target.result); } catch { setStatus('Fichier invalide (JSON malformé).', true); return; }
    if (!data.tables || !Array.isArray(data.tables)) { setStatus('Structure invalide : clé "tables" absente.', true); return; }
    rendState.tables  = data.tables;
    rendState.activeId = data.activeId || (data.tables[0]?.id ?? null);
    rendSaveToLocalStorage();
    renderRendementTab();
    setStatus(`Rendements importés (${data.tables.length} tableau(x)).`);
  };
  reader.readAsText(file);
}

// ── Initialisation (async — 1 fetch par fichier template) ───────────────────
async function initRendements() {
  // 1. Charger le manifest (liste de fichiers template)
  let templateFiles = [];
  try {
    const resp = await fetch('./rendements_template.json');
    if (resp.ok) templateFiles = await resp.json();
  } catch (_) {}

  // 2. Charger chaque fichier template indépendamment
  const templateTables = [];
  for (const fname of (Array.isArray(templateFiles) ? templateFiles : [])) {
    try {
      const resp = await fetch('./' + fname);
      if (resp.ok) {
        const tbl = await resp.json();
        if (tbl?.id) templateTables.push(tbl);
      }
    } catch (_) {}
  }
  rendState.templateData = { tables: templateTables };
  rendState.templateIds  = new Set(templateTables.map(t => t.id));

  // 3. Lire l'ordre + les tableaux utilisateur depuis localStorage
  let orderData = null;
  try { orderData = JSON.parse(localStorage.getItem(REND_LS_ORDER_KEY) || 'null'); } catch (_) {}

  // 4. Construire la liste : tableaux template en premier (avec override localStorage si dispo)
  const tables = [];
  for (const tpl of templateTables) {
    const savedStr = localStorage.getItem(REND_LS_PREFIX + tpl.id);
    if (savedStr) {
      try { tables.push(JSON.parse(savedStr)); continue; } catch (_) {}
    }
    tables.push(JSON.parse(JSON.stringify(tpl)));
  }

  // 5. Ajouter les tableaux créés par l'utilisateur (présents dans ORDER mais pas dans le template)
  if (orderData?.userIds) {
    for (const id of orderData.userIds) {
      if (!rendState.templateIds.has(id)) {
        const savedStr = localStorage.getItem(REND_LS_PREFIX + id);
        if (savedStr) {
          try { tables.push(JSON.parse(savedStr)); } catch (_) {}
        }
      }
    }
  }

  rendState.tables  = tables;
  rendState.activeId = orderData?.activeId || (tables[0]?.id ?? null);
  if (rendState.activeId && !tables.find(t => t.id === rendState.activeId)) {
    rendState.activeId = tables[0]?.id ?? null;
  }
  renderRendementTab();
}

// ── Construction du HTML de la table ────────────────────────────────────────
function _buildRendTableHtml(table) {
  const cols = table.colonnes || [];

  // En-tête ligne 1 : groupes
  let thead = `<thead><tr><th rowspan="2" class="rdt-th-diam">Diamètre<br/>(mm)</th>`;
  for (const g of (table.groupes || [])) {
    const span = cols.filter(c => c.groupe === g.id).length;
    thead += `<th colspan="${span}" class="rdt-th-groupe">${_rendEsc(g.label)}</th>`;
  }
  thead += `<th rowspan="2" class="rdt-th-actions"></th></tr><tr>`;
  for (const col of cols) {
    thead += `<th class="rdt-th-col">${_rendEsc(col.label)}</th>`;
  }
  thead += `</tr></thead>`;

  // Corps
  let tbody = `<tbody>`;
  for (let ri = 0; ri < (table.lignes || []).length; ri++) {
    const row = table.lignes[ri];
    tbody += `<tr>
      <td class="rdt-td-diam"><input class="rdt-cell rdt-cell-diam" data-row="${ri}" data-col="diametre" type="number" min="1" step="1" value="${row.diametre ?? ''}" /></td>`;
    for (const col of cols) {
      const v = row[col.id] ?? '';
      tbody += `<td><input class="rdt-cell" data-row="${ri}" data-col="${_rendEsc(col.id)}" type="number" step="any" value="${v}" /></td>`;
    }
    tbody += `<td><button class="rdt-del-row btn btn-danger btn-sm" data-row="${ri}" title="Supprimer cette ligne">✕</button></td></tr>`;
  }
  tbody += `</tbody>`;
  return `<table class="rdt-table">${thead}${tbody}</table>`;
}

// ── Rendu principal de l'onglet ──────────────────────────────────────────────
function renderRendementTab() {
  const container = document.getElementById('main-tab-rendement');
  if (!container) return;

  const table = rendState.tables.find(t => t.id === rendState.activeId) || rendState.tables[0] || null;

  const selectOpts = rendState.tables.map(t =>
    `<option value="${_rendEsc(t.id)}" ${t.id === (table?.id) ? 'selected' : ''}>${_rendEsc(t.nom)}</option>`
  ).join('');

  container.innerHTML = `
    <div class="rdt-root panel">

      <div class="rdt-toolbar">
        <label class="rdt-select-label">Tableau actif :</label>
        <select id="rdt-select" class="rdt-select">${selectOpts || '<option value="">— aucun —</option>'}</select>
        <button id="rdt-btn-new"    class="btn"           title="Créer un nouveau tableau">+ Nouveau</button>
        <button id="rdt-btn-dup"    class="btn"           title="Dupliquer le tableau courant">Dupliquer</button>
        <button id="rdt-btn-rename" class="btn"           title="Renommer le tableau">Renommer</button>
        <button id="rdt-btn-del"    class="btn btn-danger" title="Supprimer le tableau courant">Supprimer</button>
        <span class="rdt-spacer"></span>
        <button id="rdt-btn-reset"  class="btn"           title="Réinitialiser aux valeurs du fichier template">&#8635; Réinitialiser</button>
        <button id="rdt-btn-export" class="btn btn-primary" title="Télécharger rendements.json">&#128190; Exporter</button>
        <label  id="rdt-btn-import-label" class="btn" style="cursor:pointer" title="Charger un fichier rendements.json">
          &#128194; Importer
          <input type="file" id="rdt-import-input" accept=".json" hidden />
        </label>
      </div>

      <div class="rdt-table-wrap">
        ${table ? _buildRendTableHtml(table) : '<p class="rdt-empty">Aucun tableau. Cliquez sur &laquo;&nbsp;+&nbsp;Nouveau&nbsp;&raquo; pour en créer un.</p>'}
      </div>

      ${table ? '<div class="rdt-addrow-bar"><button id="rdt-btn-addrow" class="btn">+ Ajouter une ligne (diamètre)</button></div>' : ''}

    </div>
  `;

  _bindRendEvents();
}

// ── Liaison des événements ────────────────────────────────────────────────────
function _bindRendEvents() {
  // Sélection du tableau actif
  document.getElementById('rdt-select')?.addEventListener('change', e => {
    rendState.activeId = e.target.value;
    rendSaveToLocalStorage();
    renderRendementTab();
  });

  // Nouveau tableau
  document.getElementById('rdt-btn-new')?.addEventListener('click', () => {
    const nom = prompt('Nom du nouveau tableau :', 'Nouveau tableau');
    if (!nom || !nom.trim()) return;
    const tpl = rendState.templateData?.tables?.[0];
    const newTable = {
      id:       _rendNewId(),
      nom:      nom.trim(),
      groupes:  tpl ? JSON.parse(JSON.stringify(tpl.groupes))  : [],
      colonnes: tpl ? JSON.parse(JSON.stringify(tpl.colonnes)) : [],
      lignes:   [],
    };
    rendState.tables.push(newTable);
    rendState.activeId = newTable.id;
    rendSaveToLocalStorage();
    renderRendementTab();
  });

  // Dupliquer
  document.getElementById('rdt-btn-dup')?.addEventListener('click', () => {
    const t = rendState.tables.find(x => x.id === rendState.activeId);
    if (!t) return;
    const copy = JSON.parse(JSON.stringify(t));
    copy.id  = _rendNewId();
    copy.nom = copy.nom + ' (copie)';
    rendState.tables.push(copy);
    rendState.activeId = copy.id;
    rendSaveToLocalStorage();
    renderRendementTab();
  });

  // Renommer
  document.getElementById('rdt-btn-rename')?.addEventListener('click', () => {
    const t = rendState.tables.find(x => x.id === rendState.activeId);
    if (!t) return;
    const nom = prompt('Nouveau nom :', t.nom);
    if (!nom || !nom.trim() || nom.trim() === t.nom) return;
    t.nom = nom.trim();
    rendSaveToLocalStorage();
    renderRendementTab();
  });

  // Supprimer le tableau (interdit pour les tableaux issus du template)
  document.getElementById('rdt-btn-del')?.addEventListener('click', () => {
    const t = rendState.tables.find(x => x.id === rendState.activeId);
    if (!t) return;
    if (rendState.templateIds.has(t.id)) {
      alert('Les tableaux issus du template ne peuvent pas être supprimés.\nUtilisez « Réinitialiser » pour restaurer les valeurs d\'origine.');
      return;
    }
    if (!confirm(`Supprimer le tableau "${t.nom}" ? Cette action est irréversible.`)) return;
    localStorage.removeItem(REND_LS_PREFIX + t.id);
    rendState.tables = rendState.tables.filter(x => x.id !== rendState.activeId);
    rendState.activeId = rendState.tables[0]?.id ?? null;
    rendSaveToLocalStorage();
    renderRendementTab();
  });

  // Réinitialiser au template (uniquement pour les tableaux issus d'un fichier template)
  document.getElementById('rdt-btn-reset')?.addEventListener('click', () => {
    const t = rendState.tables.find(x => x.id === rendState.activeId);
    if (!t) return;
    if (!rendState.templateIds.has(t.id)) {
      setStatus('Ce tableau n\'est pas issu d\'un template — réinitialisation non disponible.', true);
      return;
    }
    const tpl = rendState.templateData?.tables?.find(x => x.id === t.id);
    if (!tpl) { setStatus('Données template introuvables.', true); return; }
    if (!confirm(`Réinitialiser "${t.nom}" avec les valeurs du template ?\nToutes les modifications seront perdues.`)) return;
    localStorage.removeItem(REND_LS_PREFIX + t.id);
    const idx = rendState.tables.indexOf(t);
    rendState.tables[idx] = JSON.parse(JSON.stringify(tpl));
    rendSaveToLocalStorage();
    renderRendementTab();
    setStatus(`Tableau "${t.nom}" réinitialisé.`);
  });

  // Export
  document.getElementById('rdt-btn-export')?.addEventListener('click', rendExportJson);

  // Import
  document.getElementById('rdt-import-input')?.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) { rendImportJson(file); e.target.value = ''; }
  });

  // Ajouter une ligne
  document.getElementById('rdt-btn-addrow')?.addEventListener('click', () => {
    const t = rendState.tables.find(x => x.id === rendState.activeId);
    if (!t) return;
    const lastDiam = t.lignes.at?.(-1)?.diametre ?? 250;
    const newRow = { diametre: lastDiam + 25 };
    for (const col of (t.colonnes || [])) newRow[col.id] = 1;
    t.lignes.push(newRow);
    rendSaveToLocalStorage();
    renderRendementTab();
    // scroll vers le bas
    setTimeout(() => { document.querySelector('.rdt-table-wrap')?.scrollTo({ top: 99999, behavior: 'smooth' }); }, 50);
  });

  // Édition des cellules (délégation sur la zone de tableau)
  const wrap = document.querySelector('.rdt-table-wrap');
  wrap?.addEventListener('change', e => {
    const cell = e.target.closest('.rdt-cell');
    if (!cell) return;
    const t = rendState.tables.find(x => x.id === rendState.activeId);
    if (!t) return;
    const ri  = parseInt(cell.dataset.row, 10);
    const col = cell.dataset.col;
    const raw = cell.value;
    const val = col === 'diametre' ? parseInt(raw, 10) : parseFloat(raw);
    if (!isNaN(val) && ri >= 0 && ri < t.lignes.length) {
      t.lignes[ri][col] = val;
      rendSaveToLocalStorage();
    }
  });

  // Supprimer une ligne (délégation)
  wrap?.addEventListener('click', e => {
    const btn = e.target.closest('.rdt-del-row');
    if (!btn) return;
    const t = rendState.tables.find(x => x.id === rendState.activeId);
    if (!t) return;
    const ri = parseInt(btn.dataset.row, 10);
    if (ri >= 0 && ri < t.lignes.length) {
      t.lignes.splice(ri, 1);
      rendSaveToLocalStorage();
      renderRendementTab();
    }
  });
}

// ── Démarrage ─────────────────────────────────────────────────────────────────
initRendements();

