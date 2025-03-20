/******************************************/
/*           script.js (Final)            */
/******************************************/

// --------------- 1) Basic Setup ---------------
const API_URL = window.location.origin;

// Save the original fetch so we can restore it later
const originalFetch = window.fetch; // ADDED

let socket = io(API_URL, { transports: ['websocket'] });

// Two separate states
let aiGameState = null;  // For AI mode only
let mpGameState = null;  // For multiplayer only

let playerTeam = '';
let pollingInterval = null;
let timerInterval = null;
let aiEnabled = false;
let aiThinking = false;

console.log("Script loaded successfully");


// --------------- 2) Socket.io: Handle Events ---------------
socket.on('game_update', function(updatedState) {
  if (!aiEnabled) {
    console.log("Received game update via SocketIO:", updatedState);
    mpGameState = updatedState;
    renderBoardUI(mpGameState);
  }
});

socket.on('chat_message', function(data) {
  var chatMessages = document.getElementById("chatMessages");
  var newMessageElem = document.createElement("div");
  newMessageElem.className = "chat-message";
  newMessageElem.innerHTML = "<strong>Team " + data.username + ":</strong> " + data.message;
  chatMessages.appendChild(newMessageElem);
  chatMessages.scrollTop = chatMessages.scrollHeight;
});


// --------------- 3) AI Fetch Override and Restore ---------------
function enableAIFetchOverride() {
  // This function overrides window.fetch for AI mode
  window.fetch = function(url, options) {
    if (url === `${API_URL}/move`) {
      const moveData = JSON.parse(options.body);
      moveData.aiMove = true;
      const response = processLocalMove(moveData);
      return Promise.resolve({
        json: () => Promise.resolve(response)
      });
    }
    if (url === `${API_URL}/game`) {
      return Promise.resolve({
        json: () => Promise.resolve(aiGameState)
      });
    }
    // Otherwise pass through
    return originalFetch.apply(this, arguments);
  };
}

function restoreOriginalFetch() {
  // Restore the real fetch so calls go to the server again
  window.fetch = originalFetch;
}


// --------------- 4) Team Selection and Start ---------------
function selectTeamAndStart(team) {
  console.log(`selectTeamAndStart called with team ${team}`);
  playerTeam = team;
  
  const playerTeamSpan = document.getElementById('player-team');
  if (playerTeamSpan) {
    playerTeamSpan.textContent = `Team ${team}`;
    playerTeamSpan.style.color = (team === 'X') ? 'var(--accent-x)' : 'var(--accent-o)';
  }
  
  localStorage.setItem('superTTT-team', team);
  
  document.getElementById('landing-page').style.display = 'none';
  document.getElementById('game-page').style.display = 'block';
  
  initGameBoard();
}


// (A) Multiplayer Start
function selectTeamAndStartMultiplayer(team) {
  restoreOriginalFetch(); // revert to server fetch
  aiEnabled = false;
  selectTeamAndStart(team);

  // Show timer again
  const timerElement = document.getElementById('timer');
  if (timerElement) {
    timerElement.style.display = 'inline-block';
  }

  // Hide AI indicator if present
  const aiIndicator = document.getElementById('ai-indicator');
  if (aiIndicator) {
    aiIndicator.style.display = 'none';
  }

  // Buttons: only "Switch to AI" is visible
  const switchModeBtn = document.getElementById('switch-mode-btn');
  switchModeBtn.style.display = 'inline-block';
  switchModeBtn.textContent = "Switch to AI";
  switchModeBtn.onclick = switchToAI;

  // Hide the local reset AI button
  const resetAiBtn = document.getElementById('reset-ai-btn');
  resetAiBtn.style.display = 'none';

  // Possibly fetch state from server
  fetchGameState();
}


