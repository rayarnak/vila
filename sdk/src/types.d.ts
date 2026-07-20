declare module "circomlibjs" {
  export function buildPoseidon(): Promise<{
    (inputs: (bigint | number)[]): Uint8Array;
    F: {
      toObject(el: Uint8Array): bigint;
    };
  }>;
}
