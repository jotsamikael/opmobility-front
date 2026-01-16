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
import { GetConsumableResponse, GetProviderResponse, ProductResponse, GetExpoEventResponse, ConsumableCategory } from 'src/app/opmobilitybackend/models';
import { ConsumableService, ProviderService, ProductService, ExpoEventService } from 'src/app/opmobilitybackend/services';

// Consumable filters interface
export interface ConsumableFilters {
  page?: number;
  limit?: number;
  name?: string;
  category?: string;
  providerId?: number;
  productId?: number;
  eventId?: number;
  purchasedAt?: string;
  notes?: string;
}

// Consumable category options
export const CONSUMABLE_CATEGORIES = [
  { value: 'Accessories', label: 'Accessories' },
  { value: 'Tools', label: 'Tools' },
  { value: 'Materials', label: 'Materials' },
  { value: 'Other', label: 'Other' }
];

@Component({
  selector: 'app-consumable',
  templateUrl: './consumable.component.html',
  styleUrls: ['./consumable.component.scss']
})
export class ConsumableComponent implements OnInit, AfterViewInit {
  breadCrumbItems: Array<{}>;
  
  // Table properties
  displayedColumns: string[] = ['image', 'name', 'category', 'unit', 'quantity', 'unitCost', 'purchasedAt', 'provider', 'product', 'event', 'actions'];
  dataSource: MatTableDataSource<GetConsumableResponse> = new MatTableDataSource<GetConsumableResponse>([]);
 
  // Pagination properties
  totalItems = 0;
  currentPage = 1;
  pageSize = 10;
  pageSizeOptions = [5, 10, 25, 50];
  
  // Loading state
  isLoading = false;
  
  // Filters
  filters: ConsumableFilters = {
    page: 1,
    limit: 10
  };
  
  // Search controls
  nameSearchControl = new FormControl('');
  categoryFilterControl = new FormControl<string | null>(null);
  providerFilterInputControl = new FormControl<string | GetProviderResponse | null>(null);
  productFilterInputControl = new FormControl<string | ProductResponse | null>(null);
  eventFilterInputControl = new FormControl<string | GetExpoEventResponse | null>(null);
  
  // Options for dropdowns/autocomplete
  consumableCategories = CONSUMABLE_CATEGORIES;
  providerOptions: GetProviderResponse[] = [];
  productOptions: ProductResponse[] = [];
  eventOptions: GetExpoEventResponse[] = [];
  
  // Autocomplete observables
  filteredProviders: Observable<GetProviderResponse[]>;
  filteredProvidersForFilter: Observable<GetProviderResponse[]>;
  filteredProducts: Observable<ProductResponse[]>;
  filteredProductsForFilter: Observable<ProductResponse[]>;
  filteredEvents: Observable<GetExpoEventResponse[]>;
  filteredEventsForFilter: Observable<GetExpoEventResponse[]>;
  
  // Form controls for autocomplete
  providerInputControl = new FormControl<string | GetProviderResponse>('');
  productInputControl = new FormControl<string | ProductResponse>('');
  eventInputControl = new FormControl<string | GetExpoEventResponse | null>(null);
  
  private autocompletePanelOpen = false;
  private filterAutocompletePanelOpen = false;

  // Computed properties for summary cards
  get totalPages(): number {
    return Math.ceil(this.totalItems / this.pageSize) || 1;
  }