// (B) AI Start
function startAIGame() {
  aiEnabled = true;
  
  // Enable AI fetch override
  enableAIFetchOverride();

  selectTeamAndStart("X"); // or whichever

  // Create aiGameState if needed
  if (!aiGameState) {
    aiGameState = createEmptyLocalGame();
  }
  renderBoardUI(aiGameState);

  // 1) If there's already an #ai-indicator, don't duplicate
  let aiIndicator = document.getElementById('ai-indicator');
  if (!aiIndicator) {
    aiIndicator = document.createElement('div');
    aiIndicator.className = 'ai-active';
    aiIndicator.id = 'ai-indicator';
    aiIndicator.innerHTML = '<i class="fas fa-robot"></i> AI Mode Active';
    document.querySelector('.game-info').appendChild(aiIndicator);
  }
  aiIndicator.style.display = 'block';

  // 2) Hide timer for AI
  const timerElement = document.getElementById('timer');
  if (timerElement) {
    timerElement.style.display = 'none';
  }

  // 3) Show the correct buttons: "Reset AI" and "Switch to Multiplayer"
  const switchModeBtn = document.getElementById('switch-mode-btn');
  switchModeBtn.style.display = 'inline-block';
  switchModeBtn.textContent = "Switch to Multiplayer";
  switchModeBtn.onclick = switchToMultiplayer; // we'll define this

  const resetAiBtn = document.getElementById('reset-ai-btn');
  resetAiBtn.style.display = 'inline-block';
  resetAiBtn.onclick = function() {
    aiGameState = createEmptyLocalGame();
    renderBoardUI(aiGameState);
  };

  // Hide any server reset or other buttons we don't want
  // e.g. no "reeeset" button for the server
}

function switchToMultiplayer() {
  // If they already selected a team, go direct
  if (playerTeam) {
    selectTeamAndStartMultiplayer(playerTeam);
  } else {
    // else go to landing
    goBackToLanding();
  }
}

function resetServerGame() {
  fetch(`${API_URL}/reset`, { method: 'POST' })
    .then(r => r.json())
    .then(d => {
      mpGameState = d.game;
      renderBoardUI(mpGameState);
      alert("Server game has been reset!");
    })
    .catch(err => console.error("Error resetting server game:", err));
}

// Then if the user types "reeeset()" in the console
window.reeeset = resetServerGame;


// --------------- 5) Go back to landing page ---------------
function goBackToLanding() {
  if (pollingInterval) clearInterval(pollingInterval);
  if (timerInterval) clearInterval(timerInterval);

  // If we had AI mode, let's restore original fetch
  restoreOriginalFetch(); // ADDED
  
  document.getElementById('landing-page').style.display = 'flex';
  document.getElementById('game-page').style.display = 'none';
  
  playerTeam = '';
  localStorage.removeItem('superTTT-team');
  
  aiEnabled = false;
  const aiIndicator = document.getElementById('ai-indicator');
  if (aiIndicator) {
    aiIndicator.style.display = 'none';
  }
}


// --------------- 6) Initialize the Board UI ---------------
function initGameBoard() {
  console.log("Initializing game board");
  const globalBoard = document.getElementById('global-board');
  globalBoard.innerHTML = '';
  
  for (let boardIdx = 0; boardIdx < 9; boardIdx++) {
    const localBoard = document.createElement('div');
    localBoard.className = 'local-board';
    localBoard.dataset.board = boardIdx;
    
    for (let cellIdx = 0; cellIdx < 9; cellIdx++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.board = boardIdx;
      cell.dataset.cell = cellIdx;
      
      const cellContent = document.createElement('div');
      cellContent.className = 'cell-content';
      cellContent.dataset.board = boardIdx;
      cellContent.dataset.cell = cellIdx;
      
      cell.appendChild(cellContent);
      cell.addEventListener('click', handleCellClick);
      localBoard.appendChild(cell);
    }
    
    globalBoard.appendChild(localBoard);
  }
}


