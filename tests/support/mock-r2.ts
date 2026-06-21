type StoredObject = {
  body: Uint8Array;
  httpMetadata?: {
    contentType?: string;
    contentDisposition?: string;
  };
  customMetadata?: Record<string, string>;
};

export const createMockR2Bucket = () => {
  const objects = new Map<string, StoredObject>();

  return {
    async put(
      key: string,
      value: ArrayBuffer | ArrayBufferView | string,
      options?: {
        httpMetadata?: {
          contentType?: string;
          contentDisposition?: string;
        };
        customMetadata?: Record<string, string>;
      }
    ) {
      const bytes =
        typeof value === "string"
          ? new TextEncoder().encode(value)
          : value instanceof ArrayBuffer
            ? new Uint8Array(value)
            : new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));

      objects.set(key, {
        body: bytes,
        httpMetadata: options?.httpMetadata,
        customMetadata: options?.customMetadata
      });
    },
    async get(key: string) {
      const object = objects.get(key);

      if (!object) {
        return null;
      }

      return {
        body: new Response(object.body).body,
        httpMetadata: object.httpMetadata,
        customMetadata: object.customMetadata,
        async arrayBuffer() {
          return object.body.buffer.slice(
            object.body.byteOffset,
            object.body.byteOffset + object.body.byteLength
          );
        }
      };
    },
    getStoredObject(key: string) {
      return objects.get(key) ?? null;
    },
    listKeys() {
      return Array.from(objects.keys());
    }
  };
};
