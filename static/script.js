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
const socket = io(window.location.origin);

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

// API endpoint (update this to your server address)
const API_URL = window.location.origin;

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

// AI move function - add this new function
function makeAIMove(gameState) {
  console.log("MAKE AI MOVE CALLED", gameState);
  console.log("AI STATUS INSIDE makeAIMove:", { aiEnabled, aiThinking });
  
  // Check for required game state properties
  if (!gameState || !gameState.boards || !gameState.boardWinners || (gameState.nextBoard === undefined || gameState.nextBoard === null)) {
    console.error("INVALID GAME STATE FOR AI:", gameState);
    aiThinking = false;
    return;
  }
  
  // Remove the timer check entirely for AI mode
  // if (!aiEnabled && state.timeRemaining > 0) { ... } <-- Removed
  
  if (aiThinking) return;
  aiThinking = true;
  
  // Add a small random delay to simulate "thinking" (500-1500ms)
  setTimeout(() => {
    const aiMove = calculateBestMove(gameState);
    
    // Make the move via API (this fetch call will be intercepted in AI mode)
    fetch(`${API_URL}/move`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
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


// Medium level AI algorithm - add this new function
function calculateBestMove(gameState) {
  const availableMoves = [];
  
  // Determine which board to play on
  const boardToPlay = gameState.nextBoard === -1 ? 
    // If any board is available, collect all possible moves
    Array.from({length: 9}, (_, i) => i).filter(board => gameState.boardWinners[board] === '') :
    // Otherwise just the required board
    [gameState.nextBoard];
  
  // Collect all valid moves
  boardToPlay.forEach(boardIdx => {
    for (let cellIdx = 0; cellIdx < 9; cellIdx++) {
      if (gameState.boards[boardIdx][cellIdx] === '') {
        availableMoves.push({board: boardIdx, cell: cellIdx});
      }
    }
  });
  
  // Medium level AI logic:
  // 1. If can win a local board, do it
  // 2. If can block player from winning a local board, do it
  // 3. If can play in center of a board, do it
  // 4. If can play in a corner, do it
  // 5. Otherwise, random move
  
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
  
  // Random move
  return availableMoves[Math.floor(Math.random() * availableMoves.length)];
}

// Helper function to check if a move would win a local board - add this new function
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
  if (board[0] === symbol && board[4] === symbol && board[8] === symbol) {
    return true;
  }
  if (board[2] === symbol && board[4] === symbol && board[6] === symbol) {
    return true;
  }
  
  return false;
}


// Function to go back to landing page
function goBackToLanding() {
    // Clear intervals
    if (pollingInterval) clearInterval(pollingInterval);
    if (timerInterval) clearInterval(timerInterval);
    
    // Show landing, hide game
    document.getElementById('landing-page').style.display = 'flex';
    document.getElementById('game-page').style.display = 'none';
    
    // Clear player team
    playerTeam = '';
    localStorage.removeItem('superTTT-team');

    // Reset AI mode
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

// Handle cell click
function handleCellClick(event) {
  // Check if player has selected a team
  if (!playerTeam) {
      alert('Please select a team (X or O) first!');
      return;
  }
  
  // Get the board and cell indices from the clicked element or its parent
  let element = event.target;
  while (!element.dataset.board || !element.dataset.cell) {
      element = element.parentElement;
      if (!element) return;
  }
  
  const boardIdx = parseInt(element.dataset.board);
  const cellIdx = parseInt(element.dataset.cell);

  // Enforce the active board rule:
  // If nextBoard is not -1, then only that board is allowed.
  if (gameState && gameState.nextBoard !== -1 && boardIdx !== gameState.nextBoard) {
    alert(`Invalid move! You must play on board ${gameState.nextBoard}.`);
    return;
  }
  
  // Make the move via API
  fetch(`${API_URL}/move`, {
      method: 'POST',
      headers: {
          'Content-Type': 'application/json'
      },
      body: JSON.stringify({
          team: playerTeam,
          board: boardIdx,
          cell: cellIdx
      })
  })
  .then(response => response.json())
  .then(data => {
      if (!data.success) {
          // Show error message
          alert(data.message);
      } else {
          // Get the game state from the response
          const gameData = data.game;
          
          // Update the game display
          updateGameState(gameData);
          
          // Debug logging for AI
          console.log("AI enabled status:", aiEnabled);
          console.log("Game over status:", gameData.gameOver);
          
          // If in AI mode and player move was successful, trigger AI move
          if (aiEnabled && !gameData.gameOver) {
              console.log("ATTEMPTING AI MOVE, GAME STATE:", gameData);
              console.log("AI STATUS:", {
                  aiEnabled,
                  aiThinking,
                  gameOver: gameData.gameOver
              });
              
              // Inspect the game state structure
              console.log("GAME STATE KEYS:", Object.keys(gameData));
              
              // Check for required properties
              if (!gameData.boards) {
                  console.error("ERROR: Missing 'boards' property in game state!");
              }
              
              setTimeout(() => {
                  console.log("TRIGGERING AI MOVE NOW");
                  makeAIMove(gameData);
              }, 0);  // Delay of 0ms for immediate execution
          }
      }
  })
  .catch(error => console.error('Error:', error));
}


// Function to start a game against AI
function startAIGame() {
  // Select X for the player (AI will be O)
  selectTeamAndStart('X');
  aiEnabled = true;
  
  // Create indicator that AI mode is active
  const aiIndicator = document.createElement('div');
  aiIndicator.className = 'ai-active';
  aiIndicator.id = 'ai-indicator';
  aiIndicator.innerHTML = '<i class="fas fa-robot"></i> AI Mode Active';
  document.querySelector('.game-info').appendChild(aiIndicator);
  aiIndicator.style.display = 'block';
  
  // Hide timer elements
  const timerElement = document.getElementById('timer');
  if (timerElement) {
    timerElement.style.display = 'none';
  }
  
  const moveInfo = document.getElementById('move-info');
  if (moveInfo) {
    moveInfo.textContent = 'Playing against AI - make your move!';
  }
}

// Fetch current game state
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
    // Clear any existing interval
    if (pollingInterval) clearInterval(pollingInterval);
    
    // Poll every 2 seconds
    pollingInterval = setInterval(fetchGameState, 2000);
}

function processMove(moveData) {
  const cooldownPeriod = 2; // For testing
  
  // Enforce cooldown for non-AI moves (this block is bypassed in AI mode)
  if (!aiEnabled && !moveData.aiMove) {
      if (gameState.lastMoveTimestamp && Date.now() < gameState.lastMoveTimestamp + cooldownPeriod) {
          return { success: false, message: "Not time for the next move yet" };
      }
  }
  
  // Ensure boards are initialized
  if (!gameState.boards) {
    gameState.boards = Array.from({ length: 9 }, () => Array(9).fill(''));
  }
  // Ensure boardWinners array is initialized
  if (!gameState.boardWinners) {
    gameState.boardWinners = Array(9).fill('');
  }
  
  // Check if the chosen cell is already occupied
  if (gameState.boards[moveData.board][moveData.cell] !== '') {
    return { success: false, message: "Cell already taken" };
  }
  
  // Mark the cell with the player's symbol
  gameState.boards[moveData.board][moveData.cell] = moveData.team;
  
  // --- Inline Local Win Detection ---
  let localWinner = '';
  let board = gameState.boards[moveData.board];
  // Check rows
  for (let i = 0; i < 9; i += 3) {
    if (board[i] && board[i] === board[i + 1] && board[i] === board[i + 2]) {
      localWinner = board[i];
      break;
    }
  }
  // Check columns if no winner yet
  if (!localWinner) {
    for (let i = 0; i < 3; i++) {
      if (board[i] && board[i] === board[i + 3] && board[i] === board[i + 6]) {
        localWinner = board[i];
        break;
      }
    }
  }
  // Check diagonals if still no winner
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
  
  // --- End Inline Local Win Detection ---
  
  // Update the next board: set nextBoard to the cell index of the move.
  // If that board is already won, allow any board (-1)
  let nextBoard = moveData.cell;
  if (gameState.boardWinners[nextBoard] !== '') {
    gameState.nextBoard = -1;
  } else {
    gameState.nextBoard = nextBoard;
  }
  
  // --- Inline Global Win Detection ---
  let globalWinner = '';
  let bw = gameState.boardWinners;
  // Check rows
  for (let i = 0; i < 9; i += 3) {
    if (bw[i] && bw[i] === bw[i + 1] && bw[i] === bw[i + 2]) {
      globalWinner = bw[i];
      break;
    }
  }
  // Check columns if no winner yet
  if (!globalWinner) {
    for (let i = 0; i < 3; i++) {
      if (bw[i] && bw[i] === bw[i + 3] && bw[i] === bw[i + 6]) {
        globalWinner = bw[i];
        break;
      }
    }
  }
  // Check diagonals if still no winner
  if (!globalWinner) {
    if (bw[0] && bw[0] === bw[4] && bw[0] === bw[8]) {
      globalWinner = bw[0];
    } else if (bw[2] && bw[2] === bw[4] && bw[2] === bw[6]) {
      globalWinner = bw[2];
    }
  }
  gameState.winner = globalWinner;
  // --- End Global Win Detection ---
  
  gameState.lastMoveTimestamp = Date.now();
  return { success: true, game: gameState };
}


// Update the game state
function updateGameState(state) {
    gameState = state;
    
    // Update timer
    updateTimer(state.timeRemaining);
    
    // Update board cells
    for (let boardIdx = 0; boardIdx < 9; boardIdx++) {
        for (let cellIdx = 0; cellIdx < 9; cellIdx++) {
            const cellValue = state.boards[boardIdx][cellIdx];
            const cellContent = document.querySelector(`.cell-content[data-board="${boardIdx}"][data-cell="${cellIdx}"]`);
            if (cellContent) {
                cellContent.textContent = cellValue;
                cellContent.dataset.value = cellValue; // For styling
            }
        }
        
        // Update local board status
        const localBoard = document.querySelector(`.local-board[data-board="${boardIdx}"]`);
        if (localBoard) {
            // Remove all status classes
            localBoard.classList.remove('active', 'inactive', 'won-X', 'won-O', 'draw');
            
            // Add appropriate status classes
            const boardWinner = state.boardWinners[boardIdx];
            if (boardWinner === 'X') {
                localBoard.classList.add('won-X');
            } else if (boardWinner === 'O') {
                localBoard.classList.add('won-O');
            } else if (boardWinner === 'D') {
                localBoard.classList.add('draw');
            }
            
            // Highlight active boards
            if (state.nextBoard === -1) {
                // All available boards are active
                if (boardWinner === '') {
                    localBoard.classList.add('active');
                } else {
                    localBoard.classList.add('inactive');
                }
            } else {
                // Only the next board is active
                if (boardIdx === state.nextBoard) {
                    localBoard.classList.add('active');
                } else {
                    localBoard.classList.add('inactive');
                }
            }
        }
    }
    
    // Check for game winner
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

// Update the timer display
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
    
    // Clear existing timer interval
    if (timerInterval) {
        clearInterval(timerInterval);
    }
    
    // Start a new timer if there's time remaining
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

// Reset the game
function resetGame() {
    fetch(`${API_URL}/reset`, {
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            updateGameState(data.game);
            alert("Game has been reset!");
        }
    })
    .catch(error => console.error('Error resetting game:', error));
}

// Full reset function - clears localStorage and reloads the page
function fullReset() {
    // Clear all localStorage data
    localStorage.removeItem('superTTT-team');
    
    // Reset the game on the server
    fetch(`${API_URL}/reset`, {
        method: 'POST'
    })
    .then(() => {
        // Force reload the page
        window.location.reload(true);
    })
    .catch(error => {
        console.error('Error resetting game:', error);
        // Force reload even if the server request fails
        window.location.reload(true);
    });
}

// Check for stored team preference and auto-start game if present
window.addEventListener('load', () => {
    console.log("Window loaded, checking for saved team");
    // Uncomment the next line to always show landing page
    localStorage.removeItem('superTTT-team');
    
    const savedTeam = localStorage.getItem('superTTT-team');
    if (savedTeam) {
        console.log(`Found saved team: ${savedTeam}`);
        selectTeamAndStart(savedTeam);
    }
});

// Add floating background elements for better glassmorphism effect
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
    
    // Add floating circles
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
    
    // Add animation keyframes
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

// Function to toggle the chat window's visibility
function toggleChat() {
  var chatPopup = document.getElementById("chatPopup");
  if (chatPopup.style.display === "flex") {
    chatPopup.style.display = "none";
  } else {
    // Set the username in the chat header based on player's team
    var chatUsername = document.getElementById("chatUsername");
    chatUsername.innerText = playerTeam; // playerTeam is either "X" or "O"
    chatPopup.style.display = "flex";
  }
}

// Function to toggle the chat window's visibility
function toggleChat() {
  var chatPopup = document.getElementById("chatPopup");
  var chatUsername = document.getElementById("chatUsername");
  var chatInput = document.getElementById("chatInput");
  var chatSendBtn = document.getElementById("chatSendBtn");
  var chatMessages = document.getElementById("chatMessages");

  if (chatPopup.style.display === "flex") {
    chatPopup.style.display = "none";
  } else {
    // If a team is selected, allow chatting normally
    if (playerTeam) {
      chatUsername.innerText = playerTeam; // Displays "X" or "O"
      chatInput.disabled = false;
      chatSendBtn.disabled = false;
      
      // Optionally clear any placeholder message
      if (chatMessages.innerText === "Choose a team to enter Chat") {
        chatMessages.innerHTML = "";
      }
    } else {
      // If no team is selected, label as Guest and disable input
      chatUsername.innerText = "Guest";
      chatInput.disabled = true;
      chatSendBtn.disabled = true;
      
      // Show a placeholder message if not already present
      if (chatMessages.innerHTML.trim() === "" || chatMessages.innerText.indexOf("Choose a team") === -1) {
        chatMessages.innerHTML = "<div class='chat-message' style='font-style: italic;'>Choose a team to enter Chat</div>";
      }
    }
    chatPopup.style.display = "flex";
  }
}

// Function to send a chat message
function sendChatMessage() {
  // Only send message if playerTeam is set (input should be disabled otherwise)
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




// Call the function to add background elements when the DOM is loaded
document.addEventListener('DOMContentLoaded', addBackgroundElements);