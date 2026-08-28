/* ================================================
   BACCARAT ROYAL — game.js
   Baccarat with Fortune 7, Panda 8, and all
   5 road maps: Bead Plate, Big Road, Big Eye Boy,
   Small Road, Cockroach Road
================================================ */

'use strict';

// ─── CONSTANTS ──────────────────────────────────────────────────────────────
const SUITS = ['♠','♣','♥','♦'];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const DECKS = 8;
const CELL = 22; // pixels per road-map cell

// Payout multipliers (net win; 1 = even money)
const PAYOUTS = {
  player:   1,
  banker:   1,
  tie:      8,
  fortune7: 40,  // banker 3-card 7
  panda8:   25,  // player 3-card 8
};

// ─── STATE ───────────────────────────────────────────────────────────────────
let shoe = [];
let balance = 1000;
let currentBets = { player:0, banker:0, tie:0, fortune7:0, panda8:0 };
let lastBets    = { player:0, banker:0, tie:0, fortune7:0, panda8:0 };
let selectedChip = 100;
let dealing = false;

// Statistics
let stats = { banker:0, player:0, tie:0, fortune7:0, panda8:0, hands:0 };

// History array: each entry = { playerScore, bankerScore, winner, pCards, bCards, bonus, playerCount, bankerCount }
let history = [];

// ─── BOOT ────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  buildShoe();
  renderRoads();

  document.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      selectedChip = parseInt(btn.dataset.val);
    });
  });

  document.getElementById('btn-clear-bets').addEventListener('click', clearBets);
  document.getElementById('btn-rebet').addEventListener('click', rebet);
  document.getElementById('btn-reset').addEventListener('click', newShoe);
});

// ─── SHOE ────────────────────────────────────────────────────────────────────
function buildShoe() {
  shoe = [];
  for (let d = 0; d < DECKS; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        shoe.push({ rank, suit });
      }
    }
  }
  shuffle(shoe);
  updateShoeCount();
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function drawCard() {
  if (shoe.length < 15) {
    showToast('🃏 Reshuffling shoe…');
    buildShoe();
  }
  return shoe.pop();
}

function cardValue(card) {
  if (['10','J','Q','K'].includes(card.rank)) return 0;
  if (card.rank === 'A') return 1;
  return parseInt(card.rank);
}

function handTotal(cards) {
  return cards.reduce((s, c) => s + cardValue(c), 0) % 10;
}

function isRedSuit(suit) { return suit === '♥' || suit === '♦'; }

function newShoe() {
  if (dealing) return;
  buildShoe();
  stats = { banker:0, player:0, tie:0, fortune7:0, panda8:0, hands:0 };
  history = [];
  clearCards();
  document.getElementById('result-flash').textContent = '';
  document.getElementById('payout-display').textContent = '';
  document.getElementById('payout-display').className = '';
  document.getElementById('score-player').textContent = '0';
  document.getElementById('score-banker').textContent = '0';
  document.getElementById('history-body').innerHTML = '';
  updateStats();
  renderRoads();
  renderPrediction();
  renderCockroachExplanation();
  showToast('New 8-deck shoe shuffled!');
}

function updateShoeCount() {
  document.getElementById('shoe-count').textContent = 416 - shoe.length;
}

// ─── BETTING ─────────────────────────────────────────────────────────────────
function addBet(type) {
  if (dealing) return;
  if (balance < selectedChip) { showToast('Insufficient balance!'); return; }
  currentBets[type] += selectedChip;
  balance -= selectedChip;
  updateBalanceDisplay();
  renderBetSpots();
}

function clearBets() {
  if (dealing) return;
  balance += Object.values(currentBets).reduce((a,b) => a+b, 0);
  currentBets = { player:0, banker:0, tie:0, fortune7:0, panda8:0 };
  updateBalanceDisplay();
  renderBetSpots();
}

function rebet() {
  if (dealing) return;
  const total = Object.values(lastBets).reduce((a,b) => a+b, 0);
  if (total === 0) { showToast('No previous bet to repeat.'); return; }
  // currentBets may have chips already; refund them first, then check
  const currentStake = Object.values(currentBets).reduce((a,b) => a+b, 0);
  if (balance + currentStake < total) { showToast('Insufficient balance for rebet!'); return; }
  clearBets(); // refunds current stake back to balance
  for (const k in lastBets) currentBets[k] = lastBets[k];
  balance -= total;
  updateBalanceDisplay();
  renderBetSpots();
}

function updateBalanceDisplay() {
  document.getElementById('balance').textContent = balance.toLocaleString();
}

