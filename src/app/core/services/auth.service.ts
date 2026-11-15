import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, map, of, switchMap, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ApiResponse,
  AuthTokens,
  LoginRequest,
  RegisterRequest,
  UserResponse,
  VerifyEmailRequest,
} from '../models/api.models';
import { safeReturnUrl } from '../utils/helpers';

/** Per-tab session: sessionStorage only. */
const TOKEN_KEY = 'nocturne-auth-token';

export type LoginResult = 'signed-in' | 'verification-required';

function decodeExpiry(token: string): number | null {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const exp = JSON.parse(atob(payload)).exp;
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch {
    return null;
  }
}

function readStoredToken(): string | null {
  try {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    const expiresAt = decodeExpiry(token);
    if (expiresAt !== null && expiresAt <= Date.now()) {
      sessionStorage.removeItem(TOKEN_KEY);
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

/** Unverified accounts get placeholder tokens instead of a real JWT. */
function isRealToken(token: unknown): token is string {
  return typeof token === 'string' && token.length > 0 && !token.includes('Verification');
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly api = `${environment.apiUrl}/api`;

  private readonly tokenState = signal<string | null>(readStoredToken());

  readonly token = this.tokenState.asReadonly();
  readonly user = signal<UserResponse | null>(null);
  readonly isLoggedIn = computed(() => this.tokenState() !== null);

  /** Restores the session after a reload. */
  restore(): void {
    if (this.isLoggedIn()) this.loadUser().subscribe({ error: () => undefined });
  }

  register(body: RegisterRequest): Observable<unknown> {
    return this.http.post<unknown>(`${this.api}/auth/register`, body);
  }

  login(credentials: LoginRequest): Observable<LoginResult> {
    return this.http.post<ApiResponse<AuthTokens>>(`${this.api}/auth/login`, credentials).pipe(
      switchMap((response) => {
        const token = response?.data?.accessToken;
        if (!isRealToken(token)) return of<LoginResult>('verification-required');
        return this.startSession(token).pipe(map((): LoginResult => 'signed-in'));
      }),
    );
  }

  /** Emits true when the API also signed the user in. */
  verifyEmail(body: VerifyEmailRequest): Observable<boolean> {
    return this.http
      .put<ApiResponse<AuthTokens> | null>(`${this.api}/auth/verify-email`, body)
      .pipe(
        switchMap((response) => {
          const token = response?.data?.accessToken;
          return isRealToken(token) ? this.startSession(token).pipe(map(() => true)) : of(false);
        }),
      );
  }

  resendVerification(email: string): Observable<unknown> {
    const path = `${this.api}/auth/resend-email-verification/${encodeURIComponent(email)}`;
    return this.http.post<unknown>(path, {});
  }

  loadUser(): Observable<UserResponse> {
    return this.http.get<ApiResponse<UserResponse>>(`${this.api}/users/me`).pipe(
      map((response) => response.data),
      tap((user) => this.user.set(user)),
    );
  }

  logout(): void {
    this.clearSession();
    void this.router.navigateByUrl('/');
  }

  clearSession(): void {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      // Nothing to remove if storage is unavailable.
    }
    this.tokenState.set(null);
    this.user.set(null);
  }

  redirectToLogin(returnUrl: string = this.currentUrl(), reason?: 'session'): void {
    const target = safeReturnUrl(returnUrl);
    void this.router.navigate(['/login'], {
      queryParams: { returnUrl: target === '/' ? null : target, reason: reason ?? null },
    });
  }

  handleUnauthorized(): void {
    const hadSession = this.isLoggedIn();
    const url = this.currentUrl();
    this.clearSession();
    if (!url.startsWith('/login')) this.redirectToLogin(url, hadSession ? 'session' : undefined);
  }

  /** During a pending navigation router.url is stale, so the target wins. */
  private currentUrl(): string {
    const navigation = this.router.currentNavigation();
    return (navigation?.finalUrl ?? navigation?.extractedUrl)?.toString() ?? this.router.url;
  }

  private startSession(token: string): Observable<UserResponse | null> {
    try {
      sessionStorage.setItem(TOKEN_KEY, token);
    } catch {
      // Without storage the session still works until the tab reloads.
    }
    this.tokenState.set(token);
    // A failed profile request must not undo the sign-in.
    return this.loadUser().pipe(catchError(() => of(null)));
  }
}
