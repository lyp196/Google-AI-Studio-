import React, { useState, useRef, useCallback } from 'react';
import JSZip from 'jszip';
import FileSaver from 'file-saver';
import { Variation, AppState, VariationStatus } from './types';
import { generateAdFromText, generateAdFromImage } from './services/geminiService';
import { Button } from './components/Button';

// --- Icons ---
const UploadIcon = () => (
  <svg className="w-8 h-8 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
  </svg>
);

const TrashIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const DownloadIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
);

const App: React.FC = () => {
  // --- State ---
  const [sampleAd, setSampleAd] = useState<string | null>(null);
  const [mode, setMode] = useState<'text' | 'image'>('text');
  const [textPrompts, setTextPrompts] = useState<string>('');
  const [productImages, setProductImages] = useState<{ id: string; file: File; preview: string }[]>([]);
  const [variations, setVariations] = useState<Variation[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // --- Handlers ---

  const handleSampleAdUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setSampleAd(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleProductImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newImages = Array.from(e.target.files).map((file: File) => ({
        id: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file)
      }));
      setProductImages(prev => [...prev, ...newImages]);
    }
  };

  const removeProductImage = (id: string) => {
    setProductImages(prev => prev.filter(img => img.id !== id));
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const validateInput = (): boolean => {
    setErrorMsg(null);
    if (!sampleAd) {
      setErrorMsg("Please upload a sample ad first.");
      return false;
    }
    if (mode === 'text' && !textPrompts.trim()) {
      setErrorMsg("Please enter at least one text description.");
      return false;
    }
    if (mode === 'image' && productImages.length === 0) {
      setErrorMsg("Please upload at least one product image.");
      return false;
    }
    return true;
  };

  const handleGenerate = async () => {
    if (!validateInput()) return;
    setIsProcessing(true);

    const newVariations: Variation[] = [];
    const timestamp = Date.now();

    if (mode === 'text') {
      const lines = textPrompts.split('\n').filter(line => line.trim() !== '');
      lines.forEach(line => {
        newVariations.push({
          id: crypto.randomUUID(),
          sourceType: 'text',
          sourceValue: line.trim(),
          resultImage: null,
          status: 'generating',
          timestamp
        });
      });
    } else {
      for (const img of productImages) {
        // We store the preview URL temporarily as sourceValue for display, 
        // but we'll use the file object for processing
        newVariations.push({
          id: img.id, // Use same ID to track
          sourceType: 'image',
          sourceValue: img.preview,
          resultImage: null,
          status: 'generating',
          timestamp
        });
      }
    }

    setVariations(prev => [...newVariations, ...prev]);

    // Process sequentially to manage rate limits (simple approach)
    // In a real pro app, we might use a queue with concurrency control.
    for (const variation of newVariations) {
      try {
        let resultBase64 = '';
        if (variation.sourceType === 'text') {
           resultBase64 = await generateAdFromText(sampleAd!, variation.sourceValue);
        } else {
           // Find the file again
           const productImgObj = productImages.find(p => p.id === variation.id);
           if (!productImgObj) throw new Error("Image source lost");
           const productBase64 = await fileToBase64(productImgObj.file);
           resultBase64 = await generateAdFromImage(sampleAd!, productBase64);
        }

        setVariations(prev => prev.map(v => 
          v.id === variation.id 
            ? { ...v, status: 'success', resultImage: resultBase64 } 
            : v
        ));

      } catch (err: any) {
        setVariations(prev => prev.map(v => 
          v.id === variation.id 
            ? { ...v, status: 'error', errorMessage: err.message || "Generation failed" } 
            : v
        ));
      }
    }

    setIsProcessing(false);
  };

  const handleDownload = (variation: Variation) => {
    if (variation.resultImage) {
      FileSaver.saveAs(variation.resultImage, `ad-variation-${variation.id}.png`);
    }
  };

  const handleDownloadAll = async () => {
    const zip = new JSZip();
    const successfulVariations = variations.filter(v => v.status === 'success' && v.resultImage);
    
    if (successfulVariations.length === 0) return;

    successfulVariations.forEach(v => {
      const base64Data = v.resultImage!.split(',')[1];
      const filename = `ad-variation-${v.sourceType === 'text' ? 'prompt' : 'img'}-${v.id.slice(0,6)}.png`;
      zip.file(filename, base64Data, { base64: true });
    });

    const content = await zip.generateAsync({ type: "blob" });
    FileSaver.saveAs(content, "ad_variations_pack.zip");
  };

  // --- Render ---

  return (
    <div className="min-h-screen bg-dark-900 text-gray-200 font-sans selection:bg-brand-500 selection:text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-dark-800/80 backdrop-blur-md border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center font-bold text-white">Ad</div>
             <h1 className="text-xl font-bold tracking-tight text-white">Variation Builder <span className="text-brand-500">Pro</span></h1>
          </div>
          <div className="text-sm text-gray-400">
            Powered by Gemini 2.5 Flash
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Controls */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* 1. Upload Sample Ad */}
          <section className="bg-dark-800 rounded-xl p-5 border border-gray-700 shadow-xl">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">1. Master Ad Template</h2>
            
            <div className="relative group">
              <input 
                type="file" 
                accept="image/*" 
                onChange={handleSampleAdUpload} 
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
              />
              <div className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center transition-colors ${sampleAd ? 'border-brand-500 bg-brand-900/10' : 'border-gray-600 hover:border-gray-400 bg-gray-800'}`}>
                {sampleAd ? (
                  <img src={sampleAd} alt="Sample Ad" className="max-h-48 object-contain rounded shadow-lg" />
                ) : (
                  <>
                    <UploadIcon />
                    <p className="text-sm text-gray-300 font-medium">Click to upload sample ad</p>
                    <p className="text-xs text-gray-500 mt-1">PNG, JPG up to 10MB</p>
                  </>
                )}
              </div>
            </div>
          </section>

          {/* 2. Choose Mode & Inputs */}
          <section className="bg-dark-800 rounded-xl p-5 border border-gray-700 shadow-xl">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">2. Variation Source</h2>
            
            <div className="flex bg-gray-900 p-1 rounded-lg mb-4">
              <button 
                onClick={() => setMode('text')} 
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${mode === 'text' ? 'bg-brand-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
              >
                Text Descriptions
              </button>
              <button 
                onClick={() => setMode('image')} 
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${mode === 'image' ? 'bg-brand-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
              >
                Product Images
              </button>
            </div>

            {mode === 'text' ? (
              <div className="space-y-2">
                <label className="text-xs text-gray-500">Enter one product description per line:</label>
                <textarea
                  value={textPrompts}
                  onChange={(e) => setTextPrompts(e.target.value)}
                  placeholder="e.g. Red running shoes with white laces&#10;Blue denim jacket, vintage style&#10;Futuristic silver headphones"
                  className="w-full h-40 bg-gray-900 border border-gray-700 rounded-lg p-3 text-sm text-gray-200 focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none"
                />
              </div>
            ) : (
              <div className="space-y-4">
                 <div className="relative">
                    <input 
                      type="file" 
                      multiple 
                      accept="image/*" 
                      onChange={handleProductImageUpload}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <Button variant="secondary" className="w-full">
                      + Add Product Images
                    </Button>
                 </div>
                 
                 {productImages.length > 0 && (
                   <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto p-2 bg-gray-900 rounded-lg">
                      {productImages.map(img => (
                        <div key={img.id} className="relative group aspect-square">
                          <img src={img.preview} alt="product" className="w-full h-full object-cover rounded border border-gray-700" />
                          <button 
                            onClick={() => removeProductImage(img.id)}
                            className="absolute top-1 right-1 bg-red-500/80 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      ))}
                   </div>
                 )}
              </div>
            )}
          </section>

          {/* Action */}
          <div className="sticky bottom-6 z-10">
            {errorMsg && (
              <div className="mb-3 p-3 bg-red-900/50 border border-red-700 text-red-200 text-sm rounded-lg flex items-center gap-2 animate-pulse">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                {errorMsg}
              </div>
            )}
            <Button 
              onClick={handleGenerate} 
              disabled={isProcessing} 
              isLoading={isProcessing}
              className="w-full py-4 text-lg shadow-xl shadow-brand-900/40"
            >
              {isProcessing ? 'Generating Variations...' : 'Generate Variations'}
            </Button>
          </div>

        </div>

        {/* Right Column: Gallery */}
        <div className="lg:col-span-8 flex flex-col h-full">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white">Results ({variations.length})</h2>
            {variations.some(v => v.status === 'success') && (
              <Button variant="secondary" onClick={handleDownloadAll} icon={<DownloadIcon />}>
                Download All (.zip)
              </Button>
            )}
          </div>

          {variations.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-gray-800 rounded-2xl bg-dark-800/50 text-gray-500 p-12 min-h-[400px]">
              <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              </div>
              <p className="text-lg font-medium">No variations generated yet</p>
              <p className="text-sm mt-2">Upload a master ad and prompts to get started.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {variations.map((variation) => (
                <div key={variation.id} className="bg-dark-800 rounded-xl overflow-hidden border border-gray-700 shadow-lg flex flex-col">
                  {/* Image Container */}
                  <div className="relative aspect-auto min-h-[250px] bg-gray-900 flex items-center justify-center">
                     {variation.status === 'generating' && (
                       <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-dark-800/80 backdrop-blur-sm">
                         <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                         <span className="text-brand-400 text-sm font-medium animate-pulse">Processing...</span>
                       </div>
                     )}
                     
                     {variation.status === 'error' && (
                       <div className="p-6 text-center text-red-400">
                         <p className="font-bold mb-1">Generation Failed</p>
                         <p className="text-xs opacity-80">{variation.errorMessage}</p>
                       </div>
                     )}

                     {variation.status === 'success' && variation.resultImage && (
                       <img src={variation.resultImage} alt="Generated Variation" className="w-full h-full object-contain" />
                     )}
                  </div>

                  {/* Info Footer */}
                  <div className="p-4 bg-dark-800 border-t border-gray-700 flex items-center justify-between">
                    <div className="flex-1 min-w-0 mr-4">
                       <p className="text-xs text-gray-500 uppercase font-semibold mb-1">
                         {variation.sourceType === 'text' ? 'Prompt' : 'Source Image'}
                       </p>
                       <div className="truncate text-sm text-gray-300" title={variation.sourceValue}>
                         {variation.sourceType === 'text' ? variation.sourceValue : 'Product Image Upload'}
                       </div>
                    </div>
                    {variation.status === 'success' && (
                      <Button variant="ghost" onClick={() => handleDownload(variation)} className="p-2" title="Download">
                        <DownloadIcon />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;