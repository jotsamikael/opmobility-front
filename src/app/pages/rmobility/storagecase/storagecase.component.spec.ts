import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StoragecaseComponent } from './storagecase.component';

describe('StoragecaseComponent', () => {
  let component: StoragecaseComponent;
  let fixture: ComponentFixture<StoragecaseComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [StoragecaseComponent]
    });
    fixture = TestBed.createComponent(StoragecaseComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
