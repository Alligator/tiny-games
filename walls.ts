// bugs/ideas
// [ ] can get hung up on walls

import { Game, loadImage, loadAnimatedImage, GImage, GameState } from './gamelib.js';

let w = 0;
let h = 0;

const tileSize = 4;
const playerSize = 2;
let level = 0;

// assets
let titleImg: GImage;
let eyeAnim: GImage;
let monsterAnim: GImage;

class WallGameState implements GameState {
  playerX = 0;
  playerY = 0;
  playerVelX = 0;
  playerVelY = 0;
  playerAngle = 0;

  torchTimer = 0;
  maxTorchTimer = 0;
  ticks = 0;

  levelEndAnimTicks = 0;
  done = false;

  enemyX = 0;
  enemyY = 0;
  enemyVisible = false;

  heartSize = 4;
  maxHeartSize = 8;

  maxTileAge = 0;
  fadeTileAge = 0;

  rays: { angle: number, mapX: number | null, mapY: number | null }[]  = [];
  cameFrom: number[] = [];
  plane = Math.PI / 2;

  mapw = 0;
  maph = 0;
  map: number[] = [];
  edgeTiles: Set<number> = new Set();
  mapSeen: number[] = [];
  enemyPath: number[] = [];

  onEnter(g: Game) {
    w = g.width;
    h = g.height;

    this.playerX = w/2;
    this.playerY = h/2 + 16;
    this.playerVelX = 0;
    this.playerVelY = 0;
    this.playerAngle = Math.PI * 1.5;
    this.torchTimer = 0;
    this.maxTorchTimer = Math.floor(2000 / g.updateRate);

    this.maxTileAge = Math.floor(20000 / g.updateRate);
    this.fadeTileAge = Math.floor(19000 / g.updateRate);

    this.generateLevel();
  }

  generateLevel() {
    this.mapw = w/tileSize;
    this.maph = h/tileSize - 2;

    const px = this.playerX/tileSize;
    const py = this.playerY/tileSize;

    // fill in the map
    this.map = [];
    const fillChance = Math.min(level, 3) / 8;
    for (let y = 0; y < this.maph; y++) {
      for (let x = 0; x < this.mapw; x++) {
        const index = y * this.mapw + x;
        if (x === 0 || x === this.mapw - 1 || y === 0 || y === this.maph - 1) {
          this.map[index] = 1
        } else if (
          x > px - 4 && x < px + 4 &&
          y > py - 4 && y < py + 4
        ) {
          // leave a blank space around the player
          this.map[index] = 0;
        } else {
          this.map[index] = Math.random() < fillChance ? 1 : 0;
        }
      }
    }

    // apply ca
    const iterations = Math.max((5 - level), 2);
    for (let i = 0; i < iterations; i++) {
      for (let y = 0; y < this.maph; y++) {
        for (let x = 0; x < this.mapw; x++) {
          let alive = false;

          if (x === 0 || x === this.mapw - 1 || y === 0 || y === this.maph - 1) {
            alive = true;
          } else {
            let aliveNeighbours = 0;

            aliveNeighbours += this.map[(y - 1) * this.mapw + x];       // top
            aliveNeighbours += this.map[(y - 1) * this.mapw + x + 1];   // top-right
            aliveNeighbours += this.map[y       * this.mapw + x + 1];   // right
            aliveNeighbours += this.map[(y + 1) * this.mapw + x + 1];   // bottom-right
            aliveNeighbours += this.map[(y + 1) * this.mapw + x];       // bottom
            aliveNeighbours += this.map[(y + 1) * this.mapw + x - 1];   // bottom-left
            aliveNeighbours += this.map[y       * this.mapw + x - 1];   // left
            aliveNeighbours += this.map[(y - 1) * this.mapw + x - 1];   // top-left

            const currentState = this.map[y * this.mapw + x];

            if (currentState === 0 && [6, 7, 8].indexOf(aliveNeighbours) !== -1) {
              alive = true;
            } else if (currentState === 1 && [3, 4, 5, 6, 7, 8].indexOf(aliveNeighbours) !== -1) {
              alive = true;
            } else {
              alive = false;
            }

            this.map[y * this.mapw + x] = alive ? 1 : 0;
          }
        }
      }
    }

    // flood fill from the player pos to find how many tiles they can see
    // and find a place to spawn the enemy
    const frontier: [number, number][] = [[px, py]];
    const visited = new Set();
    const validEnemySpawns = [];
    this.edgeTiles = new Set();
    while (frontier.length) {
      const [x, y] = frontier.pop()!;
      const index = y * this.mapw + x;
      if (visited.has(index)) {
        continue;
      }
      visited.add(index);

      if (this.map[index] === 1) {
        this.edgeTiles.add(index);
        continue;
      }

      if (x === 0 || x === this.mapw - 1 || y === 0 || y === this.maph - 1) {
        // edges
        continue
      }

      if (this.map[index] === 0) {
        frontier.push([x,     y - 1]);
        frontier.push([x + 1, y    ]);
        frontier.push([x    , y + 1]);
        frontier.push([x - 1, y    ]);

        const dist = Math.abs(px - x) + Math.abs(py - y);
        if (dist > 20) {
          validEnemySpawns.push([x * tileSize, y * tileSize]);
        }
      }
    }

    const enemySpawn = validEnemySpawns[Math.floor(Math.random()*validEnemySpawns.length)];
    this.enemyX = enemySpawn[0];
    this.enemyY = enemySpawn[1];
    
    this.mapSeen = new Array(this.map.length).fill(0);
  }

