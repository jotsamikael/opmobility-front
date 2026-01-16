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
import { ProductResponse, GetProductCategoryResponse, LocationResponse, GetProviderResponse } from 'src/app/opmobilitybackend/models';
import { ProductService, ProductCategoryService, LocationService, ProviderService } from 'src/app/opmobilitybackend/services';

// Product filters interface
export interface ProductFilters {
  page?: number;
  limit?: number;
  name?: string;
  ref?: string;
  status?: string;
  categoryId?: number;
  locationId?: number;
  providerId?: number;
  description?: string;
  entryDate?: string;
}

// Product status options
export const PRODUCT_STATUSES = [
  { value: 'Available', label: 'Available' },
  { value: 'AtEvent', label: 'At Event' },
  { value: 'Inspecting', label: 'Inspecting' },
  { value: 'UnderRepair', label: 'Under Repair' },
  { value: 'Retired', label: 'Retired' }
];

@Component({
  selector: 'app-product',
  templateUrl: './product.component.html',
  styleUrls: ['./product.component.scss']
})
export class ProductComponent implements OnInit, AfterViewInit {
  breadCrumbItems: Array<{}>;
  
  // Table properties
  displayedColumns: string[] = ['image', 'ref', 'name', 'category', 'location', 'status', 'dimensions', 'weight', 'actions'];
  dataSource: MatTableDataSource<ProductResponse> = new MatTableDataSource<ProductResponse>([]);
 
  // Pagination properties
  totalItems = 0;
  currentPage = 1;
  pageSize = 10;
  pageSizeOptions = [5, 10, 25, 50];
  
  // Loading state
  isLoading = false;
  
  // Filters
  filters: ProductFilters = {
    page: 1,
    limit: 10
  };
  
  // Search controls
  nameSearchControl = new FormControl('');
  refSearchControl = new FormControl('');
  statusFilterControl = new FormControl<string | null>(null);
  categoryFilterControl = new FormControl<string | GetProductCategoryResponse | null>(null);
  locationFilterControl = new FormControl<string | LocationResponse | null>(null);
  providerFilterControl = new FormControl<string | GetProviderResponse | null>(null);
  
  // Options for dropdowns/autocomplete
  productStatuses = PRODUCT_STATUSES;
  categoryOptions: GetProductCategoryResponse[] = [];
  locationOptions: LocationResponse[] = [];
  providerOptions: GetProviderResponse[] = [];
  
  // Autocomplete observables
  filteredCategories: Observable<GetProductCategoryResponse[]>;
  filteredCategoriesForFilter: Observable<GetProductCategoryResponse[]>;
  filteredLocations: Observable<LocationResponse[]>;
  filteredLocationsForFilter: Observable<LocationResponse[]>;
  filteredProviders: Observable<GetProviderResponse[]>;
  filteredProvidersForFilter: Observable<GetProviderResponse[]>;
  
  // Form controls for autocomplete
  categoryInputControl = new FormControl<string | GetProductCategoryResponse>('');
  categoryFilterInputControl = new FormControl<string | GetProductCategoryResponse | null>(null);
  locationInputControl = new FormControl<string | LocationResponse>('');
  locationFilterInputControl = new FormControl<string | LocationResponse | null>(null);
  providerInputControl = new FormControl<string | GetProviderResponse>('');
  providerFilterInputControl = new FormControl<string | GetProviderResponse | null>(null);
  
  private autocompletePanelOpen = false;
  private filterAutocompletePanelOpen = false;

  // Computed properties for summary cards
  get totalPages(): number {
    return Math.ceil(this.totalItems / this.pageSize) || 1;
  }

  // Modal properties
  productForm: FormGroup;
  selectedProduct: ProductResponse | null = null;
  isSubmitting = false;
  isEditMode = false;
  
  // File upload properties
  selectedImageFile: File | null = null;
  imagePreview: string | null = null;
  selectedSpecSheetFile: File | null = null;
  specSheetFileName: string | null = null;
  specSheetFileUrl: string | null = null;


  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;
  @ViewChild('modalTemplate') modalTemplate: TemplateRef<any>;

  private currentDialogRef: MatDialogRef<any> | null = null;

