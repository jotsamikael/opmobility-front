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
import { GetWarehouseResponse } from 'src/app/opmobilitybackend/models';
import { LocationService, WarehouseService } from 'src/app/opmobilitybackend/services';

// Location filters interface
export interface LocationFilters {
  page?: number;
  limit?: number;
  warehouseId?: number;
  aisle?: string;
  levelNo?: number;
  positionLabel?: string;
  notes?: string;
}

@Component({
  selector: 'app-location',
  templateUrl: './location.component.html',
  styleUrls: ['./location.component.scss']
})
export class LocationComponent implements OnInit, AfterViewInit {
  breadCrumbItems: Array<{}>;
  
  // Table properties
  displayedColumns: string[] = ['aisle', 'levelNo', 'positionLabel', 'warehouse', 'notes', 'actions'];
  dataSource: MatTableDataSource<any> = new MatTableDataSource<any>([]);
 
  // Pagination properties
  totalItems = 0;
  currentPage = 1;
  pageSize = 10;
  pageSizeOptions = [5, 10, 25, 50];
  
  // Loading state
  isLoading = false;
  
  // Filters
  filters: LocationFilters = {
    page: 1,
    limit: 10
  };
  
  // Search controls
  aisleSearchControl = new FormControl('');
  positionLabelSearchControl = new FormControl('');
  levelNoSearchControl = new FormControl<number | null>(null);
  warehouseFilter = new FormControl<string | GetWarehouseResponse | null>(null);
  
  // Warehouse options for autocomplete
  warehouseOptions: GetWarehouseResponse[] = [];
  filteredWarehouses: Observable<GetWarehouseResponse[]>; // For modal form
  filteredWarehousesForFilter: Observable<GetWarehouseResponse[]>; // For filter section
  warehouseInputControl = new FormControl<string | GetWarehouseResponse>(''); // For modal form
  warehouseFilterInputControl = new FormControl<string | GetWarehouseResponse | null>(null); // For filter section
  private autocompletePanelOpen = false; // Flag to track if autocomplete panel is open (modal)
  private filterAutocompletePanelOpen = false; // Flag to track if autocomplete panel is open (filter)

  // Computed properties for summary cards
  get totalPages(): number {
    return Math.ceil(this.totalItems / this.pageSize) || 1;
  }

  // Modal properties
  locationForm: FormGroup;
  selectedLocation: any | null = null;
  isSubmitting = false;
  isEditMode = false;

  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;
  @ViewChild('modalTemplate') modalTemplate: TemplateRef<any>;

  private currentDialogRef: MatDialogRef<any> | null = null;

  constructor(
    private locationService: LocationService,
    private warehouseService: WarehouseService,
    private globalFormBuilder: GlobalFormBuilder,
    private notificationService: NotificationService,
    private dialog: MatDialog,
    private fb: FormBuilder,
    private commonService: CommonService
  ) {
    this.locationForm = this.globalFormBuilder.locationForm();
  }

