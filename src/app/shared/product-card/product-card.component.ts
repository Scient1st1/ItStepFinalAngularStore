import { Component, computed, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProductResponse } from '../../core/models/api.models';
import { safeImageUrl } from '../../core/utils/helpers';
import { MoneyPipe } from '../money.pipe';
import { StarsComponent } from '../stars/stars.component';

@Component({
  selector: 'app-product-card',
  imports: [RouterLink, MoneyPipe, StarsComponent],
  templateUrl: './product-card.component.html',
  styleUrl: './product-card.component.css',
})
export class ProductCardComponent {
  readonly product = input.required<ProductResponse>();
  readonly busy = input(false);
  readonly add = output<ProductResponse>();

  protected readonly imageFailed = signal(false);
  protected readonly image = computed(() =>
    this.imageFailed() ? '' : safeImageUrl(this.product().imageUrl),
  );
  protected readonly subtitle = computed(() => {
    const { brand, model } = this.product();
    return [brand, model].filter(Boolean).join(' · ');
  });
}
