import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';
import { NotificationService } from 'src/app/core/services/notification.service';
import { GetTransportListResponse, Podium, ProductResponse, GetExpoEventResponse } from 'src/app/opmobilitybackend/models';
import { ExpoEventService, TransportItemService, TransportListService, TransportPodiumService } from 'src/app/opmobilitybackend/services';

@Component({
  selector: 'app-transport-detail',
  templateUrl: './transport-detail.component.html',
  styleUrls: ['./transport-detail.component.scss']
})
export class TransportDetailComponent implements OnInit {
  private readonly manifestHeaders: string[] = [
    'Picture',
    'Description',
    'Designation',
    'Marketing Ref.',
    'Alphastore ref',
    'HS CODE',
    'Dimensions (mm) / Weight (kg)',
    'Location',
    'Package',
    'Price (€)',
    'Battery/electronics'
  ];

  breadCrumbItems: Array<{}> = [
    { label: 'RMobility' },
    { label: 'Transport List' },
    { label: 'Transport Details', active: true }
  ];

  isLoading = false;
  transportId: number | null = null;
  transport: GetTransportListResponse | null = null;
  eventName = 'N/A';
  podiumItems: any[] = [];
  productItems: any[] = [];

  podiumColumns: string[] = ['image', 'id', 'podium', 'state', 'weight', 'returnedAt', 'notes', 'preview'];
  productColumns: string[] = ['image', 'id', 'product', 'status', 'returnedAt', 'notes', 'preview'];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private transportListService: TransportListService,
    private expoEventService: ExpoEventService,
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
        this.eventName = (this.transport as any)?.eventName || 'N/A';
        this.resolveEventName(this.transport?.eventId);
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

