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
import { LocationResponse, Podium } from 'src/app/opmobilitybackend/models';
import { PodiumService, LocationService } from 'src/app/opmobilitybackend/services';

// Podium filters interface
export interface PodiumFilters {
  page?: number;
  limit?: number;
  ref?: string;
  name?: string;
  lengthMm?: number;
  widthMm?: number;
  heightMm?: number;
  state?: string;
  locationId?: number;
  observations?: string;
}

// Podium state options
export const PODIUM_STATES = [
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'IN_USE', label: 'In Use' },
  { value: 'UNDER_REPAIR', label: 'Under Repair' }
];

@Component({
  selector: 'app-podium',
  templateUrl: './podium.component.html',
  styleUrls: ['./podium.component.scss']
})
export class PodiumComponent implements OnInit, AfterViewInit {
  breadCrumbItems: Array<{}>;
  
  // Table properties
  displayedColumns: string[] = ['image', 'ref', 'name', 'location', 'state', 'dimensions', 'actions'];
  dataSource: MatTableDataSource<any> = new MatTableDataSource<any>([]);
 
  // Pagination properties
  totalItems = 0;
  currentPage = 1;
  pageSize = 10;
  pageSizeOptions = [5, 10, 25, 50];
  
  // Loading state
  isLoading = false;
  
  // Filters
  filters: PodiumFilters = {
    page: 1,
    limit: 10
  };
  
  // Search controls
  refSearchControl = new FormControl('');
  nameSearchControl = new FormControl('');
  stateFilterControl = new FormControl<string | null>(null);
  locationFilterInputControl = new FormControl<string | LocationResponse | null>(null);
  
  // Options for dropdowns/autocomplete
  podiumStates = PODIUM_STATES;
  locationOptions: LocationResponse[] = [];
  
  // Autocomplete observables
  filteredLocations: Observable<LocationResponse[]>;
  filteredLocationsForFilter: Observable<LocationResponse[]>;
  
  // Form controls for autocomplete
  locationInputControl = new FormControl<string | LocationResponse>('');
  
  private autocompletePanelOpen = false;
  private filterAutocompletePanelOpen = false;

  // Computed properties for summary cards
  get totalPages(): number {
    return Math.ceil(this.totalItems / this.pageSize) || 1;
  }

