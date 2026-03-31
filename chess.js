/**
 * chess.js — Satranç motoru
 * FEN desteği, tüm hamle kuralları (rok, en passant, piyade terfi, şah/mat/pat)
 */

const PIECES = {
  wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
  bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟'
};

const PIECE_VALUES = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0 };

class ChessGame {
  constructor() {
    this.reset();
  }

  reset() {
    // 8x8 board, index [row][col], row 0 = rank 8 (black side)
    this.board = this._initialBoard();
    this.turn = 'w';
    this.castlingRights = { wK: true, wQ: true, bK: true, bQ: true };
    this.enPassantTarget = null; // {row, col} or null
    this.halfMoveClock = 0;
    this.fullMoveNumber = 1;
    this.history = []; // list of move records for undo
    this.moveLog = []; // list of { white, black } for display
    this.capturedByWhite = [];
    this.capturedByBlack = [];
    this.status = 'playing'; // 'playing' | 'check' | 'checkmate' | 'stalemate' | 'draw'
    this.winner = null;
  }

  _initialBoard() {
    const b = Array.from({ length: 8 }, () => Array(8).fill(null));
    const backRank = ['R','N','B','Q','K','B','N','R'];
    for (let c = 0; c < 8; c++) {
      b[0][c] = 'b' + backRank[c];
      b[1][c] = 'bP';
      b[6][c] = 'wP';
      b[7][c] = 'w' + backRank[c];
    }
    return b;
  }

  pieceAt(row, col) {
    return this.board[row]?.[col] ?? null;
  }

  colorOf(piece) {
    return piece ? piece[0] : null;
  }

  typeOf(piece) {
    return piece ? piece.slice(1) : null;
  }

