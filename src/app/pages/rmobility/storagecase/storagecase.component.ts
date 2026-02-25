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
import { GetStorageCaseResponseDto, LocationResponse, GetProviderResponse, ProductResponse } from 'src/app/opmobilitybackend/models';
import { StorageCaseService, LocationService, ProviderService, ProductService } from 'src/app/opmobilitybackend/services';

// Storage case filters interface
export interface StorageCaseFilters {
  page?: number;
  limit?: number;
  ref?: string;
  lengthMm?: number;
  widthMm?: number;
  heightMm?: number;
  status?: string;
  locationId?: number;
  observations?: string;
}

// Storage case status options (same as Product)
export const STORAGE_CASE_STATUSES = [
  { value: 'Available', label: 'Available' },
  { value: 'AtEvent', label: 'At Event' },
  { value: 'Inspecting', label: 'Inspecting' },
  { value: 'UnderRepair', label: 'Under Repair' },
  { value: 'Retired', label: 'Retired' }
];

// Storage case type options
export const STORAGE_CASE_TYPES = [
  { value: 'WOODEN_BOX', label: 'Wooden Box' },
  { value: 'PLASTIC_BOX', label: 'Plastic Box' },
  { value: 'METAL_BOX', label: 'Metal Box' },
  { value: 'CARTON_BOX', label: 'Carton Box' },
  { value: 'OTHER', label: 'Other' }
];

@Component({
  selector: 'app-storagecase',
  templateUrl: './storagecase.component.html',
  styleUrls: ['./storagecase.component.scss']
})
export class StoragecaseComponent implements OnInit, AfterViewInit {
  breadCrumbItems: Array<{}>;
  
  // Table properties
  displayedColumns: string[] = ['image', 'ref', 'type', 'location', 'provider', 'status', 'dimensions', 'emptyWeight', 'actions'];
  dataSource: MatTableDataSource<GetStorageCaseResponseDto> = new MatTableDataSource<GetStorageCaseResponseDto>([]);
 
  // Pagination properties
  totalItems = 0;
  currentPage = 1;
  pageSize = 10;
  pageSizeOptions = [5, 10, 25, 50];
  
  // Loading state
  isLoading = false;
  
  // Filters
  filters: StorageCaseFilters = {
    page: 1,
    limit: 10
  };
  
  // Search controls
  refSearchControl = new FormControl('');
  statusFilterControl = new FormControl<string | null>(null);
  locationFilterInputControl = new FormControl<string | LocationResponse | null>(null);
  providerFilterInputControl = new FormControl<string | GetProviderResponse | null>(null);
  
  // Options for dropdowns/autocomplete
  storageCaseStatuses = STORAGE_CASE_STATUSES;
  storageCaseTypes = STORAGE_CASE_TYPES;
  locationOptions: LocationResponse[] = [];
  providerOptions: GetProviderResponse[] = [];
  productOptions: ProductResponse[] = [];
  
  // Autocomplete observables
  filteredLocations: Observable<LocationResponse[]>;
  filteredLocationsForFilter: Observable<LocationResponse[]>;
  filteredProviders: Observable<GetProviderResponse[]>;
  filteredProvidersForFilter: Observable<GetProviderResponse[]>;
  filteredProducts: Observable<ProductResponse[]>;
  
  // Form controls for autocomplete
  locationInputControl = new FormControl<string | LocationResponse>('');
  providerInputControl = new FormControl<string | GetProviderResponse>('');
  productInputControl = new FormControl<string | ProductResponse>('');
  
  private autocompletePanelOpen = false;
  private filterAutocompletePanelOpen = false;

  // Computed properties for summary cards
  get totalPages(): number {
    return Math.ceil(this.totalItems / this.pageSize) || 1;
  }

  // Modal properties
  storageCaseForm: FormGroup;
  selectedStorageCase: GetStorageCaseResponseDto | null = null;
  isSubmitting = false;
  isEditMode = false;
  
  // File upload properties
  selectedImageFile: File | null = null;
  imagePreview: string | null = null;

  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;
  @ViewChild('modalTemplate') modalTemplate: TemplateRef<any>;

  private currentDialogRef: MatDialogRef<any> | null = null;

