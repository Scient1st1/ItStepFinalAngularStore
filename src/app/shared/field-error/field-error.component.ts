import { Component, computed, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl } from '@angular/forms';
import { map, startWith, switchMap } from 'rxjs';

@Component({
  selector: 'app-field-error',
  templateUrl: './field-error.component.html',
  styleUrl: './field-error.component.css',
})
export class FieldErrorComponent {
  readonly control = input.required<AbstractControl>();
  readonly label = input('This field');

  /** control.events as a signal: control state is not reactive under OnPush. */
  private readonly controlChanged = toSignal(
    toObservable(this.control).pipe(
      switchMap((control) =>
        control.events.pipe(
          map(() => ({})),
          startWith({}),
        ),
      ),
    ),
  );

  protected readonly message = computed(() => {
    this.controlChanged();
    const control = this.control();
    const errors = control.errors;
    if (!errors || !(control.touched || control.dirty)) return null;
    const label = this.label();
    if (errors['required']) return `${label} is required.`;
    if (errors['email']) return 'Enter a valid email address.';
    if (errors['minlength']) {
      return `${label} must be at least ${errors['minlength'].requiredLength} characters.`;
    }
    if (errors['maxlength']) {
      return `${label} must be at most ${errors['maxlength'].requiredLength} characters.`;
    }
    if (errors['pattern']) return `${label} is not in the expected format.`;
    if (errors['min']) return `${label} must be at least ${errors['min'].min}.`;
    if (errors['max']) return `${label} must be at most ${errors['max'].max}.`;
    if (errors['mismatch']) return 'Those passwords do not match.';
    return `${label} is not valid.`;
  });
}