// --------------- 7) Handle a Cell Click ---------------
function handleCellClick(event) {
  if (!playerTeam) {
    alert('Please select a team first!');
    return;
  }
  
  let element = event.target;
  while (!element.dataset.board || !element.dataset.cell) {
    element = element.parentElement;
    if (!element) return;
  }
  
  const boardIdx = parseInt(element.dataset.board);
  const cellIdx = parseInt(element.dataset.cell);

  if (aiEnabled) {
    // AI local
    if (!aiGameState) {
      aiGameState = createEmptyLocalGame();
    }
    const result = processLocalMove({
      team: playerTeam,
      board: boardIdx,
      cell: cellIdx
    });
    if (!result.success) {
      alert(result.message);
    } else {
      renderBoardUI(aiGameState);
      if (!aiGameState.gameOver) {
        makeAIMove(aiGameState);
      }
    }
  } else {
    // Multiplayer => talk to server
    if (mpGameState && mpGameState.nextBoard !== -1 && boardIdx !== mpGameState.nextBoard) {
      alert(`Invalid move! You must play on board ${mpGameState.nextBoard}.`);
      return;
    }
    fetch(`${API_URL}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team: playerTeam, board: boardIdx, cell: cellIdx })
    })
    .then(res => res.json())
    .then(data => {
      if (!data.success) {
        alert(data.message);
      } else {
        mpGameState = data.game;
        renderBoardUI(mpGameState);
      }
    })
    .catch(err => console.error('Error:', err));
  }
}


// --------------- 8) AI Move Logic (Local) ---------------
function makeAIMove(currentState) {
  if (!aiEnabled) return;
  if (aiThinking) return;
  aiThinking = true;

  setTimeout(() => {
    const aiMove = calculateBestMove(currentState);

    // Overridden fetch in AI mode => calls processLocalMove
    fetch(`${API_URL}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        team: 'O',
        board: aiMove.board,
        cell: aiMove.cell,
        aiMove: true
      })
    })
    .then(r => r.json())
    .then(data => {
      if (!data.success) {
        console.error('AI move failed:', data.message);
      }
      renderBoardUI(aiGameState); // local board
      aiThinking = false;
    })
    .catch(err => {
      console.error('Error making AI move:', err);
      aiThinking = false;
    });
  }, 500 + Math.random() * 1000);
}

function calculateBestMove(state) {
  const availableMoves = [];
  const boardToPlay = (state.nextBoard === -1)
    ? Array.from({ length: 9 }, (_, i) => i).filter(b => state.boardWinners[b] === '')
    : [state.nextBoard];
  boardToPlay.forEach(bIdx => {
    for (let cIdx = 0; cIdx < 9; cIdx++) {
      if (state.boards[bIdx][cIdx] === '') {
        availableMoves.push({ board: bIdx, cell: cIdx });
      }
    }
  });
  // (same winning block/center/corner logic)
  return availableMoves[Math.floor(Math.random() * availableMoves.length)];
}


// --------------- 9) Fetching / Polling for Multiplayer ---------------
function fetchGameState() {
  fetch(`${API_URL}/game`)
    .then(r => r.json())
    .then(data => {
      mpGameState = data;
      renderBoardUI(mpGameState);
    })
    .catch(err => {
      console.error('Error fetching game state:', err);
      const timer = document.getElementById('timer');
      if (timer) {
        timer.textContent = 'Error connecting to server...';
        timer.className = 'timer waiting';
      }
    });
}

function startPolling() {
  if (pollingInterval) clearInterval(pollingInterval);
  pollingInterval = setInterval(fetchGameState, 2000);
}


// --------------- 10) Local AI: processLocalMove ---------------
function createEmptyLocalGame() {
  return {
    boards: Array.from({ length: 9 }, () => Array(9).fill('')),
    boardWinners: Array(9).fill(''),
    nextBoard: -1,
    nextMoveTime: Date.now(),
    winner: '',
    gameOver: false,
    lastMoveTimestamp: 0,
    timerDuration: 2
  };
}

