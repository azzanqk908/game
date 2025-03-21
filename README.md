# Super Tic-Tac-Toe

A modern twist on Tic-Tac-Toe with time-based moves, multiplayer functionality, and an AI mode for single-player. Built with Flask, Socket.IO, and Redis for real-time updates.

## Table of Contents
- [Overview](#overview)
- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Usage](#usage)
  - [Running Locally](#running-locally)
  - [Deploying](#deploying)
- [Configuration](#configuration)
- [How It Works](#how-it-works)
  - [Server-Side Logic](#server-side-logic)
  - [Client-Side Logic](#client-side-logic)
- [Known Issues or Limitations](#known-issues-or-limitations)
- [Contributing](#contributing)
- [License](#license)

## Overview

Super Tic-Tac-Toe expands the classic game into a 9-board (3×3) grid, where each local board's position dictates which board the next player must play on.
- Players can choose Team X or Team O and compete in real time, or play against an AI locally.
- A timer ensures only the fastest click at the start of each turn is accepted (time-based, not strictly turn-based).

This repository contains:

- Python Flask backend using Socket.IO (via flask_socketio) and Redis for game state persistence.
- JavaScript front-end that handles rendering, AI logic, and real-time updates.
- HTML/CSS for the UI.

## Features

### Multiplayer Mode

- Shared online game board.
- A timer to throttle moves.
- Real-time updates via Socket.IO.
- Automatic reset 30 seconds after a winner is detected (configurable).

### AI Mode

- Completely local (client-side) AI.
- No timer constraints by default.
- A basic to intermediate AI that prioritizes blocking and winning moves.

### Chat System

- Built-in chat window using Socket.IO.
- Real-time messages across all connected players.

### Player Count

- Shows how many players are currently connected.

### Auto-Reset

- If a team wins, a 30-second countdown triggers an automatic reset.

## Requirements

- Python 3.7+
- Redis (local or remote)
- A deployed environment (Heroku, Docker, or your own server) or local Python environment.
- Environment variables:
  - `REDIS_URL` – The URL for your Redis database (e.g., `redis://localhost:6379/0`).

## Installation

1. Clone this repository:

```bash
git clone https://github.com/YourUsername/SuperTicTacToe.git
cd SuperTicTacToe
```

2. Create a virtual environment (optional but recommended):

```bash
python -m venv venv
source venv/bin/activate  # on Linux/Mac
venv\Scripts\activate     # on Windows
```

3. Install dependencies:

```bash
pip install -r requirements.txt
```
Make sure `flask`, `flask_socketio`, `redis`, `gevent` (or `eventlet`), and `flask_cors` are included.

4. Ensure Redis is running (if local). If using a remote host, set `REDIS_URL` accordingly.

## Usage

### Running Locally

1. Set environment variables (example):

```bash
export REDIS_URL="redis://localhost:6379/0"
```

2. Start the Flask server:

```bash
python app.py
```
By default, it might run on http://127.0.0.1:5000/.

3. Open your browser at http://localhost:5000.

4. Select a team or choose AI mode to start playing.
   - In multiplayer, you can open multiple browser windows or share the URL with others to see real-time moves.

### Deploying

#### Heroku:
- Provide a Procfile or use a Docker container.
- Set `REDIS_URL` to a Heroku Redis add-on or your custom Redis.

#### Docker:
- Build your image with a Dockerfile, set environment variables, and run.

#### Other Cloud (AWS, GCP, etc.):
- Ensure you install Redis or connect to a managed Redis instance.
- Set your environment variables for `REDIS_URL`.

## Configuration

Key settings in `app.py` or your environment:

- `timer_duration` in the `SuperTicTacToeGame` class sets how many seconds pass before a move can be made again (and how long each turn is).
- `auto_reset_game()` triggers the reset after a win (30 seconds by default).
- `REDIS_URL` sets up your Redis connection for game state.

## How It Works

### Server-Side Logic

**`/move` endpoint:**
- Restores game state from Redis.
- Validates the move, updates boards, checks winners, updates `next_move_time`.
- Saves updated state to Redis and emits `game_update`.

**`/game` endpoint:**
- Restores state from Redis.
- Returns a fresh JSON with `timeRemaining = max(0, next_move_time - time.time())`.
- Saves that leftover time to Redis again (to avoid stale leftover on refresh).

**`auto_reset_game()`:**
- Called by a threading timer after a winner is found.
- Creates a new `SuperTicTacToeGame()`, saves state, emits `game_reset`.

### Client-Side Logic

**Multiplayer:**
- Listens for `game_update` or `game_reset` via Socket.IO.
- Renders boards, timers, and chat messages in real time.

**AI Mode:**
- Local logic overrides fetch calls to `/move`.
- Processes moves in `processLocalMove()` and runs basic AI.

## Known Issues or Limitations

<!-- Add any known issues or limitations here -->

## Contributing

<!-- Add contribution guidelines here -->

## License

<!-- Add license information here -->