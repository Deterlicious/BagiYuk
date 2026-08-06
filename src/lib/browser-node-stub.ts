// OpenCV.js contains guarded Node.js branches that never execute in the browser.
// This empty module lets the client bundler resolve those dead `fs`/`path` imports.
const browserNodeStub = {};

export default browserNodeStub;