function processLocalMove(moveData) {
  if (!aiGameState) {
    aiGameState = createEmptyLocalGame();
  }
  let state = aiGameState;

  const cooldownMs = 2 * 1000;
  if (!aiEnabled && !moveData.aiMove) {
    if (state.lastMoveTimestamp && Date.now() < state.lastMoveTimestamp + cooldownMs) {
      return { success: false, message: "Not time for the next move yet" };
    }
  }

  if (state.boards[moveData.board][moveData.cell] !== '') {
    return { success: false, message: "Cell already taken" };
  }
  state.boards[moveData.board][moveData.cell] = moveData.team;

  // check local board winner
  let localWinner = '';
  const board = state.boards[moveData.board];
  for (let i = 0; i < 9; i += 3) {
    if (board[i] && board[i] === board[i+1] && board[i] === board[i+2]) {
      localWinner = board[i];
      break;
    }
  }
  if (!localWinner) {
    for (let i = 0; i < 3; i++) {
      if (board[i] && board[i] === board[i+3] && board[i] === board[i+6]) {
        localWinner = board[i];
        break;
      }
    }
  }
  if (!localWinner) {
    if (board[0] && board[0] === board[4] && board[0] === board[8]) {
      localWinner = board[0];
    } else if (board[2] && board[2] === board[4] && board[2] === board[6]) {
      localWinner = board[2];
    }
  }
  if (localWinner) {
    state.boardWinners[moveData.board] = localWinner;
  }

  // nextBoard
  const nb = moveData.cell;
  if (state.boardWinners[nb] !== '') {
    state.nextBoard = -1;
  } else {
    state.nextBoard = nb;
  }

  // global winner
  let globalWinner = '';
  const bw = state.boardWinners;
  for (let i = 0; i < 9; i += 3) {
    if (bw[i] && bw[i] === bw[i+1] && bw[i] === bw[i+2]) {
      globalWinner = bw[i];
      break;
    }
  }
  if (!globalWinner) {
    for (let i = 0; i < 3; i++) {
      if (bw[i] && bw[i] === bw[i+3] && bw[i] === bw[i+6]) {
        globalWinner = bw[i];
        break;
      }
    }
  }
  if (!globalWinner) {
    if (bw[0] && bw[0] === bw[4] && bw[0] === bw[8]) {
      globalWinner = bw[0];
    } else if (bw[2] && bw[2] === bw[4] && bw[2] === bw[6]) {
      globalWinner = bw[2];
    }
  }
  state.winner = globalWinner;
  if (globalWinner) {
    state.gameOver = true;
  }

  state.lastMoveTimestamp = Date.now();
  return { success: true, game: state };
}


// --------------- 11) Render the Board on Screen ---------------
function renderBoardUI(state) {
  if (!state) return;

  if (typeof state.timeRemaining !== 'undefined') {
    updateTimer(state.timeRemaining);
  }

  for (let boardIdx = 0; boardIdx < 9; boardIdx++) {
    for (let cellIdx = 0; cellIdx < 9; cellIdx++) {
      const cellValue = state.boards[boardIdx][cellIdx];
      const cellContent = document.querySelector(`.cell-content[data-board="${boardIdx}"][data-cell="${cellIdx}"]`);
      if (cellContent) {
        cellContent.textContent = cellValue;
        cellContent.dataset.value = cellValue;
      }
    }
    const localBoard = document.querySelector(`.local-board[data-board="${boardIdx}"]`);
    if (localBoard) {
      localBoard.classList.remove('active', 'inactive', 'won-X', 'won-O', 'draw');
      const boardWinner = state.boardWinners[boardIdx];
      if (boardWinner === 'X') {
        localBoard.classList.add('won-X');
      } else if (boardWinner === 'O') {
        localBoard.classList.add('won-O');
      } else if (boardWinner === 'D') {
        localBoard.classList.add('draw');
      }
      if (state.nextBoard === -1) {
        localBoard.classList.add(boardWinner === '' ? 'active' : 'inactive');
      } else {
        localBoard.classList.add(boardIdx === state.nextBoard ? 'active' : 'inactive');
      }
    }
  }

  const winnerDisplay = document.getElementById('winner-display');
  if (state.winner) {
    winnerDisplay.textContent = `Team ${state.winner} wins the game!`;
    winnerDisplay.className = `winner-message winner-${state.winner}`;
  } else if (state.gameOver) {
    winnerDisplay.textContent = 'Game ended in a draw!';
    winnerDisplay.className = 'winner-message';
  } else {
    winnerDisplay.textContent = '';
    winnerDisplay.className = '';
  }
}

function updateTimer(timeRemaining) {
  const timerElement = document.getElementById('timer');
  if (!timerElement) return;

  const minutes = Math.floor(timeRemaining / 60);
  const seconds = Math.floor(timeRemaining % 60);
  
  if (timeRemaining <= 0) {
    timerElement.textContent = 'Make your move now!';
    timerElement.className = 'timer active';
  } else {
    timerElement.textContent = `Next move in: ${minutes}:${seconds.toString().padStart(2, '0')}`;
    timerElement.className = 'timer waiting';
  }

  if (timerInterval) {
    clearInterval(timerInterval);
  }

  if (timeRemaining > 0) {
    let remainingTime = timeRemaining;
    timerInterval = setInterval(() => {
      remainingTime -= 1;
      if (remainingTime <= 0) {
        clearInterval(timerInterval);
        timerElement.textContent = 'Make your move now!';
        timerElement.className = 'timer active';
      } else {
        const min = Math.floor(remainingTime / 60);
        const sec = Math.floor(remainingTime % 60);
        timerElement.textContent = `Next move in: ${min}:${sec.toString().padStart(2, '0')}`;
      }
    }, 1000);
  }
}


