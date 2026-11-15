import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import {
  EMPTY,
  Observable,
  catchError,
  concat,
  finalize,
  map,
  of,
  switchMap,
  tap,
  throwError,
  toArray,
} from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AddToCartRequest,
  ApiResponse,
  CartItemResponse,
  CartItemResponsePaged,
  EditCartItemRequest,
  ProductResponse,
} from '../models/api.models';
import { apiErrorMessage } from '../utils/helpers';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly api = `${environment.apiUrl}/api/cart`;

  readonly items = signal<CartItemResponse[]>([]);
  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly error = signal<string | null>(null);

  readonly count = computed(() => this.items().reduce((sum, item) => sum + item.quantity, 0));
  readonly total = computed(() =>
    this.items().reduce((sum, item) => sum + CartService.lineTotal(item), 0),
  );

  private pendingLoads = 0;

  constructor() {
    // Signing in loads the basket (for the header count); signing out empties it.
    effect(() => {
      const signedIn = this.auth.isLoggedIn();
      untracked(() => (signedIn ? this.refresh() : this.reset()));
    });
  }

  static lineTotal(item: CartItemResponse): number {
    return item.totalPrice ?? item.price * item.quantity;
  }

  refresh(): void {
    this.load().subscribe({ error: () => undefined });
  }

  /** GET /api/cart */
  load(): Observable<CartItemResponse[]> {
    const params = new HttpParams().set('Take', 100).set('Page', 1);
    this.pendingLoads++;
    this.loading.set(true);
    this.error.set(null);
    return this.http.get<ApiResponse<CartItemResponsePaged>>(this.api, { params }).pipe(
      map((response) => response.data?.items ?? []),
      tap({
        next: (items) => {
          this.items.set(items);
          this.loaded.set(true);
        },
        error: (error: unknown) =>
          this.error.set(apiErrorMessage(error, 'Could not load your basket.')),
      }),
      finalize(() => {
        this.pendingLoads--;
        this.loading.set(this.pendingLoads > 0);
      }),
    );
  }

  /** Signed-out visitors are sent to /login and nothing is emitted. */
  addProduct(product: Pick<ProductResponse, 'id' | 'name' | 'stock'>): Observable<string> {
    if (!this.auth.isLoggedIn()) {
      this.auth.redirectToLogin();
      return EMPTY;
    }
    const existing = this.items().find((item) => item.product?.id === product.id);
    if ((existing?.quantity ?? 0) >= product.stock) {
      return throwError(() => new Error('Your basket already has all available stock.'));
    }
    // Already in the basket: change the quantity instead.
    const request = existing
      ? this.editQuantity({ itemId: existing.id, quantity: existing.quantity + 1 })
      : this.addToCart({ productId: product.id, quantity: 1 });
    return request.pipe(
      switchMap(() => this.reloadQuietly()),
      map(() => `${product.name ?? 'This piece'} added to your basket.`),
    );
  }

  /** Below one removes the item. */
  setQuantity(item: CartItemResponse, quantity: number): Observable<void> {
    const request =
      quantity < 1
        ? this.removeFromCart(item.id)
        : this.editQuantity({ itemId: item.id, quantity });
    return request.pipe(switchMap(() => this.reloadQuietly()));
  }

  remove(item: CartItemResponse): Observable<void> {
    return this.removeFromCart(item.id).pipe(switchMap(() => this.reloadQuietly()));
  }

  /** No clear endpoint: items are removed one by one. */
  clear(): Observable<void> {
    const removals = this.items().map((item) => this.removeFromCart(item.id));
    return concat(...removals).pipe(
      toArray(),
      switchMap(() => this.reloadQuietly()),
    );
  }

  private reset(): void {
    this.items.set([]);
    this.loaded.set(false);
    this.error.set(null);
  }

  private reloadQuietly(): Observable<void> {
    return this.load().pipe(
      catchError(() => of([])),
      map(() => undefined),
    );
  }

  /** POST /api/cart/add-to-cart */
  private addToCart(body: AddToCartRequest): Observable<unknown> {
    return this.http.post<unknown>(`${this.api}/add-to-cart`, body);
  }

  /** PUT /api/cart/edit-quantity — by cart item id. */
  private editQuantity(body: EditCartItemRequest): Observable<unknown> {
    return this.http.put<unknown>(`${this.api}/edit-quantity`, body);
  }

  /** DELETE /api/cart/remove-from-cart/{id} — the cart item id, despite Swagger's "productId". */
  private removeFromCart(itemId: number): Observable<unknown> {
    return this.http.delete<unknown>(`${this.api}/remove-from-cart/${itemId}`);
  }
}
