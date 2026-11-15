import { DOCUMENT } from '@angular/common';
import {
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  afterNextRender,
  inject,
  viewChild,
} from '@angular/core';
import { LanternService } from './lantern.service';

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

interface Dust {
  x: number;
  y: number;
  r: number;
  p: number;
}

/** Port of the original lantern.js; state lives in LanternService. */
@Component({
  selector: 'app-lantern',
  templateUrl: './lantern.component.html',
  styleUrl: './lantern.component.css',
})
export class LanternComponent implements OnDestroy {
  private readonly zone = inject(NgZone);
  private readonly lantern = inject(LanternService);
  private readonly doc = inject(DOCUMENT);

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly handleRef = viewChild.required<ElementRef<HTMLButtonElement>>('handle');
  private readonly swingRef = viewChild.required<ElementRef<HTMLButtonElement>>('swing');
  private readonly hintRef = viewChild.required<ElementRef<HTMLElement>>('hint');

  private ctx!: CanvasRenderingContext2D;
  private handle!: HTMLButtonElement;
  private swingTarget!: HTMLButtonElement;
  private hint!: HTMLElement;
  private rootStyle!: CSSStyleDeclaration;

  private w = 0;
  private h = 0;
  private last = 0;
  private pull = 0;
  private stretch = 0;
  private drag = false;
  private startY = 0;
  private swingDrag = false;
  private swingStartX = 0;
  private swingStartAngle = 0;
  private lastSwingAt = 0;
  private swingLength = 1;

  private readonly dust: Dust[] = Array.from({ length: 22 }, () => ({
    x: Math.random() - 0.5,
    y: Math.random() - 0.5,
    r: 0.6 + Math.random() * 1.2,
    p: Math.random() * 7,
  }));

  private rafId: number | null = null;
  private readonly cleanup: Array<() => void> = [];

  constructor() {
    // Outside NgZone: the frame loop never triggers change detection.
    afterNextRender(() => this.zone.runOutsideAngular(() => this.start()));
  }

  ngOnDestroy(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    for (const off of this.cleanup.splice(0)) off();
  }

  private listen<T extends Event>(
    target: EventTarget,
    type: string,
    handler: (event: T) => void,
  ): void {
    const listener = handler as EventListener;
    target.addEventListener(type, listener);
    this.cleanup.push(() => target.removeEventListener(type, listener));
  }

