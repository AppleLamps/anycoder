# AnyCoder TypeScript

A powerful browser-based AI code generator with advanced document processing, OCR capabilities, and real-time Python code execution. Built with TypeScript, Vite, and modern web technologies.

## ✨ Features

- **🤖 AI-Powered Code Generation** - Multiple models including Qwen3 Coder, GPT-5, Claude, Gemini
- **📝 Multi-File Project Generation** - Automatically creates organized project structures (HTML/CSS/JS)
- **🔄 Iterative Code Editing** - Update and modify existing code with context awareness
- **📄 Document Processing** - PDF and DOCX file parsing and analysis
- **🖼️ OCR Capabilities** - Extract text from images using Tesseract.js
- **🌐 Website Redesign** - Analyze and redesign existing websites from URLs
- **🔍 Web Search Integration** - Enhanced prompts with real-time web search
- **🐍 Python Code Execution** - Run Python code directly in the browser using Pyodide
- **💾 Export & Download** - Save generated code as ZIP files or individual files
- **📱 Responsive Design** - Modern UI with dark/light theme support
- **📋 Code History** - Track and revisit previous generations

## 🚀 Quick Start

### Prerequisites
- Node.js 16+ and npm
- Modern web browser
- OpenRouter API key (get one at [openrouter.ai/keys](https://openrouter.ai/keys))

### Installation

```bash
# Clone repository
git clone https://github.com/AppleLamps/anycoder.git
cd anycoder

# Install dependencies
npm install

# Start development server
npm run dev
```

Access at: http://localhost:5173

### Development Commands

```bash
# Development server with hot reload
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Start server (alias for dev)
npm start
```

## 🔧 Configuration

### API Setup
1. Get your API key from [OpenRouter](https://openrouter.ai/keys)
2. Enter it in the "API Settings" section in the UI
3. Choose from available AI models (free and premium options)

### Supported File Types
- **Text Files**: `.txt`, `.md`, `.json`, `.js`, `.ts`, `.html`, `.css`, `.py`
- **Documents**: `.pdf`, `.docx`
- **Images**: `.jpg`, `.jpeg`, `.png` (OCR processing)

## 🎯 Usage Examples

### Basic Code Generation
1. Enter your prompt: "Create a todo app with React"
2. Select language: "TypeScript"
3. Choose AI model
4. Click "Generate"

### Multi-File Projects
The app automatically detects when to create multiple files:
```
// Generated files for "Create a portfolio website"
- index.html (structure)
- style.css (styling) 
- script.js (interactivity)
```

### Iterative Editing
After generating code, modify it by:
1. Adding new requirements: "Add dark mode toggle"
2. Clicking "Update Code" 
3. The AI maintains context and updates existing files

### Document Analysis
1. Upload a PDF/DOCX file
2. Ask: "Summarize this document and create a webpage"
3. The AI processes the document content and generates code

## 🏗️ Architecture

### Core Technologies
- **Vite** - Build tool and development server
- **TypeScript** - Type-safe JavaScript
- **Pyodide** - Python runtime in WebAssembly
- **PDF.js** - PDF processing
- **Mammoth.js** - DOCX parsing
- **Tesseract.js** - OCR processing
- **Highlight.js** - Syntax highlighting

### Project Structure
```
├── src/
│   ├── index.ts          # Main application logic
│   └── types/
│       └── shims.d.ts    # Type declarations
├── api/
│   └── scrape.ts         # Web scraping API endpoint
├── index.html            # Main HTML template
├── styles.css            # Application styles
├── vite.config.ts        # Vite configuration
└── vercel.json          # Vercel deployment config
```

### Key Features Implementation

**Multi-File Generation**: Parses AI responses to detect file boundaries using `// FILENAME:` markers and creates organized project structures.

**Context Awareness**: Maintains conversation context for iterative editing, allowing users to modify existing code naturally.

**Real-time Execution**: Integrates Pyodide for running Python code directly in the browser without server requirements.

**Document Intelligence**: Combines PDF/DOCX parsing with OCR to extract and analyze content from various document types.

## � Deployment

### Vercel (Recommended)
```bash
# Deploy to Vercel
npm run build
vercel --prod
```

### Static Hosting
```bash
# Build for production
npm run build

# Deploy the dist/ folder to:
# - Netlify
# - GitHub Pages  
# - Any static hosting service
```

### Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "run", "preview", "--", "--host"]
```

## 🔧 Advanced Configuration

### Custom AI Models
Add new models to the model selector by modifying the options in `index.html`:
```html
<option value="custom/model-name">Custom Model</option>
```

### Proxy Configuration
The Vite config includes OpenRouter proxy setup for CORS handling:
```typescript
server: {
  proxy: {
    '/api-proxy': {
      target: 'https://openrouter.ai',
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api-proxy/, '')
    }
  }
}
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes
4. Test thoroughly across browsers
5. Submit a pull request

### Development Guidelines
- Follow TypeScript strict mode
- Use ES2020+ features
- Maintain responsive design
- Test file processing features
- Ensure cross-browser compatibility

## 📝 License

MIT License - feel free to use in your projects!

---

**Built with ❤️ using TypeScript, AI APIs, and modern web technologies**