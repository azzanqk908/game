// Declare API_URL first so it’s available in all code below
const API_URL = window.location.origin;

// Override window.fetch to intercept certain calls (for AI mode)
const originalFetch = window.fetch;
window.fetch = function(url, options) {
  console.log("FETCH REQUEST:", arguments);
  
  // If this is a move request and AI mode is enabled, intercept it
  if (url === `${API_URL}/move` && aiEnabled) {
    const moveData = JSON.parse(options.body);
    // Ensure the aiMove flag is set
    moveData.aiMove = true;
    const response = processMove(moveData);  // Process move locally, bypassing timer
    console.log("Simulated AI move response:", response);
    return Promise.resolve({
      json: () => Promise.resolve(response)
    });
  }
  
  // If this is a game state request and AI mode is enabled, return our local gameState
  if (url === `${API_URL}/game` && aiEnabled) {
    return Promise.resolve({
      json: () => Promise.resolve(gameState)
    });
  }
  
  // Otherwise, use the original fetch
  return originalFetch.apply(this, arguments).then(response => {
    response.clone().json().then(data => {
      console.log("FETCH RESPONSE:", data);
    }).catch(e => {});
    return response;
  });
};

// Connect to the SocketIO server
const socket = io(API_URL, { transports: ['websocket'] });

// Listen for real-time game updates
socket.on('game_update', function(gameState) {
    console.log("Received game update via SocketIO:", gameState);
    updateGameState(gameState);
});

// Game state variables
let gameState = null;
let playerTeam = '';
let pollingInterval = null;
let timerInterval = null;
let aiEnabled = false;
let aiThinking = false;

console.log("Script loaded successfully");


// Function to select team and start game
function selectTeamAndStart(team) {
    console.log(`selectTeamAndStart called with team ${team}`);
    playerTeam = team;
    
    // Update display
    const playerTeamSpan = document.getElementById('player-team');
    if (playerTeamSpan) {
        playerTeamSpan.textContent = `Team ${team}`;
        playerTeamSpan.style.color = team === 'X' ? 'var(--accent-x)' : 'var(--accent-o)';
    }
    
    // Store in localStorage
    localStorage.setItem('superTTT-team', team);
    
    // Hide landing, show game
    document.getElementById('landing-page').style.display = 'none';
    document.getElementById('game-page').style.display = 'block';
    
    // Initialize the game board
    initGameBoard();
    
    // Start fetching game state
    //fetchGameState();
    //startPolling();
}