function renderBetSpots() {
  const keys = ['player','banker','tie','fortune7','panda8'];
  keys.forEach(k => {
    document.getElementById('bet-' + k).textContent = currentBets[k].toLocaleString();
    const chipsEl = document.getElementById('chips-' + k);
    chipsEl.innerHTML = '';
    if (currentBets[k] > 0) {
      const mc = document.createElement('div');
      mc.className = 'mini-chip';
      mc.textContent = '$' + currentBets[k];
      chipsEl.appendChild(mc);
      document.getElementById('spot-' + k).classList.add('active-bet');
    } else {
      document.getElementById('spot-' + k).classList.remove('active-bet');
    }
  });
}

// ─── DEAL ────────────────────────────────────────────────────────────────────
async function deal() {
  if (dealing) return;
  const totalBet = Object.values(currentBets).reduce((a,b) => a+b, 0);
  if (totalBet === 0) { showToast('Place a bet first!'); return; }

  dealing = true;
  document.getElementById('btn-deal').disabled = true;
  document.getElementById('result-flash').textContent = '';
  document.getElementById('payout-display').textContent = '';
  document.getElementById('payout-display').className = '';
  clearCards();

  // Save last bets
  lastBets = { ...currentBets };

  // Deal initial 4 cards: P1, B1, P2, B2
  const pCards = [];
  const bCards = [];

  await dealCardTo('player', pCards);
  await pause(220);
  await dealCardTo('banker', bCards);
  await pause(220);
  await dealCardTo('player', pCards);
  await pause(220);
  await dealCardTo('banker', bCards);
  await pause(220);

  let pScore = handTotal(pCards);
  let bScore = handTotal(bCards);

  updateScores(pScore, bScore);

  // ── Natural check ──
  const natural = pScore >= 8 || bScore >= 8;

  // ── Player 3rd card rule ──
  let pDraw = false;
  let pThird = null;
  if (!natural && pScore <= 5) {
    await pause(300);
    await dealCardTo('player', pCards);
    pThird = pCards[2];
    pScore = handTotal(pCards);
    pDraw = true;
    updateScores(pScore, bScore);
    await pause(220);
  }

  // ── Banker 3rd card rule ──
  if (!natural) {
    let bankerDraws = false;
    if (!pDraw) {
      bankerDraws = bScore <= 5;
    } else {
      const pv = cardValue(pThird);
      if      (bScore <= 2) bankerDraws = true;
      else if (bScore === 3) bankerDraws = pv !== 8;
      else if (bScore === 4) bankerDraws = pv >= 2 && pv <= 7;
      else if (bScore === 5) bankerDraws = pv >= 4 && pv <= 7;
      else if (bScore === 6) bankerDraws = pv === 6 || pv === 7;
      else bankerDraws = false;
    }
    if (bankerDraws) {
      await dealCardTo('banker', bCards);
      bScore = handTotal(bCards);
      updateScores(pScore, bScore);
      await pause(220);
    }
  }

  // ── Determine winner ──
  let winner = pScore > bScore ? 'player' : bScore > pScore ? 'banker' : 'tie';
  let bonuses = [];

  // Fortune 7: Banker wins with 3-card total of 7
  const fortune7 = (winner === 'banker' && bCards.length === 3 && bScore === 7);
  // Panda 8: Player wins with 3-card total of 8
  const panda8   = (winner === 'player' && pCards.length === 3 && pScore === 8);

  if (fortune7) bonuses.push('Fortune 7 🌟');
  if (panda8)   bonuses.push('Panda 8 🐼');

  // ── Settle bets ──
  const totalStaked = Object.values(currentBets).reduce((a,b) => a+b, 0);
  const betSnapshot = { ...currentBets };          // snapshot before clearing
  const payout = settleBets(winner, fortune7, panda8);
  const returned = totalStaked + payout;           // actual $ that came back

  // ── Update stats ──
  stats.hands++;
  stats[winner]++;
  if (fortune7) stats.fortune7++;
  if (panda8)   stats.panda8++;
  updateStats();
  updateShoeCount();

  // ── Display result ──
  await pause(200);
  showResult(winner, fortune7, panda8, payout);

  // ── Record hand ──
  const entry = {
    hand: stats.hands,
    pScore, bScore, winner,
    pCards: [...pCards], bCards: [...bCards],
    bonus: bonuses.join(', '),
    pCount: pCards.length, bCount: bCards.length,
    payout,
    bets: betSnapshot,
    totalStaked,
    returned
  };
  history.push(entry);
  addHistoryRow(entry);
  renderRoads();
  renderPrediction();
  renderCockroachExplanation();

  currentBets = { player:0, banker:0, tie:0, fortune7:0, panda8:0 };
  renderBetSpots();

  dealing = false;
  document.getElementById('btn-deal').disabled = false;
}

function pause(ms) { return new Promise(r => setTimeout(r, ms)); }

async function dealCardTo(side, arr) {
  const card = drawCard();
  arr.push(card);
  renderCard(side, card);
}

