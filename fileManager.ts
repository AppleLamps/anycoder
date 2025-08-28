/**
 * FileManager - Centralized file management utilities
 * Handles validation, sanitization, and organization of files
 */

export interface FileInfo {
  filename: string;
  content: string;
  language?: string;
  isValid?: boolean;
  errors?: string[];
}

export interface ProjectStructure {
  type: 'web' | 'react' | 'node' | 'python' | 'generic';
  mainFile: string;
  folders: {
    [key: string]: string[]; // folder name -> file patterns
  };
}

export class FileManager {
  private static readonly DANGEROUS_PATTERNS = [
    /eval\s*\(/,
    /Function\s*\(/,
    /document\.write/,
    /innerHTML\s*=/,
    /outerHTML\s*=/,
    /execCommand/,
    /setTimeout\s*\(\s*["'`]/,
    /setInterval\s*\(\s*["'`]/,
    /<script[^>]*>.*?<\/script>/is,
    /javascript:/i,
    /vbscript:/i,
    /data:text\/html/i
  ];

  private static readonly EXECUTABLE_EXTENSIONS = [
    '.exe', '.bat', '.cmd', '.com', '.scr', '.pif', '.vbs', '.js', '.jar'
  ];

  private static readonly MAX_FILENAME_LENGTH = 255;
  private static readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  /**
   * Validates a single file including filename and content
   */
  static validateFile(file: FileInfo): FileInfo {
    const errors: string[] = [];
    let isValid = true;

    // Validate filename
    if (!file.filename || file.filename.trim() === '') {
      errors.push('Filename cannot be empty');
      isValid = false;
    } else {
      const sanitized = this.sanitizeFilename(file.filename);
      if (sanitized !== file.filename) {
        errors.push(`Filename contains invalid characters. Suggested: ${sanitized}`);
      }
      
      if (file.filename.length > this.MAX_FILENAME_LENGTH) {
        errors.push(`Filename too long (max ${this.MAX_FILENAME_LENGTH} characters)`);
        isValid = false;
      }
    }

    // Validate content
    if (!file.content) {
      errors.push('File content is empty');
    } else {
      // Check file size
      const contentSize = new Blob([file.content]).size;
      if (contentSize > this.MAX_FILE_SIZE) {
        errors.push(`File too large (${(contentSize / 1024 / 1024).toFixed(2)}MB, max 10MB)`);
        isValid = false;
      }

      // Security validation
      const securityIssues = this.detectSecurityIssues(file.content, file.filename);
      if (securityIssues.length > 0) {
        errors.push(...securityIssues);
      }
    }

    return {
      ...file,
      isValid,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * Sanitizes filename by removing/replacing invalid characters
   */
  static sanitizeFilename(filename: string): string {
    // Remove or replace invalid characters
    let sanitized = filename
      .replace(/[<>:"|?*]/g, '_') // Replace invalid chars with underscore
      .replace(/[\x00-\x1f\x80-\x9f]/g, '') // Remove control characters
      .replace(/^\.|\.$/, '') // Remove leading/trailing dots
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .replace(/_+/g, '_') // Collapse multiple underscores
      .trim();

    // Handle reserved names on Windows
    const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
    const nameWithoutExt = sanitized.split('.')[0].toUpperCase();
    if (reservedNames.includes(nameWithoutExt)) {
      sanitized = `file_${sanitized}`;
    }

    // Ensure filename is not empty after sanitization
    if (!sanitized || sanitized === '_') {
      sanitized = 'untitled.txt';
    }

    return sanitized;
  }

  /**
   * Organizes files into a structured format based on project type
   */
  static organizeFiles(files: FileInfo[]): { structure: ProjectStructure; organizedFiles: { [folder: string]: FileInfo[] } } {
    const projectType = this.analyzeProjectStructure(files);
    const organizedFiles: { [folder: string]: FileInfo[] } = {
      root: []
    };

    files.forEach(file => {
      const folder = this.determineFileFolder(file.filename, projectType);
      if (!organizedFiles[folder]) {
        organizedFiles[folder] = [];
      }
      organizedFiles[folder].push(file);
    });

    return {
      structure: projectType,
      organizedFiles
    };
  }

  /**
   * Analyzes files to determine project structure type
   */
  private static analyzeProjectStructure(files: FileInfo[]): ProjectStructure {
    const filenames = files.map(f => f.filename.toLowerCase());
    
    // Check for React project
    if (filenames.some(f => f.includes('package.json')) && 
        (filenames.some(f => f.includes('react') || f.includes('jsx') || f.includes('tsx')) ||
         files.some(f => f.content.includes('import React') || f.content.includes('from "react"')))) {
      return {
        type: 'react',
        mainFile: this.findMainFile(filenames, ['app.jsx', 'app.tsx', 'index.jsx', 'index.tsx', 'main.jsx', 'main.tsx']),
        folders: {
          'src': ['*.jsx', '*.tsx', '*.js', '*.ts', '*.css', '*.scss'],
          'public': ['*.html', '*.ico', '*.png', '*.jpg', '*.svg'],
          'root': ['package.json', '*.md', '*.json', '*.config.*']
        }
      };
    }

    // Check for Node.js project
    if (filenames.some(f => f === 'package.json') || 
        files.some(f => f.content.includes('require(') || f.content.includes('module.exports'))) {
      return {
        type: 'node',
        mainFile: this.findMainFile(filenames, ['index.js', 'server.js', 'app.js', 'main.js']),
        folders: {
          'src': ['*.js', '*.ts'],
          'routes': ['*route*.js', '*router*.js'],
          'models': ['*model*.js', '*schema*.js'],
          'root': ['package.json', '*.md', '*.json']
        }
      };
    }

    // Check for Python project
    if (filenames.some(f => f.endsWith('.py')) || filenames.some(f => f === 'requirements.txt')) {
      return {
        type: 'python',
        mainFile: this.findMainFile(filenames, ['main.py', 'app.py', '__init__.py']),
        folders: {
          'src': ['*.py'],
          'tests': ['test_*.py', '*_test.py'],
          'root': ['requirements.txt', '*.md', '*.txt']
        }
      };
    }

    // Check for web project
    if (filenames.some(f => f.endsWith('.html'))) {
      return {
        type: 'web',
        mainFile: this.findMainFile(filenames, ['index.html', 'main.html', 'home.html']),
        folders: {
          'css': ['*.css', '*.scss', '*.sass'],
          'js': ['*.js', '*.ts'],
          'assets': ['*.png', '*.jpg', '*.jpeg', '*.gif', '*.svg', '*.ico'],
          'root': ['*.html', '*.md']
        }
      };
    }

    // Default to generic
    return {
      type: 'generic',
      mainFile: files[0]?.filename || 'index.txt',
      folders: {
        'root': ['*']
      }
    };
  }

  /**
   * Determines which folder a file should be placed in
   */
  private static determineFileFolder(filename: string, structure: ProjectStructure): string {
    const lowerFilename = filename.toLowerCase();
    
    for (const [folder, patterns] of Object.entries(structure.folders)) {
      for (const pattern of patterns) {
        if (this.matchesPattern(lowerFilename, pattern)) {
          return folder;
        }
      }
    }
    
    return 'root';
  }

  /**
   * Checks if filename matches a pattern (supports * wildcard)
   */
  private static matchesPattern(filename: string, pattern: string): boolean {
    if (pattern === '*') return true;
    
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    
    return new RegExp(`^${regexPattern}$`).test(filename);
  }

  /**
   * Finds the main file from a list of candidates
   */
  private static findMainFile(filenames: string[], candidates: string[]): string {
    for (const candidate of candidates) {
      if (filenames.includes(candidate)) {
        return candidate;
      }
    }
    return filenames[0] || 'index.txt';
  }

  /**
   * Detects potential security issues in file content
   */
  private static detectSecurityIssues(content: string, filename: string): string[] {
    const issues: string[] = [];
    
    // Check for dangerous patterns
    for (const pattern of this.DANGEROUS_PATTERNS) {
      if (pattern.test(content)) {
        issues.push(`Potentially dangerous code pattern detected: ${pattern.source}`);
      }
    }

    // Check for executable file extensions
    const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    if (this.EXECUTABLE_EXTENSIONS.includes(ext)) {
      issues.push(`Executable file type detected: ${ext}`);
    }

    // Check for suspicious URLs
    const urlPattern = /https?:\/\/[^\s"'<>]+/gi;
    const urls = content.match(urlPattern);
    if (urls) {
      const suspiciousUrls = urls.filter(url => 
        /\b(bit\.ly|tinyurl|t\.co|goo\.gl|ow\.ly)\b/i.test(url) ||
        /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/.test(url)
      );
      if (suspiciousUrls.length > 0) {
        issues.push(`Suspicious URLs detected: ${suspiciousUrls.join(', ')}`);
      }
    }

    return issues;
  }

  /**
   * Merges duplicate files by combining their content
   */
  static mergeDuplicateFiles(files: FileInfo[]): FileInfo[] {
    const fileMap = new Map<string, FileInfo>();
    
    files.forEach(file => {
      const key = file.filename.toLowerCase();
      if (fileMap.has(key)) {
        const existing = fileMap.get(key)!;
        existing.content += `\n\n// --- Merged content ---\n${file.content}`;
        if (existing.errors && file.errors) {
          existing.errors.push(...file.errors);
        }
      } else {
        fileMap.set(key, { ...file });
      }
    });
    
    return Array.from(fileMap.values());
  }
}