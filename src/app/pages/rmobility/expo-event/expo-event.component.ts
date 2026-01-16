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
import { GetExpoEventResponse, GetTownResponseDto } from 'src/app/opmobilitybackend/models';
import { ExpoEventService, TownService } from 'src/app/opmobilitybackend/services';

// Expo event filters interface
export interface ExpoEventFilters {
  page?: number;
  limit?: number;
  name?: string;
  place?: string;
  townId?: number;
  status?: string;
  ownerName?: string;
  startDate?: string;
  endDate?: string;
}

// Expo event status options
export const EXPO_EVENT_STATUSES = [
  { value: 'PLANNED', label: 'Planned' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'CLOSED', label: 'Closed' }
];

@Component({
  selector: 'app-expo-event',
  templateUrl: './expo-event.component.html',
  styleUrls: ['./expo-event.component.scss']
})
export class ExpoEventComponent implements OnInit, AfterViewInit {
  breadCrumbItems: Array<{}>;
  
  // Table properties
  displayedColumns: string[] = ['name', 'place', 'town', 'startDate', 'endDate', 'ownerName', 'status', 'notes', 'actions'];
  dataSource: MatTableDataSource<GetExpoEventResponse> = new MatTableDataSource<GetExpoEventResponse>([]);
 
  // Pagination properties
  totalItems = 0;
  currentPage = 1;
  pageSize = 10;
  pageSizeOptions = [5, 10, 25, 50];
  
  // Loading state
  isLoading = false;
  
  // Filters
  filters: ExpoEventFilters = {
    page: 1,
    limit: 10
  };
  
  // Search controls
  nameSearchControl = new FormControl('');
  placeSearchControl = new FormControl('');
  statusFilterControl = new FormControl<string | null>(null);
  ownerNameSearchControl = new FormControl('');
  townFilterInputControl = new FormControl<string | GetTownResponseDto | null>(null);
  
  // Options for dropdowns/autocomplete
  expoEventStatuses = EXPO_EVENT_STATUSES;
  townOptions: GetTownResponseDto[] = [];
  
  // Autocomplete observables
  filteredTowns: Observable<GetTownResponseDto[]>;
  filteredTownsForFilter: Observable<GetTownResponseDto[]>;
  
  // Form controls for autocomplete
  townInputControl = new FormControl<string | GetTownResponseDto>('');
  
  private autocompletePanelOpen = false;
  private filterAutocompletePanelOpen = false;

  // Computed properties for summary cards
  get totalPages(): number {
    return Math.ceil(this.totalItems / this.pageSize) || 1;
  }

  // Modal properties
  expoEventForm: FormGroup;
  selectedExpoEvent: GetExpoEventResponse | null = null;
  isSubmitting = false;
  isEditMode = false;

  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;
  @ViewChild('modalTemplate') modalTemplate: TemplateRef<any>;

  private currentDialogRef: MatDialogRef<any> | null = null;

  constructor(
    private expoEventService: ExpoEventService,
    private townService: TownService,
    private globalFormBuilder: GlobalFormBuilder,
    private notificationService: NotificationService,
    private dialog: MatDialog,
    private fb: FormBuilder,
    private commonService: CommonService
  ) {
    this.expoEventForm = this.globalFormBuilder.expoEventForm();
    
    // Initialize autocomplete observables
    this.filteredTowns = this.townInputControl.valueChanges.pipe(
      startWith(''),
      map(value => this._filterTowns(value || ''))
    );
    
    this.filteredTownsForFilter = this.townFilterInputControl.valueChanges.pipe(
      startWith(''),
      map(value => this._filterTowns(value || ''))
    );
  }

