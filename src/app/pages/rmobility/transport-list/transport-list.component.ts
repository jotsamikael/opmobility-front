import { AfterViewInit, Component, OnInit, ViewChild, TemplateRef } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatSort, Sort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatStepper } from '@angular/material/stepper';
import { startWith, map, Observable, forkJoin } from 'rxjs';
import { Router } from '@angular/router';
import { GlobalFormBuilder } from 'src/app/core/globalFormBuilder';
import { NotificationService } from 'src/app/core/services/notification.service';
import Swal from 'sweetalert2';
import { GetTransportListResponse } from 'src/app/opmobilitybackend/models/get-transport-list-response';
import { GetExpoEventResponse } from 'src/app/opmobilitybackend/models/get-expo-event-response';
import { Podium, ProductResponse } from 'src/app/opmobilitybackend/models';
import { TransportListService, ExpoEventService, PodiumService, ProductService, TransportPodiumService, TransportItemService } from 'src/app/opmobilitybackend/services';

// Transport list filters interface
export interface TransportListFilters {
  page?: number;
  limit?: number;
  name?: string;
  eventId?: number;
  status?: 'Active' | 'Archived';
  createdBy?: number;
  orderBy?: string;
}

// Transport list status options
export const TRANSPORT_LIST_STATUSES = [
  { value: 'Active', label: 'Active' },
  { value: 'Archived', label: 'Archived' }
];

interface SelectedTransportPodium {
  podiumId: number;
  podiumLabel: string;
  grossWeightKg?: number | null;
  notes?: string;
}

interface SelectedTransportProduct {
  productId: number;
  productLabel: string;
  notes?: string;
}

@Component({
  selector: 'app-transport-list',
  templateUrl: './transport-list.component.html',
  styleUrls: ['./transport-list.component.scss']
})
export class TransportListComponent implements OnInit, AfterViewInit {
  breadCrumbItems: Array<{}>;
  
  // Expose Math to template
  Math = Math;
  
  // Table properties
  displayedColumns: string[] = ['id', 'name', 'event', 'status', 'versionNo', 'pdfUrl', 'createdAt', 'updatedAt', 'view', 'actions'];
  dataSource: MatTableDataSource<GetTransportListResponse> = new MatTableDataSource<GetTransportListResponse>([]);
 
  // Pagination properties
  totalItems = 0;
  currentPage = 1;
  pageSize = 10;
  pageSizeOptions = [5, 10, 25, 50];
  
  // Loading state
  isLoading = false;
  
  // Filters
  filters: TransportListFilters = {
    page: 1,
    limit: 10
  };
  
  // Search controls
  nameFilterControl = new FormControl('');
  statusFilterControl = new FormControl<'Active' | 'Archived' | null>(null);
  eventIdFilterControl = new FormControl<number | null>(null);
  createdByFilterControl = new FormControl<number | null>(null);
  
  // Options for dropdowns/autocomplete
  transportListStatuses = TRANSPORT_LIST_STATUSES;
  eventOptions: GetExpoEventResponse[] = [];
  podiumOptions: Podium[] = [];
  productOptions: ProductResponse[] = [];
  
  // Form controls for autocomplete
  eventInputControl = new FormControl<string | GetExpoEventResponse | null>(null);
  podiumInputControl = new FormControl<string | Podium | null>(null);
  productInputControl = new FormControl<string | ProductResponse | null>(null);
  podiumNotesControl = new FormControl<string>('');
  productNotesControl = new FormControl<string>('');
  podiumWeightControl = new FormControl<number | null>(null);
  
  // Autocomplete observables
  filteredEvents: Observable<GetExpoEventResponse[]>;
  filteredPodiums: Observable<Podium[]>;
  filteredProducts: Observable<ProductResponse[]>;
  
  private autocompletePanelOpen = false;

  // Computed properties for summary cards
  get totalPages(): number {
    return Math.ceil(this.totalItems / this.pageSize) || 1;
  }

  // Modal properties
  transportListForm: FormGroup;
  selectedTransportList: GetTransportListResponse | null = null;
  isSubmitting = false;
  isCreatingTransport = false;
  isSavingPodiums = false;
  isSavingProducts = false;

