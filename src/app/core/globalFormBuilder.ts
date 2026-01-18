import { Injectable } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import ClassicEditor from '@ckeditor/ckeditor5-build-classic';

@Injectable({
  providedIn: 'root'
})
export class GlobalFormBuilder {
  constructor(private fb: FormBuilder) {}
  public Editor = ClassicEditor;


  createLoginForm() {
    return this.fb.group({
      email: ['admin@rmobility.com', [Validators.required, Validators.email]],
      password: ['password123', Validators.required]
    });
  }


  staffForm(){
    return  this.fb.group({
      firstName: ['', [Validators.required, Validators.minLength(2)]],
      lastName: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      countryCode: ['+1', Validators.required],
      phone: ['', [Validators.required, Validators.pattern(/^[0-9]{7,15}$/)]],
      roleId: [null, Validators.required],
      isVerified: [false],
      isPhoneVerified: [false]
    });
  }

  townForm(){
    return this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      countryId: [null, Validators.required]
    });
  }

  warehouseForm(){
    return this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
      address: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
      townId: [null, Validators.required]
    });
  }

  locationForm(){
    return this.fb.group({
      warehouseId: [null, Validators.required],
      aisle: ['', [Validators.required, Validators.maxLength(20)]],
      levelNo: [null, [Validators.required, Validators.min(1)]],
      positionLabel: ['', [Validators.required, Validators.maxLength(20)]],
      notes: ['']
    });
  }

  productCategoryForm(){
    return this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(100)]],
      code: ['', [Validators.required, Validators.maxLength(100)]],
      description: ['', [Validators.maxLength(500)]]
    });
  }

  providerForm(){
    return this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(200)]],
      type: ['', Validators.required],
      contactName: ['', [Validators.maxLength(100)]],
      email: ['', [Validators.email]],
      phone: ['', [Validators.maxLength(50)]],
      address: ['', [Validators.maxLength(200)]],
      remarks: ['', [Validators.maxLength(500)]]
    });
  }

  productForm(){
    return this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(200)]],
      ref: ['', [Validators.required, Validators.maxLength(50)]],
      categoryId: [null, Validators.required],
      locationId: [null, Validators.required],
      providerId: [null],
      status: [{value: 'Available', disabled: true}, Validators.required],
      lengthMm: [null, [Validators.required, Validators.min(1)]],
      widthMm: [null, [Validators.required, Validators.min(1)]],
      heightMm: [null, [Validators.required, Validators.min(1)]],
      weightKg: [null, [Validators.required, Validators.min(0)]],
      entryDate: ['', Validators.required],
      description: ['', [Validators.required, Validators.maxLength(500)]],
      imageFile: [null],
      specSheetFile: [null]
    });
  }

  storageCaseForm(){
    return this.fb.group({
      ref: ['', [Validators.required, Validators.maxLength(50)]],
      name: ['', [Validators.required, Validators.maxLength(100)]],
      locationId: [null, Validators.required],
      providerId: [null, Validators.required],
      productId: [null],
      type: ['', Validators.required],
      material: ['', [Validators.required, Validators.maxLength(100)]],
      lengthMm: [null, [Validators.required, Validators.min(1)]],
      widthMm: [null, [Validators.required, Validators.min(1)]],
      heightMm: [null, [Validators.required, Validators.min(1)]],
      emptyWeightKg: [null, [Validators.required, Validators.min(0)]],
      manufacturedOn: ['', Validators.required],
      status: [{value: 'Available', disabled: true}, Validators.required],
      observations: ['', [Validators.required, Validators.maxLength(500)]],
      imageFile: [null]
    });
  }

  podiumForm(){
    return this.fb.group({
      ref: ['', [Validators.required, Validators.maxLength(50)]],
      name: ['', [Validators.required, Validators.maxLength(200)]],
      locationId: [null, Validators.required],
      lengthMm: [null, [Validators.required, Validators.min(1)]],
      widthMm: [null, [Validators.required, Validators.min(1)]],
      heightMm: [null, [Validators.required, Validators.min(1)]],
      observations: ['', [Validators.required]],
      imageFile: [null]
    });
  }

  consumableForm(){
    return this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(200)]],
      category: ['', Validators.required],
      unit: ['', [Validators.required, Validators.maxLength(50)]],
      quantity: [null, [Validators.required, Validators.min(1)]],
      unitCost: [null, [Validators.required, Validators.min(0)]],
      purchasedAt: ['', Validators.required],
      providerId: [null, Validators.required],
      productId: [null, Validators.required],
      eventId: [null],
      notes: ['', [Validators.maxLength(1000)]],
      imageFile: [null]
    });
  }

  expoEventForm(){
    return this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(100)]],
      place: ['', [Validators.maxLength(100)]],
      townId: [null, Validators.required],
      startDate: ['', Validators.required],
      endDate: ['', Validators.required],
      ownerName: ['', [Validators.maxLength(100)]],
      status: ['PLANNED', Validators.required],
      notes: ['', [Validators.maxLength(1000)]]
    });
  }

  repairForm(){
    return this.fb.group({
      productId: [null],
      storageCaseId: [null],
      providerId: [null, Validators.required],
      costAmount: [null],
      startedAt: ['', Validators.required],
      finishedAt: [''],
      status: ['IN_PROGRESS', Validators.required],
      notes: ['', [Validators.maxLength(2000)]],
      quoteFile: [null],
      invoiceFile: [null]
    });
  }

  inspectionForm(){
    // Format current date/time for datetime-local input (YYYY-MM-DDTHH:mm)
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const defaultDateTime = `${year}-${month}-${day}T${hours}:${minutes}`;
    
    return this.fb.group({
      productId: [null],
      storageCaseId: [null],
      result: ['OK', Validators.required],
      inspectedAt: [defaultDateTime, Validators.required],
      comments: ['', [Validators.maxLength(2000)]]
    });
  }

  transportPodiumForm(){
    return this.fb.group({
      transportListId: [null, Validators.required],
      podiumId: [null, Validators.required],
      grossWeightKg: [null],
      notes: ['', [Validators.maxLength(1000)]]
    });
  }

  transportItemForm(){
    return this.fb.group({
      transportListId: [null, Validators.required],
      productId: [null, Validators.required],
      storageCaseId: [null],
      podiumId: [null],
      grossWeightKg: [null],
      notes: ['', [Validators.maxLength(1000)]]
    });
  }

  movementForm(){
    // Format current date/time for datetime-local input (YYYY-MM-DDTHH:mm)
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const defaultDateTime = `${year}-${month}-${day}T${hours}:${minutes}`;
    
    return this.fb.group({
      productId: [null, Validators.required],
      type: ['Outbound', Validators.required],
      movedAt: [defaultDateTime, Validators.required],
      originKind: ['Warehouse', Validators.required],
      originRefId: [null, Validators.required],
      destKind: ['Event', Validators.required],
      destRefId: [null, Validators.required],
      notes: ['', [Validators.maxLength(2000)]]
    });
  }

  transportListForm(){
    return this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(255)]],
      eventId: [null, Validators.required]
    });
  }
}
