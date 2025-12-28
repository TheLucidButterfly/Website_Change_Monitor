import { Component, OnInit, OnDestroy, inject, Inject, PLATFORM_ID } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { Subscription } from 'rxjs';
import { isPlatformBrowser } from '@angular/common';

@Component({
  selector: 'app-login',
  standalone: true,
  templateUrl: 'login.component.html',
  styleUrls: ['login.component.scss'],
})
export class LoginComponent implements OnInit, OnDestroy {
  private authSubscription!: Subscription;

  constructor(
    private auth: AuthService,
    private router: Router,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  public isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  ngOnInit(): void {
    // Subscribe to authentication status to check if already logged in
    this.authSubscription = this.auth.isAuthenticated().subscribe({
      next: (isAuthenticated: any) => {
        if (isAuthenticated) {
          this.router.navigate(['/home']); // Navigate to home on successful login
        }
      },
      error: (error) => {
        console.error('Error during authentication check:', error);
      },
    });

    // Handle redirect callback if needed (only run this in the browser)
    if (this.isBrowser()) {
      this.auth.handleAuthCallback();
    }
  }

  ngOnDestroy(): void {
    // Unsubscribe from the authentication status subscription to avoid memory leaks
    if (this.authSubscription) {
      this.authSubscription.unsubscribe();
    }
  }

  // Trigger login process
  login(): void {
    this.auth.login(); // Delegate the login to the AuthService
  }
}
