import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

// lazyloading chunks

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Nocturne Goods — Light for the quiet hours',
    loadComponent: () => import('./pages/home/home.component').then((m) => m.HomeComponent),
  },
  {
    path: 'catalog',
    title: 'Shop all — Nocturne Goods',
    loadComponent: () =>
      import('./pages/catalog/catalog.component').then((m) => m.CatalogComponent),
  },
  {
    path: 'product/:id',
    title: 'Product — Nocturne Goods',
    loadComponent: () =>
      import('./pages/product-details/product-details.component').then(
        (m) => m.ProductDetailsComponent,
      ),
  },
  {
    path: 'cart',
    title: 'Your basket — Nocturne Goods',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/cart/cart.component').then((m) => m.CartComponent),
  },
  {
    path: 'login',
    title: 'Sign in — Nocturne Goods',
    loadComponent: () => import('./pages/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'register',
    title: 'Create account — Nocturne Goods',
    loadComponent: () =>
      import('./pages/register/register.component').then((m) => m.RegisterComponent),
  },
  {
    path: 'verify-email',
    title: 'Verify your email — Nocturne Goods',
    loadComponent: () =>
      import('./pages/verify-email/verify-email.component').then((m) => m.VerifyEmailComponent),
  },
  {
    path: '**',
    title: 'Not found — Nocturne Goods',
    loadComponent: () =>
      import('./pages/not-found/not-found.component').then((m) => m.NotFoundComponent),
  },
];
