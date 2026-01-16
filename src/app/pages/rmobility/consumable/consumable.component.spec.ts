import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ConsumableComponent } from './consumable.component';

describe('ConsumableComponent', () => {
  let component: ConsumableComponent;
  let fixture: ComponentFixture<ConsumableComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [ConsumableComponent]
    });
    fixture = TestBed.createComponent(ConsumableComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