  constructor(
    private storageCaseService: StorageCaseService,
    private locationService: LocationService,
    private providerService: ProviderService,
    private productService: ProductService,
    private globalFormBuilder: GlobalFormBuilder,
    private notificationService: NotificationService,
    private dialog: MatDialog,
    private fb: FormBuilder,
    private commonService: CommonService
  ) {
    this.storageCaseForm = this.globalFormBuilder.storageCaseForm();
    
    // Initialize autocomplete observables
    this.filteredLocations = this.locationInputControl.valueChanges.pipe(
      startWith(''),
      map(value => this._filterLocations(value || ''))
    );
    
    this.filteredLocationsForFilter = this.locationFilterInputControl.valueChanges.pipe(
      startWith(''),
      map(value => this._filterLocations(value || ''))
    );
    
    this.filteredProviders = this.providerInputControl.valueChanges.pipe(
      startWith(''),
      map(value => this._filterProviders(value || ''))
    );
    
    this.filteredProvidersForFilter = this.providerFilterInputControl.valueChanges.pipe(
      startWith(''),
      map(value => this._filterProviders(value || ''))
    );
    
    this.filteredProducts = this.productInputControl.valueChanges.pipe(
      startWith(''),
      map(value => this._filterProducts(value || ''))
    );
  }

