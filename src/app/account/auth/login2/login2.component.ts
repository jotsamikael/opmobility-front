import { Component, OnInit } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { first } from 'rxjs/operators';

import { GlobalFormBuilder } from 'src/app/core/globalFormBuilder';
import { AuthenticationService } from 'src/app/core/services/auth.service';
import { NotificationService } from 'src/app/core/services/notification.service';
import { AuthErrorResponse } from 'src/app/core/interfaces/api-error.interface';

import { OwlOptions } from 'ngx-owl-carousel-o';

@Component({
  selector: 'app-login2',
  templateUrl: './login2.component.html',
  styleUrls: ['./login2.component.scss']
})
export class Login2Component implements OnInit {
  loginForm: FormGroup;
  isLoading = false;
  submitted = false;
  returnUrl: string;
  showPassword = false;

  // set the current year
  year: number = new Date().getFullYear();

  constructor(
    private formBuilder: GlobalFormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthenticationService,
    private notificationService: NotificationService
  ) {}

  ngOnInit(): void {
    this.loginForm = this.formBuilder.createLoginForm();
    this.returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/backend/staff';
    
    // Redirect if already authenticated
    if (this.authService.isAuthenticated()) {
      this.router.navigate([this.returnUrl]);
    }
  }

  carouselOption: OwlOptions = {
    items: 1,
    loop: false,
    margin: 0,
    nav: false,
    dots: true,
    responsive: {
      680: {
        items: 1
      },
    }
  }

  // convenience getter for easy access to form fields
  get f() { return this.loginForm.controls; }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  /**
   * Login function
   */
  loginFun(): void {
    this.submitted = true;

    // Stop here if form is invalid
    if (this.loginForm.invalid) {
      return;
    }

    this.isLoading = true;

    const authRequest = {
      email: this.loginForm.value.email,
      password: this.loginForm.value.password
    };

    this.authService.login(authRequest).subscribe({
      next: (response) => {
        this.notificationService.success('Login successful! Welcome back.');
        this.router.navigate([this.returnUrl]);
      },
      error: (error: AuthErrorResponse) => {
        this.isLoading = false;
        
        // Display appropriate error message based on error type
        this.handleLoginError(error);
      },
      complete: () => {
        this.isLoading = false;
      }
    });
  }

  /**
   * Handle login errors with appropriate user feedback
   */
  private handleLoginError(error: AuthErrorResponse): void {
    switch (error.type) {
      case 'credentials':
        this.notificationService.error(error.message);
        // Clear password field for credential errors
        this.loginForm.patchValue({ password: '' });
        this.loginForm.get('password')?.markAsTouched();
        break;
        
      case 'validation':
        this.notificationService.error(error.message);
        // Highlight the problematic field if specified
        if (error.field) {
          const field = this.loginForm.get(error.field);
          if (field) {
            field.markAsTouched();
            field.setErrors({ invalid: true });
          }
        }
        break;
        
      case 'account':
        this.notificationService.warning(error.message);
        break;
        
      case 'network':
        this.notificationService.error(error.message);
        break;
        
      case 'server':
        this.notificationService.error(error.message);
        break;
        
      default:
        this.notificationService.error(error.message);
        break;
    }
  }
}
