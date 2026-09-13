import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? 4000),
  converterUrl: process.env.CONVERTER_URL ?? "http://127.0.0.1:8001",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  maxFileSizeMb: Number(process.env.MAX_FILE_SIZE_MB ?? 100),
  maxFiles: Number(process.env.MAX_FILES ?? 30),
};
