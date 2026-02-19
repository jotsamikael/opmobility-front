import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { CalendarComponent } from './calendar/calendar.component';
import { ChatComponent } from './chat/chat.component';
import { DefaultComponent } from './dashboards/default/default.component';
import { FilemanagerComponent } from './filemanager/filemanager.component';
import { ProfileComponent } from './common/profile/profile.component';
import { TransactionComponent } from '../shared/widget/transaction/transaction.component';
import { StaffComponent } from './rmobility/staff/staff.component';
import { WarehouseComponent } from './rmobility/warehouse/warehouse.component';
import { LocationComponent } from './rmobility/location/location.component';
import { TownComponent } from './rmobility/town/town.component';
import { ProviderComponent } from './rmobility/provider/provider.component';
import { RepairComponent } from './rmobility/repair/repair.component';
import { InspectionComponent } from './rmobility/inspection/inspection.component';
import { MovementComponent } from './rmobility/movement/movement.component';
import { ProductComponent } from './rmobility/product/product.component';
import { ProductCategoryComponent } from './rmobility/product-category/product-category.component';
import { ConsumableComponent } from './rmobility/consumable/consumable.component';
import { PodiumComponent } from './rmobility/podium/podium.component';
import { StoragecaseComponent } from './rmobility/storagecase/storagecase.component';
import { ExpoEventComponent } from './rmobility/expo-event/expo-event.component';
import { TransportListComponent } from './rmobility/transport-list/transport-list.component';
import { TransportDetailComponent } from './rmobility/transport-detail/transport-detail.component';
import { OverviewComponent } from './rmobility/overview/overview.component';


const routes: Routes = [
  // { path: '', redirectTo: 'dashboard' },
  { path: 'backend', redirectTo: 'dashboard' },
  { path: 'dashboard', component: DefaultComponent },


 //core
 {path: 'staff', component: StaffComponent },
 {path:'warehouse',component:WarehouseComponent},
 {path:'location',component:LocationComponent},
 {path:'town',component:TownComponent},
 {path:'provider',component:ProviderComponent},
 {path:'product',component:ProductComponent},
 {path:'product-category',component:ProductCategoryComponent},
 {path:'podium',component:PodiumComponent},
 {path:'storagecase',component:StoragecaseComponent},
 {path:'repair',component:RepairComponent},
 {path:'inspection',component:InspectionComponent},
 {path:'movement',component:MovementComponent},
 {path:'consumable',component:ConsumableComponent},
 {path:'expo-event',component:ExpoEventComponent},
 {path:'transport-list',component:TransportListComponent},
 {path:'transport-list/:id',component:TransportDetailComponent},
 {path:'overview',component:OverviewComponent},


 //common
 { path: 'profile', component: ProfileComponent },




  { path: 'calendar', component: CalendarComponent },
  { path: 'chat', component: ChatComponent },
  { path: 'filemanager', component: FilemanagerComponent },
  { path: 'dashboards', loadChildren: () => import('./dashboards/dashboards.module').then(m => m.DashboardsModule) },
  { path: 'ecommerce', loadChildren: () => import('./ecommerce/ecommerce.module').then(m => m.EcommerceModule) },
  { path: 'crypto', loadChildren: () => import('./crypto/crypto.module').then(m => m.CryptoModule) },
  { path: 'email', loadChildren: () => import('./email/email.module').then(m => m.EmailModule) },
  { path: 'invoices', loadChildren: () => import('./invoices/invoices.module').then(m => m.InvoicesModule) },
  { path: 'projects', loadChildren: () => import('./projects/projects.module').then(m => m.ProjectsModule) },
  { path: 'tasks', loadChildren: () => import('./tasks/tasks.module').then(m => m.TasksModule) },
  { path: 'contacts', loadChildren: () => import('./contacts/contacts.module').then(m => m.ContactsModule) },
  { path: 'blog', loadChildren: () => import('./blog/blog.module').then(m => m.BlogModule) },
  { path: 'pages', loadChildren: () => import('./utility/utility.module').then(m => m.UtilityModule) },
  { path: 'ui', loadChildren: () => import('./ui/ui.module').then(m => m.UiModule) },
  { path: 'form', loadChildren: () => import('./form/form.module').then(m => m.FormModule) },
  { path: 'tables', loadChildren: () => import('./tables/tables.module').then(m => m.TablesModule) },
  { path: 'icons', loadChildren: () => import('./icons/icons.module').then(m => m.IconsModule) },
  { path: 'charts', loadChildren: () => import('./chart/chart.module').then(m => m.ChartModule) },
  { path: 'maps', loadChildren: () => import('./maps/maps.module').then(m => m.MapsModule) },
  { path: 'jobs', loadChildren: () => import('./jobs/jobs.module').then(m => m.JobsModule) },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class PagesRoutingModule { }
