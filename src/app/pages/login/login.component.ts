import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { NO_STATUS, Status, apiErrorMessage, safeReturnUrl } from '../../core/utils/helpers';
import { FieldErrorComponent } from '../../shared/field-error/field-error.component';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, FieldErrorComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly params = toSignal(inject(ActivatedRoute).queryParamMap);

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  protected readonly busy = signal(false);
  protected readonly status = signal<Status>(NO_STATUS);

  private readonly returnUrl = computed(() => safeReturnUrl(this.params()?.get('returnUrl')));
  /** Keeps returnUrl on the way to /register. */
  protected readonly returnParam = computed(() =>
    this.returnUrl() === '/' ? null : this.returnUrl(),
  );

  protected readonly notice = computed(() => {
    const params = this.params();
    if (params?.get('verified')) return 'Email verified. Sign in to continue.';
    if (params?.get('reason') === 'session') return 'Your session ended. Please sign in again.';
    if (this.returnUrl() !== '/') return 'Sign in to continue.';
    return null;
  });

  protected submit(): void {
    if (this.busy()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.status.set({ text: 'Check the highlighted fields.', error: true });
      return;
    }
    const { email, password } = this.form.getRawValue();
    const returnUrl = this.returnUrl();
    this.busy.set(true);
    this.status.set({ text: 'Signing in…', error: false });
    this.auth
      .login({ email: email.trim(), password })
      .pipe(
        finalize(() => this.busy.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (result) => {
          if (result === 'verification-required') {
            void this.router.navigate(['/verify-email'], {
              queryParams: { email: email.trim(), returnUrl: this.returnParam() },
            });
          } else {
            void this.router.navigateByUrl(returnUrl);
          }
        },
        error: (error: unknown) =>
          this.status.set({ text: apiErrorMessage(error, 'Could not sign in.'), error: true }),
      });
  }
}