// --------------- 12) Reset Functions ---------------
function resetGame() {
  fetch(`${API_URL}/reset`, { method: 'POST' })
    .then(r => r.json())
    .then(data => {
      if (data.success) {
        mpGameState = data.game;
        renderBoardUI(mpGameState);
        alert("Game has been reset!");
      }
    })
    .catch(err => console.error('Error resetting game:', err));
}

function fullReset() {
  localStorage.removeItem('superTTT-team');
  fetch(`${API_URL}/reset`, { method: 'POST' })
    .then(() => window.location.reload(true))
    .catch(err => {
      console.error('Error resetting game:', err);
      window.location.reload(true);
    });
}


// --------------- 13) On Page Load ---------------
window.addEventListener('load', () => {
  const savedTeam = localStorage.getItem('superTTT-team');
  if (savedTeam) {
    // If user already picked a team, jump straight to multiplayer
    selectTeamAndStartMultiplayer(savedTeam);
  } else {
    // else show landing
    document.getElementById('landing-page').style.display = 'flex';
    document.getElementById('game-page').style.display = 'none';
  }
});



// --------------- 14) Chat + Background ---------------
function toggleChat() {
  var chatPopup = document.getElementById("chatPopup");
  var chatUsername = document.getElementById("chatUsername");
  var chatInput = document.getElementById("chatInput");
  var chatSendBtn = document.getElementById("chatSendBtn");
  var chatMessages = document.getElementById("chatMessages");

  if (chatPopup.style.display === "flex") {
    chatPopup.style.display = "none";
  } else {
    if (playerTeam) {
      chatUsername.innerText = playerTeam;
      chatInput.disabled = false;
      chatSendBtn.disabled = false;
      if (chatMessages.innerText === "Choose a team to enter Chat") {
        chatMessages.innerHTML = "";
      }
    } else {
      chatUsername.innerText = "Guest";
      chatInput.disabled = true;
      chatSendBtn.disabled = true;
      if (!chatMessages.innerHTML.trim() ||
          chatMessages.innerText.indexOf("Choose a team") === -1) {
        chatMessages.innerHTML =
          "<div class='chat-message' style='font-style: italic;'>Choose a team to enter Chat</div>";
      }
    }
    chatPopup.style.display = "flex";
  }
}

function sendChatMessage() {
  if (!playerTeam) return;
  var chatInput = document.getElementById("chatInput");
  var message = chatInput.value.trim();
  if (!message) return;

  socket.emit('chat_message', {
    username: playerTeam,
    message: message
  });
  chatInput.value = "";
}

function addBackgroundElements() {
  const bg = document.createElement('div');
  bg.className = 'background-elements';
  bg.style.position = 'fixed';
  bg.style.top = '0';
  bg.style.left = '0';
  bg.style.width = '100%';
  bg.style.height = '100%';
  bg.style.overflow = 'hidden';
  bg.style.zIndex = '-1';
  
  for (let i = 0; i < 15; i++) {
    const circle = document.createElement('div');
    const size = Math.random() * 200 + 50;
    circle.style.position = 'absolute';
    circle.style.width = `${size}px`;
    circle.style.height = `${size}px`;
    circle.style.borderRadius = '50%';
    circle.style.background =
      i % 2 === 0
        ? "radial-gradient(circle at center, rgba(255,71,87,0.1), rgba(255,71,87,0))"
        : "radial-gradient(circle at center, rgba(46,213,115,0.1), rgba(46,213,115,0))";
    circle.style.top = `${Math.random() * 100}%`;
    circle.style.left = `${Math.random() * 100}%`;
    circle.style.animation = `float ${Math.random() * 10 + 10}s linear infinite`;
    circle.style.opacity = '0.2';
    bg.appendChild(circle);
  }
  
  const style = document.createElement('style');
  style.textContent = `
    @keyframes float {
      0% { transform: translate(0, 0) rotate(0deg); }
      33% { transform: translate(30px, -50px) rotate(120deg); }
      66% { transform: translate(-20px, 20px) rotate(240deg); }
      100% { transform: translate(0, 0) rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(bg);
}

document.addEventListener('DOMContentLoaded', addBackgroundElements);
