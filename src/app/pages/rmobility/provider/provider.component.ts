import { AfterViewInit, Component, OnInit, ViewChild, TemplateRef } from '@angular/core';
import { FormControl, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatSort, Sort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { GlobalFormBuilder } from 'src/app/core/globalFormBuilder';
import { NotificationService } from 'src/app/core/services/notification.service';
import { CommonService } from 'src/app/core/services/common.service';
import Swal from 'sweetalert2';
import { GetProviderResponse } from 'src/app/opmobilitybackend/models';
import { ProviderService } from 'src/app/opmobilitybackend/services';

// Provider filters interface
export interface ProviderFilters {
  page?: number;
  limit?: number;
  name?: string;
  type?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  remarks?: string;
  active?: boolean;
}

// Provider type options
export const PROVIDER_TYPES = [
  { value: 'MANUFACTURER', label: 'Manufacturer' },
  { value: 'REPAIRER', label: 'Repairer' },
  { value: 'CARRIER', label: 'Carrier' }
];

@Component({
  selector: 'app-provider',
  templateUrl: './provider.component.html',
  styleUrls: ['./provider.component.scss']
})
export class ProviderComponent implements OnInit, AfterViewInit {
  breadCrumbItems: Array<{}>;
  
  // Table properties
  displayedColumns: string[] = ['name', 'type', 'contactName', 'email', 'phone', 'active', 'actions'];
  dataSource: MatTableDataSource<GetProviderResponse> = new MatTableDataSource<GetProviderResponse>([]);
 
  // Pagination properties
  totalItems = 0;
  currentPage = 1;
  pageSize = 10;
  pageSizeOptions = [5, 10, 25, 50];
  
  // Loading state
  isLoading = false;
  
  // Filters
  filters: ProviderFilters = {
    page: 1,
    limit: 10
  };
  
  // Search controls
  nameSearchControl = new FormControl('');
  typeFilterControl = new FormControl<string | null>(null);
  contactNameSearchControl = new FormControl('');
  emailSearchControl = new FormControl('');
  phoneSearchControl = new FormControl('');
  activeFilterControl = new FormControl<boolean | null>(null);

  // Provider type options
  providerTypes = PROVIDER_TYPES;

  // Computed properties for summary cards
  get totalPages(): number {
    return Math.ceil(this.totalItems / this.pageSize) || 1;
  }

  // Modal properties
  providerForm: FormGroup;
  selectedProvider: GetProviderResponse | null = null;
  isSubmitting = false;
  isEditMode = false;

  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;
  @ViewChild('modalTemplate') modalTemplate: TemplateRef<any>;

  private currentDialogRef: MatDialogRef<any> | null = null;

  constructor(
    private providerService: ProviderService,
    private globalFormBuilder: GlobalFormBuilder,
    private notificationService: NotificationService,
    private dialog: MatDialog,
    private fb: FormBuilder,
    private commonService: CommonService
  ) {
    this.providerForm = this.globalFormBuilder.providerForm();
  }

  ngOnInit(): void {
    this.breadCrumbItems = [{ label: 'Tables' }, { label: 'Provider Management', active: true }];
    this.providerForm = this.globalFormBuilder.providerForm();
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
   * Load providers from API
   */
  loadProviders(): void {
    this.isLoading = true;
    
    const queryParams: any = {
      page: this.filters.page || 1,
      limit: this.filters.limit || 10
    };
    
    if (this.filters.name) {
      queryParams.name = this.filters.name;
    }
    
    if (this.filters.type) {
      queryParams.type = this.filters.type;
    }
    
    if (this.filters.contactName) {
      queryParams.contactName = this.filters.contactName;
    }
    
    if (this.filters.email) {
      queryParams.email = this.filters.email;
    }
    
    if (this.filters.phone) {
      queryParams.phone = this.filters.phone;
    }
    
    if (this.filters.active !== undefined && this.filters.active !== null) {
      queryParams.active = this.filters.active;
    }
    
    this.providerService.providerControllerGetAllProvidersV1(queryParams).subscribe({
      next: (response: any) => {
        console.log('Provider data:', response);
        
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
        console.error('Error loading providers:', error);
        this.notificationService.error('Failed to load providers data. Please try again.');
        this.isLoading = false;
      }
    });
  }

  /**
   * Handle pagination changes
   */
  onPageChange(event: PageEvent): void {
    this.filters.page = event.pageIndex + 1;
    this.filters.limit = event.pageSize;
    this.currentPage = event.pageIndex + 1;
    this.pageSize = event.pageSize;
    this.loadProviders();
  }

  /**
   * Handle sorting changes
   */
  onSortChange(event: Sort): void {
    // Providers API supports sorting, but we can reload if needed
    if (event.direction) {
      this.loadProviders();
    }
  }

  /**
   * Apply filters
   */
  applyFilters(): void {
    this.filters.name = this.nameSearchControl.value || undefined;
    this.filters.type = this.typeFilterControl.value || undefined;
    this.filters.contactName = this.contactNameSearchControl.value || undefined;
    this.filters.email = this.emailSearchControl.value || undefined;
    this.filters.phone = this.phoneSearchControl.value || undefined;
    this.filters.active = this.activeFilterControl.value !== null ? this.activeFilterControl.value : undefined;
    this.filters.page = 1; // Reset to first page
    this.loadProviders();
  }

  /**
   * Clear all filters
   */
  clearFilters(): void {
    this.nameSearchControl.setValue('');
    this.typeFilterControl.setValue(null);
    this.contactNameSearchControl.setValue('');
    this.emailSearchControl.setValue('');
    this.phoneSearchControl.setValue('');
    this.activeFilterControl.setValue(null);
    
    this.filters = {
      page: 1,
      limit: this.pageSize
    };
    
    this.loadProviders();
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
      this.loadProviders();
    });
    
    // Contact name search debouncing
    this.contactNameSearchControl.valueChanges.pipe(
      debounceTime(500),
      distinctUntilChanged()
    ).subscribe(value => {
      this.filters.contactName = value || undefined;
      this.filters.page = 1; // Reset to first page
      this.loadProviders();
    });
    
    // Email search debouncing
    this.emailSearchControl.valueChanges.pipe(
      debounceTime(500),
      distinctUntilChanged()
    ).subscribe(value => {
      this.filters.email = value || undefined;
      this.filters.page = 1; // Reset to first page
      this.loadProviders();
    });
    
    // Phone search debouncing
    this.phoneSearchControl.valueChanges.pipe(
      debounceTime(500),
      distinctUntilChanged()
    ).subscribe(value => {
      this.filters.phone = value || undefined;
      this.filters.page = 1; // Reset to first page
      this.loadProviders();
    });
  }

  /**
   * Get provider type label
   */
  getProviderTypeLabel(type: string): string {
    const providerType = this.providerTypes.find(pt => pt.value === type);
    return providerType ? providerType.label : type;
  }

  /**
   * Open create modal
   */
  onCreateProvider(): void {
    this.isEditMode = false;
    this.selectedProvider = null;
    this.commonService.resetForm(this.providerForm);
    
    this.currentDialogRef = this.dialog.open(this.modalTemplate, {
      width: '700px',
      disableClose: true,
      panelClass: 'custom-dialog-container'
    });

    this.currentDialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.loadProviders();
      }
    });
  }

  /**
   * Open edit modal
   */
  onEditProvider(provider: GetProviderResponse): void {
    this.isEditMode = true;
    this.selectedProvider = provider;
    this.populateEditForm(provider);
    
    this.currentDialogRef = this.dialog.open(this.modalTemplate, {
      width: '700px',
      disableClose: true,
      panelClass: 'custom-dialog-container'
    });

    this.currentDialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.loadProviders();
      }
    });
  }

  /**
   * Populate the form with provider data
   */
  private populateEditForm(provider: GetProviderResponse): void {
    this.providerForm.patchValue({
      name: provider.name,
      type: provider.type,
      contactName: provider.contactName || '',
      email: provider.email || '',
      phone: provider.phone || '',
      address: provider.address || '',
      remarks: provider.remarks || ''
    });
  }

  /**
   * Submit the form (create or update)
   */
  onSubmitForm(): void {
    if (this.providerForm.invalid) {
      return;
    }

    this.isSubmitting = true;
    this.commonService.disableForm(this.providerForm);
    
    const formData: any = {
      name: this.providerForm.value.name,
      type: this.providerForm.value.type
    };
    
    if (this.providerForm.value.contactName) {
      formData.contactName = this.providerForm.value.contactName;
    }
    
    if (this.providerForm.value.email) {
      formData.email = this.providerForm.value.email;
    }
    
    if (this.providerForm.value.phone) {
      formData.phone = this.providerForm.value.phone;
    }
    
    if (this.providerForm.value.address) {
      formData.address = this.providerForm.value.address;
    }
    
    if (this.providerForm.value.remarks) {
      formData.remarks = this.providerForm.value.remarks;
    }

    if (this.isEditMode && this.selectedProvider) {
      // Update existing provider
      this.providerService.providerControllerUpdateV1({
        id: this.selectedProvider.id,
        body: formData
      }).subscribe({
        next: (response) => {
          console.log("update", response);
          this.notificationService.success('Provider updated successfully!');
          this.isSubmitting = false;
          this.commonService.enableForm(this.providerForm);
          
          if (this.currentDialogRef) {
            this.currentDialogRef.close(true);
          }
        },
        error: (error) => {
          console.error('Error updating provider:', error);
          this.notificationService.error('Failed to update provider. Please try again.');
          this.isSubmitting = false;
          this.commonService.enableForm(this.providerForm);
        }
      });
    } else {
      // Create new provider - Note: Create endpoint uses multipart/form-data
      // The request-builder will convert the object to FormData automatically
      this.providerService.providerControllerCreateV1({
        body: formData
      }).subscribe({
        next: (response) => {
          this.notificationService.success('Provider created successfully!');
          this.isSubmitting = false;
          this.commonService.enableForm(this.providerForm);
          
          if (this.currentDialogRef) {
            this.currentDialogRef.close(true);
          }
        },
        error: (error) => {
          console.error('Error creating provider:', error);
          this.notificationService.error('Failed to create provider. Please try again.');
          this.isSubmitting = false;
          this.commonService.enableForm(this.providerForm);
        }
      });
    }
  }

  /**
   * Get modal title based on mode
   */
  getModalTitle(): string {
    return this.isEditMode ? 'Edit Provider' : 'Create New Provider';
  }

  /**
   * Get submit button text
   */
  getSubmitButtonText(): string {
    return this.isEditMode ? 'Update Provider' : 'Create Provider';
  }

  /**
   * View provider details
   */
  onViewProvider(provider: GetProviderResponse): void {
    Swal.fire({
      title: provider.name,
      html: `
        <div class="text-start">
          <p><strong>Type:</strong> ${this.getProviderTypeLabel(provider.type)}</p>
          <p><strong>Contact Name:</strong> ${provider.contactName || 'N/A'}</p>
          <p><strong>Email:</strong> ${provider.email || 'N/A'}</p>
          <p><strong>Phone:</strong> ${provider.phone || 'N/A'}</p>
          <p><strong>Address:</strong> ${provider.address || 'N/A'}</p>
          <p><strong>Remarks:</strong> ${provider.remarks || 'N/A'}</p>
          <p><strong>Active:</strong> ${provider.active ? 'Yes' : 'No'}</p>
          <p><strong>Provider ID:</strong> ${provider.id}</p>
        </div>
      `,
      icon: 'info',
      confirmButtonColor: '#556ee6',
      confirmButtonText: 'Close'
    });
  }

  /**
   * Delete provider
   */
  onDeleteProvider(provider: GetProviderResponse): void {
    Swal.fire({
      title: 'Are you sure?',
      text: `Do you want to delete "${provider.name}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Yes, delete it!',
      cancelButtonText: 'Cancel'
    }).then((result) => {
      if (result.isConfirmed) {
        this.providerService.providerControllerRemoveV1({
          id: provider.id
        }).subscribe({
          next: () => {
            this.notificationService.success('Provider deleted successfully!');
            this.loadProviders();
          },
          error: (error) => {
            console.error('Error deleting provider:', error);
            this.notificationService.error('Failed to delete provider. Please try again.');
          }
        });
      }
    });
  }
}
