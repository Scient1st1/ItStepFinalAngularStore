import { Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-stars',
  templateUrl: './stars.component.html',
  styleUrl: './stars.component.css',
})
export class StarsComponent {
  readonly rating = input<number | null | undefined>(0);
  readonly showValue = input(true);

  private readonly value = computed(() => Math.max(0, Math.min(5, Number(this.rating()) || 0)));
  protected readonly percent = computed(() => (this.value() / 5) * 100);
  /** The API reports 0 for a product nobody has rated yet. */
  protected readonly text = computed(() =>
    this.value() > 0 ? this.value().toFixed(1) : 'No ratings yet',
  );
  protected readonly label = computed(() =>
    this.value() > 0 ? `Rated ${this.value().toFixed(1)} out of 5` : 'No ratings yet',
  );
}
