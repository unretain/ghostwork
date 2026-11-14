// Loaded first so every other module sees the environment.
// .env is only for local development; in the TEE, env comes from the compose file.
import dotenv from "dotenv";

if (process.env.NODE_ENV !== "production") {
  dotenv.config({ quiet: true });
}
