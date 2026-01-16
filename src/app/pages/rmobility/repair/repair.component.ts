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
import { Repair } from 'src/app/opmobilitybackend/models/repair';
import { GetProviderResponse, ProductResponse, GetStorageCaseResponseDto } from 'src/app/opmobilitybackend/models';
import { RepairService, ProviderService, ProductService, StorageCaseService } from 'src/app/opmobilitybackend/services';

// Repair filters interface
export interface RepairFilters {
  page?: number;
  limit?: number;
  status?: 'IN_PROGRESS' | 'DONE';
}

// Repair status options
export const REPAIR_STATUSES = [
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'DONE', label: 'Done' }
];

@Component({
  selector: 'app-repair',
  templateUrl: './repair.component.html',
  styleUrls: ['./repair.component.scss']
})
export class RepairComponent implements OnInit, AfterViewInit {
  breadCrumbItems: Array<{}>;
  
  // Table properties
  displayedColumns: string[] = ['id', 'product', 'storageCase', 'provider', 'costAmount', 'startedAt', 'finishedAt', 'status', 'actions'];
  dataSource: MatTableDataSource<Repair> = new MatTableDataSource<Repair>([]);
 
  // Pagination properties
  totalItems = 0;
  currentPage = 1;
  pageSize = 10;
  pageSizeOptions = [5, 10, 25, 50];
  totalPages = 1;
  
  // Loading state
  isLoading = false;
  
  // Filters
  filters: RepairFilters = {
    page: 1,
    limit: 10
  };
  
  // Search controls
  statusFilterControl = new FormControl<string | null>(null);
  
  // Options for dropdowns/autocomplete
  repairStatuses = REPAIR_STATUSES;
  providerOptions: GetProviderResponse[] = [];
  productOptions: ProductResponse[] = [];
  storageCaseOptions: GetStorageCaseResponseDto[] = [];
  
  // Form controls for autocomplete
  providerInputControl = new FormControl<string | GetProviderResponse>('');
  productInputControl = new FormControl<string | ProductResponse>('');
  storageCaseInputControl = new FormControl<string | GetStorageCaseResponseDto>('');
  
  // Autocomplete observables
  filteredProviders: Observable<GetProviderResponse[]>;
  filteredProducts: Observable<ProductResponse[]>;
  filteredStorageCases: Observable<GetStorageCaseResponseDto[]>;
  
  private autocompletePanelOpen = false;

  // Form
  repairForm: FormGroup;
  isEditMode = false;
  selectedRepair: Repair | null = null;
  currentDialogRef: MatDialogRef<any> | null = null;
  isSubmitting = false;

  // File uploads
  selectedQuoteFile: File | null = null;
  selectedInvoiceFile: File | null = null;
  quoteFilePreview: string | null = null;
  invoiceFilePreview: string | null = null;
  currentQuoteFileUrl: string | null = null;
  currentInvoiceFileUrl: string | null = null;

  @ViewChild('modalTemplate') modalTemplate!: TemplateRef<any>;
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  constructor(
    private fb: FormBuilder,
    private globalFormBuilder: GlobalFormBuilder,
    private repairService: RepairService,
    private providerService: ProviderService,
    private productService: ProductService,
    private storageCaseService: StorageCaseService,
    private notificationService: NotificationService,
    private commonService: CommonService,
    private dialog: MatDialog
  ) {
    this.breadCrumbItems = [
      { label: 'RMobility' },
      { label: 'Repair Management', active: true }
    ];

    this.repairForm = this.globalFormBuilder.repairForm();

    // Set up autocomplete filtering
    this.filteredProviders = this.providerInputControl.valueChanges.pipe(
      startWith(''),
      map(value => this._filterProviders(value))
    );

    this.filteredProducts = this.productInputControl.valueChanges.pipe(
      startWith(''),
      map(value => this._filterProducts(value))
    );

    this.filteredStorageCases = this.storageCaseInputControl.valueChanges.pipe(
      startWith(''),
      map(value => this._filterStorageCases(value))
    );

    // XOR logic: When product is selected, clear and disable storage case
    this.productInputControl.valueChanges.subscribe(value => {
      if (value && typeof value === 'object') {
        this.repairForm.patchValue({ productId: (value as ProductResponse).id, storageCaseId: null });
        this.storageCaseInputControl.setValue('');
        this.storageCaseInputControl.disable();
      } else if (!value) {
        this.repairForm.patchValue({ productId: null });
        this.storageCaseInputControl.enable();
      }
    });

    // XOR logic: When storage case is selected, clear and disable product
    this.storageCaseInputControl.valueChanges.subscribe(value => {
      if (value && typeof value === 'object') {
        this.repairForm.patchValue({ storageCaseId: (value as GetStorageCaseResponseDto).id, productId: null });
        this.productInputControl.setValue('');
        this.productInputControl.disable();
      } else if (!value) {
        this.repairForm.patchValue({ storageCaseId: null });
        this.productInputControl.enable();
      }
    });
  }

