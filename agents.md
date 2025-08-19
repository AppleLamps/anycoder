# agents.md

## Project Overview

AnyCoder is a TypeScript-based web application built with Vite that provides AI-powered code generation capabilities. The project features a modern browser-based UI with support for multiple AI providers, document processing, and real-time code execution using Pyodide.

## Build & Commands

**Install dependencies:**
```bash
npm install
```

**Start development server:**
```bash
npm run dev
```

**Build for production:**
```bash
npm run build
```

**Preview production build:**
```bash
npm run preview
```

**Start server (alias for dev):**
```bash
npm start
```

## Code Style

The project uses TypeScript with strict mode enabled and follows these conventions:
- **Target:** ES2020 with DOM libraries
- **Module system:** ESNext with Node resolution
- **Strict TypeScript:** All strict checks enabled
- **File structure:** Source files in `src/`, build output in `dist/`
- **Import style:** ES modules with proper type declarations
- **API structure:** Serverless functions in `api/` directory for Vercel deployment

## Testing

**Testing framework:** No formal testing framework is currently configured.
**Test file conventions:** N/A - no test files present in the codebase.

*Note: Consider adding a testing framework like Vitest or Jest for future development.*

## Pull Request Instructions

**General guidelines:**
- Fork the repository and create a feature branch: `git checkout -b feature-name`
- Make changes and test both TypeScript functionality if applicable
- Submit pull request with clear description of changes

**Required checks before committing:**
- Ensure TypeScript compilation succeeds: `npm run build`
- Test the development server: `npm run dev`
- Verify no console errors in browser developer tools

## Security & Validations

**API Key Management:**
- Never hardcode API keys in source code
- API keys should be entered through the UI settings panel
- The application supports multiple AI providers (OpenAI, Anthropic, Hugging Face)

**CORS and Network Security:**
- Web scraping is limited by browser CORS policies
- API proxy configuration in `vite.config.ts` handles external API calls safely
- User-Agent headers are set appropriately for web requests

**File Upload Security:**
- Supported file types: PDF, DOCX, images for OCR processing
- File processing happens client-side using browser-safe libraries
- No server-side file storage or processing

**General Security Rules:**
- Validate all user inputs before processing
- Use environment variables for sensitive configuration
- Implement proper error handling for API calls
- Sanitize any dynamically generated content before rendering

**Dependencies Security:**
- Keep all npm dependencies updated regularly
- Monitor for security vulnerabilities in packages
- Use official CDNs for external resources (highlight.js, fonts)
