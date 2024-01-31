//
// types
//
interface GameState {
  onEnter?(g: Game): void;
  update(g: Game): void;
  render(g: Game): void;
  onExit?(g: Game): void;
  ticks: number;
}

const keyMap = {
  'up': 'w',
  'down': 's',
  'left': 'a',
  'right': 'd',
  'j': 'j',
  'k': 'k',
};

//
// asset stuff
//
class Font {
  charMap = [
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
    'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
    '+', '-', '*', '/', '.', ':', ',', '!', '%',
  ];

  // glyph sizes for reading from the img
  glyphWidth = 5;
  glyphHeight = 5;

  // char sizes for drawing
  charWidth = 5;
  charHeight = 6;

  imgTag: HTMLImageElement;

  constructor() {
    this.imgTag = document.createElement('img');
    this.imgTag.src = 'font.png';
    this.imgTag.addEventListener('load', this.fontLoaded.bind(this));
  }

  fontLoaded() {
  }

  drawChar(ctx: CanvasRenderingContext2D, char: string, x: number, y: number, invert = false) {
    const charIndex = this.charMap.indexOf(char.toUpperCase());
    if (charIndex === -1) {
      return;
    }

    ctx.save();
    if (invert) {
      ctx.filter = 'invert(1)';
    }
    ctx.drawImage(
      this.imgTag,
      charIndex * this.glyphWidth, 0, this.glyphWidth, this.glyphHeight,
      x, y, this.glyphWidth, this.glyphHeight,
    );
    ctx.restore();
  }
}

// load an animated image exported by aseprite
// point it at the JSON file, it will load the image
// must be exported as an array, not a hash
export async function loadAnimatedImage(jsonFile: string): Promise<GImage> {
  const f = await fetch(jsonFile);
  const def = await f.json();
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve(new GImage(img, def));
    };
    img.src = def.meta.image;
  });
}

export async function loadImage(path: string): Promise<GImage> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve(new GImage(img));
    };
    img.src = path;
  });
}

class GImage {
  loop = false;
  width = 0;
  height = 0;
  img: HTMLImageElement;
  done = true;
  animDef: any; // TODO make a type for aseprite stuff
  frame = 0;
  currentFrameTime = 0;

  constructor(img: HTMLImageElement, animDef: any = null) {
    this.img = img;
    this.width = img.width;
    this.height = img.height;

    if (animDef) {
      this.animDef = animDef;
      this.done = false;

      // take width/height from the first frame
      this.width = animDef.frames[0].frame.w;
      this.height = animDef.frames[0].frame.h;
    }
  }

  reset() {
    this.currentFrameTime = 0;
    this.frame = 0;
    this.done = false;
  }

  update(g: Game) {
    if (this.done) {
      // not animated
      return;
    }

    this.currentFrameTime += g.updateRate;

    if (this.currentFrameTime > this.animDef.frames[this.frame].duration) {
      if (this.frame === this.animDef.frames.length - 1 && !this.loop) {
        this.done = true;
        return
      }
      this.frame = (this.frame + 1) % this.animDef.frames.length;
      this.currentFrameTime = 0;
    }
  }

  draw(g: Game, x: number, y: number) {
    if (this.animDef) {
      const { frame } = this.animDef.frames[this.frame];
      // animated
      g.ctx.drawImage(this.img, frame.x, frame.y, frame.w, frame.h, x, y, frame.w, frame.h);
    } else {
      g.ctx.drawImage(this.img, x, y);
    }
  }
}

//
// the real business
//
class Game {
  ctx: CanvasRenderingContext2D;
  font: Font;
  width = 128;
  height = 96;
  scale = 5;

  keysDown: { [key: string]: boolean } = {};

  updateRate = 16.667;
  destroyed = false;

  state: GameState;
  nextState?: GameState;
  nextStateTransitionTicks = 0;
  lastFrameTime = 0;
  lag = 0;

  constructor(canvas: HTMLCanvasElement, state: GameState) {
    canvas.width = this.width;
    canvas.height = this.height;
    canvas.style.width = `${this.width * this.scale}px`;
    canvas.style.height = `${this.height * this.scale}px`;
    this.ctx = canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.lineWidth = 1;
    this.ctx.clearRect(0, 0, this.width, this.height);

    this.registerEvents();

    this.state = state;
    this.state.ticks = 0;
    if (this.state.onEnter) {
      this.state.onEnter(this);
    }

    this.font = new Font();
    window.requestAnimationFrame(this.render.bind(this));
  }

  destroy() {
    this.destroyed = true;

    // nuke the whole canvas
    this.ctx.canvas.replaceWith(this.ctx.canvas.cloneNode(true));
  }

  transitionToState(newState: GameState, delay = 0) {
    if (delay) {
      this.nextState = newState;
      this.nextStateTransitionTicks = Math.floor(this.state.ticks + delay);
      return;
    }

    if (this.state && this.state.onExit) {
      this.state.onExit(this);
    }
    this.state = newState;
    this.state.ticks = 0;

    if (this.state.onEnter) {
      this.state.onEnter(this);
    }

    this.nextState = undefined;
  }

