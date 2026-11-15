import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { catchError, finalize, of, switchMap, tap } from 'rxjs';
import { ProductDetailedResponse, ReviewResponse } from '../../core/models/api.models';
import { AuthService } from '../../core/services/auth.service';
import { CartService } from '../../core/services/cart.service';
import { ProductService } from '../../core/services/product.service';
import { NO_STATUS, Status, apiErrorMessage, safeImageUrl } from '../../core/utils/helpers';
import { MoneyPipe } from '../../shared/money.pipe';
import { StarsComponent } from '../../shared/stars/stars.component';
import { RatingModalComponent } from './rating-modal/rating-modal.component';

@Component({
  selector: 'app-product-details',
  imports: [RouterLink, DatePipe, MoneyPipe, StarsComponent, RatingModalComponent],
  templateUrl: './product-details.component.html',
  styleUrl: './product-details.component.css',
})
export class ProductDetailsComponent {
  private readonly productService = inject(ProductService);
  private readonly cart = inject(CartService);
  private readonly auth = inject(AuthService);
  private readonly title = inject(Title);
  private readonly destroyRef = inject(DestroyRef);

  readonly id = input.required<string>();
  private readonly productId = computed(() => {
    const id = Number(this.id());
    return Number.isInteger(id) && id > 0 ? id : null;
  });

  protected readonly product = signal<ProductDetailedResponse | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly canRetry = signal(false);

  /** undefined while loading, null when the list has no date for this product. */
  protected readonly releaseDate = signal<string | null | undefined>(undefined);

  protected readonly reviews = signal<ReviewResponse[]>([]);
  protected readonly reviewsTotal = signal(0);
  protected readonly reviewsLoading = signal(true);
  protected readonly reviewsError = signal<string | null>(null);

  protected readonly tab = signal<'details' | 'review'>('details');
  protected readonly ratingOpen = signal(false);
  protected readonly adding = signal(false);
  protected readonly status = signal<Status>(NO_STATUS);

  protected readonly selectedImage = signal<string | null>(null);
  private readonly brokenImages = signal<string[]>([]);

  protected readonly gallery = computed(() => {
    const product = this.product();
    const urls = [product?.imageUrl, ...(product?.imageUrls ?? [])]
      .map((url) => safeImageUrl(url))
      .filter((url) => url && !this.brokenImages().includes(url));
    return [...new Set(urls)];
  });
  protected readonly image = computed(() => {
    const selected = this.selectedImage();
    const gallery = this.gallery();
    return selected && gallery.includes(selected) ? selected : (gallery[0] ?? '');
  });

  protected readonly specifications = computed(() =>
    Object.entries(this.product()?.specifications ?? {}),
  );

  /** The user's own review, so "Rate" edits it. */
  protected readonly ownReview = computed(() => {
    const userId = this.auth.user()?.id;
    return userId ? (this.reviews().find((review) => review.user?.id === userId) ?? null) : null;
  });

  constructor() {
    toObservable(this.productId)
      .pipe(
        tap(() => this.resetPage()),
        switchMap((id) => {
          if (id === null) {
            this.fail('That product does not exist.', false);
            return of(null);
          }
          this.loadReleaseDate(id);
          this.loadReviews();
          return this.productService.getProduct(id).pipe(
            catchError((error: unknown) => {
              const missing = error instanceof HttpErrorResponse && error.status === 404;
              this.fail(
                missing
                  ? 'That product does not exist.'
                  : apiErrorMessage(error, 'Could not load this product.'),
                !missing,
              );
              return of(null);
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((product) => {
        this.loading.set(false);
        this.product.set(product);
        if (product) this.title.setTitle(`${product.name ?? 'Product'} — Nocturne Goods`);
      });
  }

  protected retry(): void {
    const id = this.productId();
    if (id === null) return;
    this.resetPage();
    this.loadReleaseDate(id);
    this.loadReviews();
    this.refreshProduct(id, true);
  }

  protected loadReviews(): void {
    const id = this.productId();
    if (id === null) return;
    this.reviewsLoading.set(true);
    this.reviewsError.set(null);
    this.productService
      .getReviews(id)
      .pipe(
        finalize(() => this.reviewsLoading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (page) => {
          if (id !== this.productId()) return; // The user moved on to another product.
          this.reviews.set(page.items ?? []);
          this.reviewsTotal.set(page.totalCount);
        },
        error: (error: unknown) =>
          this.reviewsError.set(apiErrorMessage(error, 'Could not load the reviews.')),
      });
  }

  protected add(): void {
    const product = this.product();
    if (!product) return;
    this.adding.set(true);
    this.cart
      .addProduct(product)
      .pipe(
        finalize(() => this.adding.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (text) => this.status.set({ text, error: false }),
        error: (error: unknown) =>
          this.status.set({
            text: apiErrorMessage(error, 'Could not add that to your basket.'),
            error: true,
          }),
      });
  }

  protected openRating(): void {
    if (!this.auth.isLoggedIn()) {
      this.auth.redirectToLogin();
      return;
    }
    this.ratingOpen.set(true);
  }

  protected onRated(): void {
    const id = this.productId();
    this.status.set({ text: 'Thank you — your rating was saved.', error: false });
    this.tab.set('review');
    this.loadReviews();
    if (id !== null) this.refreshProduct(id, false);
  }

  protected onImageError(): void {
    const url = this.image();
    if (url) this.brokenImages.update((broken) => [...broken, url]);
  }

  protected reviewerName(review: ReviewResponse): string {
    const name = [review.user?.firstName, review.user?.lastName].filter(Boolean).join(' ');
    return name || 'Anonymous';
  }

  private refreshProduct(id: number, showErrors: boolean): void {
    this.productService
      .getProduct(id)
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (product) => {
          if (id === this.productId()) this.product.set(product);
        },
        error: (error: unknown) => {
          if (showErrors) this.fail(apiErrorMessage(error, 'Could not load this product.'), true);
        },
      });
  }

  private loadReleaseDate(id: number): void {
    this.releaseDate.set(undefined);
    this.productService
      .getReleaseDate(id)
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((date) => {
        if (id === this.productId()) this.releaseDate.set(date);
      });
  }

  private resetPage(): void {
    this.loading.set(true);
    this.error.set(null);
    this.canRetry.set(false);
    this.product.set(null);
    this.reviews.set([]);
    this.reviewsTotal.set(0);
    this.tab.set('details');
    this.ratingOpen.set(false);
    this.status.set(NO_STATUS);
    this.selectedImage.set(null);
    this.brokenImages.set([]);
  }

  private fail(message: string, canRetry: boolean): void {
    this.error.set(message);
    this.canRetry.set(canRetry);
  }
}
