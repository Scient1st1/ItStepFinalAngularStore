import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { ReviewResponse } from '../../../core/models/api.models';
import { AuthService } from '../../../core/services/auth.service';
import { ProductService } from '../../../core/services/product.service';
import { NO_STATUS, Status, apiErrorMessage } from '../../../core/utils/helpers';

/** The API takes the reviewer from the account, so the name fields are read-only. */
@Component({
  selector: 'app-rating-modal',
  imports: [ReactiveFormsModule],
  templateUrl: './rating-modal.component.html',
  styleUrl: './rating-modal.component.css',
})
export class RatingModalComponent {
  private readonly auth = inject(AuthService);
  private readonly productService = inject(ProductService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  readonly productId = input.required<number>();
  readonly productName = input<string | null>(null);
  readonly existing = input<ReviewResponse | null>(null);

  readonly closed = output<void>();
  readonly saved = output<void>();

  protected readonly starValues = [1, 2, 3, 4, 5];
  protected readonly form = inject(NonNullableFormBuilder).group({
    rate: [0, [Validators.min(1), Validators.max(5)]],
    firstName: [''],
    lastName: [''],
  });
  protected readonly rate = toSignal(this.form.controls.rate.valueChanges, { initialValue: 0 });
  protected readonly busy = signal(false);
  protected readonly status = signal<Status>(NO_STATUS);

  constructor() {
    effect(() => {
      const user = this.auth.user();
      this.form.patchValue({ firstName: user?.firstName ?? '', lastName: user?.lastName ?? '' });
    });
    effect(() => {
      const rating = this.existing()?.rating;
      if (rating) this.form.controls.rate.setValue(rating);
    });
    this.form.controls.rate.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.status.set(NO_STATUS));
    // The profile is normally loaded at sign-in; fetch it if that request failed.
    if (!this.auth.user()) {
      this.auth
        .loadUser()
        .pipe(takeUntilDestroyed())
        .subscribe({ error: () => undefined });
    }
    afterNextRender(() => this.dialog().nativeElement.showModal());
  }

  protected close(): void {
    this.dialog().nativeElement.close();
  }

  /** A click on the <dialog> itself is a click on the backdrop. */
  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement && !this.busy()) this.close();
  }

  protected submit(): void {
    if (this.busy()) return;
    const rate = this.form.controls.rate.value;
    if (this.form.controls.rate.invalid) {
      this.status.set({ text: 'Choose a rating from 1 to 5 stars.', error: true });
      return;
    }
    const existing = this.existing();
    const request = existing
      ? this.productService.editReview({ reviewId: existing.id, rate })
      : this.productService.addReview({ productId: this.productId(), rate });
    this.busy.set(true);
    this.status.set({ text: 'Saving your rating…', error: false });
    request
      .pipe(
        finalize(() => this.busy.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.saved.emit();
          this.close();
        },
        error: (error: unknown) =>
          this.status.set({
            text: apiErrorMessage(error, 'Could not save your rating.'),
            error: true,
          }),
      });
  }
}