  inWall(x: number, y: number) {
    const tilex = Math.floor(x / tileSize);
    const tiley = Math.floor(y / tileSize);
    return this.map[tiley * this.mapw + tilex] === 1;
  }

  moveEnemy() {
    const px = Math.floor(this.playerX/tileSize);
    const py = Math.floor(this.playerY/tileSize);

    const ex = Math.floor(this.enemyX/tileSize);
    const ey = Math.floor(this.enemyY/tileSize);

    // shitty priority q
    const frontier: [[number, number], number][] = [];
    const put = (item: [number, number], cost: number) => {
      frontier.push([item, cost]);
    };
    const get = () => {
      let lowest = Infinity;
      let lowestIndex = 0;
      for (let i = 0; i < frontier.length; i++) {
        if (frontier[i][1] < lowest) {
          lowestIndex = i;
          lowest = frontier[i][1];
        }
      }
      const [item] = frontier.splice(lowestIndex, 1);
      return item[0];
    };

    // a* innit
    const cameFrom: (number | null)[] = [];
    const costSoFar: number[] = [];
    cameFrom[ey * this.mapw + ex] = null;
    costSoFar[ey * this.mapw + ex] = 0;
    put([ex, ey], 0);

    while (frontier.length) {
      const [x, y] = get();
      const currentIndex = y * this.mapw + x;

      if (x === px && y === py) {
        break;
      }

      const neighbours: [number, number][] = [
        [x, y - 1],     // top
        [x + 1, y - 1], // top right
        [x + 1, y],     // right
        [x + 1, y + 1], // bottom right
        [x, y + 1],     // bottom
        [x - 1, y + 1], // bottom left
        [x - 1, y],     // left
        [x - 1, y - 1],     // top left
      ];

      for (const neighbour of neighbours) {
        const index = neighbour[1] * this.mapw + neighbour[0];
        const newCost = costSoFar[currentIndex] + 1
        if (this.map[index] === 0 && (!costSoFar[index] || newCost < costSoFar[index])) {
          costSoFar[index] = newCost;
          // const priority = newCost + Math.abs(px - neighbour[0]) + Math.abs(py - neighbour[1]);
          const priority = newCost + Math.sqrt(Math.pow(px - neighbour[0], 2) + Math.pow(py - neighbour[1], 2));
          put(neighbour, priority);
          cameFrom[index] = currentIndex;
        }
      }
    }

    // reconstruct path
    let current: number | null = py * this.mapw + px;
    const goal = ey * this.mapw + ex;
    const path = [];
    while (current !== goal && current !== null) {
      path.push(current);
      current = cameFrom[current];
    }

    path.reverse();
    this.enemyPath = path;
    // this.cameFrom = cameFrom;
  }

