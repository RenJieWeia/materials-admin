import type { Route } from "./+types/export-materials";
import { requireUserId } from "../../core/session.server";
import { getUserById } from "../../services/user.server";
import {
  DEFAULT_EXTRACT_COUNT,
  MAX_EXTRACT_COUNT,
  claimIdleMaterialsBatch,
} from "../../services/material.server";
import { createAuditLog } from "../../services/audit.server";
import {
  buildExport,
  getExportRenderer,
  type ExportColumn,
  type ExportRow,
} from "../../services/export.server";

/**
 * Column set deliberately matches the import template, so an exported file can
 * be fed straight back into the bulk import.
 */
const EXPORT_COLUMNS: ExportColumn[] = [
  { key: "game_name", header: "游戏名称" },
  { key: "account_name", header: "账户名称" },
  { key: "description", header: "描述" },
  { key: "status", header: "使用状态" },
  { key: "user", header: "使用人" },
  { key: "usage_time", header: "使用时间" },
];

function timestampSuffix(date: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/**
 * Explicitly refuse read access. React Router would otherwise answer a GET with
 * a generic 400 because the route has no loader; saying 405 + Allow makes it
 * obvious that this endpoint exists only for a state-changing POST.
 */
export async function loader() {
  return Response.json(
    { ok: false, error: "该接口仅支持 POST" },
    { status: 405, headers: { Allow: "POST" } }
  );
}

/**
 * POST-only on purpose: this endpoint mutates state (it claims materials), so it
 * must never be reachable by a GET — link prefetching, browser preloading or a
 * crawler would otherwise hand out stock without anyone clicking.
 *
 * The file is returned as JSON rather than as an attachment body so the client
 * can render errors inline and still write any format to disk.
 */
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json(
      { ok: false, error: "该接口仅支持 POST" },
      { status: 405, headers: { Allow: "POST" } }
    );
  }

  const userId = await requireUserId(request);
  const user = await getUserById(userId);
  if (!user) {
    return Response.json({ ok: false, error: "用户不存在" }, { status: 401 });
  }

  const formData = await request.formData();

  // Validate the format BEFORE claiming, so a bad request cannot consume stock.
  const rawFormat = formData.get("format");
  const format = typeof rawFormat === "string" && rawFormat ? rawFormat : null;
  try {
    getExportRenderer(format);
  } catch (error) {
    return Response.json(
      { ok: false, error: (error as Error).message },
      { status: 400 }
    );
  }

  const rawCount = formData.get("count");
  const parsedCount = Number.parseInt(String(rawCount ?? ""), 10);
  const requestedCount =
    Number.isFinite(parsedCount) && parsedCount > 0
      ? Math.min(parsedCount, MAX_EXTRACT_COUNT)
      : DEFAULT_EXTRACT_COUNT;

  // Claiming is the critical section; it is atomic and returns only rows that
  // this employee actually won.
  const claimed = claimIdleMaterialsBatch(user.name, requestedCount);

  if (claimed.length === 0) {
    return Response.json({
      ok: false,
      error: "当前没有空闲料子可提取，请稍后再试。",
    });
  }

  const rows: ExportRow[] = claimed.map((material) => ({
    game_name: material.game_name,
    account_name: material.account_name,
    description: material.description,
    status: material.status,
    user: material.user,
    usage_time: material.usage_time,
  }));

  const payload = buildExport(
    format,
    EXPORT_COLUMNS,
    rows,
    `料子提取_${timestampSuffix()}`
  );

  createAuditLog(
    {
      user_id: Number(user.id),
      user_name: user.name,
      action: "提取料子",
      entity: "材料",
      entity_id: claimed.map((material) => material.id).join(","),
      details: `批量提取空闲料子 ${claimed.length} 条（请求 ${requestedCount} 条，格式 ${format ?? "默认"}）`,
    },
    request
  );

  return Response.json({
    ok: true,
    count: claimed.length,
    requestedCount,
    ...payload,
  });
}
