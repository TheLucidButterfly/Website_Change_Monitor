import { Component, OnInit } from '@angular/core';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-success',
  standalone: true,
  imports: [],
  templateUrl: './success.component.html',
  styleUrl: './success.component.scss'
})
export class SuccessComponent implements OnInit {

  constructor(
    private authService: AuthService
  ){}

  ngOnInit(): void {
    this.logout()
  }


  logout(): void {
    setTimeout(() => {
      this.authService.logout(); // Handle user logout
    }, 3000);

  }

}
