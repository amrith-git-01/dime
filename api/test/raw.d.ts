// `import text from '../file?raw'` (Vite): the file's text.
declare module '*?raw' {
  const content: string;
  export default content;
}