  // Modal properties
  podiumForm: FormGroup;
  selectedPodium: any | null = null;
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
    private podiumService: PodiumService,
    private locationService: LocationService,
    private globalFormBuilder: GlobalFormBuilder,
    private notificationService: NotificationService,
    private dialog: MatDialog,
    private fb: FormBuilder,
    private commonService: CommonService
  ) {
    this.podiumForm = this.globalFormBuilder.podiumForm();
    
    // Initialize autocomplete observables
    this.filteredLocations = this.locationInputControl.valueChanges.pipe(
      startWith(''),
      map(value => this._filterLocations(value || ''))
    );
    
    this.filteredLocationsForFilter = this.locationFilterInputControl.valueChanges.pipe(
      startWith(''),
      map(value => this._filterLocations(value || ''))
    );
  }

  ngOnInit(): void {
    this.breadCrumbItems = [{ label: 'Tables' }, { label: 'Podium Management', active: true }];
    this.podiumForm = this.globalFormBuilder.podiumForm();
    this.loadPodiums();
    this.loadLocations();
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
   * Load podiums from API
   */
  loadPodiums(): void {
    this.isLoading = true;
    
    const queryParams: any = {
      page: this.filters.page || 1,
      limit: this.filters.limit || 10
    };
    
    if (this.filters.ref) {
      queryParams.ref = this.filters.ref;
    }
    if (this.filters.name) {
      queryParams.name = this.filters.name;
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
    if (this.filters.state) {
      queryParams.state = this.filters.state;
    }
    if (this.filters.locationId) {
      queryParams.locationId = this.filters.locationId;
    }
    if (this.filters.observations) {
      queryParams.observations = this.filters.observations;
    }
    
    this.podiumService.podiumControllerGetAllPodiumsV1$Response(queryParams as any).subscribe({
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
        console.error('Error loading podiums:', error);
        this.notificationService.error('Failed to load podiums. Please try again.');
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
    this.podiumForm.patchValue({ locationId: location.id });
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
        this.podiumForm.patchValue({ locationId: null });
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
      this.podiumForm.patchValue({ imageFile: file });
      
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
    this.podiumForm.patchValue({ imageFile: null });
  }

  /**
   * Handle pagination changes
   */
  onPageChange(event: PageEvent): void {
    this.filters.page = event.pageIndex + 1;
    this.filters.limit = event.pageSize;
    this.currentPage = event.pageIndex + 1;
    this.pageSize = event.pageSize;
    this.loadPodiums();
  }

  /**
   * Handle sorting changes
   */
  onSortChange(event: Sort): void {
    if (event.direction) {
      this.loadPodiums();
    }
  }

  /**
   * Apply filters
   */
  applyFilters(): void {
    this.filters.ref = this.refSearchControl.value || undefined;
    this.filters.name = this.nameSearchControl.value || undefined;
    this.filters.state = this.stateFilterControl.value || undefined;
    if (this.locationFilterInputControl.value && typeof this.locationFilterInputControl.value === 'object') {
      this.filters.locationId = (this.locationFilterInputControl.value as LocationResponse).id;
    }
    this.filters.page = 1;
    this.loadPodiums();
  }

  /**
   * Clear all filters
   */
  clearFilters(): void {
    this.refSearchControl.setValue('');
    this.nameSearchControl.setValue('');
    this.stateFilterControl.setValue(null);
    this.locationFilterInputControl.setValue(null);
    
    this.filters = {
      page: 1,
      limit: this.pageSize
    };
    
    this.loadPodiums();
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
      this.loadPodiums();
    });
  }

  /**
   * Get podium state label
   */
  getPodiumStateLabel(state: string): string {
    const stateOption = this.podiumStates.find(s => s.value === state);
    return stateOption ? stateOption.label : state;
  }

  /**
   * Get podium state badge class
   */
  getPodiumStateBadgeClass(state: string): string {
    const stateClasses: { [key: string]: string } = {
      'AVAILABLE': 'bg-success',
      'IN_USE': 'bg-info',
      'UNDER_REPAIR': 'bg-warning'
    };
    return stateClasses[state] || 'bg-secondary';
  }

  /**
   * Get podium image URL from images array
   */
  getPodiumImageUrl(podium: any): string | null {
    if (!podium.images || podium.images.length === 0) {
      return null;
    }
    
    // First, try to find by fileType/mimeType if available
    const imageFile = podium.images.find((file: any) => {
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
    // Podiums only have images (PODIUM_IMAGE purpose), so we can safely return the first one
    const firstImage = podium.images[0];
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
   * Create new podium
   */
  onCreatePodium(): void {
    this.isEditMode = false;
    this.selectedPodium = null;
    this.commonService.resetForm(this.podiumForm);
    this.removeImageFile();
    
    this.currentDialogRef = this.dialog.open(this.modalTemplate, {
      width: '900px',
      maxWidth: '95vw',
      disableClose: true,
      panelClass: 'custom-dialog-container'
    });

    this.currentDialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.loadPodiums();
      }
    });
  }

  /**
   * Edit podium
   */
  onEditPodium(podium: any): void {
    this.isEditMode = true;
    this.selectedPodium = podium;
    this.commonService.resetForm(this.podiumForm);
    this.populateEditForm(podium);
    
    this.currentDialogRef = this.dialog.open(this.modalTemplate, {
      width: '900px',
      maxWidth: '95vw',
      disableClose: true,
      panelClass: 'custom-dialog-container'
    });

    this.currentDialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.loadPodiums();
      }
    });
  }

  /**
   * Populate the form with podium data
   */
  private populateEditForm(podium: any): void {
    this.podiumForm.patchValue({
      ref: podium.ref || '',
      name: podium.name || '',
      lengthMm: podium.lengthMm || null,
      widthMm: podium.widthMm || null,
      heightMm: podium.heightMm || null,
      observations: podium.observations || '',
      locationId: podium.locationId || podium.location?.id || null
    });
    
    // Set location - find matching location from options or use location object if available
    if (podium.location) {
      this.locationInputControl.setValue(podium.location);
    } else if (podium.locationId) {
      const matchingLocation = this.locationOptions.find(loc => loc.id === podium.locationId);
      if (matchingLocation) {
        this.locationInputControl.setValue(matchingLocation);
      }
    }
    
    // Set image preview if available - use getPodiumImageUrl logic
    const imageUrl = this.getPodiumImageUrl(podium);
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
    if (this.podiumForm.invalid) {
      return;
    }

    this.isSubmitting = true;
    this.commonService.disableForm(this.podiumForm);
    
    if (this.isEditMode && this.selectedPodium) {
      // Update existing podium - use FormData for multipart/form-data
      const formDataToSend = new FormData();
      formDataToSend.append('ref', this.podiumForm.value.ref);
      formDataToSend.append('name', this.podiumForm.value.name);
      formDataToSend.append('locationId', this.podiumForm.value.locationId.toString());
      formDataToSend.append('lengthMm', this.podiumForm.value.lengthMm.toString());
      formDataToSend.append('widthMm', this.podiumForm.value.widthMm.toString());
      formDataToSend.append('heightMm', this.podiumForm.value.heightMm.toString());
      formDataToSend.append('observations', this.podiumForm.value.observations);
      
      // Append image file if a new one is selected
      if (this.selectedImageFile) {
        formDataToSend.append('imageFile', this.selectedImageFile);
      }
      
      this.podiumService.podiumControllerUpdateV1({
        id: this.selectedPodium.id,
        body: formDataToSend as any
      }).subscribe({
        next: (response) => {
          this.notificationService.success('Podium updated successfully!');
          this.isSubmitting = false;
          this.commonService.enableForm(this.podiumForm);
          
          if (this.currentDialogRef) {
            this.currentDialogRef.close(true);
          }
        },
        error: (error) => {
          console.error('Error updating podium:', error);
          this.notificationService.error('Failed to update podium. Please try again.');
          this.isSubmitting = false;
          this.commonService.enableForm(this.podiumForm);
        }
      });
    } else {
      // Create new podium - use FormData for multipart/form-data
      const formDataToSend = new FormData();
      formDataToSend.append('ref', this.podiumForm.value.ref);
      formDataToSend.append('name', this.podiumForm.value.name);
      formDataToSend.append('locationId', this.podiumForm.value.locationId.toString());
      formDataToSend.append('lengthMm', this.podiumForm.value.lengthMm.toString());
      formDataToSend.append('widthMm', this.podiumForm.value.widthMm.toString());
      formDataToSend.append('heightMm', this.podiumForm.value.heightMm.toString());
      formDataToSend.append('observations', this.podiumForm.value.observations);
      
      if (this.selectedImageFile) {
        formDataToSend.append('imageFile', this.selectedImageFile);
      }
      
      this.podiumService.podiumControllerCreateV1({
        body: formDataToSend as any
      }).subscribe({
        next: (response) => {
          this.notificationService.success('Podium created successfully!');
          this.isSubmitting = false;
          this.commonService.enableForm(this.podiumForm);
          
          if (this.currentDialogRef) {
            this.currentDialogRef.close(true);
          }
        },
        error: (error) => {
          console.error('Error creating podium:', error);
          this.notificationService.error('Failed to create podium. Please try again.');
          this.isSubmitting = false;
          this.commonService.enableForm(this.podiumForm);
        }
      });
    }
  }

  /**
   * View podium details
   */
  onViewPodium(podium: any): void {
    // Get podium image URL
    const imageUrl = this.getPodiumImageUrl(podium);

    // Build HTML content with image
    let htmlContent = `
      <div class="text-start" style="max-width: 100%;">
        <!-- Podium Image Section -->
        <div style="text-align: center; margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
    `;
    
    if (imageUrl) {
      htmlContent += `
          <img src="${imageUrl}" 
               alt="${podium.name || podium.ref || 'Podium'}" 
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
    
    const locationDisplay = podium.location ? this.displayLocation(podium.location) : (podium.locationId ? 'Location ID: ' + podium.locationId : 'N/A');
    const dimensions = podium.lengthMm && podium.widthMm && podium.heightMm 
      ? `${podium.lengthMm}mm × ${podium.widthMm}mm × ${podium.heightMm}mm` 
      : 'N/A';
    
    htmlContent += `
        </div>
        
        <!-- Podium Details -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
          <div>
            <p style="margin: 8px 0;"><strong>Reference:</strong><br><span style="color: #556ee6;">${podium.ref || 'N/A'}</span></p>
            <p style="margin: 8px 0;"><strong>Name:</strong><br>${podium.name || 'N/A'}</p>
            <p style="margin: 8px 0;"><strong>Location:</strong><br>${locationDisplay}</p>
          </div>
          <div>
            <p style="margin: 8px 0;"><strong>State:</strong><br><span class="badge bg-success">${this.getPodiumStateLabel(podium.state || 'AVAILABLE')}</span></p>
            <p style="margin: 8px 0;"><strong>Dimensions:</strong><br>${dimensions}</p>
          </div>
        </div>
        
        <!-- Observations -->
        <div style="margin-bottom: 20px;">
          <p style="margin: 8px 0;"><strong>Observations:</strong></p>
          <p style="margin: 8px 0; padding: 10px; background: #f8f9fa; border-radius: 4px; color: #666;">${podium.observations || 'N/A'}</p>
        </div>
        
        <!-- Podium ID -->
        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #eee; text-align: center;">
          <p style="margin: 0; font-size: 12px; color: #999;">Podium ID: ${podium.id}</p>
        </div>
      </div>
    `;

    Swal.fire({
      title: `<strong>${podium.name || podium.ref || 'Podium'}</strong>`,
      html: htmlContent,
      icon: 'info',
      confirmButtonColor: '#556ee6',
      confirmButtonText: 'Close',
      width: '700px',
      customClass: {
        popup: 'podium-details-popup'
      }
    });
  }

  /**
   * Delete podium
   */
  onDeletePodium(podium: any): void {
    const nameOrRef = podium.name || podium.ref || 'Podium';
    Swal.fire({
      title: 'Are you sure?',
      text: `Do you want to delete "${nameOrRef}" (${podium.ref || podium.id})?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Yes, delete it!',
      cancelButtonText: 'Cancel'
    }).then((result) => {
      if (result.isConfirmed) {
        this.podiumService.podiumControllerRemoveV1({
          id: podium.id
        }).subscribe({
          next: () => {
            this.notificationService.success('Podium deleted successfully!');
            this.loadPodiums();
          },
          error: (error) => {
            console.error('Error deleting podium:', error);
            this.notificationService.error('Failed to delete podium. Please try again.');
          }
        });
      }
    });
  }

  /**
   * Get modal title
   */
  getModalTitle(): string {
    return this.isEditMode ? 'Edit Podium' : 'Create New Podium';
  }

  /**
   * Get submit button text
   */
  getSubmitButtonText(): string {
    return this.isEditMode ? 'Update Podium' : 'Create Podium';
  }

  /**
   * Get items to display for pagination info
   */
  getItemsToDisplay(): number {
    return Math.min(this.currentPage * this.pageSize, this.totalItems);
  }
}
