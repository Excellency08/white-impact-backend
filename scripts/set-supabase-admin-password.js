/*
 * TEMPORARY ONE-TIME MAINTENANCE TOOL.
 * Remove this script and its npm command after the existing Auth user has
 * completed password initialization. It must only run on a trusted machine.
 */

const readline = require("readline");
const dotenv = require("dotenv");
const { createClient } = require("@supabase/supabase-js");

dotenv.config();

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function promptHidden(question) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("An interactive terminal is required for password input.");
  }

  return new Promise((resolve, reject) => {
    const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
    const write = prompt._writeToOutput;
    prompt._writeToOutput = () => {};
    prompt.question(question, (answer) => {
      prompt._writeToOutput = write;
      prompt.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    prompt.on("SIGINT", () => {
      prompt.close();
      process.stdout.write("\n");
      reject(new Error("Password input cancelled."));
    });
  });
}

function clearString(value) {
  return typeof value === "string" ? "" : value;
}

function safeErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error || "Unknown error");
  return message
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/eyJ[A-Za-z0-9._-]+/g, "[redacted-token]")
    .replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/gi, "[redacted-key]")
    .slice(0, 240);
}

function reportSafeFailure({ operation, urlHostname, secretVariable, lookupSucceeded, clientInitialized, error }) {
  const details = {
    status: "failed",
    operation,
    supabaseUrlHostname: urlHostname || null,
    environment: {
      SUPABASE_URL: Boolean(process.env.SUPABASE_URL),
      SUPABASE_SECRET_KEY: Boolean(process.env.SUPABASE_SECRET_KEY),
      SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      selectedServerCredential: secretVariable || null,
      browserCredentialUsed: false,
    },
    clientInitialized: Boolean(clientInitialized),
    targetUserLookupSucceeded: Boolean(lookupSucceeded),
    error: {
      name: error?.name || "Error",
      message: safeErrorMessage(error),
      code: error?.code || error?.error_code || null,
      status: error?.status || error?.statusCode || null,
    },
  };
  console.error(JSON.stringify(details));
}

async function main() {
  const userUid = process.argv[2] || "";
  const supabaseUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const secretVariable = process.env.SUPABASE_SECRET_KEY
    ? "SUPABASE_SECRET_KEY"
    : process.env.SUPABASE_SERVICE_ROLE_KEY
      ? "SUPABASE_SERVICE_ROLE_KEY"
      : null;
  const secretKey = secretVariable ? String(process.env[secretVariable] || "").trim() : "";
  let operation = "validate configuration";
  let clientInitialized = false;
  let lookupSucceeded = false;

  try {
    if (!UUID_PATTERN.test(userUid)) {
      throw new Error("A valid Supabase Auth user UUID is required as the only argument.");
    }
    if (!supabaseUrl) throw new Error("SUPABASE_URL is required.");
    if (!secretKey) {
      throw new Error("SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY is required locally.");
    }

    operation = "initialize Supabase server client";
    const supabase = createClient(supabaseUrl, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    clientInitialized = true;

    operation = "supabase.auth.admin.getUserById";
    const { data, error: lookupError } = await supabase.auth.admin.getUserById(userUid);
    if (lookupError) throw lookupError;
    if (!data?.user) throw new Error("The specified Supabase Auth user was not found.");
    lookupSucceeded = true;

    let password = null;
    let confirmation = null;
    try {
      password = await promptHidden("New Supabase Auth password: ");
      confirmation = await promptHidden("Confirm Supabase Auth password: ");

      if (!password) throw new Error("Password cannot be empty.");
      if (password.length < 8) throw new Error("Password must be at least 8 characters.");
      if (password !== confirmation) throw new Error("Passwords do not match.");

      operation = "supabase.auth.admin.updateUserById";
      const { error: updateError } = await supabase.auth.admin.updateUserById(userUid, {
        password,
      });
      if (updateError) throw updateError;

      console.log("Supabase Auth password updated successfully for the specified user.");
    } finally {
      password = clearString(password);
      confirmation = clearString(confirmation);
    }
  } catch (error) {
    reportSafeFailure({
      operation,
      urlHostname: (() => {
        try {
          return new URL(supabaseUrl).hostname;
        } catch {
          return null;
        }
      })(),
      secretVariable,
      lookupSucceeded,
      clientInitialized,
      error,
    });
    process.exitCode = 1;
  }
}

main().catch((error) => {
  reportSafeFailure({
    operation: "uncaught maintenance-tool failure",
    urlHostname: null,
    secretVariable: null,
    lookupSucceeded: false,
    clientInitialized: false,
    error,
  });
  process.exitCode = 1;
});