  update(g: Game) {
    let repathEnemy = false;

    // input
    if (!this.done) {
      if (g.isKeyDown('up')) {
        this.playerVelX = Math.cos(this.playerAngle) / 2;
        this.playerVelY = Math.sin(this.playerAngle) / 2;
      }
      if (g.isKeyDown('down')) {
        this.playerVelX = -Math.cos(this.playerAngle) / 2;
        this.playerVelY = -Math.sin(this.playerAngle) / 2;
      }
      if (g.isKeyDown('left')) {
        this.playerAngle -= 0.05;
      }
      if (g.isKeyDown('right')) {
        this.playerAngle += 0.05;
      }

      if (g.isKeyDown('j') && this.torchTimer === 0) {
        this.torchTimer = this.maxTorchTimer;
        repathEnemy = true;
      }
    }

    if (this.torchTimer > 0) {
      this.torchTimer--;
    }

    // player movement
    if (
      this.inWall(this.playerX + this.playerVelX - 2, this.playerY) ||
      this.inWall(this.playerX + this.playerVelX + playerSize + 1, this.playerY)
    ) {
      this.playerVelX = 0;
    }

    if (
      this.inWall(this.playerX, this.playerY + this.playerVelY - 2) ||
      this.inWall(this.playerX, this.playerY + this.playerVelY + playerSize + 1)
    ) {
      this.playerVelY = 0;
    }

    this.playerX += this.playerVelX;
    this.playerY += this.playerVelY;

    this.playerVelX = g.lerp(this.playerVelX, 0, 0.15);
    this.playerVelY = g.lerp(this.playerVelY, 0, 0.15);

    this.enemyVisible = false;
    const enemyDist = Math.sqrt(
      Math.pow(this.playerX - this.enemyX, 2) +
      Math.pow(this.playerY - this.enemyY, 2)
    );

    if (enemyDist < 12) {
      this.enemyVisible = true;
      // enemy always move towards you if it's close
      repathEnemy = true;
    }

    if (repathEnemy) {
      this.moveEnemy();
    }

    // enemy movement
    if (!this.done && this.enemyPath && this.enemyPath.length) {
      const ex = Math.floor(this.enemyX/tileSize);
      const ey = Math.floor(this.enemyY/tileSize);

      const currentMove = this.enemyPath[0];
      const moveX = currentMove % this.mapw;
      const moveY = Math.floor(currentMove / this.mapw);

      this.enemyX = g.lerp(this.enemyX, moveX * tileSize + tileSize/2, 0.06);
      this.enemyY = g.lerp(this.enemyY, moveY * tileSize + tileSize/2, 0.06);

      if (ex === moveX && ey === moveY) {
        this.enemyPath.shift();
      }
    }

    // enemy collision
    if (g.collision(
      this.playerX, this.playerY, this.playerX + playerSize, this.playerY + playerSize,
      this.enemyX, this.enemyY, this.enemyX + 4, this.enemyY + 4
    )) {
      g.transitionToState(new GameOverState());
    }


    // heart rate
    let heartRate = 60;
    if (enemyDist < 24) {
      heartRate = 160;
    } else if (enemyDist < 40) {
      heartRate = 100;
    }
    const msPerBeat = (60 / heartRate) * 1000;
    const ticksPerBeat = Math.floor(msPerBeat / g.updateRate);
    if (this.ticks % ticksPerBeat === 0) {
      this.heartSize = this.maxHeartSize;
    }
    this.heartSize = g.lerp(this.heartSize, 4, 0.15);

    // tile fading
    for (let i = 0; i < this.mapSeen.length; i++) {
      if (this.mapSeen[i] > 1) {
        this.mapSeen[i]--;
      }
    }

    // ray casting
    this.rays = [];
    if (this.torchTimer === 0) {
      // skip ray casting
      return;
    }

    // love u lode
    const posX = this.playerX / tileSize;
    const posY = this.playerY / tileSize;

    let angle = -(this.plane/2);
    while (true) {
      const rayDirX = Math.cos(this.playerAngle + angle);
      const rayDirY = Math.sin(this.playerAngle + angle);

      let mapX = Math.floor(posX);
      let mapY = Math.floor(posY);

      let sideDistX;
      let sideDistY;

      let deltaDistX = rayDirX === 0 ? Infinity : Math.abs(1 / rayDirX);
      let deltaDistY = rayDirY === 0 ? Infinity : Math.abs(1 / rayDirY);

      let stepX;
      let stepY;

      let hit = false;
      let side;

      if (rayDirX < 0) {
        stepX = -1;
        sideDistX = (posX - mapX) * deltaDistX;
      } else {
        stepX = 1;
        sideDistX = (mapX + 1 - posX) * deltaDistX;
      }

      if (rayDirY < 0) {
        stepY = -1;
        sideDistY = (posY - mapY) * deltaDistY;
      } else {
        stepY = 1;
        sideDistY = (mapY + 1 - posY) * deltaDistY;
      }

      let attemptsLeft = 100;
      let prevMapX = mapX;
      let prevMapY = mapY;
      while (!hit && attemptsLeft-- > 0) {
        if (sideDistX < sideDistY) {
          sideDistX += deltaDistX;
          mapX += stepX;
          side = 0;
        } else {
          sideDistY += deltaDistY;
          mapY += stepY;
          side = 1;
        }

        const index = mapY * this.mapw + mapX;
        const mapHit = this.map[index] === 1;
        const enemyHit = mapX === Math.floor(this.enemyX/tileSize) && mapY === Math.floor(this.enemyY/tileSize);
        if (mapHit || enemyHit) {
          hit = true;

          let dist = 0;
          if (side === 0) {
            dist = sideDistX - deltaDistX;
          } else {
            dist = sideDistY - deltaDistY;
          }

          if (dist < 32/tileSize) {
            this.rays.push({ angle, mapX: prevMapX, mapY: prevMapY });
            if (mapHit) {
              this.mapSeen[index] = this.maxTileAge;
            } else if (enemyHit) {
              this.enemyVisible = true;
            }
          } else {
            this.rays.push({ angle, mapX: null, mapY: null });
          }
        }

        prevMapX = mapX;
        prevMapY = mapY;
      }

      if (angle >= this.plane / 2) {
        break;
      }
      angle += (1 - (this.torchTimer / this.maxTorchTimer)) * 0.5;
      // angle += 0.05;
    }

    const seenCount = this.mapSeen.reduce((acc, val) => acc + (val > 0 ? 1 : 0), 0);
    if (!this.done && seenCount === this.edgeTiles.size) {
      g.transitionToState(new EnteringLevelState(), g.secondsToTicks(4));
      this.done = true;
      this.levelEndAnimTicks = this.ticks + g.secondsToTicks(2);
    }
  }

