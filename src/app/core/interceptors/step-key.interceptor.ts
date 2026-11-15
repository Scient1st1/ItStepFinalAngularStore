import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export const stepKeyInterceptor: HttpInterceptorFn = (req, next) =>
  req.url.startsWith(environment.apiUrl)
    ? next(req.clone({ setHeaders: { 'X-STEP-KEY': environment.stepKey } }))
    : next(req);