  // Returns all pseudo-legal moves for a piece (doesn't check if leaves king in check)
  _pseudoMoves(row, col) {
    const piece = this.pieceAt(row, col);
    if (!piece) return [];
    const color = this.colorOf(piece);
    const type = this.typeOf(piece);
    const moves = [];

    const add = (r, c, flags = {}) => {
      if (r < 0 || r > 7 || c < 0 || c > 7) return false;
      const target = this.pieceAt(r, c);
      if (target && this.colorOf(target) === color) return false; // own piece
      moves.push({ from: { row, col }, to: { row: r, col: c }, ...flags });
      return !target; // can continue sliding if empty
    };

    const slide = (dr, dc) => {
      let r = row + dr, c = col + dc;
      while (r >= 0 && r <= 7 && c >= 0 && c <= 7) {
        const ok = add(r, c);
        if (!ok) break;
        r += dr; c += dc;
      }
    };

    switch (type) {
      case 'P': {
        const dir = color === 'w' ? -1 : 1;
        const startRow = color === 'w' ? 6 : 1;
        // Forward
        if (!this.pieceAt(row + dir, col)) {
          add(row + dir, col);
          if (row === startRow && !this.pieceAt(row + 2 * dir, col)) {
            add(row + 2 * dir, col, { doublePush: true });
          }
        }
        // Captures
        for (const dc of [-1, 1]) {
          const tr = row + dir, tc = col + dc;
          if (tr >= 0 && tr <= 7 && tc >= 0 && tc <= 7) {
            const target = this.pieceAt(tr, tc);
            if (target && this.colorOf(target) !== color) {
              moves.push({ from: { row, col }, to: { row: tr, col: tc } });
            }
            // En passant
            if (this.enPassantTarget && this.enPassantTarget.row === tr && this.enPassantTarget.col === tc) {
              moves.push({ from: { row, col }, to: { row: tr, col: tc }, enPassant: true });
            }
          }
        }
        break;
      }
      case 'N':
        for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
          add(row + dr, col + dc);
        }
        break;
      case 'B':
        for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) slide(dr, dc);
        break;
      case 'R':
        for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) slide(dr, dc);
        break;
      case 'Q':
        for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]) slide(dr, dc);
        break;
      case 'K':
        for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
          add(row + dr, col + dc);
        }
        // Castling
        const kingRow = color === 'w' ? 7 : 0;
        if (row === kingRow && col === 4) {
          if (this.castlingRights[color + 'K'] &&
              !this.pieceAt(kingRow, 5) && !this.pieceAt(kingRow, 6) &&
              this.pieceAt(kingRow, 7) === color + 'R') {
            moves.push({ from: { row, col }, to: { row: kingRow, col: 6 }, castling: 'K' });
          }
          if (this.castlingRights[color + 'Q'] &&
              !this.pieceAt(kingRow, 3) && !this.pieceAt(kingRow, 2) && !this.pieceAt(kingRow, 1) &&
              this.pieceAt(kingRow, 0) === color + 'R') {
            moves.push({ from: { row, col }, to: { row: kingRow, col: 2 }, castling: 'Q' });
          }
        }
        break;
    }
    return moves;
  }

  // Is the given color's king in check?
  isInCheck(color) {
    // Find king
    let kingRow = -1, kingCol = -1;
    outer: for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (this.board[r][c] === color + 'K') { kingRow = r; kingCol = c; break outer; }
      }
    }
    if (kingRow < 0) return false; // shouldn't happen
    return this._isAttacked(kingRow, kingCol, color === 'w' ? 'b' : 'w');
  }

  // Is square (row,col) attacked by 'byColor'?
  _isAttacked(row, col, byColor) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = this.board[r][c];
        if (!p || this.colorOf(p) !== byColor) continue;
        const moves = this._pseudoMoves(r, c);
        if (moves.some(m => m.to.row === row && m.to.col === col && !m.castling)) return true;
      }
    }
    return false;
  }

  // Apply move on board temporarily and check if own king is in check
  _moveLeavesKingInCheck(move, color) {
    const saved = this._applyMoveTemporary(move);
    const inCheck = this.isInCheck(color);
    this._undoTemporary(saved);
    return inCheck;
  }

  // Returns legal moves from (row, col)
  legalMovesFrom(row, col) {
    const piece = this.pieceAt(row, col);
    if (!piece || this.colorOf(piece) !== this.turn) return [];
    const pseudo = this._pseudoMoves(row, col);
    return pseudo.filter(m => {
      // Castling: check that king doesn't pass through check
      if (m.castling) {
        const kingRow = this.colorOf(piece) === 'w' ? 7 : 0;
        const passCols = m.castling === 'K' ? [4, 5, 6] : [4, 3, 2];
        for (const pc of passCols) {
          const saved = this._applyMoveTemporary({ from: { row, col }, to: { row: kingRow, col: pc } });
          const check = this.isInCheck(this.turn);
          this._undoTemporary(saved);
          if (check) return false;
        }
        return true;
      }
      return !this._moveLeavesKingInCheck(m, this.turn);
    });
  }

  // All legal moves for current player
  allLegalMoves() {
    const moves = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = this.board[r][c];
        if (p && this.colorOf(p) === this.turn) {
          moves.push(...this.legalMovesFrom(r, c));
        }
      }
    }
    return moves;
  }

  // Temporarily apply move, returns undo state
  _applyMoveTemporary(move) {
    const { from, to, enPassant, castling } = move;
    const saved = {
      from, to,
      fromPiece: this.board[from.row][from.col],
      toPiece: this.board[to.row][to.col],
      enPassantCaptured: null,
      enPassantCapturePos: null,
    };
    this.board[to.row][to.col] = this.board[from.row][from.col];
    this.board[from.row][from.col] = null;

    if (enPassant) {
      const captureRow = from.row;
      saved.enPassantCaptured = this.board[captureRow][to.col];
      saved.enPassantCapturePos = { row: captureRow, col: to.col };
      this.board[captureRow][to.col] = null;
    }

    // Move rook for castling (temporary)
    if (castling) {
      const kingRow = to.row;
      if (castling === 'K') {
        saved.rookFrom = { row: kingRow, col: 7 };
        saved.rookTo = { row: kingRow, col: 5 };
        saved.rookPiece = this.board[kingRow][7];
        this.board[kingRow][5] = this.board[kingRow][7];
        this.board[kingRow][7] = null;
      } else {
        saved.rookFrom = { row: kingRow, col: 0 };
        saved.rookTo = { row: kingRow, col: 3 };
        saved.rookPiece = this.board[kingRow][0];
        this.board[kingRow][3] = this.board[kingRow][0];
        this.board[kingRow][0] = null;
      }
    }
    return saved;
  }

  _undoTemporary(saved) {
    const { from, to } = saved;
    this.board[from.row][from.col] = saved.fromPiece;
    this.board[to.row][to.col] = saved.toPiece;
    if (saved.enPassantCapturePos) {
      this.board[saved.enPassantCapturePos.row][saved.enPassantCapturePos.col] = saved.enPassantCaptured;
    }
    if (saved.rookFrom) {
      this.board[saved.rookFrom.row][saved.rookFrom.col] = saved.rookPiece;
      this.board[saved.rookTo.row][saved.rookTo.col] = null;
    }
  }

  // Execute a legal move. promoteTo = 'Q'|'R'|'B'|'N' for pawn promotion.
  // Returns { needsPromotion: true } if promotion choice needed.
  makeMove(fromRow, fromCol, toRow, toCol, promoteTo = null) {
    const legal = this.legalMovesFrom(fromRow, fromCol);
    const move = legal.find(m => m.to.row === toRow && m.to.col === toCol);
    if (!move) return { ok: false };

    const piece = this.board[fromRow][fromCol];
    const color = this.colorOf(piece);
    const type = this.typeOf(piece);
    const captured = this.board[toRow][toCol];

    // Pawn promotion check
    const promoteRow = color === 'w' ? 0 : 7;
    if (type === 'P' && toRow === promoteRow) {
      if (!promoteTo) return { ok: true, needsPromotion: true, move };
    }

    // Build history record
    const histRecord = {
      board: this.board.map(r => [...r]),
      turn: this.turn,
      castlingRights: { ...this.castlingRights },
      enPassantTarget: this.enPassantTarget,
      halfMoveClock: this.halfMoveClock,
      fullMoveNumber: this.fullMoveNumber,
      capturedByWhite: [...this.capturedByWhite],
      capturedByBlack: [...this.capturedByBlack],
      lastMove: move,
      algebraic: this._toAlgebraic(move, captured, promoteTo),
    };
    this.history.push(histRecord);

    // Apply move
    this.board[toRow][toCol] = piece;
    this.board[fromRow][fromCol] = null;

    // En passant capture
    if (move.enPassant) {
      const capRow = fromRow;
      const capPiece = this.board[capRow][toCol];
      this.board[capRow][toCol] = null;
      if (color === 'w') this.capturedByWhite.push(capPiece);
      else this.capturedByBlack.push(capPiece);
    } else if (captured) {
      if (color === 'w') this.capturedByWhite.push(captured);
      else this.capturedByBlack.push(captured);
    }

    // Castling: move rook
    if (move.castling) {
      const kr = toRow;
      if (move.castling === 'K') {
        this.board[kr][5] = this.board[kr][7];
        this.board[kr][7] = null;
      } else {
        this.board[kr][3] = this.board[kr][0];
        this.board[kr][0] = null;
      }
    }

    // Promotion
    if (type === 'P' && toRow === promoteRow) {
      this.board[toRow][toCol] = color + (promoteTo || 'Q');
    }

    // Update en passant target
    this.enPassantTarget = move.doublePush ? { row: (fromRow + toRow) / 2, col: toCol } : null;

    // Update castling rights
    if (type === 'K') { this.castlingRights[color + 'K'] = false; this.castlingRights[color + 'Q'] = false; }
    if (type === 'R') {
      if (fromCol === 7) this.castlingRights[color + 'K'] = false;
      if (fromCol === 0) this.castlingRights[color + 'Q'] = false;
    }

    // Half move clock
    if (type === 'P' || captured) this.halfMoveClock = 0;
    else this.halfMoveClock++;

    // Full move number
    if (color === 'b') this.fullMoveNumber++;

    // Switch turn
    const opponent = color === 'w' ? 'b' : 'w';
    this.turn = opponent;

    // Update move log
    if (color === 'w') {
      this.moveLog.push({ white: histRecord.algebraic, black: '' });
    } else {
      if (this.moveLog.length > 0) {
        this.moveLog[this.moveLog.length - 1].black = histRecord.algebraic;
      }
    }

    // Update status
    this._updateStatus();
    // Append check/mate to algebraic in log
    if (this.status === 'check') {
      const last = this.moveLog[this.moveLog.length - 1];
      if (color === 'w') last.white += '+'; else last.black += '+';
    } else if (this.status === 'checkmate') {
      const last = this.moveLog[this.moveLog.length - 1];
      if (color === 'w') last.white += '#'; else last.black += '#';
    }

    return { ok: true, move };
  }

  _updateStatus() {
    const inCheck = this.isInCheck(this.turn);
    const hasLegal = this.allLegalMoves().length > 0;

    if (!hasLegal) {
      if (inCheck) {
        this.status = 'checkmate';
        this.winner = this.turn === 'w' ? 'b' : 'w';
      } else {
        this.status = 'stalemate';
      }
    } else if (inCheck) {
      this.status = 'check';
    } else if (this.halfMoveClock >= 100) {
      this.status = 'draw';
    } else if (this._isInsufficientMaterial()) {
      this.status = 'draw';
    } else {
      this.status = 'playing';
    }
  }

  _isInsufficientMaterial() {
    const pieces = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const p = this.board[r][c];
      if (p) pieces.push(p);
    }
    if (pieces.length === 2) return true; // K vs K
    if (pieces.length === 3) {
      const types = pieces.map(p => p[1]);
      if (types.includes('B') || types.includes('N')) return true; // K+B/N vs K
    }
    return false;
  }

  undoMove() {
    if (this.history.length === 0) return false;
    const rec = this.history.pop();
    this.board = rec.board;
    this.turn = rec.turn;
    this.castlingRights = rec.castlingRights;
    this.enPassantTarget = rec.enPassantTarget;
    this.halfMoveClock = rec.halfMoveClock;
    this.fullMoveNumber = rec.fullMoveNumber;
    this.capturedByWhite = rec.capturedByWhite;
    this.capturedByBlack = rec.capturedByBlack;

    // Adjust moveLog
    if (rec.turn === 'b') {
      if (this.moveLog.length > 0) this.moveLog[this.moveLog.length - 1].black = '';
    } else {
      this.moveLog.pop();
    }
    this.status = 'playing';
    this.winner = null;
    this._updateStatus();
    return true;
  }

  lastMove() {
    if (this.history.length === 0) return null;
    return this.history[this.history.length - 1].lastMove;
  }

  // Simple algebraic notation
  _toAlgebraic(move, captured, promoteTo) {
    const piece = this.board[move.from.row][move.from.col];
    const type = this.typeOf(piece);
    const files = 'abcdefgh';
    const toFile = files[move.to.col];
    const toRank = 8 - move.to.row;

    if (move.castling === 'K') return 'O-O';
    if (move.castling === 'Q') return 'O-O-O';

    let notation = '';
    if (type === 'P') {
      if (captured || move.enPassant) notation = files[move.from.col] + 'x';
      notation += toFile + toRank;
      if (promoteTo) notation += '=' + promoteTo;
    } else {
      notation = type;
      if (captured) notation += 'x';
      notation += toFile + toRank;
    }
    return notation;
  }

  // Find king position for highlighting
  kingPosition(color) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (this.board[r][c] === color + 'K') return { row: r, col: c };
      }
    }
    return null;
  }
}

// Export global
window.ChessGame = ChessGame;
window.PIECES = PIECES;
