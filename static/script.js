// --------------- 1) Basic Setup ---------------
const API_URL = window.location.origin;

// We'll connect to SocketIO outside, but only listen to events if multiplayer
let socket = io(API_URL, { transports: ['websocket'] });

// Game state variables
let gameState = null;
let playerTeam = '';
let pollingInterval = null;
let timerInterval = null;
let aiEnabled = false; // default off
let aiThinking = false;

console.log("Script loaded successfully");


// --------------- 2) Socket.io: Handle Events ---------------
socket.on('game_update', function(updatedState) {
  // If AI is enabled, ignore server updates so they don't overwrite local AI board
  if (!aiEnabled) {
    console.log("Received game update via SocketIO:", updatedState);
    updateGameState(updatedState);
  }
});

socket.on('chat_message', function(data) {
  // data = { username: 'X', message: 'Hello...' }
  var chatMessages = document.getElementById("chatMessages");

  // Create a new div for the incoming message
  var newMessageElem = document.createElement("div");
  newMessageElem.className = "chat-message";
  newMessageElem.innerHTML = "<strong>Team " + data.username + ":</strong> " + data.message;

  chatMessages.appendChild(newMessageElem);
  chatMessages.scrollTop = chatMessages.scrollHeight;
});

// --------------- 3) Function to override fetch in AI mode only ---------------
function enableAIFetchOverrideForAI() {
  const originalFetch = window.fetch;
  window.fetch = function(url, options) {
    // If move request in AI mode => handle locally
    if (url === `${API_URL}/move`) {
      const moveData = JSON.parse(options.body);
      moveData.aiMove = true;
      const response = processMove(moveData); 
      return Promise.resolve({
        json: () => Promise.resolve(response)
      });
    }

    // If game request => return local gameState
    if (url === `${API_URL}/game`) {
      return Promise.resolve({
        json: () => Promise.resolve(gameState)
      });
    }

    // Otherwise, pass through to the server
    return originalFetch.apply(this, arguments);
  };
}


// --------------- 4) Team Selection and Starting the Game ---------------
function selectTeamAndStart(team) {
  console.log(`selectTeamAndStart called with team ${team}`);
  playerTeam = team;
  
  const playerTeamSpan = document.getElementById('player-team');
  if (playerTeamSpan) {
      playerTeamSpan.textContent = `Team ${team}`;
      playerTeamSpan.style.color = team === 'X' ? 'var(--accent-x)' : 'var(--accent-o)';
  }
  
  localStorage.setItem('superTTT-team', team);
  
  document.getElementById('landing-page').style.display = 'none';
  document.getElementById('game-page').style.display = 'block';
  
  initGameBoard();
}

// --- (A) Multiplayer Start ---
function selectTeamAndStartMultiplayer(team) {
  aiEnabled = false; // turn off AI mode
  selectTeamAndStart(team); // sets up board
  //startPolling(); // or rely on socket updates
}

// --- (B) AI Start ---
function startAIGame() {
  aiEnabled = true;  // turn on AI
  selectTeamAndStart('X'); // user plays as X

  // Enable fetch override for AI
  enableAIFetchOverrideForAI();

  // Show the AI indicator
  const aiIndicator = document.createElement('div');
  aiIndicator.className = 'ai-active';
  aiIndicator.id = 'ai-indicator';
  aiIndicator.innerHTML = '<i class="fas fa-robot"></i> AI Mode Active';
  document.querySelector('.game-info').appendChild(aiIndicator);
  aiIndicator.style.display = 'block';
  
  // Hide the timer in AI mode (server-based timer not relevant)
  const timerElement = document.getElementById('timer');
  if (timerElement) {
    timerElement.style.display = 'none';
  }
  
  const moveInfo = document.getElementById('move-info');
  if (moveInfo) {
    moveInfo.textContent = 'Playing against AI - make your move!';
  }
}


