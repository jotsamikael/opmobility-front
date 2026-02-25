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
import { TransportItem, GetTransportListResponse, ProductResponse, GetStorageCaseResponseDto, Podium } from 'src/app/opmobilitybackend/models';
import { TransportItemService, TransportListService, ProductService, StorageCaseService, PodiumService } from 'src/app/opmobilitybackend/services';

// Transport Item filters interface
export interface TransportItemFilters {
  page?: number;
  limit?: number;
  transportListId?: number;
}

@Component({
  selector: 'app-transport-item',
  templateUrl: './transport-item.component.html',
  styleUrls: ['./transport-item.component.scss']
})
export class TransportItemComponent implements OnInit, AfterViewInit {
  breadCrumbItems: Array<{}>;
  
  // Table properties
  displayedColumns: string[] = ['id', 'transportList', 'product', 'storageCase', 'podium', 'grossWeightKg', 'returnedAt', 'actions'];
  dataSource: MatTableDataSource<TransportItem> = new MatTableDataSource<TransportItem>([]);
 
  // Pagination properties
  totalItems = 0;
  currentPage = 1;
  pageSize = 10;
  pageSizeOptions = [5, 10, 25, 50];
  totalPages = 1;
  
  // Loading state
  isLoading = false;
  
  // Filters
  filters: TransportItemFilters = {
    page: 1,
    limit: 10
  };
  
  // Search controls
  transportListFilterInputControl = new FormControl<string | GetTransportListResponse | null>(null);
  
  // Options for dropdowns/autocomplete
  transportListOptions: GetTransportListResponse[] = [];
  productOptions: ProductResponse[] = [];
  storageCaseOptions: GetStorageCaseResponseDto[] = [];
  podiumOptions: Podium[] = [];
  
  // Form controls for autocomplete
  transportListInputControl = new FormControl<string | GetTransportListResponse>('');
  productInputControl = new FormControl<string | ProductResponse>('');
  storageCaseInputControl = new FormControl<string | GetStorageCaseResponseDto | null>(null);
  podiumInputControl = new FormControl<string | Podium | null>(null);
  
  // Autocomplete observables
  filteredTransportLists: Observable<GetTransportListResponse[]>;
  filteredTransportListsForFilter: Observable<GetTransportListResponse[]>;
  filteredProducts: Observable<ProductResponse[]>;
  filteredStorageCases: Observable<GetStorageCaseResponseDto[]>;
  filteredPodiums: Observable<Podium[]>;
  
  private autocompletePanelOpen = false;
  private filterAutocompletePanelOpen = false;

  // Form
  transportItemForm: FormGroup;
  isEditMode = false;
  selectedTransportItem: TransportItem | null = null;
  currentDialogRef: MatDialogRef<any> | null = null;
  isSubmitting = false;

  @ViewChild('modalTemplate') modalTemplate!: TemplateRef<any>;
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  constructor(
    private fb: FormBuilder,
    private globalFormBuilder: GlobalFormBuilder,
    private transportItemService: TransportItemService,
    private transportListService: TransportListService,
    private productService: ProductService,
    private storageCaseService: StorageCaseService,
    private podiumService: PodiumService,
    private notificationService: NotificationService,
    private commonService: CommonService,
    private dialog: MatDialog
  ) {
    this.breadCrumbItems = [
      { label: 'RMobility' },
      { label: 'Transport Item Management', active: true }
    ];

    this.transportItemForm = this.globalFormBuilder.transportItemForm();

    // Set up autocomplete filtering
    this.filteredTransportLists = this.transportListInputControl.valueChanges.pipe(
      startWith(''),
      map(value => this._filterTransportLists(value))
    );

    this.filteredTransportListsForFilter = this.transportListFilterInputControl.valueChanges.pipe(
      startWith(''),
      map(value => this._filterTransportLists(value))
    );

    this.filteredProducts = this.productInputControl.valueChanges.pipe(
      startWith(''),
      map(value => this._filterProducts(value))
    );

    this.filteredStorageCases = this.storageCaseInputControl.valueChanges.pipe(
      startWith(''),
      map(value => this._filterStorageCases(value))
    );

    this.filteredPodiums = this.podiumInputControl.valueChanges.pipe(
      startWith(''),
      map(value => this._filterPodiums(value))
    );
  }

