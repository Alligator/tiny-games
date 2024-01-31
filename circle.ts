import { Game, GameState } from './gamelib.js';

const size = 40;
const scoreThreshold = 3;
const maxScore = (size / 8) * 4 * scoreThreshold;

let w = 0;
let h = 0;
let points: { x: number, y: number }[] = [];
let ticks = 0;
let rotation = 0;
let closestPoint = 0;

let hammering = false;
let timer = 0;
let score = 0;

const STATE_GAME = 0;
const STATE_EVALUATE = 1;
const STATE_GAMEOVER = 2;
const STATE_IDLE = 3;
const STATE_INSTRUCTIONS = 4;
let state = STATE_IDLE;

let pointToEvaluate = 0;
let avgDistance = 0;
let instrTicksLeft = 100;

class State implements GameState {
  ticks = 0;

  onEnter(g: Game) {
    w = g.width;
    h = g.height;
    this.newGame();
  }

  onExit(g: Game): void {
  }

  newGame() {
    const topSide = [];
    const rightSide = [];
    const bottomSide = [];
    const leftSide = [];

    for (let i = 0; i < size; i += 8) {
      topSide.push({ x: i, y: 0 });
      rightSide.push({ x: size, y: i });
      bottomSide.push({ x: size - i, y: size });
      leftSide.push({ x: 0, y: size - i });
    }

    points = [...topSide, ...rightSide, ...bottomSide, ...leftSide];
    timer = 30;
    score = 0;
    rotation = 0;
    closestPoint = 0;
    hammering = false;
  }

  calcAverageDistance() {
    const cx = size / 2;
    const cy = size / 2;
    const distances = [];
    for (const point of points) {
      const distToCenter = Math.sqrt(Math.pow(point.x - cx, 2) + Math.pow(point.y - cy, 2))
      distances.push(distToCenter);
    }
    avgDistance = distances.reduce((acc, val) => acc + val, 0) / distances.length;
  }

  update(g: Game) {
    if (state === STATE_IDLE) {
      rotation += 0.01;
      ticks++;
      if (g.isKeyDown('j')) {
        state = STATE_INSTRUCTIONS;
      }
      return;
    }

    if (state == STATE_INSTRUCTIONS) {
      instrTicksLeft--;
      ticks++;
      if (instrTicksLeft <= 0) {
        state = STATE_GAME;
        this.newGame();
      }
      return;
    }

    if (state === STATE_EVALUATE) {
      if (ticks % 4 === 0) {
        const point = points[points.length - pointToEvaluate - 1];
        const cx = size / 2;
        const cy = size / 2;
        const distToCenter = Math.sqrt(Math.pow(point.x - cx, 2) + Math.pow(point.y - cy, 2))
        const diff = Math.abs(distToCenter - avgDistance);
        score += scoreThreshold - Math.round(diff);
        pointToEvaluate++;
      }

      if (pointToEvaluate >= points.length) {
        console.log(Math.round((Math.max(score, 0)/maxScore)*10));
        state = STATE_GAMEOVER
      }

      ticks++;
      return;
    }

    if (state == STATE_GAMEOVER) {
      rotation += 0.02;
      ticks++;
      if (g.isKeyDown('j')) {
        state = STATE_GAME;
        this.newGame();
        // hack to discard this keypress when the game starts
        hammering = true;
      }
      return;
    }

    if (g.isKeyDown('j') && !hammering) {
      hammering = true;
      const point = points[closestPoint];
      const cx = size/2;
      const cy = size/2;
      const distToCenter = Math.sqrt(Math.pow(point.x - cx, 2) + Math.pow(point.y - cy, 2))
      const movePointBy = 1;
      const newx = point.x - (movePointBy * (point.x - cx)) / distToCenter;
      const newy = point.y - (movePointBy * (point.y - cy)) / distToCenter;
      point.x = newx;
      point.y = newy;
    }

    if (!g.isKeyDown('j')) {
      hammering = false;
    }

    timer -= g.updateRate / 1000;

    if (timer <= 0) {
      timer = 0;
      state = STATE_EVALUATE;
      this.calcAverageDistance();
      pointToEvaluate = 0;
    }

    ticks++;
    rotation += 0.02;
  }

  render(g: Game) {
    g.clear();

    if (state == STATE_INSTRUCTIONS) {
      g.text('make a circle', w/2, h/2, 'center', 'middle');
      return;
    }

    g.translate(w/2, h/2);
    g.rotate(rotation);

    closestPoint = 0;
    let closest = Infinity;
    let prevPoint: { x: number, y: number } | null = null;

    const transformedPoints = points.map(p => g.transformPoint(p.x - size/2, p.y - size/2));
    g.resetTransform();
    for (let i = 0; i < points.length; i++) {
      const p = transformedPoints[i];
      // const px = point.x - size/2;
      // const py = point.y - size/2;
      // const p = g.transformPoint(px, py);
      const dist = Math.abs(p.x - w/2);
      if (dist < closest && p.y > h/2) {
        closest = dist;
        closestPoint = i;
      }

      if (prevPoint) {
        g.line(prevPoint.x, prevPoint.y, p.x, p.y);
        // g.rect(Math.round(px) + 0.5, Math.round(py) + 0.5, 1, 1);
      }

      prevPoint = p;
    }

    // connect the last two points
    if (prevPoint) {
      const point = transformedPoints[0];
      g.line(prevPoint.x, prevPoint.y, point.x, point.y);
    }

    if (state === STATE_GAME) {
        const closest = points[closestPoint];
        g.translate(w/2, h/2);
        g.rotate(rotation);
        const p = g.transformPoint(closest.x - size/2, closest.y - size/2);
        g.resetTransform();
        if (hammering) {
          g.rect(w/2 - 1, Math.floor(p.y) + 2, 2, 8, true);
        } else {
          g.rect(w/2 - 1, h - 14, 2, 8, true);
        }
      // g.rect(Math.round(points[closestPoint].x - size/2) + 0.5, Math.round(points[closestPoint].y - size/2) + 0.5, 2, 2);
    }

    if (state === STATE_EVALUATE) {
      g.translate(w / 2, h / 2);
      g.rotate(rotation);

      const point = points[pointToEvaluate];
      const px = point.x - size/2;
      const py = point.y - size/2;
      const p = g.transformPoint(px, py);
      g.rect(Math.round(px) -1, Math.round(py) - 1, 2, 2);

      g.resetTransform();

      g.line(p.x, p.y, w/2, h/2);
      g.text(`score ${score}`, w/2, h - 2, 'center', 'bottom');
    }

    if (state === STATE_IDLE) {
      g.translate(w / 2, h / 2);
      g.rotate(rotation);
      g.text('circled', 0, -10, 'center', 'top');
      g.text('square', 0, 10, 'center', 'bottom');
      g.resetTransform();
      g.text('press j to start', w/2, h - 2, 'center', 'bottom');
    }

    g.resetTransform();
    if (state === STATE_GAMEOVER) {
      g.text(`i rate your circle`, w/2, 2, 'center', 'top');
      g.text(`${Math.round((Math.max(score, 0)/maxScore)*10)}/10`, w/2, 10, 'center', 'top');
      g.text('press j to try again', w/2, h - 2, 'center', 'bottom');
    }

    if (state === STATE_GAME) {
      g.text(`- ${Math.floor(timer)} -`, w/2, 2, 'center', 'top');
      g.text('press j', 2, h - 2, 'left', 'bottom');
      g.text('to hammer', w - 2, h - 2, 'right', 'bottom');
    }
  }
}

export function load() {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  return new Game(canvas, new State());
};