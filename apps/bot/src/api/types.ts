import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    /** Exact JSON bytes captured before parsing, used for HMAC verification. */
    rawBody?: string;
  }
}

export {};