  ngOnInit(): void {
    this.loadTransportItems();
    this.loadTransportLists();
    this.loadProducts();
    this.loadStorageCases();
    this.loadPodiums();
  }

  ngAfterViewInit(): void {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
    this.setupSearchDebouncing();
  }

  /**
   * Load transport items from API
   */
  loadTransportItems(): void {
    this.isLoading = true;
    const queryParams: any = {};

    if (this.filters.transportListId) {
      queryParams.transportListId = this.filters.transportListId;
    }

    this.transportItemService.transportItemControllerFindAllV1$Response(queryParams).subscribe({
      next: (response) => {
        const responseBody = response.body as any;
        
        // The API returns an array of transport items
        if (Array.isArray(responseBody)) {
          this.dataSource.data = responseBody;
          this.totalItems = responseBody.length;
        } else {
          this.dataSource.data = [];
          this.totalItems = 0;
        }
        
        this.totalPages = Math.ceil(this.totalItems / this.pageSize) || 1;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading transport items:', error);
        this.notificationService.error('Failed to load transport items. Please try again.');
        this.isLoading = false;
      }
    });
  }

  /**
   * Load transport lists for autocomplete
   */
  loadTransportLists(): void {
    this.transportListService.transportListControllerGetAllTransportListsV1$Response({ page: 1, limit: 1000 } as any).subscribe({
      next: (response) => {
        const responseBody = response.body as any;
        this.transportListOptions = responseBody?.items || responseBody || [];
      },
      error: (error) => {
        console.error('Error loading transport lists:', error);
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
   * Load storage cases for autocomplete
   */
  loadStorageCases(): void {
    this.storageCaseService.storageCaseControllerGetAllStorageCasesV1$Response({ page: 1, limit: 1000 } as any).subscribe({
      next: (response) => {
        const responseBody = response.body as any;
        this.storageCaseOptions = responseBody?.items || responseBody || [];
      },
      error: (error) => {
        console.error('Error loading storage cases:', error);
      }
    });
  }

  /**
   * Load podiums for autocomplete
   */
  loadPodiums(): void {
    this.podiumService.podiumControllerGetAllPodiumsV1$Response({ page: 1, limit: 1000 } as any).subscribe({
      next: (response) => {
        const responseBody = response.body as any;
        this.podiumOptions = responseBody?.items || responseBody || [];
      },
      error: (error) => {
        console.error('Error loading podiums:', error);
      }
    });
  }

  /**
   * Filter transport lists for autocomplete
   */
  private _filterTransportLists(value: string | GetTransportListResponse | null): GetTransportListResponse[] {
    if (!value || typeof value !== 'string') {
      return this.transportListOptions;
    }
    const filterValue = value.toLowerCase();
    return this.transportListOptions.filter(transportList => 
      transportList.id?.toString().includes(filterValue) ||
      transportList.status?.toLowerCase().includes(filterValue)
    );
  }

  /**
   * Filter products for autocomplete
   */
  private _filterProducts(value: string | ProductResponse | null): ProductResponse[] {
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
   * Filter storage cases for autocomplete
   */
  private _filterStorageCases(value: string | GetStorageCaseResponseDto | null): GetStorageCaseResponseDto[] {
    if (!value || typeof value !== 'string') {
      return this.storageCaseOptions;
    }
    const filterValue = value.toLowerCase();
    return this.storageCaseOptions.filter(storageCase => 
      storageCase.name?.toLowerCase().includes(filterValue) ||
      storageCase.ref?.toLowerCase().includes(filterValue)
    );
  }

  /**
   * Filter podiums for autocomplete
   */
  private _filterPodiums(value: string | Podium | null): Podium[] {
    if (!value || typeof value !== 'string') {
      return this.podiumOptions;
    }
    const filterValue = value.toLowerCase();
    return this.podiumOptions.filter(podium => {
      const r = podium as any;
      return r.ref?.toLowerCase().includes(filterValue) ||
             r.name?.toLowerCase().includes(filterValue);
    });
  }

  /**
   * Display transport list in autocomplete
   */
  displayTransportList(transportList: GetTransportListResponse | null): string {
    if (!transportList) return '';
    return `List #${transportList.id} (${transportList.status || ''})`;
  }

  /**
   * Display product in autocomplete
   */
  displayProduct(product: ProductResponse | null): string {
    if (!product) return '';
    return `${product.ref || ''} - ${product.name || ''}`.trim();
  }

  isProductTransportEligible(product: ProductResponse | null): boolean {
    return this.getProductTransportBlockReason(product) === null;
  }

  getProductTransportBlockReason(product: ProductResponse | null): string | null {
    if (!product) {
      return null;
    }

    const productStatus = this.normalizeLifecycleStatus((product as any).status);
    if (productStatus !== 'AVAILABLE') {
      return `Product status: ${(product as any).status || 'N/A'}`;
    }

    const storageCaseStatusRaw = (product as any).storageCaseStatus;
    if (storageCaseStatusRaw) {
      const storageCaseStatus = this.normalizeLifecycleStatus(storageCaseStatusRaw);
      if (storageCaseStatus !== 'AVAILABLE') {
        return `Storage case status: ${storageCaseStatusRaw}`;
      }
    }

    return null;
  }

  private normalizeLifecycleStatus(status: string | null | undefined): string {
    if (!status) {
      return '';
    }

    const normalized = status
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_');

    switch (normalized) {
      case 'AVAILABLE':
        return 'AVAILABLE';
      case 'AT_EVENT':
      case 'ATEVENT':
      case 'IN_USE':
      case 'INUSE':
        return 'AT_EVENT';
      case 'INSPECTING':
        return 'INSPECTING';
      case 'UNDER_REPAIR':
      case 'UNDERREPAIR':
        return 'UNDER_REPAIR';
      case 'RETIRED':
        return 'RETIRED';
      default:
        return normalized;
    }
  }

  /**
   * Display storage case in autocomplete
   */
  displayStorageCase(storageCase: GetStorageCaseResponseDto | null): string {
    if (!storageCase) return '';
    return `${storageCase.ref || ''} - ${storageCase.name || ''}`.trim();
  }

  /**
   * Display podium in autocomplete
   */
  displayPodium(podium: Podium | null): string {
    if (!podium) return '';
    const r = podium as any;
    return `${r.ref || ''} - ${r.name || ''}`.trim();
  }

  /**
   * Setup search debouncing
   */
  private setupSearchDebouncing(): void {
    // Add debouncing if needed for search inputs
  }

  /**
   * Handle autocomplete panel opened
   */
  onAutocompleteOpened(): void {
    this.autocompletePanelOpen = true;
  }

  /**
   * Handle autocomplete panel closed
   */
  onAutocompleteClosed(): void {
    this.autocompletePanelOpen = false;
  }

  /**
   * Handle filter autocomplete opened
   */
  onFilterAutocompleteOpened(): void {
    this.filterAutocompletePanelOpen = true;
  }

  /**
   * Handle filter autocomplete closed
   */
  onFilterAutocompleteClosed(): void {
    this.filterAutocompletePanelOpen = false;
  }

  /**
   * Handle transport list selection
   */
  onTransportListSelected(event: any): void {
    const transportList = event.option.value as GetTransportListResponse;
    this.transportItemForm.patchValue({ transportListId: transportList.id });
    this.transportListInputControl.setValue(transportList);
  }

  /**
   * Handle product selection
   */
  onProductSelected(event: any): void {
    const product = event.option.value as ProductResponse;
    const blockReason = this.getProductTransportBlockReason(product);
    if (blockReason) {
      this.notificationService.error(`This product cannot be selected (${blockReason}).`);
      this.transportItemForm.patchValue({ productId: null });
      this.productInputControl.setValue('');
      return;
    }
    this.transportItemForm.patchValue({ productId: product.id });
    this.productInputControl.setValue(product);
  }

  /**
   * Handle storage case selection
   */
  onStorageCaseSelected(event: any): void {
    const storageCase = event.option.value as GetStorageCaseResponseDto;
    this.transportItemForm.patchValue({ storageCaseId: storageCase.id });
    this.storageCaseInputControl.setValue(storageCase);
  }

  /**
   * Handle podium selection
   */
  onPodiumSelected(event: any): void {
    const podium = event.option.value as Podium;
    const podiumId = (podium as any).id;
    this.transportItemForm.patchValue({ podiumId: podiumId });
    this.podiumInputControl.setValue(podium);
  }

  /**
   * Handle transport list filter selection
   */
  onTransportListFilterSelected(event: any): void {
    const transportList = event.option.value as GetTransportListResponse;
    if (transportList && transportList.id) {
      this.filters.transportListId = transportList.id;
    } else {
      this.filters.transportListId = undefined;
    }
  }

  /**
   * Handle transport list input blur - clear if invalid
   */
  onTransportListInputBlur(): void {
    const value = this.transportListInputControl.value;
    if (value && typeof value === 'string' && value.trim() !== '') {
      const matchingTransportList = this.transportListOptions.find(tl => 
        this.displayTransportList(tl).toLowerCase() === value.toLowerCase()
      );
      if (!matchingTransportList) {
        this.transportListInputControl.setValue('', { emitEvent: false });
        this.transportItemForm.patchValue({ transportListId: null }, { emitEvent: false });
      }
    }
  }

  /**
   * Handle product input blur - clear if invalid
   */
  onProductInputBlur(): void {
    const value = this.productInputControl.value;
    if (value && typeof value === 'string' && value.trim() !== '') {
      const matchingProduct = this.productOptions.find(p => 
        this.displayProduct(p).toLowerCase() === value.toLowerCase()
      );
      if (!matchingProduct || !this.isProductTransportEligible(matchingProduct)) {
        if (matchingProduct && !this.isProductTransportEligible(matchingProduct)) {
          const blockReason = this.getProductTransportBlockReason(matchingProduct);
          this.notificationService.error(`This product cannot be selected (${blockReason}).`);
        }
        this.productInputControl.setValue('', { emitEvent: false });
        this.transportItemForm.patchValue({ productId: null }, { emitEvent: false });
      }
    }
  }

  /**
   * Handle pagination change
   */
  onPageChange(event: PageEvent): void {
    this.filters.page = event.pageIndex + 1;
    this.filters.limit = event.pageSize;
    this.loadTransportItems();
  }

  /**
   * Handle sort change
   */
  onSortChange(sort: Sort): void {
    // Handle sorting if needed
    if (sort.active && sort.direction) {
      this.loadTransportItems();
    }
  }

  /**
   * Apply filters
   */
  applyFilters(): void {
    this.filters.page = 1;
    this.loadTransportItems();
  }

  /**
   * Clear filters
   */
  clearFilters(): void {
    this.transportListFilterInputControl.setValue(null);
    this.filters = {
      page: 1,
      limit: this.filters.limit || 10
    };
    this.loadTransportItems();
  }

  /**
   * Get items to display
   */
  getItemsToDisplay(): number {
    return Math.min(this.currentPage * this.pageSize, this.totalItems);
  }

  /**
   * Create new transport item
   */
  onCreateTransportItem(): void {
    this.isEditMode = false;
    this.selectedTransportItem = null;
    this.commonService.resetForm(this.transportItemForm);
    
    // Reset autocomplete controls
    this.transportListInputControl.setValue('');
    this.productInputControl.setValue('');
    this.storageCaseInputControl.setValue(null);
    this.podiumInputControl.setValue(null);
    
    this.currentDialogRef = this.dialog.open(this.modalTemplate, {
      width: '900px',
      maxWidth: '95vw',
      disableClose: true,
      panelClass: 'custom-dialog-container'
    });

    this.currentDialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.loadTransportItems();
      }
    });
  }

  /**
   * View transport item details
   */
  onViewTransportItem(transportItem: TransportItem): void {
    const r = transportItem as any;
    
    let htmlContent = `
      <div class="transport-item-details">
        <div class="detail-row">
          <strong>ID:</strong> <span>${r.id || 'N/A'}</span>
        </div>
        <div class="detail-row">
          <strong>Transport List:</strong> 
          <span>${r.transportList ? this.displayTransportList(r.transportList) : (r.transportListId ? `List #${r.transportListId}` : 'N/A')}</span>
        </div>
        <div class="detail-row">
          <strong>Product:</strong> 
          <span>${r.product ? this.displayProduct(r.product) : (r.productId ? `Product ID: ${r.productId}` : 'N/A')}</span>
        </div>
        <div class="detail-row">
          <strong>Storage Case:</strong> 
          <span>${r.storageCase ? this.displayStorageCase(r.storageCase) : (r.storageCaseId ? `Storage Case ID: ${r.storageCaseId}` : 'N/A')}</span>
        </div>
        <div class="detail-row">
          <strong>Podium:</strong> 
          <span>${r.podium ? this.displayPodium(r.podium) : (r.podiumId ? `Podium ID: ${r.podiumId}` : 'N/A')}</span>
        </div>
        <div class="detail-row">
          <strong>Gross Weight (kg):</strong> 
          <span>${r.grossWeightKg != null ? r.grossWeightKg : 'N/A'}</span>
        </div>
        <div class="detail-row">
          <strong>Returned At:</strong> 
          <span>${r.returnedAt ? (new Date(r.returnedAt).toLocaleString()) : 'Not returned'}</span>
        </div>
        <div class="detail-row">
          <strong>Notes:</strong> 
          <span>${r.notes || 'N/A'}</span>
        </div>
      </div>
    `;

    Swal.fire({
      title: 'Transport Item Details',
      html: htmlContent,
      icon: 'info',
      confirmButtonColor: '#556ee6',
      width: '600px'
    });
  }

  /**
   * Edit transport item
   */
  onEditTransportItem(transportItem: TransportItem): void {
    this.isEditMode = true;
    this.selectedTransportItem = transportItem;
    
    // Reset and populate form
    this.commonService.resetForm(this.transportItemForm);
    this.populateEditForm(transportItem);
    
    // Open dialog after a small delay to ensure form is populated
    setTimeout(() => {
      this.currentDialogRef = this.dialog.open(this.modalTemplate, {
        width: '900px',
        maxWidth: '95vw',
        disableClose: true,
        panelClass: 'custom-dialog-container'
      });

      this.currentDialogRef.afterClosed().subscribe((result) => {
        if (result) {
          this.loadTransportItems();
        }
      });
    }, 0);
  }

  /**
   * Populate the form with transport item data
   */
  private populateEditForm(transportItem: TransportItem): void {
    const r = transportItem as any;
    
    // Set basic fields (emitEvent: false to prevent triggering valueChanges)
    this.transportItemForm.patchValue({
      transportListId: r.transportListId || null,
      productId: r.productId || null,
      storageCaseId: r.storageCaseId || null,
      podiumId: r.podiumId || null,
      grossWeightKg: r.grossWeightKg || null,
      notes: r.notes || ''
    }, { emitEvent: false });

    // Set transport list
    if (r.transportList) {
      this.transportListInputControl.setValue(r.transportList, { emitEvent: false });
    } else if (r.transportListId) {
      const matchingTransportList = this.transportListOptions.find(tl => tl.id === r.transportListId);
      if (matchingTransportList) {
        this.transportListInputControl.setValue(matchingTransportList, { emitEvent: false });
      }
    }

    // Set product
    if (r.product) {
      this.productInputControl.setValue(r.product, { emitEvent: false });
    } else if (r.productId) {
      const matchingProduct = this.productOptions.find(p => p.id === r.productId);
      if (matchingProduct) {
        this.productInputControl.setValue(matchingProduct, { emitEvent: false });
      }
    }

    // Set storage case
    if (r.storageCase) {
      this.storageCaseInputControl.setValue(r.storageCase, { emitEvent: false });
    } else if (r.storageCaseId) {
      const matchingStorageCase = this.storageCaseOptions.find(sc => (sc as any).id === r.storageCaseId);
      if (matchingStorageCase) {
        this.storageCaseInputControl.setValue(matchingStorageCase, { emitEvent: false });
      }
    }

    // Set podium
    if (r.podium) {
      this.podiumInputControl.setValue(r.podium, { emitEvent: false });
    } else if (r.podiumId) {
      const matchingPodium = this.podiumOptions.find(p => (p as any).id === r.podiumId);
      if (matchingPodium) {
        this.podiumInputControl.setValue(matchingPodium, { emitEvent: false });
      }
    }
  }

  /**
   * Submit form (create or update)
   */
  onSubmitForm(): void {
    if (this.transportItemForm.invalid) {
      this.notificationService.error('Please fill in all required fields correctly.');
      return;
    }

    this.isSubmitting = true;

    const formValue = this.transportItemForm.value;

    if (this.isEditMode && this.selectedTransportItem) {
      // Update transport item
      const transportItemId = (this.selectedTransportItem as any).id;
      this.transportItemService.transportItemControllerUpdateV1$Response({
        id: transportItemId,
        body: formValue
      }).subscribe({
        next: (response) => {
          this.notificationService.success('Transport item updated successfully!');
          this.currentDialogRef?.close(true);
          this.isSubmitting = false;
        },
        error: (error) => {
          console.error('Error updating transport item:', error);
          const errorMessage = error.error?.message || 'Failed to update transport item. Please try again.';
          this.notificationService.error(errorMessage);
          this.isSubmitting = false;
        }
      });
    } else {
      // Create transport item
      this.transportItemService.transportItemControllerCreateV1$Response({
        body: formValue
      }).subscribe({
        next: (response) => {
          this.notificationService.success('Transport item created successfully!');
          this.currentDialogRef?.close(true);
          this.isSubmitting = false;
        },
        error: (error) => {
          console.error('Error creating transport item:', error);
          const errorMessage = error.error?.message || 'Failed to create transport item. Please try again.';
          this.notificationService.error(errorMessage);
          this.isSubmitting = false;
        }
      });
    }
  }

  /**
   * Mark transport item as returned
   */
  onMarkAsReturned(transportItem: TransportItem): void {
    Swal.fire({
      title: 'Mark as returned?',
      text: 'This will mark the product as returned and update its status to Inspecting.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#556ee6',
      cancelButtonColor: '#f46a6a',
      confirmButtonText: 'Yes, mark as returned!',
      cancelButtonText: 'Cancel'
    }).then((result) => {
      if (result.isConfirmed) {
        const transportItemId = (transportItem as any).id;
        this.transportItemService.transportItemControllerMarkAsReturnedV1$Response({ id: transportItemId }).subscribe({
          next: () => {
            this.notificationService.success('Transport item marked as returned successfully!');
            this.loadTransportItems();
          },
          error: (error) => {
            console.error('Error marking transport item as returned:', error);
            const errorMessage = error.error?.message || 'Failed to mark transport item as returned. Please try again.';
            this.notificationService.error(errorMessage);
          }
        });
      }
    });
  }

  /**
   * Close modal
   */
  closeModal(): void {
    this.currentDialogRef?.close(false);
  }

  /**
   * Get modal title
   */
  getModalTitle(): string {
    return this.isEditMode ? 'Edit Transport Item' : 'Create New Transport Item';
  }

  /**
   * Get submit button text
   */
  getSubmitButtonText(): string {
    return this.isEditMode ? 'Update Transport Item' : 'Create Transport Item';
  }
}