function clearCards() {
  document.getElementById('cards-player').innerHTML = '';
  document.getElementById('cards-banker').innerHTML = '';
  document.getElementById('score-player').textContent = '0';
  document.getElementById('score-banker').textContent = '0';
}

function renderCard(side, card) {
  const container = document.getElementById('cards-' + side);
  const el = document.createElement('div');
  el.className = 'card ' + (isRedSuit(card.suit) ? 'red-suit' : 'black-suit');

  const tl = document.createElement('div');
  tl.className = 'card-corner-tl';
  tl.innerHTML = card.rank + '<br>' + card.suit;

  const center = document.createElement('div');
  center.innerHTML = '<div class="card-rank">' + card.rank + '</div><div class="card-suit">' + card.suit + '</div>';

  const br = document.createElement('div');
  br.className = 'card-corner-br';
  br.innerHTML = card.rank + '<br>' + card.suit;

  el.appendChild(tl);
  el.appendChild(center);
  el.appendChild(br);
  container.appendChild(el);
}

function updateScores(p, b) {
  document.getElementById('score-player').textContent = p;
  document.getElementById('score-banker').textContent = b;
}

// ─── SETTLE BETS ─────────────────────────────────────────────────────────────
// Stakes were already deducted from balance when placed.
// Here we only add back winnings (stake + profit for winners, just stake for push).
function settleBets(winner, fortune7, panda8) {
  let returned = 0;   // total $ returned to balance
  let staked   = Object.values(currentBets).reduce((a,b) => a+b, 0);

  // Main bets — return stake + profit for winners; on tie push P and B stakes
  if (winner === 'player') {
    returned += currentBets.player + Math.floor(currentBets.player * PAYOUTS.player);
  } else if (winner === 'banker') {
    returned += currentBets.banker + Math.floor(currentBets.banker * PAYOUTS.banker);
  } else { // tie
    returned += currentBets.tie + currentBets.tie * PAYOUTS.tie;  // tie pays 8:1
    returned += currentBets.player;   // push
    returned += currentBets.banker;   // push
  }

  // Bonus bets — always independent side bets; lose if condition not met
  if (fortune7) returned += currentBets.fortune7 + currentBets.fortune7 * PAYOUTS.fortune7;
  if (panda8)   returned += currentBets.panda8   + currentBets.panda8   * PAYOUTS.panda8;

  returned = Math.round(returned);
  balance += returned;
  updateBalanceDisplay();

  // Net payout = what came back minus what was staked
  return returned - staked;
}

function showResult(winner, fortune7, panda8, payout) {
  // ── Centre result label ──
  const flash = document.getElementById('result-flash');
  let resultHtml = '';
  if (winner === 'banker')      resultHtml = '<span style="color:#ff9999">BANKER WINS</span>';
  else if (winner === 'player') resultHtml = '<span style="color:#80c4ff">PLAYER WINS</span>';
  else                          resultHtml = '<span style="color:#80ffaa">TIE</span>';
  flash.innerHTML = resultHtml;

  // ── Payout amount under result ──
  const pd = document.getElementById('payout-display');
  pd.className = 'pay-';
  if (payout > 0) {
    pd.textContent  = '+$' + payout.toLocaleString();
    pd.className    = 'win';
  } else if (payout < 0) {
    pd.textContent  = '-$' + Math.abs(payout).toLocaleString();
    pd.className    = 'loss';
  } else {
    pd.textContent  = 'PUSH';
    pd.className    = 'push';
  }

  // ── Full-screen overlay ──
  const overlay = document.getElementById('round-payout-overlay');
  const oResult = document.getElementById('overlay-result');
  const oAmount = document.getElementById('overlay-amount');
  const oBonuses= document.getElementById('overlay-bonuses');

  oResult.innerHTML = resultHtml;

  if (payout > 0) {
    oAmount.className = 'overlay-amount win';
    oAmount.textContent = '+$' + payout.toLocaleString();
  } else if (payout < 0) {
    oAmount.className = 'overlay-amount loss';
    oAmount.textContent = '-$' + Math.abs(payout).toLocaleString();
  } else {
    oAmount.className = 'overlay-amount push';
    oAmount.textContent = 'PUSH';
  }

  oBonuses.innerHTML = '';
  if (fortune7) {
    const b = document.createElement('span');
    b.className = 'bonus-badge badge-f7';
    b.textContent = '🌟 Fortune 7 ×40';
    oBonuses.appendChild(b);
  }
  if (panda8) {
    const b = document.createElement('span');
    b.className = 'bonus-badge badge-p8';
    b.textContent = '🐼 Panda 8 ×25';
    oBonuses.appendChild(b);
  }

  // Trigger animation
  overlay.classList.remove('show');
  void overlay.offsetWidth; // reflow
  overlay.classList.add('show');

  // Auto-hide after animation completes
  setTimeout(() => overlay.classList.remove('show'), 2600);

  // ── Show 3D bonus popups for Fortune 7 and Panda 8 ──
  if (fortune7) {
    showBonusPopup('fortune7-popup', 3000);
  }
  if (panda8) {
    showBonusPopup('panda8-popup', 3000);
  }

  // ── Balance colour flash ──
  const balEl = document.getElementById('balance');
  balEl.classList.remove('gain', 'loss');
  void balEl.offsetWidth;
  if (payout > 0)      balEl.classList.add('gain');
  else if (payout < 0) balEl.classList.add('loss');
  setTimeout(() => balEl.classList.remove('gain', 'loss'), 700);
}

