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
import { GetTownResponseDto, CountryResponseDto } from 'src/app/opmobilitybackend/models';
import { TownService, CountryService } from 'src/app/opmobilitybackend/services';

// Town filters interface
export interface TownFilters {
  page?: number;
  limit?: number;
  name?: string;
  countryId?: number;
}

@Component({
  selector: 'app-town',
  templateUrl: './town.component.html',
  styleUrls: ['./town.component.scss']
})
export class TownComponent implements OnInit, AfterViewInit {
  breadCrumbItems: Array<{}>;
  
  // Table properties
  displayedColumns: string[] = ['name', 'country', 'actions'];
  dataSource: MatTableDataSource<GetTownResponseDto> = new MatTableDataSource<GetTownResponseDto>([]);
 
  // Pagination properties
  totalItems = 0;
  currentPage = 1;
  pageSize = 10;
  pageSizeOptions = [5, 10, 25, 50];
  
  // Loading state
  isLoading = false;
  
  // Filters
  filters: TownFilters = {
    page: 1,
    limit: 10
  };
  
  // Search controls
  nameSearchControl = new FormControl('');
  countryFilter = new FormControl<string | CountryResponseDto | null>(null);
  
  // Country options
  countryOptions: CountryResponseDto[] = [];
  filteredCountries: Observable<CountryResponseDto[]>; // For modal form
  filteredCountriesForFilter: Observable<CountryResponseDto[]>; // For filter section
  countryInputControl = new FormControl<string | CountryResponseDto>(''); // For modal form
  countryFilterInputControl = new FormControl<string | CountryResponseDto | null>(null); // For filter section
  private autocompletePanelOpen = false; // Flag to track if autocomplete panel is open (modal)
  private filterAutocompletePanelOpen = false; // Flag to track if autocomplete panel is open (filter)

  // Computed properties for summary cards
  get totalPages(): number {
    return Math.ceil(this.totalItems / this.pageSize) || 1;
  }

  // Modal properties
  townForm: FormGroup;
  selectedTown: GetTownResponseDto | null = null;
  isSubmitting = false;
  isEditMode = false;

  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;
  @ViewChild('modalTemplate') modalTemplate: TemplateRef<any>;

  private currentDialogRef: MatDialogRef<any> | null = null;

  constructor(
    private townService: TownService,
    private countryService: CountryService,
    private globalFormBuilder: GlobalFormBuilder,
    private notificationService: NotificationService,
    private dialog: MatDialog,
    private fb: FormBuilder,
    private commonService: CommonService
  ) {
    this.townForm = this.globalFormBuilder.townForm();
  }

