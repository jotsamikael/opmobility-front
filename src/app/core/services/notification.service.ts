import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export interface Notification {
  id: string;
  message: string;
  type: 'success' | 'danger' | 'warning' | 'info' | 'primary' | 'secondary';
  duration?: number;
  dismissible?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private notificationSubject = new Subject<Notification>();
  public notifications$ = this.notificationSubject.asObservable();

  /**
   * Show success notification
   */
  success(message: string, duration: number = 5000): void {
    this.showNotification({ 
      id: this.generateId(),
      message, 
      type: 'success', 
      duration,
      dismissible: true 
    });
  }

  /**
   * Show error notification
   */
  error(message: string, duration: number = 7000): void {
    this.showNotification({ 
      id: this.generateId(),
      message, 
      type: 'danger', 
      duration,
      dismissible: true 
    });
  }

  /**
   * Show warning notification
   */
  warning(message: string, duration: number = 5000): void {
    this.showNotification({ 
      id: this.generateId(),
      message, 
      type: 'warning', 
      duration,
      dismissible: true 
    });
  }

  /**
   * Show info notification
   */
  info(message: string, duration: number = 5000): void {
    this.showNotification({ 
      id: this.generateId(),
      message, 
      type: 'info', 
      duration,
      dismissible: true 
    });
  }

  /**
   * Show primary notification
   */
  primary(message: string, duration: number = 5000): void {
    this.showNotification({ 
      id: this.generateId(),
      message, 
      type: 'primary', 
      duration,
      dismissible: true 
    });
  }

  /**
   * Show secondary notification
   */
  secondary(message: string, duration: number = 5000): void {
    this.showNotification({ 
      id: this.generateId(),
      message, 
      type: 'secondary', 
      duration,
      dismissible: true 
    });
  }

  /**
   * Show notification
   */
  private showNotification(notification: Notification): void {
    this.notificationSubject.next(notification);
  }

  /**
   * Generate unique ID for notifications
   */
  private generateId(): string {
    return 'notification-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }
}