  ngOnInit(): void {
    this.breadCrumbItems = [{ label: 'Tables' }, { label: 'Expo Event Management', active: true }];
    this.expoEventForm = this.globalFormBuilder.expoEventForm();
    this.loadExpoEvents();
    this.loadTowns();
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
   * Load expo events from API
   */
  loadExpoEvents(): void {
    this.isLoading = true;
    
    const queryParams: any = {
      page: this.filters.page || 1,
      limit: this.filters.limit || 10
    };
    
    if (this.filters.name) {
      queryParams.name = this.filters.name;
    }
    if (this.filters.place) {
      queryParams.place = this.filters.place;
    }
    if (this.filters.townId) {
      queryParams.townId = this.filters.townId;
    }
    if (this.filters.status) {
      queryParams.status = this.filters.status;
    }
    if (this.filters.ownerName) {
      queryParams.ownerName = this.filters.ownerName;
    }
    if (this.filters.startDate) {
      queryParams.startDate = this.filters.startDate;
    }
    if (this.filters.endDate) {
      queryParams.endDate = this.filters.endDate;
    }
    
    this.expoEventService.expoEventControllerGetAllExpoEventsV1$Response(queryParams).subscribe({
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
        console.error('Error loading expo events:', error);
        this.notificationService.error('Failed to load expo events. Please try again.');
        this.isLoading = false;
      }
    });
  }

  /**
   * Load towns for autocomplete
   */
  loadTowns(): void {
    this.townService.townControllerFindAllV1$Response({} as any).subscribe({
      next: (response) => {
        const responseBody = response.body as any;
        // Towns API returns either array or paginated response
        if (Array.isArray(responseBody)) {
          this.townOptions = responseBody;
        } else if (responseBody?.items) {
          this.townOptions = responseBody.items;
        } else {
          this.townOptions = [];
        }
      },
      error: (error) => {
        console.error('Error loading towns:', error);
      }
    });
  }

  /**
   * Filter towns
   */
  private _filterTowns(value: string | GetTownResponseDto): GetTownResponseDto[] {
    if (!value || typeof value !== 'string') {
      return this.townOptions;
    }
    const filterValue = value.toLowerCase();
    return this.townOptions.filter(town => 
      town.name?.toLowerCase().includes(filterValue) ||
      town.countryName?.toLowerCase().includes(filterValue)
    );
  }

  /**
   * Display town in autocomplete
   */
  displayTown(town: GetTownResponseDto | null): string {
    if (!town) return '';
    return `${town.name || ''}${town.countryName ? ' - ' + town.countryName : ''}`.trim();
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
        this.loadExpoEvents();
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
    this.loadExpoEvents();
  }

  /**
   * Handle sort change
   */
  onSortChange(sort: Sort): void {
    if (sort.active && sort.direction) {
      this.filters.page = 1;
      this.loadExpoEvents();
    }
  }

  /**
   * Apply filters
   */
  applyFilters(): void {
    this.filters.name = this.nameSearchControl.value || undefined;
    this.filters.place = this.placeSearchControl.value || undefined;
    this.filters.status = this.statusFilterControl.value || undefined;
    this.filters.ownerName = this.ownerNameSearchControl.value || undefined;
    if (this.townFilterInputControl.value && typeof this.townFilterInputControl.value === 'object') {
      this.filters.townId = (this.townFilterInputControl.value as GetTownResponseDto).id;
    }
    this.filters.page = 1;
    this.loadExpoEvents();
  }

  /**
   * Clear filters
   */
  clearFilters(): void {
    this.nameSearchControl.setValue('');
    this.placeSearchControl.setValue('');
    this.statusFilterControl.setValue(null);
    this.ownerNameSearchControl.setValue('');
    this.townFilterInputControl.setValue(null);
    
    this.filters = {
      page: 1,
      limit: this.pageSize
    };
    
    this.loadExpoEvents();
  }

  /**
   * Get expo event status label
   */
  getExpoEventStatusLabel(status: string): string {
    const found = this.expoEventStatuses.find(s => s.value === status);
    return found?.label || status;
  }

  /**
   * Get expo event status badge class
   */
  getExpoEventStatusBadgeClass(status: string): string {
    switch (status) {
      case 'PLANNED':
        return 'bg-primary';
      case 'IN_PROGRESS':
        return 'bg-info';
      case 'CLOSED':
        return 'bg-success';
      default:
        return 'bg-secondary';
    }
  }

