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
import { TransportPodium, GetTransportListResponse, Podium } from 'src/app/opmobilitybackend/models';
import { TransportPodiumService, TransportListService, PodiumService } from 'src/app/opmobilitybackend/services';

// Transport Podium filters interface
export interface TransportPodiumFilters {
  page?: number;
  limit?: number;
  transportListId?: number;
}

@Component({
  selector: 'app-transport-podium',
  templateUrl: './transport-podium.component.html',
  styleUrls: ['./transport-podium.component.scss']
})
export class TransportPodiumComponent implements OnInit, AfterViewInit {
  breadCrumbItems: Array<{}>;
  
  // Table properties
  displayedColumns: string[] = ['id', 'transportList', 'podium', 'grossWeightKg', 'returnedAt', 'actions'];
  dataSource: MatTableDataSource<TransportPodium> = new MatTableDataSource<TransportPodium>([]);
 
  // Pagination properties
  totalItems = 0;
  currentPage = 1;
  pageSize = 10;
  pageSizeOptions = [5, 10, 25, 50];
  totalPages = 1;
  
  // Loading state
  isLoading = false;
  
  // Filters
  filters: TransportPodiumFilters = {
    page: 1,
    limit: 10
  };
  
  // Search controls
  transportListFilterInputControl = new FormControl<string | GetTransportListResponse | null>(null);
  
  // Options for dropdowns/autocomplete
  transportListOptions: GetTransportListResponse[] = [];
  podiumOptions: Podium[] = [];
  
  // Form controls for autocomplete
  transportListInputControl = new FormControl<string | GetTransportListResponse>('');
  podiumInputControl = new FormControl<string | Podium>('');
  
  // Autocomplete observables
  filteredTransportLists: Observable<GetTransportListResponse[]>;
  filteredTransportListsForFilter: Observable<GetTransportListResponse[]>;
  filteredPodiums: Observable<Podium[]>;
  
  private autocompletePanelOpen = false;
  private filterAutocompletePanelOpen = false;

  // Form
  transportPodiumForm: FormGroup;
  isEditMode = false;
  selectedTransportPodium: TransportPodium | null = null;
  currentDialogRef: MatDialogRef<any> | null = null;
  isSubmitting = false;

  @ViewChild('modalTemplate') modalTemplate!: TemplateRef<any>;
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  constructor(
    private fb: FormBuilder,
    private globalFormBuilder: GlobalFormBuilder,
    private transportPodiumService: TransportPodiumService,
    private transportListService: TransportListService,
    private podiumService: PodiumService,
    private notificationService: NotificationService,
    private commonService: CommonService,
    private dialog: MatDialog
  ) {
    this.breadCrumbItems = [
      { label: 'RMobility' },
      { label: 'Transport Podium Management', active: true }
    ];

    this.transportPodiumForm = this.globalFormBuilder.transportPodiumForm();

    // Set up autocomplete filtering
    this.filteredTransportLists = this.transportListInputControl.valueChanges.pipe(
      startWith(''),
      map(value => this._filterTransportLists(value))
    );

    this.filteredTransportListsForFilter = this.transportListFilterInputControl.valueChanges.pipe(
      startWith(''),
      map(value => this._filterTransportLists(value))
    );

    this.filteredPodiums = this.podiumInputControl.valueChanges.pipe(
      startWith(''),
      map(value => this._filterPodiums(value))
    );
  }

  ngOnInit(): void {
    this.loadTransportPodiums();
    this.loadTransportLists();
    this.loadPodiums();
  }

  ngAfterViewInit(): void {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
    this.setupSearchDebouncing();
  }

  /**
   * Load transport podiums from API
   */
  loadTransportPodiums(): void {
    this.isLoading = true;
    const queryParams: any = {};

    if (this.filters.transportListId) {
      queryParams.transportListId = this.filters.transportListId;
    }

    this.transportPodiumService.transportPodiumControllerFindAllV1$Response(queryParams).subscribe({
      next: (response) => {
        const responseBody = response.body as any;
        
        // The API returns an array of transport podiums
        if (Array.isArray(responseBody)) {
          this.dataSource.data = responseBody;
          this.totalItems = responseBody.length;
          // For client-side pagination, we could slice the array here
          // For now, we'll display all items
        } else {
          this.dataSource.data = [];
          this.totalItems = 0;
        }
        
        this.totalPages = Math.ceil(this.totalItems / this.pageSize) || 1;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading transport podiums:', error);
        this.notificationService.error('Failed to load transport podiums. Please try again.');
        this.isLoading = false;
      }
    });
  }

