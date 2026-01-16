import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { NotificationService, Notification } from '../../../core/services/notification.service';

@Component({
  selector: 'app-notification',
  template: `
    <div class="notification-container">
      <div *ngFor="let notification of activeNotifications" class="notification-item">
        <alert 
          [type]="notification.type" 
          [dismissible]="notification.dismissible"
          (close)="removeNotification(notification.id)"
          class="notification-alert">
          {{ notification.message }}
        </alert>
      </div>
    </div>
  `,
  styles: [`
    .notification-container {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 9999;
      max-width: 400px;
      pointer-events: none;
    }

    .notification-item {
      margin-bottom: 10px;
      pointer-events: auto;
      animation: slideIn 0.3s ease-out;
    }

    .notification-alert {
      margin: 0;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    @keyframes slideIn {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }

    @keyframes slideOut {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(100%);
        opacity: 0;
      }
    }

    .notification-item.removing {
      animation: slideOut 0.3s ease-in;
    }
  `]
})
export class NotificationComponent implements OnInit, OnDestroy {
  activeNotifications: Notification[] = [];
  private subscription: Subscription = new Subscription();
  private timeouts: Map<string, any> = new Map();

  constructor(private notificationService: NotificationService) {}

  ngOnInit(): void {
    this.subscription.add(
      this.notificationService.notifications$.subscribe(notification => {
        this.addNotification(notification);
      })
    );
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
    this.clearAllTimeouts();
  }

  private addNotification(notification: Notification): void {
    this.activeNotifications.push(notification);

    // Auto-remove notification after duration
    if (notification.duration && notification.duration > 0) {
      const timeoutId = setTimeout(() => {
        this.removeNotification(notification.id);
      }, notification.duration);
      
      this.timeouts.set(notification.id, timeoutId);
    }
  }

  removeNotification(id: string): void {
    // Clear timeout if exists
    const timeoutId = this.timeouts.get(id);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.timeouts.delete(id);
    }

    // Remove from active notifications
    this.activeNotifications = this.activeNotifications.filter(
      notification => notification.id !== id
    );
  }

  private clearAllTimeouts(): void {
    this.timeouts.forEach(timeoutId => {
      clearTimeout(timeoutId);
    });
    this.timeouts.clear();
  }
}
