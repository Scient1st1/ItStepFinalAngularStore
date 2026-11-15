import { HttpErrorResponse } from '@angular/common/http';
import { ApiProblem } from '../models/api.models';

export interface Status {
  text: string;
  error: boolean;
}

export const NO_STATUS: Status = { text: '', error: false };

export function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) return 'Could not reach the shop. Check your connection and try again.';
    const body: unknown = error.error;
    if (body && typeof body === 'object') {
      const problem = body as ApiProblem;
      const fieldErrors = Object.values(problem.errors ?? {})
        .flat()
        .filter((text): text is string => typeof text === 'string' && text.length > 0);
      if (fieldErrors.length) return fieldErrors.join(' ');
      if (typeof problem.detail === 'string' && problem.detail) return problem.detail;
      if (typeof problem.message === 'string' && problem.message) return problem.message;
    }
    return fallback;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

/** http(s) links only, otherwise ''. */
export function safeImageUrl(value: string | null | undefined): string {
  try {
    const url = new URL(value ?? '');
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

/** Only in-app paths are accepted as a place to return to after signing in. */
export function safeReturnUrl(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  return /^\/(login|register|verify-email)\b/.test(value) ? '/' : value;
}
