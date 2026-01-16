
import { Injectable } from "@angular/core";

import Swal from "sweetalert2";
import { Observable } from "rxjs";
import { FormGroup } from "@angular/forms";


@Injectable({
  providedIn: 'root'
})
export class CommonService {

constructor(){

  }

 

    resetForm(basicInfoForm: FormGroup<any>) {
  basicInfoForm.reset()
  }


  disableForm(basicInfoForm:FormGroup<any>) {
  basicInfoForm.disable()
}

enableForm(basicInfoForm:FormGroup<any>) {
  basicInfoForm.enable()
}



convertDateTimeToDate(rawDate:string):string{
const formattedDate = rawDate ? rawDate.split('T')[0] : null;
return formattedDate
}



  
}