  render(g: Game) {
    g.clear();
    g.translate(0, tileSize * 2);

    if (!this.done) {
      g.rect(this.playerX, this.playerY, playerSize, playerSize);
      const torchOriginX = this.playerX + Math.cos(this.playerAngle);
      const torchOriginY = this.playerY + Math.sin(this.playerAngle);
      const torchX0 = torchOriginX + playerSize/2 + Math.cos(this.playerAngle + Math.PI*0.4) * 2;
      const torchY0 = torchOriginY + playerSize/2 + Math.sin(this.playerAngle + Math.PI*0.4) * 2;
      const torchX1 = torchOriginX + playerSize/2 + Math.cos(this.playerAngle + Math.PI*0.6) * 2;
      const torchY1 = torchOriginY + playerSize/2 + Math.sin(this.playerAngle + Math.PI*0.6) * 2;
      g.line(torchX0, torchY0, torchX1, torchY1);

    }
    if (this.enemyVisible) {
      g.rect(this.enemyX, this.enemyY, 2, 2);
    }

    for (let i = 0; i < this.rays.length; i++) {
      const ray = this.rays[i];
      if (ray.mapX !== null && ray.mapY !== null) {
        // draw to hit
        g.line(
          this.playerX + playerSize/2, this.playerY + playerSize/2,
          ray.mapX * tileSize, ray.mapY * tileSize,
          true,
        );
      } else {
        // full length
        g.line(
          this.playerX + playerSize/2, this.playerY + playerSize/2,
          this.playerX + playerSize/2 + Math.cos(this.playerAngle + ray.angle) * 32,
          this.playerY + playerSize/2 + Math.sin(this.playerAngle + ray.angle) * 32,
          true,
        );
      }
    }


    // map
    if (this.done) {
      // swirly effect
      const animTicks = this.ticks - this.levelEndAnimTicks;
      for (let y = 0; y < this.maph; y++) {
        for (let x = 0; x < this.mapw; x++) {
          const index = y * this.mapw + x;
          let tx = x * tileSize;
          let ty = y * tileSize;

          if (animTicks > 0) {
            tx += (2 * Math.cos(y / 3)) * (animTicks / 2) * (1 + ty / g.width);
          }

          if (this.map[index] === 1) {
            // up
            if (this.map[index - this.mapw] === 0)
              g.line(tx, ty, tx + tileSize, ty);

            // right
            if (this.map[index + 1] === 0)
              g.line(tx + tileSize, ty, tx + tileSize, ty + tileSize);

            // down
            if (this.map[index + this.mapw] === 0)
              g.line(tx, ty + tileSize, tx + tileSize, ty + tileSize);

            // left
            if (this.map[index - 1] === 0)
              g.line(tx, ty, tx, ty + tileSize);
          }
        }
      }

    } else {
      // normal map
      for (let y = 0; y < this.maph; y++) {
        for (let x = 0; x < this.mapw; x++) {
          const index = y * this.mapw + x;
          if (this.map[index] === 1 && this.mapSeen[index]) {
            const tx = x * tileSize;
            const ty = y * tileSize;
            if (this.mapSeen[index] < this.fadeTileAge) {
              // faded tile

              // up
              if (this.map[index - this.mapw] === 0)
                g.rect(tx + tileSize/2, ty, 1, 1);

              // right
              if (this.map[index + 1] === 0)
                g.rect(tx + tileSize, ty + tileSize/2, 1, 1);

              // down
              if (this.map[index + this.mapw] === 0)
                g.rect(tx + tileSize/2, ty + tileSize, 1, 1);

              // left
              if (this.map[index - 1] === 0)
                g.rect(tx, ty + tileSize/2, 1, 1)

              // g.rect(x * tileSize, y * tileSize, tileSize, tileSize);
            } else {
              // full tile

              // up
              if (this.map[index - this.mapw] === 0)
                g.line(tx, ty, tx + tileSize, ty);

              // right
              if (this.map[index + 1] === 0)
                g.line(tx + tileSize, ty, tx + tileSize, ty + tileSize);

              // down
              if (this.map[index + this.mapw] === 0)
                g.line(tx, ty + tileSize, tx + tileSize, ty + tileSize);

              // left
              if (this.map[index - 1] === 0)
                g.line(tx, ty, tx, ty + tileSize);
            }
          }
        }
      }
    }

    // debug pathfinding
    /*
    for (let i = 0; i < this.cameFrom.length; i++) {
      if (this.cameFrom[i]) {
        const cfIndex = this.cameFrom[i];
        const x0 = cfIndex % this.mapw;
        const y0 = Math.floor(cfIndex / this.mapw);
        const x1 = i % this.mapw;
        const y1 = Math.floor(i / this.mapw);
        g.line(x0 * tileSize, y0 * tileSize, x1 * tileSize, y1 * tileSize);
      }
    }
    */

    // debug enemyPath
    /*
    if (this.enemyPath) {
      for (const move of this.enemyPath) {
        const x = move % this.mapw;
        const y = Math.floor(move / this.mapw);
        g.rect(x * tileSize, y * tileSize, 2, 2);
      }
    }
    */

    g.resetTransform();

    // hud
    g.clear(0, 0, g.width, 9);
    g.line(0, 9, g.width, 9);
    const seenCount = this.mapSeen.reduce((acc, val) => acc + (val > 0 ? 1 : 0), 0);
    const pct = Math.round((seenCount / this.edgeTiles.size) * 100);
    g.text(`${pct}%`, 2, 2);
    g.text(`level ${level}`, g.width - 2, 2, 'right');

    g.rect(g.width/2 - this.heartSize/2, this.maxHeartSize/2 - this.heartSize/2, this.heartSize, this.heartSize);
  }
}

