import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  inject,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
} from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { AsyncPipe, CommonModule } from '@angular/common';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { ModalService } from '../../modal.service';
import { Subject } from 'rxjs';
import { ModalBackdropComponent } from "../../modal-backdrop.component";
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ModalType } from '../../modal-types';

interface UserForm {
  name: FormControl<string | null>;
  avatarFile: FormControl<File | null>;
  avatarData: FormControl<string | null>;
}

@Component({
  selector: 'app-add-user-modal',
  standalone: true,
  templateUrl: './add-user-modal.component.html',
  styleUrls: ['./add-user-modal.component.css'],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ModalBackdropComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddUserModalComponent implements OnInit, OnDestroy {
  // Services
  private readonly fb = inject(FormBuilder);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly modalService = inject(ModalService);
  private readonly destroy$ = new Subject<void>();
  private readonly cdRef = inject(ChangeDetectorRef);

  // Observable for modal state
  isOpen = false;

  // Outputs
  @Output() userAdded = new EventEmitter<{
    name: string;
    avatarData: string;
  }>();

  // State
  isUploading = false;
  errorMessage = '';
  avatarPreview: SafeUrl | null = null;

  // View references
  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;

  constructor() {
    this.modalService
      .isModalOpen(ModalType.AddUSER)
      .pipe(takeUntilDestroyed())
      .subscribe((open) => {
        this.isOpen = open;
        this.cdRef.markForCheck(); // Manually trigger change detection
      });
  }
  // Form
  userForm!: FormGroup;
  ngOnInit(): void {
    this.initializeForm();

  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initializeForm(): void {
    this.userForm = this.fb.group<UserForm>({
      name: new FormControl('', [Validators.required, Validators.minLength(2)]),
      avatarFile: new FormControl(null, [
        Validators.required,
        this.fileValidator,
      ]),
      avatarData: new FormControl(null),
    });
  }

  private readonly fileValidator: ValidatorFn = (
    control: AbstractControl
  ): ValidationErrors | null => {
    const file = control.value as File;
    if (!file) return null;

    const errors: ValidationErrors = {};

    if (!file.type.startsWith('image/')) {
      errors['invalidType'] = true;
    }

    if (file.size > 2 * 1024 * 1024) {
      errors['maxSize'] = true;
    }

    return Object.keys(errors).length > 0 ? errors : null;
  };

  // Form Helpers
  getControl(controlName: keyof UserForm): AbstractControl | null {
    return this.userForm.get(controlName);
  }

  isControlInvalid(controlName: keyof UserForm): boolean {
    const control = this.getControl(controlName);
    return !!control?.invalid && (control?.dirty || control?.touched);
  }

  hasError(controlName: keyof UserForm, errorType: string): boolean {
    const control = this.getControl(controlName);
    return !!control?.errors?.[errorType];
  }

  private resetFormState(): void {
    this.userForm.reset();
    this.errorMessage = '';
    this.avatarPreview = null;
    this.clearFileInput();
  }

  private clearFileInput(): void {
    if (this.fileInputRef) {
      this.fileInputRef.nativeElement.value = '';
    }
  }

  // File Handling
  onFileSelected(event: Event): void {
    this.errorMessage = '';
    this.clearPreview();

    const file = (event.target as HTMLInputElement)?.files?.[0];
    if (!file) {
      this.setAvatarFile(null);
      return;
    }

    this.validateAndProcessFile(file);
  }

  private clearPreview(): void {
    this.avatarPreview = null;
    this.userForm.patchValue({ avatarData: null });
  }

  private setAvatarFile(file: File | null): void {
    this.getControl('avatarFile')?.setValue(file);
    this.getControl('avatarFile')?.markAsTouched();
    this.getControl('avatarFile')?.updateValueAndValidity();
  }

  private isAvatarFileValid(): boolean {
    return !this.getControl('avatarFile')?.errors;
  }

  private validateAndProcessFile(file: File): void {
    this.setAvatarFile(file);

    if (this.isAvatarFileValid()) {
      this.createImagePreview(file);
    } else {
      this.handleInvalidFile();
    }
  }

  private createImagePreview(file: File): void {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = reader.result as string;
      this.avatarPreview = this.sanitizer.bypassSecurityTrustUrl(dataUrl);
      this.userForm.patchValue({ avatarData: dataUrl });
      this.cdRef.markForCheck(); // Manually trigger change detection
    };
    reader.readAsDataURL(file);
  }

  private handleInvalidFile(): void {
    this.clearPreview();
    this.clearFileInput();
    this.cdRef.markForCheck(); // Manually trigger change detection
  }

  // Remove Image
  removeImage(event: Event): void {
    event.stopPropagation();
    this.clearPreview();
    this.clearFileInput();
    this.setAvatarFile(null);
    this.errorMessage = '';
    this.cdRef.markForCheck(); // Manually trigger change detection
  }

  openImagePreview(): void {
    if (this.avatarPreview) {
      // If avatarPreview is already a SafeUrl, get the string value
      const url =
        typeof this.avatarPreview === 'string'
          ? this.avatarPreview
          : this.sanitizer.sanitize(4, this.avatarPreview);

      if (url) {
        this.modalService.openModal(ModalType.ImagePreview, url);
      }
    }
  }

  // Check if the modal in the list (If the modal in the list will open)
  get IsModalOpen() {
    return this.modalService.isModalOpen(ModalType.AddUSER);
  }

  // Modal Management
  closeModal(): void {
    this.resetFormState();
    this.modalService.closeModal(ModalType.AddUSER);
  }

  // Submit
  addNewUser(): void {
    if (this.userForm.invalid) {
      this.userForm.markAllAsTouched();
      this.cdRef.markForCheck(); // Manually trigger change detection
      return;
    }

    this.isUploading = true;
    this.cdRef.markForCheck(); // Manually trigger change detection

    try {
      this.userAdded.emit({
        name: this.userForm.value.name,
        avatarData: this.userForm.value.avatarData,
      });
      this.closeModal();
    } catch (err) {
      this.errorMessage = `Error adding user: ${
        err instanceof Error ? err.message : 'Unknown error'
      }`;
      this.cdRef.markForCheck(); // Manually trigger change detection
    } finally {
      this.isUploading = false;
      this.cdRef.markForCheck(); // Manually trigger change detection
    }
  }
}