  ngOnInit(): void {
    this.breadCrumbItems = [{ label: 'Tables' }, { label: 'Storage Case Management', active: true }];
    this.storageCaseForm = this.globalFormBuilder.storageCaseForm();
    this.loadStorageCases();
    this.loadLocations();
    this.loadProviders();
    this.loadProducts();
    this.setupSearchDebouncing();
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
   * Load storage cases from API
   */
  loadStorageCases(): void {
    this.isLoading = true;
    
    const queryParams: any = {
      page: this.filters.page || 1,
      limit: this.filters.limit || 10
    };
    
    if (this.filters.ref) {
      queryParams.ref = this.filters.ref;
    }
    if (this.filters.lengthMm) {
      queryParams.lengthMm = this.filters.lengthMm;
    }
    if (this.filters.widthMm) {
      queryParams.widthMm = this.filters.widthMm;
    }
    if (this.filters.heightMm) {
      queryParams.heightMm = this.filters.heightMm;
    }
    if (this.filters.status) {
      queryParams.status = this.filters.status;
    }
    if (this.filters.locationId) {
      queryParams.locationId = this.filters.locationId;
    }
    if (this.filters.observations) {
      queryParams.observations = this.filters.observations;
    }
    
    this.storageCaseService.storageCaseControllerGetAllStorageCasesV1$Response(queryParams as any).subscribe({
      next: (response) => {
        const responseBody = response.body as any;
        
        if (responseBody && responseBody.items) {
          this.dataSource.data = responseBody.items;
          this.totalItems = responseBody.meta?.totalItems || 0;
          this.currentPage = responseBody.meta?.currentPage || 1;
          this.pageSize = responseBody.meta?.itemsPerPage || 10;
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
        console.error('Error loading storage cases:', error);
        this.notificationService.error('Failed to load storage cases. Please try again.');
        this.isLoading = false;
      }
    });
  }

  /**
   * Load locations for autocomplete
   */
  loadLocations(): void {
    this.locationService.locationControllerGetAllLocationsV1$Response({ page: 1, limit: 1000 } as any).subscribe({
      next: (response) => {
        const responseBody = response.body as any;
        this.locationOptions = responseBody?.items || responseBody || [];
      },
      error: (error) => {
        console.error('Error loading locations:', error);
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
   * Filter locations
   */
  private _filterLocations(value: string | LocationResponse): LocationResponse[] {
    if (!value || typeof value !== 'string') {
      return this.locationOptions;
    }
    const filterValue = value.toLowerCase();
    return this.locationOptions.filter(location => 
      this.displayLocation(location).toLowerCase().includes(filterValue)
    );
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
   * Display location in autocomplete
   */
  displayLocation(location: LocationResponse | null): string {
    if (!location) return '';
    const parts: string[] = [];
    if (location.warehouse?.name) parts.push(location.warehouse.name);
    if (location.aisle) parts.push(`Aisle: ${location.aisle}`);
    if (location.positionLabel) parts.push(`Position: ${location.positionLabel}`);
    return parts.length > 0 ? parts.join(' - ') : '';
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
    return `${product.ref} - ${product.name}`;
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
   * Handle location selection
   */
  onLocationSelected(event: any): void {
    const location = event.option.value as LocationResponse;
    this.storageCaseForm.patchValue({ locationId: location.id });
    this.locationInputControl.setValue(location);
  }

  /**
   * Handle location input blur
   */
  onLocationInputBlur(): void {
    if (!this.autocompletePanelOpen) {
      const currentValue = this.locationInputControl.value;
      if (typeof currentValue === 'string' || !currentValue) {
        this.locationInputControl.setValue('');
        this.storageCaseForm.patchValue({ locationId: null });
      }
    }
  }

  /**
   * Handle provider selection
   */
  onProviderSelected(event: any): void {
    const provider = event.option.value as GetProviderResponse;
    this.storageCaseForm.patchValue({ providerId: provider.id });
    this.providerInputControl.setValue(provider);
  }

  /**
   * Handle provider input blur
   */
  onProviderInputBlur(): void {
    if (!this.autocompletePanelOpen) {
      const currentValue = this.providerInputControl.value;
      if (typeof currentValue === 'string' || !currentValue) {
        this.providerInputControl.setValue('');
        this.storageCaseForm.patchValue({ providerId: null });
      }
    }
  }

  /**
   * Handle product selection
   */
  onProductSelected(event: any): void {
    const product = event.option.value as ProductResponse;
    this.storageCaseForm.patchValue({ productId: product.id });
    this.productInputControl.setValue(product);
  }

  /**
   * Handle product input blur
   */
  onProductInputBlur(): void {
    if (!this.autocompletePanelOpen) {
      const currentValue = this.productInputControl.value;
      if (typeof currentValue === 'string' || !currentValue) {
        this.productInputControl.setValue('');
        this.storageCaseForm.patchValue({ productId: null });
      }
    }
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
    setTimeout(() => {
      this.filterAutocompletePanelOpen = false;
    }, 200);
  }

  /**
   * Handle filter location selection
   */
  onFilterLocationSelected(event: any): void {
    const location = event.option.value as LocationResponse;
    this.filters.locationId = location.id;
    this.locationFilterInputControl.setValue(location);
  }

  /**
   * Handle filter location input blur
   */
  onFilterLocationInputBlur(): void {
    if (!this.filterAutocompletePanelOpen) {
      const currentValue = this.locationFilterInputControl.value;
      if (typeof currentValue === 'string' || !currentValue) {
        this.locationFilterInputControl.setValue(null);
        this.filters.locationId = undefined;
      }
    }
  }

  /**
   * Handle filter provider selection
   */
  onFilterProviderSelected(event: any): void {
    const provider = event.option.value as GetProviderResponse;
    // Note: providerId is not in filters interface, add if needed
    this.providerFilterInputControl.setValue(provider);
  }

  /**
   * Handle filter provider input blur
   */
  onFilterProviderInputBlur(): void {
    if (!this.filterAutocompletePanelOpen) {
      const currentValue = this.providerFilterInputControl.value;
      if (typeof currentValue === 'string' || !currentValue) {
        this.providerFilterInputControl.setValue(null);
      }
    }
  }

  /**
   * Handle image file selection
   */
  onImageFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      // Validate file type
      const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      if (!validTypes.includes(file.type)) {
        this.notificationService.error('Invalid file type. Only JPEG, PNG, and WebP images are allowed.');
        return;
      }
      
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        this.notificationService.error('Image file size must be less than 5MB.');
        return;
      }
      
      this.selectedImageFile = file;
      this.storageCaseForm.patchValue({ imageFile: file });
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.imagePreview = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  }

  /**
   * Remove image file
   */
  removeImageFile(): void {
    this.selectedImageFile = null;
    this.imagePreview = null;
    this.storageCaseForm.patchValue({ imageFile: null });
  }

  /**
   * Handle pagination changes
   */
  onPageChange(event: PageEvent): void {
    this.filters.page = event.pageIndex + 1;
    this.filters.limit = event.pageSize;
    this.currentPage = event.pageIndex + 1;
    this.pageSize = event.pageSize;
    this.loadStorageCases();
  }

  /**
   * Handle sorting changes
   */
  onSortChange(event: Sort): void {
    if (event.direction) {
      this.loadStorageCases();
    }
  }

  /**
   * Apply filters
   */
  applyFilters(): void {
    this.filters.ref = this.refSearchControl.value || undefined;
    this.filters.status = this.statusFilterControl.value || undefined;
    if (this.locationFilterInputControl.value && typeof this.locationFilterInputControl.value === 'object') {
      this.filters.locationId = (this.locationFilterInputControl.value as LocationResponse).id;
    }
    this.filters.page = 1;
    this.loadStorageCases();
  }

  /**
   * Clear all filters
   */
  clearFilters(): void {
    this.refSearchControl.setValue('');
    this.statusFilterControl.setValue(null);
    this.locationFilterInputControl.setValue(null);
    this.providerFilterInputControl.setValue(null);
    
    this.filters = {
      page: 1,
      limit: this.pageSize
    };
    
    this.loadStorageCases();
  }

  /**
   * Set up search input debouncing
   */
  private setupSearchDebouncing(): void {
    this.refSearchControl.valueChanges.pipe(
      debounceTime(500),
      distinctUntilChanged()
    ).subscribe(value => {
      this.filters.ref = value || undefined;
      this.filters.page = 1;
      this.loadStorageCases();
    });
  }

  /**
   * Get storage case status label
   */
  getStorageCaseStatusLabel(status: string): string {
    const statusOption = this.storageCaseStatuses.find(s => s.value === status);
    return statusOption ? statusOption.label : status;
  }

  /**
   * Get storage case status badge class
   */
  getStorageCaseStatusBadgeClass(status: string): string {
    const statusClasses: { [key: string]: string } = {
      'Available': 'bg-success',
      'AtEvent': 'bg-info',
      'Inspecting': 'bg-warning',
      'UnderRepair': 'bg-danger',
      'Retired': 'bg-secondary'
    };
    return statusClasses[status] || 'bg-secondary';
  }

  /**
   * Get storage case image URL from images array
   */
  getStorageCaseImageUrl(storageCase: GetStorageCaseResponseDto): string | null {
    if (!storageCase.images || storageCase.images.length === 0) {
      return null;
    }
    
    // First, try to find by fileType/mimeType if available
    const imageFile = storageCase.images.find((file: any) => {
      const fileType = file.fileType || file.mimeType || '';
      if (fileType) {
        return fileType.startsWith('image/') || 
               fileType === 'image/jpeg' || 
               fileType === 'image/jpg' || 
               fileType === 'image/png' || 
               fileType === 'image/webp';
      }
      return false;
    });
    
    if (imageFile && imageFile.fileUrl) {
      return imageFile.fileUrl;
    }
    
    // If no fileType is available, return the first image's fileUrl
    // Storage cases only have images (STORAGE_CASE_IMAGE purpose), so we can safely return the first one
    const firstImage = storageCase.images[0];
    if (firstImage && firstImage.fileUrl) {
      return firstImage.fileUrl;
    }
    
    return null;
  }

  /**
   * Handle image error - set fallback image
   */
  onImageError(event: any): void {
    event.target.src = 'assets/images/users/avatar-1.jpg';
    event.target.onerror = null; // Prevent infinite loop
  }

  /**
   * Get storage case type label
   */
  getStorageCaseTypeLabel(type: string): string {
    const typeOption = this.storageCaseTypes.find(t => t.value === type);
    return typeOption ? typeOption.label : type;
  }

  /**
   * Create new storage case
   */
  onCreateStorageCase(): void {
    this.isEditMode = false;
    this.selectedStorageCase = null;
    this.commonService.resetForm(this.storageCaseForm);
    // Ensure status is set to "Available" and disabled
    this.storageCaseForm.patchValue({ status: 'Available' });
    this.storageCaseForm.get('status')?.disable();
    this.removeImageFile();
    
    this.currentDialogRef = this.dialog.open(this.modalTemplate, {
      width: '900px',
      maxWidth: '95vw',
      disableClose: true,
      panelClass: 'custom-dialog-container'
    });

    this.currentDialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.loadStorageCases();
      }
    });
  }

  /**
   * Edit storage case
   */
  onEditStorageCase(storageCase: GetStorageCaseResponseDto): void {
    this.isEditMode = true;
    this.selectedStorageCase = storageCase;
    this.commonService.resetForm(this.storageCaseForm);
    this.populateEditForm(storageCase);
    
    this.currentDialogRef = this.dialog.open(this.modalTemplate, {
      width: '900px',
      maxWidth: '95vw',
      disableClose: true,
      panelClass: 'custom-dialog-container'
    });

    this.currentDialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.loadStorageCases();
      }
    });
  }

