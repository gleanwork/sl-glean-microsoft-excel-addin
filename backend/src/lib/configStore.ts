import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { optionalEnv, requiredEnv } from "./env";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export interface DcrConfig {
  clientId: string;
  redirectUri: string;
  createdAt: string;
}

export async function getDcrConfig(): Promise<DcrConfig | null> {
  const table = requiredEnv("CONFIG_TABLE");
  const result = await ddb.send(
    new GetCommand({ TableName: table, Key: { PK: "CONFIG", SK: "dcr" } }),
  );
  return (result.Item as DcrConfig | undefined) || null;
}

export async function putDcrConfig(config: DcrConfig): Promise<void> {
  const table = requiredEnv("CONFIG_TABLE");
  await ddb.send(
    new PutCommand({
      TableName: table,
      Item: { PK: "CONFIG", SK: "dcr", ...config },
    }),
  );
}

export async function getAdminEmails(): Promise<string[]> {
  const table = requiredEnv("CONFIG_TABLE");
  const result = await ddb.send(
    new GetCommand({ TableName: table, Key: { PK: "CONFIG", SK: "admin" } }),
  );
  const seeded = optionalEnv("ADMIN_EMAILS", "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  const stored = Array.isArray(result.Item?.emails) ? result.Item.emails : [];
  return [...new Set([...seeded, ...stored.map((email: string) => email.toLowerCase())])];
}