// --------------- 5) Go back to landing page ---------------
function goBackToLanding() {
  if (pollingInterval) clearInterval(pollingInterval);
  if (timerInterval) clearInterval(timerInterval);
  
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
      alert('Please select a team (X or O) first!');
      return;
  }
  
  let element = event.target;
  while (!element.dataset.board || !element.dataset.cell) {
      element = element.parentElement;
      if (!element) return;
  }
  
  const boardIdx = parseInt(element.dataset.board);
  const cellIdx = parseInt(element.dataset.cell);

  // If AI enabled => local move only
  if (aiEnabled) {
      const result = processMove({
          team: playerTeam,
          board: boardIdx,
          cell: cellIdx
      });
      if (!result.success) {
          alert(result.message);
      } else {
          updateGameState(result.game);
          // If AI is O, let's have it move next
          if (!result.game.gameOver) {
              makeAIMove(result.game);
          }
      }
  } else {
      // MULTIPLAYER => talk to the server
      // Make sure we can only move if boardIdx matches nextBoard or nextBoard == -1
      if (gameState && gameState.nextBoard !== -1 && boardIdx !== gameState.nextBoard) {
        alert(`Invalid move! You must play on board ${gameState.nextBoard}.`);
        return;
      }

      fetch(`${API_URL}/move`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ team: playerTeam, board: boardIdx, cell: cellIdx })
      })
      .then(response => response.json())
      .then(data => {
          if (!data.success) {
              alert(data.message);
          } else {
              const gameData = data.game;
              updateGameState(gameData);
          }
      })
      .catch(error => console.error('Error:', error));
  }
}


// --------------- 8) AI Move Logic (Local) ---------------
function makeAIMove(currentState) {
  if (!aiEnabled) return;
  console.log("MAKE AI MOVE CALLED", currentState);
  if (aiThinking) return;
  aiThinking = true;
  
  setTimeout(() => {
      const aiMove = calculateBestMove(currentState);
      fetch(`${API_URL}/move`, {  // In AI mode, this is overridden => local
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
              team: 'O',
              board: aiMove.board,
              cell: aiMove.cell,
              aiMove: true
          })
      })
      .then(response => response.json())
      .then(data => {
          if (!data.success) {
              console.error('AI move failed:', data.message);
          }
          updateGameState(data.game);
          aiThinking = false;
      })
      .catch(error => {
          console.error('Error making AI move:', error);
          aiThinking = false;
      });
  }, 500 + Math.random() * 1000);
}

function calculateBestMove(gameState) {
  // Your existing AI logic...
  const availableMoves = [];
  
  const boardToPlay = gameState.nextBoard === -1 ? 
    Array.from({length: 9}, (_, i) => i).filter(board => gameState.boardWinners[board] === '') :
    [gameState.nextBoard];
  
  boardToPlay.forEach(boardIdx => {
    for (let cellIdx = 0; cellIdx < 9; cellIdx++) {
      if (gameState.boards[boardIdx][cellIdx] === '') {
        availableMoves.push({board: boardIdx, cell: cellIdx});
      }
    }
  });
  
  // Check for winning moves in local boards (O)
  for (const move of availableMoves) {
    if (willWinLocalBoard(gameState, move.board, move.cell, 'O')) {
      return move;
    }
  }
  // Check for blocking moves (X)
  for (const move of availableMoves) {
    if (willWinLocalBoard(gameState, move.board, move.cell, 'X')) {
      return move;
    }
  }
  // Prefer center
  const centerMoves = availableMoves.filter(move => move.cell === 4);
  if (centerMoves.length > 0) {
    return centerMoves[Math.floor(Math.random() * centerMoves.length)];
  }
  // Prefer corners
  const cornerMoves = availableMoves.filter(move => [0, 2, 6, 8].includes(move.cell));
  if (cornerMoves.length > 0) {
    return cornerMoves[Math.floor(Math.random() * cornerMoves.length)];
  }
  // Otherwise random
  return availableMoves[Math.floor(Math.random() * availableMoves.length)];
}

function willWinLocalBoard(gameState, boardIdx, cellIdx, symbol) {
  // your existing helper
  const board = [...gameState.boards[boardIdx]];
  board[cellIdx] = symbol;
  
  // rows
  for (let i = 0; i < 9; i += 3) {
    if (board[i] === symbol && board[i+1] === symbol && board[i+2] === symbol) {
      return true;
    }
  }
  // columns
  for (let i = 0; i < 3; i++) {
    if (board[i] === symbol && board[i+3] === symbol && board[i+6] === symbol) {
      return true;
    }
  }
  // diagonals
  if ((board[0] === symbol && board[4] === symbol && board[8] === symbol) ||
      (board[2] === symbol && board[4] === symbol && board[6] === symbol)) {
    return true;
  }
  return false;
}


