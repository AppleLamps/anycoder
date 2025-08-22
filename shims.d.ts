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

declare module 'pyodide' {
  export const loadPyodide: (opts?: any) => Promise<any>;
  const _default: any;
  export default _default;
}
