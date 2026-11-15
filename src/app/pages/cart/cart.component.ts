import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Observable, catchError, finalize, of } from 'rxjs';
import { CartItemResponse } from '../../core/models/api.models';
import { CartService } from '../../core/services/cart.service';
import { ProductService } from '../../core/services/product.service';
import { NO_STATUS, Status, apiErrorMessage, safeImageUrl } from '../../core/utils/helpers';
import { MoneyPipe } from '../../shared/money.pipe';
import { StarsComponent } from '../../shared/stars/stars.component';

@Component({
  selector: 'app-cart',
  imports: [RouterLink, MoneyPipe, StarsComponent],
  templateUrl: './cart.component.html',
  styleUrl: './cart.component.css',
})
export class CartComponent {
  protected readonly cart = inject(CartService);
  private readonly productService = inject(ProductService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly message = signal<Status>(NO_STATUS);
  private readonly busy = signal(false);
  protected readonly isBusy = computed(() => this.busy() || this.cart.loading());

  /** productId → review count; null if the lookup failed. */
  private readonly reviewCounts = signal<Record<number, number | null>>({});
  private readonly requestedCounts = new Set<number>();
  private readonly brokenImages = signal<number[]>([]);

  protected readonly statusLine = computed<Status>(() => {
    if (this.message().text) return this.message();
    const error = this.cart.loaded() ? this.cart.error() : null;
    return error ? { text: error, error: true } : NO_STATUS;
  });

  constructor() {
    if (!this.cart.loading()) this.cart.refresh();

    // The cart response has no review count, so ask for it once per product.
    effect(() => {
      const ids = this.cart.items().map((item) => item.product.id);
      untracked(() => ids.forEach((id) => this.loadReviewCount(id)));
    });
  }

  protected unitPrice(item: CartItemResponse): number {
    return item.price ?? item.product.price;
  }

  protected lineTotal(item: CartItemResponse): number {
    return CartService.lineTotal(item);
  }

  protected imageOf(item: CartItemResponse): string {
    return this.brokenImages().includes(item.id) ? '' : safeImageUrl(item.product.imageUrl);
  }

  protected onImageError(item: CartItemResponse): void {
    this.brokenImages.update((ids) => [...ids, item.id]);
  }

  protected reviewLabel(productId: number): string {
    const count = this.reviewCounts()[productId];
    if (count === undefined) return 'Reviews: …';
    if (count === null) return 'Reviews: unavailable';
    return `${count} ${count === 1 ? 'review' : 'reviews'}`;
  }

  protected changeQuantity(item: CartItemResponse, delta: number): void {
    const next = item.quantity + delta;
    if (next > item.product.stock) return;
    this.run(this.cart.setQuantity(item, next), 'Could not update the quantity.');
  }

  protected remove(item: CartItemResponse): void {
    this.run(this.cart.remove(item), 'Could not remove that piece.');
  }

  protected clear(): void {
    this.run(this.cart.clear(), 'Could not clear the basket.');
  }

  private run(request: Observable<void>, fallback: string): void {
    if (this.isBusy()) return;
    this.busy.set(true);
    this.message.set(NO_STATUS);
    request
      .pipe(
        finalize(() => this.busy.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        error: (error: unknown) => {
          this.message.set({ text: apiErrorMessage(error, fallback), error: true });
          // Part of the change may have gone through: reload.
          this.cart.refresh();
        },
      });
  }

  private loadReviewCount(productId: number): void {
    if (this.requestedCounts.has(productId)) return;
    this.requestedCounts.add(productId);
    this.productService
      .getReviewCount(productId)
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((count) =>
        this.reviewCounts.update((counts) => ({ ...counts, [productId]: count })),
      );
  }
}
