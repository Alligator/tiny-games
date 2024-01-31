import { Game, GameState } from './gamelib.js';

const paddleHeight = 20;
const ballSize = 4;

let w = 0;
let h = 0;

let paddleY: number;

let ballX: number;
let ballY: number;
let ballSpeed = 1.5;
let ballSpeedX = ballSpeed;
let ballSpeedY = ballSpeed * 0.5;

let bricks: { x: number, y: number }[] = [];
let level = 1;

const STATE_INIT = 0;
const STATE_GAME = 1;
const STATE_GAMEOVER = 2;
const STATE_WIN = 3;
let state = STATE_INIT;

class State implements GameState {
  ticks = 0;
  onEnter(g: Game): void {
    w = g.width;
    h = g.height;
  }

  newGame() {
    paddleY = h/2 - paddleHeight/2;
    ballX = w/2 - ballSize/2;
    ballY = h/2 - ballSize/2;
    let brickRows;

    switch (level) {
      case 1:
        brickRows = 2;
        break;
      case 2:
        brickRows = 3;
        break;
      case 3:
        brickRows = 4;
        break;
      case 4:
        brickRows = 5;
        break;
      default:
        brickRows = 5;
        ballSpeed = 2 * (level/6);
        break;
    }

    ballSpeedX = ballSpeed;
    ballSpeedY = ballSpeed * 0.5;

    bricks = [];
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < brickRows; j++) {
        bricks.push({ x: 99 + j * 6,  y: 1 + (i/8) * h });
      }
    }
  }

  update(g: Game) {
    if (state == STATE_INIT) {
      if (g.isKeyDown('j')) {
        state = STATE_GAME;
        this.newGame();
      }
      return;
    }

    if (state == STATE_GAMEOVER) {
      if (g.isKeyDown('j')) {
        level = 1;
        state = STATE_GAME;
        this.newGame();
      }
      return;
    }

    if (state == STATE_WIN) {
      if (g.isKeyDown('j')) {
        state = STATE_GAME;
        this.newGame();
      }
      return
    }

    if (bricks.length === 0) {
      state = STATE_WIN;
      level++;
      return;
    }

    if (g.isKeyDown('up')) {
      paddleY -= 2;
    } else if (g.isKeyDown('down')) {
      paddleY += 2;
    }

    if (paddleY < 1) {
      paddleY = 1;
    }
    if (paddleY + paddleHeight > h - 1) {
      paddleY = h - paddleHeight - 1;
    }

    if (ballX + ballSize > w || ballX <= 0) {
      ballX = Math.max(Math.min(ballX, w - ballSize), 0);
      ballSpeedX = -ballSpeedX;
    }
    if (ballY + ballSize > h || ballY <= 0) {
      ballY = Math.max(Math.min(ballY, h - ballSize), 0);
      ballSpeedY = -ballSpeedY;
    }

    ballX += ballSpeedX;
    ballY += ballSpeedY;

    if (g.collision(
      ballX - 2, ballY - 2, ballX + 2, ballY + 2,
      7, paddleY, 8, paddleY + paddleHeight)) {
      ballSpeedX = -ballSpeedX;
      if (ballY < paddleY + paddleHeight * 0.25) {
        // top quarter
        ballSpeedY = -ballSpeed * 0.75;
      } else if (ballY < paddleY + paddleHeight / 2) {
        // second quarter
        ballSpeedY = -ballSpeed * 0.5;
      } else if (ballY < paddleY + paddleHeight * 0.75) {
        // third quarter
        ballSpeedY = ballSpeed * 0.5;
      } else {
        // bottom quarter
        ballSpeedY = ballSpeed * 0.75;
      }
    }

    if (ballX === 0) {
      state = STATE_GAMEOVER
    }

    if (ballX >= 90) {
      for (const brick of bricks) {
        const collides = g.collision(
          ballX - 2, ballY - 2, ballX + 2, ballY + 2,
          brick.x, brick.y, brick.x + 4, brick.y + 10,
        );
        if (collides) {
          ballSpeedX = -ballSpeedX;
          bricks = bricks.filter(b => b.x !== brick.x || b.y !== brick.y);
          break;
        }
      }
    }
  }

  render(g: Game) {
    if (state == STATE_INIT) {
      g.text('press j to start', w / 2, h / 2, 'center', 'middle');
      return;
    }

    if (state == STATE_GAMEOVER) {
      g.clear();
      g.text('game over', w / 2, h / 2 - 8, 'center', 'middle', 'shadow');
      g.text('press j to restart', w / 2, h / 2 + 8, 'center', 'middle', 'shadow');
      return;
    }

    if (state === STATE_WIN) {
      g.clear();
      g.text('you win!', w / 2, h / 2 - 8, 'center', 'middle', 'shadow');
      g.text('press j to start', w / 2, h / 2 + 8, 'center', 'middle', 'shadow');
      g.text(`level ${level}`, w / 2, h / 2 + 16, 'center', 'middle', 'shadow');
      return;
    }

    g.clear();
    g.rect(5, paddleY, 2, paddleHeight, true);
    g.circle(ballX, ballY, 2, false);
    g.text(`level ${level}`, w / 2, 2, 'center', 'top');

    for (const brick of bricks) {
      g.rect(brick.x, brick.y, 4, 10, false);
    }
  }


  onExit(g: Game): void {
    throw new Error('Method not implemented.');
  }
}

export function load() {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  return new Game(canvas, new State());
};