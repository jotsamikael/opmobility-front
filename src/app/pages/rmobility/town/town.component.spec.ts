import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TownComponent } from './town.component';

describe('TownComponent', () => {
  let component: TownComponent;
  let fixture: ComponentFixture<TownComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [TownComponent]
    });
    fixture = TestBed.createComponent(TownComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
