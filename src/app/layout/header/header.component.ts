import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { CartService } from '../../core/services/cart.service';
import { LanternService } from '../../lantern/lantern.service';

@Component({
  selector: 'app-header',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css',
})
export class HeaderComponent {
  protected readonly lantern = inject(LanternService);
  protected readonly auth = inject(AuthService);
  private readonly cart = inject(CartService);
  private readonly router = inject(Router);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  protected readonly userLabel = computed(() => {
    if (this.auth.isLoggedIn()) {
      const user = this.auth.user();
      return `Welcome, ${user?.firstName || user?.email?.split('@')[0] || 'friend'}`;
    }
    const url = this.url();
    if (url.startsWith('/login')) return 'Welcome back';
    if (url.startsWith('/register')) return 'Make yourself at home';
    return 'The evening collection';
  });

  protected readonly cartCount = computed(() => {
    const count = this.auth.isLoggedIn() ? this.cart.count() : 0;
    return count ? `(${count})` : '';
  });

  protected signOut(event: Event): void {
    event.preventDefault();
    this.auth.logout();
  }
}
