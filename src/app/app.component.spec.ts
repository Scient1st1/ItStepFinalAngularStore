import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the lantern shell once, outside the router outlet', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    for (const id of ['lightWash', 'glow', 'lantern-scene', 'lantern-canvas', 'pull-handle']) {
      expect(root.querySelectorAll(`#${id}`).length).toBe(1);
    }
    expect(root.querySelector('main router-outlet')).toBeTruthy();
    expect(root.querySelector('main #lantern-canvas')).toBeNull();
    expect(root.querySelector('#lantern-toggle')?.textContent?.trim()).toBe('Hide lantern');
  });
});
