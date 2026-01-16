import { Injectable } from '@angular/core';
import { Observable, throwError, BehaviorSubject } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthStorageService } from './auth-storage.service';
import { AuthErrorResponse, ApiErrorResponse } from '../interfaces/api-error.interface';
import { LoginResponseDto, RefreshTokenResponseDto } from 'src/app/opmobilitybackend/models';
import { AuthService } from 'src/app/opmobilitybackend/services/auth.service';

export interface LoginRequest {
  email: string;
  password: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthenticationService {
  private isAuthenticatedSubject = new BehaviorSubject<boolean>(false);
  public isAuthenticated$ = this.isAuthenticatedSubject.asObservable();

  constructor(
    private authService: AuthService,
    private authStorageService: AuthStorageService
  ) {
    // Initialize authentication state
    this.isAuthenticatedSubject.next(this.authStorageService.isAuthenticated());
    
    // Subscribe to user changes
    this.authStorageService.currentUser$.subscribe(user => {
      this.isAuthenticatedSubject.next(!!user);
    });
  }

  /**
   * Login user with email and password
   */
  login(credentials: LoginRequest): Observable<LoginResponseDto> {
    return this.authService.authControllerLoginV1({
      body: credentials
    }).pipe(
      tap((response: LoginResponseDto) => {
        // Store authentication data
        this.authStorageService.setAuthData(response);
      }),
      catchError((error) => {
        return throwError(() => this.handleLoginError(error));
      })
    );
  }

  /**
   * Logout user
   */
  logout(): void {
    this.authStorageService.clearAuthData();
  }

  /**
   * Get current user
   */
  getCurrentUser() {
    return this.authStorageService.getCurrentUser();
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.authStorageService.isAuthenticated();
  }

  /**
   * Get access token
   */
  getAccessToken(): string | null {
    return this.authStorageService.getAccessToken();
  }

  /**
   * Get refresh token
   */
  getRefreshToken(): string | null {
    return this.authStorageService.getRefreshToken();
  }


   /**
   * Refresh access token
   */
   refreshToken(): Observable<RefreshTokenResponseDto> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      return throwError(() => new Error('No refresh token available'));
    }
    
    return this.authService.authControllerRefreshTokenV1({ body: { refreshToken } }).pipe(
      tap((response) => {
        this.authStorageService.updateAccessToken(response.access_token || response.access_token);
      }),
      catchError((error) => {
        // If refresh fails, logout user
        this.logout();
        return throwError(() => this.handleLoginError(error));
      })
    );
  }

  /**
   * Handle login errors and categorize them based on backend response
   */
  private handleLoginError(error: HttpErrorResponse): AuthErrorResponse {
    console.error('Raw error object:', error);
    console.error('Error status:', error.status);
    console.error('Error body:', error.error);

    // Network/Connection errors
    if (error.status === 0 || error.status === 504 || error.status === 503) {
      return {
        message: 'No internet connection. Please check your network and try again.',
        type: 'network'
      };
    }

    // HTTP Status Code based error handling
    switch (error.status) {
      case 400:
        return this.handleBadRequestError(error);
      
      case 401:
        return this.handleUnauthorizedError(error);
      
      case 403:
        return {
          message: 'Access denied. Your account may be suspended or you lack the required permissions.',
          type: 'account'
        };
      
      case 404:
        return {
          message: 'Service not found. Please contact support if this issue persists.',
          type: 'server'
        };
      
      case 409:
        return {
          message: 'Account conflict detected. Please contact support.',
          type: 'account'
        };
      
      case 422:
        return this.handleValidationError(error);
      
      case 429:
        return {
          message: 'Too many login attempts. Please wait a few minutes before trying again.',
          type: 'account'
        };
      
      case 500:
      case 502:
      case 503:
        return {
          message: 'Server error. Please try again later or contact support if the problem persists.',
          type: 'server'
        };
      
      default:
        return this.handleGenericError(error);
    }
  }

  /**
   * Handle 400 Bad Request errors
   */
  private handleBadRequestError(error: HttpErrorResponse): AuthErrorResponse {
    console.log('Handling 400 error:', error.error);
    
    // Try to extract error message from different possible locations
    let errorMessage = this.extractErrorMessage(error);
    
    if (errorMessage) {
      return {
        message: errorMessage,
        type: 'validation'
      };
    }

    return {
      message: 'Invalid request. Please check your input and try again.',
      type: 'validation'
    };
  }

  /**
   * Handle 401 Unauthorized errors
   */
  private handleUnauthorizedError(error: HttpErrorResponse): AuthErrorResponse {
    console.log('Handling 401 error:', error.error);
    
    // Try to extract error message from different possible locations
    let errorMessage = this.extractErrorMessage(error);
    
    if (errorMessage) {
      // Check for specific error messages from backend
      const messageLower = errorMessage.toLowerCase();
      
      if (messageLower.includes('invalid credentials') || 
          messageLower.includes('account not exists') ||
          messageLower.includes('user not found')) {
        return {
          message: 'Invalid email or password. Please check your credentials and try again.',
          type: 'credentials'
        };
      }
      
      if (messageLower.includes('account not verified')) {
        return {
          message: 'Your account is not verified. Please check your email for verification instructions.',
          type: 'account'
        };
      }
      
      if (messageLower.includes('account suspended')) {
        return {
          message: 'Your account has been suspended. Please contact support for assistance.',
          type: 'account'
        };
      }
      
      // Return the actual server message for other cases
      return {
        message: errorMessage,
        type: 'credentials'
      };
    }

    // Default message for 401 errors
    return {
      message: 'Invalid email or password. Please check your credentials and try again.',
      type: 'credentials'
    };
  }

  /**
   * Handle 422 Validation errors
   */
  private handleValidationError(error: HttpErrorResponse): AuthErrorResponse {
    console.log('Handling 422 error:', error.error);
    
    let errorMessage = this.extractErrorMessage(error);
    
    if (errorMessage) {
      return {
        message: errorMessage,
        type: 'validation'
      };
    }

    return {
      message: 'Validation error. Please check your input and try again.',
      type: 'validation'
    };
  }

  /**
   * Handle generic/unknown errors
   */
  private handleGenericError(error: HttpErrorResponse): AuthErrorResponse {
    console.log('Handling generic error:', error.error);
    
    let errorMessage = this.extractErrorMessage(error);
    
    if (errorMessage) {
      return {
        message: errorMessage,
        type: 'unknown'
      };
    }

    return {
      message: 'An unexpected error occurred. Please try again or contact support if the problem persists.',
      type: 'unknown'
    };
  }

  /**
   * Extract error message from HTTP error response
   */
  private extractErrorMessage(error: HttpErrorResponse): string | null {
    // Check if error.error exists and has a message property
    if (error.error && typeof error.error === 'object') {
      // Try different possible message properties
      if (error.error.message) {
        if (Array.isArray(error.error.message)) {
          return error.error.message[0];
        }
        return error.error.message;
      }
      
      if (error.error.error) {
        return error.error.error;
      }
      
      if (error.error.detail) {
        return error.error.detail;
      }
      
      if (error.error.description) {
        return error.error.description;
      }
    }
    
    // Check if error.error is a string
    if (typeof error.error === 'string') {
      return error.error;
    }
    
    // Check if error.message exists
    if (error.message) {
      return error.message;
    }
    
    return null;
    }
}