  ngOnInit(): void {
    this.breadCrumbItems = [{ label: 'Tables' }, { label: 'Location Management', active: true }];
    this.locationForm = this.globalFormBuilder.locationForm();
    this.loadLocations();
    this.loadWarehouses();
    this.setupSearchDebouncing();
    this.setupWarehouseAutocomplete();
    this.setupFilterWarehouseAutocomplete();
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
   * Load locations from API
   */
  loadLocations(): void {
    this.isLoading = true;
    
    const queryParams: any = {
      page: this.filters.page || 1,
      limit: this.filters.limit || 10
    };
    
    if (this.filters.warehouseId) {
      queryParams.warehouseId = Number(this.filters.warehouseId);
    }
    
    if (this.filters.aisle) {
      queryParams.aisle = this.filters.aisle;
    }
    
    if (this.filters.levelNo) {
      queryParams.levelNo = Number(this.filters.levelNo);
    }
    
    if (this.filters.positionLabel) {
      queryParams.positionLabel = this.filters.positionLabel;
    }
    
    if (this.filters.notes) {
      queryParams.notes = this.filters.notes;
    }
    
    this.locationService.locationControllerGetAllLocationsV1(queryParams).subscribe({
      next: (response: any) => {
        console.log('Location data:', response);
        
        // Handle the actual response structure: {items: Array, meta: Object} or direct array
        if (response && response.items) {
          this.dataSource.data = response.items;
          this.totalItems = response.meta?.totalItems || 0;
          this.currentPage = response.meta?.currentPage || 1;
          this.pageSize = response.meta?.itemsPerPage || 10;
        } else if (Array.isArray(response)) {
          // Fallback: if response is directly an array
          this.dataSource.data = response;
          this.totalItems = response.length;
        } else {
          this.dataSource.data = [];
          this.totalItems = 0;
        }
        
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading locations:', error);
        this.notificationService.error('Failed to load locations data. Please try again.');
        this.isLoading = false;
      }
    });
  }

  /**
   * Load warehouses data from API
   */
  loadWarehouses(): void {
    const requestParams = {
      page: 1,
      limit: 1000 as number
    };
    
    // Use $Response to get the full response
    this.warehouseService.warehouseControllerFindAllV1$Response(requestParams).subscribe({
      next: (response: any) => {
        console.log("warehouses", response.body);
        // Handle response structure - check both body and direct response
        const data = response.body || response;
        if (data && data.items) {
          this.warehouseOptions = data.items;
        } else if (Array.isArray(data)) {
          this.warehouseOptions = data;
        } else if (data && typeof data === 'object') {
          // If it's a paginated response without items property, try to extract array
          const keys = Object.keys(data);
          const arrayKey = keys.find(key => Array.isArray(data[key]));
          if (arrayKey) {
            this.warehouseOptions = data[arrayKey];
          }
        } else {
          this.warehouseOptions = [];
        }
        // Re-setup autocomplete after warehouses are loaded
        this.setupWarehouseAutocomplete();
        this.setupFilterWarehouseAutocomplete();
      },
      error: (error) => {
        console.error('Error loading warehouses:', error);
        this.notificationService.error('Failed to load warehouses data.');
      }
    });
  }

  /**
   * Setup warehouse autocomplete filtering for modal form
   */
  setupWarehouseAutocomplete(): void {
    this.filteredWarehouses = this.warehouseInputControl.valueChanges.pipe(
      startWith(''),
      map(value => {
        const name = typeof value === 'string' ? value : value?.name || '';
        return name ? this._filterWarehouses(name) : this.warehouseOptions.slice();
      })
    );
  }

  /**
   * Setup warehouse autocomplete filtering for filter section
   */
  setupFilterWarehouseAutocomplete(): void {
    this.filteredWarehousesForFilter = this.warehouseFilterInputControl.valueChanges.pipe(
      startWith(''),
      map(value => {
        const name = typeof value === 'string' ? value : value?.name || '';
        return name ? this._filterWarehouses(name) : this.warehouseOptions.slice();
      })
    );
  }

  /**
   * Filter warehouses based on search term
   */
  private _filterWarehouses(name: string): GetWarehouseResponse[] {
    const filterValue = name.toLowerCase();
    return this.warehouseOptions.filter(warehouse => 
      warehouse.name.toLowerCase().includes(filterValue) ||
      (warehouse.address && warehouse.address.toLowerCase().includes(filterValue))
    );
  }

  /**
   * Display function for warehouse autocomplete
   */
  displayWarehouse(warehouse: GetWarehouseResponse | null): string {
    return warehouse ? warehouse.name : '';
  }

  /**
   * Handle autocomplete panel opened (modal)
   */
  onAutocompleteOpened(): void {
    this.autocompletePanelOpen = true;
  }

  /**
   * Handle autocomplete panel closed (modal)
   */
  onAutocompleteClosed(): void {
    // Delay to allow optionSelected to fire first
    setTimeout(() => {
      this.autocompletePanelOpen = false;
    }, 150);
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
    // Delay to allow optionSelected to fire first
    setTimeout(() => {
      this.filterAutocompletePanelOpen = false;
    }, 150);
  }

  /**
   * Handle warehouse selection from autocomplete (modal)
   */
  onWarehouseSelected(warehouse: GetWarehouseResponse): void {
    if (warehouse) {
      // Set the input control to the selected warehouse object
      this.warehouseInputControl.setValue(warehouse);
      this.locationForm.patchValue({
        warehouseId: warehouse.id
      });
    } else {
      this.warehouseInputControl.setValue('');
      this.locationForm.patchValue({
        warehouseId: null
      });
    }
  }

  /**
   * Handle warehouse selection from filter autocomplete
   */
  onFilterWarehouseSelected(warehouse: GetWarehouseResponse | null): void {
    if (warehouse && typeof warehouse === 'object' && 'id' in warehouse) {
      // Set the input control to the selected warehouse object
      this.warehouseFilterInputControl.setValue(warehouse);
      this.warehouseFilter.setValue(warehouse);
      this.filters.warehouseId = Number(warehouse.id); // Ensure it's a number
    } else {
      // "All Warehouses" selected or null
      this.warehouseFilterInputControl.setValue(null);
      this.warehouseFilter.setValue(null);
      this.filters.warehouseId = undefined;
    }
    // Trigger filter update
    this.filters.page = 1;
    this.loadLocations();
  }

  /**
   * Handle warehouse input blur - validate that a warehouse was selected (modal)
   */
  onWarehouseInputBlur(): void {
    // Don't interfere if autocomplete panel is still open (selection in progress)
    if (this.autocompletePanelOpen) {
      return;
    }
    
    // Wait a bit to ensure optionSelected has fired
    setTimeout(() => {
      const inputValue = this.warehouseInputControl.value;
      
      // If value is already a warehouse object, selection was successful - do nothing
      if (inputValue && typeof inputValue === 'object' && 'id' in inputValue && 'name' in inputValue) {
        return;
      }
      
      // If input is a string (user typed but didn't select), validate it
      if (typeof inputValue === 'string' && inputValue !== '') {
        // Check if there's an exact match
        const exactMatch = this.warehouseOptions.find(w => 
          w.name.toLowerCase() === inputValue.toLowerCase()
        );
        
        if (exactMatch) {
          // If exact match found, set it
          this.warehouseInputControl.setValue(exactMatch);
          this.locationForm.patchValue({ warehouseId: exactMatch.id });
        } else {
          // No match found, clear the input and warehouseId
          this.warehouseInputControl.setValue('');
          this.locationForm.patchValue({ warehouseId: null });
        }
      } else if (!inputValue) {
        // Input is empty, clear warehouseId
        this.locationForm.patchValue({ warehouseId: null });
      }
    }, 200);
  }

  /**
   * Handle filter warehouse input blur - validate that a warehouse was selected
   */
  onFilterWarehouseInputBlur(): void {
    // Don't interfere if autocomplete panel is still open (selection in progress)
    if (this.filterAutocompletePanelOpen) {
      return;
    }
    
    // Wait a bit to ensure optionSelected has fired
    setTimeout(() => {
      const inputValue = this.warehouseFilterInputControl.value;
      
      // If value is already a warehouse object, selection was successful - do nothing
      if (inputValue && typeof inputValue === 'object' && 'id' in inputValue && 'name' in inputValue) {
        return;
      }
      
      // If input is a string (user typed but didn't select), validate it
      if (typeof inputValue === 'string' && inputValue !== '') {
        // Check if there's an exact match
        const exactMatch = this.warehouseOptions.find(w => 
          w.name.toLowerCase() === inputValue.toLowerCase()
        );
        
        if (exactMatch) {
          // If exact match found, set it
          this.warehouseFilterInputControl.setValue(exactMatch);
          this.warehouseFilter.setValue(exactMatch);
          this.filters.warehouseId = Number(exactMatch.id); // Ensure it's a number
        } else {
          // No match found, clear the input and filter
          this.warehouseFilterInputControl.setValue(null);
          this.warehouseFilter.setValue(null);
          this.filters.warehouseId = undefined;
        }
      } else if (!inputValue) {
        // Input is empty, clear filter
        this.warehouseFilterInputControl.setValue(null);
        this.warehouseFilter.setValue(null);
        this.filters.warehouseId = undefined;
      }
    }, 200);
  }

  /**
   * Handle pagination changes
   */
  onPageChange(event: PageEvent): void {
    this.filters.page = event.pageIndex + 1;
    this.filters.limit = event.pageSize;
    this.currentPage = event.pageIndex + 1;
    this.pageSize = event.pageSize;
    this.loadLocations();
  }

  /**
   * Handle sorting changes
   */
  onSortChange(event: Sort): void {
    // Locations API supports sorting, but we can reload if needed
    if (event.direction) {
      this.loadLocations();
    }
  }

  /**
   * Apply filters
   */
  applyFilters(): void {
    this.filters.aisle = this.aisleSearchControl.value || undefined;
    this.filters.positionLabel = this.positionLabelSearchControl.value || undefined;
    this.filters.levelNo = this.levelNoSearchControl.value ? Number(this.levelNoSearchControl.value) : undefined;
    
    // Extract warehouseId from warehouseFilter (could be a GetWarehouseResponse object or number)
    const warehouseFilterValue = this.warehouseFilterInputControl.value;
    if (warehouseFilterValue && typeof warehouseFilterValue === 'object' && 'id' in warehouseFilterValue) {
      this.filters.warehouseId = Number(warehouseFilterValue.id); // Ensure it's a number
    } else {
      this.filters.warehouseId = undefined;
    }
    
    this.filters.page = 1; // Reset to first page
    this.loadLocations();
  }

  /**
   * Clear all filters
   */
  clearFilters(): void {
    this.aisleSearchControl.setValue('');
    this.positionLabelSearchControl.setValue('');
    this.levelNoSearchControl.setValue(null);
    this.warehouseFilterInputControl.setValue(null);
    this.warehouseFilter.setValue(null);
    
    this.filters = {
      page: 1,
      limit: this.pageSize
    };
    
    this.loadLocations();
  }

  /**
   * Set up search input debouncing
   */
  private setupSearchDebouncing(): void {
    // Aisle search debouncing
    this.aisleSearchControl.valueChanges.pipe(
      debounceTime(500),
      distinctUntilChanged()
    ).subscribe(value => {
      this.filters.aisle = value || undefined;
      this.filters.page = 1; // Reset to first page
      this.loadLocations();
    });
    
    // Position label search debouncing
    this.positionLabelSearchControl.valueChanges.pipe(
      debounceTime(500),
      distinctUntilChanged()
    ).subscribe(value => {
      this.filters.positionLabel = value || undefined;
      this.filters.page = 1; // Reset to first page
      this.loadLocations();
    });
    
    // Warehouse filter changes (for autocomplete)
    this.warehouseFilterInputControl.valueChanges.pipe(
      debounceTime(300),
      distinctUntilChanged()
    ).subscribe(value => {
      // Extract warehouseId from value (could be a GetWarehouseResponse object or string)
      if (value && typeof value === 'object' && 'id' in value) {
        this.filters.warehouseId = Number(value.id); // Ensure it's a number
      } else {
        this.filters.warehouseId = undefined;
      }
      this.filters.page = 1;
      this.loadLocations();
    });
  }

  /**
   * Open create modal
   */
  onCreateLocation(): void {
    this.isEditMode = false;
    this.selectedLocation = null;
    this.commonService.resetForm(this.locationForm);
    this.warehouseInputControl.setValue('');
    
    this.currentDialogRef = this.dialog.open(this.modalTemplate, {
      width: '700px',
      disableClose: true,
      panelClass: 'custom-dialog-container'
    });

    this.currentDialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.loadLocations();
      }
    });
  }

  /**
   * Open edit modal
   */
  onEditLocation(location: any): void {
    this.isEditMode = true;
    this.selectedLocation = location;
    this.populateEditForm(location);
    
    this.currentDialogRef = this.dialog.open(this.modalTemplate, {
      width: '700px',
      disableClose: true,
      panelClass: 'custom-dialog-container'
    });

    this.currentDialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.loadLocations();
      }
    });
  }

  /**
   * Populate the form with location data
   */
  private populateEditForm(location: any): void {
    this.locationForm.patchValue({
      warehouseId: location.warehouse?.id,
      aisle: location.aisle,
      levelNo: location.levelNo,
      positionLabel: location.positionLabel,
      notes: location.notes || ''
    });
    
    // Set the warehouse input control to display the warehouse name
    if (location.warehouse) {
      const selectedWarehouse = this.warehouseOptions.find(w => w.id === location.warehouse.id);
      if (selectedWarehouse) {
        this.warehouseInputControl.setValue(selectedWarehouse);
      } else {
        // If warehouse not in options, create a temporary object for display
        this.warehouseInputControl.setValue({
          id: location.warehouse.id,
          name: location.warehouse.name,
          address: location.warehouse.address || ''
        } as GetWarehouseResponse);
      }
    } else {
      this.warehouseInputControl.setValue('');
    }
  }

  /**
   * Submit the form (create or update)
   */
  onSubmitForm(): void {
    if (this.locationForm.invalid) {
      return;
    }

    this.isSubmitting = true;
    this.commonService.disableForm(this.locationForm);
    
    const formData: any = {
      warehouseId: this.locationForm.value.warehouseId
    };

    if (this.locationForm.value.aisle) {
      formData.aisle = this.locationForm.value.aisle;
    }

    if (this.locationForm.value.levelNo !== null && this.locationForm.value.levelNo !== undefined && this.locationForm.value.levelNo !== '') {
      formData.levelNo = this.locationForm.value.levelNo;
    }

    if (this.locationForm.value.positionLabel) {
      formData.positionLabel = this.locationForm.value.positionLabel;
    }
    
    if (this.locationForm.value.notes) {
      formData.notes = this.locationForm.value.notes;
    }

    if (this.isEditMode && this.selectedLocation) {
      // Update existing location
      this.locationService.locationControllerUpdateV1({
        id: this.selectedLocation.id,
        body: formData
      }).subscribe({
        next: (response) => {
          console.log("update", response);
          this.notificationService.success('Location updated successfully!');
          this.isSubmitting = false;
          this.commonService.enableForm(this.locationForm);
          
          if (this.currentDialogRef) {
            this.currentDialogRef.close(true);
          }
        },
        error: (error) => {
          console.error('Error updating location:', error);
          this.notificationService.error('Failed to update location. Please try again.');
          this.isSubmitting = false;
          this.commonService.enableForm(this.locationForm);
        }
      });
    } else {
      // Create new location
      this.locationService.locationControllerCreateV1({
        body: formData
      }).subscribe({
        next: (response) => {
          this.notificationService.success('Location created successfully!');
          this.isSubmitting = false;
          this.commonService.enableForm(this.locationForm);
          
          if (this.currentDialogRef) {
            this.currentDialogRef.close(true);
          }
        },
        error: (error) => {
          console.error('Error creating location:', error);
          this.notificationService.error('Failed to create location. Please try again.');
          this.isSubmitting = false;
          this.commonService.enableForm(this.locationForm);
        }
      });
    }
  }

  /**
   * Get modal title based on mode
   */
  getModalTitle(): string {
    return this.isEditMode ? 'Edit Location' : 'Create New Location';
  }

  /**
   * Get submit button text
   */
  getSubmitButtonText(): string {
    return this.isEditMode ? 'Update Location' : 'Create Location';
  }

  /**
   * View location details
   */
  onViewLocation(location: any): void {
    Swal.fire({
      title: `${location.aisle} - Level ${location.levelNo} - ${location.positionLabel}`,
      html: `
        <div class="text-start">
          <p><strong>Warehouse:</strong> ${location.warehouse?.name || 'N/A'}</p>
          <p><strong>Aisle:</strong> ${location.aisle || 'N/A'}</p>
          <p><strong>Level:</strong> ${location.levelNo || 'N/A'}</p>
          <p><strong>Position Label:</strong> ${location.positionLabel || 'N/A'}</p>
          <p><strong>Notes:</strong> ${location.notes || 'N/A'}</p>
          <p><strong>Location ID:</strong> ${location.id}</p>
        </div>
      `,
      icon: 'info',
      confirmButtonColor: '#556ee6',
      confirmButtonText: 'Close'
    });
  }

  /**
   * Delete location
   */
  onDeleteLocation(location: any): void {
    Swal.fire({
      title: 'Are you sure?',
      text: `Do you want to delete location "${location.aisle} - Level ${location.levelNo} - ${location.positionLabel}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Yes, delete it!',
      cancelButtonText: 'Cancel'
    }).then((result) => {
      if (result.isConfirmed) {
        this.locationService.locationControllerRemoveV1({
          id: location.id
        }).subscribe({
          next: () => {
            this.notificationService.success('Location deleted successfully!');
            this.loadLocations();
          },
          error: (error) => {
            console.error('Error deleting location:', error);
            this.notificationService.error('Failed to delete location. Please try again.');
          }
        });
      }
    });
  }
}
