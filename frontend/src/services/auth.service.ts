import { Injectable, Inject } from '@angular/core';
import { AuthService as Auth0Service } from '@auth0/auth0-angular';
import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import { Observable, of } from 'rxjs';
import { environment } from '../environments/environment';
import { catchError, map } from 'rxjs/operators';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private accessToken: string | null = null; // In-memory storage for access token

  constructor(
    private auth0: Auth0Service,
    private http: HttpClient,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  /** Check if we're in the browser */
  private isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  /** Login using Auth0 */
  login() {
    if (this.isBrowser()) {
      this.auth0.loginWithRedirect().subscribe({
        next: () => console.log('Redirecting to login...'),
        error: (err) => console.error('Error during login redirect:', err),
      });
    } else {
      console.warn('Attempted login in a non-browser environment.');
    }
  }

  /** Logout using Auth0 */
  logout() {
    if (this.isBrowser()) {
      this.auth0.logout({
        logoutParams: { returnTo: `${environment.auth0RedirectUri}/login` },
      });
    } else {
      console.warn('Attempted logout in a non-browser environment.');
    }
  }

  /** Check if user is authenticated */
  isAuthenticated(): Observable<boolean> {
    if (this.isBrowser()) {
      return this.auth0.isAuthenticated$.pipe(
        map((auth) => !!auth),
        catchError(() => of(false)) // Fallback in case of an error
      );
    }
    console.warn('Authentication check attempted in a non-browser environment.');
    return of(false);
  }

  /** Retrieve the current user's details */
  getUser(): Observable<any> {
    return this.isBrowser() ? this.auth0.user$ : of(null);
  }

  /** Retrieve access token and store it in memory */
  getToken(): Observable<string | null> {
    if (!this.isBrowser()) {
      console.warn('Token retrieval attempted in a non-browser environment.');
      return of(null);
    }

    return this.auth0.idTokenClaims$.pipe(
      map((claims) => {
        if (claims && claims.__raw) {
          this.accessToken = claims.__raw; // Cache the token in memory
          return this.accessToken;
        }
        return null;
      }),
      catchError((err) => {
        console.error('Error retrieving token:', err);
        return of(null);
      })
    );
  }

  /** Handle Auth0 callback */
  handleAuthCallback() {
    if (this.isBrowser()) {
      this.auth0.handleRedirectCallback().subscribe({
        next: () => console.log('Auth0 callback handled.'),
        error: (err) => console.error('Error during Auth0 callback:', err),
      });
    } else {
      console.warn('Callback handling attempted in a non-browser environment.');
    }
  }

  getUserMetadata(url: string, details: any){
    return this.http.post(url, details);
  }
}
