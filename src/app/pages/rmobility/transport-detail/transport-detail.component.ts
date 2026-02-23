import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import Swal from 'sweetalert2';
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

  podiumColumns: string[] = ['image', 'id', 'podium', 'state', 'weight', 'returnedAt', 'notes', 'preview'];
  productColumns: string[] = ['image', 'id', 'product', 'status', 'returnedAt', 'notes', 'preview'];

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
    this.router.navigate(['/backend/transport-list']);
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

  getPodiumImageUrl(podium: any): string | null {
    if (!podium || !podium.images || !podium.images.length) {
      return null;
    }

    const imageFile = podium.images.find((file: any) => {
      const fileType = file.fileType || file.mimeType || '';
      if (!fileType) {
        return false;
      }
      return fileType.startsWith('image/') || fileType === 'image/jpeg' || fileType === 'image/jpg' || fileType === 'image/png' || fileType === 'image/webp';
    });

    if (imageFile?.fileUrl) {
      return imageFile.fileUrl;
    }

    return podium.images[0]?.fileUrl || null;
  }

  getProductImageUrl(product: any): string | null {
    if (!product || !product.files || !product.files.length) {
      return null;
    }

    const imageFile = product.files.find((file: any) => {
      const fileType = file.fileType || '';
      return fileType && (
        fileType.startsWith('image/') ||
        fileType === 'image/jpeg' ||
        fileType === 'image/jpg' ||
        fileType === 'image/png' ||
        fileType === 'image/webp'
      );
    });

    return imageFile?.fileUrl || null;
  }

  onImageError(event: any): void {
    event.target.src = 'assets/images/users/avatar-1.jpg';
    event.target.onerror = null;
  }

  onViewPodiumDetails(row: any): void {
    const podium = row?.podium;
    if (!podium) {
      this.notificationService.warning('Podium details are not available for this row.');
      return;
    }

    const imageUrl = this.getPodiumImageUrl(podium);
    const dimensions = podium.lengthMm && podium.widthMm && podium.heightMm
      ? `${podium.lengthMm}mm x ${podium.widthMm}mm x ${podium.heightMm}mm`
      : 'N/A';

    const htmlContent = `
      <div class="text-start" style="max-width: 100%;">
        <div style="text-align: center; margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
          ${imageUrl
            ? `<img src="${imageUrl}" alt="${podium.name || podium.ref || 'Podium'}" style="max-width: 100%; max-height: 300px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" onerror="this.src='assets/images/users/avatar-1.jpg'; this.onerror=null;">`
            : `<div style="padding: 40px; color: #999;"><i class="mdi mdi-48px mdi-image-off"></i><p style="margin-top: 10px;">No image available</p></div>`}
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 16px;">
          <div>
            <p style="margin: 8px 0;"><strong>Reference:</strong><br>${podium.ref || 'N/A'}</p>
            <p style="margin: 8px 0;"><strong>Name:</strong><br>${podium.name || 'N/A'}</p>
            <p style="margin: 8px 0;"><strong>State:</strong><br>${podium.state || 'N/A'}</p>
          </div>
          <div>
            <p style="margin: 8px 0;"><strong>Dimensions:</strong><br>${dimensions}</p>
            <p style="margin: 8px 0;"><strong>Gross Weight:</strong><br>${row?.grossWeightKg ?? 'N/A'} kg</p>
            <p style="margin: 8px 0;"><strong>Returned At:</strong><br>${this.formatDate(row?.returnedAt)}</p>
          </div>
        </div>

        <div style="margin-bottom: 8px;">
          <p style="margin: 8px 0;"><strong>Notes:</strong></p>
          <p style="margin: 0; padding: 10px; background: #f8f9fa; border-radius: 4px; color: #666;">${row?.notes || 'N/A'}</p>
        </div>
      </div>
    `;

    Swal.fire({
      title: `<strong>${podium.name || podium.ref || 'Podium'}</strong>`,
      html: htmlContent,
      icon: 'info',
      confirmButtonColor: '#556ee6',
      confirmButtonText: 'Close',
      width: '700px'
    });
  }

  onViewProductDetails(row: any): void {
    const product = row?.product;
    if (!product) {
      this.notificationService.warning('Product details are not available for this row.');
      return;
    }

    const imageUrl = this.getProductImageUrl(product);
    const dimensions = product.lengthMm && product.widthMm && product.heightMm
      ? `${product.lengthMm}mm x ${product.widthMm}mm x ${product.heightMm}mm`
      : 'N/A';

    const htmlContent = `
      <div class="text-start" style="max-width: 100%;">
        <div style="text-align: center; margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
          ${imageUrl
            ? `<img src="${imageUrl}" alt="${product.name || product.ref || 'Product'}" style="max-width: 100%; max-height: 300px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" onerror="this.src='assets/images/users/avatar-1.jpg'; this.onerror=null;">`
            : `<div style="padding: 40px; color: #999;"><i class="mdi mdi-48px mdi-image-off"></i><p style="margin-top: 10px;">No image available</p></div>`}
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 16px;">
          <div>
            <p style="margin: 8px 0;"><strong>Reference:</strong><br>${product.ref || 'N/A'}</p>
            <p style="margin: 8px 0;"><strong>Name:</strong><br>${product.name || 'N/A'}</p>
            <p style="margin: 8px 0;"><strong>Status:</strong><br>${product.status || 'N/A'}</p>
          </div>
          <div>
            <p style="margin: 8px 0;"><strong>Dimensions:</strong><br>${dimensions}</p>
            <p style="margin: 8px 0;"><strong>Weight:</strong><br>${product.weightKg ?? 'N/A'} kg</p>
            <p style="margin: 8px 0;"><strong>Returned At:</strong><br>${this.formatDate(row?.returnedAt)}</p>
          </div>
        </div>

        <div style="margin-bottom: 8px;">
          <p style="margin: 8px 0;"><strong>Notes:</strong></p>
          <p style="margin: 0; padding: 10px; background: #f8f9fa; border-radius: 4px; color: #666;">${row?.notes || 'N/A'}</p>
        </div>
      </div>
    `;

    Swal.fire({
      title: `<strong>${product.name || product.ref || 'Product'}</strong>`,
      html: htmlContent,
      icon: 'info',
      confirmButtonColor: '#556ee6',
      confirmButtonText: 'Close',
      width: '700px'
    });
  }

  formatDate(dateValue?: string): string {
    if (!dateValue) {
      return 'N/A';
    }
    return new Date(dateValue).toLocaleString();
  }
}
