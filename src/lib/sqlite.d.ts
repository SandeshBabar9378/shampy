// Type declaration for the built‑in node:sqlite module used in the project.
// This file silences the TS2307 error during compilation.
declare module "node:sqlite" {
  export const DatabaseSync: any;
  export const openSync: any;
  // Add any other exports you may need here.
}