  /**
   * Populate the form with storage case data
   */
  private populateEditForm(storageCase: GetStorageCaseResponseDto): void {
    const sc = storageCase as any;
    this.storageCaseForm.patchValue({
      ref: sc.ref || '',
      name: sc.name || '',
      lengthMm: sc.lengthMm || null,
      widthMm: sc.widthMm || null,
      heightMm: sc.heightMm || null,
      status: sc.status || 'Available',
      observations: sc.observations || '',
      emptyWeightKg: sc.emptyWeightKg || null,
      manufacturedOn: sc.manufacturedOn ? new Date(sc.manufacturedOn).toISOString().split('T')[0] : '',
      type: sc.type || '',
      material: sc.material || '',
      providerId: sc.providerId || sc.provider?.id || null,
      locationId: sc.locationId || sc.location?.id || null,
      productId: sc.productId || null
    });
    
    // Status field should always be disabled
    this.storageCaseForm.get('status')?.disable();
    
    // Set location - find matching location from options or use location object if available
    if (sc.location) {
      this.locationInputControl.setValue(sc.location);
    } else if (sc.locationId) {
      const matchingLocation = this.locationOptions.find(loc => loc.id === sc.locationId);
      if (matchingLocation) {
        this.locationInputControl.setValue(matchingLocation);
      }
    }
    
    // Set provider - find matching provider from options
    if (storageCase.provider) {
      const matchingProvider = this.providerOptions.find(prov => prov.id === storageCase.provider.id);
      if (matchingProvider) {
        this.providerInputControl.setValue(matchingProvider);
      }
    }

    // Set product if available
    if ((storageCase as any).productId) {
      const matchingProduct = this.productOptions.find(prod => prod.id === (storageCase as any).productId);
      if (matchingProduct) {
        this.productInputControl.setValue(matchingProduct);
      }
    }
    
    // Set image preview if available - use getStorageCaseImageUrl logic
    const imageUrl = this.getStorageCaseImageUrl(storageCase);
    if (imageUrl) {
      this.imagePreview = imageUrl;
    } else {
      this.imagePreview = null;
    }
  }

