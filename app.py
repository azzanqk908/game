from flask import Flask, request, jsonify
from flask_cors import CORS
from threading import Lock
import time

app = Flask(__name__)
CORS(app)  # Enable Cross-Origin Resource Sharing

# Game state
class SuperTicTacToeGame:
    def __init__(self):
        # Initialize 9 local boards, each with 9 cells
        self.boards = [['' for _ in range(9)] for _ in range(9)]
        
        # Track which local boards have been won
        self.board_winners = ['' for _ in range(9)]
        
        # Track which local board must be played next (-1 means any board)
        self.next_board = -1
        
        # Track when the next move is available
        self.next_move_time = time.time()
        
        # Track the game winner
        self.winner = ''
        
        # Track if the game is over
        self.game_over = False

        # Test mode - timer duration in seconds (change to 300 for 5 minutes)
        self.timer_duration = 2  # 30 seconds for testing

    def make_move(self, player_team, board_idx, cell_idx):
        """Attempt to make a move on the specified board and cell."""
        # Check if it's time for the next move
        if time.time() < self.next_move_time:
            return False, "Not time for the next move yet"
        
        # Now player_team represents the actual mark they want to place (X or O)
        # No alternating - whichever team clicks first gets to place their mark
        symbol_to_place = player_team
        
        # Check if the move is valid
        if not self.is_valid_move(board_idx, cell_idx):
            return False, "Invalid move"
        
        # Make the move using the player's team as the symbol
        self.boards[board_idx][cell_idx] = symbol_to_place
        
        # Check if the move wins the local board
        if self.check_local_win(board_idx, symbol_to_place):
            self.board_winners[board_idx] = symbol_to_place
            
            # Check if the global game is won
            if self.check_global_win(symbol_to_place):
                self.winner = symbol_to_place
                self.game_over = True
        
        # Check if the local board is full (draw)
        elif all(cell != '' for cell in self.boards[board_idx]):
            self.board_winners[board_idx] = 'D'  # 'D' for draw
        
        # Determine the next board to play
        self.next_board = cell_idx
        
        # If the next board is already won or full, allow play on any board
        if self.board_winners[self.next_board] != '':
            self.next_board = -1
        
        # Set the next move time
        self.next_move_time = time.time() + self.timer_duration
        
        return True, "Move successful"

    def is_valid_move(self, board_idx, cell_idx):
        """Check if a move is valid."""
        # Game is over
        if self.game_over:
            return False
        
        # Board is already won
        if self.board_winners[board_idx] != '':
            return False
        
        # Cell is already occupied
        if self.boards[board_idx][cell_idx] != '':
            return False
        
        # Must play on the specific board
        if self.next_board != -1 and board_idx != self.next_board:
            return False
        
        return True
    
    def check_local_win(self, board_idx, symbol):
        """Check if the given symbol has won the local board."""
        board = self.boards[board_idx]
        player = symbol
        
        # Check rows
        for i in range(0, 9, 3):
            if board[i] == board[i+1] == board[i+2] == player:
                return True
        
        # Check columns
        for i in range(3):
            if board[i] == board[i+3] == board[i+6] == player:
                return True
        
        # Check diagonals
        if board[0] == board[4] == board[8] == player:
            return True
        if board[2] == board[4] == board[6] == player:
            return True
        
        return False
    
    def check_global_win(self, symbol):
        """Check if the given symbol has won the global game."""
        winners = self.board_winners
        player = symbol
        
        # Check rows
        for i in range(0, 9, 3):
            if winners[i] == winners[i+1] == winners[i+2] == player:
                return True
        
        # Check columns
        for i in range(3):
            if winners[i] == winners[i+3] == winners[i+6] == player:
                return True
        
        # Check diagonals
        if winners[0] == winners[4] == winners[8] == player:
            return True
        if winners[2] == winners[4] == winners[6] == player:
            return True
        
        return False
    
    def to_json(self):
        """Convert the game state to a JSON-serializable dict."""
        return {
            'boards': self.boards,
            'boardWinners': self.board_winners,
            'nextBoard': self.next_board,
            'nextMoveTime': self.next_move_time,
            'winner': self.winner,
            'gameOver': self.game_over,
            'timeRemaining': max(0, self.next_move_time - time.time()),
            'timerDuration': self.timer_duration
        }

# Create and initialize the game
game = SuperTicTacToeGame()
game_lock = Lock()  # Lock for thread-safe operations

@app.route('/game', methods=['GET'])
def get_game():
    """Return the current game state."""
    with game_lock:
        return jsonify(game.to_json())

@app.route('/move', methods=['POST'])
def make_move():
    """Make a move in the game."""
    data = request.json
    player_team = data.get('team')
    board_idx = data.get('board')
    cell_idx = data.get('cell')
    
    with game_lock:
        success, message = game.make_move(player_team, board_idx, cell_idx)
        
        return jsonify({
            'success': success,
            'message': message,
            'game': game.to_json()
        })

@app.route('/reset', methods=['POST'])
def reset_game():
    """Reset the game."""
    with game_lock:
        global game
        game = SuperTicTacToeGame()
        return jsonify({
            'success': True,
            'game': game.to_json()
        })

@app.route('/')
def hello():
    """Simple route to test if the server is running."""
    return "Super Tic-Tac-Toe Server is running!"

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)