// ── Show 3D Bonus Popup ──
function showBonusPopup(popupId, duration) {
  const popup = document.getElementById(popupId);
  popup.classList.add('show');
  
  setTimeout(() => {
    popup.classList.remove('show');
  }, duration);
}

function updateStats() {
  document.getElementById('hand-num').textContent  = stats.hands;
  document.getElementById('stat-b').textContent    = stats.banker;
  document.getElementById('stat-p').textContent    = stats.player;
  document.getElementById('stat-t').textContent    = stats.tie;
  document.getElementById('stat-f7').textContent   = stats.fortune7;
  document.getElementById('stat-p8').textContent   = stats.panda8;
}

function addHistoryRow(e) {
  const tbody = document.getElementById('history-body');
  const tr = document.createElement('tr');

  const resClass = e.winner === 'banker' ? 'res-banker'
                 : e.winner === 'player' ? 'res-player' : 'res-tie';
  const resLabel = e.winner.toUpperCase();

  // Net payout class
  let netClass = 'pay-push', netText = '±$0';
  if (e.payout > 0)      { netClass = 'pay-win';  netText = '+$' + e.payout.toLocaleString(); }
  else if (e.payout < 0) { netClass = 'pay-loss'; netText = '−$' + Math.abs(e.payout).toLocaleString(); }

  // Individual bet cells — blank if $0
  function betCell(val) {
    return val > 0
      ? '<td class="bet-cell active-bet-cell">$' + val.toLocaleString() + '</td>'
      : '<td class="bet-cell muted-cell">—</td>';
  }

  // Cards display
  const pCardsStr = e.pCards.map(c => cardSymbol(c)).join(' ');
  const bCardsStr = e.bCards.map(c => cardSymbol(c)).join(' ');

  tr.innerHTML =
    '<td class="td-hand">'  + e.hand + '</td>' +
    '<td class="' + resClass + '">' + resLabel + '</td>' +
    '<td>' + e.pScore + '</td>' +
    '<td>' + e.bScore + '</td>' +
    betCell(e.bets.player) +
    betCell(e.bets.banker) +
    betCell(e.bets.tie) +
    betCell(e.bets.fortune7) +
    betCell(e.bets.panda8) +
    '<td class="bet-total">$' + e.totalStaked.toLocaleString() + '</td>' +
    '<td class="bet-returned">$' + e.returned.toLocaleString() + '</td>' +
    '<td class="' + netClass + ' td-net">' + netText + '</td>' +
    '<td class="td-bonus">' + (e.bonus || '—') + '</td>' +
    '<td class="td-cards"><span class="cards-p">' + pCardsStr + '</span> <span class="cards-vs">vs</span> <span class="cards-b">' + bCardsStr + '</span></td>';

  tbody.insertBefore(tr, tbody.firstChild);
}

// Format a card as coloured text symbol
function cardSymbol(card) {
  const red = card.suit === '♥' || card.suit === '♦';
  return '<span class="' + (red ? 'sym-red' : 'sym-blk') + '">' + card.rank + card.suit + '</span>';
}

// ─── TOAST ───────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, duration=2200) {
  const t = document.getElementById('toast');
  t.innerHTML = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), duration);
}

/* ============================================================
   ROAD MAPS
   All five standard Baccarat scoreboard roads.

   Data model:
   history[] each has: winner ('banker'|'player'|'tie'),
   pCount, bCount, pScore, bScore

   Colors used:
     Banker = red   (#e03030)
     Player = blue  (#1a6faf)
     Tie    = green (#27ae60)
   ============================================================ */

const R_COL_B  = '#e03030';
const R_COL_P  = '#1a6faf';
const R_COL_T  = '#27ae60';
const R_COL_BR = '#e03030'; // big-eye boy banker = red hollow
const R_COL_PR = '#1a6faf'; // big-eye boy player = blue hollow
const R_GRID   = '#ddd';    // grid lines

function renderRoads() {
  drawBeadPlate();
  drawBigRoad();
  drawDerivedRoads();
}

// ─── helpers ─────────────────────────────────────────────────────────────────
function clearCanvas(id) {
  const c = document.getElementById(id);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  return { c, ctx };
}