  /**
   * Submit the form (create or update)
   */
  onSubmitForm(): void {
    if (this.storageCaseForm.invalid) {
      return;
    }

    this.isSubmitting = true;
    this.commonService.disableForm(this.storageCaseForm);
    
    // Get status value (it's disabled, so use getRawValue to get the value)
    const statusValue = this.storageCaseForm.getRawValue().status || 'Available';
    
    if (this.isEditMode && this.selectedStorageCase) {
      // Update existing storage case - use FormData for multipart/form-data
      const formDataToSend = new FormData();
      formDataToSend.append('ref', this.storageCaseForm.value.ref);
      formDataToSend.append('name', this.storageCaseForm.value.name);
      formDataToSend.append('locationId', this.storageCaseForm.value.locationId.toString());
      formDataToSend.append('providerId', this.storageCaseForm.value.providerId.toString());
      if (this.storageCaseForm.value.productId) {
        formDataToSend.append('productId', this.storageCaseForm.value.productId.toString());
      }
      formDataToSend.append('type', this.storageCaseForm.value.type);
      if (this.storageCaseForm.value.material) {
        formDataToSend.append('material', this.storageCaseForm.value.material);
      }
      formDataToSend.append('lengthMm', this.storageCaseForm.value.lengthMm.toString());
      formDataToSend.append('widthMm', this.storageCaseForm.value.widthMm.toString());
      formDataToSend.append('heightMm', this.storageCaseForm.value.heightMm.toString());
      formDataToSend.append('emptyWeightKg', this.storageCaseForm.value.emptyWeightKg.toString());
      formDataToSend.append('manufacturedOn', this.storageCaseForm.value.manufacturedOn);
      formDataToSend.append('status', statusValue);
      formDataToSend.append('observations', this.storageCaseForm.value.observations);
      
      // Append image file if a new one is selected
      if (this.selectedImageFile) {
        formDataToSend.append('imageFile', this.selectedImageFile);
      }
      
      this.storageCaseService.storageCaseControllerUpdateV1({
        id: this.selectedStorageCase.id,
        body: formDataToSend as any
      }).subscribe({
        next: (response) => {
          this.notificationService.success('Storage case updated successfully!');
          this.isSubmitting = false;
          this.commonService.enableForm(this.storageCaseForm);
          
          if (this.currentDialogRef) {
            this.currentDialogRef.close(true);
          }
        },
        error: (error) => {
          console.error('Error updating storage case:', error);
          this.notificationService.error('Failed to update storage case. Please try again.');
          this.isSubmitting = false;
          this.commonService.enableForm(this.storageCaseForm);
        }
      });
    } else {
      // Create new storage case - use FormData for multipart/form-data
      const formDataToSend = new FormData();
      formDataToSend.append('ref', this.storageCaseForm.value.ref);
      formDataToSend.append('name', this.storageCaseForm.value.name);
      formDataToSend.append('locationId', this.storageCaseForm.value.locationId.toString());
      formDataToSend.append('providerId', this.storageCaseForm.value.providerId.toString());
      if (this.storageCaseForm.value.productId) {
        formDataToSend.append('productId', this.storageCaseForm.value.productId.toString());
      }
      formDataToSend.append('type', this.storageCaseForm.value.type);
      if (this.storageCaseForm.value.material) {
        formDataToSend.append('material', this.storageCaseForm.value.material);
      }
      formDataToSend.append('lengthMm', this.storageCaseForm.value.lengthMm.toString());
      formDataToSend.append('widthMm', this.storageCaseForm.value.widthMm.toString());
      formDataToSend.append('heightMm', this.storageCaseForm.value.heightMm.toString());
      formDataToSend.append('emptyWeightKg', this.storageCaseForm.value.emptyWeightKg.toString());
      formDataToSend.append('manufacturedOn', this.storageCaseForm.value.manufacturedOn);
      formDataToSend.append('status', statusValue);
      formDataToSend.append('observations', this.storageCaseForm.value.observations);
      
      if (this.selectedImageFile) {
        formDataToSend.append('imageFile', this.selectedImageFile);
      }
      
      this.storageCaseService.storageCaseControllerCreateV1({
        body: formDataToSend as any
      }).subscribe({
        next: (response) => {
          this.notificationService.success('Storage case created successfully!');
          this.isSubmitting = false;
          this.commonService.enableForm(this.storageCaseForm);
          
          if (this.currentDialogRef) {
            this.currentDialogRef.close(true);
          }
        },
        error: (error) => {
          console.error('Error creating storage case:', error);
          this.notificationService.error('Failed to create storage case. Please try again.');
          this.isSubmitting = false;
          this.commonService.enableForm(this.storageCaseForm);
        }
      });
    }
  }

