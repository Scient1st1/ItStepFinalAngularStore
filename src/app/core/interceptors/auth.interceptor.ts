import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth.service';

/** Adds the Bearer token; on 401 clears the session and goes to /login. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiUrl)) return next(req);

  const auth = inject(AuthService);
  const token = auth.token();
  const request = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(request).pipe(
    catchError((error: unknown) => {
      // The sign-in endpoints report bad credentials themselves.
      const isAuthEndpoint = req.url.startsWith(`${environment.apiUrl}/api/auth/`);
      if (error instanceof HttpErrorResponse && error.status === 401 && !isAuthEndpoint) {
        auth.handleUnauthorized();
      }
      return throwError(() => error);
    }),
  );
};
