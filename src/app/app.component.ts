import { Component , OnInit} from '@angular/core';
import { AuthenticationService } from './core/services/auth.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit  {
  constructor(private authenticationService: AuthenticationService) {}

  ngOnInit() {
    // document.getElementsByTagName("html")[0].setAttribute("dir", "rtl");
    if (this.authenticationService.isAuthenticated()) {
      this.authenticationService.syncCurrentUser().subscribe({
        error: () => {
          // 401 handling is done in AuthInterceptor
        }
      });
    }
  }
}
