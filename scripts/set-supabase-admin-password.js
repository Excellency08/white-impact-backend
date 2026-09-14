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

async function main() {
  const userUid = process.argv[2] || "";
  const supabaseUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const secretKey = String(
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  ).trim();

  if (!UUID_PATTERN.test(userUid)) {
    throw new Error("A valid Supabase Auth user UUID is required as the only argument.");
  }
  if (!supabaseUrl) throw new Error("SUPABASE_URL is required.");
  if (!secretKey) {
    throw new Error("SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY is required locally.");
  }

  const supabase = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error: lookupError } = await supabase.auth.admin.getUserById(userUid);
  if (lookupError) throw new Error("Supabase Auth user lookup failed.");
  if (!data?.user) throw new Error("The specified Supabase Auth user was not found.");

  let password = null;
  let confirmation = null;
  try {
    password = await promptHidden("New Supabase Auth password: ");
    confirmation = await promptHidden("Confirm Supabase Auth password: ");

    if (!password) throw new Error("Password cannot be empty.");
    if (password.length < 8) throw new Error("Password must be at least 8 characters.");
    if (password !== confirmation) throw new Error("Passwords do not match.");

    const { error: updateError } = await supabase.auth.admin.updateUserById(userUid, {
      password,
    });
    if (updateError) throw new Error("Supabase Auth password update failed.");

    console.log("Supabase Auth password updated successfully for the specified user.");
  } finally {
    password = clearString(password);
    confirmation = clearString(confirmation);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Supabase Auth password update failed.";
  console.error(message);
  process.exitCode = 1;
});
