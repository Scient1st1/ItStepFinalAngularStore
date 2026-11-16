# Nocturne Goods — Angular

The lantern-themed shop "Nocturne Goods", migrated from plain JavaScript to Angular for the
IT Step course final project. The lantern and the visual theme are the originals; all data and
accounts come from the IT Step shop API (`https://shopapi.stepacademy.ge`).

Requires Node 20.19+ (built with Angular 22, standalone components, zoneless).

## What it does

| Route                 | Page                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `/`                   | Landing page with the original hero and four featured products                                                            |
| `/catalog`            | Product cards; search by name; category, brand, price range and rating filters (combinable); sorting; paging              |
| `/product/:id`        | Photo, price, release date, brand, stock left, **Add to basket**, **Rate**; tabs **Details** and **Review**               |
| `/cart`               | Signed-in users only. Cards with photo, name, stock left, rating, price, review count; quantity up/down; remove; subtotal |
| `/login`, `/register` | Reactive forms with validation and visible errors                                                                         |
| `/verify-email`       | The 6-digit code the API emails after registration                                                                        |

- Adding to the basket or rating while signed out goes to `/login` and returns afterwards.
- Catalog filters live in the URL (`/catalog?brand=Apple&min=1000&sort=price-asc`), so they
  survive a reload, the Back button and the trip to `/login`.
- Every request has loading, error and empty states. There is no hardcoded product data.

## The lantern

- The lantern shell (`#lightWash`, `#glow`, `#lantern-scene`, `#lantern-canvas`, `#pull-handle`,
  `#lantern-drag-handle`, `.hint`) is rendered once by `Lantern` in the root `App` component,
  outside `<router-outlet>`, so navigation never re-mounts it.
- `src/app/lantern/lantern.component.ts` is a line-for-line TypeScript port of the old `lantern.js`: same
  drawing, same physics, bead pull, Space, drag to swing, Hide/Show.
- `LanternService` keeps the state in memory for the whole app and uses the same `sessionStorage`
  keys: `nocturne-lantern-lit`, `nocturne-lantern-hidden`, `nocturne-lantern-swing` (the swing is
  written on `pagehide`). A fresh tab starts dark and unlit.
- The page is lit through the same CSS hooks as before: `--lit`, `--glow`, `--lamp-x` and
  `--lamp-y` on `<html>`. `src/shop.css` is the original file, byte for byte.
- The animation loop and its listeners are started inside `NgZone.runOutsideAngular` and are
  removed (with `cancelAnimationFrame`) in `ngOnDestroy`. The app is zoneless, so the frame loop
  never triggers change detection either way.
- One deliberate difference: Space no longer toggles the light while the focus is in an input,
  select, textarea or button. The original captured Space everywhere, which made it impossible
  to type a space into a field.

## API

Base URL and key are in `src/environments/environment.ts`.

- `stepKeyInterceptor` adds `X-STEP-KEY` to every API request.
- `authInterceptor` adds `Authorization: Bearer <token>` after sign-in. On a 401 it clears the
  session and goes to `/login` (remembering the page).
- The session is per tab: the token is stored in `sessionStorage` only.
- Interfaces for all API models are in `src/app/core/models/api.models.ts`, taken from the
  Swagger schemas.

Endpoints used:

| Purpose            | Endpoint                                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Register, sign in  | `POST /api/auth/register`, `POST /api/auth/login`                                                                             |
| Email verification | `PUT /api/auth/verify-email`, `POST /api/auth/resend-email-verification/{email}`                                              |
| Current user       | `GET /api/users/me`                                                                                                           |
| Products           | `GET /api/products`, `GET /api/products/filter`, `GET /api/products/{productId}`                                              |
| Categories         | `GET /api/categories`                                                                                                         |
| Reviews            | `GET /api/reviews/{productId}`, `POST /api/reviews`, `PUT /api/reviews`                                                       |
| Cart               | `GET /api/cart`, `POST /api/cart/add-to-cart`, `PUT /api/cart/edit-quantity`, `DELETE /api/cart/remove-from-cart/{productId}` |

Note on cart removal: Swagger calls the path parameter `productId`, but the API expects the
**cart item id** there. A product id is answered with `404 Cart item not found`.

## Structure

Every component was generated with `ng generate component` and is split into
`name.component.ts`, `name.component.html` and `name.component.css` (`templateUrl` /
`styleUrl`, no inline templates or styles). No markup is built in TypeScript; the only drawing
code in TypeScript is the lantern canvas.

```
src/environments/environment.ts   API base URL and X-STEP-KEY
src/shop.css                      the original theme, unchanged
src/styles.css                    the few additions shared by several components
src/app/
  app.component.*                 shell: lantern, header, router outlet, footer
  lantern/                        LanternComponent + LanternService
  layout/header/                  nav, cart count, greeting, Sign in / Sign out, Hide lantern
  core/models                     API interfaces
  core/interceptors               stepKeyInterceptor, authInterceptor
  core/services                   AuthService, ProductService, CartService
  core/guards                     authGuard (cart)
  core/utils                      error messages, image URL check, return URL check
  shared/                         product-card, stars, field-error components, MoneyPipe
  pages/                          home, catalog, product-details (+ rating-modal), cart,
                                  login, register, verify-email
```
