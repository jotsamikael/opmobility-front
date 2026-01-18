import { AfterViewInit, Component, OnInit, ViewChild, TemplateRef } from '@angular/core';
import { FormControl, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatSort, Sort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { debounceTime, distinctUntilChanged, startWith, map, Observable } from 'rxjs';
import { GlobalFormBuilder } from 'src/app/core/globalFormBuilder';
import { NotificationService } from 'src/app/core/services/notification.service';
import { CommonService } from 'src/app/core/services/common.service';
import Swal from 'sweetalert2';
import { GetMovementResponse } from 'src/app/opmobilitybackend/models/get-movement-response';
import { CreateMovementDto } from 'src/app/opmobilitybackend/models/create-movement-dto';
import { UpdateMovementDto } from 'src/app/opmobilitybackend/models/update-movement-dto';
import { ProductResponse, GetProviderResponse, GetWarehouseResponse, GetExpoEventResponse, RepairResponse } from 'src/app/opmobilitybackend/models';
import { MovementService, ProductService, ProviderService, WarehouseService, ExpoEventService, RepairService } from 'src/app/opmobilitybackend/services';

// Movement filters interface
export interface MovementFilters {
  page?: number;
  limit?: number;
  productId?: number;
  type?: 'Outbound' | 'Inbound';
  originKind?: 'Warehouse' | 'Event' | 'Provider' | 'Repair';
  originRefId?: number;
  destKind?: 'Warehouse' | 'Event' | 'Provider' | 'Repair';
  destRefId?: number;
  startDate?: string;
  endDate?: string;
}

// Movement type options
export const MOVEMENT_TYPES = [
  { value: 'Outbound', label: 'Outbound' },
  { value: 'Inbound', label: 'Inbound' }
];

// Movement kind options
export const MOVEMENT_KINDS = [
  { value: 'Warehouse', label: 'Warehouse' },
  { value: 'Event', label: 'Event' },
  { value: 'Provider', label: 'Provider' },
  { value: 'Repair', label: 'Repair' }
];

@Component({
  selector: 'app-movement',
  templateUrl: './movement.component.html',
  styleUrls: ['./movement.component.scss']
})
export class MovementComponent implements OnInit, AfterViewInit {
  breadCrumbItems: Array<{}>;
  
  // Expose Math to template
  Math = Math;
  
  // Table properties
  displayedColumns: string[] = ['id', 'product', 'type', 'movedAt', 'origin', 'destination', 'notes', 'actions'];
  dataSource: MatTableDataSource<GetMovementResponse> = new MatTableDataSource<GetMovementResponse>([]);
 
  // Pagination properties
  totalItems = 0;
  currentPage = 1;
  pageSize = 10;
  pageSizeOptions = [5, 10, 25, 50];
  totalPages = 1;
  
  // Loading state
  isLoading = false;
  
  // Filters
  filters: MovementFilters = {
    page: 1,
    limit: 10
  };
  
  // Search controls
  productFilterControl = new FormControl<number | null>(null);
  typeFilterControl = new FormControl<string | null>(null);
  originKindFilterControl = new FormControl<string | null>(null);
  originRefIdFilterControl = new FormControl<number | null>(null);
  destKindFilterControl = new FormControl<string | null>(null);
  destRefIdFilterControl = new FormControl<number | null>(null);
  startDateFilterControl = new FormControl<string | null>(null);
  endDateFilterControl = new FormControl<string | null>(null);
  
  // Options for dropdowns/autocomplete
  movementTypes = MOVEMENT_TYPES;
  movementKinds = MOVEMENT_KINDS;
  productOptions: ProductResponse[] = [];
  warehouseOptions: GetWarehouseResponse[] = [];
  eventOptions: GetExpoEventResponse[] = [];
  providerOptions: GetProviderResponse[] = [];
  repairOptions: any[] = [];
  
  // Form controls for autocomplete
  productInputControl = new FormControl<string | ProductResponse>('');
  originInputControl = new FormControl<string | any>('');
  destInputControl = new FormControl<string | any>('');
  
  // Autocomplete observables
  filteredProducts: Observable<ProductResponse[]>;
  filteredOriginOptions: Observable<any[]>;
  filteredDestOptions: Observable<any[]>;
  
  private autocompletePanelOpen = false;

  // Form
  movementForm: FormGroup;
  isEditMode = false;
  selectedMovement: GetMovementResponse | null = null;
  currentDialogRef: MatDialogRef<any> | null = null;
  isSubmitting = false;

  // Current selected kinds for dynamic autocomplete
  selectedOriginKind: 'Warehouse' | 'Event' | 'Provider' | 'Repair' = 'Warehouse';
  selectedDestKind: 'Warehouse' | 'Event' | 'Provider' | 'Repair' = 'Event';

  @ViewChild('modalTemplate') modalTemplate!: TemplateRef<any>;
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  constructor(
    private fb: FormBuilder,
    private globalFormBuilder: GlobalFormBuilder,
    private movementService: MovementService,
    private productService: ProductService,
    private warehouseService: WarehouseService,
    private expoEventService: ExpoEventService,
    private providerService: ProviderService,
    private repairService: RepairService,
    private dialog: MatDialog,
    private notificationService: NotificationService,
    private commonService: CommonService
  ) {
    this.breadCrumbItems = [
      { label: 'RMOBILITY', active: false, link: '/dashboard' },
      { label: 'Movement Management', active: true }
    ];

    this.movementForm = this.globalFormBuilder.movementForm();

    // Setup autocomplete filters
    this.filteredProducts = this.productInputControl.valueChanges.pipe(
      startWith(''),
      map(value => this._filterProducts(typeof value === 'string' ? value : value?.name || ''))
    );

    this.filteredOriginOptions = this.originInputControl.valueChanges.pipe(
      startWith(''),
      map(value => this._filterOriginOptions(typeof value === 'string' ? value : value?.name || ''))
    );

    this.filteredDestOptions = this.destInputControl.valueChanges.pipe(
      startWith(''),
      map(value => this._filterDestOptions(typeof value === 'string' ? value : value?.name || ''))
    );

    // Watch for origin kind changes
    this.movementForm.get('originKind')?.valueChanges.subscribe((kind: string) => {
      this.selectedOriginKind = kind as any;
      this.movementForm.patchValue({ originRefId: null }, { emitEvent: false });
      this.originInputControl.setValue('');
      this.loadOriginOptions();
    });

    // Watch for dest kind changes
    this.movementForm.get('destKind')?.valueChanges.subscribe((kind: string) => {
      this.selectedDestKind = kind as any;
      this.movementForm.patchValue({ destRefId: null }, { emitEvent: false });
      this.destInputControl.setValue('');
      this.loadDestOptions();
    });
  }

  ngOnInit(): void {
    this.loadMovements();
    this.loadProducts();
    this.loadOriginOptions();
    this.loadDestOptions();
  }

  ngAfterViewInit(): void {
    if (this.paginator) {
      this.dataSource.paginator = this.paginator;
    }
    if (this.sort) {
      this.dataSource.sort = this.sort;
    }
  }

  /**
   * Load movements with filters
   */
  loadMovements(): void {
    this.isLoading = true;
    
    const queryParams: any = {
      page: this.filters.page || 1,
      limit: this.filters.limit || 10
    };

    if (this.filters.productId) {
      queryParams.productId = this.filters.productId;
    }
    if (this.filters.type) {
      queryParams.type = this.filters.type;
    }
    if (this.filters.originKind) {
      queryParams.originKind = this.filters.originKind;
    }
    if (this.filters.originRefId) {
      queryParams.originRefId = this.filters.originRefId;
    }
    if (this.filters.destKind) {
      queryParams.destKind = this.filters.destKind;
    }
    if (this.filters.destRefId) {
      queryParams.destRefId = this.filters.destRefId;
    }
    if (this.filters.startDate) {
      queryParams.startDate = this.filters.startDate;
    }
    if (this.filters.endDate) {
      queryParams.endDate = this.filters.endDate;
    }

    this.movementService.movementControllerGetAllMovementsV1$Response(queryParams).subscribe({
      next: (response) => {
        const responseBody = response.body as any;
        if (responseBody && responseBody.items) {
          this.dataSource.data = responseBody.items || [];
          this.totalItems = responseBody.meta?.totalItems || 0;
          this.totalPages = responseBody.meta?.totalPages || 1;
          this.currentPage = responseBody.meta?.currentPage || 1;
        } else if (Array.isArray(responseBody)) {
          this.dataSource.data = responseBody;
          this.totalItems = responseBody.length;
        } else {
          this.dataSource.data = [];
          this.totalItems = 0;
        }
        
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading movements:', error);
        this.notificationService.error('Failed to load movements. Please try again.');
        this.isLoading = false;
      }
    });
  }

  /**
   * Load products for autocomplete
   */
  loadProducts(): void {
    this.productService.productControllerGetAllProductsV1$Response({ page: 1, limit: 1000 } as any).subscribe({
      next: (response) => {
        const responseBody = response.body as any;
        this.productOptions = responseBody?.items || responseBody || [];
      },
      error: (error) => {
        console.error('Error loading products:', error);
      }
    });
  }

  /**
   * Load origin options based on selected kind
   */
  loadOriginOptions(): void {
    const kind = this.selectedOriginKind || this.movementForm.get('originKind')?.value || 'Warehouse';
    
    switch (kind) {
      case 'Warehouse':
        this.warehouseService.warehouseControllerFindAllV1$Response({ page: 1, limit: 1000 } as any).subscribe({
          next: (response) => {
            const responseBody = response.body as any;
            this.warehouseOptions = responseBody?.items || responseBody || [];
          },
          error: (error) => {
            console.error('Error loading warehouses:', error);
          }
        });
        break;
      case 'Event':
        this.expoEventService.expoEventControllerGetAllExpoEventsV1$Response({ page: 1, limit: 1000 } as any).subscribe({
          next: (response) => {
            const responseBody = response.body as any;
            // ExpoEvent service returns paginated response
            if (responseBody && responseBody.items) {
              this.eventOptions = responseBody.items || [];
            } else if (Array.isArray(responseBody)) {
              this.eventOptions = responseBody;
            } else {
              this.eventOptions = [];
            }
          },
          error: (error) => {
            console.error('Error loading events:', error);
          }
        });
        break;
      case 'Provider':
        this.providerService.providerControllerGetAllProvidersV1$Response({ page: 1, limit: 1000 } as any).subscribe({
          next: (response) => {
            const responseBody = response.body as any;
            this.providerOptions = responseBody?.items || responseBody || [];
          },
          error: (error) => {
            console.error('Error loading providers:', error);
          }
        });
        break;
      case 'Repair':
        this.repairService.repairControllerCreateV1$Response({ page: 1, limit: 1000 } as any).subscribe({
          next: (response) => {
            const responseBody = response.body as any;
            this.repairOptions = responseBody?.items || responseBody || [];
          },
          error: (error) => {
            console.error('Error loading repairs:', error);
          }
        });
        break;
    }
  }

  /**
   * Load destination options based on selected kind
   */
  loadDestOptions(): void {
    const kind = this.selectedDestKind || this.movementForm.get('destKind')?.value || 'Event';
    
    switch (kind) {
      case 'Warehouse':
        this.warehouseService.warehouseControllerFindAllV1$Response({ page: 1, limit: 1000 } as any).subscribe({
          next: (response) => {
            const responseBody = response.body as any;
            this.warehouseOptions = responseBody?.items || responseBody || [];
          },
          error: (error) => {
            console.error('Error loading warehouses:', error);
          }
        });
        break;
      case 'Event':
        this.expoEventService.expoEventControllerGetAllExpoEventsV1$Response({ page: 1, limit: 1000 } as any).subscribe({
          next: (response) => {
            const responseBody = response.body as any;
            // ExpoEvent service returns paginated response
            if (responseBody && responseBody.items) {
              this.eventOptions = responseBody.items || [];
            } else if (Array.isArray(responseBody)) {
              this.eventOptions = responseBody;
            } else {
              this.eventOptions = [];
            }
          },
          error: (error) => {
            console.error('Error loading events:', error);
          }
        });
        break;
      case 'Provider':
        this.providerService.providerControllerGetAllProvidersV1$Response({ page: 1, limit: 1000 } as any).subscribe({
          next: (response) => {
            const responseBody = response.body as any;
            this.providerOptions = responseBody?.items || responseBody || [];
          },
          error: (error) => {
            console.error('Error loading providers:', error);
          }
        });
        break;
      case 'Repair':
        this.repairService.repairControllerCreateV1$Response({ page: 1, limit: 1000 } as any).subscribe({
          next: (response) => {
            const responseBody = response.body as any;
            this.repairOptions = responseBody?.items || responseBody || [];
          },
          error: (error) => {
            console.error('Error loading repairs:', error);
          }
        });
        break;
    }
  }

  /**
   * Get current origin options based on kind
   */
  getOriginOptions(): any[] {
    switch (this.selectedOriginKind) {
      case 'Warehouse': return this.warehouseOptions;
      case 'Event': return this.eventOptions;
      case 'Provider': return this.providerOptions;
      case 'Repair': return this.repairOptions;
      default: return [];
    }
  }

  /**
   * Get current destination options based on kind
   */
  getDestOptions(): any[] {
    switch (this.selectedDestKind) {
      case 'Warehouse': return this.warehouseOptions;
      case 'Event': return this.eventOptions;
      case 'Provider': return this.providerOptions;
      case 'Repair': return this.repairOptions;
      default: return [];
    }
  }

  /**
   * Filter products
   */
  private _filterProducts(value: string): ProductResponse[] {
    if (!value || typeof value !== 'string') {
      return this.productOptions;
    }
    const filterValue = value.toLowerCase();
    return this.productOptions.filter(product => 
      product.name?.toLowerCase().includes(filterValue) ||
      product.ref?.toLowerCase().includes(filterValue)
    );
  }

  /**
   * Filter origin options
   */
  private _filterOriginOptions(value: string): any[] {
    if (!value || typeof value !== 'string') {
      return this.getOriginOptions();
    }
    const filterValue = value.toLowerCase();
    const options = this.getOriginOptions();
    return options.filter((item: any) => 
      item.name?.toLowerCase().includes(filterValue) ||
      item.id?.toString().includes(filterValue)
    );
  }

  /**
   * Filter destination options
   */
  private _filterDestOptions(value: string): any[] {
    if (!value || typeof value !== 'string') {
      return this.getDestOptions();
    }
    const filterValue = value.toLowerCase();
    const options = this.getDestOptions();
    return options.filter((item: any) => 
      item.name?.toLowerCase().includes(filterValue) ||
      item.id?.toString().includes(filterValue)
    );
  }

  /**
   * Display product in autocomplete
   */
  displayProduct(product: ProductResponse | null): string {
    if (!product) return '';
    return `${product.ref || ''} - ${product.name || ''}`.trim();
  }

  /**
   * Display origin/dest option in autocomplete
   */
  displayOriginDestOption(item: any | null): string {
    if (!item) return '';
    return item.name || `ID: ${item.id}` || '';
  }

  /**
   * Handle product selection
   */
  onProductSelected(event: any): void {
    const product = event.option.value as ProductResponse;
    this.movementForm.patchValue({ productId: product.id }, { emitEvent: false });
    this.productInputControl.setValue(product, { emitEvent: false });
  }

  /**
   * Handle origin selection
   */
  onOriginSelected(event: any): void {
    const item = event.option.value;
    this.movementForm.patchValue({ originRefId: item.id }, { emitEvent: false });
    this.originInputControl.setValue(item, { emitEvent: false });
  }

  /**
   * Handle destination selection
   */
  onDestSelected(event: any): void {
    const item = event.option.value;
    this.movementForm.patchValue({ destRefId: item.id }, { emitEvent: false });
    this.destInputControl.setValue(item, { emitEvent: false });
  }

  /**
   * Apply filters
   */
  applyFilters(): void {
    this.filters = {
      page: 1,
      limit: this.pageSize,
      productId: this.productFilterControl.value || undefined,
      type: (this.typeFilterControl.value === 'Outbound' || this.typeFilterControl.value === 'Inbound') 
        ? this.typeFilterControl.value 
        : undefined,
      originKind: this.originKindFilterControl.value as any || undefined,
      originRefId: this.originRefIdFilterControl.value || undefined,
      destKind: this.destKindFilterControl.value as any || undefined,
      destRefId: this.destRefIdFilterControl.value || undefined,
      startDate: this.startDateFilterControl.value || undefined,
      endDate: this.endDateFilterControl.value || undefined
    };
    
    this.loadMovements();
  }

  /**
   * Clear filters
   */
  clearFilters(): void {
    this.productFilterControl.setValue(null);
    this.typeFilterControl.setValue(null);
    this.originKindFilterControl.setValue(null);
    this.originRefIdFilterControl.setValue(null);
    this.destKindFilterControl.setValue(null);
    this.destRefIdFilterControl.setValue(null);
    this.startDateFilterControl.setValue(null);
    this.endDateFilterControl.setValue(null);
    
    this.filters = {
      page: 1,
      limit: this.pageSize
    };
    
    this.loadMovements();
  }

  /**
   * Handle pagination change
   */
  onPageChange(event: PageEvent): void {
    this.pageSize = event.pageSize;
    this.filters.page = event.pageIndex + 1;
    this.filters.limit = event.pageSize;
    this.loadMovements();
  }

  /**
   * Handle sort change
   */
  onSortChange(sort: Sort): void {
    // Sorting is handled server-side, reload data if needed
    if (sort.direction) {
      this.loadMovements();
    }
  }

  /**
   * Create new movement
   */
  onCreateMovement(): void {
    this.isEditMode = false;
    this.selectedMovement = null;
    this.movementForm = this.globalFormBuilder.movementForm();
    this.productInputControl.setValue('');
    this.originInputControl.setValue('');
    this.destInputControl.setValue('');
    this.selectedOriginKind = 'Warehouse';
    this.selectedDestKind = 'Event';
    this.loadOriginOptions();
    this.loadDestOptions();
    
    setTimeout(() => {
      this.currentDialogRef = this.dialog.open(this.modalTemplate, {
        width: '800px',
        maxWidth: '90vw',
        disableClose: true
      });
    }, 0);
  }

  /**
   * Edit movement
   */
  onEditMovement(movement: GetMovementResponse): void {
    this.isEditMode = true;
    this.selectedMovement = movement;
    this.populateEditForm(movement);
    
    setTimeout(() => {
      this.currentDialogRef = this.dialog.open(this.modalTemplate, {
        width: '800px',
        maxWidth: '90vw',
        disableClose: true
      });
    }, 0);
  }

  /**
   * Populate form for editing
   */
  populateEditForm(movement: GetMovementResponse): void {
    const movedAtDate = new Date(movement.movedAt);
    const year = movedAtDate.getFullYear();
    const month = String(movedAtDate.getMonth() + 1).padStart(2, '0');
    const day = String(movedAtDate.getDate()).padStart(2, '0');
    const hours = String(movedAtDate.getHours()).padStart(2, '0');
    const minutes = String(movedAtDate.getMinutes()).padStart(2, '0');
    const formattedDateTime = `${year}-${month}-${day}T${hours}:${minutes}`;

    // Find product
    const product = this.productOptions.find(p => p.id === movement.productId);
    if (product) {
      this.productInputControl.setValue(product, { emitEvent: false });
    }

    // Set origin kind and find origin item
    this.selectedOriginKind = movement.originKind;
    this.loadOriginOptions();
    setTimeout(() => {
      const originItem = this.getOriginOptions().find((item: any) => item.id === parseInt(movement.originRefId));
      if (originItem) {
        this.originInputControl.setValue(originItem, { emitEvent: false });
      }

      // Set dest kind and find dest item
      this.selectedDestKind = movement.destKind;
      this.loadDestOptions();
      setTimeout(() => {
        const destItem = this.getDestOptions().find((item: any) => item.id === parseInt(movement.destRefId));
        if (destItem) {
          this.destInputControl.setValue(destItem, { emitEvent: false });
        }

        this.movementForm.patchValue({
          productId: movement.productId,
          type: movement.type,
          movedAt: formattedDateTime,
          originKind: movement.originKind,
          originRefId: parseInt(movement.originRefId),
          destKind: movement.destKind,
          destRefId: parseInt(movement.destRefId),
          notes: movement.notes || ''
        }, { emitEvent: false });
      }, 200);
    }, 200);
  }

  /**
   * Submit form
   */
  onSubmitForm(): void {
    if (this.movementForm.invalid) {
      this.movementForm.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;

    const formValue = this.movementForm.value;
    const movedAtDate = new Date(formValue.movedAt);
    
    const movementData: CreateMovementDto = {
      productId: formValue.productId,
      type: formValue.type,
      movedAt: movedAtDate.toISOString(),
      originKind: formValue.originKind,
      originRefId: formValue.originRefId,
      destKind: formValue.destKind,
      destRefId: formValue.destRefId,
      notes: formValue.notes || undefined
    };

    if (this.isEditMode && this.selectedMovement) {
      // Update - convert to UpdateMovementDto (all fields optional)
      const updateData: UpdateMovementDto = {
        productId: movementData.productId,
        type: movementData.type,
        movedAt: movementData.movedAt,
        originKind: movementData.originKind,
        originRefId: movementData.originRefId,
        destKind: movementData.destKind,
        destRefId: movementData.destRefId,
        notes: movementData.notes
      };

      this.movementService.movementControllerUpdateV1$Response({
        id: (this.selectedMovement as any).id,
        body: updateData
      } as any).subscribe({
        next: () => {
          this.notificationService.success('Movement updated successfully!');
          this.closeModal();
          this.loadMovements();
          this.isSubmitting = false;
        },
        error: (error) => {
          console.error('Error updating movement:', error);
          this.notificationService.error('Failed to update movement. Please try again.');
          this.isSubmitting = false;
        }
      });
    } else {
      // Create
      this.movementService.movementControllerCreateV1$Response({
        body: movementData
      } as any).subscribe({
        next: () => {
          this.notificationService.success('Movement created successfully!');
          this.closeModal();
          this.loadMovements();
          this.isSubmitting = false;
        },
        error: (error) => {
          console.error('Error creating movement:', error);
          this.notificationService.error('Failed to create movement. Please try again.');
          this.isSubmitting = false;
        }
      });
    }
  }

  /**
   * Delete movement
   */
  onDeleteMovement(movement: GetMovementResponse): void {
    Swal.fire({
      title: 'Are you sure?',
      text: 'You won\'t be able to revert this!',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#556ee6',
      cancelButtonColor: '#74788d',
      confirmButtonText: 'Yes, delete it!'
    }).then((result) => {
      if (result.isConfirmed) {
        this.movementService.movementControllerRemoveV1$Response({
          id: (movement as any).id
        } as any).subscribe({
          next: () => {
            Swal.fire('Deleted!', 'Movement has been deleted.', 'success');
            this.loadMovements();
          },
          error: (error) => {
            console.error('Error deleting movement:', error);
            Swal.fire('Error!', 'Failed to delete movement. Please try again.', 'error');
          }
        });
      }
    });
  }

  /**
   * Close modal
   */
  closeModal(): void {
    if (this.currentDialogRef) {
      this.currentDialogRef.close();
      this.currentDialogRef = null;
    }
    this.movementForm.reset();
    this.productInputControl.setValue('');
    this.originInputControl.setValue('');
    this.destInputControl.setValue('');
    this.isEditMode = false;
    this.selectedMovement = null;
  }

  /**
   * Display origin information
   */
  displayOrigin(movement: GetMovementResponse): string {
    if (movement.originData) {
      const data = movement.originData as any;
      if (data.name) {
        return `${data.name} (${movement.originKind})`;
      }
    }
    return `${movement.originKind} #${movement.originRefId}`;
  }

  /**
   * Display destination information
   */
  displayDestination(movement: GetMovementResponse): string {
    if (movement.destData) {
      const data = movement.destData as any;
      if (data.name) {
        return `${data.name} (${movement.destKind})`;
      }
    }
    return `${movement.destKind} #${movement.destRefId}`;
  }

  /**
   * Display product information
   */
  displayProductInfo(movement: GetMovementResponse): string {
    // Product info might be in the response but not explicitly included
    // For now, just show the ID
    return `Product #${movement.productId}`;
  }

  /**
   * Format date
   */
  formatDate(dateString: string): string {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString();
  }

  /**
   * Get items to display text for pagination
   */
  getItemsToDisplay(): number {
    return Math.min(this.currentPage * this.pageSize, this.totalItems);
  }
}
