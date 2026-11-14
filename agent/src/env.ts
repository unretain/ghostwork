// Loaded first so every other module sees the environment.
// .env is only for local development; in the TEE, env comes from the compose file.
import dotenv from "dotenv";

if (process.env.NODE_ENV !== "production") {
  // ENV_FILE picks another file, e.g. .env.mainnet for a second agent on mainnet
  dotenv.config({ path: process.env.ENV_FILE || ".env", quiet: true });
}
