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
import { Inspection } from 'src/app/opmobilitybackend/models/inspection';
import { ProductResponse, GetStorageCaseResponseDto } from 'src/app/opmobilitybackend/models';
import { InspectionService, ProductService, StorageCaseService } from 'src/app/opmobilitybackend/services';

// Inspection filters interface
export interface InspectionFilters {
  page?: number;
  limit?: number;
  result?: 'OK' | 'TO_REPAIR' | 'TO_RETIRE';
  productId?: number;
  storageCaseId?: number;
}

// Inspection result options
export const INSPECTION_RESULTS = [
  { value: 'OK', label: 'OK' },
  { value: 'TO_REPAIR', label: 'To Repair' },
  { value: 'TO_RETIRE', label: 'To Retire' }
];

@Component({
  selector: 'app-inspection',
  templateUrl: './inspection.component.html',
  styleUrls: ['./inspection.component.scss']
})
export class InspectionComponent implements OnInit, AfterViewInit {
  breadCrumbItems: Array<{}>;
  
  // Table properties
  displayedColumns: string[] = ['id', 'product', 'storageCase', 'inspectedAt', 'result', 'inspector', 'actions'];
  dataSource: MatTableDataSource<Inspection> = new MatTableDataSource<Inspection>([]);
 
  // Pagination properties
  totalItems = 0;
  currentPage = 1;
  pageSize = 10;
  pageSizeOptions = [5, 10, 25, 50];
  totalPages = 1;
  
  // Loading state
  isLoading = false;
  
  // Filters
  filters: InspectionFilters = {
    page: 1,
    limit: 10
  };
  
  // Search controls
  resultFilterControl = new FormControl<string | null>(null);
  
  // Options for dropdowns/autocomplete
  inspectionResults = INSPECTION_RESULTS;
  productOptions: ProductResponse[] = [];
  storageCaseOptions: GetStorageCaseResponseDto[] = [];
  
  // Form controls for autocomplete
  productInputControl = new FormControl<string | ProductResponse>('');
  storageCaseInputControl = new FormControl<string | GetStorageCaseResponseDto>('');
  
  // Autocomplete observables
  filteredProducts: Observable<ProductResponse[]>;
  filteredStorageCases: Observable<GetStorageCaseResponseDto[]>;
  
  private autocompletePanelOpen = false;

  // Form
  inspectionForm: FormGroup;
  isEditMode = false;
  selectedInspection: Inspection | null = null;
  currentDialogRef: MatDialogRef<any> | null = null;
  isSubmitting = false;

