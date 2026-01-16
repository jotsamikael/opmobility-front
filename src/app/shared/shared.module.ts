import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { UIModule } from './ui/ui.module';

import { WidgetModule } from './widget/widget.module';
import { AlertModule } from 'ngx-bootstrap/alert';
import { NotificationComponent } from './components/notification/notification.component';

@NgModule({
  declarations: [
    NotificationComponent
  ],
  imports: [
    CommonModule,
    UIModule,
    WidgetModule,
    AlertModule
  ],
  exports: [
    NotificationComponent
  ]
})

export class SharedModule { }
