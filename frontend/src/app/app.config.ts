import { ApplicationConfig, PLATFORM_ID, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideClientHydration } from '@angular/platform-browser';
import { provideAuth0 } from '@auth0/auth0-angular';
import { isPlatformBrowser } from '@angular/common';

import { routes } from './app.routes';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    // Provide a custom factory to determine if the app is running in the browser
    {
      provide: 'isBrowser',
      useFactory: (platformId: object) => isPlatformBrowser(platformId),
      deps: [PLATFORM_ID],
    },

    // Enable Angular's zone-based change detection
    provideZoneChangeDetection({ eventCoalescing: true }),

    // Provide routing configuration
    provideRouter(routes),

    // Enable hydration for server-side rendering
    provideClientHydration(),

    // Provide HTTP client for making API requests
    provideHttpClient(),

    // Configure Auth0 authentication provider
    provideAuth0({
      domain: environment.auth0Domain,       // Auth0 domain
      clientId: environment.auth0ClientId,   // Auth0 client ID
      authorizationParams: {
        redirect_uri: (environment.auth0RedirectUri + '/home' || window?.location.origin || 'localhost:4200'), // Redirect URI
      },
      cacheLocation: 'localstorage',         // Store tokens in localStorage for persistence
      useRefreshTokens: true,                // Enable refresh token rotation for security
      errorPath: '/error',                   // Route to navigate to on authentication errors
    }),
  ],
};