  /**
   * View storage case details
   */
  onViewStorageCase(storageCase: GetStorageCaseResponseDto): void {
    const sc = storageCase as any;
    // Get storage case image URL
    const imageUrl = this.getStorageCaseImageUrl(storageCase);

    // Build HTML content with image
    let htmlContent = `
      <div class="text-start" style="max-width: 100%;">
        <!-- Storage Case Image Section -->
        <div style="text-align: center; margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
    `;
    
    if (imageUrl) {
      htmlContent += `
          <img src="${imageUrl}" 
               alt="${sc.name || sc.ref || 'Storage Case'}" 
               style="max-width: 100%; max-height: 300px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);"
               onerror="this.src='assets/images/users/avatar-1.jpg'; this.onerror=null;">
      `;
    } else {
      htmlContent += `
          <div style="padding: 40px; color: #999;">
            <i class="mdi mdi-48px mdi-image-off"></i>
            <p style="margin-top: 10px;">No image available</p>
          </div>
      `;
    }
    
    const locationDisplay = sc.location ? this.displayLocation(sc.location) : (sc.locationId ? 'Location ID: ' + sc.locationId : 'N/A');
    const dimensions = sc.lengthMm && sc.widthMm && sc.heightMm 
      ? `${sc.lengthMm}mm × ${sc.widthMm}mm × ${sc.heightMm}mm` 
      : 'N/A';
    
    htmlContent += `
        </div>
        
        <!-- Storage Case Details -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
          <div>
            <p style="margin: 8px 0;"><strong>Reference:</strong><br><span style="color: #556ee6;">${sc.ref || 'N/A'}</span></p>
            <p style="margin: 8px 0;"><strong>Name:</strong><br>${sc.name || 'N/A'}</p>
            <p style="margin: 8px 0;"><strong>Type:</strong><br>${this.getStorageCaseTypeLabel(sc.type || '')}</p>
            <p style="margin: 8px 0;"><strong>Material:</strong><br>${sc.material || 'N/A'}</p>
            <p style="margin: 8px 0;"><strong>Location:</strong><br>${locationDisplay}</p>
          </div>
          <div>
            <p style="margin: 8px 0;"><strong>Status:</strong><br><span class="badge bg-success">${this.getStorageCaseStatusLabel(sc.status || 'Available')}</span></p>
            <p style="margin: 8px 0;"><strong>Dimensions:</strong><br>${dimensions}</p>
            <p style="margin: 8px 0;"><strong>Empty Weight:</strong><br>${sc.emptyWeightKg ? sc.emptyWeightKg + ' kg' : 'N/A'}</p>
            <p style="margin: 8px 0;"><strong>Manufactured On:</strong><br>${sc.manufacturedOn ? new Date(sc.manufacturedOn).toLocaleDateString() : 'N/A'}</p>
            <p style="margin: 8px 0;"><strong>Provider:</strong><br>${sc.provider?.name || 'N/A'}</p>
          </div>
        </div>
        
        <!-- Observations -->
        <div style="margin-bottom: 20px;">
          <p style="margin: 8px 0;"><strong>Observations:</strong></p>
          <p style="margin: 8px 0; padding: 10px; background: #f8f9fa; border-radius: 4px; color: #666;">${sc.observations || 'N/A'}</p>
        </div>
        
        <!-- Storage Case ID -->
        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #eee; text-align: center;">
          <p style="margin: 0; font-size: 12px; color: #999;">Storage Case ID: ${storageCase.id}</p>
        </div>
      </div>
    `;

    Swal.fire({
      title: `<strong>${sc.name || sc.ref || 'Storage Case'}</strong>`,
      html: htmlContent,
      icon: 'info',
      confirmButtonColor: '#556ee6',
      confirmButtonText: 'Close',
      width: '700px',
      customClass: {
        popup: 'storage-case-details-popup'
      }
    });
  }

