export type VariationStatus = 'idle' | 'generating' | 'success' | 'error';

export interface Variation {
  id: string;
  sourceType: 'text' | 'image';
  sourceValue: string; // The prompt text or the base64 of the product image
  resultImage: string | null; // Base64 of the generated ad
  status: VariationStatus;
  errorMessage?: string;
  timestamp: number;
}

export interface AppState {
  sampleAd: string | null; // Base64 of the master ad
  mode: 'text' | 'image';
  textPrompts: string;
  productImages: File[]; // Uploaded product images
  variations: Variation[];
  isGlobalGenerating: boolean;
}
