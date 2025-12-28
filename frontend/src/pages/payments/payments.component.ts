import { Component, Input } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { HttpClient } from '@angular/common/http';

declare var Stripe: any; // Declare Stripe as a global variable

@Component({
  selector: 'app-payments',
  standalone: true,
  imports: [],
  templateUrl: './payments.component.html',
  styleUrl: './payments.component.scss'
})
export class PaymentsComponent {

  apiUrl = environment.backendUrl;
  @Input() tokenSub: any | undefined;
  @Input() userProfile: any | undefined; 


  constructor(private http: HttpClient) { }

  setupPayment() {
    if (this.tokenSub) {
      // Use HttpClient to make the POST request
      this.http.post(`${this.apiUrl}/setup-payment-session`, {
        customerId: this.tokenSub,  // Auth0 user sub (or user ID)
        user: this.userProfile
      })
        .subscribe(
          (session: any) => {
            const stripe = Stripe('pk_test_51QZ0AuDj4emn7zxBsgePa5u6pljDu874fym798khfLn4Irg6Of0BXuX1Y3CAjn573FB1EemQCA2RIUngUega2ABd00J3rM1bfM');  // Stripe public key
            stripe.redirectToCheckout({ sessionId: session.sessionId });
          },
          (error) => {
            console.error('Error during checkout:', error);
          }
        );
    }
  }

  // Not currently used
  checkout() {
    if (this.tokenSub) {
      // Use HttpClient to make the POST request
      this.http.post(`${this.apiUrl}/create-checkout-session`, {
        customerId: this.tokenSub,  // Auth0 user sub (or user ID)
        user: this.userProfile 
      })
        .subscribe(
          (session: any) => {
            const stripe = Stripe('pk_test_51QZ0AuDj4emn7zxBsgePa5u6pljDu874fym798khfLn4Irg6Of0BXuX1Y3CAjn573FB1EemQCA2RIUngUega2ABd00J3rM1bfM');  // Stripe public key
            stripe.redirectToCheckout({ sessionId: session.sessionId });
          },
          (error) => {
            console.error('Error during checkout:', error);
          }
        );
    }

  }

  createPaymentIntent(amount: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/create-payment-intent`, { amount });
  }

}