  @ViewChild('modalTemplate') modalTemplate!: TemplateRef<any>;
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  constructor(
    private fb: FormBuilder,
    private globalFormBuilder: GlobalFormBuilder,
    private inspectionService: InspectionService,
    private productService: ProductService,
    private storageCaseService: StorageCaseService,
    private notificationService: NotificationService,
    private commonService: CommonService,
    private dialog: MatDialog
  ) {
    this.breadCrumbItems = [
      { label: 'RMobility' },
      { label: 'Inspection Management', active: true }
    ];

    this.inspectionForm = this.globalFormBuilder.inspectionForm();

    // Set up autocomplete filtering
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
        this.inspectionForm.patchValue({ productId: (value as ProductResponse).id, storageCaseId: null });
        this.storageCaseInputControl.setValue('');
        this.storageCaseInputControl.disable();
      } else if (!value) {
        this.inspectionForm.patchValue({ productId: null });
        this.storageCaseInputControl.enable();
      }
    });

    // XOR logic: When storage case is selected, clear and disable product
    this.storageCaseInputControl.valueChanges.subscribe(value => {
      if (value && typeof value === 'object') {
        this.inspectionForm.patchValue({ storageCaseId: (value as GetStorageCaseResponseDto).id, productId: null });
        this.productInputControl.setValue('');
        this.productInputControl.disable();
      } else if (!value) {
        this.inspectionForm.patchValue({ storageCaseId: null });
        this.productInputControl.enable();
      }
    });
  }

  ngOnInit(): void {
    this.loadInspections();
    this.loadProducts();
    this.loadStorageCases();
  }

  ngAfterViewInit(): void {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
    this.setupSearchDebouncing();
  }

  /**
   * Load inspections from API
   */
  loadInspections(): void {
    this.isLoading = true;
    const queryParams: any = {
      page: this.filters.page || 1,
      limit: this.filters.limit || 10
    };

    if (this.filters.result) {
      queryParams.result = this.filters.result;
    }
    if (this.filters.productId) {
      queryParams.productId = this.filters.productId;
    }
    if (this.filters.storageCaseId) {
      queryParams.storageCaseId = this.filters.storageCaseId;
    }

    this.inspectionService.inspectionControllerFindAllV1$Response(queryParams).subscribe({
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
        console.error('Error loading inspections:', error);
        this.notificationService.error('Failed to load inspections. Please try again.');
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
   * Display product in autocomplete
   */
  displayProduct(product: ProductResponse | null): string {
    return product ? `${product.name || ''} (${product.ref || ''})` : '';
  }

  /**
   * Display storage case in autocomplete
   */
  displayStorageCase(storageCase: GetStorageCaseResponseDto | null): string {
    return storageCase ? `${storageCase.name || ''} (${storageCase.ref || ''})` : '';
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
   * Handle product selection
   */
  onProductSelected(event: any): void {
    const product = event.option.value as ProductResponse;
    this.inspectionForm.patchValue({ productId: product.id, storageCaseId: null });
    this.productInputControl.setValue(product);
    this.storageCaseInputControl.setValue('');
    this.storageCaseInputControl.disable();
  }

  /**
   * Handle storage case selection
   */
  onStorageCaseSelected(event: any): void {
    const storageCase = event.option.value as GetStorageCaseResponseDto;
    this.inspectionForm.patchValue({ storageCaseId: storageCase.id, productId: null });
    this.storageCaseInputControl.setValue(storageCase);
    this.productInputControl.setValue('');
    this.productInputControl.disable();
  }

  /**
   * Handle product input blur - clear if invalid
   */
  onProductInputBlur(): void {
    const value = this.productInputControl.value;
    if (value && typeof value === 'string' && value.trim() !== '') {
      // If it's a string and not a valid product object, clear it
      const matchingProduct = this.productOptions.find(p => 
        this.displayProduct(p).toLowerCase() === value.toLowerCase()
      );
      if (!matchingProduct) {
        this.productInputControl.setValue('', { emitEvent: false });
        this.inspectionForm.patchValue({ productId: null }, { emitEvent: false });
      }
    }
  }

  /**
   * Handle storage case input blur - clear if invalid
   */
  onStorageCaseInputBlur(): void {
    const value = this.storageCaseInputControl.value;
    if (value && typeof value === 'string' && value.trim() !== '') {
      // If it's a string and not a valid storage case object, clear it
      const matchingStorageCase = this.storageCaseOptions.find(sc => 
        this.displayStorageCase(sc).toLowerCase() === value.toLowerCase()
      );
      if (!matchingStorageCase) {
        this.storageCaseInputControl.setValue('', { emitEvent: false });
        this.inspectionForm.patchValue({ storageCaseId: null }, { emitEvent: false });
      }
    }
  }

  /**
   * Handle pagination change
   */
  onPageChange(event: PageEvent): void {
    this.filters.page = event.pageIndex + 1;
    this.filters.limit = event.pageSize;
    this.loadInspections();
  }

  /**
   * Handle sort change
   */
  onSortChange(sort: Sort): void {
    // Handle sorting if needed
    if (sort.active && sort.direction) {
      this.loadInspections();
    }
  }

  /**
   * Apply filters
   */
  applyFilters(): void {
    const resultValue = this.resultFilterControl.value;
    this.filters.result = (resultValue === 'OK' || resultValue === 'TO_REPAIR' || resultValue === 'TO_RETIRE') 
      ? resultValue 
      : undefined;
    
    this.filters.page = 1;
    this.loadInspections();
  }

  /**
   * Clear filters
   */
  clearFilters(): void {
    this.resultFilterControl.setValue(null);
    this.filters = {
      page: 1,
      limit: this.filters.limit || 10
    };
    this.loadInspections();
  }

  /**
   * Get items to display
   */
  getItemsToDisplay(): number {
    return Math.min(this.currentPage * this.pageSize, this.totalItems);
  }

  /**
   * Create new inspection
   */
  onCreateInspection(): void {
    this.isEditMode = false;
    this.selectedInspection = null;
    this.commonService.resetForm(this.inspectionForm);
    
    // Reset autocomplete controls
    this.productInputControl.enable();
    this.storageCaseInputControl.enable();
    this.productInputControl.setValue('');
    this.storageCaseInputControl.setValue('');
    
    // Set default inspectedAt to current date/time
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const defaultDateTime = `${year}-${month}-${day}T${hours}:${minutes}`;
    
    this.inspectionForm.patchValue({
      inspectedAt: defaultDateTime,
      result: 'OK'
    }, { emitEvent: false });
    
    this.currentDialogRef = this.dialog.open(this.modalTemplate, {
      width: '900px',
      maxWidth: '95vw',
      disableClose: true,
      panelClass: 'custom-dialog-container'
    });

    this.currentDialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.loadInspections();
      }
    });
  }

  /**
   * View inspection details
   */
  onViewInspection(inspection: Inspection): void {
    const r = inspection as any;
    
    let htmlContent = `
      <div class="inspection-details">
        <div class="detail-row">
          <strong>ID:</strong> <span>${r.id || 'N/A'}</span>
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
          <strong>Inspected At:</strong> 
          <span>${r.inspectedAt ? (new Date(r.inspectedAt).toLocaleString()) : 'N/A'}</span>
        </div>
        <div class="detail-row">
          <strong>Result:</strong> 
          <span class="badge ${this.getInspectionResultBadgeClass(r.result)}">${this.getInspectionResultLabel(r.result)}</span>
        </div>
        <div class="detail-row">
          <strong>Inspector:</strong> 
          <span>${r.inspector ? (r.inspector.firstName + ' ' + r.inspector.lastName) : (r.inspectorId ? `Inspector ID: ${r.inspectorId}` : 'N/A')}</span>
        </div>
        <div class="detail-row">
          <strong>Comments:</strong> 
          <span>${r.comments || 'N/A'}</span>
        </div>
      </div>
    `;

    Swal.fire({
      title: 'Inspection Details',
      html: htmlContent,
      icon: 'info',
      confirmButtonColor: '#556ee6',
      width: '600px'
    });
  }

  /**
   * Edit inspection
   */
  onEditInspection(inspection: Inspection): void {
    this.isEditMode = true;
    this.selectedInspection = inspection;
    
    // Reset and populate form
    this.commonService.resetForm(this.inspectionForm);
    this.populateEditForm(inspection);
    
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
          this.loadInspections();
        }
      });
    }, 0);
  }

  /**
   * Populate the form with inspection data
   */
  private populateEditForm(inspection: Inspection): void {
    const r = inspection as any;
    
    // Format inspectedAt for datetime-local input
    let inspectedAtFormatted = '';
    if (r.inspectedAt) {
      const inspectedDate = new Date(r.inspectedAt);
      const year = inspectedDate.getFullYear();
      const month = String(inspectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(inspectedDate.getDate()).padStart(2, '0');
      const hours = String(inspectedDate.getHours()).padStart(2, '0');
      const minutes = String(inspectedDate.getMinutes()).padStart(2, '0');
      inspectedAtFormatted = `${year}-${month}-${day}T${hours}:${minutes}`;
    } else {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      inspectedAtFormatted = `${year}-${month}-${day}T${hours}:${minutes}`;
    }
    
    // Set basic fields (emitEvent: false to prevent triggering valueChanges)
    this.inspectionForm.patchValue({
      result: r.result || 'OK',
      inspectedAt: inspectedAtFormatted,
      comments: r.comments || ''
    }, { emitEvent: false });

    // Enable both inputs first
    this.productInputControl.enable({ emitEvent: false });
    this.storageCaseInputControl.enable({ emitEvent: false });

    // Handle XOR: Set product OR storage case
    if (r.productId || r.product) {
      this.inspectionForm.patchValue({ 
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
      this.inspectionForm.patchValue({ 
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
  }

  /**
   * Submit form (create or update)
   */
  onSubmitForm(): void {
    if (this.inspectionForm.invalid) {
      this.notificationService.error('Please fill in all required fields correctly.');
      return;
    }

    // Validate XOR constraint
    const productId = this.inspectionForm.get('productId')?.value;
    const storageCaseId = this.inspectionForm.get('storageCaseId')?.value;
    
    if (!productId && !storageCaseId) {
      this.notificationService.error('Please select either a product or a storage case.');
      return;
    }

    if (productId && storageCaseId) {
      this.notificationService.error('Please select either a product OR a storage case, not both.');
      return;
    }

    this.isSubmitting = true;

    const formValue = this.inspectionForm.value;
    const formData = new FormData();

    // Add fields to FormData
    if (formValue.productId) {
      formData.append('productId', formValue.productId.toString());
    }
    if (formValue.storageCaseId) {
      formData.append('storageCaseId', formValue.storageCaseId.toString());
    }
    if (formValue.result) {
      formData.append('result', formValue.result);
    }
    if (formValue.inspectedAt) {
      // Convert datetime-local string to ISO format
      const inspectedAtDate = new Date(formValue.inspectedAt);
      formData.append('inspectedAt', inspectedAtDate.toISOString());
    }
    if (formValue.comments) {
      formData.append('comments', formValue.comments);
    }

    if (this.isEditMode && this.selectedInspection) {
      // Update inspection
      const inspectionId = (this.selectedInspection as any).id;
      this.inspectionService.inspectionControllerUpdateV1$Response({
        id: inspectionId,
        body: formData as any
      }).subscribe({
        next: (response) => {
          this.notificationService.success('Inspection updated successfully!');
          this.currentDialogRef?.close(true);
          this.isSubmitting = false;
        },
        error: (error) => {
          console.error('Error updating inspection:', error);
          const errorMessage = error.error?.message || 'Failed to update inspection. Please try again.';
          this.notificationService.error(errorMessage);
          this.isSubmitting = false;
        }
      });
    } else {
      // Create inspection
      this.inspectionService.inspectionControllerCreateV1$Response({
        body: formData as any
      }).subscribe({
        next: (response) => {
          this.notificationService.success('Inspection created successfully!');
          this.currentDialogRef?.close(true);
          this.isSubmitting = false;
        },
        error: (error) => {
          console.error('Error creating inspection:', error);
          const errorMessage = error.error?.message || 'Failed to create inspection. Please try again.';
          this.notificationService.error(errorMessage);
          this.isSubmitting = false;
        }
      });
    }
  }

  /**
   * Delete inspection
   */
  onDeleteInspection(inspection: Inspection): void {
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
        const inspectionId = (inspection as any).id;
        this.inspectionService.inspectionControllerRemoveV1$Response({ id: inspectionId }).subscribe({
          next: () => {
            this.notificationService.success('Inspection deleted successfully!');
            this.loadInspections();
          },
          error: (error) => {
            console.error('Error deleting inspection:', error);
            const errorMessage = error.error?.message || 'Failed to delete inspection. Please try again.';
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
    return this.isEditMode ? 'Edit Inspection' : 'Create New Inspection';
  }

  /**
   * Get submit button text
   */
  getSubmitButtonText(): string {
    return this.isEditMode ? 'Update Inspection' : 'Create Inspection';
  }

  /**
   * Get inspection result label
   */
  getInspectionResultLabel(result: string | null | undefined): string {
    if (!result) return 'N/A';
    const status = this.inspectionResults.find(s => s.value === result);
    return status ? status.label : result;
  }

  /**
   * Get inspection result badge class
   */
  getInspectionResultBadgeClass(result: string | null | undefined): string {
    if (!result) return 'bg-secondary';
    switch (result) {
      case 'OK':
        return 'bg-success';
      case 'TO_REPAIR':
        return 'bg-warning';
      case 'TO_RETIRE':
        return 'bg-danger';
      default:
        return 'bg-secondary';
    }
  }
}
