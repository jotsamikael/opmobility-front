import { Component } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { Router } from '@angular/router';
import ClassicEditor from '@ckeditor/ckeditor5-build-classic';
import Swal from 'sweetalert2';


@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss']
})
export class ProfileComponent {

  basicInfoForm: FormGroup;
  updatePasswordForm:FormGroup;
  public Editor = ClassicEditor;
  isLoading: boolean = false;
  profileDetails: any
  user: any;

  bgpreviewEvaluate = "../../../assets/images/profileplaceholder.png";
  profilePicExceedsMaxSize: boolean = false;

  selectedFiles?: FileList;
  currentFile?: File;
  MAX_IMAGE_SIZE = 1 * 1024 * 1024; //1 mb in bytes
  // bread crumb items
  breadCrumbItems: Array<{}>;
  
  constructor(
   
    private router: Router
  ) {
    this.getCurrentUser()
  }

  ngOnInit(): void {
   
  }

  updateProfile() {
    this.isLoading = true;
    // 1. Start with an empty object for the request body
    const requestBody: any = {}; // Use 'any' initially for flexibility

      // 2. Conditionally add text fields if they are present in the form
    //    It's good practice to only send changed fields or fields that have values.
    //    Your Joi schema on the backend already handles optional fields.
    //    You can decide if you want to send *all* form values or only non-null/non-undefined ones.
    //    For simplicity here, I'll send all current form values, letting Joi handle optionality.
    //    If you only want to send *changed* values, you'd compare form values to original user data.

    // Assign all form values directly
    requestBody.first_name = this.basicInfoForm.value.first_name;
    requestBody.last_name = this.basicInfoForm.value.last_name;
    requestBody.email = this.basicInfoForm.value.email;
    requestBody.telephone = this.basicInfoForm.value.telephone;
    requestBody.default_language = this.basicInfoForm.value.default_language;
    requestBody.linkedIn = this.basicInfoForm.value.linkedIn;
    requestBody.email_signature = this.basicInfoForm.value.email_signature;
    requestBody.google_auth_secret = this.basicInfoForm.value.google_auth_secret;

    // 3. Conditionally assign the avatar file
    //    This is the key part for solving your "item is undefined" error.
    if (this.selectedFiles && this.selectedFiles.length > 0) {
      // If a file was selected, include it in the body
      requestBody.avatar = this.selectedFiles.item(0);
    }
    // ELSE: if no file was selected, 'requestBody.avatar' will simply not exist,
    // which is what your backend's Joi.binary().optional() expects.

    // 4. Send the request body
   
  }

 
  
  
  setFormbasicInfoForm() {
    this.basicInfoForm.controls["first_name"].setValue(this.user.first_name);
    this.basicInfoForm.controls["last_name"].setValue(this.user.last_name);
    this.basicInfoForm.controls["email"].setValue(this.user.email);
    this.basicInfoForm.controls["telephone"].setValue(this.user.telephone);
    this.basicInfoForm.controls["default_language"].setValue(this.user.default_language);

    this.basicInfoForm.controls["linkedIn"].setValue(this.user.linkedIn);
    this.basicInfoForm.controls["email_signature"].setValue(this.user.email_signature);
    this.basicInfoForm.controls["google_auth_secret"].setValue(this.user.google_auth_secret);
  }

  disableFormbasicInfoForm() {
  }

  enableFormbasicInfoForm() {
  }

  get f() {
    return this.basicInfoForm.controls;
  }

  getProfileDetails() {
    
  }


  onFileChangeProfile(event: any) {
    this.selectedFiles = event.target.files;

    if (this.selectedFiles) {
      const file: File | null = this.selectedFiles.item(0);

      if (file) {
        this.currentFile = file;

        const reader = new FileReader();

        if (!this.checkFileSize(this.MAX_IMAGE_SIZE, this.currentFile)) {
          reader.onload = async (e: any) => {
            this.bgpreviewEvaluate = e.target.result;
          };
          reader.readAsDataURL(this.currentFile);
        } else {
          this.profilePicExceedsMaxSize = true;
        }
      } else {
        console.log("no file");
      }
    }
  }

  //this function checks the size of a file and sends true or false if the size exceeds the specified value
  checkFileSize(maxAllowedSize: number, givenFile: File) {
    if (givenFile.size <= maxAllowedSize) {
      return false;
    } else {
      return true;
    }
  }

  getCurrentUser() {
  
  }
}
