import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { LoginResponseDto, UserResponseDto } from '../../opmobilitybackend/models';

export interface AuthUser {
  user: UserResponseDto;
  accessToken: string;
  refreshToken: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthStorageService {
  private readonly ACCESS_TOKEN_KEY = 'access_token';
  private readonly REFRESH_TOKEN_KEY = 'refresh_token';
  private readonly USER_KEY = 'current_user';
  
  private currentUserSubject = new BehaviorSubject<AuthUser | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor() {
    this.loadUserFromStorage();
  }

  /**
   * Store authentication data in localStorage storage
   */
  setAuthData(authData: LoginResponseDto): void {
    const authUser: AuthUser = {
      user: authData.user,
      accessToken: authData.access_token,
      refreshToken: authData.refresh_token
    };

    localStorage.setItem(this.ACCESS_TOKEN_KEY, authData.access_token);
    localStorage.setItem(this.REFRESH_TOKEN_KEY, authData.refresh_token);
    localStorage.setItem(this.USER_KEY, JSON.stringify(authData.user));
    
    this.currentUserSubject.next(authUser);
  }

  /**
   * Get current user from localStorage storage
   */
  getCurrentUser(): AuthUser | null {
    return this.currentUserSubject.value;
  }

  /**
   * Get access token from localStorage storage
   */
  getAccessToken(): string | null {
    return localStorage.getItem(this.ACCESS_TOKEN_KEY);
  }

  /**
   * Get refresh token from localStorage storage
   */
  getRefreshToken(): string | null {
    return localStorage.getItem(this.REFRESH_TOKEN_KEY);
  }

  /**
   * Update access token (for token refresh)
   */
  updateAccessToken(newAccessToken: string): void {
    localStorage.setItem(this.ACCESS_TOKEN_KEY, newAccessToken);
    const currentUser = this.currentUserSubject.value;
    if (currentUser) {
      currentUser.accessToken = newAccessToken;
      this.currentUserSubject.next(currentUser);
    }
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!this.getAccessToken();
  }

  /**
   * Clear all authentication data
   */
  clearAuthData(): void {
    localStorage.removeItem(this.ACCESS_TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    this.currentUserSubject.next(null);
  }

  /**
   * Load user data from localStorage storage on app initialization
   */
  private loadUserFromStorage(): void {
    const accessToken = this.getAccessToken();
    const refreshToken = this.getRefreshToken();
    const userStr = localStorage.getItem(this.USER_KEY);

    if (accessToken && refreshToken && userStr) {
      try {
        const user = JSON.parse(userStr);
        const authUser: AuthUser = {
          user,
          accessToken,
          refreshToken
        };
        this.currentUserSubject.next(authUser);
      } catch (error) {
        console.error('Error parsing stored user data:', error);
        this.clearAuthData();
      }
    }
  }
}
