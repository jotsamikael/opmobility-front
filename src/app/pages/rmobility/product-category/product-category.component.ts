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
import { GetProductCategoryResponse } from 'src/app/opmobilitybackend/models';
import { ProductCategoryService } from 'src/app/opmobilitybackend/services';

// Product Category filters interface
export interface ProductCategoryFilters {
  page?: number;
  limit?: number;
  name?: string;
  code?: string;
  description?: string;
}

@Component({
  selector: 'app-product-category',
  templateUrl: './product-category.component.html',
  styleUrls: ['./product-category.component.scss']
})
export class ProductCategoryComponent implements OnInit, AfterViewInit {
  breadCrumbItems: Array<{}>;
  
  // Table properties
  displayedColumns: string[] = ['code', 'name', 'description', 'actions'];
  dataSource: MatTableDataSource<GetProductCategoryResponse> = new MatTableDataSource<GetProductCategoryResponse>([]);
 
  // Pagination properties
  totalItems = 0;
  currentPage = 1;
  pageSize = 10;
  pageSizeOptions = [5, 10, 25, 50];
  
  // Loading state
  isLoading = false;
  
  // Filters
  filters: ProductCategoryFilters = {
    page: 1,
    limit: 10
  };
  
  // Search controls
  nameSearchControl = new FormControl('');
  codeSearchControl = new FormControl('');
  descriptionSearchControl = new FormControl('');

  // Computed properties for summary cards
  get totalPages(): number {
    return Math.ceil(this.totalItems / this.pageSize) || 1;
  }

  // Modal properties
  productCategoryForm: FormGroup;
  selectedProductCategory: GetProductCategoryResponse | null = null;
  isSubmitting = false;
  isEditMode = false;

  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;
  @ViewChild('modalTemplate') modalTemplate: TemplateRef<any>;

  private currentDialogRef: MatDialogRef<any> | null = null;

  constructor(
    private productCategoryService: ProductCategoryService,
    private globalFormBuilder: GlobalFormBuilder,
    private notificationService: NotificationService,
    private dialog: MatDialog,
    private fb: FormBuilder,
    private commonService: CommonService
  ) {
    this.productCategoryForm = this.globalFormBuilder.productCategoryForm();
  }