  /**
   * Load transport lists for autocomplete
   */
  loadTransportLists(): void {
    this.transportListService.transportListControllerGetAllTransportListsV1$Response({ page: 1, limit: 1000 } as any).subscribe({
      next: (response) => {
        const responseBody = response.body as any;
        this.transportListOptions = responseBody?.items || responseBody || [];
      },
      error: (error) => {
        console.error('Error loading transport lists:', error);
      }
    });
  }

  /**
   * Load podiums for autocomplete
   */
  loadPodiums(): void {
    this.podiumService.podiumControllerGetAllPodiumsV1$Response({ page: 1, limit: 1000 } as any).subscribe({
      next: (response) => {
        const responseBody = response.body as any;
        this.podiumOptions = responseBody?.items || responseBody || [];
      },
      error: (error) => {
        console.error('Error loading podiums:', error);
      }
    });
  }

  /**
   * Filter transport lists for autocomplete
   */
  private _filterTransportLists(value: string | GetTransportListResponse | null): GetTransportListResponse[] {
    if (!value || typeof value !== 'string') {
      return this.transportListOptions;
    }
    const filterValue = value.toLowerCase();
    return this.transportListOptions.filter(transportList => 
      transportList.id?.toString().includes(filterValue) ||
      transportList.status?.toLowerCase().includes(filterValue)
    );
  }

  /**
   * Filter podiums for autocomplete
   */
  private _filterPodiums(value: string | Podium | null): Podium[] {
    if (!value || typeof value !== 'string') {
      return this.podiumOptions;
    }
    const filterValue = value.toLowerCase();
    return this.podiumOptions.filter(podium => {
      const r = podium as any;
      return r.ref?.toLowerCase().includes(filterValue) ||
             r.name?.toLowerCase().includes(filterValue);
    });
  }

  /**
   * Display transport list in autocomplete
   */
  displayTransportList(transportList: GetTransportListResponse | null): string {
    if (!transportList) return '';
    return `List #${transportList.id} (${transportList.status || ''})`;
  }

