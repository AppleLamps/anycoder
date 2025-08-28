import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import mammoth from 'mammoth';
import Tesseract from 'tesseract.js';

declare global {
    interface Window {
        hljs: {
            highlightElement: (element: Element) => void;
            highlightAll: () => void;
        };
    }
}

(pdfjsLib as any).GlobalWorkerOptions.workerSrc = workerSrc;

// AnyCoder TypeScript - AI Code Generator
// Main application logic and UI interactions

interface GenerationConfig {
    prompt: string;
    language: string;
    model: string;
    apiKey?: string;
    webSearch: boolean;
    referenceFile?: File;
    websiteUrl?: string;
}

interface HistoryItem {
    id: string;
    prompt: string;
    code: string;
    language: string;
    timestamp: Date;
}

interface AIResponse {
    code: string | Record<string, string>; // string for single-file, map for multi-file
    language: string;
    explanation?: string;
}

class AnyCoder {
    private history: HistoryItem[] = [];
    private currentTheme = 'github-dark';
    private highlightTimeout?: ReturnType<typeof setTimeout>;
    private previewTimeout?: ReturnType<typeof setTimeout>;
    // New iterative editing context
    private currentCodeContext: string = '';
    // Multi-file current map (if applicable)
    private currentFiles: Record<string, string> | null = null;
    // Pyodide runtime
    private pyodide: {
        runPythonAsync: (code: string) => Promise<any>;
        globals: any;
    } | null = null;
    private pyodideReady = false;
    private cleanupHandlers: Array<() => void> = [];
    private blobUrls: string[] = [];

    // Language-specific system prompts for optimal AI performance
    private languagePrompts: Record<string, string> = {
        'typescript': `You are an expert TypeScript developer with deep knowledge of modern TypeScript patterns. Focus on:
- Strong typing with interfaces, types, and generics
- Modern ES6+ features (async/await, destructuring, arrow functions)
- Clean, maintainable code architecture with proper separation of concerns
- Comprehensive error handling with try-catch blocks
- Use of utility types and advanced TypeScript features
- Proper module imports/exports and dependency management
- Performance optimization and memory management`,
        
        'javascript': `You are an expert JavaScript developer specializing in modern ES6+ development. Focus on:
- Modern ES6+ syntax (arrow functions, destructuring, template literals, async/await)
- Clean, readable code with descriptive variable and function names
- Efficient DOM manipulation and event handling
- Proper use of closures, promises, and async patterns
- Performance optimization and best practices
- Cross-browser compatibility considerations
- Modular code organization`,
        
        'python': `You are an expert Python developer following industry best practices. Focus on:
- Pythonic code adhering to PEP 8 style guidelines
- Proper use of list comprehensions, generators, and iterators
- Clear docstrings and type hints for better code documentation
- Efficient algorithms and appropriate data structures
- Comprehensive exception handling with specific exception types
- Object-oriented programming principles when appropriate
- Performance optimization and memory efficiency`,
        
        'html': `You are an expert HTML developer focused on modern web standards. Focus on:
- Semantic HTML5 elements for better structure and meaning
- Accessibility best practices (ARIA labels, alt text, proper heading hierarchy)
- SEO-friendly markup with appropriate meta tags
- Mobile-responsive design principles
- Clean, well-indented, and properly nested markup
- Performance optimization (lazy loading, efficient structure)
- Cross-browser compatibility and progressive enhancement`,
        
        'css': `You are an expert CSS developer specializing in modern styling techniques. Focus on:
- Modern CSS3 features (flexbox, grid, custom properties, animations)
- Mobile-first responsive design with proper breakpoints
- Clean, organized stylesheets with logical structure
- Performance optimization (efficient selectors, minimal reflows)
- Cross-browser compatibility and vendor prefixes when needed
- Accessibility considerations (focus states, contrast ratios)
- Maintainable code with consistent naming conventions`,
        
        'json': `You are an expert at creating well-structured, valid JSON data. Focus on:
- Proper JSON syntax with correct quotation marks and formatting
- Logical data organization with intuitive key-value relationships
- Consistent naming conventions (camelCase or snake_case)
- Appropriate data types for different values
- Efficient structure that minimizes redundancy
- Clear hierarchy and nesting when appropriate
- Validation-ready format`,
        
        'markdown': `You are an expert technical writer specializing in clear documentation. Focus on:
- Clear, well-structured documentation with logical flow
- Proper markdown syntax and formatting
- Effective use of headers, lists, code blocks, and tables
- Professional formatting with consistent style
- Comprehensive coverage of topics with examples
- User-friendly navigation and organization
- Accessibility considerations in documentation structure`
    };

    constructor() {
        this.initializeEventListeners();
        this.loadTheme();
        this.loadHistory();
        this.initPyodide();
    }

    private validateUrl(url: string): boolean {
        try {
            const parsed = new URL(url);
            return ['http:', 'https:'].includes(parsed.protocol);
        } catch {
            return false;
        }
    }

    private sanitizeFilename(filename: string): string {
        // Remove path traversal attempts and invalid characters
        return filename
            .replace(/[^a-zA-Z0-9._-]/g, '_')
            .replace(/\.{2,}/g, '_')
            .substring(0, 255);
    }

