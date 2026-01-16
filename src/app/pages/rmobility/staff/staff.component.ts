import { AfterViewInit, Component, OnInit, ViewChild, TemplateRef } from '@angular/core';
import { FormControl, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatSort, Sort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { MatDialog, MatDialogConfig, MatDialogRef } from '@angular/material/dialog';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { GlobalFormBuilder } from 'src/app/core/globalFormBuilder';
import { NotificationService } from 'src/app/core/services/notification.service';
import { CommonService } from 'src/app/core/services/common.service';
import Swal from 'sweetalert2';
import { UserResponseDto } from 'src/app/opmobilitybackend/models';
import { RoleService, UsersService } from 'src/app/opmobilitybackend/services';

// Update the StaffFilters interface to match the API types
export interface StaffFilters {
  page?: number;
  limit?: number;
  email?: string;
  phone?: string;
  createdDate?: string;
  orderBy?: 'createdAt:asc' | 'createdAt:desc' | 'deliveryDate:asc' | 'deliveryDate:desc' | 'pricePerKg:asc' | 'pricePerKg:desc';
}

@Component({
  selector: 'app-staff',
  templateUrl: './staff.component.html',
  styleUrls: ['./staff.component.scss']
})
export class StaffComponent implements OnInit, AfterViewInit {
  breadCrumbItems: Array<{}>;
  // Table properties
  displayedColumns: string[] = ['profile', 'name', 'phone', 'role', 'status', 'createdAt', 'actions'];
  dataSource: MatTableDataSource<UserResponseDto> = new MatTableDataSource<UserResponseDto>([]);
 
   // Pagination properties
   totalItems = 0;
   currentPage = 1;
   pageSize = 10;
   pageSizeOptions = [5, 10, 25, 50];
   
  // Loading state
  isLoading = false;
  
  // Filters
  filters: StaffFilters = {
    page: 1,
    limit: 10,
    orderBy: 'createdAt:desc' as const
  };
  
  // Search controls
  emailSearchControl = new FormControl('');
  phoneSearchControl = new FormControl('');
  createdDateControl = new FormControl<Date | null>(null);
  
  // Filter controls
  roleFilter = new FormControl<string | null>(null);
  
  // Role options (you can fetch this from your backend)
  roleOptions = [];

  // Country codes for phone number
  countryCodes = [
    { code: '+1', name: 'US/CA', flag: '🇺🇸' },
    { code: '+44', name: 'UK', flag: '🇬🇧' },
    { code: '+33', name: 'France', flag: '🇫🇷' },
    { code: '+49', name: 'Germany', flag: '🇩🇪' },
    { code: '+39', name: 'Italy', flag: '🇮🇹' },
    { code: '+34', name: 'Spain', flag: '🇪🇸' },
    { code: '+31', name: 'Netherlands', flag: '🇳🇱' },
    { code: '+32', name: 'Belgium', flag: '🇧🇪' },
    { code: '+41', name: 'Switzerland', flag: '🇨🇭' },
    { code: '+43', name: 'Austria', flag: '🇦🇹' },
    { code: '+45', name: 'Denmark', flag: '🇩🇰' },
    { code: '+46', name: 'Sweden', flag: '🇸🇪' },
    { code: '+47', name: 'Norway', flag: '🇳🇴' },
    { code: '+358', name: 'Finland', flag: '🇫🇮' },
    { code: '+351', name: 'Portugal', flag: '🇵🇹' },
    { code: '+353', name: 'Ireland', flag: '🇮🇪' },
    { code: '+48', name: 'Poland', flag: '🇵🇱' },
    { code: '+420', name: 'Czech Republic', flag: '🇨🇿' },
    { code: '+36', name: 'Hungary', flag: '🇭🇺' },
    { code: '+40', name: 'Romania', flag: '🇷🇴' },
    { code: '+7', name: 'Russia', flag: '🇷🇺' },
    { code: '+90', name: 'Turkey', flag: '🇹🇷' },
    { code: '+971', name: 'UAE', flag: '🇦🇪' },
    { code: '+966', name: 'Saudi Arabia', flag: '🇸🇦' },
    { code: '+20', name: 'Egypt', flag: '🇪🇬' },
    { code: '+27', name: 'South Africa', flag: '🇿🇦' },
    { code: '+91', name: 'India', flag: '🇮🇳' },
    { code: '+86', name: 'China', flag: '🇨🇳' },
    { code: '+81', name: 'Japan', flag: '🇯🇵' },
    { code: '+82', name: 'South Korea', flag: '🇰🇷' },
    { code: '+65', name: 'Singapore', flag: '🇸🇬' },
    { code: '+60', name: 'Malaysia', flag: '🇲🇾' },
    { code: '+61', name: 'Australia', flag: '🇦🇺' },
    { code: '+64', name: 'New Zealand', flag: '🇳🇿' },
    { code: '+55', name: 'Brazil', flag: '🇧🇷' },
    { code: '+52', name: 'Mexico', flag: '🇲🇽' },
    { code: '+54', name: 'Argentina', flag: '🇦🇷' },
    { code: '+56', name: 'Chile', flag: '🇨🇱' },
    { code: '+57', name: 'Colombia', flag: '🇨🇴' }
  ];

  // Computed properties for summary cards
  get activeStaffCount(): number {
    return this.dataSource.data.filter(s => !s.isDeactivated).length;
  }

  get inactiveStaffCount(): number {
    return this.dataSource.data.filter(s => s.isDeactivated).length;
  }

  get totalPages(): number {
    return Math.ceil(this.totalItems / this.pageSize) || 1;
  }

  // Modal properties
  staffForm: FormGroup;
  selectedUser: UserResponseDto | null = null;
  isSubmitting = false;
  isEditMode = false;
  selectedProfilePicture: File | null = null;
  profilePicturePreview: string | null = null;

  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;
  @ViewChild('modalTemplate') modalTemplate: TemplateRef<any>;

  private currentDialogRef: MatDialogRef<any> | null = null;

 constructor(
   private userService: UsersService,
   private userRoleService: RoleService,
   private globalFormBuilder: GlobalFormBuilder, 
     private notificationService: NotificationService,
     private dialog: MatDialog,
     private fb: FormBuilder,
     private commonService: CommonService
 ){
  this.staffForm = this.globalFormBuilder.staffForm()

 }



  ngOnInit(): void {
    this.breadCrumbItems = [{ label: 'Tables' }, { label: 'Staff Management', active: true }];
  this.staffForm = this.globalFormBuilder.staffForm()

 // Set up search debouncing
 this.setupSearchDebouncing();
    
 // Load initial data
 this.loadStaff();

 //load user roles
 this.loadUserRoles()
  }

  ngAfterViewInit() {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();

    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

 

  /**
   * Load staff data from API
   */
  loadStaff(): void {
    this.isLoading = true;
    
    // Build query parameters
    const queryParams: any = {
      page: this.filters.page || 1,
      limit: this.filters.limit || 10,
    };
    
    if (this.filters.email) {
      queryParams.email = this.filters.email;
    }
    
    if (this.filters.phone) {
      queryParams.phone = this.filters.phone;
    }
    
    if (this.filters.createdDate) {
      queryParams.createdDate = this.filters.createdDate;
    }
    
    if (this.filters.orderBy) {
      queryParams.orderBy = this.filters.orderBy;
    }
    
    this.userService.userControllerGetAllOperatorsV1(queryParams).subscribe({
      next: (response: any) => {
        console.log('Staff data:', response);
        
        // Handle the actual response structure: {items: Array, meta: Object}
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
        console.error('Error loading staff:', error);
        this.notificationService.error('Failed to load staff data. Please try again.');
        this.isLoading = false;
      }
    });
  }

    /**
   * Load user roles data from API
   */

  loadUserRoles(): void {
    const requestParams = {
      page: 1,
      limit: 100 as number,
      code: ''
    }
    this.userRoleService.roleControllerGetAllRolesV1(requestParams).subscribe({
      next: (response: any) => {
        console.log("user roles", response.items);
        // Filter out USER role - only show staff roles
        const excludedRoles = ['USER'];
        this.roleOptions = response.items.filter((role: any) => 
          !excludedRoles.includes(role.code.toUpperCase())
        );
        console.log(this.roleOptions)
      },
      error: (error) => {
        console.error('Error loading user roles:', error);
        this.notificationService.error('Failed to load user roles. Please try again.');
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
    this.loadStaff();
  }

  /**
   * Handle sorting changes
   */
  onSortChange(event: Sort): void {
    if (event.direction) {
      // Map column names to API sort fields
      let sortField = 'createdAt';
      if (event.active === 'firstName' || event.active === 'name') {
        sortField = 'createdAt'; // API doesn't support firstName sorting, use createdAt
      } else if (event.active === 'createdAt') {
        sortField = 'createdAt';
      }
      
      this.filters.orderBy = `${sortField}:${event.direction}` as 'createdAt:asc' | 'createdAt:desc';
    } else {
      this.filters.orderBy = 'createdAt:desc';
    }
    this.loadStaff();
  }

  /**
   * Apply filters
   */
  applyFilters(): void {
    this.filters.email = this.emailSearchControl.value || undefined;
    this.filters.phone = this.phoneSearchControl.value || undefined;
    
    // Format date to ISO string if provided
    if (this.createdDateControl.value) {
      const date = this.createdDateControl.value;
      // Format as YYYY-MM-DD
      const isoDate = new Date(date).toISOString().split('T')[0];
      this.filters.createdDate = isoDate;
    } else {
      this.filters.createdDate = undefined;
    }
    
    this.filters.page = 1; // Reset to first page
    this.loadStaff();
  }

  /**
   * Clear all filters
   */
  clearFilters(): void {
    this.emailSearchControl.setValue('');
    this.phoneSearchControl.setValue('');
    this.createdDateControl.setValue(null);
    this.roleFilter.setValue(null);
    
    this.filters = {
      page: 1,
      limit: this.pageSize,
      orderBy: 'createdAt:desc' as const
    };
    
    this.loadStaff();
  }


  /**
   * Format date for display
   */
  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }



    /**
   * Set up search input debouncing
   */
    private setupSearchDebouncing(): void {
      // Email search debouncing
      this.emailSearchControl.valueChanges.pipe(
        debounceTime(500),
        distinctUntilChanged()
      ).subscribe(value => {
        this.filters.email = value || undefined;
        this.filters.page = 1; // Reset to first page
        this.loadStaff();
      });
  
      // Phone search debouncing
      this.phoneSearchControl.valueChanges.pipe(
        debounceTime(500),
        distinctUntilChanged()
      ).subscribe(value => {
        this.filters.phone = value || undefined;
        this.filters.page = 1; // Reset to first page
        this.loadStaff();
      });
      
      // Date filter changes
      this.createdDateControl.valueChanges.pipe(
        debounceTime(300),
        distinctUntilChanged()
      ).subscribe(value => {
        if (value) {
          const isoDate = new Date(value).toISOString().split('T')[0];
          this.filters.createdDate = isoDate;
        } else {
          this.filters.createdDate = undefined;
        }
        this.filters.page = 1;
        this.loadStaff();
      });
    }

     /**
   * Open create modal
   */
  onCreateStaff(): void {
    this.isEditMode = false;
    this.selectedUser = null;
    this.selectedProfilePicture = null;
    this.profilePicturePreview = null;
    this.commonService.resetForm(this.staffForm)
    
    this.currentDialogRef = this.dialog.open(this.modalTemplate, {
      width: '700px',
      maxWidth: '95vw',
      disableClose: true,
      panelClass: 'staff-modal',
      data: { mode: 'create' }
    });

    this.currentDialogRef.afterClosed().subscribe(result => {
      if (result) {
        console.log('Refresh the table')
        this.loadStaff(); 
      }
      this.selectedProfilePicture = null;
      this.profilePicturePreview = null;
      this.currentDialogRef = null;
    });
  }



  /**
   * Open edit modal
   */
  onEditStaff(user: UserResponseDto): void {
    this.isEditMode = true;
    this.selectedUser = user;
    this.selectedProfilePicture = null;
    this.profilePicturePreview = user.profilePictureUrl || null;
    this.populateEditForm(user);
    
    this.currentDialogRef = this.dialog.open(this.modalTemplate, {
      width: '700px',
      maxWidth: '95vw',
      disableClose: true,
      panelClass: 'staff-modal',
      data: { mode: 'edit', user }
    });

    this.currentDialogRef.afterClosed().subscribe(result => {
      if (result) {
        console.log('Refresh the table')
        this.loadStaff(); 
      }
      this.selectedProfilePicture = null;
      this.profilePicturePreview = null;
      this.currentDialogRef = null;
    });
  }





/**
 * Populate the form with user data
 */
private populateEditForm(user: UserResponseDto): void {
  // Extract country code and phone number from existing phone
  let countryCode = '+1'; // Default
  let phoneNumber = user.phone || '';
  
  if (user.phone) {
    // Try to extract country code from phone number
    const matchedCountry = this.countryCodes.find(cc => user.phone.startsWith(cc.code));
    if (matchedCountry) {
      countryCode = matchedCountry.code;
      phoneNumber = user.phone.substring(matchedCountry.code.length).trim();
    } else if (user.phone.startsWith('+')) {
      // If it starts with + but we don't have a match, try to extract first few digits
      const plusIndex = user.phone.indexOf('+');
      if (plusIndex === 0) {
        // Try common patterns
        if (user.phone.startsWith('+1')) {
          countryCode = '+1';
          phoneNumber = user.phone.substring(2).trim();
        } else {
          // Keep original phone if we can't parse it
          phoneNumber = user.phone;
        }
      }
    }
  }
  
  this.staffForm.patchValue({
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    countryCode: countryCode,
    phone: phoneNumber,
    roleId: user.role?.code,
   
  });
}

/**
 * Submit the form (create or update)
 */
onSubmitForm(): void {
  if (this.staffForm.invalid) {
    return;
  }
  console.log("edit mode")

  this.isSubmitting = true;
  //deactivate form
  this.commonService.disableForm(this.staffForm)
  
  // Combine country code with phone number
  const fullPhoneNumber = `${this.staffForm.value.countryCode}${this.staffForm.value.phone}`;
  
  const formData = {
    email: this.staffForm.value.email,
    firstName: this.staffForm.value.firstName,
    lastName: this.staffForm.value.lastName,
    phoneNumber: fullPhoneNumber,
    roleCode: this.staffForm.value.roleId,
  }

  if (this.isEditMode && this.selectedUser) {
    // Update existing user with FormData for file upload support
    const formDataToSend = new FormData();
    formDataToSend.append('firstName', formData.firstName);
    formDataToSend.append('lastName', formData.lastName);
    formDataToSend.append('email', formData.email);
    formDataToSend.append('phoneNumber', formData.phoneNumber);
    formDataToSend.append('roleCode', formData.roleCode);
    
    // Append profile picture if selected
    if (this.selectedProfilePicture) {
      formDataToSend.append('profilePicture', this.selectedProfilePicture);
    }
    
    this.userService.userControllerUpdateStaffV1({
      idUser: this.selectedUser.id, 
      body: formDataToSend as any
    }).subscribe({
      next: (response) => {
        console.log("edit", response)
        this.notificationService.success('Staff member updated successfully!');
        this.isSubmitting = false;
        this.commonService.enableForm(this.staffForm)
        
        // Close the specific dialog with success result
        if (this.currentDialogRef) {
          this.currentDialogRef.close(true);
        }
      },
      error: (error) => {
        console.error('Error updating staff:', error);
        this.notificationService.error('Failed to update staff member. Please try again.');
        this.isSubmitting = false;
        this.commonService.enableForm(this.staffForm)
      }
    });
  } else {
    // Create new user with FormData for file upload
    const formDataToSend = new FormData();
    formDataToSend.append('firstName', formData.firstName);
    formDataToSend.append('lastName', formData.lastName);
    formDataToSend.append('email', formData.email);
    formDataToSend.append('phoneNumber', formData.phoneNumber);
    formDataToSend.append('roleCode', formData.roleCode);
    
    // Append profile picture if selected
    if (this.selectedProfilePicture) {
      formDataToSend.append('profilePicture', this.selectedProfilePicture);
    }

    // Debug: Log FormData contents (FormData doesn't show in console.log directly)
    console.log("FormData contents:");
    const formDataEntries: any = {};
    formDataToSend.forEach((value, key) => {
      if (value instanceof File) {
        formDataEntries[key] = {
          name: value.name,
          size: value.size,
          type: value.type
        };
      } else {
        formDataEntries[key] = value;
      }
    });
    console.log("FormData entries:", formDataEntries);
    
    this.userService.userControllerCreateStaffV1({
      body: formDataToSend as any
    }).subscribe({
      next: (response) => {
        this.notificationService.success('Staff member created successfully!');
        this.isSubmitting = false;
        this.commonService.enableForm(this.staffForm)
        
        // Close the specific dialog with success result
        if (this.currentDialogRef) {
          this.currentDialogRef.close(true);
        }
      },
      error: (error) => {
        console.error('Error creating staff:', error);
        this.notificationService.error('Failed to create staff member. Please try again.');
        this.isSubmitting = false;
        this.commonService.enableForm(this.staffForm)
      }
    });
  }
}



/**
 * Get modal title based on mode
 */
getModalTitle(): string {
  return this.isEditMode ? 'Edit Staff Member' : 'Create New Staff Member';
}

/**
 * Handle profile picture file selection
 */
onProfilePictureSelected(event: Event): void {
  const input = event.target as HTMLInputElement;
  if (input.files && input.files.length > 0) {
    const file = input.files[0];
    
    // Validate file type - only JPG/JPEG and PNG allowed
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    const allowedExtensions = ['.jpg', '.jpeg', '.png'];
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    
    if (!allowedTypes.includes(file.type) || !allowedExtensions.includes(fileExtension)) {
      this.notificationService.error('Please select a valid image file. Only JPG/JPEG and PNG files are allowed.');
      input.value = '';
      return;
    }
    
    // Validate file size (max 2MB)
    const maxSize = 2 * 1024 * 1024; // 2MB
    if (file.size > maxSize) {
      this.notificationService.error('Image size must be less than or equal to 2MB');
      input.value = '';
      return;
    }
    
    this.selectedProfilePicture = file;
    
    // Create preview
    const reader = new FileReader();
    reader.onload = (e: any) => {
      this.profilePicturePreview = e.target.result;
    };
    reader.readAsDataURL(file);
  }
}

/**
 * Remove selected profile picture
 */
removeProfilePicture(): void {
  this.selectedProfilePicture = null;
  this.profilePicturePreview = this.selectedUser?.profilePictureUrl || null;
}

/**
 * Handle image load error - fallback to default avatar
 */
onImageError(event: Event): void {
  const img = event.target as HTMLImageElement;
  img.src = 'assets/images/users/avatar-1.jpg';
}

/**
 * Get submit button text based on mode
 */
getSubmitButtonText(): string {
  return this.isEditMode ? 'Update Staff' : 'Create Staff';
}

  /**
   * Deactivate staff member with confirmation
   */
  onDeactivateStaff(staff: UserResponseDto): void {
    Swal.fire({
      title: 'Deactivate Staff Member?',
      text: `Are you sure you want to deactivate ${staff.firstName} ${staff.lastName}?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#f46a6a',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Yes, deactivate!',
      cancelButtonText: 'Cancel',
      reverseButtons: true
    }).then((result) => {
      if (result.isConfirmed) {
        this.toggleStaffActivation(staff, true);
      }
    });
  }

  /**
   * Activate staff member with confirmation
   */
  onActivateStaff(staff: UserResponseDto): void {
    Swal.fire({
      title: 'Activate Staff Member?',
      text: `Are you sure you want to activate ${staff.firstName} ${staff.lastName}?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#34c38f',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Yes, activate!',
      cancelButtonText: 'Cancel',
      reverseButtons: true
    }).then((result) => {
      if (result.isConfirmed) {
        this.toggleStaffActivation(staff, false);
      }
    });
  }

  /**
   * Delete staff member with confirmation
   */
  onDeleteStaff(staff: UserResponseDto): void {
    Swal.fire({
      title: 'Delete Staff Member?',
      text: `Are you sure you want to permanently delete ${staff.firstName} ${staff.lastName}? This action cannot be undone!`,
      icon: 'error',
      showCancelButton: true,
      confirmButtonColor: '#dc3545',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Yes, delete permanently!',
      cancelButtonText: 'Cancel',
      reverseButtons: true,
      customClass: {
        confirmButton: 'btn btn-danger',
        cancelButton: 'btn btn-secondary ms-2'
      }
    }).then((result) => {
      if (result.isConfirmed) {
        this.deleteStaff(staff);
      }
    });
  }

  /**
   * View staff member details
   */
  onViewStaff(staff: UserResponseDto): void {
    Swal.fire({
      title: `${staff.firstName} ${staff.lastName}`,
      html: `
        <div class="text-start">
          <p><strong>Email:</strong> ${staff.email}</p>
          <p><strong>Phone:</strong> ${staff.phone}</p>
          <p><strong>Role:</strong> ${staff.role?.code || 'N/A'}</p>
         
          <p><strong>Status:</strong> ${staff.isDeactivated ? 'Deactivated' : 'Active'}</p>
          <p><strong>Created:</strong> ${this.formatDate(staff.createdAt)}</p>
        </div>
      `,
      icon: 'info',
      confirmButtonColor: '#556ee6',
      confirmButtonText: 'Close'
    });
  }

  /**
   * Execute deactivate staff API call
   */
  private toggleStaffActivation(staff: UserResponseDto, isDeactivated: boolean): void {
    this.userService.userControllerToggleStaffActivationV1({
      id: staff.id,
      body: { isDeactivated }
    }).subscribe({
      next: (response) => {
        const action = isDeactivated ? 'deactivated' : 'activated';
        Swal.fire({
          title: `${action.charAt(0).toUpperCase() + action.slice(1)}!`,
          text: `${staff.firstName} ${staff.lastName} has been ${action} successfully.`,
          icon: 'success',
          confirmButtonColor: '#34c38f'
        });
        this.loadStaff();
      },
      error: (error) => {
        console.error(`Error ${isDeactivated ? 'deactivating' : 'activating'} staff:`, error);
        Swal.fire({
          title: 'Error!',
          text: `Failed to ${isDeactivated ? 'deactivate' : 'activate'} staff member. Please try again.`,
          icon: 'error',
          confirmButtonColor: '#f46a6a'
        });
      }
    });
  }

  /**
   * Execute delete staff API call
   */
  private deleteStaff(staff: UserResponseDto): void {
    this.isLoading = true;
    
    // Show loading state
    Swal.fire({
      title: 'Deleting...',
      text: 'Please wait while we delete the staff member.',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    // Call your API to delete the staff member
    this.userService.userControllerDeleteStaffV1({
      id: staff.id
    }).subscribe({
      next: (response) => {
        Swal.fire({
          title: 'Deleted!',
          text: `${staff.firstName} ${staff.lastName} has been deleted permanently.`,
          icon: 'success',
          confirmButtonColor: '#34c38f'
        });
        this.loadStaff(); // Refresh the table
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error deleting staff:', error);
        Swal.fire({
          title: 'Error!',
          text: 'Failed to delete staff member. Please try again.',
          icon: 'error',
          confirmButtonColor: '#f46a6a'
        });
        this.isLoading = false;
      }
    });
  }
}

