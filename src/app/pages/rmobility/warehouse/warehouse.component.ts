import { AfterViewInit, Component, OnInit, ViewChild, TemplateRef } from '@angular/core';
import { FormControl, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatSort, Sort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { debounceTime, distinctUntilChanged, startWith, map, Observable, switchMap, of, catchError } from 'rxjs';
import { GlobalFormBuilder } from 'src/app/core/globalFormBuilder';
import { NotificationService } from 'src/app/core/services/notification.service';
import { CommonService } from 'src/app/core/services/common.service';
import Swal from 'sweetalert2';
import { GetWarehouseResponse, GetTownResponseDto } from 'src/app/opmobilitybackend/models';
import { WarehouseService, TownService } from 'src/app/opmobilitybackend/services';

// Warehouse filters interface
export interface WarehouseFilters {
  page?: number;
  limit?: number;
  name?: string;
  address?: string;
}

@Component({
  selector: 'app-warehouse',
  templateUrl: './warehouse.component.html',
  styleUrls: ['./warehouse.component.scss']
})
export class WarehouseComponent implements OnInit, AfterViewInit {
  breadCrumbItems: Array<{}>;
  
  // Table properties
  displayedColumns: string[] = ['name', 'address', 'town', 'actions'];
  dataSource: MatTableDataSource<GetWarehouseResponse> = new MatTableDataSource<GetWarehouseResponse>([]);
 
  // Pagination properties
  totalItems = 0;
  currentPage = 1;
  pageSize = 10;
  pageSizeOptions = [5, 10, 25, 50];
  
  // Loading state
  isLoading = false;
  
  // Filters
  filters: WarehouseFilters = {
    page: 1,
    limit: 10
  };
  
  // Search controls
  nameSearchControl = new FormControl('');
  addressSearchControl = new FormControl('');
  
  // Town options for autocomplete
  townOptions: GetTownResponseDto[] = [];
  filteredTowns: Observable<GetTownResponseDto[]>; // For modal form
  townInputControl = new FormControl<string | GetTownResponseDto>(''); // For modal form
  private autocompletePanelOpen = false; // Flag to track if autocomplete panel is open (modal)

  // Computed properties for summary cards
  get totalPages(): number {
    return Math.ceil(this.totalItems / this.pageSize) || 1;
  }

  // Modal properties
  warehouseForm: FormGroup;
  selectedWarehouse: GetWarehouseResponse | null = null;
  isSubmitting = false;
  isEditMode = false;

  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;
  @ViewChild('modalTemplate') modalTemplate: TemplateRef<any>;

  private currentDialogRef: MatDialogRef<any> | null = null;

  constructor(
    private warehouseService: WarehouseService,
    private townService: TownService,
    private globalFormBuilder: GlobalFormBuilder,
    private notificationService: NotificationService,
    private dialog: MatDialog,
    private fb: FormBuilder,
    private commonService: CommonService
  ) {
    this.warehouseForm = this.globalFormBuilder.warehouseForm();
  }

  ngOnInit(): void {
    this.breadCrumbItems = [{ label: 'Tables' }, { label: 'Warehouse Management', active: true }];
    this.warehouseForm = this.globalFormBuilder.warehouseForm();
    this.loadWarehouses();
    this.loadTowns();
    this.setupSearchDebouncing();
    this.setupTownAutocomplete();
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
   * Load warehouses from API
   */
  loadWarehouses(): void {
    this.isLoading = true;
    
    const queryParams: any = {
      page: this.filters.page || 1,
      limit: this.filters.limit || 10
    };
    
    if (this.filters.name) {
      queryParams.name = this.filters.name;
    }
    
    if (this.filters.address) {
      queryParams.address = this.filters.address;
    }
    
    this.warehouseService.warehouseControllerFindAllV1(queryParams).subscribe({
      next: (response: any) => {
        console.log('Warehouse data:', response);
        
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
        console.error('Error loading warehouses:', error);
        this.notificationService.error('Failed to load warehouses data. Please try again.');
        this.isLoading = false;
      }
    });
  }

  /**
   * Load towns data from API
   */
  loadTowns(): void {
    this.fetchTowns('').subscribe({
      next: (towns) => {
        this.townOptions = towns;
      },
      error: (error) => {
        console.error('Error loading towns:', error);
        this.notificationService.error('Failed to load towns data.');
      }
    });
  }

  /**
   * Setup town autocomplete filtering for modal form
   */
  setupTownAutocomplete(): void {
    this.filteredTowns = this.townInputControl.valueChanges.pipe(
      startWith(''),
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(value => {
        if (value && typeof value === 'object') {
          return of(this.townOptions);
        }

        const searchTerm = typeof value === 'string' ? value.trim() : '';
        return this.fetchTowns(searchTerm);
      }),
      map((towns) => {
        this.townOptions = towns;
        return towns;
      })
    );
  }

  private fetchTowns(name: string): Observable<GetTownResponseDto[]> {
    return this.townService.townControllerFindAllV1$Response({
      page: 1,
      limit: 2000,
      name: name || undefined
    } as any).pipe(
      map((response: any) => {
        const data = response.body || response;

        if (data && data.items) {
          return data.items as GetTownResponseDto[];
        }

        if (Array.isArray(data)) {
          return data as GetTownResponseDto[];
        }

        if (data && typeof data === 'object') {
          const keys = Object.keys(data);
          const arrayKey = keys.find((key) => Array.isArray(data[key]));
          if (arrayKey) {
            return data[arrayKey] as GetTownResponseDto[];
          }
        }

        return [];
      }),
      catchError((error) => {
        console.error('Error searching towns:', error);
        return of([]);
      })
    );
  }

  /**
   * Filter towns based on search term
   */
  private _filterTowns(name: string): GetTownResponseDto[] {
    const filterValue = name.toLowerCase();
    return this.townOptions.filter(town => 
      town.name.toLowerCase().includes(filterValue) ||
      (town.countryName && town.countryName.toLowerCase().includes(filterValue))
    );
  }

  /**
   * Display function for town autocomplete
   */
  displayTown(town: GetTownResponseDto | null): string {
    return town ? `${town.name} (${town.countryName})` : '';
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
   * Handle town selection from autocomplete (modal)
   */
  onTownSelected(town: GetTownResponseDto): void {
    if (town) {
      // Set the input control to the selected town object
      this.townInputControl.setValue(town);
      this.warehouseForm.patchValue({
        townId: town.id
      });
    } else {
      this.townInputControl.setValue('');
      this.warehouseForm.patchValue({
        townId: null
      });
    }
  }

  /**
   * Handle town input blur - validate that a town was selected (modal)
   */
  onTownInputBlur(): void {
    // Don't interfere if autocomplete panel is still open (selection in progress)
    if (this.autocompletePanelOpen) {
      return;
    }
    
    // Wait a bit to ensure optionSelected has fired
    setTimeout(() => {
      const inputValue = this.townInputControl.value;
      
      // If value is already a town object, selection was successful - do nothing
      if (inputValue && typeof inputValue === 'object' && 'id' in inputValue && 'name' in inputValue) {
        return;
      }
      
      // If input is a string (user typed but didn't select), validate it
      if (typeof inputValue === 'string' && inputValue !== '') {
        // Check if there's an exact match
        const exactMatch = this.townOptions.find(t => 
          t.name.toLowerCase() === inputValue.toLowerCase()
        );
        
        if (exactMatch) {
          // If exact match found, set it
          this.townInputControl.setValue(exactMatch);
          this.warehouseForm.patchValue({ townId: exactMatch.id });
        } else {
          // No match found, clear the input and townId
          this.townInputControl.setValue('');
          this.warehouseForm.patchValue({ townId: null });
        }
      } else if (!inputValue) {
        // Input is empty, clear townId
        this.warehouseForm.patchValue({ townId: null });
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
    this.loadWarehouses();
  }

  /**
   * Handle sorting changes
   */
  onSortChange(event: Sort): void {
    // Warehouses API may not support sorting, but we can sort locally if needed
    if (event.direction) {
      // You can implement local sorting here if needed
      this.loadWarehouses();
    }
  }

  /**
   * Apply filters
   */
  applyFilters(): void {
    this.filters.name = this.nameSearchControl.value || undefined;
    this.filters.address = this.addressSearchControl.value || undefined;
    this.filters.page = 1; // Reset to first page
    this.loadWarehouses();
  }

  /**
   * Clear all filters
   */
  clearFilters(): void {
    this.nameSearchControl.setValue('');
    this.addressSearchControl.setValue('');
    
    this.filters = {
      page: 1,
      limit: this.pageSize
    };
    
    this.loadWarehouses();
  }

  /**
   * Set up search input debouncing
   */
  private setupSearchDebouncing(): void {
    // Name search debouncing
    this.nameSearchControl.valueChanges.pipe(
      debounceTime(500),
      distinctUntilChanged()
    ).subscribe(value => {
      this.filters.name = value || undefined;
      this.filters.page = 1; // Reset to first page
      this.loadWarehouses();
    });
    
    // Address search debouncing
    this.addressSearchControl.valueChanges.pipe(
      debounceTime(500),
      distinctUntilChanged()
    ).subscribe(value => {
      this.filters.address = value || undefined;
      this.filters.page = 1; // Reset to first page
      this.loadWarehouses();
    });
  }

  /**
   * Open create modal
   */
  onCreateWarehouse(): void {
    this.isEditMode = false;
    this.selectedWarehouse = null;
    this.commonService.resetForm(this.warehouseForm);
    this.townInputControl.setValue('');
    
    this.currentDialogRef = this.dialog.open(this.modalTemplate, {
      width: '600px',
      disableClose: true,
      panelClass: 'custom-dialog-container'
    });

    this.currentDialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.loadWarehouses();
      }
    });
  }

  /**
   * Open edit modal
   */
  onEditWarehouse(warehouse: GetWarehouseResponse): void {
    this.isEditMode = true;
    this.selectedWarehouse = warehouse;
    this.populateEditForm(warehouse);
    
    this.currentDialogRef = this.dialog.open(this.modalTemplate, {
      width: '600px',
      disableClose: true,
      panelClass: 'custom-dialog-container'
    });

    this.currentDialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.loadWarehouses();
      }
    });
  }

  /**
   * Populate the form with warehouse data
   */
  private populateEditForm(warehouse: GetWarehouseResponse): void {
    this.warehouseForm.patchValue({
      name: warehouse.name,
      address: warehouse.address,
      townId: warehouse.town?.id
    });
    
    // Set the town input control to display the town name
    if (warehouse.town) {
      const selectedTown = this.townOptions.find(t => t.id === warehouse.town.id);
      if (selectedTown) {
        this.townInputControl.setValue(selectedTown);
      } else {
        // If town not in options, create a temporary object for display
        this.townInputControl.setValue({
          id: warehouse.town.id,
          name: warehouse.town.name,
          countryName: warehouse.town.country?.name || ''
        } as GetTownResponseDto);
      }
    } else {
      this.townInputControl.setValue('');
    }
  }

  /**
   * Submit the form (create or update)
   */
  onSubmitForm(): void {
    if (this.warehouseForm.invalid) {
      return;
    }

    this.isSubmitting = true;
    this.commonService.disableForm(this.warehouseForm);
    
    const formData = {
      name: this.warehouseForm.value.name,
      address: this.warehouseForm.value.address,
      townId: this.warehouseForm.value.townId
    };

    if (this.isEditMode && this.selectedWarehouse) {
      // Update existing warehouse
      this.warehouseService.warehouseControllerUpdateV1({
        id: this.selectedWarehouse.id,
        body: formData
      }).subscribe({
        next: (response) => {
          console.log("update", response);
          this.notificationService.success('Warehouse updated successfully!');
          this.isSubmitting = false;
          this.commonService.enableForm(this.warehouseForm);
          
          if (this.currentDialogRef) {
            this.currentDialogRef.close(true);
          }
        },
        error: (error) => {
          console.error('Error updating warehouse:', error);
          this.notificationService.error('Failed to update warehouse. Please try again.');
          this.isSubmitting = false;
          this.commonService.enableForm(this.warehouseForm);
        }
      });
    } else {
      // Create new warehouse
      this.warehouseService.warehouseControllerCreateV1({
        body: formData
      }).subscribe({
        next: (response) => {
          this.notificationService.success('Warehouse created successfully!');
          this.isSubmitting = false;
          this.commonService.enableForm(this.warehouseForm);
          
          if (this.currentDialogRef) {
            this.currentDialogRef.close(true);
          }
        },
        error: (error) => {
          console.error('Error creating warehouse:', error);
          this.notificationService.error('Failed to create warehouse. Please try again.');
          this.isSubmitting = false;
          this.commonService.enableForm(this.warehouseForm);
        }
      });
    }
  }

  /**
   * Get modal title based on mode
   */
  getModalTitle(): string {
    return this.isEditMode ? 'Edit Warehouse' : 'Create New Warehouse';
  }

  /**
   * Get submit button text
   */
  getSubmitButtonText(): string {
    return this.isEditMode ? 'Update Warehouse' : 'Create Warehouse';
  }

  /**
   * View warehouse details
   */
  onViewWarehouse(warehouse: GetWarehouseResponse): void {
    Swal.fire({
      title: warehouse.name,
      html: `
        <div class="text-start">
          <p><strong>Address:</strong> ${warehouse.address}</p>
          <p><strong>Town:</strong> ${warehouse.town?.name || 'N/A'}</p>
          <p><strong>Country:</strong> ${warehouse.town?.country?.name || 'N/A'}</p>
          <p><strong>Warehouse ID:</strong> ${warehouse.id}</p>
        </div>
      `,
      icon: 'info',
      confirmButtonColor: '#556ee6',
      confirmButtonText: 'Close'
    });
  }

  /**
   * Delete warehouse
   */
  onDeleteWarehouse(warehouse: GetWarehouseResponse): void {
    Swal.fire({
      title: 'Are you sure?',
      text: `Do you want to delete "${warehouse.name}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Yes, delete it!',
      cancelButtonText: 'Cancel'
    }).then((result) => {
      if (result.isConfirmed) {
        this.warehouseService.warehouseControllerRemoveV1({
          id: warehouse.id
        }).subscribe({
          next: () => {
            this.notificationService.success('Warehouse deleted successfully!');
            this.loadWarehouses();
          },
          error: (error) => {
            console.error('Error deleting warehouse:', error);
            this.notificationService.error('Failed to delete warehouse. Please try again.');
          }
        });
      }
    });
  }
}