  currentStepperIndex = 0;
  createdTransportList: GetTransportListResponse | null = null;
  selectedPodiums: SelectedTransportPodium[] = [];
  selectedProducts: SelectedTransportProduct[] = [];
  isEditMode = false;
  selectedPdfFile: File | null = null;
  pdfFilePreview: string | null = null;
  currentPdfUrl: string | null = null;

  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;
  @ViewChild('modalTemplate') modalTemplate: TemplateRef<any>;

  private currentDialogRef: MatDialogRef<any> | null = null;

  constructor(
    private formBuilder: GlobalFormBuilder,
    private transportListService: TransportListService,
    private expoEventService: ExpoEventService,
    private podiumService: PodiumService,
    private productService: ProductService,
    private transportPodiumService: TransportPodiumService,
    private transportItemService: TransportItemService,
    private notificationService: NotificationService,
    private dialog: MatDialog,
    private router: Router
  ) {
    this.breadCrumbItems = [
      { label: 'RMobility' },
      { label: 'Transport List', active: true }
    ];

    // Initialize form
    this.transportListForm = this.formBuilder.transportListForm();

    // Setup autocomplete for events
    this.filteredEvents = this.eventInputControl.valueChanges.pipe(
      startWith(''),
      map(value => {
        if (typeof value === 'string') {
          return this.filterEvents(value);
        } else if (value) {
          return this.filterEvents(this.displayEvent(value));
        }
        return this.eventOptions.slice();
      })
    );

    this.filteredPodiums = this.podiumInputControl.valueChanges.pipe(
      startWith(''),
      map((value) => this.filterPodiums(value))
    );

    this.filteredProducts = this.productInputControl.valueChanges.pipe(
      startWith(''),
      map((value) => this.filterProducts(value))
    );
  }

  ngOnInit(): void {
    this.loadEvents();
    this.loadPodiums();
    this.loadProducts();
    this.loadTransportLists();
  }

  ngAfterViewInit(): void {
    if (this.dataSource) {
      this.dataSource.paginator = this.paginator;
      this.dataSource.sort = this.sort;
    }
  }

  /**
   * Load transport lists from API
   */
  loadTransportLists(): void {
    this.isLoading = true;

    const queryParams: any = {
      page: this.filters.page || 1,
      limit: this.filters.limit || 10
    };

    if (this.filters.name) {
      queryParams.name = this.filters.name;
    }
    if (this.filters.eventId) {
      queryParams.eventId = this.filters.eventId;
    }
    if (this.filters.status) {
      queryParams.status = this.filters.status;
    }
    if (this.filters.createdBy) {
      queryParams.createdBy = this.filters.createdBy;
    }
    if (this.filters.orderBy) {
      queryParams.orderBy = this.filters.orderBy;
    }

    this.transportListService.transportListControllerGetAllTransportListsV1$Response(queryParams).subscribe({
      next: (response) => {
        const responseBody = response.body as any;
        
        if (responseBody && responseBody.items) {
          // Paginated response
          this.dataSource.data = responseBody.items || [];
          this.totalItems = responseBody.meta?.totalItems || 0;
          this.currentPage = responseBody.meta?.currentPage || 1;
        } else if (Array.isArray(responseBody)) {
          // Direct array response
          this.dataSource.data = responseBody;
          this.totalItems = responseBody.length;
          this.currentPage = 1;
        } else {
          this.dataSource.data = [];
          this.totalItems = 0;
        }

        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading transport lists:', error);
        this.notificationService.error('Failed to load transport lists. Please try again.');
        this.isLoading = false;
      }
    });
  }

  /**
   * Load events for autocomplete
   */
  loadEvents(): void {
    this.expoEventService.expoEventControllerGetAllExpoEventsV1$Response({ page: 1, limit: 100 } as any).subscribe({
      next: (response) => {
        const responseBody = response.body as any;
        // ExpoEvent service returns paginated response
        if (responseBody && responseBody.items) {
          this.eventOptions = responseBody.items || [];
        } else if (Array.isArray(responseBody)) {
          this.eventOptions = responseBody;
        } else {
          this.eventOptions = [];
        }
      },
      error: (error) => {
        console.error('Error loading events:', error);
      }
    });
  }

