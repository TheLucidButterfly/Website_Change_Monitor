import { Injectable, inject } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root',
})
export class AuthGuard implements CanActivate {
  private auth = inject(AuthService);
  private router = inject(Router);

  canActivate(): Observable<boolean> {
    return this.auth.isAuthenticated$.pipe(
      map((isAuthenticated) => {
        if (!isAuthenticated) {
          this.router.navigate(['/login']); // Redirect to login page if not authenticated
          return false;
        }
        return true; // Allow access if authenticated
      }),
      catchError((err) => {
        console.error('Error checking authentication status:', err);
        this.router.navigate(['/login']); // Redirect to login page on error
        return of(false);
      })
    );
  }
}
