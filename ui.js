/**
 * ui.js — Satranç UI kontrolcüsü
 */

(function () {
  const game = new ChessGame();

  let selectedSquare = null;  // { row, col }
  let legalMoves = [];
  let flipped = false;
  let pendingPromotion = null; // { move, fromRow, fromCol, toRow, toCol }

  // DOM references
  const boardEl = document.getElementById('board');
  const statusText = document.getElementById('status-text');
  const movesList = document.getElementById('moves-list');
  const blackCaptured = document.getElementById('black-captured');
  const whiteCaptured = document.getElementById('white-captured');
  const moveCountEl = document.getElementById('move-count');
  const gameStateEl = document.getElementById('game-state-text');
  const rankLabels = document.getElementById('rank-labels');
  const fileLabels = document.getElementById('file-labels');
  const promotionModal = document.getElementById('promotion-modal');
  const promotionChoices = document.getElementById('promotion-choices');
  const gameoverModal = document.getElementById('gameover-modal');
  const gameoverTitle = document.getElementById('gameover-title');
  const gameoverMsg = document.getElementById('gameover-message');
  const gameoverIcon = document.getElementById('gameover-icon');

  // ===== Init board =====
  function initBoard() {
    boardEl.innerHTML = '';
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sq = document.createElement('div');
        sq.classList.add('square');
        sq.dataset.row = r;
        sq.dataset.col = c;
        const displayRow = flipped ? 7 - r : r;
        const displayCol = flipped ? 7 - c : c;
        sq.classList.add((displayRow + displayCol) % 2 === 0 ? 'light' : 'dark');
        sq.addEventListener('click', onSquareClick);
        boardEl.appendChild(sq);
      }
    }
    updateLabels();
    renderBoard();
  }

  function updateLabels() {
    rankLabels.innerHTML = '';
    fileLabels.innerHTML = '';
    for (let i = 0; i < 8; i++) {
      const rank = document.createElement('span');
      rank.textContent = flipped ? i + 1 : 8 - i;
      rankLabels.appendChild(rank);
    }
    const files = 'abcdefgh';
    for (let i = 0; i < 8; i++) {
      const file = document.createElement('span');
      file.textContent = flipped ? files[7 - i] : files[i];
      fileLabels.appendChild(file);
    }
  }

  // ===== Render =====
  function renderBoard() {
    const squares = boardEl.querySelectorAll('.square');
    const lastMove = game.lastMove();

    squares.forEach(sq => {
      const r = parseInt(sq.dataset.row);
      const c = parseInt(sq.dataset.col);

      // Translate visual -> logical
      const logRow = flipped ? 7 - r : r;
      const logCol = flipped ? 7 - c : c;

      // Base color
      sq.className = 'square ' + ((r + c) % 2 === 0 ? 'light' : 'dark');

      // Last move highlight
      if (lastMove) {
        if ((lastMove.from.row === logRow && lastMove.from.col === logCol) ||
            (lastMove.to.row === logRow && lastMove.to.col === logCol)) {
          sq.classList.add('last-move');
        }
      }

      // Selected
      if (selectedSquare && selectedSquare.row === logRow && selectedSquare.col === logCol) {
        sq.classList.add('selected');
      }

      // Legal move dots
      const lm = legalMoves.find(m => m.to.row === logRow && m.to.col === logCol);
      if (lm) {
        const target = game.pieceAt(logRow, logCol);
        sq.classList.add(target || lm.enPassant ? 'legal-capture' : 'legal-move');
      }

      // King in check
      if ((game.status === 'check' || game.status === 'checkmate')) {
        const kp = game.kingPosition(game.turn);
        if (kp && kp.row === logRow && kp.col === logCol) {
          sq.classList.add('in-check');
        }
      }

      // Piece
      sq.innerHTML = '';
      const piece = game.pieceAt(logRow, logCol);
      if (piece) {
        const span = document.createElement('span');
        span.classList.add('piece');
        span.textContent = PIECES[piece];
        sq.appendChild(span);
      }
    });

    updateSidePanels();
  }

  function updateSidePanels() {
    // Status
    const stateMap = {
      playing: 'Devam ediyor',
      check: 'Şah!',
      checkmate: 'Mat!',
      stalemate: 'Pat (Beraberlik)',
      draw: 'Beraberlik'
    };

    const turnName = game.turn === 'w' ? 'Beyaz' : 'Siyah';
    if (game.status === 'playing') statusText.textContent = `${turnName}ın sırası`;
    else if (game.status === 'check') statusText.textContent = `${turnName} şahta!`;
    else if (game.status === 'checkmate') statusText.textContent = `Mat! ${game.turn === 'w' ? 'Siyah' : 'Beyaz'} kazandı`;
    else if (game.status === 'stalemate') statusText.textContent = 'Pat — Beraberlik';
    else if (game.status === 'draw') statusText.textContent = 'Beraberlik';

    gameStateEl.textContent = stateMap[game.status] || '';

    // Active player highlight
    document.getElementById('white-card').classList.toggle('active', game.turn === 'w');
    document.getElementById('black-card').classList.toggle('active', game.turn === 'b');

    // Move count
    moveCountEl.textContent = game.history.length;

    // Captured pieces
    whiteCaptured.textContent = game.capturedByWhite.map(p => PIECES[p]).join(' ');
    blackCaptured.textContent = game.capturedByBlack.map(p => PIECES[p]).join(' ');

    // Move log
    renderMoveLog();
  }

  function renderMoveLog() {
    movesList.innerHTML = '';
    game.moveLog.forEach((entry, i) => {
      const row = document.createElement('div');
      row.classList.add('move-row');
      if (i === game.moveLog.length - 1) row.classList.add('latest');
      row.innerHTML = `
        <span class="move-num">${i + 1}.</span>
        <span class="move-white">${entry.white || ''}</span>
        <span class="move-black">${entry.black || ''}</span>
      `;
      movesList.appendChild(row);
    });
    movesList.scrollTop = movesList.scrollHeight;
  }

  // ===== Click handler =====
  function onSquareClick(e) {
    if (game.status === 'checkmate' || game.status === 'stalemate' || game.status === 'draw') return;
    if (pendingPromotion) return;

    const sq = e.currentTarget;
    const r = parseInt(sq.dataset.row);
    const c = parseInt(sq.dataset.col);
    const logRow = flipped ? 7 - r : r;
    const logCol = flipped ? 7 - c : c;

    if (selectedSquare) {
      // Try to make a move
      const moveTarget = legalMoves.find(m => m.to.row === logRow && m.to.col === logCol);
      if (moveTarget) {
        const result = game.makeMove(selectedSquare.row, selectedSquare.col, logRow, logCol);
        if (result.needsPromotion) {
          pendingPromotion = { fromRow: selectedSquare.row, fromCol: selectedSquare.col, toRow: logRow, toCol: logCol };
          showPromotionModal(game.turn === 'b' ? 'b' : 'w'); // turn not switched yet when promotion needed
          selectedSquare = null;
          legalMoves = [];
          return;
        }
        selectedSquare = null;
        legalMoves = [];
        renderBoard();
        checkGameOver();
        return;
      }

      // Clicked on own piece — re-select
      const piece = game.pieceAt(logRow, logCol);
      if (piece && game.colorOf(piece) === game.turn) {
        selectedSquare = { row: logRow, col: logCol };
        legalMoves = game.legalMovesFrom(logRow, logCol);
        renderBoard();
        return;
      }

      // Deselect
      selectedSquare = null;
      legalMoves = [];
      renderBoard();
    } else {
      // Select
      const piece = game.pieceAt(logRow, logCol);
      if (piece && game.colorOf(piece) === game.turn) {
        selectedSquare = { row: logRow, col: logCol };
        legalMoves = game.legalMovesFrom(logRow, logCol);
        renderBoard();
      }
    }
  }

  // ===== Promotion modal =====
  function showPromotionModal(color) {
    promotionChoices.innerHTML = '';
    const types = ['Q', 'R', 'B', 'N'];
    types.forEach(t => {
      const btn = document.createElement('button');
      btn.classList.add('promo-btn');
      btn.textContent = PIECES[color + t];
      btn.addEventListener('click', () => {
        finishPromotion(t);
      });
      promotionChoices.appendChild(btn);
    });
    promotionModal.classList.remove('hidden');
  }

  function finishPromotion(type) {
    promotionModal.classList.add('hidden');
    if (!pendingPromotion) return;
    const { fromRow, fromCol, toRow, toCol } = pendingPromotion;
    pendingPromotion = null;
    game.makeMove(fromRow, fromCol, toRow, toCol, type);
    selectedSquare = null;
    legalMoves = [];
    renderBoard();
    checkGameOver();
  }

  // ===== Game over =====
  function checkGameOver() {
    if (game.status === 'checkmate') {
      const winner = game.winner === 'w' ? 'Beyaz' : 'Siyah';
      gameoverIcon.textContent = game.winner === 'w' ? '♔' : '♚';
      gameoverTitle.textContent = `${winner} Kazandı!`;
      gameoverMsg.textContent = 'Mat! Tebrikler.';
      setTimeout(() => gameoverModal.classList.remove('hidden'), 600);
    } else if (game.status === 'stalemate') {
      gameoverIcon.textContent = '🤝';
      gameoverTitle.textContent = 'Beraberlik';
      gameoverMsg.textContent = 'Pat — hareket eden taraf yok.';
      setTimeout(() => gameoverModal.classList.remove('hidden'), 600);
    } else if (game.status === 'draw') {
      gameoverIcon.textContent = '🤝';
      gameoverTitle.textContent = 'Beraberlik';
      gameoverMsg.textContent = '50 hamle kuralı veya yetersiz malzeme.';
      setTimeout(() => gameoverModal.classList.remove('hidden'), 600);
    }
  }

  // ===== Buttons =====
  document.getElementById('new-game-btn').addEventListener('click', () => {
    game.reset();
    selectedSquare = null;
    legalMoves = [];
    pendingPromotion = null;
    gameoverModal.classList.add('hidden');
    promotionModal.classList.add('hidden');
    renderBoard();
  });

  document.getElementById('gameover-new-btn').addEventListener('click', () => {
    gameoverModal.classList.add('hidden');
    document.getElementById('new-game-btn').click();
  });

  document.getElementById('undo-btn').addEventListener('click', () => {
    if (pendingPromotion) return;
    game.undoMove();
    selectedSquare = null;
    legalMoves = [];
    renderBoard();
  });

  document.getElementById('flip-btn').addEventListener('click', () => {
    flipped = !flipped;
    selectedSquare = null;
    legalMoves = [];
    initBoard();
  });

  // ===== Start =====
  initBoard();
})();
