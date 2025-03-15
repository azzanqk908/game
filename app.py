import os
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from threading import Lock
import time

app = Flask(__name__)
CORS(app)

# Game state
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

# Initialize game and lock
game = SuperTicTacToeGame()
game_lock = Lock()

@app.route('/game', methods=['GET'])
def get_game():
    with game_lock:
        return jsonify(game.to_json())

@app.route('/move', methods=['POST'])
def make_move():
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
    with game_lock:
        global game
        game = SuperTicTacToeGame()
        return jsonify({
            'success': True,
            'game': game.to_json()
        })

# Serve the game interface from index.html
@app.route('/')
def home():
    return render_template('index.html')

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