  ngOnInit(): void {
    this.breadCrumbItems = [{ label: 'Tables' }, { label: 'Town Management', active: true }];
    this.townForm = this.globalFormBuilder.townForm();
    this.loadTowns();
    this.loadCountries();
    this.setupSearchDebouncing();
    this.setupCountryAutocomplete();
    this.setupFilterCountryAutocomplete();
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
   * Load towns from API
   */
  loadTowns(): void {
    this.isLoading = true;
    
    const queryParams: any = {
      page: this.filters.page || 1,
      limit: this.filters.limit || 10
    };
    
    if (this.filters.name) {
      queryParams.name = this.filters.name;
    }
    
    if (this.filters.countryId) {
      // Ensure countryId is a number, not a string
      queryParams.countryId = Number(this.filters.countryId);
    }
    
    this.townService.townControllerFindAllV1(queryParams).subscribe({
      next: (response: any) => {
        console.log('Town data:', response);
        
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
        console.error('Error loading towns:', error);
        this.notificationService.error('Failed to load towns data. Please try again.');
        this.isLoading = false;
      }
    });
  }

  /**
   * Load countries data from API
   */
  loadCountries(): void {
    const requestParams = {
      page: 1,
      limit: 1000 as number
    };
    
    // Use $Response to get the full response since the generated type is void
    this.countryService.countryControllerFindAllV1$Response(requestParams).subscribe({
      next: (response: any) => {
        console.log("countries", response.body);
        // Handle response structure - check both body and direct response
        const data = response.body || response;
        if (data && data.items) {
          this.countryOptions = data.items;
        } else if (Array.isArray(data)) {
          this.countryOptions = data;
        } else if (data && typeof data === 'object') {
          // If it's a paginated response without items property, try to extract array
          this.countryOptions = [];
        } else {
          this.countryOptions = [];
        }
        // Re-setup autocomplete after countries are loaded
        this.setupCountryAutocomplete();
      },
      error: (error) => {
        console.error('Error loading countries:', error);
        this.notificationService.error('Failed to load countries. Please try again.');
      }
    });
  }

  /**
   * Setup country autocomplete filtering for modal form
   */
  setupCountryAutocomplete(): void {
    this.filteredCountries = this.countryInputControl.valueChanges.pipe(
      startWith(''),
      map(value => {
        const name = typeof value === 'string' ? value : value?.name || '';
        return name ? this._filterCountries(name) : this.countryOptions.slice();
      })
    );
  }

  /**
   * Setup country autocomplete filtering for filter section
   */
  setupFilterCountryAutocomplete(): void {
    this.filteredCountriesForFilter = this.countryFilterInputControl.valueChanges.pipe(
      startWith(''),
      map(value => {
        const name = typeof value === 'string' ? value : value?.name || '';
        return name ? this._filterCountries(name) : this.countryOptions.slice();
      })
    );
  }

  /**
   * Filter countries based on search term
   */
  private _filterCountries(name: string): CountryResponseDto[] {
    const filterValue = name.toLowerCase();
    return this.countryOptions.filter(country => 
      country.name.toLowerCase().includes(filterValue) ||
      (country.regionOfWorld && country.regionOfWorld.toLowerCase().includes(filterValue))
    );
  }

  /**
   * Display function for country autocomplete
   */
  displayCountry(country: CountryResponseDto | null): string {
    return country ? country.name : '';
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
   * Handle country selection from autocomplete (modal)
   */
  onCountrySelected(country: CountryResponseDto): void {
    if (country) {
      // Set the input control to the selected country object
      this.countryInputControl.setValue(country);
      this.townForm.patchValue({
        countryId: country.id
      });
    } else {
      this.countryInputControl.setValue('');
      this.townForm.patchValue({
        countryId: null
      });
    }
  }

  /**
   * Handle country selection from filter autocomplete
   */
  onFilterCountrySelected(country: CountryResponseDto | null): void {
    if (country && typeof country === 'object' && 'id' in country) {
      // Set the input control to the selected country object
      this.countryFilterInputControl.setValue(country);
      this.countryFilter.setValue(country);
      this.filters.countryId = Number(country.id); // Ensure it's a number
    } else {
      // "All Countries" selected or null
      this.countryFilterInputControl.setValue(null);
      this.countryFilter.setValue(null);
      this.filters.countryId = undefined;
    }
    // Trigger filter update
    this.filters.page = 1;
    this.loadTowns();
  }

  /**
   * Handle country input blur - validate that a country was selected (modal)
   */
  onCountryInputBlur(): void {
    // Don't interfere if autocomplete panel is still open (selection in progress)
    if (this.autocompletePanelOpen) {
      return;
    }
    
    // Wait a bit to ensure optionSelected has fired
    setTimeout(() => {
      const inputValue = this.countryInputControl.value;
      
      // If value is already a country object, selection was successful - do nothing
      if (inputValue && typeof inputValue === 'object' && 'id' in inputValue && 'name' in inputValue) {
        return;
      }
      
      // If input is a string (user typed but didn't select), validate it
      if (typeof inputValue === 'string' && inputValue !== '') {
        // Check if there's an exact match
        const exactMatch = this.countryOptions.find(c => 
          c.name.toLowerCase() === inputValue.toLowerCase()
        );
        
        if (exactMatch) {
          // If exact match found, set it
          this.countryInputControl.setValue(exactMatch);
          this.townForm.patchValue({ countryId: exactMatch.id });
        } else {
          // No match found, clear the input and countryId
          this.countryInputControl.setValue('');
          this.townForm.patchValue({ countryId: null });
        }
      } else if (!inputValue) {
        // Input is empty, clear countryId
        this.townForm.patchValue({ countryId: null });
      }
    }, 200);
  }

  /**
   * Handle filter country input blur - validate that a country was selected
   */
  onFilterCountryInputBlur(): void {
    // Don't interfere if autocomplete panel is still open (selection in progress)
    if (this.filterAutocompletePanelOpen) {
      return;
    }
    
    // Wait a bit to ensure optionSelected has fired
    setTimeout(() => {
      const inputValue = this.countryFilterInputControl.value;
      
      // If value is already a country object, selection was successful - do nothing
      if (inputValue && typeof inputValue === 'object' && 'id' in inputValue && 'name' in inputValue) {
        return;
      }
      
      // If input is a string (user typed but didn't select), validate it
      if (typeof inputValue === 'string' && inputValue !== '') {
        // Check if there's an exact match
        const exactMatch = this.countryOptions.find(c => 
          c.name.toLowerCase() === inputValue.toLowerCase()
        );
        
        if (exactMatch) {
          // If exact match found, set it
          this.countryFilterInputControl.setValue(exactMatch);
          this.countryFilter.setValue(exactMatch);
          this.filters.countryId = Number(exactMatch.id); // Ensure it's a number
        } else {
          // No match found, clear the input and filter
          this.countryFilterInputControl.setValue(null);
          this.countryFilter.setValue(null);
          this.filters.countryId = undefined;
        }
      } else if (!inputValue) {
        // Input is empty, clear filter
        this.countryFilterInputControl.setValue(null);
        this.countryFilter.setValue(null);
        this.filters.countryId = undefined;
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
    this.loadTowns();
  }

  /**
   * Handle sorting changes
   */
  onSortChange(event: Sort): void {
    // Towns API may not support sorting, but we can sort locally if needed
    if (event.direction) {
      // You can implement local sorting here if needed
      this.loadTowns();
    }
  }

  /**
   * Apply filters
   */
  applyFilters(): void {
    this.filters.name = this.nameSearchControl.value || undefined;
    
    // Extract countryId from countryFilter (could be a CountryResponseDto object or number)
    const countryFilterValue = this.countryFilterInputControl.value;
    if (countryFilterValue && typeof countryFilterValue === 'object' && 'id' in countryFilterValue) {
      this.filters.countryId = Number(countryFilterValue.id); // Ensure it's a number
    } else {
      this.filters.countryId = undefined;
    }
    
    this.filters.page = 1; // Reset to first page
    this.loadTowns();
  }

  /**
   * Clear all filters
   */
  clearFilters(): void {
    this.nameSearchControl.setValue('');
    this.countryFilterInputControl.setValue(null);
    this.countryFilter.setValue(null);
    
    this.filters = {
      page: 1,
      limit: this.pageSize
    };
    
    this.loadTowns();
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
      this.loadTowns();
    });
    
    // Country filter changes (for autocomplete)
    this.countryFilterInputControl.valueChanges.pipe(
      debounceTime(300),
      distinctUntilChanged()
    ).subscribe(value => {
      // Extract countryId from value (could be a CountryResponseDto object or string)
      if (value && typeof value === 'object' && 'id' in value) {
        this.filters.countryId = Number(value.id); // Ensure it's a number
      } else {
        this.filters.countryId = undefined;
      }
      this.filters.page = 1;
      this.loadTowns();
    });
  }

  /**
   * Open create modal
   */
  onCreateTown(): void {
    this.isEditMode = false;
    this.selectedTown = null;
    this.commonService.resetForm(this.townForm);
    this.countryInputControl.setValue('');
    
    this.currentDialogRef = this.dialog.open(this.modalTemplate, {
      width: '600px',
      disableClose: true,
      panelClass: 'custom-dialog-container'
    });

    this.currentDialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.loadTowns();
      }
    });
  }