class GameOverState implements GameState {
  ticks = 0;
  startDelay = 0;
  textDelay = 0;
  endDelay = 0;

  onEnter(g: Game) {
    this.startDelay = g.secondsToTicks(0.5);
    this.textDelay = g.secondsToTicks(2);
    this.endDelay = g.secondsToTicks(7);
    monsterAnim.reset();
    level = 0;
  }

  update(g: Game) {
    if (this.ticks > this.startDelay) {
      monsterAnim.update(g);
    }
    if (this.ticks > this.endDelay) {
      g.transitionToState(new TitleState());
    }
  }

  render(g: Game) {
    g.clear();
    monsterAnim.draw(g, g.width/2 - monsterAnim.width/2, g.height/2 - monsterAnim.height/2 - 8);
    if (this.ticks > this.textDelay) {
      g.text('game over', g.width/2, g.height - 16, 'center', 'bottom');
    }
  }
}

class EnteringLevelState implements GameState {
  ticks = 0;
  ticksLeft = 0;
  onEnter(g: Game) {
    this.ticksLeft = g.secondsToTicks(3);
    level++;
  }
  
  update(g: Game) {
    if (this.ticksLeft-- === 0) {
      g.transitionToState(new WallGameState());
    }
  }

  render(g: Game) {
    g.clear();
    g.text('press j to', g.width/2, g.height/2-8, 'center', 'middle');
    g.text('shine your torch', g.width/2, g.height/2, 'center', 'middle');
    g.text('uncover the map!', g.width/2, g.height/2+16, 'center', 'middle');
  }
}