  ngOnInit(): void {
    this.loadRepairs();
    this.loadProviders();
    this.loadProducts();
    this.loadStorageCases();
  }

  ngAfterViewInit(): void {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
    this.setupSearchDebouncing();
  }

  /**
   * Load repairs from API
   */
  loadRepairs(): void {
    this.isLoading = true;
    const queryParams: any = {
      page: this.filters.page || 1,
      limit: this.filters.limit || 10
    };

    if (this.filters.status) {
      queryParams.status = this.filters.status;
    }

    this.repairService.repairControllerFindAllV1$Response(queryParams).subscribe({
      next: (response) => {
        const responseBody = response.body as any;
        
        // Handle both paginated and array responses
        if (responseBody && responseBody.items) {
          this.dataSource.data = responseBody.items;
          this.totalItems = responseBody.meta?.totalItems || 0;
          this.currentPage = responseBody.meta?.currentPage || 1;
          this.pageSize = responseBody.meta?.itemsPerPage || 10;
          this.totalPages = responseBody.meta?.totalPages || 1;
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
        console.error('Error loading repairs:', error);
        this.notificationService.error('Failed to load repairs. Please try again.');
        this.isLoading = false;
      }
    });
  }

  /**
   * Load providers for autocomplete
   */
  loadProviders(): void {
    this.providerService.providerControllerGetAllProvidersV1$Response({ page: 1, limit: 1000 } as any).subscribe({
      next: (response) => {
        const responseBody = response.body as any;
        this.providerOptions = responseBody?.items || responseBody || [];
      },
      error: (error) => {
        console.error('Error loading providers:', error);
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
   * Filter providers
   */
  private _filterProviders(value: string | GetProviderResponse): GetProviderResponse[] {
    if (!value || typeof value !== 'string') {
      return this.providerOptions;
    }
    const filterValue = value.toLowerCase();
    return this.providerOptions.filter(provider => 
      provider.name?.toLowerCase().includes(filterValue)
    );
  }

  /**
   * Filter products
   */
  private _filterProducts(value: string | ProductResponse): ProductResponse[] {
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
   * Filter storage cases
   */
  private _filterStorageCases(value: string | GetStorageCaseResponseDto): GetStorageCaseResponseDto[] {
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
   * Display provider in autocomplete
   */
  displayProvider(provider: GetProviderResponse | null): string {
    return provider?.name || '';
  }

  /**
   * Display product in autocomplete
   */
  displayProduct(product: ProductResponse | null): string {
    if (!product) return '';
    return `${product.ref || ''} - ${product.name || ''}`.trim();
  }

  /**
   * Display storage case in autocomplete
   */
  displayStorageCase(storageCase: GetStorageCaseResponseDto | null): string {
    if (!storageCase) return '';
    return `${storageCase.ref || ''} - ${storageCase.name || ''}`.trim();
  }

  /**
   * Handle autocomplete opened
   */
  onAutocompleteOpened(): void {
    this.autocompletePanelOpen = true;
  }

  /**
   * Handle autocomplete closed
   */
  onAutocompleteClosed(): void {
    setTimeout(() => {
      this.autocompletePanelOpen = false;
    }, 200);
  }

  /**
   * Handle provider selection
   */
  onProviderSelected(event: any): void {
    const provider = event.option.value as GetProviderResponse;
    this.repairForm.patchValue({ providerId: provider.id });
    this.providerInputControl.setValue(provider);
  }

  /**
   * Handle product selection
   */
  onProductSelected(event: any): void {
    const product = event.option.value as ProductResponse;
    this.repairForm.patchValue({ productId: product.id, storageCaseId: null });
    this.productInputControl.setValue(product);
    this.storageCaseInputControl.setValue('');
    this.storageCaseInputControl.disable();
  }

  /**
   * Handle storage case selection
   */
  onStorageCaseSelected(event: any): void {
    const storageCase = event.option.value as GetStorageCaseResponseDto;
    this.repairForm.patchValue({ storageCaseId: storageCase.id, productId: null });
    this.storageCaseInputControl.setValue(storageCase);
    this.productInputControl.setValue('');
    this.productInputControl.disable();
  }

  /**
   * Handle quote file selection
   */
  onQuoteFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      // Validate file type
      const validTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
      if (!validTypes.includes(file.type)) {
        this.notificationService.error('Invalid file type. Only PDF, JPEG, and PNG files are allowed.');
        return;
      }
      
      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        this.notificationService.error('File size must be less than 10MB.');
        return;
      }
      
      this.selectedQuoteFile = file;
      this.repairForm.patchValue({ quoteFile: file });
      this.currentQuoteFileUrl = null; // Clear current file URL when new file is selected
      
      // Create preview for images
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e: any) => {
          this.quoteFilePreview = e.target.result;
        };
        reader.readAsDataURL(file);
      } else {
        this.quoteFilePreview = null;
      }
    }
  }

  /**
   * Handle invoice file selection
   */
  onInvoiceFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      // Validate file type
      const validTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
      if (!validTypes.includes(file.type)) {
        this.notificationService.error('Invalid file type. Only PDF, JPEG, and PNG files are allowed.');
        return;
      }
      
      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        this.notificationService.error('File size must be less than 10MB.');
        return;
      }
      
      this.selectedInvoiceFile = file;
      this.repairForm.patchValue({ invoiceFile: file });
      this.currentInvoiceFileUrl = null; // Clear current file URL when new file is selected
      
      // Create preview for images
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e: any) => {
          this.invoiceFilePreview = e.target.result;
        };
        reader.readAsDataURL(file);
      } else {
        this.invoiceFilePreview = null;
      }
    }
  }

  /**
   * Remove quote file
   */
  removeQuoteFile(): void {
    this.selectedQuoteFile = null;
    this.quoteFilePreview = null;
    this.currentQuoteFileUrl = null;
    this.repairForm.patchValue({ quoteFile: null });
  }

  /**
   * Remove invoice file
   */
  removeInvoiceFile(): void {
    this.selectedInvoiceFile = null;
    this.invoiceFilePreview = null;
    this.currentInvoiceFileUrl = null;
    this.repairForm.patchValue({ invoiceFile: null });
  }

  /**
   * Handle pagination changes
   */
  onPageChange(event: PageEvent): void {
    this.filters.page = event.pageIndex + 1;
    this.filters.limit = event.pageSize;
    this.currentPage = event.pageIndex + 1;
    this.pageSize = event.pageSize;
    this.loadRepairs();
  }

  /**
   * Handle sorting changes
   */
  onSortChange(event: Sort): void {
    if (event.direction) {
      // Handle sorting if needed
      this.loadRepairs();
    }
  }

  /**
   * Apply filters
   */
  applyFilters(): void {
    const statusValue = this.statusFilterControl.value;
    this.filters.status = (statusValue === 'IN_PROGRESS' || statusValue === 'DONE') ? statusValue : undefined;
    this.filters.page = 1;
    this.loadRepairs();
  }

  /**
   * Clear all filters
   */
  clearFilters(): void {
    this.statusFilterControl.setValue(null);
    
    this.filters = {
      page: 1,
      limit: this.pageSize
    };
    
    this.loadRepairs();
  }

  /**
   * Set up search input debouncing
   */
  private setupSearchDebouncing(): void {
    // Add debouncing if needed for future search fields
  }

  /**
   * Get repair status label
   */
  getRepairStatusLabel(status: string): string {
    const statusOption = this.repairStatuses.find(s => s.value === status);
    return statusOption ? statusOption.label : status;
  }

  /**
   * Get repair status badge class
   */
  getRepairStatusBadgeClass(status: string): string {
    const statusClasses: { [key: string]: string } = {
      'IN_PROGRESS': 'bg-warning',
      'DONE': 'bg-success'
    };
    return statusClasses[status] || 'bg-secondary';
  }

  /**
   * Create new repair
   */
  onCreateRepair(): void {
    this.isEditMode = false;
    this.selectedRepair = null;
    this.commonService.resetForm(this.repairForm);
    this.repairForm.patchValue({ status: 'IN_PROGRESS' });
    this.removeQuoteFile();
    this.removeInvoiceFile();
    
    // Enable both inputs initially
    this.productInputControl.enable();
    this.storageCaseInputControl.enable();
    this.productInputControl.setValue('');
    this.storageCaseInputControl.setValue('');
    
    this.currentDialogRef = this.dialog.open(this.modalTemplate, {
      width: '900px',
      maxWidth: '95vw',
      disableClose: true,
      panelClass: 'custom-dialog-container'
    });

    this.currentDialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.loadRepairs();
      }
    });
  }

  /**
   * Edit repair
   */
  onEditRepair(repair: Repair): void {
    this.isEditMode = true;
    this.selectedRepair = repair;
    
    // Reset file selection state
    this.selectedQuoteFile = null;
    this.selectedInvoiceFile = null;
    this.quoteFilePreview = null;
    this.invoiceFilePreview = null;
    
    // Reset and populate form
    this.commonService.resetForm(this.repairForm);
    this.populateEditForm(repair);
    
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
          this.loadRepairs();
        }
      });
    }, 0);
  }

  /**
   * Populate the form with repair data
   */
  private populateEditForm(repair: Repair): void {
    const r = repair as any;
    
    // Set basic fields (emitEvent: false to prevent triggering valueChanges)
    this.repairForm.patchValue({
      providerId: r.providerId || r.provider?.id || null,
      costAmount: r.costAmount || null,
      startedAt: r.startedAt ? new Date(r.startedAt).toISOString().split('T')[0] : '',
      finishedAt: r.finishedAt ? new Date(r.finishedAt).toISOString().split('T')[0] : '',
      status: r.status || 'IN_PROGRESS',
      notes: r.notes || ''
    }, { emitEvent: false });

    // Enable both inputs first
    this.productInputControl.enable({ emitEvent: false });
    this.storageCaseInputControl.enable({ emitEvent: false });

    // Handle XOR: Set product OR storage case
    if (r.productId || r.product) {
      this.repairForm.patchValue({ 
        productId: r.productId || r.product?.id,
        storageCaseId: null 
      }, { emitEvent: false });
      
      if (r.product) {
        this.productInputControl.setValue(r.product, { emitEvent: false });
      } else if (r.productId) {
        const matchingProduct = this.productOptions.find(p => p.id === r.productId);
        if (matchingProduct) {
          this.productInputControl.setValue(matchingProduct, { emitEvent: false });
        }
      }
      this.storageCaseInputControl.setValue('', { emitEvent: false });
      this.storageCaseInputControl.disable({ emitEvent: false });
    } else if (r.storageCaseId || r.storageCase) {
      this.repairForm.patchValue({ 
        storageCaseId: r.storageCaseId || r.storageCase?.id,
        productId: null 
      }, { emitEvent: false });
      
      if (r.storageCase) {
        this.storageCaseInputControl.setValue(r.storageCase, { emitEvent: false });
      } else if (r.storageCaseId) {
        const matchingStorageCase = this.storageCaseOptions.find(sc => sc.id === r.storageCaseId);
        if (matchingStorageCase) {
          this.storageCaseInputControl.setValue(matchingStorageCase, { emitEvent: false });
        }
      }
      this.productInputControl.setValue('', { emitEvent: false });
      this.productInputControl.disable({ emitEvent: false });
    }

    // Set provider
    if (r.provider) {
      this.providerInputControl.setValue(r.provider, { emitEvent: false });
    } else if (r.providerId) {
      const matchingProvider = this.providerOptions.find(p => p.id === r.providerId);
      if (matchingProvider) {
        this.providerInputControl.setValue(matchingProvider, { emitEvent: false });
      }
    }

    // Set current file URLs for display
    this.currentQuoteFileUrl = r.quoteUrl || null;
    this.currentInvoiceFileUrl = r.invoiceUrl || null;
  }

  /**
   * Submit form (create or update)
   */
  onSubmitForm(): void {
    if (this.repairForm.invalid) {
      this.notificationService.error('Please fill in all required fields correctly.');
      return;
    }

    // Validate XOR constraint
    const productId = this.repairForm.get('productId')?.value;
    const storageCaseId = this.repairForm.get('storageCaseId')?.value;
    
    if (!productId && !storageCaseId) {
      this.notificationService.error('Please select either a product or a storage case.');
      return;
    }

    if (productId && storageCaseId) {
      this.notificationService.error('Please select either a product OR a storage case, not both.');
      return;
    }

    this.isSubmitting = true;

    const formValue = this.repairForm.value;
    const formData = new FormData();

    // Add fields to FormData
    if (formValue.productId) {
      formData.append('productId', formValue.productId.toString());
    }
    if (formValue.storageCaseId) {
      formData.append('storageCaseId', formValue.storageCaseId.toString());
    }
    if (formValue.providerId) {
      formData.append('providerId', formValue.providerId.toString());
    }
    if (formValue.costAmount != null) {
      formData.append('costAmount', formValue.costAmount.toString());
    }
    if (formValue.startedAt) {
      formData.append('startedAt', formValue.startedAt);
    }
    if (formValue.finishedAt) {
      formData.append('finishedAt', formValue.finishedAt);
    }
    if (formValue.status) {
      formData.append('status', formValue.status);
    }
    if (formValue.notes) {
      formData.append('notes', formValue.notes);
    }

    // Add files if selected
    if (this.selectedQuoteFile) {
      formData.append('quoteFile', this.selectedQuoteFile);
    }
    if (this.selectedInvoiceFile) {
      formData.append('invoiceFile', this.selectedInvoiceFile);
    }

    if (this.isEditMode && this.selectedRepair) {
      // Update repair
      const repairId = (this.selectedRepair as any).id;
      this.repairService.repairControllerUpdateV1$Response({
        id: repairId,
        body: formData as any
      }).subscribe({
        next: (response) => {
          this.notificationService.success('Repair updated successfully!');
          this.currentDialogRef?.close(true);
          this.isSubmitting = false;
        },
        error: (error) => {
          console.error('Error updating repair:', error);
          const errorMessage = error.error?.message || 'Failed to update repair. Please try again.';
          this.notificationService.error(errorMessage);
          this.isSubmitting = false;
        }
      });
    } else {
      // Create repair
      this.repairService.repairControllerCreateV1$Response({
        body: formData as any
      }).subscribe({
        next: (response) => {
          this.notificationService.success('Repair created successfully!');
          this.currentDialogRef?.close(true);
          this.isSubmitting = false;
        },
        error: (error) => {
          console.error('Error creating repair:', error);
          const errorMessage = error.error?.message || 'Failed to create repair. Please try again.';
          this.notificationService.error(errorMessage);
          this.isSubmitting = false;
        }
      });
    }
  }

  /**
   * Delete repair
   */
  onDeleteRepair(repair: Repair): void {
    Swal.fire({
      title: 'Are you sure?',
      text: 'This action cannot be undone!',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#556ee6',
      cancelButtonColor: '#f46a6a',
      confirmButtonText: 'Yes, delete it!',
      cancelButtonText: 'Cancel'
    }).then((result) => {
      if (result.isConfirmed) {
        const repairId = (repair as any).id;
        this.repairService.repairControllerRemoveV1$Response({ id: repairId }).subscribe({
          next: () => {
            this.notificationService.success('Repair deleted successfully!');
            this.loadRepairs();
          },
          error: (error) => {
            console.error('Error deleting repair:', error);
            const errorMessage = error.error?.message || 'Failed to delete repair. Please try again.';
            this.notificationService.error(errorMessage);
          }
        });
      }
    });
  }

  /**
   * View repair details
   */
  onViewRepair(repair: Repair): void {
    const r = repair as any;
    
    // Build HTML content
    let htmlContent = `
      <div class="text-start" style="max-width: 100%;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
          <div>
            <p style="margin: 8px 0;"><strong>Repair ID:</strong><br><span style="color: #556ee6;">${r.id || 'N/A'}</span></p>
            <p style="margin: 8px 0;"><strong>Status:</strong><br><span class="badge ${this.getRepairStatusBadgeClass(r.status || '')}">${this.getRepairStatusLabel(r.status || '')}</span></p>
            <p style="margin: 8px 0;"><strong>Provider:</strong><br>${r.provider ? r.provider.name : (r.providerId ? 'Provider ID: ' + r.providerId : 'N/A')}</p>
            <p style="margin: 8px 0;"><strong>Cost Amount:</strong><br>${r.costAmount != null ? '$' + r.costAmount : 'N/A'}</p>
          </div>
          <div>
            <p style="margin: 8px 0;"><strong>Started At:</strong><br>${r.startedAt ? new Date(r.startedAt).toLocaleDateString() : 'N/A'}</p>
            <p style="margin: 8px 0;"><strong>Finished At:</strong><br>${r.finishedAt ? new Date(r.finishedAt).toLocaleDateString() : 'N/A'}</p>
            <p style="margin: 8px 0;"><strong>Product:</strong><br>${r.product ? (r.product.ref || '') + ' - ' + (r.product.name || '') : (r.productId ? 'Product ID: ' + r.productId : 'N/A')}</p>
            <p style="margin: 8px 0;"><strong>Storage Case:</strong><br>${r.storageCase ? (r.storageCase.ref || '') + ' - ' + (r.storageCase.name || '') : (r.storageCaseId ? 'Storage Case ID: ' + r.storageCaseId : 'N/A')}</p>
          </div>
        </div>
        
        <!-- Files Section -->
        <div style="margin-bottom: 20px;">
          <p style="margin: 8px 0;"><strong>Quote File:</strong></p>
          ${r.quoteUrl ? `<a href="${r.quoteUrl}" target="_blank" style="color: #556ee6; text-decoration: underline;">View Quote</a>` : '<span>N/A</span>'}
          
          <p style="margin: 8px 0; margin-top: 10px;"><strong>Invoice File:</strong></p>
          ${r.invoiceUrl ? `<a href="${r.invoiceUrl}" target="_blank" style="color: #556ee6; text-decoration: underline;">View Invoice</a>` : '<span>N/A</span>'}
        </div>
        
        <!-- Notes -->
        <div style="margin-bottom: 20px;">
          <p style="margin: 8px 0;"><strong>Notes:</strong></p>
          <p style="margin: 8px 0; padding: 10px; background: #f8f9fa; border-radius: 4px; color: #666;">${r.notes || 'N/A'}</p>
        </div>
      </div>
    `;

    Swal.fire({
      title: `<strong>Repair Details</strong>`,
      html: htmlContent,
      icon: 'info',
      confirmButtonColor: '#556ee6',
      confirmButtonText: 'Close',
      width: '700px',
      customClass: {
        popup: 'repair-details-popup'
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
    return this.isEditMode ? 'Edit Repair' : 'Create New Repair';
  }

  /**
   * Get submit button text
   */
  getSubmitButtonText(): string {
    return this.isEditMode ? 'Update Repair' : 'Create Repair';
  }

  /**
   * Get items to display for pagination
   */
  getItemsToDisplay(): number {
    return Math.min(this.currentPage * this.pageSize, this.totalItems);
  }
}
