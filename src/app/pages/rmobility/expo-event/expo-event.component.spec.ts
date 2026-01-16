import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ExpoEventComponent } from './expo-event.component';

describe('ExpoEventComponent', () => {
  let component: ExpoEventComponent;
  let fixture: ComponentFixture<ExpoEventComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [ExpoEventComponent]
    });
    fixture = TestBed.createComponent(ExpoEventComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
