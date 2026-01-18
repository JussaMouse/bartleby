// src/services/ocr.ts
// OCR service using vision-language model (olmOCR)

import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Config } from '../config.js';
import { info, warn, debug, error } from '../utils/logger.js';

const OCR_PROMPT = `Extract all visible text from this image. Return ONLY the extracted text. No labels, no prefixes, no commentary.`;

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

      // Log actual SHA-256 hash to verify different images
      const imageHash = crypto.createHash('sha256').update(imageBuffer).digest('hex').slice(0, 16);
      info('OCR processing image', { 
        path: imagePath, 
        size: imageBuffer.length, 
        mimeType,
        imageHash,
      });

      // Use raw fetch instead of OpenAI SDK to ensure completely stateless requests
      const requestBody = {
        model: this.config.ocr.model || 'olmocr',
        max_tokens: this.config.ocr.maxTokens,
        temperature: 0,
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
      };

      debug('OCR request', { 
        model: requestBody.model,
        messageCount: requestBody.messages.length,
        contentParts: requestBody.messages[0].content.length,
      });

      const fetchResponse = await fetch(`${this.config.ocr.url}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!fetchResponse.ok) {
        throw new Error(`OCR request failed: ${fetchResponse.status}`);
      }

      const response = await fetchResponse.json() as any;
      const text = response.choices?.[0]?.message?.content?.trim() || null;
      
      if (text) {
        // Log first 100 chars to verify different responses
        info('OCR extracted text', { 
          chars: text.length,
          preview: text.slice(0, 100).replace(/\n/g, ' '),
        });
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
