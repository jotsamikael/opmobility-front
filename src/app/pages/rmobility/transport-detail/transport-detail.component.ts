import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { NotificationService } from 'src/app/core/services/notification.service';
import { GetTransportListResponse, Podium, ProductResponse } from 'src/app/opmobilitybackend/models';
import { TransportItemService, TransportListService, TransportPodiumService } from 'src/app/opmobilitybackend/services';

@Component({
  selector: 'app-transport-detail',
  templateUrl: './transport-detail.component.html',
  styleUrls: ['./transport-detail.component.scss']
})
export class TransportDetailComponent implements OnInit {
  breadCrumbItems: Array<{}> = [
    { label: 'RMobility' },
    { label: 'Transport List' },
    { label: 'Transport Details', active: true }
  ];

  isLoading = false;
  transportId: number | null = null;
  transport: GetTransportListResponse | null = null;
  podiumItems: any[] = [];
  productItems: any[] = [];

  podiumColumns: string[] = ['id', 'podium', 'weight', 'returnedAt', 'notes'];
  productColumns: string[] = ['id', 'product', 'returnedAt', 'notes'];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private transportListService: TransportListService,
    private transportPodiumService: TransportPodiumService,
    private transportItemService: TransportItemService,
    private notificationService: NotificationService
  ) {}

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    this.transportId = idParam ? Number(idParam) : null;

    if (!this.transportId || Number.isNaN(this.transportId)) {
      this.notificationService.error('Invalid transport id.');
      this.goBack();
      return;
    }

    this.loadDetails(this.transportId);
  }

  loadDetails(id: number): void {
    this.isLoading = true;

    forkJoin({
      transport: this.transportListService.transportListControllerFindOneV1$Response({ id } as any),
      podiums: this.transportPodiumService.transportPodiumControllerFindAllV1$Response({ transportListId: id } as any),
      products: this.transportItemService.transportItemControllerFindAllV1$Response({ transportListId: id } as any)
    }).subscribe({
      next: ({ transport, podiums, products }) => {
        this.transport = transport.body || null;
        this.podiumItems = (podiums.body as any[]) || [];
        this.productItems = (products.body as any[]) || [];
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading transport details:', error);
        this.notificationService.error('Failed to load transport details.');
        this.isLoading = false;
      }
    });
  }

  goBack(): void {
    this.router.navigate(['/transport-list']);
  }

  displayPodium(podium: Podium | null): string {
    if (!podium) return 'N/A';
    const p = podium as any;
    return `${p.ref || ''} - ${p.name || ''}`.trim() || 'N/A';
  }

  displayProduct(product: ProductResponse | null): string {
    if (!product) return 'N/A';
    return `${product.ref || ''} - ${product.name || ''}`.trim() || 'N/A';
  }

  formatDate(dateValue?: string): string {
    if (!dateValue) {
      return 'N/A';
    }
    return new Date(dateValue).toLocaleString();
  }
}