  constructor(
    private productService: ProductService,
    private productCategoryService: ProductCategoryService,
    private locationService: LocationService,
    private providerService: ProviderService,
    private globalFormBuilder: GlobalFormBuilder,
    private notificationService: NotificationService,
    private dialog: MatDialog,
    private fb: FormBuilder,
    private commonService: CommonService
  ) {
    this.productForm = this.globalFormBuilder.productForm();
    
    // Initialize autocomplete observables
    this.filteredCategories = this.categoryInputControl.valueChanges.pipe(
      startWith(''),
      map(value => this._filterCategories(value || ''))
    );
    
    this.filteredCategoriesForFilter = this.categoryFilterInputControl.valueChanges.pipe(
      startWith(''),
      map(value => this._filterCategories(value || ''))
    );
    
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
  }

  ngOnInit(): void {
    this.breadCrumbItems = [{ label: 'Tables' }, { label: 'Product Management', active: true }];
    this.productForm = this.globalFormBuilder.productForm();
    this.loadProducts();
    this.loadCategories();
    this.loadLocations();
    this.loadProviders();
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
   * Load products from API
   */
  loadProducts(): void {
    this.isLoading = true;
    
    const queryParams: any = {
      page: this.filters.page || 1,
      limit: this.filters.limit || 10
    };
    
    if (this.filters.name) {
      queryParams.name = this.filters.name;
    }
    
    if (this.filters.ref) {
      queryParams.ref = this.filters.ref;
    }
    
    if (this.filters.status) {
      queryParams.status = this.filters.status;
    }
    
    if (this.filters.categoryId) {
      queryParams.categoryId = Number(this.filters.categoryId);
    }
    
    if (this.filters.locationId) {
      queryParams.locationId = Number(this.filters.locationId);
    }
    
    if (this.filters.providerId) {
      queryParams.providerId = Number(this.filters.providerId);
    }
    
    if (this.filters.description) {
      queryParams.description = this.filters.description;
    }
    
    if (this.filters.entryDate) {
      queryParams.entryDate = this.filters.entryDate;
    }
    
    this.productService.productControllerGetAllProductsV1(queryParams).subscribe({
      next: (response: any) => {
        console.log('Product data:', response);
        
        if (response && response.items) {
          this.dataSource.data = response.items;
          this.totalItems = response.meta?.totalItems || 0;
          this.currentPage = response.meta?.currentPage || 1;
          this.pageSize = response.meta?.itemsPerPage || 10;
        } else if (Array.isArray(response)) {
          this.dataSource.data = response;
          this.totalItems = response.length;
        } else {
          this.dataSource.data = [];
          this.totalItems = 0;
        }
        
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading products:', error);
        this.notificationService.error('Failed to load products data. Please try again.');
        this.isLoading = false;
      }
    });
  }

  /**
   * Load categories for autocomplete
   */
  loadCategories(): void {
    this.productCategoryService.productCategoryControllerGetAllProductCategoriesV1({ limit: 1000 }).subscribe({
      next: (response: any) => {
        if (response && response.items) {
          this.categoryOptions = response.items;
        } else if (Array.isArray(response)) {
          this.categoryOptions = response;
        }
      },
      error: (error) => {
        console.error('Error loading categories:', error);
      }
    });
  }

  /**
   * Load locations for autocomplete
   */
  loadLocations(): void {
    this.locationService.locationControllerGetAllLocationsV1({ limit: 1000 }).subscribe({
      next: (response: any) => {
        if (response && response.items) {
          this.locationOptions = response.items;
        } else if (Array.isArray(response)) {
          this.locationOptions = response;
        }
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
    this.providerService.providerControllerGetAllProvidersV1({ limit: 1000 }).subscribe({
      next: (response: any) => {
        if (response && response.items) {
          this.providerOptions = response.items;
        } else if (Array.isArray(response)) {
          this.providerOptions = response;
        }
      },
      error: (error) => {
        console.error('Error loading providers:', error);
      }
    });
  }

  /**
   * Filter categories for autocomplete
   */
  private _filterCategories(value: string | GetProductCategoryResponse): GetProductCategoryResponse[] {
    const filterValue = typeof value === 'string' ? value.toLowerCase() : value.name.toLowerCase();
    return this.categoryOptions.filter(category => 
      category.name.toLowerCase().includes(filterValue) || 
      category.code.toLowerCase().includes(filterValue)
    );
  }

  /**
   * Display category in autocomplete
   */
  displayCategory(category: GetProductCategoryResponse | null): string {
    return category && category.name ? category.name : '';
  }

  /**
   * Filter locations for autocomplete
   */
  private _filterLocations(value: string | LocationResponse): LocationResponse[] {
    const filterValue = typeof value === 'string' ? value.toLowerCase() : '';
    if (!filterValue) return this.locationOptions;
    
    return this.locationOptions.filter(location => 
      location.site?.toLowerCase().includes(filterValue) || 
      location.aisle?.toLowerCase().includes(filterValue) ||
      location.positionLabel?.toLowerCase().includes(filterValue)
    );
  }

  /**
   * Display location in autocomplete
   */
  displayLocation(location: LocationResponse | null): string {
    if (!location) return '';
    const parts: string[] = [];
    // Add warehouse name first (if available)
    if (location.warehouse?.name) {
      parts.push(location.warehouse.name);
    }
    // Add aisle
    if (location.aisle) {
      parts.push(`Aisle: ${location.aisle}`);
    }
    // Add position label
    if (location.positionLabel) {
      parts.push(`Position: ${location.positionLabel}`);
    }
    return parts.length > 0 ? parts.join(' - ') : '';
  }

  /**
   * Filter providers for autocomplete
   */
  private _filterProviders(value: string | GetProviderResponse): GetProviderResponse[] {
    const filterValue = typeof value === 'string' ? value.toLowerCase() : value.name.toLowerCase();
    return this.providerOptions.filter(provider => 
      provider.name.toLowerCase().includes(filterValue)
    );
  }

  /**
   * Display provider in autocomplete
   */
  displayProvider(provider: GetProviderResponse | null): string {
    return provider && provider.name ? provider.name : '';
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
    setTimeout(() => {
      this.autocompletePanelOpen = false;
    }, 200);
  }

  /**
   * Handle category selection
   */
  onCategorySelected(event: any): void {
    const category = event.option.value as GetProductCategoryResponse;
    this.productForm.patchValue({ categoryId: category.id });
    this.categoryInputControl.setValue(category);
  }

  /**
   * Handle category input blur
   */
  onCategoryInputBlur(): void {
    if (!this.autocompletePanelOpen) {
      const currentValue = this.categoryInputControl.value;
      if (typeof currentValue === 'string' || !currentValue) {
        this.categoryInputControl.setValue('');
        this.productForm.patchValue({ categoryId: null });
      }
    }
  }

  /**
   * Handle location selection
   */
  onLocationSelected(event: any): void {
    const location = event.option.value as LocationResponse;
    this.productForm.patchValue({ locationId: location.id });
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
        this.productForm.patchValue({ locationId: null });
      }
    }
  }

  /**
   * Handle provider selection
   */
  onProviderSelected(event: any): void {
    const provider = event.option.value as GetProviderResponse;
    this.productForm.patchValue({ providerId: provider.id });
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
        this.productForm.patchValue({ providerId: null });
      }
    }
  }