  // Modal properties
  consumableForm: FormGroup;
  selectedConsumable: GetConsumableResponse | null = null;
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
    private consumableService: ConsumableService,
    private providerService: ProviderService,
    private productService: ProductService,
    private expoEventService: ExpoEventService,
    private globalFormBuilder: GlobalFormBuilder,
    private notificationService: NotificationService,
    private dialog: MatDialog,
    private fb: FormBuilder,
    private commonService: CommonService
  ) {
    this.consumableForm = this.globalFormBuilder.consumableForm();
    
    // Initialize autocomplete observables
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
    
    this.filteredProductsForFilter = this.productFilterInputControl.valueChanges.pipe(
      startWith(''),
      map(value => this._filterProducts(value || ''))
    );
    
    this.filteredEvents = this.eventInputControl.valueChanges.pipe(
      startWith(''),
      map(value => this._filterEvents(value || ''))
    );
    
    this.filteredEventsForFilter = this.eventFilterInputControl.valueChanges.pipe(
      startWith(''),
      map(value => this._filterEvents(value || ''))
    );
  }

  ngOnInit(): void {
    this.breadCrumbItems = [{ label: 'Tables' }, { label: 'Consumable Management', active: true }];
    this.consumableForm = this.globalFormBuilder.consumableForm();
    this.loadConsumables();
    this.loadProviders();
    this.loadProducts();
    this.loadEvents();
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
   * Load consumables from API
   */
  loadConsumables(): void {
    this.isLoading = true;
    
    const queryParams: any = {
      page: this.filters.page || 1,
      limit: this.filters.limit || 10
    };
    
    if (this.filters.name) {
      queryParams.name = this.filters.name;
    }
    if (this.filters.category) {
      queryParams.category = this.filters.category;
    }
    if (this.filters.providerId) {
      queryParams.providerId = this.filters.providerId;
    }
    if (this.filters.productId) {
      queryParams.productId = this.filters.productId;
    }
    if (this.filters.eventId) {
      queryParams.eventId = this.filters.eventId;
    }
    if (this.filters.purchasedAt) {
      queryParams.purchasedAt = this.filters.purchasedAt;
    }
    if (this.filters.notes) {
      queryParams.notes = this.filters.notes;
    }
    
    this.consumableService.consumableControllerGetAllConsumablesV1$Response(queryParams).subscribe({
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
        console.error('Error loading consumables:', error);
        this.notificationService.error('Failed to load consumables. Please try again.');
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
   * Load events for autocomplete
   */
  loadEvents(): void {
    this.expoEventService.expoEventControllerGetAllExpoEventsV1$Response({ page: 1, limit: 1000 } as any).subscribe({
      next: (response) => {
        const responseBody = response.body as any;
        this.eventOptions = responseBody?.items || responseBody || [];
      },
      error: (error) => {
        console.error('Error loading events:', error);
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
   * Filter events
   */
  private _filterEvents(value: string | GetExpoEventResponse): GetExpoEventResponse[] {
    if (!value || typeof value !== 'string') {
      return this.eventOptions;
    }
    const filterValue = value.toLowerCase();
    return this.eventOptions.filter(event => 
      event.name?.toLowerCase().includes(filterValue)
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
   * Display event in autocomplete
   */
  displayEvent(event: GetExpoEventResponse | null): string {
    return event?.name || '';
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
   * Setup search debouncing
   */
  setupSearchDebouncing(): void {
    this.nameSearchControl.valueChanges
      .pipe(
        debounceTime(500),
        distinctUntilChanged()
      )
      .subscribe(value => {
        this.filters.name = value || undefined;
        this.filters.page = 1;
        this.loadConsumables();
      });
  }

  /**
   * Handle page change
   */
  onPageChange(event: PageEvent): void {
    this.filters.page = event.pageIndex + 1;
    this.filters.limit = event.pageSize;
    this.currentPage = event.pageIndex + 1;
    this.pageSize = event.pageSize;
    this.loadConsumables();
  }

  /**
   * Handle sort change
   */
  onSortChange(sort: Sort): void {
    if (sort.active && sort.direction) {
      this.filters.page = 1;
      this.loadConsumables();
    }
  }

  /**
   * Apply filters
   */
  applyFilters(): void {
    this.filters.name = this.nameSearchControl.value || undefined;
    this.filters.category = this.categoryFilterControl.value || undefined;
    if (this.providerFilterInputControl.value && typeof this.providerFilterInputControl.value === 'object') {
      this.filters.providerId = (this.providerFilterInputControl.value as GetProviderResponse).id;
    }
    if (this.productFilterInputControl.value && typeof this.productFilterInputControl.value === 'object') {
      this.filters.productId = (this.productFilterInputControl.value as ProductResponse).id;
    }
    if (this.eventFilterInputControl.value && typeof this.eventFilterInputControl.value === 'object') {
      this.filters.eventId = (this.eventFilterInputControl.value as GetExpoEventResponse).id;
    }
    this.filters.page = 1;
    this.loadConsumables();
  }

  /**
   * Clear filters
   */
  clearFilters(): void {
    this.nameSearchControl.setValue('');
    this.categoryFilterControl.setValue(null);
    this.providerFilterInputControl.setValue(null);
    this.productFilterInputControl.setValue(null);
    this.eventFilterInputControl.setValue(null);
    
    this.filters = {
      page: 1,
      limit: this.pageSize
    };
    
    this.loadConsumables();
  }

  /**
   * Get consumable category label
   */
  getConsumableCategoryLabel(category: string): string {
    const found = this.consumableCategories.find(c => c.value === category);
    return found?.label || category;
  }

  /**
   * Get consumable image URL
   */
  getConsumableImageUrl(consumable: GetConsumableResponse): string | null {
    if (consumable.images && consumable.images.length > 0) {
      return consumable.images[0].fileUrl || null;
    }
    return null;
  }

  /**
   * Handle image error
   */
  onImageError(event: any): void {
    event.target.src = 'assets/images/no-image.png';
  }

  /**
   * Create new consumable
   */
  onCreateConsumable(): void {
    this.isEditMode = false;
    this.selectedConsumable = null;
    this.consumableForm.reset();
    this.consumableForm = this.globalFormBuilder.consumableForm();
    this.selectedImageFile = null;
    this.imagePreview = null;
    
    if (this.modalTemplate) {
      this.currentDialogRef = this.dialog.open(this.modalTemplate, {
        width: '800px',
        maxWidth: '90vw',
        disableClose: true
      });
    }
  }

  /**
   * Edit consumable
   */
  onEditConsumable(consumable: GetConsumableResponse): void {
    this.isEditMode = true;
    this.selectedConsumable = consumable;
    this.populateEditForm(consumable);
    
    if (this.modalTemplate) {
      this.currentDialogRef = this.dialog.open(this.modalTemplate, {
        width: '800px',
        maxWidth: '90vw',
        disableClose: true
      });
    }
  }

  /**
   * Delete consumable
   */
  onDeleteConsumable(consumable: GetConsumableResponse): void {
    Swal.fire({
      title: 'Are you sure?',
      text: `Do you want to delete "${consumable.name}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Yes, delete it!'
    }).then((result) => {
      if (result.isConfirmed) {
        this.consumableService.consumableControllerRemoveV1$Response({ id: consumable.id } as any).subscribe({
          next: () => {
            this.notificationService.success('Consumable deleted successfully');
            this.loadConsumables();
          },
          error: (error) => {
            console.error('Error deleting consumable:', error);
            this.notificationService.error('Failed to delete consumable. Please try again.');
          }
        });
      }
    });
  }

  /**
   * View consumable details
   */
  onViewConsumable(consumable: GetConsumableResponse): void {
    const c = consumable as any;
    // Get consumable image URL
    const imageUrl = this.getConsumableImageUrl(consumable);

    // Build HTML content with image
    let htmlContent = `
      <div class="text-start" style="max-width: 100%;">
        <!-- Consumable Image Section -->
        <div style="text-align: center; margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
    `;
    
    if (imageUrl) {
      htmlContent += `
          <img src="${imageUrl}" 
               alt="${c.name || 'Consumable'}" 
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
    
    const productDisplay = c.product ? this.displayProduct(c.product) : (c.productId ? 'Product ID: ' + c.productId : 'N/A');
    const eventDisplay = c.event ? this.displayEvent(c.event) : (c.eventId ? 'Event ID: ' + c.eventId : 'N/A');
    
    htmlContent += `
        </div>
        
        <!-- Consumable Details -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
          <div>
            <p style="margin: 8px 0;"><strong>Name:</strong><br><span style="color: #556ee6;">${c.name || 'N/A'}</span></p>
            <p style="margin: 8px 0;"><strong>Category:</strong><br>${this.getConsumableCategoryLabel(c.category || '')}</p>
            <p style="margin: 8px 0;"><strong>Unit:</strong><br>${c.unit || 'N/A'}</p>
            <p style="margin: 8px 0;"><strong>Quantity:</strong><br>${c.quantity || 'N/A'}</p>
            <p style="margin: 8px 0;"><strong>Unit Cost:</strong><br>${c.unitCost ? '$' + c.unitCost : 'N/A'}</p>
          </div>
          <div>
            <p style="margin: 8px 0;"><strong>Purchased At:</strong><br>${c.purchasedAt ? new Date(c.purchasedAt).toLocaleDateString() : 'N/A'}</p>
            <p style="margin: 8px 0;"><strong>Provider ID:</strong><br>${c.providerId || 'N/A'}</p>
            <p style="margin: 8px 0;"><strong>Product:</strong><br>${productDisplay}</p>
            <p style="margin: 8px 0;"><strong>Event:</strong><br>${eventDisplay}</p>
          </div>
        </div>
        
        <!-- Notes -->
        <div style="margin-bottom: 20px;">
          <p style="margin: 8px 0;"><strong>Notes:</strong></p>
          <p style="margin: 8px 0; padding: 10px; background: #f8f9fa; border-radius: 4px; color: #666;">${c.notes || 'N/A'}</p>
        </div>
        
        <!-- Consumable ID -->
        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #eee; text-align: center;">
          <p style="margin: 0; font-size: 12px; color: #999;">Consumable ID: ${consumable.id}</p>
        </div>
      </div>
    `;

    Swal.fire({
      title: `<strong>${c.name || 'Consumable'}</strong>`,
      html: htmlContent,
      icon: 'info',
      confirmButtonColor: '#556ee6',
      confirmButtonText: 'Close',
      width: '700px',
      customClass: {
        popup: 'consumable-details-popup'
      }
    });
  }

  /**
   * Populate edit form
   */
  populateEditForm(consumable: GetConsumableResponse): void {
    this.consumableForm.patchValue({
      name: consumable.name,
      category: consumable.category,
      unit: consumable.unit,
      quantity: consumable.quantity,
      unitCost: consumable.unitCost,
      purchasedAt: consumable.purchasedAt ? new Date(consumable.purchasedAt).toISOString().split('T')[0] : '',
      providerId: consumable.providerId,
      productId: consumable.productId,
      eventId: consumable.eventId || null,
      notes: consumable.notes || ''
    });

    // Set provider, product, event in form controls
    const provider = this.providerOptions.find(p => p.id === consumable.providerId);
    if (provider) {
      this.providerInputControl.setValue(provider);
    }
    
    const product = this.productOptions.find(p => p.id === consumable.productId);
    if (product) {
      this.productInputControl.setValue(product);
    }
    
    if (consumable.eventId) {
      const event = this.eventOptions.find(e => e.id === consumable.eventId);
      if (event) {
        this.eventInputControl.setValue(event);
      }
    }

    // Set image preview
    const imageUrl = this.getConsumableImageUrl(consumable);
    if (imageUrl) {
      this.imagePreview = imageUrl;
    }
  }

  /**
   * Handle image file selection
   */
  onImageFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.selectedImageFile = file;
      this.imagePreview = null;
      
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.imagePreview = e.target.result;
      };
      reader.readAsDataURL(file);
      
      this.consumableForm.patchValue({ imageFile: file });
    }
  }

  /**
   * Remove image file
   */
  removeImageFile(): void {
    this.selectedImageFile = null;
    this.imagePreview = null;
    this.consumableForm.patchValue({ imageFile: null });
  }

  /**
   * Handle provider selection in form
   */
  onProviderSelected(event: any): void {
    const provider = event.option.value as GetProviderResponse;
    this.consumableForm.patchValue({ providerId: provider.id });
    this.providerInputControl.setValue(provider);
  }

  /**
   * Handle product selection in form
   */
  onProductSelected(event: any): void {
    const product = event.option.value as ProductResponse;
    this.consumableForm.patchValue({ productId: product.id });
    this.productInputControl.setValue(product);
  }

  /**
   * Handle event selection in form
   */
  onEventSelected(event: any): void {
    const expoEvent = event.option.value as GetExpoEventResponse | null;
    if (expoEvent) {
      this.consumableForm.patchValue({ eventId: expoEvent.id });
      this.eventInputControl.setValue(expoEvent);
    } else {
      this.consumableForm.patchValue({ eventId: null });
      this.eventInputControl.setValue(null);
    }
  }

  /**
   * Handle filter provider selection
   */
  onFilterProviderSelected(event: any): void {
    const provider = event.option.value as GetProviderResponse;
    this.providerFilterInputControl.setValue(provider);
  }

  /**
   * Handle filter product selection
   */
  onFilterProductSelected(event: any): void {
    const product = event.option.value as ProductResponse;
    this.productFilterInputControl.setValue(product);
  }

  /**
   * Handle filter event selection
   */
  onFilterEventSelected(event: any): void {
    const expoEvent = event.option.value as GetExpoEventResponse | null;
    this.eventFilterInputControl.setValue(expoEvent);
  }

  /**
   * Submit form
   */
  onSubmitForm(): void {
    if (this.consumableForm.invalid) {
      this.consumableForm.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    const formValue = this.consumableForm.getRawValue();

    if (this.isEditMode && this.selectedConsumable) {
      // Update consumable
      const formData = new FormData();
      formData.append('name', formValue.name);
      formData.append('category', formValue.category);
      formData.append('unit', formValue.unit);
      formData.append('quantity', formValue.quantity.toString());
      formData.append('unitCost', formValue.unitCost.toString());
      formData.append('purchasedAt', formValue.purchasedAt);
      formData.append('providerId', formValue.providerId.toString());
      formData.append('productId', formValue.productId.toString());
      if (formValue.eventId) {
        formData.append('eventId', formValue.eventId.toString());
      }
      if (formValue.notes) {
        formData.append('notes', formValue.notes);
      }
      if (this.selectedImageFile) {
        formData.append('imageFile', this.selectedImageFile);
      }

      this.consumableService.consumableControllerUpdateV1$Response({
        id: this.selectedConsumable.id,
        body: formData
      } as any).subscribe({
        next: () => {
          this.notificationService.success('Consumable updated successfully');
          this.isSubmitting = false;
          if (this.currentDialogRef) {
            this.currentDialogRef.close();
          }
          this.loadConsumables();
        },
        error: (error) => {
          console.error('Error updating consumable:', error);
          this.notificationService.error('Failed to update consumable. Please try again.');
          this.isSubmitting = false;
        }
      });
    } else {
      // Create consumable
      const formData = new FormData();
      formData.append('name', formValue.name);
      formData.append('category', formValue.category);
      formData.append('unit', formValue.unit);
      formData.append('quantity', formValue.quantity.toString());
      formData.append('unitCost', formValue.unitCost.toString());
      formData.append('purchasedAt', formValue.purchasedAt);
      formData.append('providerId', formValue.providerId.toString());
      formData.append('productId', formValue.productId.toString());
      if (formValue.eventId) {
        formData.append('eventId', formValue.eventId.toString());
      }
      if (formValue.notes) {
        formData.append('notes', formValue.notes);
      }
      if (this.selectedImageFile) {
        formData.append('imageFile', this.selectedImageFile);
      }

      this.consumableService.consumableControllerCreateV1$Response({
        body: formData
      } as any).subscribe({
        next: () => {
          this.notificationService.success('Consumable created successfully');
          this.isSubmitting = false;
          if (this.currentDialogRef) {
            this.currentDialogRef.close();
          }
          this.loadConsumables();
        },
        error: (error) => {
          console.error('Error creating consumable:', error);
          this.notificationService.error('Failed to create consumable. Please try again.');
          this.isSubmitting = false;
        }
      });
    }
  }

  /**
   * Get modal title
   */
  getModalTitle(): string {
    return this.isEditMode ? 'Edit Consumable' : 'Create Consumable';
  }

  /**
   * Get submit button text
   */
  getSubmitButtonText(): string {
    return this.isEditMode ? 'Update' : 'Create';
  }

  /**
   * Get items to display in view modal
   */
  getItemsToDisplay(consumable: GetConsumableResponse): Array<{ label: string; value: any }> {
    return [
      { label: 'Name', value: consumable.name },
      { label: 'Category', value: this.getConsumableCategoryLabel(consumable.category) },
      { label: 'Unit', value: consumable.unit },
      { label: 'Quantity', value: consumable.quantity },
      { label: 'Unit Cost', value: consumable.unitCost ? `$${consumable.unitCost}` : 'N/A' },
      { label: 'Purchased At', value: consumable.purchasedAt ? new Date(consumable.purchasedAt).toLocaleDateString() : 'N/A' },
      { label: 'Provider ID', value: consumable.providerId },
      { label: 'Product', value: consumable.product ? `${consumable.product.ref || ''} - ${consumable.product.name || ''}`.trim() : 'N/A' },
      { label: 'Event', value: consumable.event?.name || 'N/A' },
      { label: 'Notes', value: consumable.notes || 'N/A' }
    ];
  }

  /**
   * Close modal
   */
  closeModal(): void {
    if (this.currentDialogRef) {
      this.currentDialogRef.close();
    }
  }
}