class TitleState implements GameState {
  ticks = 0;
  eyePositions: [number, number][];
  eyePos: [number, number] | null;

  constructor() {
    this.eyePositions = [
          [34, 11], [40, 13], [46, 13], [52, 11],
      [31, 17], [37, 19], [43, 20], [49, 19], [55, 17],
    ];
    this.eyePos = this.eyePositions[Math.floor(Math.random() * this.eyePositions.length)];
  }

  update(g: Game) {
    eyeAnim.update(g);

    if (eyeAnim.done) {
      eyeAnim.reset();
      if (Math.random() > 0.9) {
        // all eyes
        this.eyePos = null;
      } else {
        this.eyePos = this.eyePositions[Math.floor(Math.random() * this.eyePositions.length)];
      }
    }

    if (g.isKeyDown('j')) {
      g.transitionToState(new EnteringLevelState());
    }
  }

  render(g: Game) {
    g.clear();
    titleImg.draw(g, Math.floor(g.width/2 - titleImg.width/2), Math.floor(g.height/2 - titleImg.height/2 - 8));
    g.text('press j to start', g.width/2, g.height/2 + 16, 'center', 'middle');

    if (this.eyePos) {
      eyeAnim.draw(g, this.eyePos[0], this.eyePos[1]);
    } else {
      // draw all eyes
      for (const eyePos of this.eyePositions) {
        eyeAnim.draw(g, eyePos[0], eyePos[1]);
      }
    }
  }
}

export async function load() {
  titleImg = await loadImage('walls-title.png');
  eyeAnim = await loadAnimatedImage('walls-eye.json');
  monsterAnim = await loadAnimatedImage('wall-monster.json');
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  return new Game(canvas, new TitleState());
};
