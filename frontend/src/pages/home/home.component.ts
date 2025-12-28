import { Component, OnInit } from '@angular/core';
import { environment } from '../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { catchError, map, Observable, of, switchMap, throwError } from 'rxjs';
import { PaymentsComponent } from '../payments/payments.component';
import { User } from '../../interfaces/user.interface';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, PaymentsComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent implements OnInit {
  title = 'frontend';
  inputText: string = ''; // The text user inputs for keyword extraction
  keywords: any[] = [];   // Extracted keywords
  isLoading: boolean = false; // Flag to show loading state
  errorMessage: any = '';  // Error message to display if any issue occurs
  apiUrl = environment.backendUrl; // Backend API URL
  user!: User;  // User data from Auth0
  token: any; // User authentication token
  usageLimitReached: boolean = false;  // Flag to track if the user has reached the usage limit
  devMode = true;
  // Component Class
  readonly textLimit = 70; // Set a limit for non-registered users

  constructor(private http: HttpClient, private authService: AuthService) { }

  ngOnInit(): void {
    let initialSub = this.authService.isAuthenticated()
      .pipe(
        switchMap((isAuthenticated: boolean) => {
          if (isAuthenticated) {
            return this.authService.getUser(); // Fetch the user data
          } else {
            return of(null);
          }
        }),
        switchMap((user: any) => {
          if (user) {
            this.user = user;
            return this.authService.getToken(); // Fetch the Auth0 token
          } else {
            return of(null);
          }
        }),
        switchMap((token: any) => {
          if (token && this.user) {
            this.token = token;
            return this.getUserMetadata(this.user, false); // Get the user metadata to check usage
          } else {
            return of(null);
          }
        }),
        switchMap((metaData: any) => {
          return this.getValidPaymentMethod();
        })
      )
      .subscribe((validPaymentMethod: any) => {
        initialSub.unsubscribe();
       });
  }

  private isWithinTextLimit(inputElement: any, event: any) {
    return this.user?.metadata?.isRegistered && inputElement.value.length > this.textLimit
  }

  private isWithinUsageLimit() {
    return !this.usageLimitReached ||
    !this.user.isRegistered;

  }

  getValidPaymentMethod(): Observable<any>{
    return this.http.get(`${this.apiUrl}/payment-method?stripeCustomerId=${this.user.stripeCustomerId}`)
    .pipe(
      map((response: any) => {
        if (response.default_payment_method) {
          console.log('User has a valid payment method attached.');
          return response.default_payment_method; // Return the payment method if valid
        } else {
          console.log('No payment method attached.');
          return null; // Indicate no payment method attached
        }
      }),
      catchError((err) => {
        console.error('Error retrieving payment method:', err);
        return throwError(() => new Error('Failed to fetch payment method.'));
      })
    );
  }


  onInputChange(event: Event): void {
    const inputElement = event.target as HTMLTextAreaElement;
    // Enforce character limit for non-registered users
    if (!this.isWithinTextLimit(inputElement, event)) {
      inputElement.value = inputElement.value.substring(0, this.textLimit);
      this.errorMessage = `Non-registered users can only enter up to ${this.textLimit} characters.`;
    } else {
      this.errorMessage = ''; // Clear error if within limit
    }
    this.inputText = inputElement.value; // Update the model
  }

  // Method to handle keyword extraction
  extractKeywords(): void {
    // Validate input
    if (!this.inputText.trim()) {
      this.errorMessage = 'Please enter some text.';
      return;
    }

    // Check usage limit locally for non-premium users
    if (!this.isWithinUsageLimit()) {
      this.errorMessage = 'You have reached your free usage limit. Please upgrade to continue.';
      return;
    }

    // Set loading state
    this.isLoading = true;
    this.errorMessage = '';



    // Make the extraction API call
    this.http.post<any>(`${this.apiUrl}/extract-keywords`, {
      text: this.inputText,
      user: this.user, // Include user ID for tracking
      isRegistered: this.user?.isRegistered
    })
      .pipe(
        switchMap((response) => {
          // Update extracted keywords
          this.keywords = response.keywords;

          // Handle usage tracking for free users
          if (!this.user?.metadata?.isRegistered && response.usageCount !== undefined) {
            this.usageLimitReached = response.usageCount >= this.user?.metadata?.usageLimit;
            if (this.usageLimitReached) {
              this.errorMessage = 'You have reached your free usage limit. Please upgrade to continue.';
            }
          }
          if (!this.keywords.length) {
            this.errorMessage = 'No keywords found';
          }

          // Fetch updated user metadata
          return this.getUserMetadata(this.user, false);
        })
      )
      .subscribe({
        next: (metadataResponse) => {
          // Update local user metadata with refreshed data
          this.user.metadata = metadataResponse.app_metadata;

          // Clear loading state
          this.isLoading = false;
        },
        error: (error) => {
          // Handle errors
          this.errorMessage = error?.error?.error || 'Error extracting keywords.';
          this.isLoading = false;
        },
      });
  }


  // Method to get the user metadata, including usage limits from the server
  getUserMetadata(user: User, trackUsage = true): Observable<any> {
    return this.authService.getUserMetadata(`${this.apiUrl}/api/user-metadata`, { token: user, trackUsage: trackUsage })
      .pipe(
        map((res: any) => {
        const metadata = res?.app_metadata;
        if (metadata) {
          // Merge metadata (usage limits) into the user object
          this.user = { ...this.user, ...metadata };

          // Check if the user has reached their usage limit
          this.usageLimitReached = metadata?.usageLimitReached || false;
        }
        return metadata;
      }),
      catchError((err: any) => {
        console.error('error in getUserMetadata',err)
        return of({ errorMessage: 'Error in the function: getUserMetadata. ', error:err});
      })
    ) // Send user token to the server
    /**
     * Res looks like:
     * {
        app_metadata: response.data.app_metadata,
        usageCount: usageCount, // Include updated usage count in the response
      }
     */
  }

  logout(): void {
    this.authService.logout(); // Handle user logout
  }

  updateAccountInfo(){
    window.location.href = "https://billing.stripe.com/p/login/test_5kA5lu7e1fMJcuI144";
  }

}