// --------------- 9) Fetching / Polling for Multiplayer ---------------
function fetchGameState() {
  fetch(`${API_URL}/game`)
    .then(response => response.json())
    .then(data => {
      updateGameState(data);
    })
    .catch(error => {
      console.error('Error fetching game state:', error);
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


// --------------- 10) processMove (Local for AI) ---------------
function processMove(moveData) {
  // If local gameState is missing, create it
  if (!gameState || !gameState.boards) {
    gameState = {
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

  // A small fix to ensure cooldownPeriod is in seconds
  const cooldownPeriod = 2 * 1000; // 2 seconds in ms

  // Only apply cooldown if not AI
  if (!aiEnabled && !moveData.aiMove) {
    if (gameState.lastMoveTimestamp && (Date.now() < (gameState.lastMoveTimestamp + cooldownPeriod))) {
      return { success: false, message: "Not time for the next move yet" };
    }
  }

  // Validate cell
  if (gameState.boards[moveData.board][moveData.cell] !== '') {
    return { success: false, message: "Cell already taken" };
  }
  // Place symbol
  gameState.boards[moveData.board][moveData.cell] = moveData.team;

  // Check local board winner
  let localWinner = '';
  const board = gameState.boards[moveData.board];
  // rows
  for (let i = 0; i < 9; i += 3) {
    if (board[i] && board[i] === board[i+1] && board[i] === board[i+2]) {
      localWinner = board[i];
      break;
    }
  }
  // columns
  if (!localWinner) {
    for (let i = 0; i < 3; i++) {
      if (board[i] && board[i] === board[i+3] && board[i] === board[i+6]) {
        localWinner = board[i];
        break;
      }
    }
  }
  // diagonals
  if (!localWinner) {
    if (board[0] && board[0] === board[4] && board[0] === board[8]) {
      localWinner = board[0];
    } else if (board[2] && board[2] === board[4] && board[2] === board[6]) {
      localWinner = board[2];
    }
  }
  if (localWinner) {
    gameState.boardWinners[moveData.board] = localWinner;
  }

  // nextBoard
  const nextBoard = moveData.cell;
  if (gameState.boardWinners[nextBoard] !== '') {
    gameState.nextBoard = -1;
  } else {
    gameState.nextBoard = nextBoard;
  }

  // check global winner
  let globalWinner = '';
  const bw = gameState.boardWinners;
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
  gameState.winner = globalWinner;

  gameState.lastMoveTimestamp = Date.now();
  return { success: true, game: gameState };
}


// --------------- 11) Updating the Board on Screen ---------------
function updateGameState(state) {
  gameState = state;
  updateTimer(state.timeRemaining);

  for (let boardIdx = 0; boardIdx < 9; boardIdx++) {
    for (let cellIdx = 0; cellIdx < 9; cellIdx++) {
      const cellValue = state.boards[boardIdx][cellIdx];
      const cellContent = document.querySelector(
        `.cell-content[data-board="${boardIdx}"][data-cell="${cellIdx}"]`
      );
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
        localBoard.classList.add(
          boardIdx === state.nextBoard ? 'active' : 'inactive'
        );
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
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        updateGameState(data.game);
        alert("Game has been reset!");
      }
    })
    .catch(error => console.error('Error resetting game:', error));
}

function fullReset() {
  localStorage.removeItem('superTTT-team');
  fetch(`${API_URL}/reset`, { method: 'POST' })
    .then(() => window.location.reload(true))
    .catch(error => {
      console.error('Error resetting game:', error);
      window.location.reload(true);
    });
}

function switchToAI() {
  // We'll just go back to landing, then do startAIGame.
  goBackToLanding();
  startAIGame();
}

// --------------- 13) On Page Load: Do NOT Remove localStorage ---------------
window.addEventListener('load', () => {
  console.log("Window loaded, checking for saved team");

  // DO NOT remove the stored team
  // localStorage.removeItem('superTTT-team');  // <= This line is GONE

  const savedTeam = localStorage.getItem('superTTT-team');
  if (savedTeam) {
    console.log(`Found saved team: ${savedTeam}`);
    // If you want to auto-join multiplayer with that team:
    selectTeamAndStartMultiplayer(savedTeam);
    // Or if you'd rather do something else, you can adjust it here.
  }
});


// --------------- 14) Chat + Background (Unchanged) ---------------
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
      if (
        chatMessages.innerHTML.trim() === "" ||
        chatMessages.innerText.indexOf("Choose a team") === -1
      ) {
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
  if (message === "") return;

  // Instead of just adding locally, we emit to the server:
  socket.emit('chat_message', {
    username: playerTeam,  // or a user ID, etc.
    message: message
  });

  // Clear input
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