  private resolveEventName(eventId?: number): void {
    if (this.eventName && this.eventName !== 'N/A') {
      return;
    }

    if (!eventId) {
      this.eventName = 'N/A';
      return;
    }

    this.expoEventService.expoEventControllerGetAllExpoEventsV1$Response({
      page: 1,
      limit: 50,
    } as any).subscribe({
      next: (response) => {
        const responseBody = response.body as any;
        const events = (responseBody?.items || responseBody || []) as GetExpoEventResponse[];
        const matchedEvent = events.find((event) => (event as any).id === eventId);
        this.eventName = matchedEvent?.name || 'N/A';
      },
      error: () => {
        this.eventName = 'N/A';
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
    return this.getPodiumImageUrls(podium)[0] || null;
  }

  getProductImageUrl(product: any): string | null {
    return this.getProductImageUrls(product)[0] || null;
  }

  getPodiumImageUrls(podium: any): string[] {
    if (!podium || !Array.isArray(podium.images)) {
      return [];
    }

    return podium.images
      .filter((file: any) => this.isImageFile(file))
      .map((file: any) => file.fileUrl)
      .filter((url: string) => !!url);
  }

  getProductImageUrls(product: any): string[] {
    const productFiles = product?.files;
    const productImages = product?.images;
    const fileCandidates = Array.isArray(productFiles)
      ? productFiles
      : (Array.isArray(productImages) ? productImages : []);

    if (!product || !fileCandidates.length) {
      return [];
    }

    return fileCandidates
      .filter((file: any) => this.isImageFile(file))
      .map((file: any) => file.fileUrl)
      .filter((url: string) => !!url);
  }

  private isImageFile(file: any): boolean {
    const fileType = (file?.fileType || file?.mimeType || '').toString().toLowerCase();
    return fileType.startsWith('image/') || fileType === 'image/jpeg' || fileType === 'image/jpg' || fileType === 'image/png' || fileType === 'image/webp';
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

    const imageUrls = this.getPodiumImageUrls(podium);
    const dimensions = podium.lengthMm && podium.widthMm && podium.heightMm
      ? `${podium.lengthMm}mm x ${podium.widthMm}mm x ${podium.heightMm}mm`
      : 'N/A';

    const htmlContent = `
      <div class="text-start" style="max-width: 100%;">
        <div style="text-align: center; margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
          ${imageUrls.length
            ? `<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px;">${imageUrls
                .map((url: string, index: number) => `<img src="${url}" alt="${podium.name || podium.ref || 'Podium'} image ${index + 1}" style="width: 100%; height: 120px; object-fit: cover; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" onerror="this.src='assets/images/users/avatar-1.jpg'; this.onerror=null;">`)
                .join('')}</div>`
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

    const imageUrls = this.getProductImageUrls(product);
    const dimensions = product.lengthMm && product.widthMm && product.heightMm
      ? `${product.lengthMm}mm x ${product.widthMm}mm x ${product.heightMm}mm`
      : 'N/A';

    const htmlContent = `
      <div class="text-start" style="max-width: 100%;">
        <div style="text-align: center; margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
          ${imageUrls.length
            ? `<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px;">${imageUrls
                .map((url: string, index: number) => `<img src="${url}" alt="${product.name || product.ref || 'Product'} image ${index + 1}" style="width: 100%; height: 120px; object-fit: cover; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" onerror="this.src='assets/images/users/avatar-1.jpg'; this.onerror=null;">`)
                .join('')}</div>`
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

  exportTransportManifest(): void {
    const rows = [
      ...this.productItems.map((item) => this.mapProductManifestRow(item)),
      ...this.podiumItems.map((item) => this.mapPodiumManifestRow(item))
    ];

    if (!rows.length) {
      this.notificationService.warning('No transport data to export.');
      return;
    }

    const title = `Liste de Transport ${this.transport?.name || `#${this.transportId || ''}`}`;
    const worksheetData: Array<Array<string | number>> = [
      [title],
      this.manifestHeaders,
      ...rows
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    worksheet['!merges'] = [XLSX.utils.decode_range('A1:K1')];
    worksheet['!cols'] = [
      { wch: 30 },
      { wch: 34 },
      { wch: 24 },
      { wch: 20 },
      { wch: 18 },
      { wch: 18 },
      { wch: 30 },
      { wch: 24 },
      { wch: 20 },
      { wch: 14 },
      { wch: 28 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Transport');

    const fileName = `transport-${this.transportId || 'details'}-manifest.xlsx`;
    XLSX.writeFile(workbook, fileName);
  }

  private mapProductManifestRow(item: any): string[] {
    const product = item?.product || {};
    const imageUrl = this.getProductImageUrl(product) || 'N/A';
    const dimensionsAndWeight = this.buildDimensionsAndWeight(
      product.lengthMm,
      product.widthMm,
      product.heightMm,
      item?.grossWeightKg ?? product.weightKg
    );

    return [
      imageUrl,
      product.description || product.name || 'N/A',
      product.name || 'N/A',
      product.ref || 'N/A',
      product.ref || 'N/A',
      item?.hsCode || 'N/A',
      dimensionsAndWeight,
      this.getLocationLabel(product.location),
      this.getPackageLabel(item?.storageCase),
      this.formatPrice(product.price),
      item?.batteryElectronics || 'No battery inside / No electronics'
    ];
  }

  private mapPodiumManifestRow(item: any): string[] {
    const podium = item?.podium || {};
    const imageUrl = this.getPodiumImageUrl(podium) || 'N/A';
    const dimensionsAndWeight = this.buildDimensionsAndWeight(
      podium.lengthMm,
      podium.widthMm,
      podium.heightMm,
      item?.grossWeightKg
    );

    return [
      imageUrl,
      podium.name || 'N/A',
      podium.name || 'N/A',
      podium.ref || 'N/A',
      podium.ref || 'N/A',
      item?.hsCode || 'N/A',
      dimensionsAndWeight,
      this.getLocationLabel(podium.location),
      this.getPackageLabel(item?.storageCase),
      this.formatPrice(podium.price),
      item?.batteryElectronics || 'No battery inside / No electronics'
    ];
  }

  private buildDimensionsAndWeight(lengthMm: any, widthMm: any, heightMm: any, weightKg: any): string {
    const dimensions = [lengthMm, widthMm, heightMm].every((value) => value !== null && value !== undefined && value !== '')
      ? `${lengthMm} x ${widthMm} x ${heightMm}`
      : 'N/A';
    const weight = weightKg !== null && weightKg !== undefined && weightKg !== '' ? `${weightKg} kg` : 'N/A';
    return `${dimensions}\n${weight}`;
  }

  private getLocationLabel(location: any): string {
    if (!location) {
      return 'N/A';
    }

    const parts: string[] = [];
    if (location.warehouse?.name) {
      parts.push(location.warehouse.name);
    }
    if (location.aisle) {
      parts.push(`Aisle: ${location.aisle}`);
    }
    if (location.positionLabel) {
      parts.push(`Position: ${location.positionLabel}`);
    }

    return parts.length ? parts.join(' - ') : 'N/A';
  }

  private getPackageLabel(storageCase: any): string {
    if (!storageCase) {
      return 'N/A';
    }

    return storageCase.name || storageCase.ref || storageCase.code || 'N/A';
  }

  private formatPrice(value: any): string {
    if (value === null || value === undefined || value === '') {
      return 'N/A';
    }

    return `${value}`;
  }
}