// AI move function
function makeAIMove(gameState) {
  console.log("MAKE AI MOVE CALLED", gameState);
  console.log("AI STATUS INSIDE makeAIMove:", { aiEnabled, aiThinking });
  
  // Check for required game state properties
  if (!gameState || !gameState.boards || !gameState.boardWinners || 
      (gameState.nextBoard === undefined || gameState.nextBoard === null)) {
    console.error("INVALID GAME STATE FOR AI:", gameState);
    aiThinking = false;
    return;
  }
  
  if (aiThinking) return;
  aiThinking = true;
  
  // Add a small random delay to simulate "thinking"
  setTimeout(() => {
    const aiMove = calculateBestMove(gameState);
    
    // Make the move via API (this fetch call will be intercepted in AI mode)
    fetch(`${API_URL}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        team: 'O',  // AI is always O
        board: aiMove.board,
        cell: aiMove.cell,
        aiMove: true  // flag indicating this move is from AI mode
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

// Medium level AI algorithm
function calculateBestMove(gameState) {
  const availableMoves = [];
  
  // Determine which board to play on
  const boardToPlay = gameState.nextBoard === -1 ? 
    Array.from({length: 9}, (_, i) => i).filter(board => gameState.boardWinners[board] === '') :
    [gameState.nextBoard];
  
  // Collect all valid moves
  boardToPlay.forEach(boardIdx => {
    for (let cellIdx = 0; cellIdx < 9; cellIdx++) {
      if (gameState.boards[boardIdx][cellIdx] === '') {
        availableMoves.push({board: boardIdx, cell: cellIdx});
      }
    }
  });
  
  // Check for winning moves in local boards
  for (const move of availableMoves) {
    if (willWinLocalBoard(gameState, move.board, move.cell, 'O')) {
      return move;
    }
  }
  
  // Check for blocking moves
  for (const move of availableMoves) {
    if (willWinLocalBoard(gameState, move.board, move.cell, 'X')) {
      return move;
    }
  }
  
  // Prefer center moves
  const centerMoves = availableMoves.filter(move => move.cell === 4);
  if (centerMoves.length > 0) {
    return centerMoves[Math.floor(Math.random() * centerMoves.length)];
  }
  
  // Prefer corner moves
  const cornerMoves = availableMoves.filter(move => [0, 2, 6, 8].includes(move.cell));
  if (cornerMoves.length > 0) {
    return cornerMoves[Math.floor(Math.random() * cornerMoves.length)];
  }
  
  // Random move as fallback
  return availableMoves[Math.floor(Math.random() * availableMoves.length)];
}

// Helper to check if a move would win a local board
function willWinLocalBoard(gameState, boardIdx, cellIdx, symbol) {
  const board = [...gameState.boards[boardIdx]];
  board[cellIdx] = symbol;
  
  // Check rows
  for (let i = 0; i < 9; i += 3) {
    if (board[i] === symbol && board[i + 1] === symbol && board[i + 2] === symbol) {
      return true;
    }
  }
  
  // Check columns
  for (let i = 0; i < 3; i++) {
    if (board[i] === symbol && board[i + 3] === symbol && board[i + 6] === symbol) {
      return true;
    }
  }
  
  // Check diagonals
  if ((board[0] === symbol && board[4] === symbol && board[8] === symbol) ||
      (board[2] === symbol && board[4] === symbol && board[6] === symbol)) {
    return true;
  }
  
  return false;
}

// Function to go back to landing page
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

// Initialize the game board
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

// Handle cell click event
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
          console.log("AI enabled status:", aiEnabled);
          console.log("Game over status:", gameData.gameOver);
          
          if (aiEnabled && !gameData.gameOver) {
              console.log("ATTEMPTING AI MOVE, GAME STATE:", gameData);
              setTimeout(() => {
                  console.log("TRIGGERING AI MOVE NOW");
                  makeAIMove(gameData);
              }, 0);
          }
      }
  })
  .catch(error => console.error('Error:', error));
}

// Function to start a game against AI
function startAIGame() {
  selectTeamAndStart('X'); // Player is X; AI will be O
  aiEnabled = true;
  
  const aiIndicator = document.createElement('div');
  aiIndicator.className = 'ai-active';
  aiIndicator.id = 'ai-indicator';
  aiIndicator.innerHTML = '<i class="fas fa-robot"></i> AI Mode Active';
  document.querySelector('.game-info').appendChild(aiIndicator);
  aiIndicator.style.display = 'block';
  
  const timerElement = document.getElementById('timer');
  if (timerElement) {
    timerElement.style.display = 'none';
  }
  
  const moveInfo = document.getElementById('move-info');
  if (moveInfo) {
    moveInfo.textContent = 'Playing against AI - make your move!';
  }
}

// Fetch current game state from the server
function fetchGameState() {
  fetch(`${API_URL}/game`)
    .then(response => response.json())
    .then(data => {
      updateGameState(data);
    })
    .catch(error => {
      console.error('Error fetching game state:', error);
      document.getElementById('timer').textContent = 'Error connecting to server...';
      document.getElementById('timer').className = 'timer waiting';
    });
}

// Start polling for game state updates
function startPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(fetchGameState, 2000);
}

function processMove(moveData) {
  const cooldownPeriod = 2; // For testing
  
  if (!aiEnabled && !moveData.aiMove) {
      if (gameState.lastMoveTimestamp && Date.now() < gameState.lastMoveTimestamp + cooldownPeriod) {
          return { success: false, message: "Not time for the next move yet" };
      }
  }
  
  if (!gameState.boards) {
    gameState.boards = Array.from({ length: 9 }, () => Array(9).fill(''));
  }
  if (!gameState.boardWinners) {
    gameState.boardWinners = Array(9).fill('');
  }
  
  if (gameState.boards[moveData.board][moveData.cell] !== '') {
    return { success: false, message: "Cell already taken" };
  }
  
  gameState.boards[moveData.board][moveData.cell] = moveData.team;
  
  // Inline Local Win Detection
  let localWinner = '';
  let board = gameState.boards[moveData.board];
  for (let i = 0; i < 9; i += 3) {
    if (board[i] && board[i] === board[i + 1] && board[i] === board[i + 2]) {
      localWinner = board[i];
      break;
    }
  }
  if (!localWinner) {
    for (let i = 0; i < 3; i++) {
      if (board[i] && board[i] === board[i + 3] && board[i] === board[i + 6]) {
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
    gameState.boardWinners[moveData.board] = localWinner;
  }
  
  // Update next board selection
  let nextBoard = moveData.cell;
  gameState.nextBoard = (gameState.boardWinners[nextBoard] !== '') ? -1 : nextBoard;
  
  // Inline Global Win Detection
  let globalWinner = '';
  let bw = gameState.boardWinners;
  for (let i = 0; i < 9; i += 3) {
    if (bw[i] && bw[i] === bw[i + 1] && bw[i] === bw[i + 2]) {
      globalWinner = bw[i];
      break;
    }
  }
  if (!globalWinner) {
    for (let i = 0; i < 3; i++) {
      if (bw[i] && bw[i] === bw[i + 3] && bw[i] === bw[i + 6]) {
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

// Update the game state on the page
function updateGameState(state) {
    gameState = state;
    
    updateTimer(state.timeRemaining);
    
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

// Update timer display
function updateTimer(timeRemaining) {
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = Math.floor(timeRemaining % 60);
    const timerElement = document.getElementById('timer');
    
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

// Reset game function
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

// Full reset: clear localStorage and reload
function fullReset() {
    localStorage.removeItem('superTTT-team');
    fetch(`${API_URL}/reset`, { method: 'POST' })
    .then(() => window.location.reload(true))
    .catch(error => {
        console.error('Error resetting game:', error);
        window.location.reload(true);
    });
}

// Check for stored team preference on load
window.addEventListener('load', () => {
    console.log("Window loaded, checking for saved team");
    localStorage.removeItem('superTTT-team');
    const savedTeam = localStorage.getItem('superTTT-team');
    if (savedTeam) {
        console.log(`Found saved team: ${savedTeam}`);
        selectTeamAndStart(savedTeam);
    }
});

// Add floating background elements for glassmorphism effect
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
        circle.style.background = i % 2 === 0 ? 
            'radial-gradient(circle at center, rgba(255,71,87,0.1), rgba(255,71,87,0))' : 
            'radial-gradient(circle at center, rgba(46,213,115,0.1), rgba(46,213,115,0))';
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

// Function to toggle the chat window's visibility (only one definition)
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
      if (chatMessages.innerHTML.trim() === "" || chatMessages.innerText.indexOf("Choose a team") === -1) {
        chatMessages.innerHTML = "<div class='chat-message' style='font-style: italic;'>Choose a team to enter Chat</div>";
      }
    }
    chatPopup.style.display = "flex";
  }
}

// Function to send a chat message
function sendChatMessage() {
  if (!playerTeam) return;
  var chatInput = document.getElementById("chatInput");
  var message = chatInput.value.trim();
  if (message === "") return;
  var chatMessages = document.getElementById("chatMessages");
  var newMessageElem = document.createElement("div");
  newMessageElem.className = "chat-message";
  newMessageElem.innerHTML = "<strong>Team " + playerTeam + ":</strong> " + message;
  chatMessages.appendChild(newMessageElem);
  chatInput.value = "";
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Add background elements on DOM load
document.addEventListener('DOMContentLoaded', addBackgroundElements);