  /**
   * Create new expo event
   */
  onCreateExpoEvent(): void {
    this.isEditMode = false;
    this.selectedExpoEvent = null;
    this.expoEventForm.reset();
    this.expoEventForm = this.globalFormBuilder.expoEventForm();
    
    if (this.modalTemplate) {
      this.currentDialogRef = this.dialog.open(this.modalTemplate, {
        width: '800px',
        maxWidth: '90vw',
        disableClose: true
      });
    }
  }

  /**
   * Edit expo event
   */
  onEditExpoEvent(expoEvent: GetExpoEventResponse): void {
    this.isEditMode = true;
    this.selectedExpoEvent = expoEvent;
    this.populateEditForm(expoEvent);
    
    if (this.modalTemplate) {
      this.currentDialogRef = this.dialog.open(this.modalTemplate, {
        width: '800px',
        maxWidth: '90vw',
        disableClose: true
      });
    }
  }

  /**
   * Delete expo event
   */
  onDeleteExpoEvent(expoEvent: GetExpoEventResponse): void {
    Swal.fire({
      title: 'Are you sure?',
      text: `Do you want to delete "${expoEvent.name}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Yes, delete it!'
    }).then((result) => {
      if (result.isConfirmed) {
        this.expoEventService.expoEventControllerRemoveV1$Response({ id: expoEvent.id } as any).subscribe({
          next: () => {
            this.notificationService.success('Expo event deleted successfully');
            this.loadExpoEvents();
          },
          error: (error) => {
            console.error('Error deleting expo event:', error);
            this.notificationService.error('Failed to delete expo event. Please try again.');
          }
        });
      }
    });
  }

  /**
   * View expo event details
   */
  onViewExpoEvent(expoEvent: GetExpoEventResponse): void {
    const e = expoEvent as any;
    
    // Build HTML content
    let htmlContent = `
      <div class="text-start" style="max-width: 100%;">
        <!-- Expo Event Details -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
          <div>
            <p style="margin: 8px 0;"><strong>Name:</strong><br><span style="color: #556ee6;">${e.name || 'N/A'}</span></p>
            <p style="margin: 8px 0;"><strong>Place:</strong><br>${e.place || 'N/A'}</p>
            <p style="margin: 8px 0;"><strong>Town:</strong><br>${e.town ? this.displayTown(e.town) : (e.townId ? 'Town ID: ' + e.townId : 'N/A')}</p>
            <p style="margin: 8px 0;"><strong>Start Date:</strong><br>${e.startDate ? new Date(e.startDate).toLocaleDateString() : 'N/A'}</p>
            <p style="margin: 8px 0;"><strong>End Date:</strong><br>${e.endDate ? new Date(e.endDate).toLocaleDateString() : 'N/A'}</p>
          </div>
          <div>
            <p style="margin: 8px 0;"><strong>Status:</strong><br><span class="badge ${this.getExpoEventStatusBadgeClass(e.status || 'PLANNED')}">${this.getExpoEventStatusLabel(e.status || 'PLANNED')}</span></p>
            <p style="margin: 8px 0;"><strong>Owner Name:</strong><br>${e.ownerName || 'N/A'}</p>
          </div>
        </div>
        
        <!-- Notes -->
        <div style="margin-bottom: 20px;">
          <p style="margin: 8px 0;"><strong>Notes:</strong></p>
          <p style="margin: 8px 0; padding: 10px; background: #f8f9fa; border-radius: 4px; color: #666;">${e.notes || 'N/A'}</p>
        </div>
        
        <!-- Expo Event ID -->
        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #eee; text-align: center;">
          <p style="margin: 0; font-size: 12px; color: #999;">Expo Event ID: ${expoEvent.id}</p>
        </div>
      </div>
    `;

    Swal.fire({
      title: `<strong>${e.name || 'Expo Event'}</strong>`,
      html: htmlContent,
      icon: 'info',
      confirmButtonColor: '#556ee6',
      confirmButtonText: 'Close',
      width: '700px',
      customClass: {
        popup: 'expo-event-details-popup'
      }
    });
  }

  /**
   * Populate edit form
   */
  populateEditForm(expoEvent: GetExpoEventResponse): void {
    this.expoEventForm.patchValue({
      name: expoEvent.name,
      place: expoEvent.place || '',
      townId: expoEvent.townId,
      startDate: expoEvent.startDate ? new Date(expoEvent.startDate).toISOString().split('T')[0] : '',
      endDate: expoEvent.endDate ? new Date(expoEvent.endDate).toISOString().split('T')[0] : '',
      ownerName: expoEvent.ownerName || '',
      status: expoEvent.status || 'PLANNED',
      notes: expoEvent.notes || ''
    });

    // Set town in form control
    if (expoEvent.townId) {
      const town = this.townOptions.find(t => t.id === expoEvent.townId);
      if (town) {
        this.townInputControl.setValue(town);
      }
    }
  }

  /**
   * Handle town selection in form
   */
  onTownSelected(event: any): void {
    const town = event.option.value as GetTownResponseDto;
    this.expoEventForm.patchValue({ townId: town.id });
    this.townInputControl.setValue(town);
  }

  /**
   * Handle filter town selection
   */
  onFilterTownSelected(event: any): void {
    const town = event.option.value as GetTownResponseDto;
    this.townFilterInputControl.setValue(town);
  }

  /**
   * Submit form
   */
  onSubmitForm(): void {
    if (this.expoEventForm.invalid) {
      this.expoEventForm.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    const formValue = this.expoEventForm.getRawValue();

    if (this.isEditMode && this.selectedExpoEvent) {
      // Update expo event (uses JSON)
      const updateDto: any = {
        name: formValue.name,
        townId: formValue.townId.toString(),
        startDate: formValue.startDate,
        endDate: formValue.endDate,
        status: formValue.status
      };
      if (formValue.place) {
        updateDto.place = formValue.place;
      }
      if (formValue.ownerName) {
        updateDto.ownerName = formValue.ownerName;
      }
      if (formValue.notes) {
        updateDto.notes = formValue.notes;
      }

      this.expoEventService.expoEventControllerUpdateV1$Response({
        id: this.selectedExpoEvent.id.toString(),
        body: updateDto
      } as any).subscribe({
        next: () => {
          this.notificationService.success('Expo event updated successfully');
          this.isSubmitting = false;
          if (this.currentDialogRef) {
            this.currentDialogRef.close();
          }
          this.loadExpoEvents();
        },
        error: (error) => {
          console.error('Error updating expo event:', error);
          this.notificationService.error('Failed to update expo event. Please try again.');
          this.isSubmitting = false;
        }
      });
    } else {
      // Create expo event
      const formData = new FormData();
      formData.append('name', formValue.name);
      if (formValue.place) {
        formData.append('place', formValue.place);
      }
      formData.append('townId', formValue.townId.toString());
      formData.append('startDate', formValue.startDate);
      formData.append('endDate', formValue.endDate);
      if (formValue.ownerName) {
        formData.append('ownerName', formValue.ownerName);
      }
      formData.append('status', formValue.status);
      if (formValue.notes) {
        formData.append('notes', formValue.notes);
      }

      this.expoEventService.expoEventControllerCreateV1$Response({
        body: formData
      } as any).subscribe({
        next: () => {
          this.notificationService.success('Expo event created successfully');
          this.isSubmitting = false;
          if (this.currentDialogRef) {
            this.currentDialogRef.close();
          }
          this.loadExpoEvents();
        },
        error: (error) => {
          console.error('Error creating expo event:', error);
          this.notificationService.error('Failed to create expo event. Please try again.');
          this.isSubmitting = false;
        }
      });
    }
  }

  /**
   * Get modal title
   */
  getModalTitle(): string {
    return this.isEditMode ? 'Edit Expo Event' : 'Create Expo Event';
  }

  /**
   * Get submit button text
   */
  getSubmitButtonText(): string {
    return this.isEditMode ? 'Update' : 'Create';
  }

  /**
   * Get items to display for pagination info
   */
  getItemsToDisplay(): number {
    return Math.min(this.currentPage * this.pageSize, this.totalItems);
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