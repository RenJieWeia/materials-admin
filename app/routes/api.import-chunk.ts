import type { Route } from "./+types/api.import-chunk";
import { requireUserId } from "../core/session.server";
import { getUserById, getAllUsers } from "../services/user.server";
import { batchCreateMaterials, batchCheckAccountNames } from "../services/material.server";
import { createAuditLog } from "../services/audit.server";

export async function action({ request }: Route.ActionArgs) {
  const userId = await requireUserId(request);
  const currentUser = await getUserById(userId);
  if (!currentUser) {
    return Response.json({ error: "User not found" }, { status: 401 });
  }
  if (currentUser.role !== "admin") {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await request.json();
  const { rows, chunkIndex, totalChunks, isLast } = body as {
    rows: Array<Record<string, string>>;
    chunkIndex: number;
    totalChunks: number;
    isLast: boolean;
  };

  if (!Array.isArray(rows) || rows.length === 0) {
    return Response.json({ error: "No data" }, { status: 400 });
  }

  const allUsers = await getAllUsers();
  const validUsernames = new Set(allUsers.map((u) => u.name));

  // Batch check for existing accounts
  const accountNames = rows
    .filter((r) => r["账户名称"])
    .map((r) => r["账户名称"]);
  const existingAccounts = batchCheckAccountNames(accountNames);

  let count = 0;
  let skipped = 0;
  const skippedAccounts: string[] = [];
  let invalidStatusCount = 0;
  const invalidStatusAccounts: string[] = [];
  let invalidUserCount = 0;
  const invalidUserAccounts: string[] = [];

  const toInsert: Array<{
    game_name: string;
    account_name: string;
    description?: string;
    status?: string;
    user?: string;
    usage_time?: string;
  }> = [];

  for (const row of rows) {
    if (row["游戏名称"] && row["账户名称"]) {
      if (existingAccounts.has(row["账户名称"])) {
        skipped++;
        skippedAccounts.push(row["账户名称"]);
        continue;
      }

      let status = row["使用状态"] || row["状态"] || "空闲";
      if (status !== "空闲" && status !== "已使用") {
        invalidStatusCount++;
        invalidStatusAccounts.push(row["账户名称"]);
        continue;
      }

      let user: string | undefined = row["使用人"];
      let usage_time: string | undefined = row["使用时间"];

      if (status === "空闲") {
        user = undefined;
        usage_time = undefined;
      } else if (status === "已使用") {
        if (!validUsernames.has(user)) {
          invalidUserCount++;
          invalidUserAccounts.push(row["账户名称"]);
          continue;
        }
        if (!usage_time) {
          const date = new Date();
          usage_time =
            date.getFullYear() +
            "-" +
            String(date.getMonth() + 1).padStart(2, "0") +
            "-" +
            String(date.getDate()).padStart(2, "0") +
            " " +
            String(date.getHours()).padStart(2, "0") +
            ":" +
            String(date.getMinutes()).padStart(2, "0") +
            ":" +
            String(date.getSeconds()).padStart(2, "0");
        }
      }

      // Also add to existingAccounts to prevent duplicates within this chunk
      existingAccounts.add(row["账户名称"]);

      toInsert.push({
        game_name: row["游戏名称"],
        account_name: row["账户名称"],
        description: row["描述"],
        status,
        user,
        usage_time,
      });
      count++;
    }
  }

  // Batch insert using transaction
  if (toInsert.length > 0) {
    batchCreateMaterials(toInsert);
  }

  // Log on last chunk
  if (isLast) {
    createAuditLog({
      user_id: Number(currentUser.id),
      user_name: currentUser.name,
      action: "导入材料",
      entity: "材料",
      details: `分批导入完成 (共 ${totalChunks} 批)`,
    }, request);
  }

  return Response.json({
    success: true,
    chunkIndex,
    count,
    skipped,
    skippedAccounts: skippedAccounts.slice(0, 3),
    invalidStatusCount,
    invalidStatusAccounts: invalidStatusAccounts.slice(0, 3),
    invalidUserCount,
    invalidUserAccounts: invalidUserAccounts.slice(0, 3),
  });
}