  /**
   * Filter events for autocomplete
   */
  filterEvents(value: string): GetExpoEventResponse[] {
    const filterValue = value.toLowerCase();
    return this.eventOptions.filter(event => 
      event.name?.toLowerCase().includes(filterValue) ||
      event.place?.toLowerCase().includes(filterValue)
    );
  }

  /**
   * Display event in autocomplete
   */
  displayEvent(event: GetExpoEventResponse | null): string {
    if (!event) return '';
    return `${event.name || ''} - ${event.place || ''}`.trim();
  }

  loadPodiums(): void {
    this.podiumService.podiumControllerGetAllPodiumsV1$Response({ page: 1, limit: 1000 } as any).subscribe({
      next: (response) => {
        const responseBody = response.body as any;
        this.podiumOptions = responseBody?.items || responseBody || [];
      },
      error: () => {
        this.podiumOptions = [];
      }
    });
  }

  loadProducts(): void {
    this.productService.productControllerGetAllProductsV1$Response({ page: 1, limit: 1000 } as any).subscribe({
      next: (response) => {
        const responseBody = response.body as any;
        this.productOptions = responseBody?.items || responseBody || [];
      },
      error: () => {
        this.productOptions = [];
      }
    });
  }

  filterPodiums(value: string | Podium | null): Podium[] {
    if (!value || typeof value !== 'string') {
      return this.podiumOptions;
    }

    const filterValue = value.toLowerCase();
    return this.podiumOptions.filter((podium) => {
      const p = podium as any;
      return (p.ref || '').toLowerCase().includes(filterValue) || (p.name || '').toLowerCase().includes(filterValue);
    });
  }

  filterProducts(value: string | ProductResponse | null): ProductResponse[] {
    if (!value || typeof value !== 'string') {
      return this.productOptions;
    }

    const filterValue = value.toLowerCase();
    return this.productOptions.filter((product) => {
      return (product.ref || '').toLowerCase().includes(filterValue) || (product.name || '').toLowerCase().includes(filterValue);
    });
  }

  displayPodium(podium: Podium | null): string {
    if (!podium) return '';
    const p = podium as any;
    return `${p.ref || ''} - ${p.name || ''}`.trim();
  }

  displayProduct(product: ProductResponse | null): string {
    if (!product) return '';
    return `${product.ref || ''} - ${product.name || ''}`.trim();
  }

  addPodiumSelection(): void {
    const selectedPodium = this.podiumInputControl.value as Podium;
    const podiumId = (selectedPodium as any)?.id;

    if (!podiumId) {
      this.notificationService.error('Please select a podium.');
      return;
    }

    const exists = this.selectedPodiums.some((item) => item.podiumId === podiumId);
    if (exists) {
      this.notificationService.error('This podium is already selected.');
      return;
    }

    this.selectedPodiums.push({
      podiumId,
      podiumLabel: this.displayPodium(selectedPodium),
      grossWeightKg: this.podiumWeightControl.value,
      notes: this.podiumNotesControl.value || ''
    });

    this.podiumInputControl.setValue(null);
    this.podiumWeightControl.setValue(null);
    this.podiumNotesControl.setValue('');
  }

  removePodiumSelection(index: number): void {
    this.selectedPodiums.splice(index, 1);
  }

  addProductSelection(): void {
    const selectedProduct = this.productInputControl.value as ProductResponse;
    const productId = selectedProduct?.id;

    if (!productId) {
      this.notificationService.error('Please select a product.');
      return;
    }

    const exists = this.selectedProducts.some((item) => item.productId === productId);
    if (exists) {
      this.notificationService.error('This product is already selected.');
      return;
    }

    this.selectedProducts.push({
      productId,
      productLabel: this.displayProduct(selectedProduct),
      notes: this.productNotesControl.value || ''
    });

    this.productInputControl.setValue(null);
    this.productNotesControl.setValue('');
  }

  removeProductSelection(index: number): void {
    this.selectedProducts.splice(index, 1);
  }

  /**
   * Handle event selection
   */
  onEventSelected(event: any): void {
    const selectedEvent = event.option.value as GetExpoEventResponse;
    if (selectedEvent && (selectedEvent as any).id) {
      this.transportListForm.patchValue({
        eventId: (selectedEvent as any).id
      }, { emitEvent: false });
    }
  }

