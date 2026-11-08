const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function gridForPieceCount(count) {
  const safeCount = Math.max(1, Number(count) || 16);
  const factors = [];
  for (let rows = 1; rows <= Math.sqrt(safeCount); rows += 1) {
    if (safeCount % rows === 0) factors.push([rows, safeCount / rows]);
  }
  const [rows, cols] = factors.at(-1) || [Math.round(Math.sqrt(safeCount)), Math.round(Math.sqrt(safeCount))];
  return { rows: Math.min(rows, cols), cols: Math.max(rows, cols) };
}

export function createDeterministicRandom(seed) {
  let value = 0;
  for (let index = 0; index < seed.length; index += 1) value = (value * 31 + seed.charCodeAt(index)) >>> 0;
  return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; };
}

export function imageOffset(piece, board) {
  return {
    x: piece.x - board.x - piece.col * board.cellWidth,
    y: piece.y - board.y - piece.row * board.cellHeight,
  };
}

function seededRandom(seed) { return createDeterministicRandom(seed); }

function opposite(value) { return value * -1; }

export class JigsawEngine {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.image = new Image();
    this.image.crossOrigin = 'anonymous';
    this.fallbackImage = options.fallbackImage || '';
    this.usedFallbackImage = false;
    this.puzzleId = options.puzzleId || 'puzzle';
    const grid = options.rows && options.cols ? options : gridForPieceCount(options.pieceCount || 16);
    this.rows = grid.rows || 4;
    this.cols = grid.cols || 4;
    this.rotationEnabled = Boolean(options.rotationEnabled);
    this.initialRotation = Boolean(options.initialRotation);
    this.edgeOnly = false;
    this.pieces = [];
    this.groups = new Map();
    this.active = null;
    this.moves = 0;
    this.board = { width: 1, height: 1, x: 0, y: 0, cellWidth: 1, cellHeight: 1 };
    this.view = { width: 1, height: 1 };
    this.onChange = options.onChange || (() => {});
    this.onComplete = options.onComplete || (() => {});
    this.onReady = options.onReady || (() => {});
    this.onError = options.onError || (() => {});
    this.onPick = options.onPick || (() => {});
    this.onDrop = options.onDrop || (() => {});
    this.onRotate = options.onRotate || (() => {});
    this.destroyed = false;
    this.selectedPiece = null;
    this.zCounter = 0;
    this.renderFrame = null;
    this.resizeFrame = null;
    this.imageRetried = false;
    this.hintFrame = null;
    this.hintPieceId = null;
    this.showGuide = options.showGuide !== false;
    this.debugOverlay = Boolean(options.debugOverlay);
    this.boardScale = clamp(Number(options.boardScale) || 0.58, 0.4, 0.8);
    this.ghostOpacity = Number(options.ghostOpacity) || 0;
    this.snapSparks = [];
    this.listeners = new AbortController();
    this.resizeObserver = typeof ResizeObserver !== 'undefined' && this.canvas.parentElement
      ? new ResizeObserver(() => this.scheduleResize())
      : null;
    this.image.addEventListener('load', () => { if (this.destroyed) return; this.resize(); this.generate(); this.render(); this.onReady(); });
    this.image.addEventListener('error', () => {
      if (this.destroyed) return;
      if (this.primaryImage && !this.imageRetried && !this.primaryImage.startsWith('data:')) {
        this.imageRetried = true;
        this.image.src = `${this.primaryImage}${this.primaryImage.includes('?') ? '&' : '?'}lumapiece-retry=1`;
        return;
      }
      if (this.fallbackImage && !this.usedFallbackImage) {
        this.usedFallbackImage = true;
        this.image.src = this.fallbackImage;
        return;
      }
      this.onError();
    });
    this.resizeObserver?.observe(this.canvas.parentElement);
    this.bindPointerEvents();
    this.primaryImage = options.image || '';
    if (this.primaryImage) this.image.src = this.primaryImage;
  }

  setImage(source) { this.primaryImage = source; this.imageRetried = false; this.usedFallbackImage = false; this.image.src = source; }

  requestRender() {
    if (this.destroyed || this.renderFrame) return;
    this.renderFrame = requestAnimationFrame(() => { this.renderFrame = null; if (!this.destroyed) this.render(); });
  }

  scheduleResize() {
    if (this.destroyed || this.resizeFrame || !this.image.complete) return;
    this.resizeFrame = requestAnimationFrame(() => { this.resizeFrame = null; if (this.destroyed) return; this.resize(); this.render(); });
  }

  destroy() {
    this.destroyed = true;
    this.active = null;
    this.selectedPiece = null;
    this.listeners.abort();
    this.resizeObserver?.disconnect();
    if (this.renderFrame) cancelAnimationFrame(this.renderFrame);
    if (this.resizeFrame) cancelAnimationFrame(this.resizeFrame);
    if (this.hintFrame) cancelAnimationFrame(this.hintFrame);
    this.renderFrame = null;
    this.resizeFrame = null;
    this.hintFrame = null;
    this.hintPieceId = null;
    this.pieces = [];
    this.groups.clear();
  }

  setPieceCount(count) {
    const grid = gridForPieceCount(count);
    this.rows = grid.rows; this.cols = grid.cols; this.resize(); this.generate(); this.render();
  }

  resize() {
    const previousBoard = this.board;
    const bounds = this.canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const maxWidth = Math.max(320, bounds.width);
    const maxHeight = Math.max(320, Math.min(window.innerHeight * 0.72, maxWidth * 0.72));
    const aspect = this.image.naturalWidth && this.image.naturalHeight ? this.image.naturalWidth / this.image.naturalHeight : 1.35;
    let width = maxWidth; let height = width / aspect;
    if (height > maxHeight) { height = maxHeight; width = height * aspect; }
    this.canvas.style.width = `${width}px`; this.canvas.style.height = `${height}px`;
    this.canvas.width = Math.round(width * dpr); this.canvas.height = Math.round(height * dpr);
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
    const boardScale = this.boardScale || 0.58;
    const boardWidth = width * boardScale;
    const boardHeight = height * boardScale;
    this.view = { width, height };
    this.board = { width: boardWidth, height: boardHeight, x: (width - boardWidth) / 2, y: (height - boardHeight) / 2, cellWidth: boardWidth / this.cols, cellHeight: boardHeight / this.rows };
    if (this.pieces.length && previousBoard.width > 1 && previousBoard.height > 1) {
      const scaleX = boardWidth / previousBoard.width;
      const scaleY = boardHeight / previousBoard.height;
      this.pieces.forEach((piece) => {
        piece.x = this.board.x + (piece.x - previousBoard.x) * scaleX;
        piece.y = this.board.y + (piece.y - previousBoard.y) * scaleY;
      });
    }
  }

  generate() {
    const random = seededRandom(`${this.puzzleId}:${this.rows}:${this.cols}`);
    const vertical = Array.from({ length: this.rows }, () => Array.from({ length: this.cols - 1 }, () => random() > 0.5 ? 1 : -1));
    const horizontal = Array.from({ length: this.rows - 1 }, () => Array.from({ length: this.cols }, () => random() > 0.5 ? 1 : -1));
    this.pieces = [];
    this.groups = new Map();
    this.moves = 0;
    for (let row = 0; row < this.rows; row += 1) for (let col = 0; col < this.cols; col += 1) {
      const id = row * this.cols + col;
       const piece = { id, row, col, x: this.board.x + col * this.board.cellWidth, y: this.board.y + row * this.board.cellHeight, rotation: this.initialRotation ? Math.floor(random() * 4) * 90 : 0, locked: false, groupId: id, edges: { top: row === 0 ? 0 : opposite(horizontal[row - 1][col]), right: col === this.cols - 1 ? 0 : vertical[row][col], bottom: row === this.rows - 1 ? 0 : horizontal[row][col], left: col === 0 ? 0 : opposite(vertical[row][col - 1]) } };
      this.pieces.push(piece); this.groups.set(id, new Set([id]));
    }
    this.scatterToBorders(random);
    this.onChange(this.serialize());
  }

  scatterToBorders(random) {
    const { width, height } = this.view;
    const cell = Math.min(this.board.cellWidth, this.board.cellHeight);
    const anchors = this.pieces.filter((piece) => piece.groupId === piece.id);
    const order = [...anchors];
    for (let index = order.length - 1; index > 0; index -= 1) {
      const target = Math.floor(random() * (index + 1));
      [order[index], order[target]] = [order[target], order[index]];
    }
    const sides = [[], [], [], []];
    order.forEach((piece, index) => sides[index % 4].push(piece));
    const place = (units, axis, fixedCenter, inward) => {
      if (!units.length) return;
      const span = axis === 'x' ? width : height;
      const start = axis === 'x' ? cell * 0.55 : cell * 1.7;
      const end = span - start;
      const rows = units.length > 14 ? 2 : 1;
      const perRow = Math.ceil(units.length / rows);
      const step = perRow > 1 ? (end - start) / (perRow - 1) : 0;
      units.forEach((anchor, index) => {
        const row = rows > 1 ? Math.floor(index / perRow) : 0;
        const column = index % perRow;
        const along = perRow > 1 ? start + step * column : (start + end) / 2;
        const depth = fixedCenter + inward * row * cell * 0.98;
        const targetX = (axis === 'x' ? along : depth) - this.board.cellWidth / 2;
        const targetY = (axis === 'x' ? depth : along) - this.board.cellHeight / 2;
        this.moveGroup(anchor.groupId, targetX + (random() - 0.5) * cell * 0.3 - anchor.x, targetY + (random() - 0.5) * cell * 0.3 - anchor.y);
      });
    };
    place(sides[0], 'x', cell * 0.62, 1);
    place(sides[1], 'x', height - cell * 0.62, -1);
    place(sides[2], 'y', cell * 0.62, 1);
    place(sides[3], 'y', width - cell * 0.62, -1);
  }

  restore(state) {
    if (!state?.pieces?.length) return false;
    const rows = Number(state.rows);
    const cols = Number(state.cols);
    if (!Number.isInteger(rows) || rows < 1 || !Number.isInteger(cols) || cols < 1 || rows * cols !== state.pieces.length) return false;
    const ids = new Set();
    if (state.pieces.some((piece) => {
      const id = Number(piece.id);
      const row = Number(piece.row);
      const col = Number(piece.col);
      if (!Number.isInteger(id) || id < 0 || id >= state.pieces.length || ids.has(id)) return true;
      ids.add(id);
      return !Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row >= rows || col < 0 || col >= cols;
    })) return false;
    this.rows = rows;
    this.cols = cols;
    this.resize();
    const sourceWidth = Number(state.boardWidth) || this.board.width;
    const sourceHeight = Number(state.boardHeight) || this.board.height;
    this.pieces = state.pieces.map((piece) => ({
      ...piece,
      x: Number.isFinite(piece.normalizedX) ? this.board.x + piece.normalizedX * this.board.width : piece.x * (this.board.width / sourceWidth),
      y: Number.isFinite(piece.normalizedY) ? this.board.y + piece.normalizedY * this.board.height : piece.y * (this.board.height / sourceHeight),
      edges: { ...piece.edges },
      locked: Boolean(piece.locked),
    }));
    this.moves = state.moves || 0;
    this.groups = new Map(); this.pieces.forEach((piece) => { if (!this.groups.has(piece.groupId)) this.groups.set(piece.groupId, new Set()); this.groups.get(piece.groupId).add(piece.id); });
    this.render(); return true;
  }

  serialize() { return { rows: this.rows, cols: this.cols, moves: this.moves, boardWidth: this.board.width, boardHeight: this.board.height, pieces: this.pieces.map(({ id, row, col, x, y, rotation, groupId, edges, locked }) => ({ id, row, col, x, y, normalizedX: (x - this.board.x) / this.board.width, normalizedY: (y - this.board.y) / this.board.height, rotation, groupId, edges, locked: Boolean(locked) })) }; }

  progress() {
    if (!this.pieces.length) return 0;
    const largestGroup = Math.max(...this.pieces.map((piece) => this.groups.get(piece.groupId)?.size || 1));
    const placedCount = this.pieces.filter((piece) => piece.locked).length;
    return Math.max(largestGroup > 1 ? largestGroup : 0, placedCount);
  }

  pieceSize() { return { width: this.board.cellWidth, height: this.board.cellHeight, tab: Math.min(this.board.cellWidth, this.board.cellHeight) * 0.2 }; }

  pathFor(piece) {
    const { width, height, tab } = this.pieceSize(); const path = new Path2D(); const x = piece.x; const y = piece.y;
    path.moveTo(x, y); this.edge(path, x, y, x + width, y, piece.edges.top, 'horizontal', tab); this.edge(path, x + width, y, x + width, y + height, piece.edges.right, 'vertical', tab); this.edge(path, x + width, y + height, x, y + height, piece.edges.bottom, 'horizontal', tab); this.edge(path, x, y + height, x, y, piece.edges.left, 'vertical', tab); path.closePath(); return path;
  }

  edge(path, x1, y1, x2, y2, type, orientation, tab) {
    const dx = x2 - x1; const dy = y2 - y1; const length = Math.sqrt(dx * dx + dy * dy); const ux = dx / length; const uy = dy / length; const nx = -uy; const ny = ux; const direction = type || 0;
    if (!direction) { path.lineTo(x2, y2); return; }
    const p = (distance, normal) => [x1 + ux * distance + nx * normal * direction, y1 + uy * distance + ny * normal * direction];
    const neck = tab * -0.14;
    path.lineTo(...p(length * 0.32, 0));
    path.bezierCurveTo(...p(length * 0.42, neck), ...p(length * 0.36, tab * 0.6), ...p(length * 0.43, tab * 0.92));
    path.bezierCurveTo(...p(length * 0.465, tab * 1.12), ...p(length * 0.535, tab * 1.12), ...p(length * 0.57, tab * 0.92));
    path.bezierCurveTo(...p(length * 0.64, tab * 0.6), ...p(length * 0.58, neck), ...p(length * 0.68, 0));
    path.lineTo(x2, y2);
  }

  render() {
    const ctx = this.context; const board = this.board;
    ctx.clearRect(0, 0, this.view.width, this.view.height);
    ctx.fillStyle = '#d7e2df'; ctx.fillRect(0, 0, this.view.width, this.view.height);
    if (this.showGuide) {
      ctx.strokeStyle = 'rgba(31,61,69,.3)'; ctx.lineWidth = 1.5; ctx.setLineDash([7, 7]);
      ctx.strokeRect(board.x, board.y, board.width, board.height);
      ctx.setLineDash([]);
    }
    if (this.ghostOpacity > 0 && this.image.complete && this.image.naturalWidth) {
      ctx.save();
      ctx.globalAlpha = this.ghostOpacity;
      ctx.drawImage(this.image, board.x, board.y, board.width, board.height);
      ctx.restore();
    }
    const visible = this.pieces.filter((piece) => !this.edgeOnly || piece.row === 0 || piece.col === 0 || piece.row === this.rows - 1 || piece.col === this.cols - 1);
    visible.sort((a, b) => (a.z || 0) - (b.z || 0) || a.id - b.id).forEach((piece) => {
      const centerX = piece.x + board.cellWidth / 2;
      const centerY = piece.y + board.cellHeight / 2;
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate((piece.rotation * Math.PI) / 180);
      ctx.translate(-centerX, -centerY);
      const path = this.pathFor(piece);
      if (!piece.locked) {
        ctx.shadowColor = 'rgba(40,65,70,.22)'; ctx.shadowBlur = 7; ctx.shadowOffsetY = 4; ctx.fillStyle = '#fff'; ctx.fill(path); ctx.shadowColor = 'transparent';
      }
      ctx.clip(path); const offset = imageOffset(piece, board); ctx.drawImage(this.image, offset.x, offset.y, board.width, board.height);
      if (!piece.locked) { ctx.strokeStyle = 'rgba(31,61,69,.55)'; ctx.lineWidth = 1.3; ctx.stroke(path); }
      else { ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 1; ctx.stroke(path); }
      ctx.restore();
    });
    if (this.debugOverlay) {
      ctx.fillStyle = 'rgba(20,40,45,.78)'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
      this.pieces.forEach((piece) => ctx.fillText(String(piece.id), piece.x + board.cellWidth / 2, piece.y + board.cellHeight / 2 + 3));
    }
    if (this.snapSparks.length > 0) {
      ctx.save();
      for (let i = this.snapSparks.length - 1; i >= 0; i -= 1) {
        const spark = this.snapSparks[i];
        spark.x += spark.vx;
        spark.y += spark.vy;
        spark.alpha -= 0.05;
        if (spark.alpha <= 0) {
          this.snapSparks.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = Math.max(0, spark.alpha);
        ctx.fillStyle = spark.color;
        ctx.beginPath();
        ctx.arc(spark.x, spark.y, spark.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      if (this.snapSparks.length > 0) this.requestRender();
    }
  }

  showHint() {
    if (this.destroyed || !this.pieces.length) return;
    const piece = (this.selectedPiece && !this.selectedPiece.locked ? this.selectedPiece : null)
      || this.pieces.find((candidate) => !candidate.locked)
      || this.pieces[0];
    this.hintPieceId = piece.id;
    if (this.hintFrame) cancelAnimationFrame(this.hintFrame);
    const started = performance.now();
    const frame = (now) => {
      if (this.destroyed || this.hintPieceId !== piece.id) return;
      const elapsed = now - started;
      this.render();
      if (elapsed > 1800) { this.hintPieceId = null; this.hintFrame = null; return; }
      const ghost = { ...piece, x: this.board.x + piece.col * this.board.cellWidth, y: this.board.y + piece.row * this.board.cellHeight, rotation: 0 };
      const ctx = this.context;
      const path = this.pathFor(ghost);
      ctx.save();
      ctx.globalAlpha = 0.3 + Math.abs(Math.sin(elapsed / 180)) * 0.35;
      ctx.fillStyle = '#fff'; ctx.fill(path);
      ctx.clip(path);
      const offset = imageOffset(ghost, this.board);
      ctx.drawImage(this.image, offset.x, offset.y, this.board.width, this.board.height);
      ctx.strokeStyle = '#2d5f5a'; ctx.lineWidth = 2.5; ctx.stroke(path);
      ctx.restore();
      this.hintFrame = requestAnimationFrame(frame);
    };
    this.hintFrame = requestAnimationFrame(frame);
  }

  pieceAt(x, y) { for (let index = this.pieces.length - 1; index >= 0; index -= 1) { const piece = this.pieces[index]; if (this.edgeOnly && !(piece.row === 0 || piece.col === 0 || piece.row === this.rows - 1 || piece.col === this.cols - 1)) continue; const centerX = piece.x + this.board.cellWidth / 2; const centerY = piece.y + this.board.cellHeight / 2; const radians = (-piece.rotation * Math.PI) / 180; const localX = Math.cos(radians) * (x - centerX) - Math.sin(radians) * (y - centerY) + centerX; const localY = Math.sin(radians) * (x - centerX) + Math.cos(radians) * (y - centerY) + centerY; if (localX >= piece.x - 10 && localX <= piece.x + this.board.cellWidth + 10 && localY >= piece.y - 10 && localY <= piece.y + this.board.cellHeight + 10) return piece; } return null; }

  moveGroup(groupId, dx, dy) { const ids = this.groups.get(groupId) || new Set([groupId]); ids.forEach((id) => { const piece = this.pieces[id]; piece.x += dx; piece.y += dy; }); }

  snap(piece) {
    if (!piece || piece.rotation !== 0) return false; const tolerance = Math.min(this.board.cellWidth, this.board.cellHeight) * 0.28;
    let snapped = false;
    const homeX = this.board.x + piece.col * this.board.cellWidth;
    const homeY = this.board.y + piece.row * this.board.cellHeight;
    if (Math.abs(piece.x - homeX) < tolerance && Math.abs(piece.y - homeY) < tolerance) {
      this.moveGroup(piece.groupId, homeX - piece.x, homeY - piece.y);
      snapped = true;
    }
    const neighbors = this.pieces.filter((candidate) => candidate.groupId !== piece.groupId && Math.abs(candidate.row - piece.row) + Math.abs(candidate.col - piece.col) === 1);
    for (const candidate of neighbors) { const dx = (piece.col - candidate.col) * this.board.cellWidth; const dy = (piece.row - candidate.row) * this.board.cellHeight; const actualX = piece.x - candidate.x; const actualY = piece.y - candidate.y; if (Math.abs(actualX - dx) < tolerance && Math.abs(actualY - dy) < tolerance) { this.moveGroup(piece.groupId, candidate.x + dx - piece.x, candidate.y + dy - piece.y); this.mergeGroups(piece.groupId, candidate.groupId); snapped = true; break; } }
    if (snapped) {
      this.groups.get(piece.groupId)?.forEach((id) => { this.pieces[id].locked = true; });
      this.spawnSnapEffect(piece.x + this.board.cellWidth / 2, piece.y + this.board.cellHeight / 2);
    }
    return snapped;
  }

  spawnSnapEffect(x, y) {
    for (let i = 0; i < 12; i += 1) {
      const angle = (Math.PI * 2 * i) / 12 + (Math.random() - 0.5) * 0.4;
      const speed = 1.2 + Math.random() * 2.2;
      this.snapSparks.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, alpha: 1, color: i % 2 === 0 ? '#f0c36d' : '#e89a78', radius: 2 + Math.random() * 2.5 });
    }
    this.requestRender();
  }

  toggleGhost() { this.ghostOpacity = this.ghostOpacity > 0 ? 0 : 0.24; this.render(); return this.ghostOpacity > 0; }

  mergeGroups(first, second) { const target = this.groups.get(second) || new Set([second]); const source = this.groups.get(first) || new Set([first]); source.forEach((id) => { this.pieces[id].groupId = second; target.add(id); }); this.groups.delete(first); this.groups.set(second, target); }

  isComplete() { return this.pieces.length > 0 && this.pieces.every((piece) => piece.groupId === this.pieces[0].groupId); }

  rotateSelected(degrees = 90) { if (!this.selectedPiece || !this.rotationEnabled) return; const group = this.groups.get(this.selectedPiece.groupId) || new Set([this.selectedPiece.id]); group.forEach((id) => { this.pieces[id].rotation = (this.pieces[id].rotation + degrees + 360) % 360; }); this.moves += 1; this.render(); this.onChange(this.serialize()); this.onRotate(); }
  setEdgeOnly(enabled) { this.edgeOnly = enabled; this.render(); }
  rearrange() { const random = seededRandom(`${this.puzzleId}:rearrange:${Date.now()}`); this.scatterToBorders(random); this.render(); this.onChange(this.serialize()); }

  bindPointerEvents() {
    const signal = this.listeners.signal;
    this.canvas.addEventListener('pointerdown', (event) => { const rect = this.canvas.getBoundingClientRect(); const x = event.clientX - rect.left; const y = event.clientY - rect.top; const piece = this.pieceAt(x, y); if (!piece) return; this.selectedPiece = piece; piece.z = ++this.zCounter; this.canvas.setPointerCapture(event.pointerId); this.active = { piece, x, y }; this.onPick(piece); }, { signal });
    this.canvas.addEventListener('pointermove', (event) => { if (!this.active || this.destroyed) return; const rect = this.canvas.getBoundingClientRect(); const x = event.clientX - rect.left; const y = event.clientY - rect.top; this.moveGroup(this.active.piece.groupId, x - this.active.x, y - this.active.y); this.active.x = x; this.active.y = y; this.requestRender(); }, { signal });
    this.canvas.addEventListener('pointerup', (event) => { if (!this.active || this.destroyed) return; const snapped = this.snap(this.active.piece); this.moves += 1; this.active = null; this.canvas.releasePointerCapture(event.pointerId); this.render(); this.onChange(this.serialize()); this.onDrop(snapped); if (this.isComplete()) this.onComplete(this.serialize()); }, { signal });
    this.canvas.addEventListener('pointercancel', () => { this.active = null; }, { signal });
    this.canvas.addEventListener('wheel', (event) => { if (!this.rotationEnabled || !this.selectedPiece) return; event.preventDefault(); this.rotateSelected(event.deltaY > 0 ? 90 : -90); }, { passive: false, signal });
  }
}