  ngOnInit(): void {
    this.breadCrumbItems = [{ label: 'Tables' }, { label: 'Product Category Management', active: true }];
    this.productCategoryForm = this.globalFormBuilder.productCategoryForm();
    this.loadProductCategories();
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
   * Load product categories from API
   */
  loadProductCategories(): void {
    this.isLoading = true;
    
    const queryParams: any = {
      page: this.filters.page || 1,
      limit: this.filters.limit || 10
    };
    
    if (this.filters.name) {
      queryParams.name = this.filters.name;
    }
    
    if (this.filters.code) {
      queryParams.code = this.filters.code;
    }
    
    if (this.filters.description) {
      queryParams.description = this.filters.description;
    }
    
    this.productCategoryService.productCategoryControllerGetAllProductCategoriesV1(queryParams).subscribe({
      next: (response: any) => {
        console.log('Product Category data:', response);
        
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
        console.error('Error loading product categories:', error);
        this.notificationService.error('Failed to load product categories data. Please try again.');
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
    this.loadProductCategories();
  }

  /**
   * Handle sorting changes
   */
  onSortChange(event: Sort): void {
    // Product categories API supports sorting, but we can reload if needed
    if (event.direction) {
      this.loadProductCategories();
    }
  }

  /**
   * Apply filters
   */
  applyFilters(): void {
    this.filters.name = this.nameSearchControl.value || undefined;
    this.filters.code = this.codeSearchControl.value || undefined;
    this.filters.description = this.descriptionSearchControl.value || undefined;
    this.filters.page = 1; // Reset to first page
    this.loadProductCategories();
  }

  /**
   * Clear all filters
   */
  clearFilters(): void {
    this.nameSearchControl.setValue('');
    this.codeSearchControl.setValue('');
    this.descriptionSearchControl.setValue('');
    
    this.filters = {
      page: 1,
      limit: this.pageSize
    };
    
    this.loadProductCategories();
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
      this.loadProductCategories();
    });
    
    // Code search debouncing
    this.codeSearchControl.valueChanges.pipe(
      debounceTime(500),
      distinctUntilChanged()
    ).subscribe(value => {
      this.filters.code = value || undefined;
      this.filters.page = 1; // Reset to first page
      this.loadProductCategories();
    });
    
    // Description search debouncing
    this.descriptionSearchControl.valueChanges.pipe(
      debounceTime(500),
      distinctUntilChanged()
    ).subscribe(value => {
      this.filters.description = value || undefined;
      this.filters.page = 1; // Reset to first page
      this.loadProductCategories();
    });
  }

  /**
   * Open create modal
   */
  onCreateProductCategory(): void {
    this.isEditMode = false;
    this.selectedProductCategory = null;
    this.commonService.resetForm(this.productCategoryForm);
    
    this.currentDialogRef = this.dialog.open(this.modalTemplate, {
      width: '600px',
      disableClose: true,
      panelClass: 'custom-dialog-container'
    });

    this.currentDialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.loadProductCategories();
      }
    });
  }

  /**
   * Open edit modal
   */
  onEditProductCategory(productCategory: GetProductCategoryResponse): void {
    this.isEditMode = true;
    this.selectedProductCategory = productCategory;
    this.populateEditForm(productCategory);
    
    this.currentDialogRef = this.dialog.open(this.modalTemplate, {
      width: '600px',
      disableClose: true,
      panelClass: 'custom-dialog-container'
    });

    this.currentDialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.loadProductCategories();
      }
    });
  }

  /**
   * Populate the form with product category data
   */
  private populateEditForm(productCategory: GetProductCategoryResponse): void {
    this.productCategoryForm.patchValue({
      name: productCategory.name,
      code: productCategory.code,
      description: productCategory.description || ''
    });
  }

  /**
   * Submit the form (create or update)
   */
  onSubmitForm(): void {
    if (this.productCategoryForm.invalid) {
      return;
    }

    this.isSubmitting = true;
    this.commonService.disableForm(this.productCategoryForm);
    
    const formData: any = {
      name: this.productCategoryForm.value.name,
      code: this.productCategoryForm.value.code
    };
    
    if (this.productCategoryForm.value.description) {
      formData.description = this.productCategoryForm.value.description;
    }

    if (this.isEditMode && this.selectedProductCategory) {
      // Update existing product category
      this.productCategoryService.productCategoryControllerUpdateV1({
        id: this.selectedProductCategory.id,
        body: formData
      }).subscribe({
        next: (response) => {
          console.log("update", response);
          this.notificationService.success('Product category updated successfully!');
          this.isSubmitting = false;
          this.commonService.enableForm(this.productCategoryForm);
          
          if (this.currentDialogRef) {
            this.currentDialogRef.close(true);
          }
        },
        error: (error) => {
          console.error('Error updating product category:', error);
          this.notificationService.error('Failed to update product category. Please try again.');
          this.isSubmitting = false;
          this.commonService.enableForm(this.productCategoryForm);
        }
      });
    } else {
      // Create new product category
      this.productCategoryService.productCategoryControllerCreateV1({
        body: formData
      }).subscribe({
        next: (response) => {
          this.notificationService.success('Product category created successfully!');
          this.isSubmitting = false;
          this.commonService.enableForm(this.productCategoryForm);
          
          if (this.currentDialogRef) {
            this.currentDialogRef.close(true);
          }
        },
        error: (error) => {
          console.error('Error creating product category:', error);
          this.notificationService.error('Failed to create product category. Please try again.');
          this.isSubmitting = false;
          this.commonService.enableForm(this.productCategoryForm);
        }
      });
    }
  }

  /**
   * Get modal title based on mode
   */
  getModalTitle(): string {
    return this.isEditMode ? 'Edit Product Category' : 'Create New Product Category';
  }

  /**
   * Get submit button text
   */
  getSubmitButtonText(): string {
    return this.isEditMode ? 'Update Product Category' : 'Create Product Category';
  }

  /**
   * View product category details
   */
  onViewProductCategory(productCategory: GetProductCategoryResponse): void {
    Swal.fire({
      title: productCategory.name,
      html: `
        <div class="text-start">
          <p><strong>Code:</strong> ${productCategory.code}</p>
          <p><strong>Description:</strong> ${productCategory.description || 'N/A'}</p>
          <p><strong>Product Category ID:</strong> ${productCategory.id}</p>
        </div>
      `,
      icon: 'info',
      confirmButtonColor: '#556ee6',
      confirmButtonText: 'Close'
    });
  }

  /**
   * Delete product category
   */
  onDeleteProductCategory(productCategory: GetProductCategoryResponse): void {
    Swal.fire({
      title: 'Are you sure?',
      text: `Do you want to delete "${productCategory.name}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Yes, delete it!',
      cancelButtonText: 'Cancel'
    }).then((result) => {
      if (result.isConfirmed) {
        this.productCategoryService.productCategoryControllerRemoveV1({
          id: productCategory.id
        }).subscribe({
          next: () => {
            this.notificationService.success('Product category deleted successfully!');
            this.loadProductCategories();
          },
          error: (error) => {
            console.error('Error deleting product category:', error);
            this.notificationService.error('Failed to delete product category. Please try again.');
          }
        });
      }
    });
  }
}