  registerEvents() {
    window.addEventListener('keydown', (evt) => {
      this.keysDown[evt.key] = true;
    });

    window.addEventListener('keyup', (evt) => {
      this.keysDown[evt.key] = false;
    });
  }

  render(frameTime: DOMHighResTimeStamp) {
    const delta = Math.min(frameTime - this.lastFrameTime, 33.333);
    this.lastFrameTime = frameTime;
    this.lag += delta;
    // 60 fps update rate
    while (this.lag >= this.updateRate) {
      this.state.update(this);
      this.lag -= this.updateRate;
      this.state.ticks++;
      if (this.nextState && this.state.ticks >= this.nextStateTransitionTicks) {
        this.transitionToState(this.nextState);
      }
    }
    this.state.render(this);

    if (!this.destroyed) {
      window.requestAnimationFrame(this.render.bind(this));
    }
  }

  //
  // input api
  //
  isKeyDown(key: keyof typeof keyMap) {
    if (!keyMap[key]) {
      throw new Error(`unknown key ${key}`);
    }
    const actualKey = keyMap[key];
    return this.keysDown[actualKey];
  }

  //
  // drawing api
  //
  clear(x = 0, y = 0, w = this.width, h = this.height) {
    this.ctx.clearRect(x, y, w, h);
  }

  line(x0: number, y0: number, x1: number, y1: number, dotted = false) {
    x0 = Math.floor(x0);
    y0 = Math.floor(y0);
    x1 = Math.floor(x1);
    y1 = Math.floor(y1);

    this.ctx.fillStyle = 'white';

    // bresenham
    const dx = Math.abs(x1 - x0);
    const sx = x0 < x1 ? 1 : -1;

    const dy = -Math.abs(y1 - y0);
    const sy = y0 < y1 ? 1 : -1;

    let error = dx + dy;
    let x = x0;
    let y = y0;

    let i = 0;
    while (true) {
      if (i > 1000000) {
        throw new Error('uh oh more than 1mil iterations drawing a line. did you mean to do that?');
      }

      if (!dotted || i % 4 === 0) {
        this.ctx.fillRect(x, y, 1, 1);
      }
      i++;
      if (x === x1 && y === y1)
        break;
      const e2 = 2 * error;
      if (e2 >= dy) {
        if (x === x1)
          break;
        error += dy;
        x += sx
      }
      if (e2 <= dx) {
        if (y === y1)
          break;
        error += dx;
        y += sy
      }
    }
  }

  rect(x: number, y: number, width: number, height: number, outline = false) {
    if (outline) {
      // this.line(x, y, x + width, y);
      // this.line(x + width, y, x + width, y + height);
      // this.line(x + width, y + height, x, y + height);
      // this.line(x, y + height, x, y);
      this.ctx.beginPath();
      this.ctx.rect(x - 0.5, y - 0.5, width + 1, height + 1);
      this.ctx.strokeStyle = 'white';
      this.ctx.stroke();
    } else {
      this.ctx.fillStyle = 'white';
      this.ctx.fillRect(x, y, width, height);
    }
  }

  circle(x: number, y: number, radius: number, outline = false) {
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.strokeStyle = 'white';
    this.ctx.fillStyle = 'white';
    outline ? this.ctx.stroke() : this.ctx.fill();
  }

  text(text: string, x: number, y: number, ...attrs: string[]) {
    let xoffset = 0;
    let yoffset = 0;
    let shadow = false;
    const textWidth = text.length * this.font.charWidth;
    for (const attr of attrs) {
      switch (attr) {
        case 'center':
          xoffset = -Math.ceil(textWidth/2);
          break;
        case 'left':
          xoffset = 0;
          break;
        case 'right':
          xoffset = -textWidth;
          break;
        case 'middle':
          yoffset -= this.font.charHeight/2;
          break;
        case 'bottom':
          yoffset -= this.font.charHeight;
          break;
        case 'shadow':
          shadow = true;
          break;
      }
    }

    for (let i = 0; i < text.length; i++) {
      if (shadow) {
        this.font.drawChar(this.ctx, text[i], x + xoffset + i * this.font.charWidth, y + yoffset + 1, true);
      }
      this.font.drawChar(this.ctx, text[i], x + xoffset + i * this.font.charWidth, y + yoffset);
    }
  }

  translate(x: number, y: number) {
    this.ctx.translate(x, y);
  }

  rotate(angle: number) {
    this.ctx.rotate(angle);
  }

  resetTransform() {
    this.ctx.resetTransform();
  }

  transformPoint(x: number, y: number) {
    const matrix = this.ctx.getTransform();
    return {
      x: matrix.a * x + matrix.c * y + matrix.e,
      y: matrix.b * x + matrix.d * y + matrix.f,
    };
  }

  //
  // utils
  //
  collision(ax0: number, ay0: number, ax1: number, ay1: number, bx0: number, by0: number, bx1: number, by1: number) {
    return (
      ax0 < bx1 &&
      ax1 > bx0 &&
      ay0 < by1 &&
      ay1 > by0
    );
  }

  lerp(a: number, b: number, t: number) {
    return (1 - t) * a + t * b;
  }

  secondsToTicks(seconds: number) {
    return Math.floor((seconds * 1000) / this.updateRate);
  }
}

export { Game }
export type { GameState, GImage }