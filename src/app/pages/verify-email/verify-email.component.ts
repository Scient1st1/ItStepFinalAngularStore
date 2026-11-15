import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { NO_STATUS, Status, apiErrorMessage, safeReturnUrl } from '../../core/utils/helpers';
import { FieldErrorComponent } from '../../shared/field-error/field-error.component';

/** The API issues a real token only after the emailed code is confirmed. */
@Component({
  selector: 'app-verify-email',
  imports: [ReactiveFormsModule, RouterLink, FieldErrorComponent],
  templateUrl: './verify-email.component.html',
  styleUrl: './verify-email.component.css',
})
export class VerifyEmailComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly query = inject(ActivatedRoute).snapshot.queryParamMap;

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: [this.query.get('email') ?? '', [Validators.required, Validators.email]],
    code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
  });

  protected readonly busy = signal(false);
  protected readonly status = signal<Status>(NO_STATUS);

  private readonly returnUrl = safeReturnUrl(this.query.get('returnUrl'));
  protected readonly returnParam = computed(() => (this.returnUrl === '/' ? null : this.returnUrl));

  protected readonly notice = signal(
    this.query.get('sent')
      ? 'Account created. We emailed you a verification code.'
      : 'Your email is not verified yet. Enter the code from your inbox, or request a new one.',
  );

  protected submit(): void {
    if (this.busy()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.status.set({ text: 'Check the highlighted fields.', error: true });
      return;
    }
    const { email, code } = this.form.getRawValue();
    this.busy.set(true);
    this.status.set({ text: 'Verifying…', error: false });
    this.auth
      .verifyEmail({ email: email.trim(), code: code.trim() })
      .pipe(
        finalize(() => this.busy.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (signedIn) => {
          if (signedIn) {
            void this.router.navigateByUrl(this.returnUrl);
          } else {
            void this.router.navigate(['/login'], {
              queryParams: { verified: 1, returnUrl: this.returnParam() },
            });
          }
        },
        error: (error: unknown) =>
          this.status.set({
            text: apiErrorMessage(error, 'Could not verify that code.'),
            error: true,
          }),
      });
  }

  protected resend(): void {
    const email = this.form.controls.email;
    if (this.busy()) return;
    if (email.invalid) {
      email.markAsTouched();
      this.status.set({ text: 'Enter your email address first.', error: true });
      return;
    }
    this.busy.set(true);
    this.status.set({ text: 'Sending a new code…', error: false });
    this.auth
      .resendVerification(email.value.trim())
      .pipe(
        finalize(() => this.busy.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => this.status.set({ text: 'A new code is on its way.', error: false }),
        error: (error: unknown) =>
          this.status.set({
            text: apiErrorMessage(error, 'Could not send a new code.'),
            error: true,
          }),
      });
  }
}