  /**
   * Delete storage case
   */
  onDeleteStorageCase(storageCase: GetStorageCaseResponseDto): void {
    const sc = storageCase as any;
    const nameOrRef = sc.name || sc.ref || 'Storage Case';
    Swal.fire({
      title: 'Are you sure?',
      text: `Do you want to delete "${nameOrRef}" (${sc.ref || storageCase.id})?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Yes, delete it!',
      cancelButtonText: 'Cancel'
    }).then((result) => {
      if (result.isConfirmed) {
        this.storageCaseService.storageCaseControllerRemoveV1({
          id: storageCase.id
        }).subscribe({
          next: () => {
            this.notificationService.success('Storage case deleted successfully!');
            this.loadStorageCases();
          },
          error: (error) => {
            console.error('Error deleting storage case:', error);
            this.notificationService.error('Failed to delete storage case. Please try again.');
          }
        });
      }
    });
  }

  /**
   * Get modal title
   */
  getModalTitle(): string {
    return this.isEditMode ? 'Edit Storage Case' : 'Create New Storage Case';
  }

  /**
   * Get submit button text
   */
  getSubmitButtonText(): string {
    return this.isEditMode ? 'Update Storage Case' : 'Create Storage Case';
  }

  /**
   * Get items to display for pagination info
   */
  getItemsToDisplay(): number {
    return Math.min(this.currentPage * this.pageSize, this.totalItems);
  }
}