  /**
   * Handle filter autocomplete panel opened
   */
  onFilterAutocompleteOpened(): void {
    this.filterAutocompletePanelOpen = true;
  }

  /**
   * Handle filter autocomplete panel closed
   */
  onFilterAutocompleteClosed(): void {
    setTimeout(() => {
      this.filterAutocompletePanelOpen = false;
    }, 200);
  }

  /**
   * Handle filter category selection
   */
  onFilterCategorySelected(event: any): void {
    const category = event.option.value as GetProductCategoryResponse;
    this.filters.categoryId = category.id;
    this.categoryFilterInputControl.setValue(category);
  }

  /**
   * Handle filter category input blur
   */
  onFilterCategoryInputBlur(): void {
    if (!this.filterAutocompletePanelOpen) {
      const currentValue = this.categoryFilterInputControl.value;
      if (typeof currentValue === 'string' || !currentValue) {
        this.categoryFilterInputControl.setValue(null);
        this.filters.categoryId = undefined;
      }
    }
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
    this.filters.providerId = provider.id;
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
        this.filters.providerId = undefined;
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
      this.productForm.patchValue({ imageFile: file });
      
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
    this.productForm.patchValue({ imageFile: null });
  }

  /**
   * Handle spec sheet file selection
   */
  onSpecSheetFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      // Validate file type (PDF only)
      if (file.type !== 'application/pdf') {
        this.notificationService.error('Invalid file type. Only PDF files are allowed.');
        return;
      }
      
      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        this.notificationService.error('Spec sheet file size must be less than 10MB.');
        return;
      }
      
      this.selectedSpecSheetFile = file;
      this.specSheetFileName = file.name;
      this.productForm.patchValue({ specSheetFile: file });
    }
  }

  /**
   * Remove spec sheet file
   */
  removeSpecSheetFile(): void {
    this.selectedSpecSheetFile = null;
    this.specSheetFileName = null;
    this.productForm.patchValue({ specSheetFile: null });
  }

  /**
   * Handle pagination changes
   */
  onPageChange(event: PageEvent): void {
    this.filters.page = event.pageIndex + 1;
    this.filters.limit = event.pageSize;
    this.currentPage = event.pageIndex + 1;
    this.pageSize = event.pageSize;
    this.loadProducts();
  }

  /**
   * Handle sorting changes
   */
  onSortChange(event: Sort): void {
    if (event.direction) {
      this.loadProducts();
    }
  }

  /**
   * Apply filters
   */
  applyFilters(): void {
    this.filters.name = this.nameSearchControl.value || undefined;
    this.filters.ref = this.refSearchControl.value || undefined;
    this.filters.status = this.statusFilterControl.value || undefined;
    this.filters.page = 1;
    this.loadProducts();
  }

  /**
   * Clear all filters
   */
  clearFilters(): void {
    this.nameSearchControl.setValue('');
    this.refSearchControl.setValue('');
    this.statusFilterControl.setValue(null);
    this.categoryFilterInputControl.setValue(null);
    this.locationFilterInputControl.setValue(null);
    this.providerFilterInputControl.setValue(null);
    
    this.filters = {
      page: 1,
      limit: this.pageSize
    };
    
    this.loadProducts();
  }

  /**
   * Set up search input debouncing
   */
  private setupSearchDebouncing(): void {
    this.nameSearchControl.valueChanges.pipe(
      debounceTime(500),
      distinctUntilChanged()
    ).subscribe(value => {
      this.filters.name = value || undefined;
      this.filters.page = 1;
      this.loadProducts();
    });
    
    this.refSearchControl.valueChanges.pipe(
      debounceTime(500),
      distinctUntilChanged()
    ).subscribe(value => {
      this.filters.ref = value || undefined;
      this.filters.page = 1;
      this.loadProducts();
    });
  }

  /**
   * Get product status label
   */
  getProductStatusLabel(status: string): string {
    const statusOption = this.productStatuses.find(s => s.value === status);
    return statusOption ? statusOption.label : status;
  }

  /**
   * Get product status badge class
   */
  getProductStatusBadgeClass(status: string): string {
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
   * Get product image URL from files array
   */
  getProductImageUrl(product: ProductResponse): string | null {
    if (!product.files || product.files.length === 0) {
      return null;
    }
    const imageFile = product.files.find(file => {
      const fileType = (file as any).fileType || '';
      return fileType && (
        fileType.startsWith('image/') || 
        fileType === 'image/jpeg' || 
        fileType === 'image/jpg' || 
        fileType === 'image/png' || 
        fileType === 'image/webp'
      );
    });
    return imageFile ? imageFile.fileUrl : null;
  }

  /**
   * Handle image error - set fallback image
   */
  onImageError(event: any): void {
    event.target.src = 'assets/images/users/avatar-1.jpg';
    event.target.onerror = null; // Prevent infinite loop
  }

  /**
   * Open create modal
   */
  onCreateProduct(): void {
    this.isEditMode = false;
    this.selectedProduct = null;
    this.commonService.resetForm(this.productForm);
    // Ensure status is set to "Available" and disabled
    this.productForm.patchValue({ status: 'Available' });
    this.productForm.get('status')?.disable();
    this.removeImageFile();
    this.removeSpecSheetFile();
    
    this.currentDialogRef = this.dialog.open(this.modalTemplate, {
      width: '900px',
      maxWidth: '95vw',
      disableClose: true,
      panelClass: 'custom-dialog-container'
    });

    this.currentDialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.loadProducts();
      }
    });
  }

  /**
   * Open edit modal
   */
  onEditProduct(product: ProductResponse): void {
    this.isEditMode = true;
    this.selectedProduct = product;
    this.populateEditForm(product);
    
    this.currentDialogRef = this.dialog.open(this.modalTemplate, {
      width: '900px',
      maxWidth: '95vw',
      disableClose: true,
      panelClass: 'custom-dialog-container'
    });

    this.currentDialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.loadProducts();
      }
    });
  }

  /**
   * Populate the form with product data
   */
  private populateEditForm(product: ProductResponse): void {
    console.log("product files", product.files);
    // Set basic fields
    this.productForm.patchValue({
      name: product.name,
      ref: product.ref,
      status: product.status,
      lengthMm: product.lengthMm,
      widthMm: product.widthMm,
      heightMm: product.heightMm,
      weightKg: product.weightKg,
      entryDate: product.entryDate ? new Date(product.entryDate).toISOString().split('T')[0] : '',
      description: product.description
    });
    
    // Status field should always be disabled
    this.productForm.get('status')?.disable();
    
    // Set category - find matching category from options
    if (product.category) {
      this.productForm.patchValue({ categoryId: product.category.id });
      const matchingCategory = this.categoryOptions.find(cat => cat.id === product.category.id);
      if (matchingCategory) {
        this.categoryInputControl.setValue(matchingCategory);
      }
    }
    
    // Set location - LocationResponse should work directly
    if (product.location) {
      this.productForm.patchValue({ locationId: product.location.id });
      this.locationInputControl.setValue(product.location);
    }
    
    // Set provider - find matching provider from options
    if (product.provider) {
      this.productForm.patchValue({ providerId: product.provider.id });
      const matchingProvider = this.providerOptions.find(prov => prov.id === product.provider.id);
      if (matchingProvider) {
        this.providerInputControl.setValue(matchingProvider);
      }
    }
    
    // Set image preview if available - find by fileType
    if (product.files && product.files.length > 0) {
      const imageFile = product.files.find(file => {
        const fileType = (file as any).fileType || '';
        return fileType && (
          fileType.startsWith('image/') || 
          fileType === 'image/jpeg' || 
          fileType === 'image/jpg' || 
          fileType === 'image/png' || 
          fileType === 'image/webp'
        );
      });
      if (imageFile) {
        this.imagePreview = imageFile.fileUrl;
      }

      // Set spec sheet URL if available - find by fileType
      const specSheetFile = product.files.find(file => {
        const fileType = (file as any).fileType || '';
        return fileType && fileType === 'application/pdf';
      });
      if (specSheetFile) {
        this.specSheetFileUrl = specSheetFile.fileUrl;
        this.specSheetFileName = specSheetFile.originalName;
      }
    }
  }

  /**
   * Submit the form (create or update)
   */
  onSubmitForm(): void {
    if (this.productForm.invalid) {
      return;
    }

    this.isSubmitting = true;
    this.commonService.disableForm(this.productForm);
    
    // Get status value (it's disabled, so use getRawValue to get the value)
    const statusValue = this.productForm.getRawValue().status || 'Available';
    
    if (this.isEditMode && this.selectedProduct) {
      // Update existing product - use FormData for multipart/form-data
      const formDataToSend = new FormData();
      formDataToSend.append('name', this.productForm.value.name);
      formDataToSend.append('ref', this.productForm.value.ref);
      formDataToSend.append('categoryId', this.productForm.value.categoryId.toString());
      formDataToSend.append('locationId', this.productForm.value.locationId.toString());
      formDataToSend.append('status', statusValue);
      formDataToSend.append('lengthMm', this.productForm.value.lengthMm.toString());
      formDataToSend.append('widthMm', this.productForm.value.widthMm.toString());
      formDataToSend.append('heightMm', this.productForm.value.heightMm.toString());
      formDataToSend.append('weightKg', this.productForm.value.weightKg.toString());
      formDataToSend.append('entryDate', this.productForm.value.entryDate);
      formDataToSend.append('description', this.productForm.value.description);
      
      if (this.productForm.value.providerId) {
        formDataToSend.append('providerId', this.productForm.value.providerId.toString());
      }
      
      // Append image file if a new one is selected
      if (this.selectedImageFile) {
        formDataToSend.append('imageFile', this.selectedImageFile);
      }
      
      // Append spec sheet file if a new one is selected
      if (this.selectedSpecSheetFile) {
        formDataToSend.append('specSheetFile', this.selectedSpecSheetFile);
      }
      
      this.productService.productControllerUpdateV1({
        id: this.selectedProduct.id,
        body: formDataToSend as any
      }).subscribe({
        next: (response) => {
          console.log("update", response);
          this.notificationService.success('Product updated successfully!');
          this.isSubmitting = false;
          this.commonService.enableForm(this.productForm);
          
          if (this.currentDialogRef) {
            this.currentDialogRef.close(true);
          }
        },
        error: (error) => {
          console.error('Error updating product:', error);
          this.notificationService.error('Failed to update product. Please try again.');
          this.isSubmitting = false;
          this.commonService.enableForm(this.productForm);
        }
      });
    } else {
      // Create new product - use FormData for multipart/form-data
      const formDataToSend = new FormData();
      formDataToSend.append('name', this.productForm.value.name);
      formDataToSend.append('ref', this.productForm.value.ref);
      formDataToSend.append('categoryId', this.productForm.value.categoryId.toString());
      formDataToSend.append('locationId', this.productForm.value.locationId.toString());
      formDataToSend.append('status', statusValue);
      formDataToSend.append('lengthMm', this.productForm.value.lengthMm.toString());
      formDataToSend.append('widthMm', this.productForm.value.widthMm.toString());
      formDataToSend.append('heightMm', this.productForm.value.heightMm.toString());
      formDataToSend.append('weightKg', this.productForm.value.weightKg.toString());
      formDataToSend.append('entryDate', this.productForm.value.entryDate);
      formDataToSend.append('description', this.productForm.value.description);
      
      if (this.productForm.value.providerId) {
        formDataToSend.append('providerId', this.productForm.value.providerId.toString());
      }
      
      if (this.selectedImageFile) {
        formDataToSend.append('imageFile', this.selectedImageFile);
      }
      
      if (this.selectedSpecSheetFile) {
        formDataToSend.append('specSheetFile', this.selectedSpecSheetFile);
      }
      
      this.productService.productControllerCreateV1({
        body: formDataToSend as any
      }).subscribe({
        next: (response) => {
          this.notificationService.success('Product created successfully!');
          this.isSubmitting = false;
          this.commonService.enableForm(this.productForm);
          
          if (this.currentDialogRef) {
            this.currentDialogRef.close(true);
          }
        },
        error: (error) => {
          console.error('Error creating product:', error);
          this.notificationService.error('Failed to create product. Please try again.');
          this.isSubmitting = false;
          this.commonService.enableForm(this.productForm);
        }
      });
    }
  }

  /**
   * Get modal title based on mode
   */
  getModalTitle(): string {
    return this.isEditMode ? 'Edit Product' : 'Create New Product';
  }

  /**
   * Get submit button text
   */
  getSubmitButtonText(): string {
    return this.isEditMode ? 'Update Product' : 'Create Product';
  }

  /**
   * View product details
   */
  onViewProduct(product: ProductResponse): void {
    // Get product image URL
    const imageUrl = this.getProductImageUrl(product);
    
    // Get spec sheet file
    const specSheetFile = product.files?.find(file => {
      const fileType = (file as any).fileType || '';
      return fileType === 'application/pdf';
    });

    // Build HTML content with image and PDF link
    let htmlContent = `
      <div class="text-start" style="max-width: 100%;">
        <!-- Product Image Section -->
        <div style="text-align: center; margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
    `;
    
    if (imageUrl) {
      htmlContent += `
          <img src="${imageUrl}" 
               alt="${product.name}" 
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
    
    htmlContent += `
        </div>
        
        <!-- Product Details -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
          <div>
            <p style="margin: 8px 0;"><strong>Reference:</strong><br><span style="color: #556ee6;">${product.ref}</span></p>
            <p style="margin: 8px 0;"><strong>Category:</strong><br>${product.category?.name || 'N/A'}</p>
            <p style="margin: 8px 0;"><strong>Location:</strong><br>${this.displayLocation(product.location) || 'N/A'}</p>
            <p style="margin: 8px 0;"><strong>Provider:</strong><br>${product.provider?.name || 'N/A'}</p>
          </div>
          <div>
            <p style="margin: 8px 0;"><strong>Status:</strong><br><span class="badge bg-success">${this.getProductStatusLabel(product.status)}</span></p>
            <p style="margin: 8px 0;"><strong>Dimensions:</strong><br>${product.lengthMm}mm × ${product.widthMm}mm × ${product.heightMm}mm</p>
            <p style="margin: 8px 0;"><strong>Weight:</strong><br>${product.weightKg} kg</p>
            <p style="margin: 8px 0;"><strong>Entry Date:</strong><br>${new Date(product.entryDate).toLocaleDateString()}</p>
          </div>
        </div>
        
        <!-- Description -->
        <div style="margin-bottom: 20px;">
          <p style="margin: 8px 0;"><strong>Description:</strong></p>
          <p style="margin: 8px 0; padding: 10px; background: #f8f9fa; border-radius: 4px; color: #666;">${product.description || 'N/A'}</p>
        </div>
        
        <!-- Specification Sheet Section -->
    `;
    
    if (specSheetFile) {
      htmlContent += `
        <div style="margin-top: 15px; padding: 15px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; text-align: center;">
          <p style="margin: 0 0 10px 0;"><strong>Specification Sheet Available</strong></p>
          <a href="${specSheetFile.fileUrl}" 
             target="_blank" 
             style="display: inline-flex; align-items: center; gap: 8px; padding: 10px 20px; background: #556ee6; color: white; text-decoration: none; border-radius: 6px; font-weight: 500; transition: background 0.3s;"
             onmouseover="this.style.background='#4858d4'" 
             onmouseout="this.style.background='#556ee6'">
            <i class="mdi mdi-24px mdi-file-pdf-box" style="color: white;"></i>
            <span>Open PDF Specification Sheet</span>
            <i class="mdi mdi-18px mdi-open-in-new"></i>
          </a>
          <p style="margin: 8px 0 0 0; font-size: 12px; color: #856404;">${specSheetFile.originalName}</p>
        </div>
      `;
    }
    
    htmlContent += `
        <!-- Product ID -->
        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #eee; text-align: center;">
          <p style="margin: 0; font-size: 12px; color: #999;">Product ID: ${product.id}</p>
        </div>
      </div>
    `;

    Swal.fire({
      title: `<strong>${product.name}</strong>`,
      html: htmlContent,
      icon: 'info',
      confirmButtonColor: '#556ee6',
      confirmButtonText: 'Close',
      width: '700px',
      customClass: {
        popup: 'product-details-popup'
      }
    });
  }

  /**
   * Delete product
   */
  onDeleteProduct(product: ProductResponse): void {
    Swal.fire({
      title: 'Are you sure?',
      text: `Do you want to delete "${product.name}" (${product.ref})?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Yes, delete it!',
      cancelButtonText: 'Cancel'
    }).then((result) => {
      if (result.isConfirmed) {
        this.productService.productControllerRemoveV1({
          id: product.id
        }).subscribe({
          next: () => {
            this.notificationService.success('Product deleted successfully!');
            this.loadProducts();
          },
          error: (error) => {
            console.error('Error deleting product:', error);
            this.notificationService.error('Failed to delete product. Please try again.');
          }
        });
      }
    });
  }
}
