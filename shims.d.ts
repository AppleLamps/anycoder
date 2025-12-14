declare module 'mammoth' {
  const mammoth: any;
  export default mammoth;
}

declare module '*?url' {
  const src: string;
  export default src;
}

declare module 'jszip' {
  const JSZip: any;
  export default JSZip;
}

declare module 'pdfjs-dist' {
  const pdfjsDist: any;
  export = pdfjsDist;
}

declare module 'tesseract.js' {
  const Tesseract: any;
  export default Tesseract;
}

declare module 'pyodide' {
  export const loadPyodide: (opts?: any) => Promise<any>;
  const _default: any;
  export default _default;
}