    private validatePrompt(prompt: string): string {
        // Limit prompt length and remove potential injection attempts
        const MAX_PROMPT_LENGTH = 10000;
        return prompt
            .substring(0, MAX_PROMPT_LENGTH)
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ''); // Remove control characters
    }

    public destroy(): void {
        // Clean up all event listeners
        this.cleanupHandlers.forEach(cleanup => cleanup());
        this.cleanupHandlers = [];

        // Clear timeouts
        if (this.highlightTimeout) clearTimeout(this.highlightTimeout);
        if (this.previewTimeout) clearTimeout(this.previewTimeout);

        // Revoke any tracked blob URLs
        if (this.blobUrls && this.blobUrls.length > 0) {
            this.blobUrls.forEach(url => URL.revokeObjectURL(url));
            this.blobUrls = [];
        }

        // Revoke any blob URLs currently set on the preview iframe
        const previewFrame = document.getElementById('preview-frame') as HTMLIFrameElement;
        if (previewFrame?.src?.startsWith('blob:')) {
            URL.revokeObjectURL(previewFrame.src);
        }
    }

    private initializeEventListeners(): void {
        // Main generation button
        const generateBtn = document.getElementById('generate-btn') as HTMLButtonElement;
        generateBtn?.addEventListener('click', () => this.handleGenerate());

        // Clear button
        const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;
        clearBtn?.addEventListener('click', () => this.handleClear());

        // Tab navigation
        const tabBtns = document.querySelectorAll('.tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.target as HTMLButtonElement;
                const tabName = target.dataset.tab;
                if (tabName) this.switchTab(tabName);
            });
        });

        // Demo buttons
        const demoBtns = document.querySelectorAll('.demo-btn');
        demoBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.target as HTMLButtonElement;
                const prompt = target.dataset.prompt;
                if (prompt) this.setPrompt(prompt);
            });
        });

    // Copy button
        const copyBtn = document.getElementById('copy-btn') as HTMLButtonElement;
        copyBtn?.addEventListener('click', () => this.copyCode());

        // Download button
        const downloadBtn = document.getElementById('download-btn') as HTMLButtonElement;
        downloadBtn?.addEventListener('click', () => this.downloadCode());

    // Run button
    const runBtn = document.getElementById('run-btn') as HTMLButtonElement;
    runBtn?.addEventListener('click', () => this.runCode());

        // Theme selector
        const themeSelect = document.getElementById('theme-select') as HTMLSelectElement;
        themeSelect?.addEventListener('change', (e) => {
            const target = e.target as HTMLSelectElement;
            this.changeTheme(target.value);
        });

        // Language change handler
        const languageSelect = document.getElementById('language') as HTMLSelectElement;
        languageSelect?.addEventListener('change', () => this.updateCodeHighlighting());

        // File upload handler
        const fileUpload = document.getElementById('file-upload') as HTMLInputElement;
        const fileUploadButton = document.getElementById('file-upload-button');
        
        fileUpload?.addEventListener('change', (e) => this.handleFileUpload(e));
        fileUploadButton?.addEventListener('click', () => fileUpload?.click());
        
        // Drag and drop functionality
        fileUploadButton?.addEventListener('dragover', (e) => {
            e.preventDefault();
            fileUploadButton.style.borderColor = 'var(--primary-color)';
        });
        
        fileUploadButton?.addEventListener('dragleave', (e) => {
            e.preventDefault();
            fileUploadButton.style.borderColor = 'var(--border)';
        });
        
        fileUploadButton?.addEventListener('drop', (e) => {
            e.preventDefault();
            fileUploadButton.style.borderColor = 'var(--border)';
            const files = e.dataTransfer?.files;
            if (files && files.length > 0) {
                fileUpload.files = files;
                this.handleFileUpload({ target: fileUpload } as any);
            }
        });

        // Enter key handler for prompt
        const promptTextarea = document.getElementById('prompt') as HTMLTextAreaElement;
        promptTextarea?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                this.handleGenerate();
            }
        });
    }

    private async handleGenerate(): Promise<void> {
        const config = this.getGenerationConfig();

        // Validate and sanitize inputs
        config.prompt = this.validatePrompt(config.prompt);

        if (!config.prompt.trim()) {
            this.showToast('Please enter a prompt', 'error');
            return;
        }

        if (config.prompt.length < 3) {
            this.showToast('Prompt too short - please provide more detail', 'error');
            return;
        }

        if (config.websiteUrl && !this.validateUrl(config.websiteUrl)) {
            this.showToast('Invalid URL format', 'error');
            return;
        }

        // Continue with existing logic...
        this.setGenerating(true);

        try {
            const response = await this.generateCode(config);
            // Handle single vs multi-file
            if (typeof response.code === 'string') {
                this.currentFiles = null;
                this.currentCodeContext = response.code;
                this.displaySingleFile(response.code, config.language);
                this.addToHistory(config.prompt, response.code, config.language);
                this.updatePreview(response.code, config.language);
            } else {
                this.currentFiles = response.code;
                // set context from main file or concatenation
                this.currentCodeContext = this.concatFiles(response.code);
                this.displayMultiFile(response.code);
                this.updatePreviewFromFiles(response.code);
                // Save primary file into history for now
                const primary = this.pickPrimaryFile(response.code) || '';
                this.addToHistory(config.prompt, primary, config.language);
            }
            // Switch button text to Update Code
            this.setHasContext(true);
            this.showToast('Code generated successfully!', 'success');
            this.switchTab('code');
        } catch (error) {
            console.error('Generation error:', error);
            this.showToast(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
        } finally {
            this.setGenerating(false);
        }
    }

    private getGenerationConfig(): GenerationConfig {
        const promptEl = document.getElementById('prompt') as HTMLTextAreaElement;
        const languageEl = document.getElementById('language') as HTMLSelectElement;
        const modelEl = document.getElementById('model') as HTMLSelectElement;
        const apiKeyEl = document.getElementById('api-key') as HTMLInputElement;
        const webSearchEl = document.getElementById('web-search') as HTMLInputElement;
        const fileUploadEl = document.getElementById('file-upload') as HTMLInputElement;
        const websiteUrlEl = document.getElementById('website-url') as HTMLInputElement;

        return {
            prompt: promptEl?.value || '',
            language: languageEl?.value || 'html',
            model: modelEl?.value || 'Qwen/Qwen3-Coder-480B-A35B-Instruct',
            apiKey: apiKeyEl?.value || undefined,
            webSearch: webSearchEl?.checked || false,
            referenceFile: fileUploadEl?.files?.[0] || undefined,
            websiteUrl: websiteUrlEl?.value || undefined
        };
    }

    private async generateCode(config: GenerationConfig): Promise<AIResponse> {
        // Enhanced prompt with context
        let enhancedPrompt = this.buildEnhancedPrompt(config);

        // Add reference file content if provided
        if (config.referenceFile) {
            const fileContent = await this.readFileContent(config.referenceFile);
            enhancedPrompt += `\n\nReference file content:\n${fileContent}`;
        }

        // Add website content if URL provided
        if (config.websiteUrl) {
            try {
                const websiteContent = await this.fetchWebsiteContent(config.websiteUrl);
                enhancedPrompt += `\n\nWebsite to redesign:\n${websiteContent}`;
            } catch (error) {
                console.warn('Failed to fetch website content:', error);
            }
        }

        // Web search enhancement
        if (config.webSearch) {
            try {
                const searchResults = await this.performWebSearch(config.prompt, config.language);
                enhancedPrompt += `\n\nWeb search context:\n${searchResults}`;
            } catch (error) {
                console.warn('Web search failed:', error);
            }
        }

        // Use OpenRouter with OpenAI-compatible API
        const ai = await this.callOpenRouter(enhancedPrompt, config.language, config.model, config.apiKey);
        // Parse potential multi-file output
        if (typeof ai.code === 'string') {
            console.log('🔍 Checking for multi-file content in response:', ai.code.substring(0, 500) + '...');
            const parsed = this.parseMultiFile(ai.code);
            if (parsed) {
                console.log('✅ Multi-file detected! Files:', Object.keys(parsed));
                return { code: parsed, language: config.language };
            } else {
                console.log('❌ No multi-file pattern detected, treating as single file');
            }
        }
        return ai;
    }

    private buildEnhancedPrompt(config: GenerationConfig): string {
        // When updating existing code, include full context and keep the user prompt focused on the requested changes
        if (this.currentCodeContext && this.currentCodeContext.trim()) {
            return `You are updating the following project based on the user's request. Return the complete updated files only.\n\n<EXISTING_CODE>\n${this.currentCodeContext}\n</EXISTING_CODE>\n\nUser request:\n${config.prompt}`;
        }

        // For fresh generations, let the user prompt stand alone; formatting rules are enforced in the system prompt
        return config.prompt;
    }

    private buildSystemPrompt(language: string, hasContext: boolean): string {
        // Get language-specific prompt or fallback to generic
        const languageSpecificPrompt = this.languagePrompts[language] || 
            `You are an expert ${language} code generator inside AnyCoder.`;
        
        return [
            languageSpecificPrompt,
            '',

            'OUTPUT CONTRACT:',
            '- Output ONLY code. No explanations, no markdown, no backticks.',
            '- If multiple files are needed, delimit each file with a header line exactly:',
            '- // FILENAME: filename.ext',
            '- The header must be on its own line, then the file content starts on the next line.',
            '- Do not include any text outside files.',

            hasContext
                ? '- You are UPDATING an existing project. Keep file names and structure unless the user explicitly asks to change them. Return the full updated files.'
                : '- You are CREATING a new project. Use sensible defaults.',

            'WEB PROJECTS:',
            '- HTML, CSS, and JavaScript must be in separate files.',
            '- Never embed CSS in <style> or JS in <script> within HTML.',
            '- For web app tasks, you must output EXACTLY THREE FILES and NO OTHERS:',
            '- // FILENAME: index.html',
            '- // FILENAME: style.css',
            '- // FILENAME: script.js',
            '- Do NOT create more than one .html, more than one .css, or more than one .js file.',
            '- Do NOT output additional files, images, assets, or directories unless explicitly requested to add more files (which is not allowed by default).',
            '- Default names are fixed: index.html, style.css, script.js. Do not rename them unless the user explicitly requests a rename.',
            hasContext
                ? '- When updating, keep these three filenames and modify their contents only.'
                : '- When creating new, produce only these three files.',
            '- HTML must include <!DOCTYPE html>, <meta charset="UTF-8">, and a responsive <meta name="viewport">.',
            '- HTML must include <!DOCTYPE html>, <meta charset="UTF-8">, and a responsive <meta name="viewport">.',

            'NON-WEB PROJECTS:',
            '- Default to a single file unless the user asks for multiple.',
            '- Use sensible defaults: main.ts (TypeScript), index.js (JavaScript), main.py (Python), etc.',

            'QUALITY:',
            '- Produce modern, production-ready, readable code.',
            '- Minimize dependencies. No remote network calls or external CDNs unless the user requests them.',
            '- Add small, meaningful comments only when essential to understand the code.',

            'PARSING COMPATIBILITY:',
            '- The parser detects files via lines that match /^\\s*\/\/\\s*FILENAME:\\s*(.+)$/i.',
            '- Do not include markdown fences or extra headers.'
        ].filter(Boolean).join('\n');
    }

    private async callOpenRouter(
        prompt: string,
        language: string,
        model: string,
        apiKey?: string,
        retries: number = 3
    ): Promise<AIResponse> {
        console.log('🚀 Starting OpenRouter API call...');
        console.log('📡 Using proxy endpoint: /api-proxy/api/v1/chat/completions');
        console.log('🔑 API Key provided:', !!apiKey);
        console.log('🤖 Model:', model);

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        if (apiKey && apiKey.trim()) {
            headers['Authorization'] = `Bearer ${apiKey.trim()}`;
            console.log('✅ Authorization header added');
        } else {
            console.log('⚠️ No API key provided - using free tier');
        }

        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                console.log(`📤 Making fetch request (attempt ${attempt}/${retries})...`);

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 30000);

                const response = await fetch('/api-proxy/api/v1/chat/completions', {
                    method: 'POST',
                    headers,
                    signal: controller.signal,
                    body: JSON.stringify({
                        model: model,
                        messages: [
                            {
                                role: 'system',
                                content: this.buildSystemPrompt(language, !!this.currentCodeContext)
                            },
                            {
                                role: 'user',
                                content: prompt
                            }
                        ],
                        max_tokens: 4000,
                        temperature: 0.3,
                        stream: true
                    })
                });

                clearTimeout(timeoutId);
                console.log('📥 Response received. Status:', response.status);

                if (response.ok) {
                    return await this.processStreamingResponse(response, language);
                }

                if (response.status === 429) {
                    const retryAfter = response.headers.get('Retry-After');
                    const delay = retryAfter ? parseInt(retryAfter) * 1000 : Math.min(1000 * Math.pow(2, attempt), 10000);
                    console.log(`⏳ Rate limited. Retrying after ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }

                if (response.status === 401 || response.status === 403) {
                    throw new Error('Authentication failed. Please add your OpenRouter API key in API Settings.');
                }

                lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
            } catch (error: any) {
                if (error instanceof Error) {
                    if (error.name === 'AbortError') {
                        lastError = new Error('Request timeout - please try again');
                    } else {
                        lastError = error;
                    }
                } else {
                    lastError = new Error('Unknown error');
                }
                console.error(`🚫 Attempt ${attempt} failed:`, lastError);

                if (attempt < retries) {
                    const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
                    console.log(`⏳ Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        console.warn('All API attempts failed, using mock response');
        this.showToast('API unavailable - using demo response', 'warning');
        return this.getMockResponse(prompt, language);
    }

    private async processStreamingResponse(response: Response, language: string): Promise<AIResponse> {
        // Handle streaming response with real-time display
        const reader = response.body?.getReader();
        if (!reader) {
            throw new Error('Failed to get response reader');
        }

        const decoder = new TextDecoder();
        let content = '';

        // Initialize the code display for streaming
        this.initializeStreamingDisplay(language);

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') {
                            break;
                        }

                        try {
                            const parsed = JSON.parse(data);
                            const deltaContent = parsed.choices?.[0]?.delta?.content;
                            if (deltaContent) {
                                content += deltaContent;
                                // Update display in real-time
                                this.updateStreamingDisplay(content, language);
                            }
                        } catch (e) {
                            // Ignore JSON parsing errors for malformed chunks
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }

        const code = this.extractCodeFromResponse(content, language);
        return { code, language };
    }

    private getMockResponse(prompt: string, language: string): AIResponse {
        const mockResponses: Record<string, string> = {
            'html': `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Generated App</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 20px; }
        .container { max-width: 800px; margin: 0 auto; }
        .card { background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); padding: 20px; margin: 20px 0; }
        button { background: #007bff; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; }
        button:hover { background: #0056b3; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Generated Application</h1>
        <div class="card">
            <p>This is a demo response for: ${prompt}</p>
            <button onclick="alert('Hello from generated code!')">Click Me</button>
        </div>
    </div>
</body>
</html>`,
            'typescript': `interface AppConfig {
    name: string;
    version: string;
}

class Application {
    private config: AppConfig;

    constructor(config: AppConfig) {
        this.config = config;
    }

    public initialize(): void {
        console.log(\`Initializing \${this.config.name} v\${this.config.version}\`);
        // Application logic for: ${prompt}
    }

    public run(): void {
        this.initialize();
        console.log('Application is running...');
    }
}

// Usage
const app = new Application({
    name: 'Generated App',
    version: '1.0.0'
});

app.run();`,
            'javascript': `// Generated JavaScript for: ${prompt}
class App {
    constructor() {
        this.initialize();
    }

    initialize() {
        console.log('App initialized');
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.addEventListener('DOMContentLoaded', () => {
            console.log('DOM loaded, app ready');
        });
    }

    run() {
        console.log('App is running...');
    }
}

const app = new App();
app.run();`,
            'python': `#!/usr/bin/env python3
"""
Generated Python application for: ${prompt}
"""

class Application:
    def __init__(self):
        self.name = "Generated App"
        self.version = "1.0.0"
    
    def initialize(self):
        """Initialize the application"""
        print(f"Initializing {self.name} v{self.version}")
    
    def run(self):
        """Run the application"""
        self.initialize()
        print("Application is running...")

if __name__ == "__main__":
    app = Application()
    app.run()`,
            'css': `/* Generated CSS for: ${prompt} */
:root {
    --primary-color: #007bff;
    --secondary-color: #6c757d;
    --background: #f8f9fa;
    --text: #212529;
    --border: #dee2e6;
}

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: var(--background);
    color: var(--text);
    line-height: 1.6;
}

.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
}

.card {
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    padding: 24px;
    margin: 20px 0;
}

@media (max-width: 768px) {
    .container {
        padding: 10px;
    }
}`,
            'json': `{
  "name": "Generated Configuration",
  "description": "Generated for: ${prompt}",
  "version": "1.0.0",
  "settings": {
    "theme": "default",
    "language": "en",
    "features": {
      "darkMode": true,
      "notifications": true,
      "autoSave": false
    }
  },
  "dependencies": {
    "typescript": "^5.0.0",
    "react": "^18.0.0"
  }
}`,
            'markdown': `# Generated Documentation

## Overview

This document was generated for: **${prompt}**

## Features

- ✅ Modern design
- ✅ Responsive layout
- ✅ Accessibility support
- ✅ TypeScript integration

## Installation

\`\`\`bash
npm install
npm start
\`\`\`

## Usage

\`\`\`typescript
import { Application } from './app';

const app = new Application();
app.run();
\`\`\`

## Contributing

Please read our contributing guidelines before submitting PRs.

`
        };

        return {
            code: mockResponses[language] || `// Generated ${language} code for: ${prompt}\nconsole.log('Hello, World!');`,
            language
        };
    }

    private extractCodeFromResponse(text: string, language: string): string {
        // Try to extract code from markdown code blocks
        const codeBlockRegex = new RegExp(`\`\`\`${language}?\\s*([\\s\\S]*?)\`\`\``, 'i');
        const match = text.match(codeBlockRegex);
        
        if (match) {
            return match[1].trim();
        }

        // Fallback: return the raw text, removing any leading/trailing explanations
        const lines = text.split('\n');
        const codeStart = lines.findIndex(line => 
            line.includes('<!DOCTYPE') || 
            line.includes('<html') || 
            line.includes('function') ||
            line.includes('class ') ||
            line.includes('interface ') ||
            line.includes('def ') ||
            line.includes('import ') ||
            line.includes('{') ||
            line.trim().startsWith('//')
        );

        if (codeStart >= 0) {
            return lines.slice(codeStart).join('\n').trim();
        }

        return text.trim();
    }

    private async readFileContent(file: File): Promise<string> {
        const name = file.name.toLowerCase();
        const type = (file.type || '').toLowerCase();

        // Add file size check
        const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
        if (file.size > MAX_FILE_SIZE) {
            this.showToast('File too large. Maximum size is 10MB', 'error');
            return '';
        }

        const isPdf = name.endsWith('.pdf') || type === 'application/pdf';
        const isDocx = name.endsWith('.docx') || type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        const isImage = name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png') || type.startsWith('image/');

        try {
            if (isPdf) {
                this.showToast('Processing PDF...', 'success');
                const arrayBuffer = await file.arrayBuffer();
                const task = pdfjsLib.getDocument({ data: arrayBuffer });
                const pdf = await task.promise;

                // Add page limit check
                if (pdf.numPages > 100) {
                    this.showToast('PDF has too many pages (max 100)', 'error');
                    return '';
                }

                let fullText = '';
                for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                    const page = await pdf.getPage(pageNum);
                    const content = await page.getTextContent();
                    const strings = content.items
                        .map((item: any) => ('str' in item ? (item as any).str : ''))
                        .filter(Boolean);
                    fullText += strings.join(' ') + '\n\n';
                }
                this.showToast('PDF processed successfully', 'success');
                return fullText.trim();
            }

            if (isDocx) {
                const arrayBuffer = await file.arrayBuffer();
                const result = await mammoth.extractRawText({ arrayBuffer });
                return ((result && result.value) || '').trim();
            }

            if (isImage) {
                this.showToast('Processing image with OCR...', 'success');
                const objectUrl = URL.createObjectURL(file);
                try {
                    const result = await Tesseract.recognize(objectUrl, 'eng');
                    const text = result?.data?.text || '';
                    return text.trim();
                } finally {
                    URL.revokeObjectURL(objectUrl);
                }
            }

            // Fallback: treat as plain text
            return await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = () => reject(new Error('Failed to read file'));
                reader.readAsText(file);
            });
        } catch (err) {
            console.error('Failed to process file:', err);
            this.showToast('Failed to process file', 'error');
            // Best-effort fallback to text
            try {
                return await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result as string);
                    reader.onerror = () => reject(new Error('Failed to read file'));
                    reader.readAsText(file);
                });
            } catch {
                return '';
            }
        }
    }

    private async fetchWebsiteContent(url: string): Promise<string> {
        if (!this.validateUrl(url)) {
            throw new Error('Invalid URL format');
        }

        // Try server endpoint first (dev middleware or production function if provided)
        try {
            const response = await fetch(`/api/scrape?url=${encodeURIComponent(url)}`);
            if (response.ok) {
                return await response.text();
            } else {
                const errorText = await response.text().catch(() => response.statusText);
                console.warn('Primary scrape endpoint failed:', response.status, errorText);
            }
        } catch (e) {
            console.warn('Primary scrape endpoint unreachable, falling back:', e);
        }

        // Fallback: use a read-only, CORS-friendly proxy that returns extracted page text
        // Note: This usually returns page text, not full HTML, but is sufficient for prompt context.
        const fallbackUrl = `https://r.jina.ai/${url}`;
        const fallbackResp = await fetch(fallbackUrl, {
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.82 Safari/537.36'
            }
        });
        if (!fallbackResp.ok) {
            const errText = await fallbackResp.text().catch(() => fallbackResp.statusText);
            throw new Error(`Fallback fetch failed: ${fallbackResp.status} ${errText}`);
        }
        return await fallbackResp.text();
    }

    private async performWebSearch(query: string, language: string): Promise<string> {
        // Mock web search - in production, you'd use a search API
        return `Web search results for "${query}" in ${language} (API integration needed)`;
    }

    private displayCode(code: string, language: string): void {
        const codeElement = document.getElementById('generated-code');
        if (codeElement) {
            codeElement.textContent = code;
            codeElement.className = `hljs language-${language}`;
            
            // Apply syntax highlighting
            if (window.hljs) {
                window.hljs.highlightElement(codeElement);
            }
        }
    }

    private displaySingleFile(code: string, language: string): void {
        // hide file tabs
        const fileTabs = document.getElementById('file-tabs');
        const fileViews = document.getElementById('file-views');
        if (fileTabs) fileTabs.style.display = 'none';
        if (fileViews) {
            fileViews.innerHTML = `<pre><code id="generated-code" class="hljs language-${language}"></code></pre>`;
            const codeElement = document.getElementById('generated-code');
                if (codeElement) {
                codeElement.textContent = code;
                if (window.hljs) {
                    window.hljs.highlightElement(codeElement);
                }
            }
        }
    }

    private displayMultiFile(files: Record<string, string>): void {
        const fileTabs = document.getElementById('file-tabs');
        const fileViews = document.getElementById('file-views');
        if (!fileTabs || !fileViews) return;

        // Build tabs and views
        const filenames = Object.keys(files);
        fileTabs.innerHTML = filenames.map((name, idx) => `<button class="file-tab ${idx===0?'active':''}" data-file="${this.escapeHtml(name)}">${this.escapeHtml(name)}</button>`).join('');
        fileTabs.style.display = 'flex';

        fileViews.innerHTML = filenames.map((name, idx) => {
            const language = this.getLanguageFromFilename(name);
            return `
            <div class="file-view ${idx===0?'active':''}" data-file="${this.escapeHtml(name)}">
                <pre><code class="hljs language-${language}">${this.escapeHtml(files[name])}</code></pre>
            </div>
        `;
        }).join('');

        // attach handlers
        fileTabs.querySelectorAll('.file-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const fname = (tab as HTMLElement).dataset.file;
                if (!fname) return;
                // activate tab
                fileTabs.querySelectorAll('.file-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                // activate view
                fileViews.querySelectorAll('.file-view').forEach(view => {
                    view.classList.toggle('active', (view as HTMLElement).dataset.file === fname);
                });
            });
        });

        // highlight
        if (window.hljs) {
            fileViews.querySelectorAll('code').forEach(codeEl => window.hljs.highlightElement(codeEl));
        }
    }

    private getLanguageFromFilename(filename: string): string {
        const ext = filename.toLowerCase().split('.').pop();
        const extMap: Record<string, string> = {
            'html': 'html',
            'htm': 'html', 
            'css': 'css',
            'js': 'javascript',
            'mjs': 'javascript',
            'jsx': 'javascript',
            'ts': 'typescript',
            'tsx': 'typescript',
            'py': 'python',
            'json': 'json',
            'md': 'markdown',
            'txt': 'plaintext'
        };
        return extMap[ext || ''] || 'plaintext';
    }

    private initializeStreamingDisplay(language: string): void {
        const codeElement = document.getElementById('generated-code');
        if (codeElement) {
            // Clear existing content and show streaming started
            codeElement.innerHTML = '<span class="streaming-cursor">█</span>';
            codeElement.className = `hljs language-${language}`;
            
            // Switch to code tab to show streaming
            this.switchTab('code');
        }
    }

    private updateStreamingDisplay(content: string, language: string): void {
        const codeElement = document.getElementById('generated-code');
        if (codeElement) {
            // Escape HTML content and add streaming cursor at the end
            const escapedContent = this.escapeHtml(content);
            codeElement.innerHTML = escapedContent + '<span class="streaming-cursor">█</span>';
            codeElement.className = `hljs language-${language}`;
            
        // Apply syntax highlighting with a small delay to avoid too frequent updates
        if (window.hljs) {
                // Debounce highlighting updates
                clearTimeout(this.highlightTimeout);
                this.highlightTimeout = setTimeout(() => {
                    // Temporarily remove cursor, highlight, then add it back
                    const cursorElement = codeElement.querySelector('.streaming-cursor');
                    const cursor = cursorElement?.outerHTML || '';
                    if (cursorElement) {
                        cursorElement.remove();
                    }
                    
            window.hljs.highlightElement(codeElement);
                    
                    // Add cursor back
                    if (cursor) {
                        codeElement.innerHTML += cursor;
                    }
                }, 200);
            }
            
            // Auto-scroll to bottom if content is long
            codeElement.scrollTop = codeElement.scrollHeight;
            
            // For HTML content, update live preview during streaming (debounced)
            if (language === 'html' && content.includes('</html>')) {
                clearTimeout(this.previewTimeout);
                this.previewTimeout = setTimeout(() => {
                    const extractedCode = this.extractCodeFromResponse(content, language);
                    if (extractedCode.trim()) {
                        this.updatePreview(extractedCode, language);
                    }
                }, 1000); // Update preview 1 second after HTML looks complete
            }
        }
    }

    private updatePreview(code: string, language: string): void {
        // Clean up previous blob URLs
        if (this.blobUrls && this.blobUrls.length > 0) {
            this.blobUrls.forEach(url => URL.revokeObjectURL(url));
            this.blobUrls = [];
        }

        const previewFrame = document.getElementById('preview-frame') as HTMLIFrameElement;
        const previewPlaceholder = document.getElementById('preview-placeholder');

        if (language === 'html' && previewFrame && previewPlaceholder) {
            // Show HTML preview
            previewPlaceholder.style.display = 'none';
            previewFrame.style.display = 'block';
            
            const blob = new Blob([code], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            this.blobUrls.push(url); // Track for cleanup
            previewFrame.src = url;
        } else if (previewPlaceholder && previewFrame) {
            // Hide preview for non-HTML content
            previewFrame.style.display = 'none';
            previewPlaceholder.style.display = 'flex';
        }
    }

    private updatePreviewFromFiles(files: Record<string, string>): void {
        const indexHtml = files['index.html'];
        if (indexHtml) {
            // Inject CSS and JS into HTML for proper preview
            const enhancedHtml = this.injectAssetsIntoHtml(indexHtml, files);
            this.updatePreview(enhancedHtml, 'html');
        } else {
            // attempt to build a basic HTML that links assets
            const htmlCandidate = Object.keys(files).find(f => f.toLowerCase().endsWith('.html'));
            if (htmlCandidate) {
                const enhancedHtml = this.injectAssetsIntoHtml(files[htmlCandidate], files);
                this.updatePreview(enhancedHtml, 'html');
            }
        }
    }

    private injectAssetsIntoHtml(html: string, files: Record<string, string>): string {
        let enhancedHtml = html;
        
        // Find CSS files and inject them as <style> tags
        const cssFiles = Object.keys(files).filter(f => f.toLowerCase().endsWith('.css'));
        if (cssFiles.length > 0) {
            const cssContent = cssFiles.map(f => files[f]).join('\n\n');
            const styleTag = `<style>\n${cssContent}\n</style>`;
            
            // Try to inject before </head>, fallback to beginning of <body>
            if (enhancedHtml.includes('</head>')) {
                enhancedHtml = enhancedHtml.replace('</head>', `${styleTag}\n</head>`);
            } else if (enhancedHtml.includes('<body>')) {
                enhancedHtml = enhancedHtml.replace('<body>', `<body>\n${styleTag}`);
            } else {
                enhancedHtml = styleTag + '\n' + enhancedHtml;
            }
        }

        // Find JS files and inject them as <script> tags
        const jsFiles = Object.keys(files).filter(f => f.toLowerCase().endsWith('.js'));
        if (jsFiles.length > 0) {
            const jsContent = jsFiles.map(f => files[f]).join('\n\n');
            const scriptTag = `<script>\n${jsContent}\n</script>`;
            
            // Try to inject before </body>, fallback to end
            if (enhancedHtml.includes('</body>')) {
                enhancedHtml = enhancedHtml.replace('</body>', `${scriptTag}\n</body>`);
            } else {
                enhancedHtml = enhancedHtml + '\n' + scriptTag;
            }
        }

        return enhancedHtml;
    }

    // ---------- Multi-file helpers ----------
    private parseMultiFile(raw: string): Record<string, string> | null {
        console.log('🔍 Parsing multi-file content. Raw length:', raw.length);
        console.log('📄 First 200 chars:', raw.substring(0, 200));
        
        const lines = raw.split(/\r?\n/);
        const files: Record<string, string> = {};
        let current: string | null = null;
        let buffer: string[] = [];

        const flush = () => {
            if (current !== null) {
                // More conservative trimming - only remove leading/trailing empty lines
                const content = buffer.join('\n');
                const trimmed = content.replace(/^\n+/, '').replace(/\n+$/, '');
                files[current] = trimmed;
                console.log(`📝 Found file: ${current} (${trimmed.length} chars)`);
            }
            current = null;
            buffer = [];
        };

        for (const line of lines) {
            const m = line.match(/^\s*\/\/\s*FILENAME:\s*(.+)$/i);
            if (m) {
                flush();
                current = m[1].trim();
                console.log(`🏷️ New file detected: ${current}`);
            } else {
                buffer.push(line);
            }
        }
        flush();

        const count = Object.keys(files).length;
        console.log(`📊 Total files found: ${count}`, Object.keys(files));
        return count > 1 ? files : null;
    }

    private concatFiles(files: Record<string, string>): string {
        return Object.entries(files).map(([n, c]) => `// FILENAME: ${n}\n${c}`).join('\n\n');
    }

    private pickPrimaryFile(files: Record<string, string>): string | null {
        if (files['index.html']) return files['index.html'];
        const html = Object.keys(files).find(f => f.toLowerCase().endsWith('.html'));
        if (html) return files[html];
        const js = Object.keys(files).find(f => f.toLowerCase().endsWith('.js'));
        if (js) return files[js];
        const first = Object.keys(files)[0];
        return first ? files[first] : null;
    }

    private addToHistory(prompt: string, code: string, language: string): void {
        const historyItem: HistoryItem = {
            id: Date.now().toString(),
            prompt,
            code,
            language,
            timestamp: new Date()
        };

        this.history.unshift(historyItem);
        
        // Keep only last 50 items
        if (this.history.length > 50) {
            this.history = this.history.slice(0, 50);
        }

        this.saveHistory();
        this.updateHistoryDisplay();
    }

    private updateHistoryDisplay(): void {
        const historyList = document.getElementById('history-list');
        if (!historyList) return;

        if (this.history.length === 0) {
            historyList.innerHTML = '<p class="empty-state">No history yet. Generate some code to see it here!</p>';
            return;
        }

        historyList.innerHTML = this.history.map(item => `
            <div class="history-item" data-id="${item.id}">
                <div class="prompt">${this.escapeHtml(item.prompt)}</div>
                <div class="meta">
                    <span>${item.language}</span>
                    <span>${this.formatDate(item.timestamp)}</span>
                </div>
            </div>
        `).join('');

        // Add click handlers to history items
        historyList.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const target = e.currentTarget as HTMLElement;
                const id = target.dataset.id;
                if (id) this.loadHistoryItem(id);
            });
        });
    }

    private loadHistoryItem(id: string): void {
        const item = this.history.find(h => h.id === id);
        if (item) {
            this.displayCode(item.code, item.language);
            this.updatePreview(item.code, item.language);
            this.setPrompt(item.prompt);
            this.setLanguage(item.language);
            this.switchTab('code');
        }
    }

    private setPrompt(prompt: string): void {
        const promptEl = document.getElementById('prompt') as HTMLTextAreaElement;
        if (promptEl) {
            promptEl.value = prompt;
        }
    }

    private setLanguage(language: string): void {
        const languageEl = document.getElementById('language') as HTMLSelectElement;
        if (languageEl) {
            languageEl.value = language;
        }
    }

    private switchTab(tabName: string): void {
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            const buttonEl = btn as HTMLButtonElement;
            buttonEl.classList.toggle('active', buttonEl.dataset.tab === tabName);
        });

        // Update tab panels
        document.querySelectorAll('.tab-panel').forEach(panel => {
            panel.classList.toggle('active', panel.id === `${tabName}-tab`);
        });
    }

    private handleClear(): void {
        // Clear form inputs
        const promptEl = document.getElementById('prompt') as HTMLTextAreaElement;
        const fileUploadEl = document.getElementById('file-upload') as HTMLInputElement;
        const websiteUrlEl = document.getElementById('website-url') as HTMLInputElement;

        if (promptEl) promptEl.value = '';
        if (fileUploadEl) {
            fileUploadEl.value = '';
            // Also reset the custom file upload button
            this.handleFileUpload({ target: fileUploadEl } as any);
        }
        if (websiteUrlEl) websiteUrlEl.value = '';

    // Reset state
    this.currentCodeContext = '';
    this.currentFiles = null;
    this.setHasContext(false);

    // Clear generated code
    this.displaySingleFile('// Your generated code will appear here...', 'javascript');
        
        // Clear preview
        const previewFrame = document.getElementById('preview-frame') as HTMLIFrameElement;
        const previewPlaceholder = document.getElementById('preview-placeholder');
        
        if (previewFrame && previewPlaceholder) {
            previewFrame.style.display = 'none';
            previewPlaceholder.style.display = 'flex';
        }

    // Clear output console
    const output = document.getElementById('output-console');
    if (output) output.textContent = '';

    this.showToast('Cleared successfully', 'success');
    }

    private async copyCode(): Promise<void> {
        const codeElement = document.getElementById('generated-code');
        if (codeElement) {
            try {
                await navigator.clipboard.writeText(codeElement.textContent || '');
                this.showToast('Code copied to clipboard', 'success');
            } catch (error) {
                this.showToast('Failed to copy code', 'error');
            }
        }
    }

    private async downloadCode(): Promise<void> {
        const codeElement = document.getElementById('generated-code');
        const languageEl = document.getElementById('language') as HTMLSelectElement;
        
        if (this.currentFiles) {
            // zip download
            try {
                const JSZip = await import('jszip');
                const zip = new JSZip.default();
                for (const [name, content] of Object.entries(this.currentFiles)) {
                    zip.file(name, content);
                }
                const blob = await zip.generateAsync({ type: 'blob' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'project.zip';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                this.showToast('Downloaded project.zip', 'success');
                return;
            } catch (e) {
                console.error('Zip failed', e);
                this.showToast('Failed to create zip', 'error');
            }
        }

        if (codeElement && languageEl) {
            const code = codeElement.textContent || '';
            const language = languageEl.value;
            const extensions: Record<string, string> = {
                'html': 'html',
                'typescript': 'ts',
                'javascript': 'js',
                'python': 'py',
                'css': 'css',
                'json': 'json',
                'markdown': 'md'
            };
            
            const extension = extensions[language] || 'txt';
            const filename = `generated-code.${extension}`;
            
            const blob = new Blob([code], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.showToast(`Downloaded ${filename}`, 'success');
        }
    }

    private changeTheme(theme: string): void {
        this.currentTheme = theme;
        const link = document.querySelector('link[href*="highlight.js"]') as HTMLLinkElement;
        if (link) {
            link.href = `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/${theme}.min.css`;
        }
        
        // Re-highlight code with new theme
        this.updateCodeHighlighting();
        localStorage.setItem('anycoder-theme', theme);
    }

    private updateCodeHighlighting(): void {
        const codeElement = document.getElementById('generated-code');
        if (codeElement && window.hljs) {
            window.hljs.highlightElement(codeElement);
        }
    }

    private loadTheme(): void {
        const savedTheme = localStorage.getItem('anycoder-theme');
        if (savedTheme) {
            const themeSelect = document.getElementById('theme-select') as HTMLSelectElement;
            if (themeSelect) {
                themeSelect.value = savedTheme;
                this.changeTheme(savedTheme);
            }
        }
    }

    private saveHistory(): void {
        localStorage.setItem('anycoder-history', JSON.stringify(this.history));
    }

    private loadHistory(): void {
        const saved = localStorage.getItem('anycoder-history');
        if (saved) {
            try {
                this.history = JSON.parse(saved).map((item: any) => ({
                    ...item,
                    timestamp: new Date(item.timestamp)
                }));
                this.updateHistoryDisplay();
            } catch (error) {
                console.warn('Failed to load history:', error);
            }
        }
    }

    // Modify generate button label depending on context
    private setHasContext(hasContext: boolean) {
        const generateBtn = document.getElementById('generate-btn') as HTMLButtonElement;
        const btnText = generateBtn?.querySelector('.btn-text') as HTMLElement;
        if (btnText) {
            btnText.textContent = hasContext ? 'Update Code' : 'Generate';
        }
    }

    private handleFileUpload(event: Event): void {
        const target = event.target as HTMLInputElement;
        const file = target.files?.[0];
        const fileUploadButton = document.getElementById('file-upload-button');
        const fileUploadText = fileUploadButton?.querySelector('.file-upload-text');
        
        if (file && fileUploadButton && fileUploadText) {
            // Update button appearance
            fileUploadButton.classList.add('has-file');
            fileUploadText.innerHTML = `
                <span>${file.name}</span>
                <button class="file-remove-btn" title="Remove file">×</button>
            `;
            
            // Add click handler to remove button
            const removeBtn = fileUploadText.querySelector('.file-remove-btn');
            removeBtn?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeFile();
            });
            
            this.showToast(`File selected: ${file.name}`, 'success');
        } else if (fileUploadButton && fileUploadText) {
            // Reset button appearance
            fileUploadButton.classList.remove('has-file');
            fileUploadText.textContent = 'Choose file or drag & drop';
        }
    }

    private removeFile(): void {
        const fileUpload = document.getElementById('file-upload') as HTMLInputElement;
        const fileUploadButton = document.getElementById('file-upload-button');
        const fileUploadText = fileUploadButton?.querySelector('.file-upload-text');
        
        if (fileUpload) {
            fileUpload.value = '';
        }
        
        if (fileUploadButton && fileUploadText) {
            fileUploadButton.classList.remove('has-file');
            fileUploadText.textContent = 'Choose file or drag & drop';
        }
        
        this.showToast('File removed', 'success');
    }

    private setGenerating(isGenerating: boolean): void {
        const generateBtn = document.getElementById('generate-btn') as HTMLButtonElement;
        const btnText = generateBtn?.querySelector('.btn-text') as HTMLElement;
        const btnLoader = generateBtn?.querySelector('.btn-loader') as HTMLElement;

        if (generateBtn && btnText && btnLoader) {
            generateBtn.disabled = isGenerating;
            if (isGenerating) {
                btnText.textContent = 'Generating...';
                btnText.style.display = 'inline';
                btnLoader.style.display = 'inline';
            } else {
                // preserve context-aware label
                btnText.textContent = this.currentCodeContext ? 'Update Code' : 'Generate';
                btnText.style.display = 'inline';
                btnLoader.style.display = 'none';
            }
        }
    }

    private showToast(message: string, type: 'success' | 'error' | 'warning' = 'success'): void {
        const toast = document.getElementById('status-toast');
        if (toast) {
            toast.textContent = message;
            toast.className = `toast ${type} show`;
            
            setTimeout(() => {
                toast.classList.remove('show');
            }, 3000);
        }
    }

    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    private formatDate(date: Date): string {
        return new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    }

    // ---------- Pyodide and runners ----------
    private async initPyodide() {
        try {
            const mod = await import('pyodide');
            const loadPyodide = (mod as any).loadPyodide || (mod as any).default;
            if (!loadPyodide) throw new Error('Pyodide load function missing');
            this.pyodide = await loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.0/full/' });
            this.pyodideReady = true;
            this.showToast('Pyodide ready for Python execution', 'success');
        } catch (e) {
            console.warn('Pyodide init failed', e);
        }
    }

    private appendOutput(msg: string, type: 'log' | 'error' = 'log') {
        const out = document.getElementById('output-console');
        if (!out) return;
        const line = document.createElement('div');
        line.textContent = msg;
        line.style.color = type === 'error' ? '#fda4af' : '#e5e7eb';
        out.appendChild(line);
        out.scrollTop = out.scrollHeight;
    }

    private clearOutput() {
        const out = document.getElementById('output-console');
        if (out) out.textContent = '';
    }

    private async runCode() {
        this.clearOutput();
        const langEl = document.getElementById('language') as HTMLSelectElement;
        const language = langEl?.value || 'javascript';

        if (this.currentFiles) {
            if (this.currentFiles['index.html']) {
                this.updatePreviewFromFiles(this.currentFiles);
                this.switchTab('preview');
                return;
            }
            const jsName = Object.keys(this.currentFiles).find(n => n.toLowerCase().endsWith('.js'));
            if (jsName) {
                await this.runJavascript(this.currentFiles[jsName]);
                this.switchTab('output');
                return;
            }
        }

        const codeEl = document.getElementById('generated-code');
        const code = codeEl?.textContent || '';
        if (language === 'html') {
            this.updatePreview(code, 'html');
            this.switchTab('preview');
            return;
        }
        if (language === 'javascript' || language === 'typescript') {
            await this.runJavascript(code);
            this.switchTab('output');
            return;
        }
        if (language === 'python') {
            await this.runPython(code);
            this.switchTab('output');
            return;
        }
        this.appendOutput('Run not supported for this language');
    }

    private async runJavascript(code: string) {
        const iframe = document.createElement('iframe');
        iframe.setAttribute('sandbox', 'allow-scripts');
        iframe.style.display = 'none';
        document.body.appendChild(iframe);
        try {
            const script = `
                (function(){
                    const _log = console.log;
                    const _err = console.error;
                    const q = [];
                    console.log = function(...args){ q.push({t:'log', v: args.map(String).join(' ')}); _log.apply(console, args); };
                    console.error = function(...args){ q.push({t:'error', v: args.map(String).join(' ')}); _err.apply(console, args); };
                    try {
                        ${code}
                    } catch(e) {
                        console.error(String(e));
                    }
                    window.parent.postMessage({ type: 'anycoder-console', data: q }, '*');
                })();
            `;
            iframe.contentDocument?.open();
            iframe.contentDocument?.write(`<script>${script}<\/script>`);
            iframe.contentDocument?.close();

            const handler = (ev: MessageEvent) => {
                if (ev.data && ev.data.type === 'anycoder-console') {
                    const q = ev.data.data as Array<{t:string, v:string}>;
                    q.forEach(item => this.appendOutput(item.v, item.t==='error'?'error':'log'));
                    window.removeEventListener('message', handler);
                    document.body.removeChild(iframe);
                }
            };
            window.addEventListener('message', handler);
        } catch (e: any) {
            this.appendOutput(String(e), 'error');
            document.body.removeChild(iframe);
        }
    }

    private async runPython(code: string) {
        if (!this.pyodideReady) {
            this.appendOutput('Initializing Python runtime, please wait...');
            try { await this.initPyodide(); } catch {}
        }
        if (!this.pyodide) {
            this.appendOutput('Python runtime not available', 'error');
            return;
        }
        try {
            const py = this.pyodide;
            const wrapped = `
import sys
from io import StringIO
_stdout = sys.stdout
_stderr = sys.stderr
sys.stdout = StringIO()
sys.stderr = StringIO()
err_msg = None
try:
${code.split('\n').map(l=> '    '+l).join('\n')}
except Exception as e:
    err_msg = str(e)
out = sys.stdout.getvalue()
err = sys.stderr.getvalue()
sys.stdout = _stdout
sys.stderr = _stderr
out, err, err_msg
`;
            const result = await py.runPythonAsync(wrapped);
            const [out, err, err_msg] = result as [string, string, string | null];
            if (out) this.appendOutput(out);
            if (err) this.appendOutput(err, 'error');
            if (err_msg) this.appendOutput(err_msg, 'error');
        } catch (e: any) {
            this.appendOutput(String(e), 'error');
        }
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new AnyCoder();
});