  onStepChange(index: number): void {
    this.currentStepperIndex = index;
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
   * Apply filters
   */
  applyFilters(): void {
    this.filters.page = 1;
    this.filters.name = this.nameFilterControl.value || undefined;
    this.filters.status = this.statusFilterControl.value || undefined;
    this.filters.eventId = this.eventIdFilterControl.value || undefined;
    this.filters.createdBy = this.createdByFilterControl.value || undefined;
    
    this.loadTransportLists();
  }

  /**
   * Clear filters
   */
  clearFilters(): void {
    this.nameFilterControl.setValue('');
    this.statusFilterControl.setValue(null);
    this.eventIdFilterControl.setValue(null);
    this.createdByFilterControl.setValue(null);
    
    this.filters = {
      page: 1,
      limit: this.pageSize
    };
    
    this.loadTransportLists();
  }

  /**
   * Handle page change
   */
  onPageChange(event: PageEvent): void {
    this.currentPage = event.pageIndex + 1;
    this.pageSize = event.pageSize;
    this.filters.page = this.currentPage;
    this.filters.limit = this.pageSize;
    this.loadTransportLists();
  }

  /**
   * Handle sort change
   */
  onSortChange(event: Sort): void {
    if (event.active && event.direction) {
      this.filters.orderBy = `${event.active}:${event.direction.toLowerCase()}`;
    } else {
      this.filters.orderBy = undefined;
    }
    this.loadTransportLists();
  }

  /**
   * Get items to display text for pagination
   */
  getItemsToDisplay(): number {
    return Math.min(this.currentPage * this.pageSize, this.totalItems);
  }

  /**
   * Format date
   */
  formatDate(dateString: string): string {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString();
  }

  /**
   * Get status badge class
   */
  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'Active':
        return 'bg-success';
      case 'Archived':
        return 'bg-secondary';
      default:
        return 'bg-secondary';
    }
  }

  /**
   * Get status label
   */
  getStatusLabel(status: string): string {
    return status || 'N/A';
  }

  /**
   * Display event info
   */
  displayEventInfo(transportList: GetTransportListResponse): string {
    // Event info would need to be loaded separately or included in response
    return `Event ID: ${transportList.eventId}`;
  }

  /**
   * Create new transport list
   */
  onCreateTransportList(): void {
    this.isEditMode = false;
    this.selectedTransportList = null;
    this.resetCreateWizardState();
    
    this.currentDialogRef = this.dialog.open(this.modalTemplate, {
      width: '980px',
      maxWidth: '95vw',
      disableClose: true
    });
  }

  /**
   * Edit transport list
   */
  onEditTransportList(transportList: GetTransportListResponse): void {
    this.isEditMode = true;
    this.selectedTransportList = transportList;
    this.selectedPdfFile = null;
    this.pdfFilePreview = null;
    this.currentPdfUrl = transportList.pdfUrl || null;

    // Find event
    const event = this.eventOptions.find(e => (e as any).id === transportList.eventId);
    if (event) {
      this.eventInputControl.setValue(event, { emitEvent: false });
    }

    this.transportListForm.patchValue({
      name: transportList.name,
      eventId: transportList.eventId
    }, { emitEvent: false });

    setTimeout(() => {
      this.currentDialogRef = this.dialog.open(this.modalTemplate, {
        width: '800px',
        maxWidth: '90vw',
        disableClose: true
      });
    }, 0);
  }

  /**
   * Delete transport list
   */
  onDeleteTransportList(transportList: GetTransportListResponse): void {
    Swal.fire({
      title: 'Are you sure?',
      text: 'You won\'t be able to revert this!',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#556ee6',
      cancelButtonColor: '#74788d',
      confirmButtonText: 'Yes, delete it!'
    }).then((result) => {
      if (result.isConfirmed) {
        this.transportListService.transportListControllerRemoveV1$Response({
          id: (transportList as any).id
        } as any).subscribe({
          next: () => {
            Swal.fire('Deleted!', 'Transport list has been deleted.', 'success');
            this.loadTransportLists();
          },
          error: (error) => {
            console.error('Error deleting transport list:', error);
            Swal.fire('Error!', 'Failed to delete transport list. Please try again.', 'error');
          }
        });
      }
    });
  }

  /**
   * Handle PDF file selection
   */
  onPdfFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        this.notificationService.error('Please select a PDF file.');
        return;
      }
      if (file.size > 10 * 1024 * 1024) { // 10MB
        this.notificationService.error('File size must be less than 10MB.');
        return;
      }
      
      this.selectedPdfFile = file;
      this.pdfFilePreview = null; // PDFs can't be previewed as images
    }
  }

  /**
   * Remove PDF file
   */
  removePdfFile(): void {
    this.selectedPdfFile = null;
    this.pdfFilePreview = null;
  }

  /**
   * Close modal
   */
  closeModal(): void {
    if (this.currentDialogRef) {
      this.currentDialogRef.close();
      this.currentDialogRef = null;
    }
    this.resetCreateWizardState();
    this.isSubmitting = false;
    this.isCreatingTransport = false;
    this.isSavingPodiums = false;
    this.isSavingProducts = false;
    this.isEditMode = false;
    this.selectedTransportList = null;
  }

  resetCreateWizardState(): void {
    this.transportListForm.reset();
    this.eventInputControl.setValue('');
    this.selectedPdfFile = null;
    this.pdfFilePreview = null;
    this.currentPdfUrl = null;
    this.createdTransportList = null;
    this.selectedPodiums = [];
    this.selectedProducts = [];
    this.podiumInputControl.setValue(null);
    this.productInputControl.setValue(null);
    this.podiumNotesControl.setValue('');
    this.productNotesControl.setValue('');
    this.podiumWeightControl.setValue(null);
    this.currentStepperIndex = 0;
  }

  /**
   * Get modal title
   */
  getModalTitle(): string {
    return this.isEditMode ? 'Edit Transport List' : 'Create New Transport List';
  }

  /**
   * Get submit button text
   */
  getSubmitButtonText(): string {
    return this.isEditMode ? 'Update Transport List' : 'Create Transport List';
  }

  submitTransportStep(stepper: MatStepper): void {
    const eventControlValue = this.eventInputControl.value;

    if (!this.transportListForm.get('eventId')?.value) {
      if (eventControlValue && typeof eventControlValue !== 'string' && (eventControlValue as any).id) {
        this.transportListForm.patchValue({ eventId: (eventControlValue as any).id }, { emitEvent: false });
      }

      if (eventControlValue && typeof eventControlValue === 'string') {
        const matchingEvent = this.eventOptions.find((event) => this.displayEvent(event).toLowerCase() === eventControlValue.toLowerCase());
        if (matchingEvent && (matchingEvent as any).id) {
          this.transportListForm.patchValue({ eventId: (matchingEvent as any).id }, { emitEvent: false });
          this.eventInputControl.setValue(matchingEvent, { emitEvent: false });
        }
      }
    }

    if (this.transportListForm.invalid) {
      this.transportListForm.markAllAsTouched();
      this.notificationService.error('Please fill all required transport information.');
      return;
    }

    if (!this.selectedPdfFile) {
      this.notificationService.error('Please select a PDF file.');
      return;
    }

    this.isCreatingTransport = true;

    const formValue = this.transportListForm.value;
    const formData = new FormData();
    formData.append('name', formValue.name);
    formData.append('eventId', formValue.eventId.toString());
    formData.append('pdfFile', this.selectedPdfFile);

    this.transportListService.transportListControllerCreateV1$Response({
      body: formData as any
    } as any).subscribe({
      next: (response) => {
        this.createdTransportList = response.body;
        this.notificationService.success('Transport created. You can now add podiums.');
        this.isCreatingTransport = false;
        stepper.next();
      },
      error: (error) => {
        console.error('Error creating transport list:', error);
        this.notificationService.error('Failed to create transport list. Please try again.');
        this.isCreatingTransport = false;
      }
    });
  }

  submitPodiumsStep(stepper: MatStepper): void {
    if (!this.createdTransportList?.id) {
      this.notificationService.error('Transport list must be created first.');
      return;
    }

    if (!this.selectedPodiums.length) {
      stepper.next();
      return;
    }

    this.isSavingPodiums = true;

    const requests = this.selectedPodiums.map((podium) =>
      this.transportPodiumService.transportPodiumControllerCreateV1$Response({
        body: {
          transportListId: this.createdTransportList!.id,
          podiumId: podium.podiumId,
          grossWeightKg: podium.grossWeightKg ?? undefined,
          notes: podium.notes || undefined
        } as any
      } as any)
    );

    forkJoin(requests).subscribe({
      next: () => {
        this.notificationService.success('Podiums added successfully.');
        this.isSavingPodiums = false;
        stepper.next();
      },
      error: (error) => {
        console.error('Error adding podiums:', error);
        this.notificationService.error('Failed to add podiums. Please try again.');
        this.isSavingPodiums = false;
      }
    });
  }

  submitProductsStep(): void {
    if (!this.createdTransportList?.id) {
      this.notificationService.error('Transport list must be created first.');
      return;
    }

    if (!this.selectedProducts.length) {
      this.notificationService.success('Transport list created successfully.');
      this.closeModal();
      this.loadTransportLists();
      return;
    }

    this.isSavingProducts = true;

    const requests = this.selectedProducts.map((product) =>
      this.transportItemService.transportItemControllerCreateV1$Response({
        body: {
          transportListId: this.createdTransportList!.id,
          productId: product.productId,
          notes: product.notes || undefined
        } as any
      } as any)
    );

    forkJoin(requests).subscribe({
      next: () => {
        this.notificationService.success('Products added and transport created successfully.');
        this.isSavingProducts = false;
        this.closeModal();
        this.loadTransportLists();
      },
      error: (error) => {
        console.error('Error adding products:', error);
        this.notificationService.error('Failed to add products. Please try again.');
        this.isSavingProducts = false;
      }
    });
  }

  onViewTransportDetails(transportList: GetTransportListResponse): void {
    if (!transportList?.id) {
      return;
    }
    this.router.navigate(['/backend/transport-list', transportList.id]);
  }

  /**
   * Submit form
   */
  onSubmitForm(): void {
    if (this.transportListForm.invalid) {
      this.transportListForm.markAllAsTouched();
      return;
    }

    // For create, PDF file is required
    if (!this.isEditMode && !this.selectedPdfFile) {
      this.notificationService.error('Please select a PDF file.');
      return;
    }

    this.isSubmitting = true;

    const formValue = this.transportListForm.value;

    if (this.isEditMode && this.selectedTransportList) {
      // Update - create FormData for file upload if PDF is selected
      const formData = new FormData();
      formData.append('name', formValue.name);
      
      // Include eventId if changed
      if (formValue.eventId !== this.selectedTransportList.eventId) {
        formData.append('eventId', formValue.eventId.toString());
      }
      
      if (this.selectedPdfFile) {
        formData.append('pdfFile', this.selectedPdfFile);
      }

      this.transportListService.transportListControllerUpdateV1$Response({
        id: (this.selectedTransportList as any).id,
        body: formData as any
      } as any).subscribe({
        next: () => {
          this.notificationService.success('Transport list updated successfully!');
          this.closeModal();
          this.loadTransportLists();
          this.isSubmitting = false;
        },
        error: (error) => {
          console.error('Error updating transport list:', error);
          this.notificationService.error('Failed to update transport list. Please try again.');
          this.isSubmitting = false;
        }
      });
    } else {
      // Create - create FormData for file upload
      const formData = new FormData();
      formData.append('name', formValue.name);
      formData.append('eventId', formValue.eventId.toString());
      
      if (this.selectedPdfFile) {
        formData.append('pdfFile', this.selectedPdfFile);
      }

      this.transportListService.transportListControllerCreateV1$Response({
        body: formData as any
      } as any).subscribe({
        next: () => {
          this.notificationService.success('Transport list created successfully!');
          this.closeModal();
          this.loadTransportLists();
          this.isSubmitting = false;
        },
        error: (error) => {
          console.error('Error creating transport list:', error);
          this.notificationService.error('Failed to create transport list. Please try again.');
          this.isSubmitting = false;
        }
      });
    }
  }
}
