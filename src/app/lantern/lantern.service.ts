import { Injectable, signal } from '@angular/core';

/** Same keys as the original lantern.js. */
const KEY_LIT = 'nocturne-lantern-lit';
const KEY_HIDDEN = 'nocturne-lantern-hidden';
const KEY_SWING = 'nocturne-lantern-swing';

function read(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode, blocked site data); the lantern still works.
  }
}

/** Lantern state for the whole app, so it survives route changes. */
@Injectable({ providedIn: 'root' })
export class LanternService {
  readonly hidden = signal(read(KEY_HIDDEN) === '1');

  /** Swing angle in radians and angular velocity. */
  angle = -0.34;
  velocity = 0;

  /** Eased light level 0..1 and its target. */
  light = read(KEY_LIT) === '1' ? 1 : 0;
  lightTarget = this.light;

  /** Eased hide amount 0..1 and its target. */
  visibility = this.hidden() ? 1 : 0;
  visibilityTarget = this.visibility;

  /** Cord tug: 1 on toggle, decays each frame. */
  pulse = 0;

  constructor() {
    try {
      const saved = JSON.parse(read(KEY_SWING) || 'null');
      if (saved && Number.isFinite(saved.angle) && Number.isFinite(saved.velocity)) {
        this.angle = saved.angle;
        this.velocity = saved.velocity;
      }
    } catch {
      // Ignore a corrupt saved swing and keep the default.
    }
  }

  toggleLight(): void {
    this.lightTarget = this.lightTarget > 0.5 ? 0 : 1;
    write(KEY_LIT, this.lightTarget > 0.5 ? '1' : '0');
    this.pulse = 1;
  }

  toggleHidden(): void {
    this.visibilityTarget = this.visibilityTarget < 0.5 ? 1 : 0;
    const hidden = this.visibilityTarget > 0.5;
    write(KEY_HIDDEN, hidden ? '1' : '0');
    this.hidden.set(hidden);
  }

  /** On pagehide, so a reload resumes the swing. */
  persistSwing(): void {
    write(KEY_SWING, JSON.stringify({ angle: this.angle, velocity: this.velocity }));
  }
}
