import { Injectable } from '@angular/core';
import { Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';

import { AuthenticationService } from '../services/auth.service';
import { AuthStorageService } from '../services/auth-storage.service';
import { AuthfakeauthenticationService } from '../services/authfake.service';



@Injectable({ providedIn: 'root' })
export class AuthGuard  {
    constructor(
        private router: Router,
        private authenticationService: AuthenticationService,
        private authStorageService: AuthStorageService,
    ) { }

    canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot) {
        // Check if user is logged in
        const currentUser = this.authStorageService.getCurrentUser();
        
        if (currentUser) {
            console.log('User is logged in', currentUser);
            // User is logged in, allow access
            return true;
        }
        
        // User is not logged in, redirect to login page
        // Store the attempted URL for redirecting after login
        this.router.navigate([''], { 
            queryParams: { returnUrl: state.url }
        });
        return false;
    }
}
