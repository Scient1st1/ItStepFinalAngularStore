import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { NO_STATUS, Status, apiErrorMessage, safeReturnUrl } from '../../core/utils/helpers';
import { FieldErrorComponent } from '../../shared/field-error/field-error.component';

function matchesPassword(control: AbstractControl): ValidationErrors | null {
  const password = control.parent?.get('password')?.value;
  return control.value && control.value !== password ? { mismatch: true } : null;
}

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink, FieldErrorComponent],
  templateUrl: './register.component.html',
  styleUrl: './register.component.css',
})
export class RegisterComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly params = toSignal(inject(ActivatedRoute).queryParamMap);

  protected readonly form = inject(NonNullableFormBuilder).group({
    firstName: ['', [Validators.required, Validators.maxLength(50)]],
    lastName: ['', [Validators.required, Validators.maxLength(50)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['', [Validators.required, matchesPassword]],
  });

  protected readonly busy = signal(false);
  protected readonly status = signal<Status>(NO_STATUS);

  protected readonly returnParam = computed(() => {
    const url = safeReturnUrl(this.params()?.get('returnUrl'));
    return url === '/' ? null : url;
  });

  constructor() {
    // Re-check the confirmation whenever the password itself changes.
    this.form.controls.password.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.form.controls.confirmPassword.updateValueAndValidity());
  }

  protected submit(): void {
    if (this.busy()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.status.set({ text: 'Check the highlighted fields.', error: true });
      return;
    }
    const value = this.form.getRawValue();
    const email = value.email.trim();
    this.busy.set(true);
    this.status.set({ text: 'Creating your account…', error: false });
    this.auth
      .register({
        firstName: value.firstName.trim(),
        lastName: value.lastName.trim(),
        email,
        password: value.password,
      })
      .pipe(
        finalize(() => this.busy.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () =>
          void this.router.navigate(['/verify-email'], {
            queryParams: { email, sent: 1, returnUrl: this.returnParam() },
          }),
        error: (error: unknown) =>
          this.status.set({
            text: apiErrorMessage(error, 'Could not create the account.'),
            error: true,
          }),
      });
  }
}