  /**
   * Open edit modal
   */
  onEditTown(town: GetTownResponseDto): void {
    this.isEditMode = true;
    this.selectedTown = town;
    this.populateEditForm(town);
    
    this.currentDialogRef = this.dialog.open(this.modalTemplate, {
      width: '600px',
      disableClose: true,
      panelClass: 'custom-dialog-container'
    });

    this.currentDialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.loadTowns();
      }
    });
  }

  /**
   * Populate the form with town data
   */
  private populateEditForm(town: GetTownResponseDto): void {
    this.townForm.patchValue({
      name: town.name,
      countryId: town.countryId
    });
    
    // Set the country input control to display the country name
    const selectedCountry = this.countryOptions.find(c => c.id === town.countryId);
    if (selectedCountry) {
      this.countryInputControl.setValue(selectedCountry);
    } else {
      this.countryInputControl.setValue('');
    }
  }

  /**
   * Submit the form (create or update)
   */
  onSubmitForm(): void {
    if (this.townForm.invalid) {
      return;
    }

    this.isSubmitting = true;
    this.commonService.disableForm(this.townForm);
    
    const formData = {
      name: this.townForm.value.name.toUpperCase(),
      countryId: this.townForm.value.countryId
    };

    if (this.isEditMode && this.selectedTown) {
      // Update existing town
      this.townService.townControllerUpdateV1({
        id: this.selectedTown.id,
        body: formData
      }).subscribe({
        next: (response) => {
          console.log("update", response);
          this.notificationService.success('Town updated successfully!');
          this.isSubmitting = false;
          this.commonService.enableForm(this.townForm);
          
          if (this.currentDialogRef) {
            this.currentDialogRef.close(true);
          }
        },
        error: (error) => {
          console.error('Error updating town:', error);
          this.notificationService.error('Failed to update town. Please try again.');
          this.isSubmitting = false;
          this.commonService.enableForm(this.townForm);
        }
      });
    } else {
      // Create new town
      this.townService.townControllerCreateV1({
        body: formData
      }).subscribe({
        next: (response) => {
          this.notificationService.success('Town created successfully!');
          this.isSubmitting = false;
          this.commonService.enableForm(this.townForm);
          
          if (this.currentDialogRef) {
            this.currentDialogRef.close(true);
          }
        },
        error: (error) => {
          console.error('Error creating town:', error);
          this.notificationService.error('Failed to create town. Please try again.');
          this.isSubmitting = false;
          this.commonService.enableForm(this.townForm);
        }
      });
    }
  }

  /**
   * Get modal title based on mode
   */
  getModalTitle(): string {
    return this.isEditMode ? 'Edit Town' : 'Create New Town';
  }

  /**
   * Get submit button text
   */
  getSubmitButtonText(): string {
    return this.isEditMode ? 'Update Town' : 'Create Town';
  }

  /**
   * View town details
   */
  onViewTown(town: GetTownResponseDto): void {
    Swal.fire({
      title: town.name,
      html: `
        <div class="text-start">
          <p><strong>Country:</strong> ${town.countryName}</p>
          <p><strong>Country ID:</strong> ${town.countryId}</p>
          <p><strong>Town ID:</strong> ${town.id}</p>
        </div>
      `,
      icon: 'info',
      confirmButtonColor: '#556ee6',
      confirmButtonText: 'Close'
    });
  }
}
