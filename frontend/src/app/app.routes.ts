import { Router, Routes } from '@angular/router';
import { LoginComponent } from '../pages/login/login.component';
import { inject } from '@angular/core';
import { AuthService } from '@auth0/auth0-angular';
import { map } from 'rxjs';
import { HomeComponent } from '../pages/home/home.component';
import { AuthGuard } from '../guards/auth.guard';
import { SuccessComponent } from '../pages/success/success.component';

export const routes: Routes = [
    {
      path: '',
      redirectTo: 'login',
      pathMatch: 'full',
    },
    {
      path: 'login',
      component: LoginComponent,
      canActivate: [
        () =>
          inject(AuthService).isAuthenticated$.pipe(
            map((isAuthenticated: boolean) => {
              if (isAuthenticated) {
                return '/home'; // Redirect to home if already logged in
              }
              return true; // Allow access to login if not logged in
            })
          ),
      ],
    },
    {
      path: 'home',
      component: HomeComponent,
      canActivate: [AuthGuard], // Protect the home route with the AuthGuard
    },
    { 
      path: 'success', 
      component: SuccessComponent 
    },
    {
      path: '**',
      redirectTo: 'login', // Redirect to login if no matching routes
    },
  ];