  /**
   * Display podium in autocomplete
   */
  displayPodium(podium: Podium | null): string {
    if (!podium) return '';
    const r = podium as any;
    return `${r.ref || ''} - ${r.name || ''}`.trim();
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
   * Handle transport list selection
   */
  onTransportListSelected(event: any): void {
    const transportList = event.option.value as GetTransportListResponse;
    this.transportPodiumForm.patchValue({ transportListId: transportList.id });
    this.transportListInputControl.setValue(transportList);
  }

  /**
   * Handle podium selection
   */
  onPodiumSelected(event: any): void {
    const podium = event.option.value as Podium;
    const podiumId = (podium as any).id;
    this.transportPodiumForm.patchValue({ podiumId: podiumId });
    this.podiumInputControl.setValue(podium);
  }

  /**
   * Handle transport list filter selection
   */
  onTransportListFilterSelected(event: any): void {
    const transportList = event.option.value as GetTransportListResponse;
    if (transportList && transportList.id) {
      this.filters.transportListId = transportList.id;
    } else {
      this.filters.transportListId = undefined;
    }
  }

  /**
   * Handle transport list input blur - clear if invalid
   */
  onTransportListInputBlur(): void {
    const value = this.transportListInputControl.value;
    if (value && typeof value === 'string' && value.trim() !== '') {
      const matchingTransportList = this.transportListOptions.find(tl => 
        this.displayTransportList(tl).toLowerCase() === value.toLowerCase()
      );
      if (!matchingTransportList) {
        this.transportListInputControl.setValue('', { emitEvent: false });
        this.transportPodiumForm.patchValue({ transportListId: null }, { emitEvent: false });
      }
    }
  }

  /**
   * Handle podium input blur - clear if invalid
   */
  onPodiumInputBlur(): void {
    const value = this.podiumInputControl.value;
    if (value && typeof value === 'string' && value.trim() !== '') {
      const matchingPodium = this.podiumOptions.find(p => 
        this.displayPodium(p).toLowerCase() === value.toLowerCase()
      );
      if (!matchingPodium) {
        this.podiumInputControl.setValue('', { emitEvent: false });
        this.transportPodiumForm.patchValue({ podiumId: null }, { emitEvent: false });
      }
    }
  }

  /**
   * Handle pagination change
   */
  onPageChange(event: PageEvent): void {
    this.filters.page = event.pageIndex + 1;
    this.filters.limit = event.pageSize;
    this.loadTransportPodiums();
  }

  /**
   * Handle sort change
   */
  onSortChange(sort: Sort): void {
    // Handle sorting if needed
    if (sort.active && sort.direction) {
      this.loadTransportPodiums();
    }
  }

  /**
   * Apply filters
   */
  applyFilters(): void {
    this.filters.page = 1;
    this.loadTransportPodiums();
  }

  /**
   * Clear filters
   */
  clearFilters(): void {
    this.transportListFilterInputControl.setValue(null);
    this.filters = {
      page: 1,
      limit: this.filters.limit || 10
    };
    this.loadTransportPodiums();
  }

  /**
   * Get items to display
   */
  getItemsToDisplay(): number {
    return Math.min(this.currentPage * this.pageSize, this.totalItems);
  }

  /**
   * Create new transport podium
   */
  onCreateTransportPodium(): void {
    this.isEditMode = false;
    this.selectedTransportPodium = null;
    this.commonService.resetForm(this.transportPodiumForm);
    
    // Reset autocomplete controls
    this.transportListInputControl.setValue('');
    this.podiumInputControl.setValue('');
    
    this.currentDialogRef = this.dialog.open(this.modalTemplate, {
      width: '900px',
      maxWidth: '95vw',
      disableClose: true,
      panelClass: 'custom-dialog-container'
    });

    this.currentDialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.loadTransportPodiums();
      }
    });
  }

  /**
   * View transport podium details
   */
  onViewTransportPodium(transportPodium: TransportPodium): void {
    const r = transportPodium as any;
    
    let htmlContent = `
      <div class="transport-podium-details">
        <div class="detail-row">
          <strong>ID:</strong> <span>${r.id || 'N/A'}</span>
        </div>
        <div class="detail-row">
          <strong>Transport List:</strong> 
          <span>${r.transportList ? this.displayTransportList(r.transportList) : (r.transportListId ? `List #${r.transportListId}` : 'N/A')}</span>
        </div>
        <div class="detail-row">
          <strong>Podium:</strong> 
          <span>${r.podium ? this.displayPodium(r.podium) : (r.podiumId ? `Podium ID: ${r.podiumId}` : 'N/A')}</span>
        </div>
        <div class="detail-row">
          <strong>Gross Weight (kg):</strong> 
          <span>${r.grossWeightKg != null ? r.grossWeightKg : 'N/A'}</span>
        </div>
        <div class="detail-row">
          <strong>Returned At:</strong> 
          <span>${r.returnedAt ? (new Date(r.returnedAt).toLocaleString()) : 'Not returned'}</span>
        </div>
        <div class="detail-row">
          <strong>Notes:</strong> 
          <span>${r.notes || 'N/A'}</span>
        </div>
      </div>
    `;

    Swal.fire({
      title: 'Transport Podium Details',
      html: htmlContent,
      icon: 'info',
      confirmButtonColor: '#556ee6',
      width: '600px'
    });
  }

  /**
   * Edit transport podium
   */
  onEditTransportPodium(transportPodium: TransportPodium): void {
    this.isEditMode = true;
    this.selectedTransportPodium = transportPodium;
    
    // Reset and populate form
    this.commonService.resetForm(this.transportPodiumForm);
    this.populateEditForm(transportPodium);
    
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
          this.loadTransportPodiums();
        }
      });
    }, 0);
  }

  /**
   * Populate the form with transport podium data
   */
  private populateEditForm(transportPodium: TransportPodium): void {
    const r = transportPodium as any;
    
    // Set basic fields (emitEvent: false to prevent triggering valueChanges)
    this.transportPodiumForm.patchValue({
      transportListId: r.transportListId || null,
      podiumId: r.podiumId || null,
      grossWeightKg: r.grossWeightKg || null,
      notes: r.notes || ''
    }, { emitEvent: false });

    // Set transport list
    if (r.transportList) {
      this.transportListInputControl.setValue(r.transportList, { emitEvent: false });
    } else if (r.transportListId) {
      const matchingTransportList = this.transportListOptions.find(tl => tl.id === r.transportListId);
      if (matchingTransportList) {
        this.transportListInputControl.setValue(matchingTransportList, { emitEvent: false });
      }
    }

    // Set podium
    if (r.podium) {
      this.podiumInputControl.setValue(r.podium, { emitEvent: false });
    } else if (r.podiumId) {
      const matchingPodium = this.podiumOptions.find(p => (p as any).id === r.podiumId);
      if (matchingPodium) {
        this.podiumInputControl.setValue(matchingPodium, { emitEvent: false });
      }
    }
  }

  /**
   * Submit form (create or update)
   */
  onSubmitForm(): void {
    if (this.transportPodiumForm.invalid) {
      this.notificationService.error('Please fill in all required fields correctly.');
      return;
    }

    this.isSubmitting = true;

    const formValue = this.transportPodiumForm.value;

    if (this.isEditMode && this.selectedTransportPodium) {
      // Update transport podium
      const transportPodiumId = (this.selectedTransportPodium as any).id;
      this.transportPodiumService.transportPodiumControllerUpdateV1$Response({
        id: transportPodiumId,
        body: formValue
      }).subscribe({
        next: (response) => {
          this.notificationService.success('Transport podium updated successfully!');
          this.currentDialogRef?.close(true);
          this.isSubmitting = false;
        },
        error: (error) => {
          console.error('Error updating transport podium:', error);
          const errorMessage = error.error?.message || 'Failed to update transport podium. Please try again.';
          this.notificationService.error(errorMessage);
          this.isSubmitting = false;
        }
      });
    } else {
      // Create transport podium
      this.transportPodiumService.transportPodiumControllerCreateV1$Response({
        body: formValue
      }).subscribe({
        next: (response) => {
          this.notificationService.success('Transport podium created successfully!');
          this.currentDialogRef?.close(true);
          this.isSubmitting = false;
        },
        error: (error) => {
          console.error('Error creating transport podium:', error);
          const errorMessage = error.error?.message || 'Failed to create transport podium. Please try again.';
          this.notificationService.error(errorMessage);
          this.isSubmitting = false;
        }
      });
    }
  }

  /**
   * Mark transport podium as returned
   */
  onMarkAsReturned(transportPodium: TransportPodium): void {
    Swal.fire({
      title: 'Mark as returned?',
      text: 'This will mark the podium as returned and update its state to Available.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#556ee6',
      cancelButtonColor: '#f46a6a',
      confirmButtonText: 'Yes, mark as returned!',
      cancelButtonText: 'Cancel'
    }).then((result) => {
      if (result.isConfirmed) {
        const transportPodiumId = (transportPodium as any).id;
        this.transportPodiumService.transportPodiumControllerMarkAsReturnedV1$Response({ id: transportPodiumId }).subscribe({
          next: () => {
            this.notificationService.success('Transport podium marked as returned successfully!');
            this.loadTransportPodiums();
          },
          error: (error) => {
            console.error('Error marking transport podium as returned:', error);
            const errorMessage = error.error?.message || 'Failed to mark transport podium as returned. Please try again.';
            this.notificationService.error(errorMessage);
          }
        });
      }
    });
  }

  /**
   * Delete transport podium
   */
  onDeleteTransportPodium(transportPodium: TransportPodium): void {
    Swal.fire({
      title: 'Are you sure?',
      text: 'This will remove the transport podium and mark it as returned. This action cannot be undone!',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#556ee6',
      cancelButtonColor: '#f46a6a',
      confirmButtonText: 'Yes, delete it!',
      cancelButtonText: 'Cancel'
    }).then((result) => {
      if (result.isConfirmed) {
        const transportPodiumId = (transportPodium as any).id;
        this.transportPodiumService.transportPodiumControllerRemoveV1$Response({ id: transportPodiumId }).subscribe({
          next: () => {
            this.notificationService.success('Transport podium deleted successfully!');
            this.loadTransportPodiums();
          },
          error: (error) => {
            console.error('Error deleting transport podium:', error);
            const errorMessage = error.error?.message || 'Failed to delete transport podium. Please try again.';
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
    return this.isEditMode ? 'Edit Transport Podium' : 'Create New Transport Podium';
  }

  /**
   * Get submit button text
   */
  getSubmitButtonText(): string {
    return this.isEditMode ? 'Update Transport Podium' : 'Create Transport Podium';
  }
}