  private start(): void {
    const canvas = this.canvasRef().nativeElement;
    const ctx = canvas.getContext('2d');
    const win = this.doc.defaultView;
    if (!ctx || !win) return;

    this.ctx = ctx;
    this.handle = this.handleRef().nativeElement;
    this.swingTarget = this.swingRef().nativeElement;
    this.hint = this.hintRef().nativeElement;
    this.rootStyle = this.doc.documentElement.style;

    const state = this.lantern;
    this.rootStyle.setProperty('--lit', String(state.light));
    this.rootStyle.setProperty('--glow', String(state.light));

    const resize = () => {
      const dpr = Math.min(win.devicePixelRatio || 1, 2);
      this.w = win.innerWidth;
      this.h = win.innerHeight;
      canvas.width = this.w * dpr;
      canvas.height = this.h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    this.listen(win, 'resize', resize);
    resize();

    this.listen(win, 'pagehide', () => state.persistSwing());

    // Drag the lantern body to swing it.
    const swingTarget = this.swingTarget;
    this.listen<PointerEvent>(swingTarget, 'pointerdown', (e) => {
      if (e.button !== 0 || state.visibility > 0.985) return;
      this.swingDrag = true;
      this.swingStartX = e.clientX;
      this.swingStartAngle = state.angle;
      this.lastSwingAt = performance.now();
      state.velocity = 0;
      swingTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    this.listen<PointerEvent>(swingTarget, 'pointermove', (e) => {
      if (!this.swingDrag) return;
      const now = performance.now();
      const dt = Math.max((now - this.lastSwingAt) / 1000, 1 / 240);
      const limit = Math.sin(0.82);
      const horizontal = clamp(
        Math.sin(this.swingStartAngle) +
          (e.clientX - this.swingStartX) / Math.max(this.swingLength, 1),
        -limit,
        limit,
      );
      const nextAngle = Math.asin(horizontal);
      state.velocity = clamp((nextAngle - state.angle) / dt, -0.68, 0.68);
      state.angle = nextAngle;
      this.lastSwingAt = now;
    });
    this.listen(swingTarget, 'pointerup', () => {
      this.swingDrag = false;
    });
    this.listen(swingTarget, 'pointercancel', () => {
      this.swingDrag = false;
      state.velocity = 0;
    });

    // Pull the bead to toggle the light.
    const handle = this.handle;
    this.listen<PointerEvent>(handle, 'pointerdown', (e) => {
      this.drag = true;
      this.startY = e.clientY;
      this.pull = 0;
      handle.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    this.listen<PointerEvent>(handle, 'pointermove', (e) => {
      if (this.drag) this.pull = clamp((e.clientY - this.startY) / 90, 0, 1.25);
    });
    this.listen<PointerEvent>(handle, 'pointerup', (e) => {
      if (!this.drag) return;
      const dy = e.clientY - this.startY;
      if (dy > 14 || Math.abs(dy) < 10) state.toggleLight();
      this.drag = false;
      this.pull = 0;
    });
    this.listen(handle, 'pointercancel', () => {
      this.drag = false;
      this.pull = 0;
    });

    // Space toggles the light, except while typing or on another control.
    this.listen<KeyboardEvent>(win, 'keydown', (e) => {
      if (e.code !== 'Space' || this.isEditingTarget(e.target)) return;
      e.preventDefault();
      state.toggleLight();
    });

    this.rafId = requestAnimationFrame(this.frame);
  }

  private isEditingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement) || target === this.handle) return false;
    return target.isContentEditable || !!target.closest('input, textarea, select, button, summary');
  }

  private metal(x: number, y: number, width: number): CanvasGradient {
    const g = this.ctx.createLinearGradient(x - width / 2, y, x + width / 2, y);
    g.addColorStop(0, '#382819');
    g.addColorStop(0.22, '#9c6c32');
    g.addColorStop(0.46, '#f0ca7d');
    g.addColorStop(0.63, '#986b35');
    g.addColorStop(0.84, '#cf9f53');
    g.addColorStop(1, '#47301c');
    return g;
  }

  private drawLamp(x: number, y: number, s: number): void {
    const ctx = this.ctx;
    const { angle, light: lit } = this.lantern;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(s, s);
    // suspension crown and brass rim
    ctx.strokeStyle = this.metal(0, -124, 36);
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(0, -121, 13, Math.PI, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = this.metal(0, -105, 110);
    ctx.beginPath();
    ctx.moveTo(-41, -119);
    ctx.quadraticCurveTo(-34, -137, 0, -138);
    ctx.quadraticCurveTo(34, -137, 41, -119);
    ctx.lineTo(32, -102);
    ctx.lineTo(-32, -102);
    ctx.closePath();
    ctx.fill();
    // warm glass chamber
    const flame = ctx.createRadialGradient(-4, -54, 2, 0, -54, 61);
    flame.addColorStop(0, `rgba(255,244,190,${0.94 * lit})`);
    flame.addColorStop(0.34, `rgba(255,172,65,${0.67 * lit})`);
    flame.addColorStop(1, `rgba(238,115,34,${0.13 * lit})`);
    ctx.fillStyle = '#20170f';
    ctx.beginPath();
    ctx.moveTo(-31, -99);
    ctx.lineTo(-43, -37);
    ctx.lineTo(-34, -5);
    ctx.lineTo(34, -5);
    ctx.lineTo(43, -37);
    ctx.lineTo(31, -99);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = flame;
    ctx.beginPath();
    ctx.moveTo(-27, -96);
    ctx.lineTo(-36, -39);
    ctx.lineTo(-29, -10);
    ctx.lineTo(29, -10);
    ctx.lineTo(36, -39);
    ctx.lineTo(27, -96);
    ctx.closePath();
    ctx.fill();
    const glass = ctx.createLinearGradient(-38, 0, 39, 0);
    glass.addColorStop(0, 'rgba(187,217,219,.22)');
    glass.addColorStop(0.28, 'rgba(242,250,222,.05)');
    glass.addColorStop(0.5, 'rgba(255,238,191,.08)');
    glass.addColorStop(0.78, 'rgba(194,224,217,.15)');
    glass.addColorStop(1, 'rgba(255,255,255,.31)');
    ctx.fillStyle = glass;
    ctx.beginPath();
    ctx.moveTo(-30, -97);
    ctx.lineTo(-39, -39);
    ctx.lineTo(-31, -9);
    ctx.lineTo(31, -9);
    ctx.lineTo(39, -39);
    ctx.lineTo(30, -97);
    ctx.closePath();
    ctx.fill();
    if (lit > 0.02) {
      ctx.save();
      ctx.globalAlpha = lit;
      ctx.fillStyle = '#fff4c5';
      ctx.shadowColor = '#ffaf3c';
      ctx.shadowBlur = 25;
      ctx.beginPath();
      ctx.moveTo(0, -26);
      ctx.bezierCurveTo(-15, -42, 1, -60, 3, -72);
      ctx.bezierCurveTo(25, -52, 17, -39, 0, -26);
      ctx.fill();
      ctx.restore();
    }
    ctx.lineCap = 'round';
    ctx.strokeStyle = this.metal(0, -50, 88);
    ctx.lineWidth = 5;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 32, -101);
      ctx.quadraticCurveTo(side * 38, -48, side * 31, -7);
      ctx.stroke();
    }
    ctx.fillStyle = this.metal(0, -3, 88);
    ctx.beginPath();
    ctx.moveTo(-35, -12);
    ctx.lineTo(-43, -2);
    ctx.quadraticCurveTo(-43, 4, -33, 5);
    ctx.lineTo(33, 5);
    ctx.quadraticCurveTo(43, 4, 43, -2);
    ctx.lineTo(35, -12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#382719';
    ctx.beginPath();
    ctx.ellipse(0, -7, 23, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = this.metal(0, -112, 70);
    ctx.beginPath();
    ctx.ellipse(0, -104, 35, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    // pull cord and bead
    const cordEnd = 82 + this.stretch * 74;
    ctx.strokeStyle = '#b08a54';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(0, 5);
    ctx.quadraticCurveTo(2, 23, 0, cordEnd - 7);
    ctx.stroke();
    ctx.fillStyle = this.metal(0, cordEnd, 12);
    ctx.beginPath();
    ctx.ellipse(0, cordEnd, 4.5, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    // keep the invisible pull button over the bead
    const beadX = x - Math.sin(angle) * cordEnd * s;
    const beadY = y + Math.cos(angle) * cordEnd * s;
    this.handle.style.left = `${beadX - 26}px`;
    this.handle.style.top = `${beadY - 30}px`;
    ctx.restore();
  }

  private readonly frame = (t: number): void => {
    const ctx = this.ctx;
    const state = this.lantern;
    const { w, h } = this;
    const dt = Math.min((t - this.last) / 1000 || 0, 0.035);
    this.last = t;

    state.pulse = Math.max(0, state.pulse - dt * 1.4);
    this.stretch += (Math.max(this.pull, state.pulse) - this.stretch) * (1 - Math.exp(-dt * 18));
    state.visibility += (state.visibilityTarget - state.visibility) * (1 - Math.exp(-dt * 2.2));
    if (!this.swingDrag) {
      state.angle += state.velocity * dt;
      state.velocity += (-0.67 * Math.sin(state.angle) - 0.115 * state.velocity) * dt;
      state.velocity = clamp(state.velocity, -0.68, 0.68);
    } else {
      state.velocity *= Math.exp(-dt * 4.5);
    }
    state.light += (state.lightTarget - state.light) * (1 - Math.exp(-dt * 4));

    const { angle, light: lit, visibility } = state;
    // These two custom properties are what shop.css uses to light the page.
    this.rootStyle.setProperty('--lit', lit.toFixed(3));
    this.rootStyle.setProperty('--glow', lit.toFixed(3));

    const s = clamp(Math.min(w / 680, h / 720), 0.48, 0.88);
    const length = Math.max(clamp(h * 0.29, 190, 300), w * 0.3);
    const drop = (h + 420) * visibility * visibility;
    const ax = w * 0.5;
    const ay = Math.min(-12, h * 0.3 - length) + drop;
    const px = ax + Math.sin(angle) * length;
    const py = ay + Math.cos(angle) * length;
    const lx = px - Math.sin(angle) * 138 * s;
    const ly = py + Math.cos(angle) * 138 * s;
    this.swingLength = length;

    const swing = this.swingTarget.style;
    swing.left = `${lx - 54 * s}px`;
    swing.top = `${ly - 140 * s}px`;
    swing.width = `${108 * s}px`;
    swing.height = `${150 * s}px`;
    swing.pointerEvents = visibility > 0.985 ? 'none' : 'auto';

    this.rootStyle.setProperty('--lamp-x', `${((lx / w) * 100).toFixed(2)}%`);
    this.rootStyle.setProperty('--lamp-y', `${((ly / h) * 100).toFixed(2)}%`);

    ctx.clearRect(0, 0, w, h);
    const visibleAlpha = 1 - clamp((visibility - 0.58) / 0.42, 0, 1);
    ctx.save();
    ctx.globalAlpha = visibleAlpha;
    // chain
    ctx.strokeStyle = 'rgba(193,157,98,.82)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(px, py);
    ctx.stroke();
    for (let f = 0.03; f < 0.98; f += Math.max(0.025, 9 / length)) {
      const x = ax + (px - ax) * f;
      const y = ay + (py - ay) * f;
      ctx.fillStyle = '#a77d47';
      ctx.beginPath();
      ctx.ellipse(x, y, 2, 3, angle, 0, Math.PI * 2);
      ctx.fill();
    }
    // dust motes in the light
    if (lit > 0.02) {
      for (const d of this.dust) {
        d.p += dt * (0.3 + d.r * 0.12);
        const x = lx + d.x * 220 + Math.sin(d.p) * 8;
        const y = ly + d.y * 230 + Math.cos(d.p * 0.8) * 9;
        ctx.fillStyle = `rgba(255,216,145,${lit * (0.05 + 0.13 * (0.5 + 0.5 * Math.sin(d.p)))})`;
        ctx.beginPath();
        ctx.arc(x, y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    this.drawLamp(lx, ly, s);
    ctx.restore();

    this.handle.disabled = visibility > 0.985;
    this.handle.style.pointerEvents = visibility > 0.985 ? 'none' : 'auto';
    this.hint.style.opacity = visibility > 0.5 ? '0' : '.47';

    this.rafId = requestAnimationFrame(this.frame);
  };
}
