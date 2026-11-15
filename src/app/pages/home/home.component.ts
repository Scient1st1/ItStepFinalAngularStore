import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { ProductResponse } from '../../core/models/api.models';
import { CartService } from '../../core/services/cart.service';
import { ProductService } from '../../core/services/product.service';
import { NO_STATUS, Status, apiErrorMessage } from '../../core/utils/helpers';
import { ProductCardComponent } from '../../shared/product-card/product-card.component';

const FEATURED_COUNT = 4;

@Component({
  selector: 'app-home',
  imports: [RouterLink, ProductCardComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent {
  private readonly productService = inject(ProductService);
  private readonly cart = inject(CartService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly products = signal<ProductResponse[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly status = signal<Status>(NO_STATUS);
  protected readonly addingId = signal<number | null>(null);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.productService
      .getProducts(FEATURED_COUNT)
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (page) => this.products.set(page.items ?? []),
        error: (error: unknown) =>
          this.error.set(apiErrorMessage(error, 'Could not load the collection.')),
      });
  }

  protected add(product: ProductResponse): void {
    this.addingId.set(product.id);
    this.cart
      .addProduct(product)
      .pipe(
        finalize(() => this.addingId.set(null)),
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
}
