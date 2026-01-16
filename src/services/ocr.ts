// src/services/ocr.ts
// OCR service using vision-language model (olmOCR)

import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { Config } from '../config.js';
import { info, warn, debug, error } from '../utils/logger.js';

const OCR_PROMPT = `Extract all text from this image. Output only the text content, preserving the general structure (paragraphs, lists, tables). Do not add any commentary or description.`;

export class OCRService {
  private config: Config;
  private client: OpenAI | null = null;
  private healthy = false;

  constructor(config: Config) {
    this.config = config;

    if (config.ocr.enabled && config.ocr.url) {
      this.client = new OpenAI({
        baseURL: config.ocr.url,
        apiKey: 'not-needed-for-local',
      });
    }
  }

  async initialize(): Promise<void> {
    if (!this.client || !this.config.ocr.url) {
      info('OCR service disabled (no OCR_URL configured)');
      return;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`${this.config.ocr.url}/models`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        this.healthy = true;
        info('OCR service initialized', { url: this.config.ocr.url, model: this.config.ocr.model });
      } else {
        warn('OCR service health check failed', { status: response.status });
      }
    } catch (e) {
      warn('OCR service unavailable', { error: String(e) });
    }
  }

  isAvailable(): boolean {
    return this.healthy && this.client !== null;
  }

  /**
   * Extract text from an image file using OCR.
   */
  async extractText(imagePath: string): Promise<string | null> {
    if (!this.isAvailable()) {
      warn('OCR not available');
      return null;
    }

    try {
      // Read and encode image
      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = imageBuffer.toString('base64');
      
      // Determine mime type from extension
      const ext = path.extname(imagePath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp',
        '.tiff': 'image/tiff',
        '.tif': 'image/tiff',
      };
      const mimeType = mimeTypes[ext] || 'image/png';

      // Log enough to verify we're getting different images
      const imageHash = imageBuffer.slice(0, 100).toString('base64').slice(0, 20);
      info('OCR processing image', { 
        path: imagePath, 
        size: imageBuffer.length, 
        mimeType,
        imageHash, // First 20 chars of base64 of first 100 bytes
      });

      const response = await this.client!.chat.completions.create({
        model: this.config.ocr.model || 'olmocr',
        max_tokens: this.config.ocr.maxTokens,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`,
                },
              },
              {
                type: 'text',
                text: OCR_PROMPT,
              },
            ],
          },
        ],
      });

      const text = response.choices[0]?.message?.content?.trim() || null;
      
      if (text) {
        debug('OCR extracted text', { chars: text.length });
      }

      return text;
    } catch (e) {
      error('OCR extraction failed', { error: String(e), path: imagePath });
      return null;
    }
  }

  /**
   * Check if a file is an image that can be OCR'd.
   */
  isOCRableImage(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif'];
    return imageExtensions.includes(ext);
  }
}
