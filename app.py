import os, json, redis
from flask import Flask, request, jsonify, render_template
from flask_socketio import SocketIO, emit
from flask_cors import CORS
from threading import Lock
import time

app = Flask(__name__)
CORS(app)

# Initialize Redis and get the URL (make sure REDIS_URL is set in your environment)
redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
r = redis.StrictRedis.from_url(redis_url, decode_responses=True, ssl=True)

# Initialize SocketIO only once using the Redis message queue and gevent async mode
socketio = SocketIO(app, async_mode='gevent', message_queue=redis_url)

game_lock = Lock()


# Game state class (unchanged)
class SuperTicTacToeGame:
    def __init__(self):
        self.boards = [['' for _ in range(9)] for _ in range(9)]
        self.board_winners = ['' for _ in range(9)]
        self.next_board = -1
        self.next_move_time = time.time()
        self.winner = ''
        self.game_over = False
        self.timer_duration = 2  # 30 seconds for testing

    def make_move(self, player_team, board_idx, cell_idx):
        if time.time() < self.next_move_time:
            return False, "Not time for the next move yet"
        symbol_to_place = player_team
        if not self.is_valid_move(board_idx, cell_idx):
            return False, "Invalid move"
        self.boards[board_idx][cell_idx] = symbol_to_place
        if self.check_local_win(board_idx, symbol_to_place):
            self.board_winners[board_idx] = symbol_to_place
            if self.check_global_win(symbol_to_place):
                self.winner = symbol_to_place
                self.game_over = True
        elif all(cell != '' for cell in self.boards[board_idx]):
            self.board_winners[board_idx] = 'D'
        self.next_board = cell_idx
        if self.board_winners[self.next_board] != '':
            self.next_board = -1
        self.next_move_time = time.time() + self.timer_duration
        return True, "Move successful"

    def is_valid_move(self, board_idx, cell_idx):
        if self.game_over:
            return False
        if self.board_winners[board_idx] != '':
            return False
        if self.boards[board_idx][cell_idx] != '':
            return False
        if self.next_board != -1 and board_idx != self.next_board:
            return False
        return True

    def check_local_win(self, board_idx, symbol):
        board = self.boards[board_idx]
        for i in range(0, 9, 3):
            if board[i] == board[i+1] == board[i+2] == symbol:
                return True
        for i in range(3):
            if board[i] == board[i+3] == board[i+6] == symbol:
                return True
        if board[0] == board[4] == board[8] == symbol:
            return True
        if board[2] == board[4] == board[6] == symbol:
            return True
        return False

    def check_global_win(self, symbol):
        winners = self.board_winners
        for i in range(0, 9, 3):
            if winners[i] == winners[i+1] == winners[i+2] == symbol:
                return True
        for i in range(3):
            if winners[i] == winners[i+3] == winners[i+6] == symbol:
                return True
        if winners[0] == winners[4] == winners[8] == symbol:
            return True
        if winners[2] == winners[4] == winners[6] == symbol:
            return True
        return False

    def to_json(self):
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

# Initialize game
game = SuperTicTacToeGame()

# Helper functions for Redis persistence
def save_game_state():
    state = game.to_json()
    r.set("game_state", json.dumps(state))
    return state

def load_game_state():
    state_str = r.get("game_state")
    if state_str:
        return json.loads(state_str)
    else:
        return game.to_json()

@app.route('/game', methods=['GET'])
def get_game():
    with game_lock:
        state = load_game_state()
        return jsonify(state)

@app.route('/move', methods=['POST'])
def make_move():
    data = request.json
    player_team = data.get('team')
    board_idx = data.get('board')
    cell_idx = data.get('cell')
    with game_lock:
        success, message = game.make_move(player_team, board_idx, cell_idx)
        state = save_game_state()
        # Broadcast update to all clients via websockets
        socketio.emit('game_update', state)
        return jsonify({
            'success': success,
            'message': message,
            'game': state
        })

@app.route('/reset', methods=['POST'])
def reset_game():
    with game_lock:
        global game
        game = SuperTicTacToeGame()
        state = save_game_state()
        return jsonify({
            'success': True,
            'game': state
        })

@app.route('/')
def home():
    return render_template('index.html')

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    socketio.run(app, host='0.0.0.0', port=port)
