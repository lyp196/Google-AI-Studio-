import { GoogleGenAI } from "@google/genai";

// Initialize Gemini Client
// We use the environment variable as mandated.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// System instruction to guide the model's behavior for image editing
const IMAGE_EDIT_PROMPT_TEMPLATE = `
You are an expert professional graphic designer and photo editor.
Your task is to edit the provided advertisement image (Sample Ad) by replacing the MAIN PRODUCT/OBJECT with a new item described below.

STRICT GUIDELINES:
1. RETAIN LAYOUT: The background, text overlay, logos, and overall composition must remain EXACTLY the same.
2. RETAIN STYLE: The lighting direction, color grading, shadows, and reflections must match the original scene perfectly.
3. CLEAN REPLACEMENT: Remove the original product completely. Place the new product in the exact same position and scale.
4. REALISM: Ensure the new product has realistic contact shadows and interacts naturally with the environment.
5. NO ARTIFACTS: The edges should be clean. No ghosting of the old product.

NEW PRODUCT DESCRIPTION:
`;

/**
 * Generates an ad variation based on a text prompt.
 */
export const generateAdFromText = async (
  sampleAdBase64: string,
  prompt: string
): Promise<string> => {
  try {
    // Determine model. Using gemini-2.5-flash-image for general image editing tasks as per guidelines.
    // Ideally, we would use a model capable of strong inpainting/editing.
    const model = 'gemini-2.5-flash-image';

    const cleanBase64 = sampleAdBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');
    
    const finalPrompt = `${IMAGE_EDIT_PROMPT_TEMPLATE} "${prompt}"`;

    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          {
            text: finalPrompt,
          },
          {
            inlineData: {
              mimeType: 'image/png', // Assuming PNG for stability, or detect from string
              data: cleanBase64,
            },
          },
        ],
      },
    });

    // Extract image from response
    // The response might contain text if it failed, or inlineData if it succeeded.
    const candidates = response.candidates;
    if (candidates && candidates.length > 0) {
        const parts = candidates[0].content.parts;
        // Look for the image part
        const imagePart = parts.find(p => p.inlineData);
        
        if (imagePart && imagePart.inlineData) {
            return `data:${imagePart.inlineData.mimeType || 'image/png'};base64,${imagePart.inlineData.data}`;
        }
    }
    
    throw new Error("No image generated. The model might have refused the request or returned only text.");

  } catch (error) {
    console.error("Gemini API Error (Text Mode):", error);
    throw error;
  }
};

/**
 * Generates an ad variation based on an uploaded product image.
 * This uses multi-modal input (Image 1: Ad, Image 2: Product, Text: Instruction).
 */
export const generateAdFromImage = async (
  sampleAdBase64: string,
  productImageBase64: string
): Promise<string> => {
  try {
    const model = 'gemini-2.5-flash-image';

    const cleanSampleBase64 = sampleAdBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');
    const cleanProductBase64 = productImageBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');

    const finalPrompt = `
    ${IMAGE_EDIT_PROMPT_TEMPLATE}
    [SEE THE SECOND IMAGE PROVIDED FOR THE NEW PRODUCT REFERENCE]
    
    Task: Replace the object in the FIRST image (Ad) with the object shown in the SECOND image (Product).
    Preserve the visual identity of the product in the second image but adapt its lighting to fit the first image.
    `;

    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          { text: finalPrompt },
          {
            inlineData: {
              mimeType: 'image/png',
              data: cleanSampleBase64,
            },
          },
          {
            inlineData: {
              mimeType: 'image/png',
              data: cleanProductBase64,
            },
          },
        ],
      },
    });

     const candidates = response.candidates;
    if (candidates && candidates.length > 0) {
        const parts = candidates[0].content.parts;
        const imagePart = parts.find(p => p.inlineData);
        if (imagePart && imagePart.inlineData) {
            return `data:${imagePart.inlineData.mimeType || 'image/png'};base64,${imagePart.inlineData.data}`;
        }
    }
    
    throw new Error("No image generated.");

  } catch (error) {
    console.error("Gemini API Error (Image Mode):", error);
    throw error;
  }
};