function drawGrid(ctx, w, h, cell) {
  ctx.strokeStyle = R_GRID;
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= w; x += cell) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 0; y <= h; y += cell) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
}

function filledCircle(ctx, cx, cy, r, color) {
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2);
  ctx.fillStyle = color; ctx.fill();
}

function hollowCircle(ctx, cx, cy, r, color, lw=2) {
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2);
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.stroke();
}

function slashLine(ctx, x1, y1, x2, y2, color) { // used for future decorations
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2);
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
}

// ─── 1. BEAD PLATE ───────────────────────────────────────────────────────────
// 6 rows × N columns, filled column by column top→down
function drawBeadPlate() {
  const { c, ctx } = clearCanvas('road-bead');
  const ROWS = 6;
  const cell = CELL;
  drawGrid(ctx, c.width, c.height, cell);

  history.forEach((h, i) => {
    const col = Math.floor(i / ROWS);
    const row = i % ROWS;
    const cx = col * cell + cell/2;
    const cy = row * cell + cell/2;
    if (cx + cell/2 > c.width) return; // off canvas

    const isFortune7 = h.winner === 'banker' && h.bCards && h.bCards.length === 3 && h.bScore === 7;
    const isPanda8   = h.winner === 'player' && h.pCards && h.pCards.length === 3 && h.pScore === 8;
    const color = h.winner === 'banker' ? R_COL_B : h.winner === 'player' ? R_COL_P : R_COL_T;
    filledCircle(ctx, cx, cy, cell/2 - 2, color);

    // Score / label overlay
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.floor(cell*0.38)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let label;
    if (h.winner === 'banker')      label = String(h.bScore);
    else if (h.winner === 'player') label = String(h.pScore);
    else                            label = 'T';
    ctx.fillText(label, cx, cy);

    // Bonus markers for special outcomes
    if (isFortune7 || isPanda8) {
      ctx.fillStyle = '#fff';
      ctx.font = `${Math.floor(cell*0.46)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(isFortune7 ? '🐉' : '🐼', cx, cy - cell * 0.28);
    }
  });
}

// ─── 2. BIG ROAD ─────────────────────────────────────────────────────────────

function drawBigRoad() {
  const { c, ctx } = clearCanvas('road-big');
  const ROWS = 6;
  const cell = CELL;
  drawGrid(ctx, c.width, c.height, cell);

  // Build grid AND a score map in one pass
  const { grid, scoreMap } = buildBigRoadGridWithScores();

  grid.forEach((col, ci) => {
    if (!col) return;
    col.forEach((cell_data, ri) => {
      if (!cell_data) return;
      const cx = ci * cell + cell/2;
      const cy = ri * cell + cell/2;
      if (cx + cell/2 > c.width) return;

      const color = cell_data.winner === 'banker' ? R_COL_B : R_COL_P;
      filledCircle(ctx, cx, cy, cell/2 - 2, color);

      // Score from pre-built map
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.floor(cell*0.4)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const key = ci + ',' + ri;
      ctx.fillText(scoreMap[key] ?? '', cx, cy);

      // Tie slashes — draw green lines through the circle
      if (cell_data.tieCount > 0) {
        ctx.strokeStyle = R_COL_T;
        ctx.lineWidth = 1.5;
        const tCount = Math.min(cell_data.tieCount, 4);
        const r2 = cell/2 - 2;
        for (let t = 0; t < tCount; t++) {
          const angle = (t / tCount) * Math.PI * 2 - Math.PI/4;
          const x1 = cx + Math.cos(angle) * (r2 - 3);
          const y1 = cy + Math.sin(angle) * (r2 - 3);
          const x2 = cx + Math.cos(angle + Math.PI) * (r2 - 3);
          const y2 = cy + Math.sin(angle + Math.PI) * (r2 - 3);
          ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
        }
      }
    });
  });
}

// Build Big Road grid and simultaneously record scores at each (col,row)
function buildBigRoadGridWithScores() {
  const ROWS = 6;
  const grid = [];
  const scoreMap = {};
  let col = -1, row = 0;
  let lastNonTie = null;
  let lastNonTieWinner = null;

  history.forEach(h => {
    if (h.winner === 'tie') {
      if (lastNonTie) lastNonTie.tieCount = (lastNonTie.tieCount || 0) + 1;
      return;
    }

    if (h.winner !== lastNonTieWinner || col === -1) {
      col++; row = 0;
    } else {
      row++;
      if (row >= ROWS) { col++; row = ROWS - 1; }
    }

    if (!grid[col]) grid[col] = [];
    const cell_data = { winner: h.winner, tieCount: 0 };
    grid[col][row] = cell_data;
    lastNonTie = cell_data;
    lastNonTieWinner = h.winner;

    const key = col + ',' + row;
    scoreMap[key] = h.winner === 'banker' ? h.bScore : h.pScore;
  });
  return { grid, scoreMap };
}

/* ============================================================
   DERIVED ROADS: Big Eye Boy, Small Road, Cockroach Road

   All three derived roads are generated from the Big Road.
   The rule for each is: compare the current cell with a cell
   offset by a fixed amount in the Big Road.

   Standard offsets (columns back):
     Big Eye Boy:   compare col-1, row-1  (offset 1)
     Small Road:    compare col-2, row-1  (offset 2)
     Cockroach Rd:  compare col-3, row-1  (offset 3)

   For each new entry in the Big Road:
     - If the referenced cell MATCHES the cell above the
       previous column's same row → RED (repetitive)
     - Else → BLUE (not repetitive / irregular)

   Red = hollow red circle
   Blue = hollow blue circle
   ============================================================ */

function getBigRoadFlat() {
  const ROWS = 6;
  let col = -1, row = 0;
  let lastNonTieWinner = null;
  const cells = []; // [{col, row, winner}]

  history.forEach(h => {
    if (h.winner === 'tie') return;
    if (h.winner !== lastNonTieWinner || col === -1) {
      col++; row = 0;
    } else {
      row++;
      if (row >= ROWS) { col++; row = ROWS - 1; }
    }
    lastNonTieWinner = h.winner;
    cells.push({ col, row, winner: h.winner });
  });
  return cells;
}

function getCellAt(cells, col, row) {
  return cells.find(c => c.col === col && c.row === row) || null;
}

// ─── DERIVED ROAD LOGIC (canonical casino rules) ─────────────────────────────
//
// For each Big Road cell at (col, row):
//   row === 0  (new column / streak change):
//     RED  if prev column depth-≥2 matches ref column depth-≥2
//     BLUE otherwise
//   row > 0  (streak continuing downward):
//     RED  if the PREVIOUS column has a cell at this same row
//     BLUE otherwise
//
// colOffset: 1 = Big Eye Boy, 2 = Small Road, 3 = Cockroach Road

function buildDerivedRoad(cells, colOffset) {
  const result = [];
  cells.forEach(cell => {
    const { col, row } = cell;
    if (col < colOffset) return; // not enough Big Road history yet

    let isRed;
    if (row === 0) {
      // Does previous column have ≥2 rows? Does reference column have ≥2 rows?
      const prevDeep = getCellAt(cells, col - 1, 1) !== null;
      const refDeep  = getCellAt(cells, col - colOffset, 1) !== null;
      isRed = prevDeep === refDeep;
    } else {
      // Does the immediately previous column extend to this same row?
      isRed = getCellAt(cells, col - 1, row) !== null;
    }
    result.push(isRed ? 'red' : 'blue');
  });
  return result;
}

// Draw a diagonal slash (top-right → bottom-left) for Cockroach Road
function drawSlash(ctx, cx, cy, r, color) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx + r, cy - r);   // top-right
  ctx.lineTo(cx - r, cy + r);   // bottom-left
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}

// Draw one derived road canvas. useSlash=true → Cockroach Road spikes
function drawDerivedRoad(canvasId, entries, cellSize, useSlash) {
  const { c, ctx } = clearCanvas(canvasId);
  const ROWS = 6;
  drawGrid(ctx, c.width, c.height, cellSize);

  const r = cellSize / 2 - 1.5;

  let currentColor = null;
  let currentCol = -1;
  let currentRow = 0;

  entries.forEach((color, i) => {
    if (i === 0 || color !== currentColor) {
      currentColor = color;
      currentCol += 1;
      currentRow = 0;
    } else {
      currentRow += 1;
      if (currentRow >= ROWS) {
        currentCol += 1;
        currentRow = 0;
      }
    }

    const cx = currentCol * cellSize + cellSize / 2;
    const cy = currentRow * cellSize + cellSize / 2;
    if (cx + cellSize > c.width) return;

    const strokeColor = color === 'red' ? R_COL_B : R_COL_P;
    if (useSlash) {
      drawSlash(ctx, cx, cy, r, strokeColor);
    } else {
      hollowCircle(ctx, cx, cy, r, strokeColor, 2);
    }
  });
}

function drawDerivedRoads() {
  const bigCells = getBigRoadFlat();
  const cell = CELL / 2; // 11 px → 6 rows fit in 66 px canvas height

  drawDerivedRoad('road-bigeye',    buildDerivedRoad(bigCells, 1), cell, false);
  drawDerivedRoad('road-small',     buildDerivedRoad(bigCells, 2), cell, false);
  drawDerivedRoad('road-cockroach', buildDerivedRoad(bigCells, 3), cell, true);
}

/* ============================================================
   COCKROACH ROAD — PER-ENTRY EXPLANATION
   Shows exactly WHY each slash is red (repetitive) or blue
   (irregular), referencing the actual Big Road column depths.
============================================================ */
function renderCockroachExplanation() {
  const container = document.getElementById('cockroach-entries');
  container.innerHTML = '';

  const bigCells = getBigRoadFlat();
  const ROWS = 6;
  const colOffset = 3;

  // Build cockroach entries with full reasoning
  const entries = [];
  bigCells.forEach((cell, idx) => {
    const { col, row } = cell;
    if (col < colOffset) return;

    let isRed, reason, prevDepth, refDepth;

    if (row === 0) {
      prevDepth = bigCells.filter(c => c.col === col - 1).length;
      refDepth  = bigCells.filter(c => c.col === col - colOffset).length;
      const prevDeep = getCellAt(bigCells, col - 1, 1) !== null;
      const refDeep  = getCellAt(bigCells, col - colOffset, 1) !== null;
      isRed = prevDeep === refDeep;

      if (isRed) {
        reason = `New streak started. Previous column (col ${col - 1}) depth = ${prevDepth}, reference column (col ${col - colOffset}) depth = ${refDepth}. Both ${prevDeep ? '≥2' : '=1'} — pattern is consistent → <strong>Repetitive</strong>.`;
      } else {
        reason = `New streak started. Previous column (col ${col - 1}) depth = ${prevDepth} (${prevDeep ? '≥2' : '=1'}), reference column (col ${col - colOffset}) depth = ${refDepth} (${refDeep ? '≥2' : '=1'}). Depths differ → <strong>Irregular</strong>.`;
      }
    } else {
      const prevHasRow = getCellAt(bigCells, col - 1, row) !== null;
      prevDepth = bigCells.filter(c => c.col === col - 1).length;
      isRed = prevHasRow;

      if (isRed) {
        reason = `Streak continuing (row ${row + 1}). Previous column also reached row ${row + 1} (depth ${prevDepth}) — same depth pattern → <strong>Repetitive</strong>.`;
      } else {
        reason = `Streak continuing (row ${row + 1}). Previous column stopped at row ${prevDepth} (did not reach row ${row + 1}) — streak is longer than previous → <strong>Irregular / Shoe shifting</strong>.`;
      }
    }

    // Compute cockroach last entry once
    const histEntry = history.filter(h => h.winner !== 'tie')[idx - bigCells.filter((c2, i2) => i2 < idx && c2.col < colOffset).length]; // unused detail reference

    entries.push({ isRed, reason, col, row, entryNum: entries.length + 1 });
  });

  if (entries.length === 0) {
    container.innerHTML = '<p class="cr-empty">Play more hands to see Cockroach Road explanations (needs at least 4 Big Road columns).</p>';
    return;
  }

  // Show last 12 entries max (most recent first)
  const show = entries.slice(-12).reverse();
  show.forEach((e, i) => {
    const div = document.createElement('div');
    div.className = 'cr-entry ' + (e.isRed ? 'cr-entry-red' : 'cr-entry-blue');
    div.innerHTML =
      '<span class="cr-slash-icon ' + (e.isRed ? 'cr-red' : 'cr-blue') + '">/</span>' +
      '<span class="cr-entry-label">' + (e.isRed ? 'REPETITIVE' : 'IRREGULAR') + '</span>' +
      '<span class="cr-entry-reason">' + e.reason + '</span>';
    container.appendChild(div);
  });
}

/* ============================================================
   NEXT-ROUND PREDICTION ENGINE
   Uses a multi-signal approach:
   1. Raw frequency (B/P/T count from history)
   2. Current streak momentum (last 5 hands)
   3. Big Road last streak direction
   4. Derived road trend (Big Eye Boy — are we in a repetitive
      or irregular phase? Repetitive → continue last winner;
      irregular → expect a switch)
   5. Tie base rate fixed at ~9.5% and redistributed
   All signals are weighted and combined into a final %
============================================================ */
function renderPrediction() {
  const insightEl = document.getElementById('pred-insight-text');

  // Need at least 3 hands
  if (history.length < 3) {
    ['banker','player','tie'].forEach(k => {
      document.getElementById('pred-pct-' + k).textContent = '—';
      document.getElementById('pred-bar-' + k).style.width = '0%';
      document.getElementById('pred-' + k).classList.remove('pred-top');
    });
    insightEl.textContent = 'Play at least 3 hands to see predictions.';
    return;
  }

  // ── Signal 1: Raw session frequency ──
  const total = stats.hands;
  const freqB = stats.banker / total;
  const freqP = stats.player / total;
  const freqT = stats.tie    / total;

  // ── Signal 2: Recent momentum — last 5 non-tie results ──
  const recent = history.filter(h => h.winner !== 'tie').slice(-5);
  let momB = 0, momP = 0;
  recent.forEach((h, i) => {
    const w = (i + 1) / recent.length; // more recent = more weight
    if (h.winner === 'banker') momB += w;
    else momP += w;
  });
  const momTotal = momB + momP || 1;
  const momBn = momB / momTotal;
  const momPn = momP / momTotal;

  // ── Signal 3: Big Road last streak direction ──
  const bigCells = getBigRoadFlat();
  const lastStreak = bigCells.length ? bigCells[bigCells.length - 1].winner : null;
  const streakLen  = bigCells.length
    ? bigCells.filter(c => c.col === bigCells[bigCells.length - 1].col).length
    : 0;
  // Longer streaks have slight momentum bonus (dragon tail tendency)
  const streakBonus = Math.min(streakLen * 0.03, 0.12);
  let strB = 0.5, strP = 0.5;
  if (lastStreak === 'banker') { strB = 0.5 + streakBonus; strP = 0.5 - streakBonus; }
  if (lastStreak === 'player') { strP = 0.5 + streakBonus; strB = 0.5 - streakBonus; }

  // ── Signal 4: Big Eye Boy derived trend ──
  const bigEyeEntries = buildDerivedRoad(bigCells, 1);
  const lastFewBE = bigEyeEntries.slice(-4);
  const redCount  = lastFewBE.filter(x => x === 'red').length;
  const blueCount = lastFewBE.length - redCount;
  // RED (repetitive) → current pattern continuing → bet same as last streak
  // BLUE (irregular) → pattern breaking → bet opposite of last streak
  let beB = 0.5, beP = 0.5;
  if (lastFewBE.length >= 2) {
    if (redCount > blueCount) {
      // Repetitive: last streak likely continues
      if (lastStreak === 'banker') { beB = 0.62; beP = 0.38; }
      else                         { beP = 0.62; beB = 0.38; }
    } else {
      // Irregular: switch expected
      if (lastStreak === 'banker') { beP = 0.60; beB = 0.40; }
      else                         { beB = 0.60; beP = 0.40; }
    }
  }

  // ── Combine signals (weights) ──
  const W = { freq: 0.20, mom: 0.30, streak: 0.20, bige: 0.30 };
  let rawB = W.freq * freqB + W.mom * momBn + W.streak * strB + W.bige * beB;
  let rawP = W.freq * freqP + W.mom * momPn + W.streak * strP + W.bige * beP;

  // ── Tie: fixed base 9.5%, scaled by session tie rate ──
  const tieAdj = 0.095 + freqT * 0.10; // 9.5–19.5% range
  rawB *= (1 - tieAdj);
  rawP *= (1 - tieAdj);
  const rawT = tieAdj;

  // Normalise to 100%
  const sum  = rawB + rawP + rawT;
  const pctB = Math.round(rawB / sum * 100);
  const pctP = Math.round(rawP / sum * 100);
  const pctT = Math.max(0, 100 - pctB - pctP);   // clamp: rounding can't go negative

  // ── Render bars ──
  const vals = { banker: pctB, player: pctP, tie: pctT };
  const top  = Object.entries(vals).sort((a,b) => b[1]-a[1])[0][0];

  ['banker','player','tie'].forEach(k => {
    const pct = vals[k];
    document.getElementById('pred-pct-' + k).textContent = pct + '%';
    document.getElementById('pred-bar-' + k).style.width = pct + '%';
    document.getElementById('pred-' + k).classList.toggle('pred-top', k === top);
  });

  // ── Insight text ──
  const lastWinner   = history[history.length - 1].winner;
  const streakWinner = lastStreak
    ? lastStreak.charAt(0).toUpperCase() + lastStreak.slice(1)
    : '?';
  const phaseText = redCount > blueCount ? 'Repetitive (🔴)'
                  : blueCount > 0        ? 'Irregular (🔵)'
                  : 'Neutral';
  const topLabel  = top.charAt(0).toUpperCase() + top.slice(1);

  const crEntries   = buildDerivedRoad(bigCells, 3);   // compute once
  const crLast      = crEntries[crEntries.length - 1];
  const crPhase     = crEntries.length === 0 ? 'N/A'
                    : crLast === 'red'        ? 'Repetitive 🔴'
                    :                           'Irregular 🔵';

  const lines = [
    `Last result: <strong>${lastWinner.toUpperCase()}</strong>`,
    `Current Big Road streak: <strong>${streakWinner}</strong> ×${streakLen}`,
    `Big Eye Boy phase (last 4): <strong>${phaseText}</strong>`,
    `Cockroach Road (last entry): <strong>${crPhase}</strong>`,
    `→ Top signal: <strong class="pred-top-text">${topLabel} ${vals[top]}%</strong>`
  ];
  insightEl.innerHTML = lines.join('<br>');
}
